'use strict';
/**
 * AgentRegistry — Agent 注册表
 *
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  1+5 架构写死在模块顶部三张冻结常量表中，不可在运行时增删改      ║
 * ║  CORE_AGENTS / TASK_TYPE_MAP / CEO_FORBIDDEN 是唯一权威来源      ║
 * ║  initializeCoreAgents() 只读表，不重新定义角色                   ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * 层级定义：
 *   level 0 = CEO (supervisor)
 *   level 1 = 总监（directors，固定 5 个）
 *   level 2 = 子Agent（sub-agents，按需动态注册，挂在某个总监下）
 */

// ══════════════════════════════════════════════════════════════════
//  ★ 核心标识常量
// ══════════════════════════════════════════════════════════════════

const CEO_ID = 'supervisor';

// 预置总监 ID 集合（驱动自 CORE_AGENTS，不单独维护）
// 此处声明为 const，在 selfCheck 后由 CORE_AGENTS 填充并冻结
const DIRECTOR_IDS = new Set(['explore', 'plan', 'general', 'inspector', 'research']);
Object.freeze(DIRECTOR_IDS);   // freeze Set 本身（add/delete/clear 会静默失败/严格模式报错）

// ══════════════════════════════════════════════════════════════════
//  ★ 核心 Agent 定义表（写死，不可增删改）
//
//  字段说明：
//    id               — 全局唯一标识，用于 AgentRegistry / CommRouter
//    name             — 显示名称
//    role             — 角色标签（CEO / 总监N）
//    level            — 层级（0=CEO, 1=总监）
//    parentId         — 父节点（CEO为null，总监均为 supervisor）
//    capabilities     — 能力列表（用于 findByCapability）
//    description      — 一句话描述
//    responsibilities — 核心职责列表
//    kbNamespace      — 该 Agent 在 KnowledgeBase 中的写入命名空间
//    forbidden        — 禁止行为（CEO 专用）
// ══════════════════════════════════════════════════════════════════

const CORE_AGENTS = Object.freeze([

  // ── CEO: Supervisor Agent ────────────────────────────────────────
  Object.freeze({
    id:               'supervisor',
    name:             'Supervisor Agent',
    role:             'CEO',
    level:            0,
    parentId:         null,
    capabilities:     Object.freeze(['analyze', 'dispatch', 'inspect', 'review', 'optimize']),
    description:      '领导、调度器、决策者',
    responsibilities: Object.freeze(['判断', '指挥', '检查', '复盘', '优化']),
    kbNamespace:      'decisions',    // CEO 写 decisions / schedules / compliance
    // CEO 禁止行为（写死）
    forbidden:        Object.freeze(['write_code', 'edit_file', 'run_command', 'execute_task'])
  }),

  // ── 总监1: Explore Agent ─────────────────────────────────────────
  Object.freeze({
    id:               'explore',
    name:             'Explore Agent',
    role:             '总监1',
    level:            1,
    parentId:         'supervisor',
    capabilities:     Object.freeze(['file_search', 'code_search', 'dependency_analysis', 'structure_analysis']),
    description:      '探索总监、信息收集者',
    responsibilities: Object.freeze(['代码库探索', '文件搜索', '依赖分析', '上下文收集']),
    kbNamespace:      'codebase'
  }),

  // ── 总监2: Plan Agent ────────────────────────────────────────────
  Object.freeze({
    id:               'plan',
    name:             'Plan Agent',
    role:             '总监2',
    level:            1,
    parentId:         'supervisor',
    capabilities:     Object.freeze(['architecture_design', 'tech_selection', 'risk_assessment', 'task_decomposition']),
    description:      '规划总监、架构师',
    responsibilities: Object.freeze(['架构设计', '方案规划', '风险评估', '任务拆解']),
    kbNamespace:      'plans'
  }),

  // ── 总监3: General-Purpose Agent ────────────────────────────────
  Object.freeze({
    id:               'general',
    name:             'General-Purpose Agent',
    role:             '总监3',
    level:            1,
    parentId:         'supervisor',
    capabilities:     Object.freeze(['code_writing', 'file_editing', 'command_execution', 'multi_step_tasks']),
    description:      '执行总监、实施者',
    responsibilities: Object.freeze(['代码编写', '文件操作', '命令执行', '多步骤任务']),
    kbNamespace:      'changes'
  }),

  // ── 总监4: Inspector Agent ───────────────────────────────────────
  Object.freeze({
    id:               'inspector',
    name:             'Inspector Agent',
    role:             '总监4',
    level:            1,
    parentId:         'supervisor',
    capabilities:     Object.freeze(['code_review', 'testing', 'security_scan', 'quality_check']),
    description:      '质检总监、检查者',
    responsibilities: Object.freeze(['代码审查', '测试执行', '安全扫描', '质量检查']),
    kbNamespace:      'quality'
  }),

  // ── 总监5: Research Agent ────────────────────────────────────────
  Object.freeze({
    id:               'research',
    name:             'Research Agent',
    role:             '总监5',
    level:            1,
    parentId:         'supervisor',
    capabilities:     Object.freeze(['web_search', 'fetch_url', 'doc_lookup', 'api_reference', 'knowledge_retrieval']),
    description:      '研究总监、资料搜集者',
    responsibilities: Object.freeze(['网络搜索', '文档查询', 'API参考检索', '知识获取']),
    kbNamespace:      'external'
  })
]);

