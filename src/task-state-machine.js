'use strict';
/**
 * TaskStateMachine — L4 协作编排层核心
 *
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  实现 7 状态任务生命周期，与 AGENTS.md 架构文档对齐              ║
 * ║  状态转换表（TRANSITIONS）写死为常量，不可在运行时修改           ║
 * ║  超时/重试/回退/死锁检测配置见 TIMEOUT_CONFIG / RETRY_CONFIG     ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * 7 状态生命周期（来自 00_升级总结总览.md L4章节）：
 *   PENDING      → 任务已创建，等待分配
 *   DELIBERATING → 商议中（多Agent共识协商）
 *   PLANNING     → 规划中（拆解子任务、生成依赖图）
 *   EXECUTING    → 执行中（子Agent并行/串行执行）
 *   INSPECTING   → 检查中（Inspector验证结果）
 *   REVIEWING    → 复盘中（ReviewLoop评分与优化）
 *   DONE         → 成功完成
 *   FAILED       → 失败（不可恢复，已达到最大重试次数）
 */

// ══════════════════════════════════════════════════════════════════
//  ★ 状态枚举（写死，不可扩展）
// ══════════════════════════════════════════════════════════════════

const TASK_STATE = Object.freeze({
  PENDING:      'PENDING',
  DELIBERATING: 'DELIBERATING',
  PLANNING:     'PLANNING',
  EXECUTING:    'EXECUTING',
  INSPECTING:   'INSPECTING',
  REVIEWING:    'REVIEWING',
  DONE:         'DONE',
  FAILED:       'FAILED'
});

// ══════════════════════════════════════════════════════════════════
//  ★ 状态转换表（合法转换，写死）
//
//  key   = 当前状态
//  value = 允许转入的下一状态集合
// ══════════════════════════════════════════════════════════════════

const TRANSITIONS = Object.freeze({
  [TASK_STATE.PENDING]:      Object.freeze([TASK_STATE.DELIBERATING, TASK_STATE.PLANNING, TASK_STATE.FAILED]),
  [TASK_STATE.DELIBERATING]: Object.freeze([TASK_STATE.PLANNING, TASK_STATE.FAILED]),
  [TASK_STATE.PLANNING]:     Object.freeze([TASK_STATE.EXECUTING, TASK_STATE.FAILED]),
  [TASK_STATE.EXECUTING]:    Object.freeze([TASK_STATE.INSPECTING, TASK_STATE.PLANNING, TASK_STATE.FAILED]),
  [TASK_STATE.INSPECTING]:   Object.freeze([TASK_STATE.REVIEWING, TASK_STATE.EXECUTING, TASK_STATE.FAILED]),
  [TASK_STATE.REVIEWING]:    Object.freeze([TASK_STATE.DONE, TASK_STATE.EXECUTING, TASK_STATE.FAILED]),
  [TASK_STATE.DONE]:         Object.freeze([]),
  [TASK_STATE.FAILED]:       Object.freeze([])
});

// ══════════════════════════════════════════════════════════════════
//  ★ 超时配置（毫秒，每状态最长允许停留时间）
//
//  来源：00_升级总结总览.md L4章节超时配置表
// ══════════════════════════════════════════════════════════════════

const TIMEOUT_CONFIG = Object.freeze({
  [TASK_STATE.PENDING]:      5  * 60 * 1000,   //  5分钟：等待分配超时
  [TASK_STATE.DELIBERATING]: 3  * 60 * 1000,   //  3分钟：商议超时
  [TASK_STATE.PLANNING]:     5  * 60 * 1000,   //  5分钟：规划超时
  [TASK_STATE.EXECUTING]:    30 * 60 * 1000,   // 30分钟：执行超时
  [TASK_STATE.INSPECTING]:   10 * 60 * 1000,   // 10分钟：检查超时
  [TASK_STATE.REVIEWING]:    5  * 60 * 1000,   //  5分钟：复盘超时
  [TASK_STATE.DONE]:         null,             // 终态：无超时
  [TASK_STATE.FAILED]:       null              // 终态：无超时
});

// ══════════════════════════════════════════════════════════════════
//  ★ 重试配置（各状态的最大重试次数与回退状态）
// ══════════════════════════════════════════════════════════════════

