/**
 * conflict-resolver.js - 多工具冲突解决
 *
 * 文档要求(Ch26): 多工具冲突解决
 *   - 优先级仲裁: 当多个工具/Agent争抢同一资源时的仲裁机制
 *   - 配置统一: 多工具配置冲突检测与合并
 *   - Agent/Skill 去重: 能力重叠检测与去重
 *   - 冲突策略: 自动解决/人工决策/回退
 *
 * @version 1.0.0
 * @date 2026-04-13
 */

const { createLogger } = require('./logger');

// ============================================================
// 常量
// ============================================================

const CONFLICT_TYPES = {
  RESOURCE: 'resource',       // 资源争抢 (文件/端口/锁)
  CONFIG: 'config',           // 配置冲突
  CAPABILITY: 'capability',   // 能力重叠
  PRIORITY: 'priority',       // 优先级冲突
  DEPENDENCY: 'dependency'    // 依赖冲突
};

const RESOLUTION_STRATEGIES = {
  PRIORITY: 'priority',       // 优先级高者胜出
  MERGE: 'merge',             // 合并配置
  QUEUE: 'queue',             // 排队等待
  FALLBACK: 'fallback',       // 回退到备选方案
  HUMAN: 'human',             // 人工决策
  CANCEL: 'cancel'            // 取消冲突操作
};

const TOOL_PRIORITY = {
  supervisor: 100,
  inspector: 90,
  security: 85,
  executor: 70,
  monitor: 60,
  default: 50
};

// ============================================================
// ConflictResolver
// ============================================================

class ConflictResolver {
  /**
   * @param {Object} options
   * @param {Object} options.logger          - Logger 实例
   * @param {Object} options.agentRegistry   - AgentRegistry 实例
   * @param {Object} options.priorities      - 自定义优先级映射
   * @param {string} options.defaultStrategy - 默认解决策略
   */
  constructor(options = {}) {
    this.logger = options.logger || createLogger({ name: 'conflict-resolver' });
    this.agentRegistry = options.agentRegistry || null;

    // 优先级映射
    this.priorities = { ...TOOL_PRIORITY, ...(options.priorities || {}) };

    // 默认解决策略
    this.defaultStrategy = options.defaultStrategy || RESOLUTION_STRATEGIES.PRIORITY;

    // 资源锁
    this.resourceLocks = new Map();  // resource -> { holder, acquiredAt, timeout }

    // 配置注册表
    this.configRegistry = new Map(); // configKey -> [{ source, value, priority }]

    // 能力注册表
    this.capabilityRegistry = new Map(); // capability -> [{ agent, priority, metadata }]

    // 冲突历史
    this.conflictLog = [];

    // 待人工处理的冲突
    this.pendingHumanDecisions = [];
  }

  // ----------------------------------------------------------
  // 1. 资源冲突解决
  // ----------------------------------------------------------

  /**
   * 尝试获取资源锁
   * @param {string} resource   - 资源标识 (文件路径/端口/锁名)
   * @param {string} requester  - 请求者标识
   * @param {Object} options    - { timeout, priority, wait }
   * @returns {Object} { acquired, holder, waitMs }
   */
  acquireResource(resource, requester, options = {}) {
    const priority = options.priority || this.priorities[requester] || this.priorities.default;
    const timeout = options.timeout || 30000;
    const existing = this.resourceLocks.get(resource);

    if (!existing) {
      // 无冲突，直接获取
      this.resourceLocks.set(resource, {
        holder: requester,
        priority,
        acquiredAt: Date.now(),
        timeout
      });
      return { acquired: true, holder: requester };
    }

    // 检查是否过期
    if (Date.now() - existing.acquiredAt > existing.timeout) {
      this.logger.warn({ resource, prevHolder: existing.holder }, 'Resource lock expired, granting to new requester');
      this.resourceLocks.set(resource, {
        holder: requester,
        priority,
        acquiredAt: Date.now(),
        timeout
      });
      return { acquired: true, holder: requester, note: 'previous_lock_expired' };
    }

    // 优先级仲裁
    if (priority > existing.priority) {
      // 高优先级抢占
      const conflict = this._logConflict({
        type: CONFLICT_TYPES.RESOURCE,
        resource,
        parties: [existing.holder, requester],
        resolution: 'preempt',
        winner: requester,
        detail: `${requester}(P${priority}) 抢占 ${existing.holder}(P${existing.priority})`
      });

      this.resourceLocks.set(resource, {
        holder: requester,
        priority,
        acquiredAt: Date.now(),
        timeout
      });
      return { acquired: true, holder: requester, preempted: existing.holder, conflict };
    }

    // 优先级不够，需要等待
    this._logConflict({
      type: CONFLICT_TYPES.RESOURCE,
      resource,
      parties: [existing.holder, requester],
      resolution: 'queued',
      winner: existing.holder,
      detail: `${requester}(P${priority}) 等待 ${existing.holder}(P${existing.priority})`
    });

    return {
      acquired: false,
      holder: existing.holder,
      waitMs: Math.max(0, existing.timeout - (Date.now() - existing.acquiredAt))
    };
  }

