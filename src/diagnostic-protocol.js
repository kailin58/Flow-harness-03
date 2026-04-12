/**
 * diagnostic-protocol.js - 问题诊断协议 + SEV 分级 + 3级熔断
 *
 * 文档要求(Ch8, Ch13):
 *   - Q1-Q4 决策树: 系统化问题诊断
 *   - SEV 分级: SEV1(紧急)/SEV2(重要)/SEV3(一般)/SEV4(低)
 *   - 3级熔断: L1(降速) / L2(降级) / L3(停机)
 *   - 事故响应: 检测→分级→处置→恢复→复盘
 *
 * @version 1.0.0
 * @date 2026-04-13
 */

const { createLogger } = require('./logger');

// ============================================================
// SEV 分级
// ============================================================

const SEV_LEVELS = {
  SEV1: { level: 1, name: '紧急', responseTime: '5分钟', description: '核心功能完全不可用，数据丢失风险' },
  SEV2: { level: 2, name: '重要', responseTime: '15分钟', description: '核心功能部分受损，有降级方案' },
  SEV3: { level: 3, name: '一般', responseTime: '1小时', description: '非核心功能异常，不影响主流程' },
  SEV4: { level: 4, name: '低', responseTime: '24小时', description: '优化建议或小问题' }
};

// ============================================================
// 熔断级别
// ============================================================

const CIRCUIT_BREAKER_LEVELS = {
  L1_THROTTLE: { level: 1, name: '降速', action: '减少并发，增加延迟' },
  L2_DEGRADE: { level: 2, name: '降级', action: '禁用非核心功能，使用备用方案' },
  L3_HALT: { level: 3, name: '停机', action: '停止所有操作，等待人工介入' }
};

// ============================================================
// DiagnosticProtocol
// ============================================================

class DiagnosticProtocol {
  /**
   * @param {Object} options
   * @param {Object} options.knowledgeBase   - KnowledgeBase 实例
   * @param {Object} options.memoryStore     - MemoryStore 实例
   * @param {Object} options.circuitBreaker  - 熔断配置
   */
  constructor(options = {}) {
    this.logger = options.logger || createLogger({ name: 'diagnostic-protocol' });
    this.knowledgeBase = options.knowledgeBase || null;
    this.memoryStore = options.memoryStore || null;

    // 熔断器状态
    this.circuitBreaker = {
      level: 0,        // 0=正常, 1=降速, 2=降级, 3=停机
      failureCount: 0,
      consecutiveFailures: 0,
      lastFailureTime: null,
      thresholds: {
        l1: options.circuitBreaker?.l1Threshold || 3,   // 连续3次失败 → L1
        l2: options.circuitBreaker?.l2Threshold || 5,   // 连续5次失败 → L2
        l3: options.circuitBreaker?.l3Threshold || 8,   // 连续8次失败 → L3
        resetTimeout: options.circuitBreaker?.resetTimeout || 60000 // 60秒无失败后重置
      }
    };

    // 事故记录
    this.incidentLog = [];
    this.diagnosticHistory = [];
  }

  // ----------------------------------------------------------
  // Q1-Q4 决策树
  // ----------------------------------------------------------

  /**
   * 执行完整的 Q1-Q4 问题诊断
   * @param {Object} problem - 问题数据
   * @param {string} problem.error        - 错误信息
   * @param {string} problem.taskType     - 任务类型
   * @param {Object} problem.execution    - 执行数据
   * @param {Object} problem.inspection   - 检查数据
   * @param {Object} problem.context      - 上下文
   * @returns {Object} 诊断结果
   */
  diagnose(problem) {
    this.logger.info({ error: problem.error, taskType: problem.taskType }, 'Starting Q1-Q4 diagnosis');

    const result = {
      timestamp: new Date().toISOString(),
      problem: problem.error || 'unknown',
      diagnosis: {},
      sev: null,
      action: null,
      circuitBreaker: null
    };

    // Q1: 是否见过这个问题？→ 查历史
    const q1 = this._q1_knownIssue(problem);
    result.diagnosis.q1 = q1;

    if (q1.found) {
      this.logger.info({ pattern: q1.pattern }, 'Q1: Known issue found');
      result.action = q1.suggestedAction;
      result.sev = q1.sev;
    } else {
      // Q2: 是工具问题还是方法问题？
      const q2 = this._q2_toolOrMethod(problem);
      result.diagnosis.q2 = q2;

      if (q2.category === 'tool') {
        // Q3: 工具问题 → 是否有替代工具？
        const q3 = this._q3_alternativeTool(problem, q2);
        result.diagnosis.q3 = q3;
        result.action = q3.action;
        result.sev = q3.sev;
      } else {
        // Q4: 方法问题 → 是否需要换策略？
        const q4 = this._q4_strategyChange(problem, q2);
        result.diagnosis.q4 = q4;
        result.action = q4.action;
        result.sev = q4.sev;
      }
    }

    // 综合 SEV 评估 — 取影响评估和诊断 SEV 中更严重的
    const assessedSev = this._assessSeverity(problem);
    if (!result.sev || assessedSev.level < result.sev.level) {
      result.sev = assessedSev;
    }

    // 更新熔断器
    result.circuitBreaker = this._updateCircuitBreaker(problem, result.sev);

    // 记录诊断历史
    this.diagnosticHistory.push(result);
    if (this.diagnosticHistory.length > 100) {
      this.diagnosticHistory = this.diagnosticHistory.slice(-100);
    }

    this.logger.info({
      sev: result.sev.level,
      action: result.action?.type,
      circuitLevel: result.circuitBreaker.level
    }, 'Diagnosis complete');

    return result;
  }

