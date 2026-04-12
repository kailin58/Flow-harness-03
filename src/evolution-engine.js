/**
 * evolution-engine.js - 自动进化引擎 (6大能力)
 *
 * 文档要求(Ch24): 完整的自动进化闭环
 *   1. Sense  (感知) — 感知执行变化、异常、趋势
 *   2. Record (记录) — 记录关键事件到结构化知识库
 *   3. Learn  (学习) — 从历史模式中提取规则与策略
 *   4. Verify (验证) — 验证学到的策略是否有效
 *   5. Push   (推送) — 将有效策略推送到执行流程
 *   6. CrossProject (跨项目复用) — 策略可在项目间复用
 *
 * 增强功能(v1.1):
 *   - 策略兼容性检查 (项目特征匹配)
 *   - 多轮渐进验证 (verifyRounds)
 *   - 推送后反馈闭环 (效果追踪)
 *   - 策略冲突检测与解决
 *
 * @version 1.1.0
 * @date 2026-04-13
 */

const { createLogger } = require('./logger');

// ============================================================
// 常量
// ============================================================

const EVOLUTION_CAPABILITIES = {
  SENSE: 'sense',
  RECORD: 'record',
  LEARN: 'learn',
  VERIFY: 'verify',
  PUSH: 'push',
  CROSS_PROJECT: 'cross_project'
};

const STRATEGY_STATUS = {
  DRAFT: 'draft',           // 新学到的策略，未验证
  VERIFIED: 'verified',     // 验证通过
  ACTIVE: 'active',         // 已推送到执行流程
  DEPRECATED: 'deprecated', // 已过时
  FAILED: 'failed'          // 验证失败
};

const SIGNAL_TYPES = {
  PERFORMANCE: 'performance',  // 性能变化
  ERROR_RATE: 'error_rate',    // 错误率变化
  PATTERN: 'pattern',          // 模式变化
  ANOMALY: 'anomaly',          // 异常检测
  TREND: 'trend'               // 趋势变化
};

// ============================================================
// EvolutionEngine
// ============================================================

class EvolutionEngine {
  /**
   * @param {Object} options
   * @param {Object} options.knowledgeBase  - KnowledgeBase 实例
   * @param {Object} options.memoryStore   - MemoryStore 实例
   * @param {Object} options.logger        - Logger 实例
   * @param {number} options.minSamples    - 学习最低样本数 (default: 5)
   * @param {number} options.verifyRounds  - 验证轮次 (default: 3)
   * @param {number} options.confidenceThreshold - 置信度阈值 (default: 0.7)
   */
  constructor(options = {}) {
    this.logger = options.logger || createLogger({ name: 'evolution-engine' });
    this.knowledgeBase = options.knowledgeBase || null;
    this.memoryStore = options.memoryStore || null;

    // 配置
    this.config = {
      minSamples: options.minSamples || 5,
      verifyRounds: options.verifyRounds || 3,
      confidenceThreshold: options.confidenceThreshold || 0.65,
      maxStrategies: options.maxStrategies || 100,
      crossProjectEnabled: options.crossProjectEnabled !== false
    };

    // 内部状态
    this.signals = [];            // 感知到的信号
    this.eventLog = [];           // 事件记录
    this.strategies = [];         // 学到的策略
    this.verificationResults = []; // 验证结果
    this.pushLog = [];            // 推送历史
    this.feedbackLog = [];        // 反馈记录（推送后效果追踪）
    this.conflictHistory = [];    // 冲突解决历史
    this.projectProfiles = new Map(); // 跨项目档案

    // 统计
    this.stats = {
      sensed: 0,
      recorded: 0,
      learned: 0,
      verified: 0,
      pushed: 0,
      crossProjectShared: 0,
      feedbackReceived: 0,
      conflictsResolved: 0
    };
  }

  // ----------------------------------------------------------
  // 1. Sense (感知)
  // ----------------------------------------------------------

  /**
   * 感知执行数据中的信号
   * @param {Object} executionData - 执行结果数据
   * @returns {Array} 检测到的信号列表
   */
  sense(executionData) {
    const signals = [];

    // 性能信号: 执行时间异常
    const perfSignal = this._sensePerformance(executionData);
    if (perfSignal) signals.push(perfSignal);

    // 错误率信号
    const errorSignal = this._senseErrorRate(executionData);
    if (errorSignal) signals.push(errorSignal);

    // 模式信号: 重复出现的行为
    const patternSignal = this._sensePattern(executionData);
    if (patternSignal) signals.push(patternSignal);

    // 异常信号: 与历史偏差大
    const anomalySignal = this._senseAnomaly(executionData);
    if (anomalySignal) signals.push(anomalySignal);

    // 存储信号
    for (const signal of signals) {
      signal.timestamp = new Date().toISOString();
      signal.source = executionData.taskType || 'unknown';
      this.signals.push(signal);
    }

    // 限制信号历史长度
    if (this.signals.length > 500) {
      this.signals = this.signals.slice(-500);
    }

    this.stats.sensed += signals.length;
    if (signals.length > 0) {
      this.logger.info({ count: signals.length, types: signals.map(s => s.type) }, 'Signals sensed');
    }

    return signals;
  }

  _sensePerformance(data) {
    const execTime = data.executionTime || data.execution_time;
    if (!execTime) return null;

    // 对比历史平均
    const history = this.eventLog.filter(e => e.taskType === data.taskType && e.executionTime);
    if (history.length < 3) return null;

    const avgTime = history.reduce((s, e) => s + e.executionTime, 0) / history.length;
    const ratio = execTime / avgTime;

    if (ratio > 2.0) {
      return { type: SIGNAL_TYPES.PERFORMANCE, severity: 'warning', message: `执行时间是平均值的${ratio.toFixed(1)}倍`, data: { execTime, avgTime, ratio } };
    }
    if (ratio < 0.3) {
      return { type: SIGNAL_TYPES.PERFORMANCE, severity: 'info', message: `执行时间显著缩短(${ratio.toFixed(1)}x)`, data: { execTime, avgTime, ratio } };
    }
    return null;
  }