  /**
   * 释放资源锁
   */
  releaseResource(resource, holder) {
    const existing = this.resourceLocks.get(resource);
    if (existing && existing.holder === holder) {
      this.resourceLocks.delete(resource);
      return true;
    }
    return false;
  }

  /**
   * 获取所有资源锁状态
   */
  getResourceLocks() {
    const locks = {};
    for (const [resource, lock] of this.resourceLocks) {
      locks[resource] = {
        ...lock,
        remainingMs: Math.max(0, lock.timeout - (Date.now() - lock.acquiredAt))
      };
    }
    return locks;
  }

  // ----------------------------------------------------------
  // 2. 配置冲突解决
  // ----------------------------------------------------------

  /**
   * 注册配置项
   * @param {string} configKey - 配置键
   * @param {*} value          - 配置值
   * @param {string} source    - 配置来源
   * @param {number} priority  - 来源优先级
   */
  registerConfig(configKey, value, source, priority) {
    if (!this.configRegistry.has(configKey)) {
      this.configRegistry.set(configKey, []);
    }

    const entries = this.configRegistry.get(configKey);
    const existing = entries.find(e => e.source === source);

    if (existing) {
      existing.value = value;
      existing.priority = priority;
      existing.updatedAt = new Date().toISOString();
    } else {
      entries.push({
        source,
        value,
        priority,
        registeredAt: new Date().toISOString()
      });
    }

    // 排序按优先级
    entries.sort((a, b) => b.priority - a.priority);
  }

  /**
   * 解析配置值 (处理多来源冲突)
   * @param {string} configKey
   * @returns {Object} { value, source, conflicts }
   */
  resolveConfig(configKey) {
    const entries = this.configRegistry.get(configKey);
    if (!entries || entries.length === 0) {
      return { value: undefined, source: null, conflicts: [] };
    }

    if (entries.length === 1) {
      return { value: entries[0].value, source: entries[0].source, conflicts: [] };
    }

    // 检测冲突
    const conflicts = [];
    const topValue = entries[0].value;
    const topValueStr = JSON.stringify(topValue);

    for (let i = 1; i < entries.length; i++) {
      if (JSON.stringify(entries[i].value) !== topValueStr) {
        conflicts.push({
          source: entries[i].source,
          value: entries[i].value,
          priority: entries[i].priority
        });
      }
    }

    if (conflicts.length > 0) {
      this._logConflict({
        type: CONFLICT_TYPES.CONFIG,
        resource: configKey,
        parties: entries.map(e => e.source),
        resolution: 'priority',
        winner: entries[0].source,
        detail: `配置 ${configKey}: ${entries[0].source}(P${entries[0].priority}) 的值优先`
      });
    }

    return {
      value: topValue,
      source: entries[0].source,
      conflicts
    };
  }

  /**
   * 合并多来源配置 (对象类型)
   */
  mergeConfigs(configKey) {
    const entries = this.configRegistry.get(configKey);
    if (!entries || entries.length === 0) return {};

    // 按优先级从低到高合并(高优先级覆盖低优先级)
    const sorted = [...entries].sort((a, b) => a.priority - b.priority);
    let merged = {};

    for (const entry of sorted) {
      if (typeof entry.value === 'object' && entry.value !== null && !Array.isArray(entry.value)) {
        merged = { ...merged, ...entry.value };
      } else {
        merged = entry.value; // 非对象直接覆盖
      }
    }

    return merged;
  }

  // ----------------------------------------------------------
  // 3. Agent/Skill 能力去重
  // ----------------------------------------------------------