  /**
   * Q1: 是否见过这个问题？
   * 查询知识库和历史诊断记录
   */
  _q1_knownIssue(problem) {
    const result = { found: false, pattern: null, suggestedAction: null, sev: null };

    // 查询历史诊断
    const errorKey = (problem.error || '').toLowerCase();
    const errorWords = errorKey.split(/\s+/).filter(w => w.length > 2);
    const historicalMatch = this.diagnosticHistory.find(d => {
      if (!d.problem) return false;
      const prev = d.problem.toLowerCase();
      // 至少有 50% 的关键词匹配
      if (errorWords.length === 0) return false;
      const matched = errorWords.filter(w => prev.includes(w)).length;
      return matched / errorWords.length >= 0.5;
    });

    if (historicalMatch) {
      result.found = true;
      result.pattern = 'historical_match';
      result.suggestedAction = historicalMatch.action;
      result.sev = historicalMatch.sev;
      return result;
    }

    // 查询知识库
    if (this.knowledgeBase) {
      try {
        this.knowledgeBase.load();
        const patterns = this.knowledgeBase.patterns;
        if (patterns && patterns.failure_patterns) {
          for (const p of patterns.failure_patterns) {
            if (p.error && errorKey.includes(p.error.toLowerCase())) {
              result.found = true;
              result.pattern = p.pattern || 'kb_match';
              result.suggestedAction = { type: 'known_fix', description: p.suggestion || '使用历史方案' };
              result.sev = SEV_LEVELS.SEV3; // 已知问题通常不紧急
              return result;
            }
          }
        }
      } catch (e) {
        // 知识库不可用
      }
    }

    return result;
  }

  /**
   * Q2: 是工具问题还是方法问题？
   * 分析错误类型判断根因类别
   */
  _q2_toolOrMethod(problem) {
    const error = (problem.error || '').toLowerCase();

    // 工具类错误特征
    const toolPatterns = [
      { pattern: /timeout|超时/, category: 'tool', subcategory: 'timeout' },
      { pattern: /权限|permission|denied|forbidden/, category: 'tool', subcategory: 'permission' },
      { pattern: /资源|resource|memory|disk/, category: 'tool', subcategory: 'resource' },
      { pattern: /连接|connection|network|econnrefused/, category: 'tool', subcategory: 'network' },
      { pattern: /not found|找不到|enoent/, category: 'tool', subcategory: 'not_found' },
      { pattern: /busy|lock|concurrent/, category: 'tool', subcategory: 'contention' }
    ];

    // 方法类错误特征
    const methodPatterns = [
      { pattern: /不支持|unsupported|not supported/, category: 'method', subcategory: 'unsupported' },
      { pattern: /不兼容|incompatible|version/, category: 'method', subcategory: 'incompatible' },
      { pattern: /配置|config|invalid/, category: 'method', subcategory: 'config' },
      { pattern: /逻辑|logic|assertion/, category: 'method', subcategory: 'logic' },
      { pattern: /语法|syntax|parse error/, category: 'method', subcategory: 'syntax' },
      { pattern: /设计|design|architecture/, category: 'method', subcategory: 'design' }
    ];

    for (const { pattern, category, subcategory } of toolPatterns) {
      if (pattern.test(error)) {
        return { category, subcategory, confidence: 0.8, reason: `错误匹配工具模式: ${subcategory}` };
      }
    }

    for (const { pattern, category, subcategory } of methodPatterns) {
      if (pattern.test(error)) {
        return { category, subcategory, confidence: 0.8, reason: `错误匹配方法模式: ${subcategory}` };
      }
    }

    // 检查失败任务模式
    const failedTasks = problem.inspection?.failedTasks || [];
    const retryable = failedTasks.filter(t => t.retryable).length;
    const total = failedTasks.length || 1;

    if (retryable / total > 0.5) {
      return { category: 'tool', subcategory: 'transient', confidence: 0.6, reason: '多数失败可重试，可能是工具暂时问题' };
    }

    return { category: 'method', subcategory: 'unknown', confidence: 0.4, reason: '无法确定，默认为方法问题' };
  }

