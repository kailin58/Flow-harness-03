'use strict';
/**
 * ScheduleMemory — 定时任务记忆层
 *
 * 5层结构：
 *   1. Registry      任务定义（cron / handler / priority / version）
 *   2. ExecutionLog  执行历史（只追加，Hot最近100条 + 月度归档）
 *   3. StateStore    增量状态（断点续传，永久保留）
 *   4. FailureMemory 失败记录（驱动商议触发，永久保留）
 *   5. ContextSnapshot 上下文快照（最近10次，调试用）
 *
 * 存储依赖：
 *   KnowledgeBase.writeShared('schedules', key, data, 'supervisor')
 *   → CEO 是 schedules 命名空间的唯一写入方
 *   → 所有 Agent 可读（Read-All）
 *
 * 商议触发阈值（FailureMemory → DeliberationEngine）：
 *   HIGH 优先级任务：连续失败 2 次
 *   NORMAL 优先级任务：连续失败 3 次
 *   连续超时 2 次（不论优先级）
 */

const crypto = require('crypto');
const { createLogger } = require('./logger');

// ── 常量 ──────────────────────────────────────────────────────
const TASK_STATUS = {
  IDLE:           'idle',
  PENDING:        'pending',
  RUNNING:        'running',
  SUCCESS:        'success',
  FAILED:         'failed',
  TIMEOUT:        'timeout',
  DELIBERATING:   'deliberating',
  HUMAN_REQUIRED: 'human_required'
};

const PRIORITY = { HIGH: 'high', NORMAL: 'normal', LOW: 'low' };

// 商议触发阈值
const DELIBERATE_THRESHOLD = {
  [PRIORITY.HIGH]:   2,
  [PRIORITY.NORMAL]: 3,
  [PRIORITY.LOW]:    5
};
const TIMEOUT_DELIBERATE_THRESHOLD = 2;
const HUMAN_ESCALATE_AFTER_DELIBERATION = 2;

// 保留策略
const RETENTION = {
  EXECUTION_LOG_HOT:    100,   // 内存热区最多保留条数
  CONTEXT_SNAPSHOT_MAX: 10     // 上下文快照保留最近N次
};

// ── 辅助：内容哈希（用于版本检测）────────────────────────────
function contentHash(obj) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(obj))
    .digest('hex')
    .slice(0, 12);
}

// ── 辅助：cron 下次触发时间（简单实现，仅支持5字段标准cron）─
function parseNextRun(cronExpr, fromDate = new Date()) {
  // 解析 "分 时 日 月 周" 格式，返回下次触发的 Date
  // 简化版：仅支持 * 和具体数字，不支持 /step 和范围
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length !== 5) return null;

  const [min, hour, dom, mon, dow] = parts;
  const now = new Date(fromDate);
  const candidate = new Date(now);
  candidate.setSeconds(0, 0);
  candidate.setMinutes(candidate.getMinutes() + 1);

  // 最多向前搜索 525600 分钟（1年）
  for (let i = 0; i < 525600; i++) {
    const m = candidate.getMonth() + 1;
    const d = candidate.getDate();
    const h = candidate.getHours();
    const mi = candidate.getMinutes();
    const wd = candidate.getDay();

    const matchMin  = min  === '*' || parseInt(min)  === mi;
    const matchHour = hour === '*' || parseInt(hour) === h;
    const matchDom  = dom  === '*' || parseInt(dom)  === d;
    const matchMon  = mon  === '*' || parseInt(mon)  === m;
    const matchDow  = dow  === '*' || parseInt(dow)  === wd;

    if (matchMin && matchHour && matchDom && matchMon && matchDow) {
      return new Date(candidate);
    }
    candidate.setMinutes(candidate.getMinutes() + 1);
  }
  return null;
}


