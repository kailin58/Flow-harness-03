'use strict';
/**
 * CommRouter — Agent 通信路由器
 *
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  所有规则均以 Object.freeze() 写死在模块顶部常量中               ║
 * ║  逻辑代码只允许「查表」，不允许在方法体内自行判断规则            ║
 * ║  COMM_RULES / SESSION_TOPOLOGY 是唯一权威来源，不可在运行时修改  ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * 两层架构：
 *   Layer A: 通信隔离（CommRouter）— 严格管控 Agent 之间的消息传递路径
 *   Layer B: 数据共享（KnowledgeBase.writeShared/readShared）— 不受通信规则约束
 */

const { createLogger } = require('./logger');
const { CEO_ID, DIRECTOR_IDS } = require('./agent-registry');

// ══════════════════════════════════════════════════════════════════
//  ★ 通信结果枚举（冻结，不可扩展）
// ══════════════════════════════════════════════════════════════════

const COMM_RESULT = Object.freeze({
  ALLOWED:           'allowed',
  DENIED_SKIP_LEVEL: 'denied_skip_level',    // 跳级
  DENIED_CROSS_DEPT: 'denied_cross_dept',    // 跨部门
  DENIED_NEED_3WAY:  'denied_need_3way',     // 平级但缺少上级主持
  DENIED_EXTERNAL:   'denied_external',      // 外部直接访问非CEO
  DENIED_SELF:       'denied_self'           // 自己发给自己
});

// ══════════════════════════════════════════════════════════════════
//  ★ 点对点路由规则表（写死，不可修改）
//
//  每条规则按顺序匹配，第一条命中的规则决定结果。
//  字段说明：
//    ruleNo      — 规则编号（对应文档 0-9）
//    desc        — 规则描述（文档语言）
//    match(ctx)  — 匹配函数，参数 ctx = { fromId, toId, fromLevel, toLevel, fromParent, toParent }
//    action      — 'ALLOW' | 'DENY_SKIP' | 'DENY_CROSS' | 'DENY_EXT' | 'DENY_SELF' | 'NEED_3WAY'
//    denyCode    — COMM_RESULT 中的 key（action 为 DENY_* 时使用）
//    hint        — 违规时给调用方的提示（action 为 NEED_3WAY 或 DENY_* 时）
// ══════════════════════════════════════════════════════════════════

