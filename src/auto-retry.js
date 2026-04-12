/**
 * Auto Retry - 自动重试机制
 * 基于错误类型智能决定是否重试，支持指数退避策略
 *
 * 核心功能：
 * 1. 可重试判断：根据错误类别判断是否可以重试
 * 2. 重试策略：指数退避、固定间隔、线性增长
 * 3. 重试次数控制：按错误类别设置最大重试次数
 * 4. 重试历史记录：记录所有重试尝试和结果
 * 5. 断路器模式：连续失败过多时暂停重试
 */
class AutoRetry {
  constructor(config = {}) {
    this.config = {
      // 默认最大重试次数
      maxRetries: config.maxRetries || 3,

      // 默认退避策略: 'exponential' | 'fixed' | 'linear'
      backoffStrategy: config.backoffStrategy || 'exponential',

      // 基础延迟（毫秒）
      baseDelay: config.baseDelay || 1000,

      // 最大延迟（毫秒）
      maxDelay: config.maxDelay || 30000,

      // 指数退避乘数
      backoffMultiplier: config.backoffMultiplier || 2,

      // 是否添加抖动（防止惊群效应）
      jitter: config.jitter !== false,

      // 抖动范围（0-1）
      jitterFactor: config.jitterFactor || 0.3,

      // 断路器：连续失败多少次后暂停重试
      circuitBreakerThreshold: config.circuitBreakerThreshold || 10,

      // 断路器恢复时间（毫秒）
      circuitBreakerResetTime: config.circuitBreakerResetTime || 60000,

      // 各错误类别的重试配置覆盖
      categoryOverrides: config.categoryOverrides || {},

      ...config
    };

    // 重试历史
    this.retryHistory = [];

    // 断路器状态: 'closed'(正常) | 'open'(暂停) | 'half-open'(试探)
    this.circuitBreaker = {
      state: 'closed',
      failures: 0,
      lastFailureTime: null,
      lastOpenTime: null
    };

    // 各错误类别的默认重试配置
    this.retryableCategories = {
      timeout: {
        retryable: true,
        maxRetries: 3,
        backoffStrategy: 'exponential',
        baseDelay: 2000
      },
      file_not_found: {
        retryable: false,
        maxRetries: 0,
        reason: '文件不存在通常无法通过重试解决'
      },
      permission_denied: {
        retryable: false,
        maxRetries: 0,
        reason: '权限问题通常无法通过重试解决'
      },
      network_error: {
        retryable: true,
        maxRetries: 5,
        backoffStrategy: 'exponential',
        baseDelay: 1000
      },
      syntax_error: {
        retryable: false,
        maxRetries: 0,
        reason: '语法错误无法通过重试解决'
      },
      type_error: {
        retryable: false,
        maxRetries: 0,
        reason: '类型错误无法通过重试解决'
      },
      reference_error: {
        retryable: false,
        maxRetries: 0,
        reason: '引用错误无法通过重试解决'
      },
      resource_exhausted: {
        retryable: true,
        maxRetries: 2,
        backoffStrategy: 'exponential',
        baseDelay: 5000
      },
      configuration_error: {
        retryable: false,
        maxRetries: 0,
        reason: '配置错误无法通过重试解决'
      },
      dependency_error: {
        retryable: false,
        maxRetries: 0,
        reason: '依赖错误无法通过重试解决'
      },
      unknown: {
        retryable: true,
        maxRetries: 1,
        backoffStrategy: 'fixed',
        baseDelay: 2000
      }
    };

    // 应用自定义覆盖
    this.applyOverrides(config.categoryOverrides || {});

    // 统计计数器
    this.stats = {
      totalRetries: 0,
      successfulRetries: 0,
      failedRetries: 0,
      skippedRetries: 0,
      circuitBreakerTrips: 0
    };
  }