class ScheduleMemory {
  /**
   * @param {import('./knowledge-base')} knowledgeBase
   * @param {Object} [options]
   * @param {number} [options.executionLogHot=100]
   * @param {number} [options.contextSnapshotMax=10]
   */
  constructor(knowledgeBase, options = {}) {
    this.kb      = knowledgeBase;
    this.logger  = createLogger({ name: 'schedule-memory' });

    this._hotLog     = RETENTION.EXECUTION_LOG_HOT;
    this._snapMax    = RETENTION.CONTEXT_SNAPSHOT_MAX;
    if (options.executionLogHot)    this._hotLog  = options.executionLogHot;
    if (options.contextSnapshotMax) this._snapMax = options.contextSnapshotMax;

    // 内存缓存（避免频繁读盘）
    this._registryCache  = new Map();  // taskId → taskDef
    this._execLogCache   = new Map();  // taskId → ExecutionEntry[]
    this._failureCache   = new Map();  // taskId → FailureRecord
  }

  // ══════════════════════════════════════════════════════════════
  //  Layer 1: Registry — 任务定义
  // ══════════════════════════════════════════════════════════════

  /**
   * 注册/更新定时任务定义
   *
   * @param {Object} def
   * @param {string}  def.id          - 唯一任务ID
   * @param {string}  def.name        - 任务名称
   * @param {string}  def.cron        - Cron 表达式（5字段）
   * @param {string}  def.handler     - 执行 Agent ID（如 'inspector'）
   * @param {string}  def.taskMessage - 传给 handleTask 的任务描述
   * @param {string}  [def.priority]  - 'high'|'normal'|'low'，默认 'normal'
   * @param {boolean} [def.enabled]   - 默认 true
   * @param {Object}  [def.meta]      - 附加元数据
   * @returns {{ taskId, version, isNew, prevVersion }}
   */
  registerTask(def) {
    if (!def.id || !def.cron || !def.handler || !def.taskMessage) {
      throw new Error('registerTask: 缺少必需字段 id / cron / handler / taskMessage');
    }

    const coreFields = { cron: def.cron, handler: def.handler };
    const hash       = contentHash(coreFields);
    const existing   = this._loadRegistry(def.id);
    const isNew      = !existing;
    const prevVersion = existing?.version || null;

    // 核心字段变化 → 新版本（失败计数归零）
    const versionChanged = existing && existing.contentHash !== hash;
    const version = isNew ? 1 : (versionChanged ? (existing.version + 1) : existing.version);

    const record = {
      id:          def.id,
      name:        def.name || def.id,
      cron:        def.cron,
      handler:     def.handler,
      taskMessage: def.taskMessage,
      priority:    def.priority || PRIORITY.NORMAL,
      enabled:     def.enabled !== false,
      meta:        def.meta || {},
      version,
      contentHash: hash,
      registeredAt: isNew ? new Date().toISOString() : existing.registeredAt,
      updatedAt:   new Date().toISOString()
    };

    this._saveRegistry(def.id, record);

    // 版本升级 → 清零失败计数（但保留历史日志）
    if (versionChanged) {
      this._clearFailureCount(def.id);
      this.logger.info(`[ScheduleMemory] 任务 "${def.id}" 版本升级 v${prevVersion} → v${version}，失败计数归零`);
    }

    this.logger.info(`[ScheduleMemory] ${isNew ? '注册' : '更新'}任务: "${def.id}" (v${version})`);
    return { taskId: def.id, version, isNew, prevVersion };
  }

  /**
   * 获取任务定义
   */
  getTask(taskId) {
    return this._loadRegistry(taskId);
  }

  /**
   * 列出所有已注册任务
   */
  listTasks() {
    const keys = this.kb.listShared('schedules');
    return keys
      .filter(k => k.startsWith('registry_'))
      .map(k => {
        const entry = this.kb.readShared('schedules', k);
        return entry?.data || null;
      })
      .filter(Boolean);
  }

  /**
   * 计算某任务的下次触发时间
   */
  getNextRun(taskId, fromDate) {
    const def = this.getTask(taskId);
    if (!def) return null;
    return parseNextRun(def.cron, fromDate);
  }

  // ══════════════════════════════════════════════════════════════
  //  Layer 2: ExecutionLog — 执行历史（只追加）
  // ══════════════════════════════════════════════════════════════

  /**
   * 记录任务开始执行，返回 executionId
   */
  recordStart(taskId) {
    const def = this.getTask(taskId);
    if (!def) throw new Error(`任务未注册: ${taskId}`);

    const execId = `exec_${taskId}_${Date.now()}`;
    const entry  = {
      executionId: execId,
      taskId,
      taskVersion: def.version,
      status:      TASK_STATUS.RUNNING,
      triggeredAt: new Date().toISOString(),
      startedAt:   new Date().toISOString(),
      endedAt:     null,
      duration:    null,
      agentId:     def.handler,
      result:      null,
      error:       null
    };

    this._appendExecLog(taskId, entry);
    this.logger.info(`[ScheduleMemory] 开始执行: ${execId}`);
    return execId;
  }