  _senseErrorRate(data) {
    const recentEvents = this.eventLog.slice(-20);
    if (recentEvents.length < 5) return null;

    const failures = recentEvents.filter(e => !e.success).length;
    const rate = failures / recentEvents.length;

    if (rate > 0.5) {
      return { type: SIGNAL_TYPES.ERROR_RATE, severity: 'critical', message: `近期错误率过高: ${(rate * 100).toFixed(0)}%`, data: { rate, failures, total: recentEvents.length } };
    }
    if (rate > 0.3) {
      return { type: SIGNAL_TYPES.ERROR_RATE, severity: 'warning', message: `错误率上升: ${(rate * 100).toFixed(0)}%`, data: { rate, failures, total: recentEvents.length } };
    }
    return null;
  }

  _sensePattern(data) {
    // 检测重复失败模式
    if (!data.error) return null;

    const errorKey = data.error.toLowerCase().substring(0, 50);
    const sameErrors = this.eventLog.filter(e =>
      e.error && e.error.toLowerCase().substring(0, 50) === errorKey
    );

    if (sameErrors.length >= 3) {
      return { type: SIGNAL_TYPES.PATTERN, severity: 'warning', message: `重复错误模式(${sameErrors.length}次): ${errorKey}`, data: { pattern: errorKey, count: sameErrors.length } };
    }
    return null;
  }

  _senseAnomaly(data) {
    // 检测任务类型的异常完成率
    const taskType = data.taskType;
    if (!taskType) return null;

    const typeEvents = this.eventLog.filter(e => e.taskType === taskType);
    if (typeEvents.length < 5) return null;

    const recentRate = typeEvents.slice(-5).filter(e => e.success).length / 5;
    const overallRate = typeEvents.filter(e => e.success).length / typeEvents.length;

    if (Math.abs(recentRate - overallRate) > 0.4) {
      return {
        type: SIGNAL_TYPES.ANOMALY,
        severity: recentRate < overallRate ? 'warning' : 'info',
        message: `${taskType}类型近期表现异常: 近期${(recentRate * 100).toFixed(0)}% vs 历史${(overallRate * 100).toFixed(0)}%`,
        data: { taskType, recentRate, overallRate }
      };
    }
    return null;
  }

  // ----------------------------------------------------------
  // 2. Record (记录)
  // ----------------------------------------------------------

  /**
   * 记录执行事件
   * @param {Object} event - 执行事件
   * @returns {Object} 记录条目
   */
  record(event) {
    const entry = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      timestamp: new Date().toISOString(),
      taskType: event.taskType || 'unknown',
      taskName: event.taskName || '',
      success: !!event.success,
      executionTime: event.executionTime || event.execution_time || 0,
      error: event.error || null,
      context: {
        strategy: event.strategy || null,
        executor: event.executor || null,
        retries: event.retries || 0
      },
      metrics: {
        subtaskCount: event.subtaskCount || 0,
        failedCount: event.failedCount || 0,
        score: event.score || null
      }
    };

    this.eventLog.push(entry);

    // 限制事件历史长度
    if (this.eventLog.length > 1000) {
      this.eventLog = this.eventLog.slice(-1000);
    }

    // 同步到记忆系统
    if (this.memoryStore) {
      try {
        this.memoryStore.store('feedback', `evolution_event_${entry.id}`, {
          type: 'evolution_event',
          success: entry.success,
          taskType: entry.taskType,
          executionTime: entry.executionTime
        }, { source: 'evolution-engine' });
      } catch (e) {
        // 记忆系统不可用不影响核心功能
      }
    }