const COMM_RULES = Object.freeze([

  // ── 规则 S: 自发自收 ─────────────────────────────────────────────
  Object.freeze({
    ruleNo: 'S',
    desc:   '自发自收（禁止）',
    match:  ctx => ctx.fromId === ctx.toId,
    action: 'DENY_SELF',
    denyCode: 'DENIED_SELF',
    hint:   '不能自发自收'
  }),

  // ── 规则 0a: 外部 → CEO ──────────────────────────────────────────
  Object.freeze({
    ruleNo: '0a',
    desc:   '外部用户 → CEO（唯一合法入口）',
    match:  ctx => ctx.fromId === 'external' && ctx.toId === CEO_ID,
    action: 'ALLOW'
  }),

  // ── 规则 0b: CEO → 外部 ──────────────────────────────────────────
  Object.freeze({
    ruleNo: '0b',
    desc:   'CEO → 外部用户（唯一合法出口）',
    match:  ctx => ctx.fromId === CEO_ID && ctx.toId === 'external',
    action: 'ALLOW'
  }),

  // ── 规则 0c: 外部 → 非CEO（禁止）────────────────────────────────
  Object.freeze({
    ruleNo: '0c',
    desc:   '外部用户只能与CEO通信，禁止绕过CEO直接访问任何Agent',
    match:  ctx => ctx.fromId === 'external' && ctx.toId !== CEO_ID,
    action: 'DENY_EXT',
    denyCode: 'DENIED_EXTERNAL',
    hint:   ctx => `外部用户只能与CEO通信，不能直接访问 "${ctx.toId}"`
  }),

  // ── 规则 0d: 非CEO → 外部（禁止）────────────────────────────────
  Object.freeze({
    ruleNo: '0d',
    desc:   '只有CEO可以回复外部用户，其他Agent不能直接与外部通信',
    match:  ctx => ctx.toId === 'external' && ctx.fromId !== CEO_ID,
    action: 'DENY_EXT',
    denyCode: 'DENIED_EXTERNAL',
    hint:   ctx => `只有CEO可以回复外部用户，"${ctx.fromId}" 不能直接访问外部`
  }),

  // ── 规则 1a: CEO → 总监（直接上下级，允许）──────────────────────
  Object.freeze({
    ruleNo: '1a',
    desc:   'CEO → 总监（直接上下级，2方即可）',
    match:  ctx => ctx.fromId === CEO_ID && ctx.toLevel === 1,
    action: 'ALLOW'
  }),

  // ── 规则 1b: 总监 → CEO（直接上下级，允许）──────────────────────
  Object.freeze({
    ruleNo: '1b',
    desc:   '总监 → CEO（直接上下级，2方即可）',
    match:  ctx => ctx.toId === CEO_ID && ctx.fromLevel === 1,
    action: 'ALLOW'
  }),

  // ── 规则 3a: 总监 → 自己的子Agent（直接上下级，允许）────────────
  Object.freeze({
    ruleNo: '3a',
    desc:   '总监 → 自己的子Agent（直接上下级，2方即可）',
    match:  ctx => ctx.fromLevel === 1 && ctx.toLevel === 2 && ctx.toParent === ctx.fromId,
    action: 'ALLOW'
  }),

  // ── 规则 3b: 子Agent → 自己的总监（直接上下级，允许）────────────
  Object.freeze({
    ruleNo: '3b',
    desc:   '子Agent → 自己的总监（直接上下级，2方即可）',
    match:  ctx => ctx.fromLevel === 2 && ctx.toLevel === 1 && ctx.fromParent === ctx.toId,
    action: 'ALLOW'
  }),

  // ── 规则 5a: CEO → 子Agent（跨级，禁止）─────────────────────────
  Object.freeze({
    ruleNo: '5a',
    desc:   'CEO 不能跨级直接与子Agent通信（必须通过对应总监中转）',
    match:  ctx => ctx.fromId === CEO_ID && ctx.toLevel === 2,
    action: 'DENY_SKIP',
    denyCode: 'DENIED_SKIP_LEVEL',
    hint:   ctx => `CEO 不能跨级直接与子Agent "${ctx.toId}" 通信，需通过其总监 "${ctx.toParent}"`
  }),

  // ── 规则 5b: 子Agent → CEO（跨级，禁止）─────────────────────────
  Object.freeze({
    ruleNo: '5b',
    desc:   '子Agent 不能跨级直接与CEO通信（必须通过自己的总监中转）',
    match:  ctx => ctx.toId === CEO_ID && ctx.fromLevel === 2,
    action: 'DENY_SKIP',
    denyCode: 'DENIED_SKIP_LEVEL',
    hint:   ctx => `子Agent "${ctx.fromId}" 不能跨级直接与CEO通信，需通过其总监 "${ctx.fromParent}"`
  }),

  // ── 规则 2: 总监 ↔ 总监（必须CEO在场的三方会话）──────────────────
  Object.freeze({
    ruleNo: '2',
    desc:   '总监 ↔ 总监 必须以CEO为主持人的三方会话，单独send被拒',
    match:  ctx => ctx.fromLevel === 1 && ctx.toLevel === 1,
    action: 'NEED_3WAY',
    denyCode: 'DENIED_NEED_3WAY',
    hint:   ctx => `总监 "${ctx.fromId}" ↔ 总监 "${ctx.toId}" 需要三方会话（CEO在场），请使用 openDirectorSession()`
  }),

  // ── 规则 4: 同总监下子Agent ↔ 子Agent（需该总监在场的三方会话）──
  Object.freeze({
    ruleNo: '4',
    desc:   '同总监下子Agent ↔ 子Agent 需该总监在场的三方会话，单独send被拒',
    match:  ctx => ctx.fromLevel === 2 && ctx.toLevel === 2 && ctx.fromParent === ctx.toParent,
    action: 'NEED_3WAY',
    denyCode: 'DENIED_NEED_3WAY',
    hint:   ctx => `子Agent "${ctx.fromId}" ↔ 子Agent "${ctx.toId}" 需要三方会话（总监 "${ctx.fromParent}" 在场），请使用 openSubAgentSession()`
  }),

  // ── 规则 6: 总监 → 跨部门子Agent（禁止）────────────────────────
  Object.freeze({
    ruleNo: '6a',
    desc:   '总监不能直接访问其他部门的子Agent',
    match:  ctx => ctx.fromLevel === 1 && ctx.toLevel === 2 && ctx.toParent !== ctx.fromId,
    action: 'DENY_CROSS',
    denyCode: 'DENIED_CROSS_DEPT',
    hint:   ctx => `总监 "${ctx.fromId}" 不能直接访问其他部门的子Agent "${ctx.toId}"（归属 "${ctx.toParent}"）`
  }),

  // ── 规则 6b: 子Agent → 非自己总监（禁止）───────────────────────
  Object.freeze({
    ruleNo: '6b',
    desc:   '子Agent不能直接访问非自己总监的Director',
    match:  ctx => ctx.fromLevel === 2 && ctx.toLevel === 1 && ctx.fromParent !== ctx.toId,
    action: 'DENY_CROSS',
    denyCode: 'DENIED_CROSS_DEPT',
    hint:   ctx => `子Agent "${ctx.fromId}" 不能直接访问非自己总监的 "${ctx.toId}"`
  }),

  // ── 规则 7: 跨部门子Agent ↔ 子Agent（禁止）─────────────────────
  Object.freeze({
    ruleNo: '7',
    desc:   '不同总监下的子Agent之间严格禁止跨部门通信',
    match:  ctx => ctx.fromLevel === 2 && ctx.toLevel === 2 && ctx.fromParent !== ctx.toParent,
    action: 'DENY_CROSS',
    denyCode: 'DENIED_CROSS_DEPT',
    hint:   ctx => `子Agent "${ctx.fromId}"（${ctx.fromParent}）↔ 子Agent "${ctx.toId}"（${ctx.toParent}）跨部门，严格禁止`
  }),

  // ── 兜底：未匹配到任何允许规则，拒绝 ───────────────────────────
  Object.freeze({
    ruleNo: 'X',
    desc:   '兜底规则：未被明确允许的路径一律拒绝',
    match:  () => true,
    action: 'DENY_CROSS',
    denyCode: 'DENIED_CROSS_DEPT',
    hint:   ctx => `未明确允许的通信路径: "${ctx.fromId}"(L${ctx.fromLevel}) → "${ctx.toId}"(L${ctx.toLevel})`
  })
]);

