/**
 * Execution Monitor - 执行监控器
 * 负责监控 Agent 执行过程，检测超时、异常行为等
 *
 * 核心功能：
 * 1. 超时检测：防止任务无限期执行
 * 2. 资源监控：跟踪执行资源使用
 * 3. 异常检测：识别异常执行模式
 * 4. 执行日志：记录详细执行信息
 */
class ExecutionMonitor {
  constructor(config = {}) {
    this.config = {
      defaultTimeout: config.defaultTimeout || 300000, // 5分钟默认超时
      maxTimeout: config.maxTimeout || 600000, // 10分钟最大超时
      enableLogging: config.enableLogging !== false,
      logLevel: config.logLevel || 'info',
      ...config
    };

    // 活跃的执行任务
    this.activeExecutions = new Map();

    // 执行历史
    this.executionHistory = [];

    // 执行计数器
    this.executionCounter = 0;
  }

  /**
   * 开始监控执行
   * @param {Object} options - 监控选项
   * @returns {Object} 执行上下文
   */
  startExecution(options = {}) {
    this.executionCounter++;

    const executionId = this.generateExecutionId();
    const timeout = this.validateTimeout(options.timeout);

    const execution = {
      id: executionId,
      agentId: options.agentId,
      taskAction: options.taskAction,
      startTime: Date.now(),
      timeout: timeout,
      status: 'running',
      metadata: options.metadata || {}
    };

    // 设置超时定时器
    if (timeout > 0) {
      execution.timeoutTimer = setTimeout(() => {
        this.handleTimeout(executionId);
      }, timeout);
    }

    // 记录执行
    this.activeExecutions.set(executionId, execution);

    this.log('info', `执行开始: ${executionId}`, {
      agentId: options.agentId,
      action: options.taskAction,
      timeout: timeout
    });

    return {
      executionId: executionId,
      startTime: execution.startTime,
      timeout: timeout
    };
  }

  /**
   * 结束监控执行
   * @param {string} executionId - 执行ID
   * @param {Object} result - 执行结果
   * @returns {Object} 执行统计
   */
  endExecution(executionId, result = {}) {
    const execution = this.activeExecutions.get(executionId);

    if (!execution) {
      throw new Error(`执行不存在: ${executionId}`);
    }

    // 清除超时定时器
    if (execution.timeoutTimer) {
      clearTimeout(execution.timeoutTimer);
    }

    // 计算执行时间
    const endTime = Date.now();
    const duration = endTime - execution.startTime;

    // 更新执行信息
    execution.endTime = endTime;
    execution.duration = duration;
    execution.status = result.success ? 'completed' : 'failed';
    execution.result = result;

    // 移到历史记录
    this.executionHistory.push({ ...execution });
    this.activeExecutions.delete(executionId);

    this.log('info', `执行结束: ${executionId}`, {
      duration: duration,
      status: execution.status
    });

    return {
      executionId: executionId,
      duration: duration,
      status: execution.status,
      timedOut: execution.timedOut || false
    };
  }

  /**
   * 处理超时
   * @param {string} executionId - 执行ID
   */
  handleTimeout(executionId) {
    const execution = this.activeExecutions.get(executionId);

    if (!execution) {
      return;
    }

    execution.status = 'timeout';
    execution.timedOut = true;
    execution.endTime = Date.now();
    execution.duration = execution.endTime - execution.startTime;

    this.log('warn', `执行超时: ${executionId}`, {
      agentId: execution.agentId,
      action: execution.taskAction,
      timeout: execution.timeout,
      duration: execution.duration
    });

    // 移到历史记录
    this.executionHistory.push({ ...execution });
    this.activeExecutions.delete(executionId);
  }

  /**
   * 检查执行是否超时
   * @param {string} executionId - 执行ID
   * @returns {boolean} 是否超时
   */
  isTimedOut(executionId) {
    const execution = this.activeExecutions.get(executionId);
    if (!execution) {
      // 检查历史记录
      const historical = this.executionHistory.find(e => e.id === executionId);
      return historical ? historical.timedOut || false : false;
    }

    return execution.timedOut || false;
  }