  /**
   * 应用错误类别覆盖配置
   * @param {Object} overrides - 覆盖配置
   */
  applyOverrides(overrides) {
    for (const [category, override] of Object.entries(overrides)) {
      if (this.retryableCategories[category]) {
        this.retryableCategories[category] = {
          ...this.retryableCategories[category],
          ...override
        };
      } else {
        this.retryableCategories[category] = {
          retryable: true,
          maxRetries: this.config.maxRetries,
          ...override
        };
      }
    }
  }

  /**
   * 判断错误是否可以重试
   * @param {string} category - 错误类别（来自 ErrorPatternRecognizer）
   * @param {Object} context - 附加上下文
   * @returns {Object} 重试决策
   */
  shouldRetry(category, context = {}) {
    // 检查断路器状态
    const circuitState = this.checkCircuitBreaker();
    if (circuitState.blocked) {
      return {
        shouldRetry: false,
        reason: circuitState.reason,
        circuitBreaker: circuitState
      };
    }

    // 获取该类别的重试配置
    const categoryConfig = this.retryableCategories[category] || this.retryableCategories.unknown;

    // 检查是否可重试
    if (!categoryConfig.retryable) {
      return {
        shouldRetry: false,
        reason: categoryConfig.reason || `错误类别 ${category} 不可重试`,
        category,
        config: categoryConfig
      };
    }

    // 检查当前重试次数
    const currentAttempt = context.attempt || 0;
    const maxRetries = categoryConfig.maxRetries || this.config.maxRetries;

    if (currentAttempt >= maxRetries) {
      return {
        shouldRetry: false,
        reason: `已达到最大重试次数 (${maxRetries})`,
        category,
        currentAttempt,
        maxRetries,
        config: categoryConfig
      };
    }

    // 计算延迟
    const delay = this.calculateDelay(currentAttempt, categoryConfig);

    return {
      shouldRetry: true,
      category,
      currentAttempt,
      maxRetries,
      nextAttempt: currentAttempt + 1,
      delay,
      config: categoryConfig
    };
  }

  /**
   * 计算重试延迟
   * @param {number} attempt - 当前尝试次数
   * @param {Object} categoryConfig - 类别配置
   * @returns {number} 延迟时间（毫秒）
   */
  calculateDelay(attempt, categoryConfig = {}) {
    const strategy = categoryConfig.backoffStrategy || this.config.backoffStrategy;
    const baseDelay = categoryConfig.baseDelay || this.config.baseDelay;
    const multiplier = this.config.backoffMultiplier;
    const maxDelay = this.config.maxDelay;

    let delay;

    switch (strategy) {
      case 'exponential':
        // 指数退避: baseDelay * multiplier^attempt
        delay = baseDelay * Math.pow(multiplier, attempt);
        break;

      case 'linear':
        // 线性增长: baseDelay * (attempt + 1)
        delay = baseDelay * (attempt + 1);
        break;

      case 'fixed':
        // 固定间隔
        delay = baseDelay;
        break;

      default:
        delay = baseDelay;
    }

    // 限制最大延迟
    delay = Math.min(delay, maxDelay);

    // 添加抖动
    if (this.config.jitter) {
      const jitterRange = delay * this.config.jitterFactor;
      const jitter = (Math.random() - 0.5) * 2 * jitterRange;
      delay = Math.max(0, delay + jitter);
    }

    return Math.round(delay);
  }