// ══════════════════════════════════════════════════════════════════
//  ★ 任务类型 → Agent ID 路由表（写死，不可修改）
//
//  key   = subtask.type 的值
//  value = 负责该类任务的 Agent ID（必须是 CORE_AGENTS 中的 id）
// ══════════════════════════════════════════════════════════════════

const TASK_TYPE_MAP = Object.freeze({
  // Explore Agent 负责
  'explore':       'explore',
  // Plan Agent 负责
  'analyze':       'plan',
  'plan':          'plan',
  // General-Purpose Agent 负责
  'code':          'general',
  'write':         'general',
  'execute':       'general',
  // Inspector Agent 负责
  'test':          'inspector',
  'review':        'inspector',
  'inspect':       'inspector',
  // Research Agent 负责
  'research':      'research',
  'web_search':    'research',
  'doc_lookup':    'research',
  'api_reference': 'research',
  'fetch_url':     'research'
});

// ══════════════════════════════════════════════════════════════════
//  ★ CEO 禁止行为表（写死，引用自 CORE_AGENTS，对外独立暴露）
// ══════════════════════════════════════════════════════════════════

const CEO_FORBIDDEN = CORE_AGENTS.find(a => a.id === CEO_ID).forbidden;

// ══════════════════════════════════════════════════════════════════
//  运行时自检（模块加载时执行一次）
// ══════════════════════════════════════════════════════════════════
(function selfCheck() {
  // 必须恰好 6 个角色（1 CEO + 5 总监）
  if (CORE_AGENTS.length !== 6) {
    throw new Error(`[AgentRegistry] CORE_AGENTS 必须恰好 6 个角色，当前 ${CORE_AGENTS.length} 个`);
  }

  // 必须恰好 1 个 level-0（CEO）
  const ceos = CORE_AGENTS.filter(a => a.level === 0);
  if (ceos.length !== 1 || ceos[0].id !== CEO_ID) {
    throw new Error('[AgentRegistry] CORE_AGENTS 必须恰好 1 个 CEO（id=supervisor, level=0）');
  }

  // 必须恰好 5 个 level-1（总监）
  const directors = CORE_AGENTS.filter(a => a.level === 1);
  if (directors.length !== 5) {
    throw new Error(`[AgentRegistry] CORE_AGENTS 必须恰好 5 个总监（level=1），当前 ${directors.length} 个`);
  }

  // 所有总监的 parentId 必须是 CEO_ID
  for (const d of directors) {
    if (d.parentId !== CEO_ID) {
      throw new Error(`[AgentRegistry] 总监 "${d.id}" 的 parentId 必须是 "${CEO_ID}"，当前 "${d.parentId}"`);
    }
  }

  // DIRECTOR_IDS 集合必须与 CORE_AGENTS 中 level-1 的 id 一致
  const directorIds = directors.map(d => d.id);
  for (const id of directorIds) {
    if (!DIRECTOR_IDS.has(id)) {
      throw new Error(`[AgentRegistry] DIRECTOR_IDS 缺少总监 id "${id}"`);
    }
  }
  if (DIRECTOR_IDS.size !== 5) {
    throw new Error(`[AgentRegistry] DIRECTOR_IDS 必须恰好 5 个，当前 ${DIRECTOR_IDS.size} 个`);
  }

  // TASK_TYPE_MAP 的所有值必须是合法 Agent ID
  const allIds = new Set(CORE_AGENTS.map(a => a.id));
  for (const [type, agentId] of Object.entries(TASK_TYPE_MAP)) {
    if (!allIds.has(agentId)) {
      throw new Error(`[AgentRegistry] TASK_TYPE_MAP["${type}"] 指向未知 Agent "${agentId}"`);
    }
  }

  // 每个 CORE_AGENTS 条目必须是冻结对象
  for (const agent of CORE_AGENTS) {
    if (!Object.isFrozen(agent)) {
      throw new Error(`[AgentRegistry] CORE_AGENTS 中 "${agent.id}" 未冻结，自检失败`);
    }
  }
})();


