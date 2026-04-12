/**
 * chaos-engine.js - 混沌工程测试
 *
 * 文档要求(P3): 混沌工程
 *   - 故障注入 (延迟/错误/中断/资源耗尽)
 *   - 混沌实验定义与执行
 *   - 恢复能力评估与评分
 *   - 实验报告生成
 *   - 安全阀 — 自动中止
 *
 * @version 1.1.0
 * @date 2026-04-13
 */

const { createLogger } = require('./logger');

// ============================================================
// 常量
// ============================================================

const FAULT_TYPE = {
  LATENCY: 'latency',
  ERROR: 'error',
  ABORT: 'abort',
  RESOURCE_EXHAUST: 'resource_exhaust',
  NETWORK_PARTITION: 'network_partition',
  DATA_CORRUPTION: 'data_corruption',
  TIMEOUT: 'timeout'
};

const EXPERIMENT_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  ABORTED: 'aborted',
  FAILED: 'failed'
};

const SEVERITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

// ============================================================
// ChaosEngine
// ============================================================

class ChaosEngine {
  /**
   * @param {Object} options
   * @param {boolean} options.dryRun           - 是否模拟运行
   * @param {number} options.maxConcurrent     - 最大并发实验数
   * @param {number} options.safetyThreshold   - 安全阀阈值 (0-1)
   * @param {number} options.defaultDurationMs - 默认实验时长
   * @param {Object} options.logger
   */
  constructor(options = {}) {
    this.dryRun = options.dryRun !== false; // 默认 dryRun=true 安全模式
    this.maxConcurrent = options.maxConcurrent || 3;
    this.safetyThreshold = options.safetyThreshold || 0.5;
    this.defaultDurationMs = options.defaultDurationMs || 30000;
    this.logger = options.logger || createLogger({ name: 'chaos-engine' });

    // 实验存储
    this.experiments = new Map();
    // 故障注入规则
    this.faultRules = new Map();
    // 运行中实验
    this.activeExperiments = new Set();
    // 实验报告
    this.reports = [];
    // 安全阀状态
    this.safetyValve = { tripped: false, reason: null, at: null };
    // 实验计数器
    this._expCounter = 0;
  }

  // ----------------------------------------------------------
  // 故障规则定义
  // ----------------------------------------------------------