// ══════════════════════════════════════════════════════════════════
//  ★ 三方会话拓扑规则表（写死，不可修改）
//
//  typeKey           — 会话类型标识
//  desc              — 规则描述
//  moderatorLevel    — 主持人必须具备的层级（0=CEO, 1=总监）
//  fixedModerator    — 若不为 null，主持人必须是该固定 ID（如 CEO）
//  participantLevel  — 所有非主持参与者必须具备的层级
//  sameParentRequired— 所有非主持参与者是否必须共同父节点 = 主持人
// ══════════════════════════════════════════════════════════════════

const SESSION_TOPOLOGY = Object.freeze({

  // 规则 2 会话：总监 ↔ 总监，必须 CEO 主持
  DIRECTOR_DIRECTOR: Object.freeze({
    typeKey:           'DIRECTOR_DIRECTOR',
    desc:              '总监 ↔ 总监 三方会话（CEO强制主持，不可更换）',
    moderatorLevel:    0,            // 主持人必须是 Level 0（CEO）
    fixedModerator:    CEO_ID,       // 写死：只能是 supervisor
    participantLevel:  1,            // 参与者必须是 Level 1（总监）
    sameParentRequired: false,       // 总监的父都是CEO，已由 fixedModerator 保证
    minPeers:          2             // 除主持人外至少 2 个参与者
  }),

  // 规则 4 会话：同总监下子Agent ↔ 子Agent，必须该总监主持
  SUB_AGENT_PEER: Object.freeze({
    typeKey:           'SUB_AGENT_PEER',
    desc:              '同总监子Agent ↔ 子Agent 三方会话（所属总监强制主持）',
    moderatorLevel:    1,            // 主持人必须是 Level 1（总监）
    fixedModerator:    null,         // 总监 ID 不固定，但必须是参与者的共同父
    participantLevel:  2,            // 参与者必须是 Level 2（子Agent）
    sameParentRequired: true,        // 所有参与者必须同父节点 = 主持人
    minPeers:          2             // 除主持人外至少 2 个参与者
  })
});