  /**
   * 注册 Agent 能力
   */
  registerCapability(capability, agentName, metadata = {}) {
    if (!this.capabilityRegistry.has(capability)) {
      this.capabilityRegistry.set(capability, []);
    }

    const providers = this.capabilityRegistry.get(capability);
    const existing = providers.find(p => p.agent === agentName);

    if (existing) {
      existing.metadata = metadata;
      existing.priority = metadata.priority || this.priorities[agentName] || this.priorities.default;
    } else {
      providers.push({
        agent: agentName,
        priority: metadata.priority || this.priorities[agentName] || this.priorities.default,
        metadata,
        registeredAt: new Date().toISOString()
      });
    }

    // 排序
    providers.sort((a, b) => b.priority - a.priority);
  }

  /**
   * 检测能力重叠
   * @returns {Array} 重叠的能力列表
   */
  detectCapabilityOverlaps() {
    const overlaps = [];

    for (const [capability, providers] of this.capabilityRegistry) {
      if (providers.length > 1) {
        overlaps.push({
          capability,
          providers: providers.map(p => ({
            agent: p.agent,
            priority: p.priority
          })),
          primaryAgent: providers[0].agent,
          duplicateAgents: providers.slice(1).map(p => p.agent)
        });
      }
    }

    return overlaps;
  }

  /**
   * 选择最佳提供者
   * @param {string} capability - 所需能力
   * @param {Object} context    - 上下文 (taskType, requirements)
   * @returns {Object|null} 最佳提供者
   */
  selectProvider(capability, context = {}) {
    const providers = this.capabilityRegistry.get(capability);
    if (!providers || providers.length === 0) return null;

    // 如果有特定要求，筛选
    let candidates = [...providers];

    if (context.excludeAgents) {
      candidates = candidates.filter(p => !context.excludeAgents.includes(p.agent));
    }

    if (candidates.length === 0) return null;

    // 返回最高优先级
    return {
      agent: candidates[0].agent,
      priority: candidates[0].priority,
      alternatives: candidates.slice(1).map(c => c.agent)
    };
  }

  // ----------------------------------------------------------
  // 4. 通用冲突检测与解决
  // ----------------------------------------------------------

  /**
   * 检测并解决冲突
   * @param {Object} conflict - 冲突描述
   * @param {string} conflict.type - 冲突类型
   * @param {Array} conflict.parties - 冲突各方
   * @param {string} conflict.resource - 冲突资源
   * @param {Object} conflict.context - 上下文信息
   * @returns {Object} 解决方案
   */
  resolve(conflict) {
    const strategy = this._selectStrategy(conflict);

    const resolution = {
      conflict: { ...conflict },
      strategy: strategy,
      timestamp: new Date().toISOString(),
      result: null
    };

    switch (strategy) {
      case RESOLUTION_STRATEGIES.PRIORITY:
        resolution.result = this._resolvByPriority(conflict);
        break;
      case RESOLUTION_STRATEGIES.MERGE:
        resolution.result = this._resolveByMerge(conflict);
        break;
      case RESOLUTION_STRATEGIES.QUEUE:
        resolution.result = this._resolveByQueue(conflict);
        break;
      case RESOLUTION_STRATEGIES.FALLBACK:
        resolution.result = this._resolveByFallback(conflict);
        break;
      case RESOLUTION_STRATEGIES.HUMAN:
        resolution.result = this._resolveByHuman(conflict);
        break;
      case RESOLUTION_STRATEGIES.CANCEL:
        resolution.result = { action: 'cancelled', reason: '冲突操作已取消' };
        break;
      default:
        resolution.result = this._resolvByPriority(conflict);
    }

    this._logConflict({
      type: conflict.type,
      resource: conflict.resource,
      parties: conflict.parties,
      resolution: strategy,
      winner: resolution.result.winner || null,
      detail: resolution.result.detail || ''
    });

    return resolution;
  }

  _selectStrategy(conflict) {
    switch (conflict.type) {
      case CONFLICT_TYPES.RESOURCE:
        return RESOLUTION_STRATEGIES.PRIORITY;
      case CONFLICT_TYPES.CONFIG:
        return RESOLUTION_STRATEGIES.MERGE;
      case CONFLICT_TYPES.CAPABILITY:
        return RESOLUTION_STRATEGIES.PRIORITY;
      case CONFLICT_TYPES.DEPENDENCY:
        return RESOLUTION_STRATEGIES.QUEUE;
      default:
        return this.defaultStrategy;
    }
  }