  /**
   * 执行带重试的操作
   * @param {Function} operation - 要执行的异步操作
   * @param {Object} options - 重试选项
   * @returns {Promise<Object>} 执行结果
   */
  async executeWithRetry(operation, options = {}) {
    const {
      category = 'unknown',
      maxRetries = null,
      onRetry = null,
      context = {}
    } = options;

    const retryRecord = {
      id: this.generateRetryId(),
      category,
      startTime: Date.now(),
      attempts: [],
      finalResult: null,
      totalAttempts: 0,
      success: false
    };

    let lastError = null;
    let attempt = 0;
    const effectiveMaxRetries = maxRetries !== null
      ? maxRetries
      : (this.retryableCategories[category]?.maxRetries || this.config.maxRetries);

    while (true) {
      const attemptRecord = {
        attempt,
        startTime: Date.now(),
        endTime: null,
        success: false,
        error: null,
        delay: 0
      };

      try {
        // 执行操作
        const result = await operation(attempt);

        // 成功
        attemptRecord.success = true;
        attemptRecord.endTime = Date.now();
        retryRecord.attempts.push(attemptRecord);
        retryRecord.finalResult = result;
        retryRecord.totalAttempts = attempt + 1;
        retryRecord.success = true;
        retryRecord.endTime = Date.now();

        // 更新断路器（成功）
        this.onSuccess();

        // 更新统计
        if (attempt > 0) {
          this.stats.successfulRetries++;
        }

        // 保存记录
        this.retryHistory.push(retryRecord);

        return {
          success: true,
          result,
          attempts: attempt + 1,
          retried: attempt > 0,
          retryRecord
        };

      } catch (error) {
        lastError = error;
        attemptRecord.success = false;
        attemptRecord.error = error.message;
        attemptRecord.endTime = Date.now();

        // 判断是否应该重试
        const retryDecision = this.shouldRetry(category, {
          attempt,
          error,
          ...context
        });

        if (!retryDecision.shouldRetry || attempt >= effectiveMaxRetries) {
          // 不再重试
          retryRecord.attempts.push(attemptRecord);
          retryRecord.totalAttempts = attempt + 1;
          retryRecord.success = false;
          retryRecord.endTime = Date.now();
          retryRecord.finalError = error.message;

          // 更新断路器（失败）
          this.onFailure();

          // 更新统计
          this.stats.failedRetries++;

          // 保存记录
          this.retryHistory.push(retryRecord);

          return {
            success: false,
            error,
            attempts: attempt + 1,
            retried: attempt > 0,
            retryDecision,
            retryRecord
          };
        }

        // 计算延迟
        const delay = retryDecision.delay;
        attemptRecord.delay = delay;
        retryRecord.attempts.push(attemptRecord);

        // 更新统计
        this.stats.totalRetries++;

        // 回调通知
        if (onRetry) {
          try {
            await onRetry({
              attempt,
              nextAttempt: attempt + 1,
              error,
              delay,
              category,
              retryDecision
            });
          } catch (callbackError) {
            // 忽略回调错误
          }
        }

        // 等待延迟
        if (delay > 0) {
          await this.sleep(delay);
        }

        attempt++;
      }
    }
  }

  /**
   * 检查断路器状态
   * @returns {Object} 断路器状态
   */
  checkCircuitBreaker() {
    const cb = this.circuitBreaker;

    switch (cb.state) {
      case 'closed':
        // 正常状态
        return { blocked: false, state: 'closed' };

      case 'open':
        // 检查是否到了恢复时间
        const elapsed = Date.now() - cb.lastOpenTime;
        if (elapsed >= this.config.circuitBreakerResetTime) {
          // 进入半开状态
          cb.state = 'half-open';
          return { blocked: false, state: 'half-open', note: '断路器进入试探状态' };
        }
        return {
          blocked: true,
          state: 'open',
          reason: `断路器已打开，${Math.ceil((this.config.circuitBreakerResetTime - elapsed) / 1000)}秒后恢复`,
          remainingTime: this.config.circuitBreakerResetTime - elapsed
        };

      case 'half-open':
        // 半开状态，允许一次尝试
        return { blocked: false, state: 'half-open' };

      default:
        return { blocked: false, state: 'unknown' };
    }
  }

  /**
   * 成功时更新断路器
   */
  onSuccess() {
    const cb = this.circuitBreaker;

    if (cb.state === 'half-open') {
      // 半开状态下成功，关闭断路器
      cb.state = 'closed';
      cb.failures = 0;
    } else if (cb.state === 'closed') {
      // 正常状态下成功，重置失败计数
      cb.failures = 0;
    }
  }