// ══════════════════════════════════════════════════════════════════
//  运行时自检：确认常量结构完整（模块加载时执行一次）
// ══════════════════════════════════════════════════════════════════
(function selfCheck() {
  // 每条路由规则必须有 ruleNo / match / action
  for (const rule of COMM_RULES) {
    if (!rule.ruleNo || typeof rule.match !== 'function' || !rule.action) {
      throw new Error(`[CommRouter] COMM_RULES 规则 "${rule.ruleNo}" 缺少必要字段，模块初始化失败`);
    }
  }
  // SESSION_TOPOLOGY 必须含两个固定类型
  if (!SESSION_TOPOLOGY.DIRECTOR_DIRECTOR || !SESSION_TOPOLOGY.SUB_AGENT_PEER) {
    throw new Error('[CommRouter] SESSION_TOPOLOGY 缺少必要类型，模块初始化失败');
  }
  // DIRECTOR_DIRECTOR 必须固定 CEO 主持
  if (SESSION_TOPOLOGY.DIRECTOR_DIRECTOR.fixedModerator !== CEO_ID) {
    throw new Error('[CommRouter] SESSION_TOPOLOGY.DIRECTOR_DIRECTOR.fixedModerator 必须是 CEO，模块初始化失败');
  }
})();


// ══════════════════════════════════════════════════════════════════
//  CommRouter 类
// ══════════════════════════════════════════════════════════════════

class CommRouter {
  /**
   * @param {import('./agent-registry')} agentRegistry
   * @param {Object} [options]
   * @param {boolean} [options.strict=true]  - true: 违规抛错；false: 仅记录警告
   * @param {boolean} [options.logAll=false] - 是否记录所有通信（包括合法的）
   *
   * ⚠️  options 只影响违规时的行为（抛错 vs 警告），
   *     不影响 COMM_RULES / SESSION_TOPOLOGY 的规则本身。
   */
  constructor(agentRegistry, options = {}) {
    this.registry = agentRegistry;
    this.strict   = options.strict !== false;
    this.logAll   = options.logAll === true;
    this.logger   = createLogger({ name: 'comm-router' });

    // 活跃会话表  sessionId → Session
    this.sessions = new Map();

    // 通信审计日志
    this.auditLog = [];
  }

  // ══════════════════════════════════════════════════════════════
  //  公共 API — 点对点消息路由
  // ══════════════════════════════════════════════════════════════