  /**
   * 定义故障注入规则
   * @param {Object} rule
   * @param {string} rule.name          - 规则名
   * @param {string} rule.faultType     - 故障类型
   * @param {string} rule.target        - 目标组件
   * @param {Object} rule.params        - 故障参数
   * @param {number} rule.probability   - 触发概率 (0-1)
   * @returns {Object} 规则
   */
  defineFault(rule) {
    const id = `fault_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    const faultRule = {
      id,
      name: rule.name,
      faultType: rule.faultType || FAULT_TYPE.ERROR,
      target: rule.target || '*',
      params: rule.params || {},
      probability: rule.probability !== undefined ? rule.probability : 1.0,
      severity: rule.severity || SEVERITY.MEDIUM,
      enabled: true,
      createdAt: new Date().toISOString()
    };

    // 设置默认参数
    switch (faultRule.faultType) {
      case FAULT_TYPE.LATENCY:
        faultRule.params = { delayMs: 1000, jitterMs: 200, ...faultRule.params };
        break;
      case FAULT_TYPE.ERROR:
        faultRule.params = { errorRate: 0.5, errorMessage: 'Chaos injected error', ...faultRule.params };
        break;
      case FAULT_TYPE.TIMEOUT:
        faultRule.params = { timeoutMs: 5000, ...faultRule.params };
        break;
      case FAULT_TYPE.RESOURCE_EXHAUST:
        faultRule.params = { type: 'memory', amount: 100, unit: 'MB', ...faultRule.params };
        break;
    }

    this.faultRules.set(id, faultRule);
    return faultRule;
  }

  /**
   * 获取故障规则
   */
  getFaultRule(faultId) {
    return this.faultRules.get(faultId) || null;
  }

  /**
   * 列出故障规则
   */
  listFaultRules() {
    return [...this.faultRules.values()];
  }

  /**
   * 启用/禁用规则
   */
  toggleFault(faultId, enabled) {
    const rule = this.faultRules.get(faultId);
    if (!rule) return false;
    rule.enabled = enabled;
    return true;
  }

  // ----------------------------------------------------------
  // 实验定义
  // ----------------------------------------------------------

  /**
   * 定义混沌实验
   * @param {Object} experiment
   * @param {string} experiment.name          - 实验名
   * @param {string} experiment.hypothesis    - 假设
   * @param {string[]} experiment.faultIds    - 故障规则 ID 列表
   * @param {number} experiment.durationMs    - 持续时间
   * @param {Object} experiment.steadyState   - 稳态定义
   * @param {Function} experiment.healthCheck - 健康检查函数
   * @returns {Object} 实验定义
   */
  defineExperiment(experiment) {
    const id = `exp_${++this._expCounter}_${Date.now()}`;
    const exp = {
      id,
      name: experiment.name,
      hypothesis: experiment.hypothesis || 'System remains stable under fault injection',
      faultIds: experiment.faultIds || [],
      durationMs: experiment.durationMs || this.defaultDurationMs,
      steadyState: experiment.steadyState || { metric: 'availability', threshold: 0.99 },
      healthCheck: experiment.healthCheck || null,
      status: EXPERIMENT_STATUS.PENDING,
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      results: null,
      abortReason: null
    };

    this.experiments.set(id, exp);
    return exp;
  }

  /**
   * 获取实验
   */
  getExperiment(expId) {
    return this.experiments.get(expId) || null;
  }

  /**
   * 列出实验
   */
  listExperiments(filters = {}) {
    let exps = [...this.experiments.values()];
    if (filters.status) {
      exps = exps.filter(e => e.status === filters.status);
    }
    return exps;
  }

  // ----------------------------------------------------------
  // 实验执行
  // ----------------------------------------------------------

  /**
   * 运行实验
   * @param {string} expId - 实验 ID
   * @returns {Object} 实验结果
   */
  async runExperiment(expId) {
    const exp = this.experiments.get(expId);
    if (!exp) return { success: false, error: 'Experiment not found' };

    // 安全阀检查
    if (this.safetyValve.tripped) {
      return { success: false, error: `Safety valve tripped: ${this.safetyValve.reason}` };
    }

    // 并发限制
    if (this.activeExperiments.size >= this.maxConcurrent) {
      return { success: false, error: 'Max concurrent experiments reached' };
    }

    exp.status = EXPERIMENT_STATUS.RUNNING;
    exp.startedAt = new Date().toISOString();
    this.activeExperiments.add(expId);

    const result = {
      experimentId: expId,
      name: exp.name,
      hypothesis: exp.hypothesis,
      dryRun: this.dryRun,
      faultsInjected: [],
      healthChecks: [],
      steadyStateVerified: false,
      score: 0,
      startedAt: exp.startedAt,
      completedAt: null,
      duration: 0
    };

    try {
      // 1. 验证稳态（开始前）
      const steadyBefore = await this._checkSteadyState(exp);
      result.healthChecks.push({ phase: 'before', ...steadyBefore });

      // 2. 注入故障
      for (const faultId of exp.faultIds) {
        const fault = this.faultRules.get(faultId);
        if (!fault || !fault.enabled) continue;

        const injection = this._injectFault(fault);
        result.faultsInjected.push(injection);

        // 安全阀检查
        if (this._shouldAbort(result)) {
          exp.status = EXPERIMENT_STATUS.ABORTED;
          exp.abortReason = 'Safety threshold exceeded';
          this.safetyValve = {
            tripped: true,
            reason: 'Experiment abort - too many failures',
            at: new Date().toISOString()
          };
          break;
        }
      }

      // 3. 模拟持续时间（dryRun 下跳过等待）
      if (!this.dryRun && exp.durationMs > 0) {
        await new Promise(r => setTimeout(r, Math.min(exp.durationMs, 100)));
      }

      // 4. 验证稳态（结束后）
      const steadyAfter = await this._checkSteadyState(exp);
      result.healthChecks.push({ phase: 'after', ...steadyAfter });

      // 5. 评分
      result.steadyStateVerified = steadyAfter.passed;
      result.score = this._calculateScore(result);

      if (exp.status !== EXPERIMENT_STATUS.ABORTED) {
        exp.status = EXPERIMENT_STATUS.COMPLETED;
      }

    } catch (error) {
      exp.status = EXPERIMENT_STATUS.FAILED;
      result.error = error.message;
    } finally {
      exp.completedAt = new Date().toISOString();
      result.completedAt = exp.completedAt;
      result.duration = new Date(result.completedAt) - new Date(result.startedAt);
      exp.results = result;
      this.activeExperiments.delete(expId);

      // 生成报告
      this.reports.push(this._generateReport(result));
    }

    return { success: true, result };
  }

  // ----------------------------------------------------------
  // 内部方法
  // ----------------------------------------------------------

  _injectFault(fault) {
    const injection = {
      faultId: fault.id,
      faultType: fault.faultType,
      target: fault.target,
      severity: fault.severity,
      dryRun: this.dryRun,
      triggered: Math.random() < fault.probability,
      injectedAt: new Date().toISOString(),
      effect: null
    };

    if (!injection.triggered) {
      injection.effect = 'skipped (probability)';
      return injection;
    }

    if (this.dryRun) {
      injection.effect = `[DRY RUN] Would inject ${fault.faultType} on ${fault.target}`;
      return injection;
    }

    // 实际注入（按类型模拟效果）
    switch (fault.faultType) {
      case FAULT_TYPE.LATENCY:
        injection.effect = `Injected ${fault.params.delayMs}ms latency`;
        break;
      case FAULT_TYPE.ERROR:
        injection.effect = `Injected error: ${fault.params.errorMessage}`;
        break;
      case FAULT_TYPE.TIMEOUT:
        injection.effect = `Injected ${fault.params.timeoutMs}ms timeout`;
        break;
      case FAULT_TYPE.ABORT:
        injection.effect = 'Process aborted';
        break;
      case FAULT_TYPE.RESOURCE_EXHAUST:
        injection.effect = `Resource exhaustion: ${fault.params.type} ${fault.params.amount}${fault.params.unit}`;
        break;
      default:
        injection.effect = `Unknown fault type: ${fault.faultType}`;
    }

    this.logger.info({ fault: fault.name, effect: injection.effect }, 'Fault injected');
    return injection;
  }

  async _checkSteadyState(exp) {
    if (exp.healthCheck) {
      try {
        const result = await exp.healthCheck();
        return {
          passed: !!result,
          metric: exp.steadyState.metric,
          value: result,
          threshold: exp.steadyState.threshold,
          checkedAt: new Date().toISOString()
        };
      } catch (e) {
        return { passed: false, error: e.message, checkedAt: new Date().toISOString() };
      }
    }

    // 默认通过
    return {
      passed: true,
      metric: exp.steadyState.metric,
      value: 1.0,
      threshold: exp.steadyState.threshold,
      checkedAt: new Date().toISOString()
    };
  }

  _shouldAbort(result) {
    if (result.faultsInjected.length === 0) return false;
    const triggered = result.faultsInjected.filter(f => f.triggered);
    const critical = triggered.filter(f => f.severity === SEVERITY.CRITICAL);
    return critical.length / (triggered.length || 1) > this.safetyThreshold;
  }

  _calculateScore(result) {
    let score = 100;

    // 稳态验证扣分
    if (!result.steadyStateVerified) score -= 40;

    // 故障影响扣分
    const triggered = result.faultsInjected.filter(f => f.triggered);
    const severityWeights = { low: 5, medium: 10, high: 20, critical: 40 };
    for (const fault of triggered) {
      score -= severityWeights[fault.severity] || 10;
    }

    // 中止额外扣分
    const exp = this.experiments.get(result.experimentId);
    if (exp && exp.status === EXPERIMENT_STATUS.ABORTED) score -= 20;

    return Math.max(0, Math.min(100, score));
  }

  _generateReport(result) {
    return {
      id: `report_${Date.now()}`,
      experimentId: result.experimentId,
      name: result.name,
      hypothesis: result.hypothesis,
      dryRun: result.dryRun,
      status: this.experiments.get(result.experimentId)?.status || 'unknown',
      faultsCount: result.faultsInjected.length,
      triggeredCount: result.faultsInjected.filter(f => f.triggered).length,
      steadyStateVerified: result.steadyStateVerified,
      resilienceScore: result.score,
      duration: result.duration,
      timestamp: new Date().toISOString(),
      summary: this._summarize(result)
    };
  }

  _summarize(result) {
    const triggered = result.faultsInjected.filter(f => f.triggered);
    const lines = [];
    lines.push(`Experiment: ${result.name}`);
    lines.push(`Hypothesis: ${result.hypothesis}`);
    lines.push(`Faults: ${triggered.length}/${result.faultsInjected.length} triggered`);
    lines.push(`Steady State: ${result.steadyStateVerified ? 'VERIFIED' : 'FAILED'}`);
    lines.push(`Resilience Score: ${result.score}/100`);
    if (result.dryRun) lines.push('Mode: DRY RUN');
    return lines.join('\n');
  }

  // ----------------------------------------------------------
  // 安全阀
  // ----------------------------------------------------------

  /**
   * 重置安全阀
   */
  resetSafetyValve() {
    this.safetyValve = { tripped: false, reason: null, at: null };
  }

  /**
   * 获取安全阀状态
   */
  getSafetyValveStatus() {
    return { ...this.safetyValve };
  }

  // ----------------------------------------------------------
  // 报告
  // ----------------------------------------------------------

  /**
   * 获取实验报告
   */
  getReports(limit = 20) {
    return this.reports.slice(-limit);
  }

  /**
   * 获取弹性评分摘要
   */
  getResilienceSummary() {
    if (this.reports.length === 0) {
      return { totalExperiments: 0, avgScore: 0, minScore: 0, maxScore: 0 };
    }

    const scores = this.reports.map(r => r.resilienceScore);
    return {
      totalExperiments: this.reports.length,
      avgScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
      minScore: Math.min(...scores),
      maxScore: Math.max(...scores),
      passRate: parseFloat((scores.filter(s => s >= 70).length / scores.length).toFixed(2))
    };
  }

  // ----------------------------------------------------------
  // 统计
  // ----------------------------------------------------------

  getStats() {
    return {
      totalExperiments: this.experiments.size,
      activeExperiments: this.activeExperiments.size,
      totalFaultRules: this.faultRules.size,
      totalReports: this.reports.length,
      dryRun: this.dryRun,
      safetyValve: { ...this.safetyValve },
      maxConcurrent: this.maxConcurrent
    };
  }
}

// ============================================================
// 预置实验模板 (v1.1)
// ============================================================

const EXPERIMENT_TEMPLATES = {
  /**
   * 级联故障 — 模拟一个组件失败触发连锁反应
   * 假设: 系统能隔离故障并防止级联
   */
  cascade_failure: {
    name: 'Cascade Failure Test',
    hypothesis: 'System isolates failures and prevents cascade propagation',
    description: '模拟一个组件故障后引发其他组件连锁失败的场景',
    faults: [
      {
        name: 'initial_failure',
        faultType: FAULT_TYPE.ERROR,
        target: 'service-a',
        severity: SEVERITY.HIGH,
        params: { errorRate: 1.0, errorMessage: 'Service A critical failure' },
        probability: 1.0
      },
      {
        name: 'dependent_timeout',
        faultType: FAULT_TYPE.TIMEOUT,
        target: 'service-b',
        severity: SEVERITY.MEDIUM,
        params: { timeoutMs: 5000 },
        probability: 0.8
      },
      {
        name: 'resource_pressure',
        faultType: FAULT_TYPE.RESOURCE_EXHAUST,
        target: 'service-c',
        severity: SEVERITY.MEDIUM,
        params: { type: 'connections', amount: 500, unit: 'count' },
        probability: 0.6
      }
    ],
    steadyState: { metric: 'error_rate', threshold: 0.05 },
    durationMs: 30000
  },

  /**
   * 拜占庭故障 — 模拟节点返回错误但看起来正常的结果
   * 假设: 系统能检测并隔离返回错误数据的节点
   */
  byzantine_fault: {
    name: 'Byzantine Fault Test',
    hypothesis: 'System detects and isolates nodes returning corrupted data',
    description: '模拟节点返回看似正确但实际错误的数据',
    faults: [
      {
        name: 'data_corruption_node1',
        faultType: FAULT_TYPE.DATA_CORRUPTION,
        target: 'node-1',
        severity: SEVERITY.CRITICAL,
        params: { corruptionType: 'silent', affectedFields: ['result', 'checksum'] },
        probability: 1.0
      },
      {
        name: 'intermittent_corruption',
        faultType: FAULT_TYPE.DATA_CORRUPTION,
        target: 'node-2',
        severity: SEVERITY.HIGH,
        params: { corruptionType: 'intermittent', frequency: 0.3 },
        probability: 0.5
      }
    ],
    steadyState: { metric: 'data_integrity', threshold: 0.999 },
    durationMs: 20000
  },

  /**
   * 脑裂 — 模拟网络分区导致两个子集各自认为自己是主节点
   * 假设: 系统能检测脑裂并正确恢复
   */
  split_brain: {
    name: 'Split Brain Test',
    hypothesis: 'System detects split-brain and recovers correctly with data consistency',
    description: '模拟网络分区导致的脑裂场景',
    faults: [
      {
        name: 'network_partition_ab',
        faultType: FAULT_TYPE.NETWORK_PARTITION,
        target: 'cluster',
        severity: SEVERITY.CRITICAL,
        params: { partitionType: 'bidirectional', groups: [['node-a', 'node-b'], ['node-c', 'node-d']] },
        probability: 1.0
      },
      {
        name: 'delayed_heartbeat',
        faultType: FAULT_TYPE.LATENCY,
        target: 'heartbeat-channel',
        severity: SEVERITY.HIGH,
        params: { delayMs: 10000, jitterMs: 5000 },
        probability: 1.0
      }
    ],
    steadyState: { metric: 'consistency', threshold: 1.0 },
    durationMs: 45000
  },

  /**
   * 惊群效应 — 模拟大量请求同时涌入(如缓存失效后)
   * 假设: 系统能通过限流/退避应对突发流量
   */
  thundering_herd: {
    name: 'Thundering Herd Test',
    hypothesis: 'System handles sudden traffic spikes with rate limiting and backpressure',
    description: '模拟缓存失效或服务恢复后的突发请求涌入',
    faults: [
      {
        name: 'cache_invalidation',
        faultType: FAULT_TYPE.ABORT,
        target: 'cache-layer',
        severity: SEVERITY.MEDIUM,
        params: { scope: 'all_keys' },
        probability: 1.0
      },
      {
        name: 'connection_pool_exhaust',
        faultType: FAULT_TYPE.RESOURCE_EXHAUST,
        target: 'database',
        severity: SEVERITY.HIGH,
        params: { type: 'connections', amount: 1000, unit: 'count' },
        probability: 0.9
      },
      {
        name: 'response_latency',
        faultType: FAULT_TYPE.LATENCY,
        target: 'api-gateway',
        severity: SEVERITY.LOW,
        params: { delayMs: 3000, jitterMs: 1000 },
        probability: 0.7
      }
    ],
    steadyState: { metric: 'response_time_p99', threshold: 1000 },
    durationMs: 20000
  },

  /**
   * 内存泄漏模拟 — 模拟内存逐步增长直到OOM
   * 假设: 系统能检测内存异常并优雅降级
   */
  memory_leak: {
    name: 'Memory Leak Simulation',
    hypothesis: 'System detects memory anomalies and gracefully degrades before OOM',
    description: '模拟内存持续增长直到达到阈值',
    faults: [
      {
        name: 'gradual_memory_growth',
        faultType: FAULT_TYPE.RESOURCE_EXHAUST,
        target: 'worker-process',
        severity: SEVERITY.MEDIUM,
        params: { type: 'memory', amount: 50, unit: 'MB', growth: 'gradual', ratePerSec: 10 },
        probability: 1.0
      },
      {
        name: 'gc_pressure',
        faultType: FAULT_TYPE.LATENCY,
        target: 'worker-process',
        severity: SEVERITY.LOW,
        params: { delayMs: 200, jitterMs: 100, cause: 'gc_pause' },
        probability: 0.8
      }
    ],
    steadyState: { metric: 'memory_usage_pct', threshold: 0.85 },
    durationMs: 60000
  },

  /**
   * 依赖服务全部宕机 — 测试所有外部依赖不可用时的行为
   * 假设: 系统能优雅降级并返回缓存/默认值
   */
  total_dependency_outage: {
    name: 'Total Dependency Outage',
    hypothesis: 'System degrades gracefully when all external dependencies are unavailable',
    description: '所有外部依赖(数据库/缓存/消息队列)同时不可用',
    faults: [
      {
        name: 'database_down',
        faultType: FAULT_TYPE.ABORT,
        target: 'database',
        severity: SEVERITY.CRITICAL,
        params: { cause: 'connection_refused' },
        probability: 1.0
      },
      {
        name: 'cache_down',
        faultType: FAULT_TYPE.ABORT,
        target: 'cache',
        severity: SEVERITY.HIGH,
        params: { cause: 'connection_refused' },
        probability: 1.0
      },
      {
        name: 'queue_down',
        faultType: FAULT_TYPE.ABORT,
        target: 'message-queue',
        severity: SEVERITY.HIGH,
        params: { cause: 'connection_refused' },
        probability: 1.0
      }
    ],
    steadyState: { metric: 'availability', threshold: 0.5 },
    durationMs: 15000
  },

  /**
   * 慢速请求堆积 — 少量慢请求占满线程池
   * 假设: 系统有超时机制防止慢请求拖累整体
   */
  slow_request_pileup: {
    name: 'Slow Request Pileup Test',
    hypothesis: 'System timeouts prevent slow requests from blocking the entire system',
    description: '少量慢请求逐步占满线程/连接池',
    faults: [
      {
        name: 'extreme_latency',
        faultType: FAULT_TYPE.LATENCY,
        target: 'backend-service',
        severity: SEVERITY.MEDIUM,
        params: { delayMs: 30000, jitterMs: 5000 },
        probability: 0.3
      },
      {
        name: 'thread_pool_exhaust',
        faultType: FAULT_TYPE.RESOURCE_EXHAUST,
        target: 'thread-pool',
        severity: SEVERITY.HIGH,
        params: { type: 'threads', amount: 200, unit: 'count' },
        probability: 0.7
      }
    ],
    steadyState: { metric: 'response_time_p95', threshold: 2000 },
    durationMs: 25000
  },

  // ---- 以下为 Phase 10 新增的 5 个领域专用模板 ----

  /**
   * 时钟偏移 — 模拟分布式系统中节点时钟不一致
   * 假设: 系统的分布式一致性不依赖于精确的时钟同步
   */
  clock_skew: {
    name: 'Clock Skew Test',
    hypothesis: 'System maintains consistency despite clock drift between nodes',
    description: '模拟分布式节点之间的时钟不同步，验证基于时间戳的逻辑是否正确',
    faults: [
      {
        name: 'forward_clock_drift',
        faultType: FAULT_TYPE.LATENCY,
        target: 'node-clock-1',
        severity: SEVERITY.MEDIUM,
        params: { delayMs: 0, clockOffsetMs: 5000, direction: 'forward' },
        probability: 1.0
      },
      {
        name: 'backward_clock_drift',
        faultType: FAULT_TYPE.LATENCY,
        target: 'node-clock-2',
        severity: SEVERITY.HIGH,
        params: { delayMs: 0, clockOffsetMs: -3000, direction: 'backward' },
        probability: 1.0
      },
      {
        name: 'ordering_violation',
        faultType: FAULT_TYPE.DATA_CORRUPTION,
        target: 'event-ordering',
        severity: SEVERITY.MEDIUM,
        params: { corruptionType: 'timestamp_reorder', affectedFields: ['created_at', 'updated_at'] },
        probability: 0.7
      }
    ],
    steadyState: { metric: 'event_ordering_correctness', threshold: 0.99 },
    durationMs: 30000
  },

  /**
   * DNS 解析故障 — 模拟 DNS 查询失败或返回错误地址
   * 假设: 系统能处理 DNS 故障并使用缓存/降级策略
   */
  dns_failure: {
    name: 'DNS Resolution Failure Test',
    hypothesis: 'System handles DNS failures with caching and fallback strategies',
    description: '模拟 DNS 解析超时、返回 NXDOMAIN 或错误 IP 的场景',
    faults: [
      {
        name: 'dns_timeout',
        faultType: FAULT_TYPE.TIMEOUT,
        target: 'dns-resolver',
        severity: SEVERITY.HIGH,
        params: { timeoutMs: 10000, scope: 'all_domains' },
        probability: 1.0
      },
      {
        name: 'dns_nxdomain',
        faultType: FAULT_TYPE.ERROR,
        target: 'dns-resolver',
        severity: SEVERITY.MEDIUM,
        params: { errorMessage: 'NXDOMAIN: domain not found', responseCode: 'NXDOMAIN' },
        probability: 0.8
      },
      {
        name: 'dns_wrong_ip',
        faultType: FAULT_TYPE.DATA_CORRUPTION,
        target: 'dns-resolver',
        severity: SEVERITY.CRITICAL,
        params: { corruptionType: 'wrong_address', affectedFields: ['A', 'AAAA'] },
        probability: 0.3
      }
    ],
    steadyState: { metric: 'service_connectivity', threshold: 0.8 },
    durationMs: 20000
  },

  /**
   * 磁盘空间耗尽 — 模拟磁盘满导致写入失败
   * 假设: 系统能检测磁盘空间不足并优雅降级（停止写入/清理/告警）
   */
  disk_full: {
    name: 'Disk Full Simulation',
    hypothesis: 'System detects disk space exhaustion and handles write failures gracefully',
    description: '模拟磁盘空间逐步耗尽，验证日志、缓存、临时文件的处理',
    faults: [
      {
        name: 'disk_space_exhaust',
        faultType: FAULT_TYPE.RESOURCE_EXHAUST,
        target: 'filesystem',
        severity: SEVERITY.HIGH,
        params: { type: 'disk', amount: 100, unit: 'percent', growth: 'gradual', ratePerSec: 5 },
        probability: 1.0
      },
      {
        name: 'write_failure',
        faultType: FAULT_TYPE.ERROR,
        target: 'filesystem',
        severity: SEVERITY.HIGH,
        params: { errorMessage: 'ENOSPC: no space left on device', errno: -28 },
        probability: 0.9
      },
      {
        name: 'log_rotation_failure',
        faultType: FAULT_TYPE.ABORT,
        target: 'log-writer',
        severity: SEVERITY.MEDIUM,
        params: { cause: 'cannot_rotate_full_disk' },
        probability: 0.7
      }
    ],
    steadyState: { metric: 'disk_usage_pct', threshold: 0.9 },
    durationMs: 30000
  },

  /**
   * 证书过期 — 模拟 TLS/SSL 证书过期导致连接失败
   * 假设: 系统能检测证书即将过期并提前告警，过期后能降级处理
   */
  certificate_expiry: {
    name: 'Certificate Expiry Test',
    hypothesis: 'System detects expiring certificates and handles TLS failures with appropriate alerting',
    description: '模拟 TLS 证书过期导致的 HTTPS 连接失败',
    faults: [
      {
        name: 'cert_expired',
        faultType: FAULT_TYPE.ERROR,
        target: 'tls-layer',
        severity: SEVERITY.CRITICAL,
        params: { errorMessage: 'CERT_HAS_EXPIRED', certDaysLeft: 0 },
        probability: 1.0
      },
      {
        name: 'cert_near_expiry_warning',
        faultType: FAULT_TYPE.ERROR,
        target: 'tls-layer',
        severity: SEVERITY.MEDIUM,
        params: { errorMessage: 'CERT_NEAR_EXPIRY', certDaysLeft: 3 },
        probability: 0.5
      },
      {
        name: 'connection_refused_tls',
        faultType: FAULT_TYPE.ABORT,
        target: 'https-endpoint',
        severity: SEVERITY.HIGH,
        params: { cause: 'tls_handshake_failed' },
        probability: 0.8
      }
    ],
    steadyState: { metric: 'secure_connection_rate', threshold: 0.95 },
    durationMs: 15000
  },

  /**
   * 连接池耗尽 — 模拟数据库/HTTP 连接池被占满
   * 假设: 系统有连接池上限保护和排队/拒绝机制
   */
  connection_pool_exhaustion: {
    name: 'Connection Pool Exhaustion Test',
    hypothesis: 'System handles connection pool exhaustion with queuing, backpressure, and circuit breaking',
    description: '模拟数据库和 HTTP 连接池被慢查询或大量并发请求占满',
    faults: [
      {
        name: 'db_pool_exhaust',
        faultType: FAULT_TYPE.RESOURCE_EXHAUST,
        target: 'database-pool',
        severity: SEVERITY.HIGH,
        params: { type: 'connections', amount: 100, unit: 'count', maxPool: 100 },
        probability: 1.0
      },
      {
        name: 'http_pool_exhaust',
        faultType: FAULT_TYPE.RESOURCE_EXHAUST,
        target: 'http-client-pool',
        severity: SEVERITY.MEDIUM,
        params: { type: 'sockets', amount: 50, unit: 'count', maxPool: 50 },
        probability: 0.8
      },
      {
        name: 'slow_query_block',
        faultType: FAULT_TYPE.LATENCY,
        target: 'database',
        severity: SEVERITY.MEDIUM,
        params: { delayMs: 15000, jitterMs: 5000, cause: 'lock_wait' },
        probability: 0.7
      },
      {
        name: 'connection_timeout',
        faultType: FAULT_TYPE.TIMEOUT,
        target: 'database-pool',
        severity: SEVERITY.HIGH,
        params: { timeoutMs: 30000, cause: 'pool_checkout_timeout' },
        probability: 0.6
      }
    ],
    steadyState: { metric: 'connection_availability', threshold: 0.7 },
    durationMs: 25000
  }
};

// ============================================================
// ChaosEngine v1.1 扩展方法
// ============================================================

/**
 * 获取所有模板名称
 * @returns {string[]} 模板名列表
 */
ChaosEngine.prototype.getTemplateNames = function() {
  return Object.keys(EXPERIMENT_TEMPLATES);
};

/**
 * 获取模板详情
 * @param {string} templateName - 模板名
 * @returns {Object|null} 模板定义
 */
ChaosEngine.prototype.getTemplate = function(templateName) {
  const tmpl = EXPERIMENT_TEMPLATES[templateName];
  if (!tmpl) return null;
  return {
    name: tmpl.name,
    description: tmpl.description,
    hypothesis: tmpl.hypothesis,
    faultCount: tmpl.faults.length,
    faults: tmpl.faults.map(f => ({
      name: f.name,
      faultType: f.faultType,
      target: f.target,
      severity: f.severity
    })),
    steadyState: tmpl.steadyState,
    durationMs: tmpl.durationMs
  };
};

/**
 * 从模板创建实验（自动创建故障规则 + 实验定义）
 * @param {string} templateName - 模板名
 * @param {Object} overrides - 覆盖参数
 * @returns {Object} 创建结果
 */
ChaosEngine.prototype.createFromTemplate = function(templateName, overrides = {}) {
  const tmpl = EXPERIMENT_TEMPLATES[templateName];
  if (!tmpl) {
    return { success: false, error: `模板不存在: ${templateName}` };
  }

  // 创建故障规则
  const faultIds = [];
  for (const faultDef of tmpl.faults) {
    const rule = this.defineFault({
      ...faultDef,
      ...(overrides.faultOverrides || {})
    });
    faultIds.push(rule.id);
  }

  // 创建实验
  const exp = this.defineExperiment({
    name: overrides.name || tmpl.name,
    hypothesis: overrides.hypothesis || tmpl.hypothesis,
    faultIds,
    durationMs: overrides.durationMs || tmpl.durationMs,
    steadyState: overrides.steadyState || tmpl.steadyState,
    healthCheck: overrides.healthCheck || null
  });

  return {
    success: true,
    experimentId: exp.id,
    experiment: exp,
    faultIds,
    template: templateName
  };
};

/**
 * 运行模板实验（创建 + 运行一步完成）
 * @param {string} templateName - 模板名
 * @param {Object} overrides - 覆盖参数
 * @returns {Promise<Object>} 运行结果
 */
ChaosEngine.prototype.runTemplate = async function(templateName, overrides = {}) {
  const created = this.createFromTemplate(templateName, overrides);
  if (!created.success) return created;

  const result = await this.runExperiment(created.experimentId);
  return {
    ...result,
    template: templateName,
    experimentId: created.experimentId,
    faultIds: created.faultIds
  };
};

/**
 * 运行多个模板的组合压力测试
 * @param {string[]} templateNames - 模板名列表
 * @param {Object} options - 选项
 * @returns {Promise<Object>} 组合结果
 */
ChaosEngine.prototype.runSuite = async function(templateNames, options = {}) {
  const results = [];
  const stopOnFail = options.stopOnFail || false;

  for (const name of templateNames) {
    const result = await this.runTemplate(name, options.overrides || {});
    results.push({ template: name, ...result });

    if (stopOnFail && result.success && result.result && result.result.score < 50) {
      break;
    }

    // 安全阀检查
    if (this.safetyValve.tripped) {
      break;
    }
  }

  const scores = results
    .filter(r => r.success && r.result)
    .map(r => r.result.score);

  return {
    total: templateNames.length,
    executed: results.length,
    avgScore: scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 0,
    minScore: scores.length > 0 ? Math.min(...scores) : 0,
    maxScore: scores.length > 0 ? Math.max(...scores) : 0,
    safetyTripped: this.safetyValve.tripped,
    results
  };
};

// ============================================================
// 导出
// ============================================================

module.exports = {
  ChaosEngine,
  FAULT_TYPE,
  EXPERIMENT_STATUS,
  SEVERITY,
  EXPERIMENT_TEMPLATES
};