  /**
   * 记录执行成功
   */
  recordSuccess(executionId, result = {}) {
    return this._finalizeExec(executionId, TASK_STATUS.SUCCESS, { result });
  }

  /**
   * 记录执行失败
   */
  recordFailure(executionId, error = '') {
    return this._finalizeExec(executionId, TASK_STATUS.FAILED, { error: String(error) });
  }

  /**
   * 记录执行超时
   */
  recordTimeout(executionId) {
    return this._finalizeExec(executionId, TASK_STATUS.TIMEOUT, { error: '执行超时' });
  }

  /**
   * 获取某任务最近N条执行历史
   */
  getExecutionLog(taskId, limit = 20) {
    const log = this._getExecLog(taskId);
    return log.slice(-limit);
  }

  /**
   * 获取最近一次执行记录
   */
  getLastExecution(taskId) {
    const log = this._getExecLog(taskId);
    return log.length > 0 ? log[log.length - 1] : null;
  }

  // ══════════════════════════════════════════════════════════════
  //  Layer 3: StateStore — 增量状态（断点续传）
  // ══════════════════════════════════════════════════════════════

  /**
   * 保存任务的增量状态
   * @param {string} taskId
   * @param {Object} state   - 任意可序列化对象（如 { lastProcessedId: 1234 }）
   */
  saveState(taskId, state) {
    const key   = `state_${taskId}`;
    const entry = {
      taskId,
      state,
      savedAt:  new Date().toISOString(),
      version:  (this._loadStateEntry(taskId)?.version || 0) + 1
    };
    this.kb.writeShared('schedules', key, entry, 'supervisor');
    return entry;
  }

  /**
   * 读取任务的增量状态（用于断点续传）
   */
  loadState(taskId) {
    const entry = this._loadStateEntry(taskId);
    return entry ? { state: entry.state, savedAt: entry.savedAt, version: entry.version } : null;
  }

  /**
   * 清除任务状态（重置断点）
   */
  clearState(taskId) {
    const key = `state_${taskId}`;
    const entry = { taskId, state: null, savedAt: new Date().toISOString(), version: 0, cleared: true };
    this.kb.writeShared('schedules', key, entry, 'supervisor');
  }

  // ══════════════════════════════════════════════════════════════
  //  Layer 4: FailureMemory — 失败记录 + 商议触发判断
  // ══════════════════════════════════════════════════════════════

  /**
   * 判断是否应该触发商议
   * @returns {{ should: boolean, reason: string, consecutiveFails: number }}
   */
  shouldDeliberate(taskId) {
    const fm  = this._loadFailure(taskId);
    const def = this.getTask(taskId);
    if (!fm || !def) return { should: false, reason: 'no_data', consecutiveFails: 0 };

    const threshold     = DELIBERATE_THRESHOLD[def.priority] || DELIBERATE_THRESHOLD[PRIORITY.NORMAL];
    const timeoutThresh = TIMEOUT_DELIBERATE_THRESHOLD;

    if (fm.consecutiveTimeouts >= timeoutThresh) {
      return { should: true, reason: 'consecutive_timeouts', consecutiveFails: fm.consecutiveFails };
    }
    if (fm.consecutiveFails >= threshold) {
      return { should: true, reason: 'consecutive_failures', consecutiveFails: fm.consecutiveFails };
    }
    if (fm.deliberationCount >= HUMAN_ESCALATE_AFTER_DELIBERATION && fm.consecutiveFails > 0) {
      return { should: true, reason: 'post_deliberation_failure', consecutiveFails: fm.consecutiveFails };
    }
    return { should: false, reason: 'below_threshold', consecutiveFails: fm.consecutiveFails };
  }

  /**
   * 判断是否需要人工介入
   */
  needsHuman(taskId) {
    const fm  = this._loadFailure(taskId);
    if (!fm) return false;
    return fm.humanEscalated === true ||
      fm.deliberationCount >= HUMAN_ESCALATE_AFTER_DELIBERATION;
  }