  /**
   * 验证并路由单条消息（点对点，非 session 内）
   *
   * @param {string} fromId   - 发送方 Agent ID（'external' 表示外部用户）
   * @param {string} toId     - 接收方 Agent ID
   * @param {*}      payload  - 消息内容
   * @returns {{ ok: boolean, result: string, reason: string, ruleNo: string }}
   */
  send(fromId, toId, payload = null) {
    const check = this._applyRouteRules(fromId, toId);

    this._audit(fromId, toId, check, payload);

    if (!check.ok) {
      if (this.strict) {
        throw new CommError(check.reason, check.result, fromId, toId);
      } else {
        this.logger.warn(`[CommRouter] 拒绝[规则${check.ruleNo}]: ${check.reason}`);
      }
    } else if (this.logAll) {
      this.logger.info(`[CommRouter] ✅[规则${check.ruleNo}] ${fromId} → ${toId}`);
    }

    return check;
  }

  // ══════════════════════════════════════════════════════════════
  //  公共 API — 三方会话
  // ══════════════════════════════════════════════════════════════

  /**
   * 打开一个会话（依据 SESSION_TOPOLOGY 验证拓扑合法性）
   *
   * @param {string[]} participants - 参与者 ID 列表（含主持人）
   * @param {string}   moderatorId  - 主持人 ID（上级）
   * @returns {{ ok: boolean, sessionId: string, session: Session, sessionType: string }}
   */
  openSession(participants, moderatorId) {
    // 主持人必须在参与者列表中
    if (!participants.includes(moderatorId)) {
      throw new CommError(
        `主持人 "${moderatorId}" 必须在参与者列表中`,
        'invalid_session', moderatorId, null
      );
    }

    // 依据 SESSION_TOPOLOGY 验证
    const peers = participants.filter(p => p !== moderatorId);
    const { check, sessionType } = this._applySessionTopologyRules(peers, moderatorId);

    if (!check.ok) {
      if (this.strict) {
        throw new CommError(check.reason, check.result, moderatorId, null);
      }
    }

    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const session   = {
      id:           sessionId,
      participants,
      moderator:    moderatorId,
      sessionType,
      openedAt:     new Date().toISOString(),
      messages:     [],
      closed:       false
    };

    this.sessions.set(sessionId, session);
    this.logger.info(
      `[CommRouter] 会话开启 ${sessionId}: [${participants.join(' + ')}] ` +
      `主持: ${moderatorId} 类型: ${sessionType || 'unknown'}`
    );

    return { ok: check.ok, sessionId, session, sessionType };
  }

  /**
   * 在已打开的会话内发送消息
   */
  sendInSession(sessionId, fromId, payload) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new CommError(`会话不存在: ${sessionId}`, 'no_session', fromId, null);
    if (session.closed) throw new CommError(`会话已关闭: ${sessionId}`, 'closed_session', fromId, null);
    if (!session.participants.includes(fromId)) {
      throw new CommError(`"${fromId}" 不在会话 ${sessionId} 中`, 'not_in_session', fromId, null);
    }