    this.stats.recorded++;
    return entry;
  }

  // ----------------------------------------------------------
  // 3. Learn (学习)
  // ----------------------------------------------------------

  /**
   * 从历史事件中学习策略
   * @returns {Array} 新学到的策略
   */
  learn() {
    const newStrategies = [];

    // 3a: 从成功模式学习
    const successStrategies = this._learnFromSuccess();
    newStrategies.push(...successStrategies);

    // 3b: 从失败模式学习（过滤噪声后）
    const failureStrategies = this._learnFromFailure();
    const filteredFailures = this._filterSpuriousFailures(failureStrategies, successStrategies);
    newStrategies.push(...filteredFailures);

    // 3c: 从时间模式学习
    const timeStrategies = this._learnTimePatterns();
    newStrategies.push(...timeStrategies);

    // 3d: 从错误恢复模式学习
    const recoveryStrategies = this._learnRecoveryPatterns();
    newStrategies.push(...recoveryStrategies);

    // 去重: 相同 pattern 的策略只保留置信度最高的
    for (const strategy of newStrategies) {
      const existing = this.strategies.find(s =>
        s.pattern === strategy.pattern && s.status !== STRATEGY_STATUS.DEPRECATED
      );
      if (existing) {
        if (strategy.confidence > existing.confidence) {
          existing.confidence = strategy.confidence;
          existing.updatedAt = new Date().toISOString();
          existing.sampleCount = strategy.sampleCount;
        }
      } else {
        this.strategies.push(strategy);
      }
    }

    // 限制策略总数
    if (this.strategies.length > this.config.maxStrategies) {
      // 淘汰最旧且置信度最低的
      this.strategies.sort((a, b) => {
        if (a.status === STRATEGY_STATUS.ACTIVE && b.status !== STRATEGY_STATUS.ACTIVE) return -1;
        if (b.status === STRATEGY_STATUS.ACTIVE && a.status !== STRATEGY_STATUS.ACTIVE) return 1;
        return b.confidence - a.confidence;
      });
      this.strategies = this.strategies.slice(0, this.config.maxStrategies);
    }

    this.stats.learned += newStrategies.length;
    if (newStrategies.length > 0) {
      this.logger.info({ count: newStrategies.length }, 'New strategies learned');
    }

    return newStrategies;
  }

  _learnFromSuccess() {
    const strategies = [];
    const taskTypes = [...new Set(this.eventLog.map(e => e.taskType))];

    for (const taskType of taskTypes) {
      const events = this.eventLog.filter(e => e.taskType === taskType);
      if (events.length < this.config.minSamples) continue;

      const successEvents = events.filter(e => e.success);
      const successRate = successEvents.length / events.length;

      if (successRate >= 0.8) {
        // 分析成功任务的共同特征
        const avgTime = successEvents.reduce((s, e) => s + e.executionTime, 0) / successEvents.length;
        const commonStrategy = this._findMostCommon(successEvents.map(e => e.context.strategy).filter(Boolean));

        strategies.push({
          id: `str_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          pattern: `success_pattern_${taskType}`,
          type: 'task_optimization',
          description: `${taskType}类型任务成功率高(${(successRate * 100).toFixed(0)}%)，推荐使用${commonStrategy || '默认'}策略`,
          recommendation: {
            taskType,
            preferredStrategy: commonStrategy,
            expectedTime: avgTime,
            successRate
          },
          confidence: successRate,
          sampleCount: events.length,
          status: STRATEGY_STATUS.DRAFT,
          createdAt: new Date().toISOString()
        });
      }
    }

    return strategies;
  }

  _learnFromFailure() {
    const strategies = [];
    // 按错误类型分组
    const errorGroups = {};

    for (const event of this.eventLog.filter(e => !e.success && e.error)) {
      const errorKey = event.error.toLowerCase().substring(0, 60);
      if (!errorGroups[errorKey]) {
        errorGroups[errorKey] = { events: [], fixes: [] };
      }
      errorGroups[errorKey].events.push(event);
    }

    // 查看错误后是否有成功恢复
    for (const [errorKey, group] of Object.entries(errorGroups)) {
      if (group.events.length < 2) continue;

      // 检查同类型任务后续是否成功
      for (const failEvent of group.events) {
        const idx = this.eventLog.indexOf(failEvent);
        const nextSuccess = this.eventLog.slice(idx + 1, idx + 5).find(
          e => e.taskType === failEvent.taskType && e.success
        );
        if (nextSuccess) {
          group.fixes.push({
            failedStrategy: failEvent.context.strategy,
            fixedStrategy: nextSuccess.context.strategy,
            fixedTime: nextSuccess.executionTime
          });
        }
      }

      if (group.fixes.length >= 2) {
        const commonFix = this._findMostCommon(group.fixes.map(f => f.fixedStrategy).filter(Boolean));
        strategies.push({
          id: `str_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          pattern: `failure_recovery_${errorKey.replace(/\s+/g, '_').substring(0, 30)}`,
          type: 'error_recovery',
          description: `遇到"${errorKey.substring(0, 40)}"错误时，建议切换到${commonFix || '备选'}策略`,
          recommendation: {
            errorPattern: errorKey,
            suggestedStrategy: commonFix,
            successfulFixes: group.fixes.length
          },
          confidence: group.fixes.length / group.events.length,
          sampleCount: group.events.length,
          status: STRATEGY_STATUS.DRAFT,
          createdAt: new Date().toISOString()
        });
      }
    }

    return strategies;
  }

  _learnTimePatterns() {
    const strategies = [];
    const taskTypes = [...new Set(this.eventLog.map(e => e.taskType))];

    for (const taskType of taskTypes) {
      const successEvents = this.eventLog.filter(e => e.taskType === taskType && e.success && e.executionTime);
      if (successEvents.length < this.config.minSamples) continue;

      const times = successEvents.map(e => e.executionTime);
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      const stdDev = Math.sqrt(times.reduce((s, t) => s + (t - avg) ** 2, 0) / times.length);

      // 如果标准差足够小，说明时间可预测
      if (stdDev / avg < 0.3 && successEvents.length >= this.config.minSamples) {
        strategies.push({
          id: `str_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          pattern: `time_estimation_${taskType}`,
          type: 'time_estimation',
          description: `${taskType}类型任务预计耗时${avg.toFixed(0)}ms (±${stdDev.toFixed(0)}ms)`,
          recommendation: {
            taskType,
            estimatedTime: avg,
            stdDev,
            confidence: 1 - (stdDev / avg)
          },
          confidence: 1 - (stdDev / avg),
          sampleCount: successEvents.length,
          status: STRATEGY_STATUS.DRAFT,
          createdAt: new Date().toISOString()
        });
      }
    }

    return strategies;
  }

  _learnRecoveryPatterns() {
    const strategies = [];
    // 查看重试成功的模式
    const retrySuccesses = this.eventLog.filter(e => e.success && e.context.retries > 0);
    if (retrySuccesses.length < 2) return strategies;

    const avgRetries = retrySuccesses.reduce((s, e) => s + e.context.retries, 0) / retrySuccesses.length;
    const maxRetries = Math.max(...retrySuccesses.map(e => e.context.retries));

    strategies.push({
      id: `str_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      pattern: 'retry_optimization',
      type: 'reliability',
      description: `重试机制有效：平均${avgRetries.toFixed(1)}次重试后成功，建议最大重试${Math.min(maxRetries + 1, 5)}次`,
      recommendation: {
        avgRetries,
        suggestedMaxRetries: Math.min(maxRetries + 1, 5),
        successCount: retrySuccesses.length
      },
      confidence: Math.min(retrySuccesses.length / 10, 0.95),
      sampleCount: retrySuccesses.length,
      status: STRATEGY_STATUS.DRAFT,
      createdAt: new Date().toISOString()
    });

    return strategies;
  }

  /**
   * 过滤虚假失败模式（模拟执行噪声）
   * 同一个 pattern 同时出现在成功和失败列表中，且失败次数 < 5 时视为噪声
   */
  _filterSpuriousFailures(failurePatterns, successPatterns) {
    if (!failurePatterns || !successPatterns) return failurePatterns || [];

    const successSet = new Set(successPatterns.map(p => p.pattern));

    return failurePatterns.filter(fp => {
      if (successSet.has(fp.pattern) && (fp.sampleCount || fp.total_count || 0) < 5) {
        return false;
      }
      return true;
    });
  }

  _findMostCommon(arr) {
    if (arr.length === 0) return null;
    const counts = {};
    for (const item of arr) {
      counts[item] = (counts[item] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  }

  // ----------------------------------------------------------
  // 4. Verify (验证)
  // ----------------------------------------------------------

  /**
   * 验证策略的有效性
   * @param {string} strategyId - 策略 ID (可选，不传则验证所有 DRAFT)
   * @returns {Array} 验证结果
   */
  verify(strategyId) {
    const results = [];
    const toVerify = strategyId
      ? this.strategies.filter(s => s.id === strategyId)
      : this.strategies.filter(s => s.status === STRATEGY_STATUS.DRAFT);

    for (const strategy of toVerify) {
      const result = this._verifyStrategy(strategy);
      results.push(result);
      this.verificationResults.push(result);

      // 更新策略状态
      if (result.passed) {
        strategy.status = STRATEGY_STATUS.VERIFIED;
        strategy.verifiedAt = new Date().toISOString();
      } else {
        strategy.status = STRATEGY_STATUS.FAILED;
        strategy.failedAt = new Date().toISOString();
        strategy.failReason = result.reason;
      }
    }

    // 限制验证历史
    if (this.verificationResults.length > 200) {
      this.verificationResults = this.verificationResults.slice(-200);
    }

    this.stats.verified += results.length;
    return results;
  }

  _verifyStrategy(strategy) {
    const result = {
      strategyId: strategy.id,
      pattern: strategy.pattern,
      strategyType: strategy.type,
      timestamp: new Date().toISOString(),
      checks: [],
      passed: true,
      reason: null
    };

    // Check 1: 置信度阈值
    const confCheck = strategy.confidence >= this.config.confidenceThreshold;
    result.checks.push({
      name: 'confidence_threshold',
      passed: confCheck,
      detail: `置信度 ${(strategy.confidence * 100).toFixed(1)}% ${confCheck ? '>=' : '<'} ${(this.config.confidenceThreshold * 100).toFixed(1)}%`
    });

    // Check 2: 样本量充足
    const sampleCheck = strategy.sampleCount >= this.config.minSamples;
    result.checks.push({
      name: 'sample_size',
      passed: sampleCheck,
      detail: `样本数 ${strategy.sampleCount} ${sampleCheck ? '>=' : '<'} ${this.config.minSamples}`
    });

    // Check 3: 与现有活跃策略不冲突
    const conflictCheck = !this.strategies.some(s =>
      s.id !== strategy.id &&
      s.status === STRATEGY_STATUS.ACTIVE &&
      s.type === strategy.type &&
      s.recommendation?.taskType === strategy.recommendation?.taskType &&
      this._isConflicting(s, strategy)
    );
    result.checks.push({
      name: 'no_conflict',
      passed: conflictCheck,
      detail: conflictCheck ? '无冲突' : '与现有活跃策略冲突'
    });

    // Check 4: 历史验证 — 同类策略的验证通过率（按 strategyType 匹配，兼容旧记录）
    const sameTypeVerifications = this.verificationResults.filter(
      v => v.strategyType === strategy.type ||
           (v.strategyType === undefined && v.pattern === strategy.pattern)
    );
    const historyCheck = sameTypeVerifications.length < 3 ||
      sameTypeVerifications.filter(v => v.passed).length / sameTypeVerifications.length >= 0.5;
    result.checks.push({
      name: 'historical_success',
      passed: historyCheck,
      detail: `同类验证通过率${sameTypeVerifications.length > 0 ? (sameTypeVerifications.filter(v => v.passed).length / sameTypeVerifications.length * 100).toFixed(0) + '%' : 'N/A'}`
    });

    // 综合判定
    const failedChecks = result.checks.filter(c => !c.passed);
    if (failedChecks.length > 0) {
      result.passed = false;
      result.reason = failedChecks.map(c => c.detail).join('; ');
    }

    this.logger.info({
      strategyId: strategy.id,
      passed: result.passed,
      checks: result.checks.length,
      failed: failedChecks.length
    }, `Strategy verification: ${result.passed ? 'PASSED' : 'FAILED'}`);

    return result;
  }

  _isConflicting(strategyA, strategyB) {
    // 简单冲突检测: 同类型+同任务类型但推荐不同策略
    const recA = strategyA.recommendation || {};
    const recB = strategyB.recommendation || {};
    return recA.preferredStrategy &&
           recB.preferredStrategy &&
           recA.preferredStrategy !== recB.preferredStrategy;
  }

  // ----------------------------------------------------------
  // 5. Push (推送)
  // ----------------------------------------------------------

  /**
   * 将验证通过的策略推送到执行流程
   * @param {string} strategyId - 策略 ID (可选，不传则推送所有 VERIFIED)
   * @returns {Array} 推送结果
   */
  push(strategyId) {
    const results = [];
    const toPush = strategyId
      ? this.strategies.filter(s => s.id === strategyId && s.status === STRATEGY_STATUS.VERIFIED)
      : this.strategies.filter(s => s.status === STRATEGY_STATUS.VERIFIED);

    for (const strategy of toPush) {
      const pushResult = this._pushStrategy(strategy);
      results.push(pushResult);
      this.pushLog.push(pushResult);

      if (pushResult.success) {
        strategy.status = STRATEGY_STATUS.ACTIVE;
        strategy.activatedAt = new Date().toISOString();
      }
    }

    this.stats.pushed += results.filter(r => r.success).length;
    return results;
  }

  _pushStrategy(strategy) {
    const result = {
      strategyId: strategy.id,
      pattern: strategy.pattern,
      timestamp: new Date().toISOString(),
      success: false,
      target: null,
      detail: null
    };

    try {
      switch (strategy.type) {
        case 'task_optimization':
          result.target = 'task_analyzer';
          result.detail = `优化${strategy.recommendation.taskType}类型任务处理策略`;
          result.success = true;
          break;

        case 'error_recovery':
          result.target = 'diagnostic_protocol';
          result.detail = `注册错误恢复模式: ${strategy.recommendation.errorPattern?.substring(0, 30)}`;
          result.success = true;
          break;

        case 'time_estimation':
          result.target = 'task_decomposer';
          result.detail = `更新${strategy.recommendation.taskType}时间估算: ${strategy.recommendation.estimatedTime}ms`;
          result.success = true;
          break;

        case 'reliability':
          result.target = 'auto_retry';
          result.detail = `优化重试策略: 建议最大${strategy.recommendation.suggestedMaxRetries}次`;
          result.success = true;
          break;

        default:
          result.detail = `未知策略类型: ${strategy.type}`;
          result.success = false;
      }

      // 持久化到记忆系统
      if (result.success && this.memoryStore) {
        try {
          this.memoryStore.store('project', `active_strategy_${strategy.id}`, {
            type: 'active_strategy',
            strategyId: strategy.id,
            pattern: strategy.pattern,
            recommendation: strategy.recommendation,
            activatedAt: new Date().toISOString()
          }, { source: 'evolution-engine', priority: 'high' });
        } catch (e) {
          // 不影响推送
        }
      }

      this.logger.info({
        strategyId: strategy.id,
        target: result.target,
        success: result.success
      }, `Strategy pushed: ${result.detail}`);

    } catch (error) {
      result.success = false;
      result.detail = `推送失败: ${error.message}`;
      this.logger.error({ error: error.message, strategyId: strategy.id }, 'Strategy push failed');
    }

    return result;
  }

  // ----------------------------------------------------------
  // 6. CrossProject (跨项目复用)
  // ----------------------------------------------------------

  /**
   * 导出可复用策略（供其他项目导入）
   * @param {string} projectId - 当前项目标识
   * @returns {Object} 可导出的策略包
   */
  exportStrategies(projectId) {
    const exportable = this.strategies.filter(s =>
      s.status === STRATEGY_STATUS.ACTIVE && s.confidence >= this.config.confidenceThreshold
    );

    const pack = {
      projectId,
      exportedAt: new Date().toISOString(),
      version: '1.0',
      strategies: exportable.map(s => ({
        pattern: s.pattern,
        type: s.type,
        description: s.description,
        recommendation: s.recommendation,
        confidence: s.confidence,
        sampleCount: s.sampleCount,
        origin: projectId
      }))
    };

    // 记录项目档案
    this.projectProfiles.set(projectId, {
      lastExport: new Date().toISOString(),
      strategiesExported: exportable.length
    });

    this.stats.crossProjectShared += exportable.length;
    this.logger.info({ projectId, count: exportable.length }, 'Strategies exported for cross-project sharing');

    return pack;
  }

  /**
   * 导入其他项目的策略
   * @param {Object} pack - 策略包 (exportStrategies 的输出)
   * @returns {Object} 导入结果
   */
  importStrategies(pack) {
    if (!pack || !pack.strategies || !Array.isArray(pack.strategies)) {
      return { imported: 0, skipped: 0, errors: ['无效的策略包格式'] };
    }

    let imported = 0;
    let skipped = 0;

    for (const item of pack.strategies) {
      // 检查是否已存在相同 pattern
      const exists = this.strategies.some(s => s.pattern === item.pattern);
      if (exists) {
        skipped++;
        continue;
      }

      // 导入为 DRAFT 状态（需要在当前项目中重新验证）
      this.strategies.push({
        id: `str_import_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        pattern: item.pattern,
        type: item.type,
        description: `[导入自 ${item.origin || pack.projectId}] ${item.description}`,
        recommendation: item.recommendation,
        confidence: item.confidence * 0.7, // 降低置信度（需在本项目验证）
        sampleCount: 0, // 本项目还没有样本
        status: STRATEGY_STATUS.DRAFT,
        importedFrom: item.origin || pack.projectId,
        createdAt: new Date().toISOString()
      });
      imported++;
    }

    // 更新项目档案
    if (pack.projectId) {
      this.projectProfiles.set(pack.projectId, {
        ...this.projectProfiles.get(pack.projectId),
        lastImport: new Date().toISOString(),
        strategiesImported: imported
      });
    }

    this.logger.info({ imported, skipped, from: pack.projectId }, 'Strategies imported');
    return { imported, skipped, errors: [] };
  }

  // ----------------------------------------------------------
  // 6b. 策略兼容性检查
  // ----------------------------------------------------------

  /**
   * 检查策略包与目标项目的兼容性
   * @param {Object} pack - 策略包
   * @param {Object} projectConfig - 目标项目特征
   * @returns {Object} 兼容性报告
   */
  checkCompatibility(pack, projectConfig = {}) {
    if (!pack || !pack.strategies) {
      return { compatible: false, score: 0, details: [], error: '无效的策略包' };
    }

    const details = [];
    let totalScore = 0;

    for (const strategy of pack.strategies) {
      const checks = [];
      let strategyScore = 100;

      // Check 1: 类型兼容 — 目标项目是否有对应任务类型
      if (strategy.recommendation?.taskType && projectConfig.taskTypes) {
        const typeMatch = projectConfig.taskTypes.includes(strategy.recommendation.taskType);
        checks.push({
          check: 'task_type_match',
          passed: typeMatch,
          detail: typeMatch ? `任务类型 ${strategy.recommendation.taskType} 匹配` : `任务类型 ${strategy.recommendation.taskType} 不存在`
        });
        if (!typeMatch) strategyScore -= 30;
      }

      // Check 2: 置信度门槛
      const confOk = strategy.confidence >= this.config.confidenceThreshold;
      checks.push({
        check: 'confidence',
        passed: confOk,
        detail: `置信度 ${(strategy.confidence * 100).toFixed(0)}%`
      });
      if (!confOk) strategyScore -= 20;

      // Check 3: 样本量充足
      const sampleOk = strategy.sampleCount >= this.config.minSamples;
      checks.push({
        check: 'sample_size',
        passed: sampleOk,
        detail: `样本数 ${strategy.sampleCount}`
      });
      if (!sampleOk) strategyScore -= 25;

      // Check 4: 与本项目已有策略不冲突
      const conflict = this.strategies.find(s =>
        s.pattern === strategy.pattern && s.status !== STRATEGY_STATUS.DEPRECATED && s.status !== STRATEGY_STATUS.FAILED
      );
      checks.push({
        check: 'no_conflict',
        passed: !conflict,
        detail: conflict ? `与已有策略 ${conflict.id} 冲突` : '无冲突'
      });
      if (conflict) strategyScore -= 25;

      // Check 5: 项目技术栈匹配
      if (projectConfig.techStack && strategy.recommendation?.preferredStrategy) {
        const stackMatch = !projectConfig.techStack.excludeStrategies ||
          !projectConfig.techStack.excludeStrategies.includes(strategy.recommendation.preferredStrategy);
        checks.push({
          check: 'tech_stack',
          passed: stackMatch,
          detail: stackMatch ? '技术栈兼容' : '策略与技术栈不兼容'
        });
        if (!stackMatch) strategyScore -= 30;
      }

      strategyScore = Math.max(0, strategyScore);
      totalScore += strategyScore;

      details.push({
        pattern: strategy.pattern,
        type: strategy.type,
        score: strategyScore,
        compatible: strategyScore >= 50,
        checks
      });
    }

    const avgScore = pack.strategies.length > 0
      ? Math.round(totalScore / pack.strategies.length)
      : 0;

    return {
      compatible: avgScore >= 50,
      score: avgScore,
      totalStrategies: pack.strategies.length,
      compatibleCount: details.filter(d => d.compatible).length,
      details
    };
  }

  // ----------------------------------------------------------
  // 6c. 多轮渐进验证
  // ----------------------------------------------------------

  /**
   * 多轮渐进验证策略
   * 每轮要求更高的置信度，逐步提升验证严格度
   * @param {string} strategyId - 策略 ID
   * @returns {Object} 多轮验证结果
   */
  verifyWithRounds(strategyId) {
    const strategy = this.strategies.find(s => s.id === strategyId);
    if (!strategy) return { success: false, error: 'Strategy not found' };

    const totalRounds = this.config.verifyRounds;
    const rounds = [];
    let currentRound = strategy.verificationRound || 0;
    let allPassed = true;

    for (let round = currentRound + 1; round <= totalRounds; round++) {
      // 每轮渐进提高阈值
      const roundThreshold = this.config.confidenceThreshold + (round - 1) * 0.05;
      const roundMinSamples = this.config.minSamples + (round - 1) * 2;

      const roundResult = {
        round,
        threshold: roundThreshold,
        minSamples: roundMinSamples,
        checks: [],
        passed: true
      };

      // Check 1: 渐进置信度
      const confOk = strategy.confidence >= roundThreshold;
      roundResult.checks.push({
        name: 'confidence',
        passed: confOk,
        detail: `${(strategy.confidence * 100).toFixed(1)}% >= ${(roundThreshold * 100).toFixed(1)}%`
      });

      // Check 2: 渐进样本量
      const sampleOk = (strategy.sampleCount + (strategy.feedbackCount || 0)) >= roundMinSamples;
      roundResult.checks.push({
        name: 'samples',
        passed: sampleOk,
        detail: `${strategy.sampleCount + (strategy.feedbackCount || 0)} >= ${roundMinSamples}`
      });

      // Check 3: 反馈正面率 (从第2轮开始)
      if (round >= 2) {
        const feedbacks = this.feedbackLog.filter(f => f.strategyId === strategyId);
        const posRate = feedbacks.length > 0
          ? feedbacks.filter(f => f.positive).length / feedbacks.length
          : 1.0; // 无反馈默认通过
        const feedbackOk = posRate >= 0.6;
        roundResult.checks.push({
          name: 'feedback_positive_rate',
          passed: feedbackOk,
          detail: `正面反馈率 ${(posRate * 100).toFixed(0)}% >= 60%`
        });
      }

      // Check 4: 无活跃冲突 (从第3轮开始)
      if (round >= 3) {
        const conflicts = this._detectConflicts(strategy);
        const noConflict = conflicts.length === 0;
        roundResult.checks.push({
          name: 'no_conflicts',
          passed: noConflict,
          detail: noConflict ? '无冲突' : `${conflicts.length} 个冲突`
        });
      }

      // 综合
      const failedChecks = roundResult.checks.filter(c => !c.passed);
      if (failedChecks.length > 0) {
        roundResult.passed = false;
        allPassed = false;
        rounds.push(roundResult);
        break; // 本轮失败，停止后续轮次
      }

      rounds.push(roundResult);
    }

    // 更新策略状态
    strategy.verificationRound = rounds.length;
    if (allPassed && rounds.length === totalRounds) {
      strategy.status = STRATEGY_STATUS.VERIFIED;
      strategy.verifiedAt = new Date().toISOString();
    } else if (!allPassed) {
      // 不直接标记 FAILED，保留 DRAFT 供后续重试
      strategy.lastVerifyFailed = new Date().toISOString();
    }

    return {
      success: allPassed && rounds.length === totalRounds,
      strategyId,
      totalRounds,
      completedRounds: rounds.filter(r => r.passed).length,
      rounds,
      status: strategy.status
    };
  }

  // ----------------------------------------------------------
  // 6d. 推送后反馈闭环
  // ----------------------------------------------------------

  /**
   * 记录策略推送后的实际效果反馈
   * @param {string} strategyId - 策略 ID
   * @param {Object} feedback - 反馈数据
   * @returns {Object} 反馈记录
   */
  recordFeedback(strategyId, feedback) {
    const strategy = this.strategies.find(s => s.id === strategyId);
    if (!strategy) return { success: false, error: 'Strategy not found' };

    const entry = {
      id: `fb_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      strategyId,
      pattern: strategy.pattern,
      timestamp: new Date().toISOString(),
      positive: !!feedback.positive,
      metrics: {
        executionTime: feedback.executionTime || null,
        successRate: feedback.successRate || null,
        errorCount: feedback.errorCount || 0,
        improvement: feedback.improvement || null
      },
      context: feedback.context || {},
      notes: feedback.notes || ''
    };

    this.feedbackLog.push(entry);

    // 根据反馈调整策略置信度
    if (entry.positive) {
      strategy.confidence = Math.min(0.99, strategy.confidence + 0.02);
    } else {
      strategy.confidence = Math.max(0.1, strategy.confidence - 0.05);
    }

    // 更新反馈计数
    strategy.feedbackCount = (strategy.feedbackCount || 0) + 1;
    strategy.lastFeedback = entry.timestamp;

    // 自动降级: 连续负面反馈超过阈值
    const recentFeedback = this.feedbackLog
      .filter(f => f.strategyId === strategyId)
      .slice(-5);
    const negativeRate = recentFeedback.filter(f => !f.positive).length / recentFeedback.length;

    if (recentFeedback.length >= 3 && negativeRate >= 0.8) {
      strategy.status = STRATEGY_STATUS.DEPRECATED;
      strategy.deprecatedAt = new Date().toISOString();
      strategy.deprecatedReason = '连续负面反馈自动降级';
      entry.autoDeprecated = true;
      this.logger.warn({ strategyId, negativeRate }, 'Strategy auto-deprecated due to negative feedback');
    }

    // 限制反馈日志长度
    if (this.feedbackLog.length > 500) {
      this.feedbackLog = this.feedbackLog.slice(-500);
    }

    this.stats.feedbackReceived++;
    this.logger.info({ strategyId, positive: entry.positive }, 'Strategy feedback recorded');

    return { success: true, feedback: entry };
  }

  /**
   * 获取策略的反馈摘要
   * @param {string} strategyId
   * @returns {Object} 反馈摘要
   */
  getFeedbackSummary(strategyId) {
    const feedbacks = this.feedbackLog.filter(f => f.strategyId === strategyId);
    if (feedbacks.length === 0) {
      return { strategyId, totalFeedback: 0, positiveRate: 0, avgImprovement: null };
    }

    const positive = feedbacks.filter(f => f.positive).length;
    const improvements = feedbacks.map(f => f.metrics.improvement).filter(i => i !== null);
    const avgImprovement = improvements.length > 0
      ? improvements.reduce((a, b) => a + b, 0) / improvements.length
      : null;

    return {
      strategyId,
      totalFeedback: feedbacks.length,
      positiveCount: positive,
      negativeCount: feedbacks.length - positive,
      positiveRate: parseFloat((positive / feedbacks.length).toFixed(2)),
      avgImprovement,
      lastFeedback: feedbacks[feedbacks.length - 1].timestamp
    };
  }

  // ----------------------------------------------------------
  // 6e. 策略冲突检测与解决
  // ----------------------------------------------------------

  /**
   * 检测所有活跃策略间的冲突
   * @returns {Array} 冲突列表
   */
  detectAllConflicts() {
    const activeStrategies = this.strategies.filter(
      s => s.status === STRATEGY_STATUS.ACTIVE || s.status === STRATEGY_STATUS.VERIFIED
    );

    const conflicts = [];
    for (let i = 0; i < activeStrategies.length; i++) {
      for (let j = i + 1; j < activeStrategies.length; j++) {
        const conflict = this._checkConflict(activeStrategies[i], activeStrategies[j]);
        if (conflict) {
          conflicts.push(conflict);
        }
      }
    }

    return conflicts;
  }

  /**
   * 解决策略冲突
   * @param {string} conflictId - 冲突 ID (可选，不传则解决所有)
   * @returns {Array} 解决结果
   */
  resolveConflicts(conflictId) {
    const allConflicts = this.detectAllConflicts();
    const toResolve = conflictId
      ? allConflicts.filter(c => c.id === conflictId)
      : allConflicts;

    const results = [];

    for (const conflict of toResolve) {
      const result = this._resolveConflict(conflict);
      results.push(result);
      this.conflictHistory.push(result);
    }

    this.stats.conflictsResolved += results.filter(r => r.resolved).length;

    // 限制冲突历史
    if (this.conflictHistory.length > 100) {
      this.conflictHistory = this.conflictHistory.slice(-100);
    }

    return results;
  }

  _detectConflicts(strategy) {
    const conflicts = [];
    const others = this.strategies.filter(
      s => s.id !== strategy.id &&
        (s.status === STRATEGY_STATUS.ACTIVE || s.status === STRATEGY_STATUS.VERIFIED)
    );

    for (const other of others) {
      const conflict = this._checkConflict(strategy, other);
      if (conflict) conflicts.push(conflict);
    }

    return conflicts;
  }

  _checkConflict(strategyA, strategyB) {
    // 同类型 + 同任务类型 + 不同推荐
    const recA = strategyA.recommendation || {};
    const recB = strategyB.recommendation || {};

    // 冲突类型 1: 同任务类型不同策略推荐
    if (recA.taskType && recA.taskType === recB.taskType &&
        recA.preferredStrategy && recB.preferredStrategy &&
        recA.preferredStrategy !== recB.preferredStrategy) {
      return {
        id: `conflict_${strategyA.id}_${strategyB.id}`,
        type: 'strategy_recommendation',
        strategyA: { id: strategyA.id, pattern: strategyA.pattern, confidence: strategyA.confidence },
        strategyB: { id: strategyB.id, pattern: strategyB.pattern, confidence: strategyB.confidence },
        taskType: recA.taskType,
        detail: `${recA.preferredStrategy} vs ${recB.preferredStrategy}`,
        detectedAt: new Date().toISOString()
      };
    }

    // 冲突类型 2: 同类型策略矛盾的时间估算
    if (strategyA.type === 'time_estimation' && strategyB.type === 'time_estimation' &&
        recA.taskType === recB.taskType && recA.estimatedTime && recB.estimatedTime) {
      const ratio = Math.max(recA.estimatedTime, recB.estimatedTime) /
                    Math.min(recA.estimatedTime, recB.estimatedTime);
      if (ratio > 2.0) {
        return {
          id: `conflict_${strategyA.id}_${strategyB.id}`,
          type: 'time_estimation',
          strategyA: { id: strategyA.id, pattern: strategyA.pattern, confidence: strategyA.confidence },
          strategyB: { id: strategyB.id, pattern: strategyB.pattern, confidence: strategyB.confidence },
          taskType: recA.taskType,
          detail: `${recA.estimatedTime}ms vs ${recB.estimatedTime}ms (${ratio.toFixed(1)}x差异)`,
          detectedAt: new Date().toISOString()
        };
      }
    }

    return null;
  }

  _resolveConflict(conflict) {
    const stratA = this.strategies.find(s => s.id === conflict.strategyA.id);
    const stratB = this.strategies.find(s => s.id === conflict.strategyB.id);

    if (!stratA || !stratB) {
      return { conflictId: conflict.id, resolved: false, reason: '策略不存在' };
    }

    // 解决策略: 保留置信度更高的，弃用置信度低的
    // 如果置信度相近 (<5%)，优先保留样本数更多的
    let winner, loser;
    if (Math.abs(stratA.confidence - stratB.confidence) < 0.05) {
      // 置信度接近，看样本数
      if (stratA.sampleCount >= stratB.sampleCount) {
        winner = stratA; loser = stratB;
      } else {
        winner = stratB; loser = stratA;
      }
    } else if (stratA.confidence >= stratB.confidence) {
      winner = stratA; loser = stratB;
    } else {
      winner = stratB; loser = stratA;
    }

    // 如果有反馈数据，也考虑反馈
    const winnerFb = this.getFeedbackSummary(winner.id);
    const loserFb = this.getFeedbackSummary(loser.id);

    // 如果 loser 的反馈远好于 winner，翻转结果
    if (loserFb.totalFeedback >= 3 && winnerFb.totalFeedback >= 3 &&
        loserFb.positiveRate - winnerFb.positiveRate > 0.3) {
      const temp = winner;
      winner = loser;
      loser = temp;
    }

    // 弃用 loser
    loser.status = STRATEGY_STATUS.DEPRECATED;
    loser.deprecatedAt = new Date().toISOString();
    loser.deprecatedReason = `冲突解决: 被 ${winner.id} 取代`;

    return {
      conflictId: conflict.id,
      resolved: true,
      winner: { id: winner.id, pattern: winner.pattern, confidence: winner.confidence },
      loser: { id: loser.id, pattern: loser.pattern, confidence: loser.confidence },
      reason: `保留置信度/样本/反馈更优的策略`,
      resolvedAt: new Date().toISOString()
    };
  }

  /**
   * 获取冲突解决历史
   */
  getConflictHistory(limit = 20) {
    return this.conflictHistory.slice(-limit);
  }

  // ----------------------------------------------------------
  // 完整进化循环
  // ----------------------------------------------------------

  /**
   * 执行一次完整的进化循环: Sense → Record → Learn → Verify → Push
   * @param {Object} executionData - 执行结果数据
   * @returns {Object} 进化结果
   */
  evolve(executionData) {
    const result = {
      timestamp: new Date().toISOString(),
      phases: {}
    };

    // 1. Record — 记录事件
    const recorded = this.record(executionData);
    result.phases.record = { eventId: recorded.id };

    // 2. Sense — 感知信号
    const signals = this.sense(executionData);
    result.phases.sense = { signals: signals.length, types: signals.map(s => s.type) };

    // 3. Learn — 学习新策略
    const learned = this.learn();
    result.phases.learn = { newStrategies: learned.length };

    // 4. Verify — 验证待验证策略
    const verified = this.verify();
    result.phases.verify = {
      checked: verified.length,
      passed: verified.filter(v => v.passed).length
    };

    // 5. Push — 推送已验证策略
    const pushed = this.push();
    result.phases.push = {
      pushed: pushed.length,
      successful: pushed.filter(p => p.success).length
    };

    return result;
  }

  // ----------------------------------------------------------
  // 查询接口
  // ----------------------------------------------------------

  /**
   * 获取当前活跃策略
   */
  getActiveStrategies() {
    return this.strategies.filter(s => s.status === STRATEGY_STATUS.ACTIVE);
  }

  /**
   * 获取指定任务类型的推荐
   * @param {string} taskType
   */
  getRecommendation(taskType) {
    const activeStrategies = this.getActiveStrategies()
      .filter(s => s.recommendation?.taskType === taskType)
      .sort((a, b) => b.confidence - a.confidence);

    if (activeStrategies.length === 0) return null;

    return {
      strategy: activeStrategies[0],
      alternatives: activeStrategies.slice(1),
      basedOn: `${activeStrategies[0].sampleCount}个样本`
    };
  }

  /**
   * 获取进化统计
   */
  getStats() {
    return {
      ...this.stats,
      strategies: {
        total: this.strategies.length,
        draft: this.strategies.filter(s => s.status === STRATEGY_STATUS.DRAFT).length,
        verified: this.strategies.filter(s => s.status === STRATEGY_STATUS.VERIFIED).length,
        active: this.strategies.filter(s => s.status === STRATEGY_STATUS.ACTIVE).length,
        deprecated: this.strategies.filter(s => s.status === STRATEGY_STATUS.DEPRECATED).length,
        failed: this.strategies.filter(s => s.status === STRATEGY_STATUS.FAILED).length
      },
      signalCount: this.signals.length,
      eventLogSize: this.eventLog.length,
      projectProfiles: this.projectProfiles.size,
      feedbackCount: this.feedbackLog.length,
      conflictHistory: this.conflictHistory.length
    };
  }

  /**
   * 获取信号历史
   */
  getSignals(limit = 20) {
    return this.signals.slice(-limit);
  }

  /**
   * 获取推送历史
   */
  getPushLog(limit = 20) {
    return this.pushLog.slice(-limit);
  }

  /**
   * 弃用某策略
   */
  deprecateStrategy(strategyId) {
    const strategy = this.strategies.find(s => s.id === strategyId);
    if (strategy) {
      strategy.status = STRATEGY_STATUS.DEPRECATED;
      strategy.deprecatedAt = new Date().toISOString();
      return true;
    }
    return false;
  }
}

// ============================================================
// 导出
// ============================================================

module.exports = {
  EvolutionEngine,
  EVOLUTION_CAPABILITIES,
  STRATEGY_STATUS,
  SIGNAL_TYPES
};