  /**
   * 获取执行信息
   * @param {string} executionId - 执行ID
   * @returns {Object|null} 执行信息
   */
  getExecution(executionId) {
    const active = this.activeExecutions.get(executionId);
    if (active) {
      return { ...active, isActive: true };
    }

    const historical = this.executionHistory.find(e => e.id === executionId);
    if (historical) {
      return { ...historical, isActive: false };
    }

    return null;
  }

  /**
   * 列出活跃执行
   * @returns {Array} 活跃执行列表
   */
  listActiveExecutions() {
    return Array.from(this.activeExecutions.values()).map(e => ({
      id: e.id,
      agentId: e.agentId,
      taskAction: e.taskAction,
      startTime: e.startTime,
      duration: Date.now() - e.startTime,
      status: e.status
    }));
  }

  /**
   * 获取执行历史
   * @param {Object} filter - 过滤条件
   * @returns {Array} 执行历史
   */
  getHistory(filter = {}) {
    let history = [...this.executionHistory];

    // 按 agentId 过滤
    if (filter.agentId) {
      history = history.filter(e => e.agentId === filter.agentId);
    }

    // 按状态过滤
    if (filter.status) {
      history = history.filter(e => e.status === filter.status);
    }

    // 限制数量
    if (filter.limit) {
      history = history.slice(-filter.limit);
    }

    return history;
  }

  /**
   * 获取统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    const total = this.executionHistory.length;
    const completed = this.executionHistory.filter(e => e.status === 'completed').length;
    const failed = this.executionHistory.filter(e => e.status === 'failed').length;
    const timedOut = this.executionHistory.filter(e => e.timedOut).length;

    const durations = this.executionHistory
      .filter(e => e.duration !== undefined)
      .map(e => e.duration);

    const avgDuration = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;

    const maxDuration = durations.length > 0
      ? Math.max(...durations)
      : 0;

    return {
      totalExecutions: total,
      activeExecutions: this.activeExecutions.size,
      completedExecutions: completed,
      failedExecutions: failed,
      timedOutExecutions: timedOut,
      avgDuration: Math.round(avgDuration),
      maxDuration: maxDuration,
      successRate: total > 0 ? (completed / total * 100).toFixed(1) : 0
    };
  }

  /**
   * 清理历史记录
   * @param {number} keepLast - 保留最近N条记录
   * @returns {number} 清理的记录数
   */
  clearHistory(keepLast = 100) {
    const before = this.executionHistory.length;

    if (keepLast > 0 && this.executionHistory.length > keepLast) {
      this.executionHistory = this.executionHistory.slice(-keepLast);
    } else if (keepLast === 0) {
      this.executionHistory = [];
    }

    const cleared = before - this.executionHistory.length;

    this.log('info', `清理历史记录: ${cleared} 条`, {
      before: before,
      after: this.executionHistory.length
    });

    return cleared;
  }

  /**
   * 生成执行ID
   * @returns {string} 执行ID
   */
  generateExecutionId() {
    const timestamp = Date.now();
    return `exec_${timestamp}_${this.executionCounter}`;
  }

  /**
   * 验证超时时间
   * @param {number} timeout - 超时时间（毫秒）
   * @returns {number} 验证后的超时时间
   */
  validateTimeout(timeout) {
    if (timeout === undefined || timeout === null) {
      return this.config.defaultTimeout;
    }

    if (timeout <= 0) {
      return 0; // 0 表示不设置超时
    }

    if (timeout > this.config.maxTimeout) {
      this.log('warn', `超时时间超过最大值，使用最大值: ${this.config.maxTimeout}ms`);
      return this.config.maxTimeout;
    }

    return timeout;
  }

  /**
   * 日志记录
   * @param {string} level - 日志级别
   * @param {string} message - 日志消息
   * @param {Object} data - 附加数据
   */
  log(level, message, data = {}) {
    if (!this.config.enableLogging) {
      return;
    }

    const levels = ['error', 'warn', 'info', 'debug'];
    const configLevel = levels.indexOf(this.config.logLevel);
    const messageLevel = levels.indexOf(level);

    if (messageLevel <= configLevel) {
      // 使用结构化日志格式（如果可用），否则回退到 console
      try {
        const { createLogger } = require('./logger');
        if (!this._logger) {
          this._logger = createLogger({ name: 'execution-monitor' });
        }
        this._logger[level](data, message);
      } catch (e) {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`, data);
      }
    }
  }
}

module.exports = ExecutionMonitor;