    const msg = { from: fromId, payload, sentAt: Date.now() };
    session.messages.push(msg);
    return msg;
  }

  /**
   * 关闭会话
   */
  closeSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    session.closed   = true;
    session.closedAt = new Date().toISOString();
    this.logger.info(`[CommRouter] 会话关闭 ${sessionId} (${session.messages.length} 条消息)`);
    return true;
  }

  /**
   * 获取会话对象
   */
  getSession(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  // ══════════════════════════════════════════════════════════════
  //  快捷方法：按 SESSION_TOPOLOGY 规则创建标准三方会话
  // ══════════════════════════════════════════════════════════════

  /**
   * 总监 ↔ 总监 三方会话（SESSION_TOPOLOGY.DIRECTOR_DIRECTOR：CEO 强制主持）
   */
  openDirectorSession(directorA, directorB) {
    const topo = SESSION_TOPOLOGY.DIRECTOR_DIRECTOR;
    // fixedModerator 写死在常量里，不允许调用方指定其他主持人
    return this.openSession([topo.fixedModerator, directorA, directorB], topo.fixedModerator);
  }

  /**
   * 同总监下子Agent 三方会话（SESSION_TOPOLOGY.SUB_AGENT_PEER：对应总监主持）
   */
  openSubAgentSession(subA, subB, directorId) {
    return this.openSession([directorId, subA, subB], directorId);
  }

  // ══════════════════════════════════════════════════════════════
  //  核心验证：查表（私有）
  // ══════════════════════════════════════════════════════════════

  /**
   * 按 COMM_RULES 表顺序匹配第一条命中规则
   */
  _applyRouteRules(fromId, toId) {
    const ctx = this._buildCtx(fromId, toId);

    for (const rule of COMM_RULES) {
      if (!rule.match(ctx)) continue;

      // 命中，按 action 返回结果
      switch (rule.action) {
        case 'ALLOW':
          return { ok: true,  result: COMM_RESULT.ALLOWED, reason: rule.desc, ruleNo: rule.ruleNo };

        case 'DENY_SELF':
          return { ok: false, result: COMM_RESULT.DENIED_SELF,       reason: this._hint(rule, ctx), ruleNo: rule.ruleNo };
        case 'DENY_EXT':
          return { ok: false, result: COMM_RESULT.DENIED_EXTERNAL,   reason: this._hint(rule, ctx), ruleNo: rule.ruleNo };
        case 'DENY_SKIP':
          return { ok: false, result: COMM_RESULT.DENIED_SKIP_LEVEL, reason: this._hint(rule, ctx), ruleNo: rule.ruleNo };
        case 'DENY_CROSS':
          return { ok: false, result: COMM_RESULT.DENIED_CROSS_DEPT, reason: this._hint(rule, ctx), ruleNo: rule.ruleNo };
        case 'NEED_3WAY':
          return { ok: false, result: COMM_RESULT.DENIED_NEED_3WAY,  reason: this._hint(rule, ctx), ruleNo: rule.ruleNo };

        default:
          return { ok: false, result: COMM_RESULT.DENIED_CROSS_DEPT, reason: `未知 action: ${rule.action}`, ruleNo: rule.ruleNo };
      }
    }

    // COMM_RULES 末尾兜底规则保证永远有命中，此处不应到达
    return { ok: false, result: COMM_RESULT.DENIED_CROSS_DEPT, reason: '无匹配规则（内部错误）', ruleNo: 'NONE' };
  }

  /**
   * 按 SESSION_TOPOLOGY 表验证会话拓扑
   * @returns {{ check, sessionType }}
   */
  _applySessionTopologyRules(peers, moderatorId) {
    if (peers.length < 2) {
      return {
        check: { ok: false, result: 'invalid', reason: '三方会话至少需要2个参与者（加上主持人）', ruleNo: 'S-MIN' },
        sessionType: null
      };
    }

    const modLevel = this._getLevel(moderatorId);

    // 遍历 SESSION_TOPOLOGY，找到匹配的类型
    for (const [typeKey, topo] of Object.entries(SESSION_TOPOLOGY)) {
      // 检查主持人层级是否匹配
      if (modLevel !== topo.moderatorLevel) continue;

      // 检查固定主持人约束（如 DIRECTOR_DIRECTOR 必须是 CEO）
      if (topo.fixedModerator !== null && moderatorId !== topo.fixedModerator) continue;

      // 检查所有参与者层级
      let peersMatch = true;
      let failedPeer = null;
      for (const peer of peers) {
        const peerLevel  = this._getLevel(peer);
        const peerParent = this.registry.getParentId(peer);

        if (peerLevel !== topo.participantLevel) {
          peersMatch = false;
          failedPeer = { peer, reason: `层级 ${peerLevel} 不符合要求 ${topo.participantLevel}` };
          break;
        }
        if (topo.sameParentRequired && peerParent !== moderatorId) {
          peersMatch = false;
          failedPeer = { peer, reason: `父节点 "${peerParent}" ≠ 主持人 "${moderatorId}"` };
          break;
        }
      }

      if (!peersMatch) {
        return {
          check: {
            ok: false,
            result: topo.sameParentRequired ? COMM_RESULT.DENIED_CROSS_DEPT : COMM_RESULT.DENIED_SKIP_LEVEL,
            reason: `${topo.desc} 拓扑不合法: "${failedPeer.peer}" — ${failedPeer.reason}`,
            ruleNo: typeKey
          },
          sessionType: typeKey
        };
      }

      // 全部通过
      return {
        check: { ok: true, result: COMM_RESULT.ALLOWED, reason: topo.desc, ruleNo: typeKey },
        sessionType: typeKey
      };
    }

    // 没有匹配的会话类型
    return {
      check: {
        ok: false,
        result: 'invalid',
        reason: `主持人 "${moderatorId}"(L${modLevel}) 不符合任何合法会话拓扑类型`,
        ruleNo: 'TOPO-X'
      },
      sessionType: null
    };
  }

  // ══════════════════════════════════════════════════════════════
  //  工具方法（私有）
  // ══════════════════════════════════════════════════════════════

  /** 构建路由检查上下文 */
  _buildCtx(fromId, toId) {
    return {
      fromId,
      toId,
      fromLevel:  this._getLevel(fromId),
      toLevel:    this._getLevel(toId),
      fromParent: this.registry.getParentId(fromId),
      toParent:   this.registry.getParentId(toId)
    };
  }

  /** 解析规则 hint（字符串或函数） */
  _hint(rule, ctx) {
    if (typeof rule.hint === 'function') return rule.hint(ctx);
    return rule.hint || rule.desc;
  }

  _getLevel(agentId) {
    if (agentId === CEO_ID)           return 0;
    if (DIRECTOR_IDS.has(agentId))    return 1;
    return this.registry.getLevel(agentId);
  }

  _audit(fromId, toId, check, payload) {
    const entry = {
      from:    fromId,
      to:      toId,
      ok:      check.ok,
      result:  check.result,
      ruleNo:  check.ruleNo,
      reason:  check.reason,
      at:      Date.now()
    };
    this.auditLog.push(entry);
    if (this.auditLog.length > 1000) this.auditLog.shift();
  }

  /**
   * 获取审计日志
   */
  getAuditLog(limit = 50) {
    return this.auditLog.slice(-limit);
  }

  /**
   * 统计违规次数
   */
  getViolationStats() {
    const stats = {};
    for (const entry of this.auditLog) {
      if (!entry.ok) {
        stats[entry.result] = (stats[entry.result] || 0) + 1;
      }
    }
    return stats;
  }

  // ── 静态常量（外部可只读访问，用于审计和文档）──────────────────
  static get RESULT()           { return COMM_RESULT; }
  static get RULES()            { return COMM_RULES; }
  static get SESSION_TOPOLOGY() { return SESSION_TOPOLOGY; }
}

// ── 专用错误类 ────────────────────────────────────────────────
class CommError extends Error {
  constructor(message, code, from, to) {
    super(`[CommRouter] ${message}`);
    this.name  = 'CommError';
    this.code  = code;
    this.from  = from;
    this.to    = to;
  }
}

// 静态 getter 与 module.exports.XXX 冲突，用 defineProperty 挂载
const _exports = CommRouter;
Object.defineProperty(_exports, 'CommError',        { value: CommError,        enumerable: true });
Object.defineProperty(_exports, 'COMM_RESULT',      { value: COMM_RESULT,      enumerable: true });
Object.defineProperty(_exports, 'COMM_RULES',       { value: COMM_RULES,       enumerable: true });
Object.defineProperty(_exports, 'SESSION_TOPOLOGY', { value: SESSION_TOPOLOGY, enumerable: true });
module.exports = _exports;