  /**
   * 失败时更新断路器
   */
  onFailure() {
    const cb = this.circuitBreaker;
    cb.failures++;
    cb.lastFailureTime = Date.now();

    if (cb.state === 'half-open') {
      // 半开状态下失败，重新打开断路器
      cb.state = 'open';
      cb.lastOpenTime = Date.now();
      this.stats.circuitBreakerTrips++;
    } else if (cb.state === 'closed' && cb.failures >= this.config.circuitBreakerThreshold) {
      // 连续失败达到阈值，打开断路器
      cb.state = 'open';
      cb.lastOpenTime = Date.now();
      this.stats.circuitBreakerTrips++;
    }
  }

  /**
   * 获取类别的重试配置
   * @param {string} category - 错误类别
   * @returns {Object} 重试配置
   */
  getCategoryConfig(category) {
    return this.retryableCategories[category] || this.retryableCategories.unknown;
  }

  /**
   * 设置类别的重试配置
   * @param {string} category - 错误类别
   * @param {Object} config - 重试配置
   */
  setCategoryConfig(category, config) {
    this.retryableCategories[category] = {
      ...this.retryableCategories[category],
      ...config
    };
  }

  /**
   * 获取重试统计
   * @returns {Object} 统计信息
   */
  getStats() {
    const totalAttempts = this.retryHistory.reduce((sum, r) => sum + r.totalAttempts, 0);
    const successWithRetry = this.retryHistory.filter(r => r.success && r.totalAttempts > 1).length;
    const failedAfterRetry = this.retryHistory.filter(r => !r.success && r.totalAttempts > 1).length;
    const firstAttemptSuccess = this.retryHistory.filter(r => r.success && r.totalAttempts === 1).length;

    return {
      ...this.stats,
      totalOperations: this.retryHistory.length,
      totalAttempts,
      firstAttemptSuccess,
      successWithRetry,
      failedAfterRetry,
      avgAttemptsPerOperation: this.retryHistory.length > 0
        ? (totalAttempts / this.retryHistory.length).toFixed(2)
        : '0.00',
      retrySuccessRate: (this.stats.successfulRetries + this.stats.failedRetries) > 0
        ? ((this.stats.successfulRetries / (this.stats.successfulRetries + this.stats.failedRetries)) * 100).toFixed(1)
        : '0.0',
      circuitBreaker: {
        state: this.circuitBreaker.state,
        failures: this.circuitBreaker.failures,
        trips: this.stats.circuitBreakerTrips
      }
    };
  }

  /**
   * 获取重试历史
   * @param {Object} filter - 过滤条件
   * @returns {Array} 重试历史
   */
  getRetryHistory(filter = {}) {
    let history = [...this.retryHistory];

    // 按类别过滤
    if (filter.category) {
      history = history.filter(r => r.category === filter.category);
    }

    // 按成功/失败过滤
    if (filter.success !== undefined) {
      history = history.filter(r => r.success === filter.success);
    }

    // 按是否重试过滤
    if (filter.retried !== undefined) {
      if (filter.retried) {
        history = history.filter(r => r.totalAttempts > 1);
      } else {
        history = history.filter(r => r.totalAttempts === 1);
      }
    }

    // 按时间范围过滤
    if (filter.since) {
      history = history.filter(r => r.startTime >= filter.since);
    }

    // 限制数量
    if (filter.limit) {
      history = history.slice(-filter.limit);
    }

    return history;
  }

  /**
   * 重置断路器
   */
  resetCircuitBreaker() {
    this.circuitBreaker = {
      state: 'closed',
      failures: 0,
      lastFailureTime: null,
      lastOpenTime: null
    };
  }

  /**
   * 清理重试历史
   * @param {number} keepLast - 保留最近N条记录
   * @returns {number} 清理的记录数
   */
  clearHistory(keepLast = 100) {
    const before = this.retryHistory.length;

    if (keepLast > 0 && this.retryHistory.length > keepLast) {
      this.retryHistory = this.retryHistory.slice(-keepLast);
    } else if (keepLast === 0) {
      this.retryHistory = [];
    }

    return before - this.retryHistory.length;
  }

  /**
   * 生成重试记录ID
   * @returns {string} 重试记录ID
   */
  generateRetryId() {
    return `retry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 延迟函数
   * @param {number} ms - 延迟时间（毫秒）
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = AutoRetry;