  /**
   * 标记已进行商议（商议计数+1）
   */
  recordDeliberation(taskId, deliberationResult) {
    const fm = this._loadFailure(taskId) || this._defaultFailure(taskId);
    fm.deliberationCount++;
    fm.lastDeliberationAt = new Date().toISOString();
    fm.lastDeliberationDecision = deliberationResult?.decision || null;
    if (fm.deliberationCount >= HUMAN_ESCALATE_AFTER_DELIBERATION) {
      fm.humanEscalated = true;
    }
    this._saveFailure(taskId, fm);
  }

  /**
   * 获取完整失败记录
   */
  getFailureMemory(taskId) {
    return this._loadFailure(taskId);
  }

  // ══════════════════════════════════════════════════════════════
  //  Layer 5: ContextSnapshot — 上下文快照
  // ══════════════════════════════════════════════════════════════

  /**
   * 保存执行上下文快照
   * @param {string} executionId
   * @param {Object} context  - { codeVersion, relatedFiles, agentFindings, ... }
   */
  saveSnapshot(executionId, context) {
    const taskId = this._taskIdFromExecId(executionId);
    if (!taskId) return null;

    const snapshots = this._loadSnapshots(taskId);
    snapshots.push({
      executionId,
      context,
      savedAt: new Date().toISOString()
    });
    // 保留最近 N 条
    const trimmed = snapshots.slice(-this._snapMax);
    const key = `snapshot_${taskId}`;
    this.kb.writeShared('schedules', key, trimmed, 'supervisor');
    return trimmed[trimmed.length - 1];
  }

  /**
   * 读取某任务最近的上下文快照
   */
  getSnapshots(taskId, limit = 5) {
    const snapshots = this._loadSnapshots(taskId);
    return snapshots.slice(-limit);
  }

  // ══════════════════════════════════════════════════════════════
  //  综合快照 — 完整记忆状态
  // ══════════════════════════════════════════════════════════════

  /**
   * 获取某任务的完整记忆快照（供 CEO / DeliberationEngine 使用）
   */
  getMemorySnapshot(taskId) {
    const def       = this.getTask(taskId);
    const lastExec  = this.getLastExecution(taskId);
    const state     = this.loadState(taskId);
    const failure   = this.getFailureMemory(taskId);
    const snapshots = this.getSnapshots(taskId, 3);
    const deliberate = this.shouldDeliberate(taskId);
    const nextRun   = this.getNextRun(taskId);

    return {
      taskId,
      definition:     def,
      lastExecution:  lastExec,
      currentState:   state,
      failureMemory:  failure,
      recentSnapshots: snapshots,
      deliberate,
      nextRun:        nextRun?.toISOString() || null,
      needsHuman:     this.needsHuman(taskId),
      snapshotAt:     new Date().toISOString()
    };
  }

  // ══════════════════════════════════════════════════════════════
  //  内部方法 — 持久化
  // ══════════════════════════════════════════════════════════════

  _saveRegistry(taskId, data) {
    this.kb.writeShared('schedules', `registry_${taskId}`, data, 'supervisor');
    this._registryCache.set(taskId, data);
  }

  _loadRegistry(taskId) {
    if (this._registryCache.has(taskId)) return this._registryCache.get(taskId);
    const entry = this.kb.readShared('schedules', `registry_${taskId}`);
    const data  = entry?.data || null;
    if (data) this._registryCache.set(taskId, data);
    return data;
  }

  _appendExecLog(taskId, entry) {
    const log = this._getExecLog(taskId);
    log.push(entry);
    // 超出 Hot 上限 → 只保留最近 N 条（旧数据在 KB 里仍有完整记录）
    const hot = log.slice(-this._hotLog);
    this._execLogCache.set(taskId, hot);
    this.kb.writeShared('schedules', `execlog_${taskId}`, hot, 'supervisor');
  }

  _getExecLog(taskId) {
    if (this._execLogCache.has(taskId)) return this._execLogCache.get(taskId);
    const entry = this.kb.readShared('schedules', `execlog_${taskId}`);
    const log   = Array.isArray(entry?.data) ? entry.data : [];
    this._execLogCache.set(taskId, log);
    return log;
  }