const RETRY_CONFIG = Object.freeze({
  [TASK_STATE.EXECUTING]:  Object.freeze({ maxRetries: 3, rollbackTo: TASK_STATE.PLANNING }),
  [TASK_STATE.INSPECTING]: Object.freeze({ maxRetries: 2, rollbackTo: TASK_STATE.EXECUTING }),
  [TASK_STATE.REVIEWING]:  Object.freeze({ maxRetries: 2, rollbackTo: TASK_STATE.EXECUTING })
});

// ══════════════════════════════════════════════════════════════════
//  ★ 死锁检测配置
//
//  超过阈值次数停留在同一状态且不推进，视为死锁，触发 escalate
// ══════════════════════════════════════════════════════════════════

const DEADLOCK_DETECTION = Object.freeze({
  checkIntervalMs:  30 * 1000,    // 每30秒检查一次
  stateStaleLimit:  3,            // 同一状态连续3次检查无进展 → 死锁
  escalateAction:   'escalate'    // 死锁时动作：上报给CEO
});

// ══════════════════════════════════════════════════════════════════
//  运行时自检
// ══════════════════════════════════════════════════════════════════

(function selfCheck() {
  // 所有状态必须有转换表条目
  for (const state of Object.values(TASK_STATE)) {
    if (!TRANSITIONS[state]) {
      throw new Error(`[TaskStateMachine] 状态 "${state}" 缺少转换表条目，初始化失败`);
    }
  }
  // 终态（DONE/FAILED）必须没有出边
  if (TRANSITIONS[TASK_STATE.DONE].length !== 0 || TRANSITIONS[TASK_STATE.FAILED].length !== 0) {
    throw new Error('[TaskStateMachine] DONE/FAILED 为终态，不允许有出边转换');
  }
  // 超时配置必须覆盖所有状态
  for (const state of Object.values(TASK_STATE)) {
    if (!(state in TIMEOUT_CONFIG)) {
      throw new Error(`[TaskStateMachine] TIMEOUT_CONFIG 缺少状态 "${state}" 的超时配置`);
    }
  }
})();


// ══════════════════════════════════════════════════════════════════
//  TaskStateMachine 类
// ══════════════════════════════════════════════════════════════════

class TaskStateMachine {
  /**
   * @param {string} taskId   - 任务唯一ID（对应 S1 Context Store 的 task_id）
   * @param {Object} [options]
   * @param {Function} [options.onTransition] - 状态转换回调 (from, to, taskId)
   * @param {Function} [options.onTimeout]    - 超时回调 (state, taskId)
   * @param {Function} [options.onDeadlock]   - 死锁回调 (state, taskId)
   */
  constructor(taskId, options = {}) {
    this.taskId       = taskId;
    this.state        = TASK_STATE.PENDING;
    this.retryCount   = {};
    this.history      = [];
    this.createdAt    = Date.now();
    this.updatedAt    = Date.now();
    this.metadata     = {};

    // 死锁检测
    this._staleCheckCount = 0;
    this._lastCheckedState = null;
    this._deadlockTimer   = null;

    // 回调
    this._onTransition = options.onTransition || null;
    this._onTimeout    = options.onTimeout    || null;
    this._onDeadlock   = options.onDeadlock   || null;

    // 超时计时器
    this._timeoutTimer = null;
    this._startStateTimer();
  }

  // ══════════════════════════════════════════════════════════════
  //  公共 API
  // ══════════════════════════════════════════════════════════════

  /**
   * 状态转换（核心方法）
   *
   * @param {string} nextState - 目标状态（必须在 TRANSITIONS 允许列表中）
   * @param {Object} [meta]    - 附加元数据（写入历史记录）
   * @returns {{ ok: boolean, from: string, to: string, reason?: string }}
   */
  transition(nextState, meta = {}) {
    const from     = this.state;
    const allowed  = TRANSITIONS[from];

    if (!allowed) {
      return { ok: false, from, to: nextState, reason: `未知当前状态: "${from}"` };
    }
    if (!allowed.includes(nextState)) {
      return {
        ok:     false,
        from,
        to:     nextState,
        reason: `状态 "${from}" → "${nextState}" 不在合法转换列表 [${allowed.join(', ')}] 中`
      };
    }

    // 执行转换
    this._clearStateTimer();
    this.state     = nextState;
    this.updatedAt = Date.now();
    this.history.push({
      from,
      to:    nextState,
      at:    this.updatedAt,
      meta
    });

    // 重置死锁计数
    this._staleCheckCount  = 0;
    this._lastCheckedState = null;

    // 启动新状态超时计时器
    this._startStateTimer();

    // 触发回调
    if (this._onTransition) {
      try { this._onTransition(from, nextState, this.taskId, meta); } catch (_) {}
    }

    return { ok: true, from, to: nextState };
  }