  _resolvByPriority(conflict) {
    const parties = conflict.parties || [];
    const ranked = parties.map(p => ({
      name: p,
      priority: this.priorities[p] || this.priorities.default
    })).sort((a, b) => b.priority - a.priority);

    return {
      winner: ranked[0]?.name,
      losers: ranked.slice(1).map(r => r.name),
      detail: `优先级仲裁: ${ranked.map(r => `${r.name}(P${r.priority})`).join(' > ')}`,
      action: 'proceed_with_winner'
    };
  }

  _resolveByMerge(conflict) {
    return {
      action: 'merge',
      detail: `合并各方配置: ${(conflict.parties || []).join(', ')}`,
      mergeStrategy: 'priority_overlay'
    };
  }

  _resolveByQueue(conflict) {
    const parties = conflict.parties || [];
    const ranked = parties.map(p => ({
      name: p,
      priority: this.priorities[p] || this.priorities.default
    })).sort((a, b) => b.priority - a.priority);

    return {
      queue: ranked.map(r => r.name),
      detail: `排队执行: ${ranked.map(r => r.name).join(' → ')}`,
      action: 'sequential_execution'
    };
  }

  _resolveByFallback(conflict) {
    return {
      action: 'fallback',
      detail: '回退到备选方案',
      primary: (conflict.parties || [])[0],
      fallback: (conflict.parties || [])[1] || null
    };
  }

  _resolveByHuman(conflict) {
    const decision = {
      id: `hd_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      conflict: { ...conflict },
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    this.pendingHumanDecisions.push(decision);

    return {
      action: 'await_human',
      decisionId: decision.id,
      detail: '需要人工决策'
    };
  }

  /**
   * 提交人工决策
   */
  submitHumanDecision(decisionId, decision) {
    const pending = this.pendingHumanDecisions.find(d => d.id === decisionId);
    if (!pending) return { success: false, error: '未找到待决策项' };

    pending.status = 'resolved';
    pending.decision = decision;
    pending.resolvedAt = new Date().toISOString();

    return { success: true, decision: pending };
  }

  /**
   * 获取待人工处理的冲突
   */
  getPendingDecisions() {
    return this.pendingHumanDecisions.filter(d => d.status === 'pending');
  }

  // ----------------------------------------------------------
  // 冲突日志
  // ----------------------------------------------------------

  _logConflict(conflict) {
    const entry = {
      ...conflict,
      timestamp: new Date().toISOString()
    };
    this.conflictLog.push(entry);

    // 限制日志长度
    if (this.conflictLog.length > 500) {
      this.conflictLog = this.conflictLog.slice(-500);
    }

    this.logger.info({
      type: conflict.type,
      resource: conflict.resource,
      resolution: conflict.resolution,
      winner: conflict.winner
    }, `Conflict resolved: ${conflict.detail}`);

    return entry;
  }

  /**
   * 获取冲突统计
   */
  getStats() {
    const byType = {};
    for (const entry of this.conflictLog) {
      byType[entry.type] = (byType[entry.type] || 0) + 1;
    }

    return {
      totalConflicts: this.conflictLog.length,
      byType,
      activeResourceLocks: this.resourceLocks.size,
      registeredConfigs: this.configRegistry.size,
      registeredCapabilities: this.capabilityRegistry.size,
      capabilityOverlaps: this.detectCapabilityOverlaps().length,
      pendingHumanDecisions: this.getPendingDecisions().length
    };
  }

  /**
   * 获取冲突日志
   */
  getConflictLog(limit = 20) {
    return this.conflictLog.slice(-limit);
  }

  /**
   * 注册工具/执行端的优先级（向 Supervisor 暴露的兼容接口）
   * @param {string} toolName - 工具名称（如 'supervisor', 'cursor'）
   * @param {number} priority - 优先级数值（越大越高）
   */
  registerToolPriority(toolName, priority) {
    this.priorities[toolName] = priority;
  }

  /**
   * 获取指定能力的所有提供者列表（向 Supervisor 暴露的兼容接口）
   * @param {string} capability - 能力名称
   * @returns {Array} 提供者列表
   */
  getProvidersForCapability(capability) {
    return this.capabilityRegistry.get(capability) || [];
  }
}

// ============================================================
// 导出
// ============================================================

module.exports = {
  ConflictResolver,
  CONFLICT_TYPES,
  RESOLUTION_STRATEGIES,
  TOOL_PRIORITY
};