  /**
   * Q3: 工具问题 → 是否有替代工具？
   */
  _q3_alternativeTool(problem, q2) {
    const subcategory = q2.subcategory;

    switch (subcategory) {
      case 'timeout':
        return {
          action: { type: 'retry_with_config', description: '增加超时时间后重试', config: { timeoutMultiplier: 2 } },
          sev: SEV_LEVELS.SEV3,
          hasAlternative: true
        };

      case 'permission':
        return {
          action: { type: 'escalate', description: '权限不足，需要提升权限或切换执行者' },
          sev: SEV_LEVELS.SEV2,
          hasAlternative: false,
          needsHuman: true
        };

      case 'resource':
        return {
          action: { type: 'degrade', description: '资源不足，降级执行（减少并发/范围）' },
          sev: SEV_LEVELS.SEV2,
          hasAlternative: true
        };

      case 'network':
        return {
          action: { type: 'retry_with_backoff', description: '网络问题，指数退避重试', config: { maxRetries: 3 } },
          sev: SEV_LEVELS.SEV3,
          hasAlternative: true
        };

      case 'not_found':
        return {
          action: { type: 'verify_and_retry', description: '目标不存在，验证路径/配置后重试' },
          sev: SEV_LEVELS.SEV3,
          hasAlternative: false
        };

      case 'contention':
        return {
          action: { type: 'wait_and_retry', description: '资源竞争，等待后重试', config: { waitMs: 5000 } },
          sev: SEV_LEVELS.SEV4,
          hasAlternative: true
        };

      default:
        return {
          action: { type: 'switch_tool', description: '尝试替代工具' },
          sev: SEV_LEVELS.SEV3,
          hasAlternative: false
        };
    }
  }

  /**
   * Q4: 方法问题 → 是否需要换策略？
   */
  _q4_strategyChange(problem, q2) {
    const subcategory = q2.subcategory;

    switch (subcategory) {
      case 'unsupported':
      case 'incompatible':
        return {
          action: { type: 'change_approach', description: '当前方法不适用，需要换策略', requiresReplan: true },
          sev: SEV_LEVELS.SEV2,
          needsReplan: true
        };

      case 'config':
        return {
          action: { type: 'fix_config', description: '配置错误，修正后重试' },
          sev: SEV_LEVELS.SEV3,
          needsReplan: false
        };

      case 'logic':
        return {
          action: { type: 'debug_and_fix', description: '逻辑错误，需要调试修复' },
          sev: SEV_LEVELS.SEV2,
          needsReplan: false
        };

      case 'syntax':
        return {
          action: { type: 'fix_and_retry', description: '语法/解析错误，修正后重试' },
          sev: SEV_LEVELS.SEV4,
          needsReplan: false
        };

      case 'design':
        return {
          action: { type: 'redesign', description: '设计层面问题，需要重新规划', requiresReplan: true },
          sev: SEV_LEVELS.SEV1,
          needsReplan: true,
          needsHuman: true
        };

      default:
        return {
          action: { type: 'escalate', description: '无法自动诊断，需要人工介入' },
          sev: SEV_LEVELS.SEV2,
          needsHuman: true
        };
    }
  }

  // ----------------------------------------------------------
  // SEV 评估
  // ----------------------------------------------------------

  /**
   * 根据问题影响评估 SEV 级别
   */
  _assessSeverity(problem) {
    const error = (problem.error || '').toLowerCase();
    const failedTasks = problem.inspection?.failedTasks || [];
    const criticalFailures = problem.inspection?.criticalFailures || 0;

    // SEV1: 关键任务失败 + 数据风险
    if (criticalFailures > 0 || error.includes('数据丢失') || error.includes('data loss')) {
      return SEV_LEVELS.SEV1;
    }

    // SEV2: 多个任务失败 + 核心功能受损
    if (failedTasks.length > 3 || error.includes('核心') || error.includes('core')) {
      return SEV_LEVELS.SEV2;
    }

    // SEV3: 部分失败但可恢复
    if (failedTasks.length > 0) {
      return SEV_LEVELS.SEV3;
    }

    // SEV4: 轻微问题
    return SEV_LEVELS.SEV4;
  }

  // ----------------------------------------------------------
  // 3级熔断器
  // ----------------------------------------------------------