  /**
   * 自动重试：按 RETRY_CONFIG 回退状态
   *
   * @returns {{ ok: boolean, retriesLeft: number, rolledBackTo?: string }}
   */
  retry() {
    const cfg = RETRY_CONFIG[this.state];
    if (!cfg) {
      return { ok: false, retriesLeft: 0, reason: `状态 "${this.state}" 不支持重试` };
    }

    const key  = this.state;
    const cnt  = (this.retryCount[key] || 0) + 1;
    this.retryCount[key] = cnt;

    if (cnt > cfg.maxRetries) {
      this.transition(TASK_STATE.FAILED, { reason: `重试次数已达上限 ${cfg.maxRetries}` });
      return { ok: false, retriesLeft: 0, reason: '已转入 FAILED 状态' };
    }

    const result = this.transition(cfg.rollbackTo, { reason: `第${cnt}次重试，回退到 ${cfg.rollbackTo}` });
    return { ok: result.ok, retriesLeft: cfg.maxRetries - cnt, rolledBackTo: cfg.rollbackTo };
  }

  /**
   * 强制标记为 FAILED（用于外部强制终止）
   */
  fail(reason = '外部强制终止') {
    if (this.isTerminal()) return { ok: false, reason: '任务已处于终态' };
    return this.transition(TASK_STATE.FAILED, { reason });
  }

  /**
   * 是否处于终态（DONE 或 FAILED）
   */
  isTerminal() {
    return this.state === TASK_STATE.DONE || this.state === TASK_STATE.FAILED;
  }

  /**
   * 获取当前状态快照（用于看板/S1写入）
   */
  snapshot() {
    return {
      taskId:    this.taskId,
      state:     this.state,
      retries:   { ...this.retryCount },
      history:   this.history.slice(),
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      metadata:  { ...this.metadata }
    };
  }

  /**
   * 销毁：清除所有计时器
   */
  destroy() {
    this._clearStateTimer();
    if (this._deadlockTimer) {
      clearInterval(this._deadlockTimer);
      this._deadlockTimer = null;
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  静态方法：查表
  // ══════════════════════════════════════════════════════════════

  static getAllowedTransitions(state) {
    return TRANSITIONS[state] || [];
  }

  static getTimeout(state) {
    return TIMEOUT_CONFIG[state] ?? null;
  }

  static getRetryConfig(state) {
    return RETRY_CONFIG[state] || null;
  }

  // ══════════════════════════════════════════════════════════════
  //  私有方法
  // ══════════════════════════════════════════════════════════════

  _startStateTimer() {
    if (this.isTerminal()) return;
    const timeout = TIMEOUT_CONFIG[this.state];
    if (!timeout) return;

    this._timeoutTimer = setTimeout(() => {
      if (this._onTimeout) {
        try { this._onTimeout(this.state, this.taskId); } catch (_) {}
      }
    }, timeout);
  }

  _clearStateTimer() {
    if (this._timeoutTimer) {
      clearTimeout(this._timeoutTimer);
      this._timeoutTimer = null;
    }
  }

  /**
   * 启动死锁检测（可选，由外部调用）
   */
  startDeadlockDetection() {
    if (this._deadlockTimer) return;
    this._deadlockTimer = setInterval(() => {
      if (this.isTerminal()) {
        clearInterval(this._deadlockTimer);
        return;
      }
      if (this._lastCheckedState === this.state) {
        this._staleCheckCount++;
        if (this._staleCheckCount >= DEADLOCK_DETECTION.staleLimit) {
          clearInterval(this._deadlockTimer);
          if (this._onDeadlock) {
            try { this._onDeadlock(this.state, this.taskId); } catch (_) {}
          }
        }
      } else {
        this._lastCheckedState = this.state;
        this._staleCheckCount  = 0;
      }
    }, DEADLOCK_DETECTION.checkIntervalMs);
  }
}


// ══════════════════════════════════════════════════════════════════
//  导出
// ══════════════════════════════════════════════════════════════════

module.exports = { TaskStateMachine, TASK_STATE, TRANSITIONS, TIMEOUT_CONFIG, RETRY_CONFIG, DEADLOCK_DETECTION };