  _finalizeExec(executionId, status, extra = {}) {
    const taskId = this._taskIdFromExecId(executionId);
    if (!taskId) throw new Error(`无法从 executionId 解析 taskId: ${executionId}`);

    const log   = this._getExecLog(taskId);
    const entry = log.find(e => e.executionId === executionId);
    if (!entry) throw new Error(`执行记录不存在: ${executionId}`);

    entry.status   = status;
    entry.endedAt  = new Date().toISOString();
    entry.duration = Date.now() - new Date(entry.startedAt).getTime();
    Object.assign(entry, extra);

    this._execLogCache.set(taskId, log);
    this.kb.writeShared('schedules', `execlog_${taskId}`, log, 'supervisor');

    // 更新失败记忆
    this._updateFailureMemory(taskId, status, extra.error);

    this.logger.info(`[ScheduleMemory] ${status}: ${executionId} (${entry.duration}ms)`);
    return entry;
  }

  _updateFailureMemory(taskId, status, error) {
    const fm = this._loadFailure(taskId) || this._defaultFailure(taskId);

    if (status === TASK_STATUS.SUCCESS) {
      fm.consecutiveFails    = 0;
      fm.consecutiveTimeouts = 0;
      fm.lastSuccessAt       = new Date().toISOString();
      fm.totalSuccesses      = (fm.totalSuccesses || 0) + 1;
    } else if (status === TASK_STATUS.FAILED) {
      fm.consecutiveFails++;
      fm.totalFails = (fm.totalFails || 0) + 1;
      fm.lastError  = error || '未知错误';
      fm.lastFailedAt = new Date().toISOString();
    } else if (status === TASK_STATUS.TIMEOUT) {
      fm.consecutiveTimeouts++;
      fm.consecutiveFails++;
      fm.totalFails = (fm.totalFails || 0) + 1;
      fm.lastError  = '执行超时';
      fm.lastFailedAt = new Date().toISOString();
    }

    this._saveFailure(taskId, fm);
  }

  _saveFailure(taskId, fm) {
    this.kb.writeShared('schedules', `failure_${taskId}`, fm, 'supervisor');
    this._failureCache.set(taskId, fm);
  }

  _loadFailure(taskId) {
    if (this._failureCache.has(taskId)) return this._failureCache.get(taskId);
    const entry = this.kb.readShared('schedules', `failure_${taskId}`);
    const fm    = entry?.data || null;
    if (fm) this._failureCache.set(taskId, fm);
    return fm;
  }

  _defaultFailure(taskId) {
    return {
      taskId,
      consecutiveFails:    0,
      consecutiveTimeouts: 0,
      totalFails:          0,
      totalSuccesses:      0,
      lastError:           null,
      lastFailedAt:        null,
      lastSuccessAt:       null,
      deliberationCount:   0,
      lastDeliberationAt:  null,
      lastDeliberationDecision: null,
      humanEscalated:      false
    };
  }

  _clearFailureCount(taskId) {
    const fm = this._loadFailure(taskId);
    if (!fm) return;
    fm.consecutiveFails    = 0;
    fm.consecutiveTimeouts = 0;
    fm.deliberationCount   = 0;
    fm.humanEscalated      = false;
    this._saveFailure(taskId, fm);
  }

  _loadStateEntry(taskId) {
    const entry = this.kb.readShared('schedules', `state_${taskId}`);
    return entry?.data || null;
  }

  _loadSnapshots(taskId) {
    const entry = this.kb.readShared('schedules', `snapshot_${taskId}`);
    return Array.isArray(entry?.data) ? entry.data : [];
  }

  // executionId 格式：exec_{taskId}_{timestamp}
  _taskIdFromExecId(executionId) {
    const m = executionId.match(/^exec_(.+)_\d+$/);
    return m ? m[1] : null;
  }

  // ══════════════════════════════════════════════════════════════
  //  静态常量导出
  // ══════════════════════════════════════════════════════════════
  static get TASK_STATUS()  { return TASK_STATUS; }
  static get PRIORITY()     { return PRIORITY; }
  static get THRESHOLDS()   { return DELIBERATE_THRESHOLD; }
}

module.exports = ScheduleMemory;