  /**
   * 更新熔断器状态
   */
  _updateCircuitBreaker(problem, sev) {
    const now = Date.now();
    const cb = this.circuitBreaker;

    // 检查是否应该重置（长时间无失败）
    if (cb.lastFailureTime && (now - cb.lastFailureTime) > cb.thresholds.resetTimeout) {
      cb.consecutiveFailures = 0;
      cb.level = 0;
      this.logger.info('Circuit breaker reset (timeout elapsed)');
    }

    // 记录失败
    cb.failureCount++;
    cb.consecutiveFailures++;
    cb.lastFailureTime = now;

    // 根据 SEV 加速熔断
    const sevMultiplier = sev.level <= 2 ? 2 : 1; // SEV1/SEV2 双倍计数
    const effectiveFailures = cb.consecutiveFailures * sevMultiplier;

    // 判断熔断级别
    let newLevel = 0;
    if (effectiveFailures >= cb.thresholds.l3) {
      newLevel = 3;
    } else if (effectiveFailures >= cb.thresholds.l2) {
      newLevel = 2;
    } else if (effectiveFailures >= cb.thresholds.l1) {
      newLevel = 1;
    }

    // 级别只升不降（除非重置）
    if (newLevel > cb.level) {
      cb.level = newLevel;
      const levelInfo = Object.values(CIRCUIT_BREAKER_LEVELS).find(l => l.level === newLevel);
      this.logger.warn({
        level: newLevel,
        name: levelInfo?.name,
        consecutiveFailures: cb.consecutiveFailures,
        action: levelInfo?.action
      }, `Circuit breaker triggered: L${newLevel}`);

      // 记录事故
      this.incidentLog.push({
        timestamp: new Date().toISOString(),
        type: `circuit_breaker_l${newLevel}`,
        sev: sev,
        consecutiveFailures: cb.consecutiveFailures,
        action: levelInfo?.action
      });
    }

    return {
      level: cb.level,
      consecutiveFailures: cb.consecutiveFailures,
      totalFailures: cb.failureCount,
      action: cb.level > 0
        ? Object.values(CIRCUIT_BREAKER_LEVELS).find(l => l.level === cb.level)
        : null,
      isOpen: cb.level >= 3 // L3 = 熔断器完全打开
    };
  }

  /**
   * 记录成功（降低熔断计数）
   */
  recordSuccess() {
    this.circuitBreaker.consecutiveFailures = 0;

    // 成功时逐级恢复
    if (this.circuitBreaker.level > 0) {
      this.circuitBreaker.level = Math.max(0, this.circuitBreaker.level - 1);
      this.logger.info({ level: this.circuitBreaker.level }, 'Circuit breaker level decreased after success');
    }
  }

  /**
   * 手动重置熔断器
   */
  resetCircuitBreaker() {
    this.circuitBreaker.level = 0;
    this.circuitBreaker.consecutiveFailures = 0;
    this.circuitBreaker.lastFailureTime = null;
    this.logger.info('Circuit breaker manually reset');
  }

  /**
   * 获取熔断器状态
   */
  getCircuitBreakerStatus() {
    const cb = this.circuitBreaker;
    return {
      level: cb.level,
      levelName: cb.level > 0
        ? Object.values(CIRCUIT_BREAKER_LEVELS).find(l => l.level === cb.level)?.name || 'unknown'
        : 'normal',
      consecutiveFailures: cb.consecutiveFailures,
      totalFailures: cb.failureCount,
      isOpen: cb.level >= 3
    };
  }

  // ----------------------------------------------------------
  // 事故管理
  // ----------------------------------------------------------

  /**
   * 获取事故日志
   */
  getIncidentLog() {
    return [...this.incidentLog];
  }

  /**
   * 获取诊断历史
   */
  getDiagnosticHistory() {
    return [...this.diagnosticHistory];
  }

  /**
   * 获取诊断统计
   */
  getStats() {
    const history = this.diagnosticHistory;
    const sevCounts = { sev1: 0, sev2: 0, sev3: 0, sev4: 0 };

    for (const d of history) {
      if (d.sev) {
        const key = `sev${d.sev.level}`;
        if (sevCounts[key] !== undefined) sevCounts[key]++;
      }
    }

    return {
      totalDiagnoses: history.length,
      sevDistribution: sevCounts,
      circuitBreakerTriggered: this.incidentLog.filter(i => i.type.startsWith('circuit_breaker')).length,
      circuitBreakerStatus: this.getCircuitBreakerStatus()
    };
  }
}

// ============================================================
// 导出
// ============================================================

module.exports = {
  DiagnosticProtocol,
  SEV_LEVELS,
  CIRCUIT_BREAKER_LEVELS
};