// ══════════════════════════════════════════════════════════════════
//  AgentRegistry 类
// ══════════════════════════════════════════════════════════════════

class AgentRegistry {
  constructor() {
    // 核心 Agent 存储（Map，运行时可读）
    this.agents = new Map();

    // 能力索引（capability → agentId[]）
    this.capabilities = new Map();

    // 子Agent 全局索引（subAgentId → parentId）用于双向查找
    this.parentIndex = new Map();

    // 初始化标记
    this.initialized = false;
  }

  // ══════════════════════════════════════════════════════════════
  //  核心初始化：从 CORE_AGENTS 表加载，不重新定义角色
  // ══════════════════════════════════════════════════════════════

  /**
   * 初始化 6 个核心 Agent（1 CEO + 5 总监）
   * 数据来源：CORE_AGENTS 冻结常量，不可修改
   */
  initializeCoreAgents() {
    for (const def of CORE_AGENTS) {
      this._registerCore(def);
    }
    this.initialized = true;
    return this.agents.size;
  }

  /**
   * 从 CORE_AGENTS 条目注册（内部方法，不对外暴露）
   */
  _registerCore(def) {
    this.agents.set(def.id, {
      id:               def.id,
      name:             def.name,
      role:             def.role,
      level:            def.level,
      parentId:         def.parentId,
      capabilities:     [...def.capabilities],    // 工作副本（可读，不影响冻结源）
      description:      def.description,
      responsibilities: [...def.responsibilities],
      kbNamespace:      def.kbNamespace || null,
      forbidden:        def.forbidden ? [...def.forbidden] : [],
      registeredAt:     new Date().toISOString(),
      subAgents:        []
    });

    // 索引能力
    for (const cap of def.capabilities) {
      if (!this.capabilities.has(cap)) this.capabilities.set(cap, []);
      this.capabilities.get(cap).push(def.id);
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  公共注册接口（仅用于外部自定义 Agent，禁止覆盖核心 Agent）
  // ══════════════════════════════════════════════════════════════

  /**
   * 注册 Agent（外部可用，核心 Agent ID 受保护）
   */
  register(agentId, agentConfig) {
    // 禁止覆盖核心 Agent（通过 CORE_AGENTS 表校验）
    const isCoreId = CORE_AGENTS.some(a => a.id === agentId);
    if (isCoreId) {
      throw new Error(
        `[AgentRegistry] "${agentId}" 是核心 Agent ID（写死在 CORE_AGENTS 中），不允许外部覆盖注册`
      );
    }

    if (!agentConfig.name || !agentConfig.role) {
      throw new Error(`[AgentRegistry] Agent "${agentId}" 缺少必需字段: name, role`);
    }

    const level = 2;  // 外部注册只能是子Agent（level 2）
    this.agents.set(agentId, {
      id:           agentId,
      level,
      parentId:     null,   // 由 registerSubAgent 设置
      registeredAt: new Date().toISOString(),
      subAgents:    [],
      ...agentConfig
    });

    if (agentConfig.capabilities) {
      for (const cap of agentConfig.capabilities) {
        if (!this.capabilities.has(cap)) this.capabilities.set(cap, []);
        this.capabilities.get(cap).push(agentId);
      }
    }

    return true;
  }

  // ══════════════════════════════════════════════════════════════
  //  查询 API
  // ══════════════════════════════════════════════════════════════

  get(agentId) {
    return this.agents.get(agentId);
  }

  list() {
    return Array.from(this.agents.values());
  }

  has(agentId) {
    return this.agents.has(agentId);
  }

  size() {
    return this.agents.size;
  }

  findByCapability(capability) {
    const ids = this.capabilities.get(capability);
    if (!ids) return [];
    return ids.map(id => this.get(id)).filter(Boolean);
  }

  findByRole(role) {
    for (const agent of this.agents.values()) {
      if (agent.role === role) return agent;
    }
    return null;
  }

  listCapabilities() {
    return Array.from(this.capabilities.keys());
  }

  // ══════════════════════════════════════════════════════════════
  //  任务匹配：按 TASK_TYPE_MAP 表路由（不在方法体内写规则）
  // ══════════════════════════════════════════════════════════════

  /**
   * 根据任务匹配最佳 Agent
   * 路由规则来自 TASK_TYPE_MAP 冻结表，不在此处自行判断
   */
  matchBestAgent(task) {
    // 按任务类型查 TASK_TYPE_MAP
    if (task.type && TASK_TYPE_MAP[task.type]) {
      return this.get(TASK_TYPE_MAP[task.type]);
    }

    // 按能力查
    if (task.capability) {
      const agents = this.findByCapability(task.capability);
      if (agents.length > 0) return agents[0];
    }

    // 兜底：General-Purpose Agent（写死在 TASK_TYPE_MAP 中 execute → general）
    return this.get(TASK_TYPE_MAP['execute']);
  }

  /**
   * 兼容旧接口
   */
  selectExecutor(subtask) {
    return this.matchBestAgent(subtask);
  }

  // ══════════════════════════════════════════════════════════════
  //  子 Agent 管理
  // ══════════════════════════════════════════════════════════════

  /**
   * 注册子 Agent（挂在某个核心总监下）
   */
  registerSubAgent(parentId, subAgentConfig) {
    const parent = this.get(parentId);
    if (!parent) throw new Error(`[AgentRegistry] 父 Agent 不存在: "${parentId}"`);

    // 父必须是总监（level 1），CEO 不能直接拥有子Agent（跳级禁止）
    if (parent.level !== 1) {
      throw new Error(
        `[AgentRegistry] 只有总监（level=1）可以拥有子Agent，"${parentId}"(level=${parent.level}) 不符合`
      );
    }

    if (!subAgentConfig.name || !subAgentConfig.capability) {
      throw new Error('[AgentRegistry] 子 Agent 缺少必需字段: name, capability');
    }

    const subId = subAgentConfig.id ||
      `${parentId}_sub_${Date.now()}_${parent.subAgents.length}`;

    const subAgent = {
      ...subAgentConfig,
      id:           subId,
      parentId,
      level:        2,
      registeredAt: new Date().toISOString()
    };

    parent.subAgents.push(subAgent);
    this.parentIndex.set(subId, parentId);

    return true;
  }

  // ══════════════════════════════════════════════════════════════
  //  层级查询
  // ══════════════════════════════════════════════════════════════

  getParentId(agentId) {
    const agent = this.agents.get(agentId);
    if (agent) return agent.parentId || null;
    return this.parentIndex.get(agentId) || null;
  }

  getLevel(agentId) {
    const agent = this.agents.get(agentId);
    if (agent) return agent.level;
    if (this.parentIndex.has(agentId)) return 2;
    return -1;
  }

  getCommonParent(idA, idB) {
    const pA = this.getParentId(idA);
    const pB = this.getParentId(idB);
    if (pA && pA === pB) return pA;
    return null;
  }

  listSubAgents(parentId) {
    const parent = this.get(parentId);
    return parent ? (parent.subAgents || []) : [];
  }

  findSubAgent(parentId, capability) {
    return this.listSubAgents(parentId).find(s => s.capability === capability) || null;
  }

  // ── 静态访问器（外部可只读访问常量）────────────────────────────
  static get CORE_AGENTS()    { return CORE_AGENTS; }
  static get TASK_TYPE_MAP()  { return TASK_TYPE_MAP; }
  static get CEO_FORBIDDEN()  { return CEO_FORBIDDEN; }
}

// ══════════════════════════════════════════════════════════════════
//  导出
// ══════════════════════════════════════════════════════════════════
const _exports = AgentRegistry;
Object.defineProperty(_exports, 'CEO_ID',        { value: CEO_ID,        enumerable: true });
Object.defineProperty(_exports, 'DIRECTOR_IDS',  { value: DIRECTOR_IDS,  enumerable: true });
Object.defineProperty(_exports, 'CORE_AGENTS',   { value: CORE_AGENTS,   enumerable: true });
Object.defineProperty(_exports, 'TASK_TYPE_MAP', { value: TASK_TYPE_MAP, enumerable: true });
Object.defineProperty(_exports, 'CEO_FORBIDDEN', { value: CEO_FORBIDDEN, enumerable: true });
module.exports = _exports;
