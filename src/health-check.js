/**
 * Health Check - 健康检查系统
 * 定期检查各组件健康状态，提供系统级健康视图
 *
 * 核心功能：
 * 1. 组件健康检查注册：为每个组件定义检查函数
 * 2. 定期检查执行：按配置间隔自动执行健康检查
 * 3. 健康状态报告：healthy / degraded / unhealthy 三级状态
 * 4. 健康历史追踪：记录状态变化趋势
 * 5. 告警触发：状态恶化时触发告警回调
 */
class HealthCheck {
  constructor(config = {}) {
    this.config = {
      // 检查间隔（毫秒）
      checkInterval: config.checkInterval || 60000,

      // 是否自动启动定期检查
      autoStart: config.autoStart === true,

      // 连续失败多少次判定为 unhealthy
      unhealthyThreshold: config.unhealthyThreshold || 3,

      // 连续失败多少次判定为 degraded
      degradedThreshold: config.degradedThreshold || 1,

      // 检查超时（毫秒）
      checkTimeout: config.checkTimeout || 10000,

      // 最大历史记录数
      maxHistorySize: config.maxHistorySize || 200,

      // 告警回调
      onAlert: config.onAlert || null,

      ...config
    };

    // 组件检查注册表: componentId -> { check, name, ... }
    this.components = new Map();

    // 组件状态: componentId -> { status, lastCheck, consecutiveFailures, ... }
    this.componentStatus = new Map();

    // 检查历史
    this.checkHistory = [];

    // 定时器
    this._intervalTimer = null;
    this._running = false;

    // 自动启动
    if (this.config.autoStart) {
      this.start();
    }
  }

  /**
   * 注册组件健康检查
   * @param {string} componentId - 组件ID
   * @param {Object} options - 检查配置
   */
  register(componentId, options = {}) {
    if (!componentId || typeof componentId !== 'string') {
      throw new Error('componentId 必须为非空字符串');
    }

    const checkFn = options.check || options;
    if (typeof checkFn !== 'function' && typeof options.check !== 'function') {
      throw new Error('必须提供 check 函数');
    }

    this.components.set(componentId, {
      id: componentId,
      name: options.name || componentId,
      description: options.description || '',
      check: typeof checkFn === 'function' ? checkFn : options.check,
      critical: options.critical !== false,
      timeout: options.timeout || this.config.checkTimeout
    });

    // 初始化状态
    this.componentStatus.set(componentId, {
      status: 'unknown',
      lastCheck: null,
      lastSuccess: null,
      lastFailure: null,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      totalChecks: 0,
      totalFailures: 0,
      details: null
    });
  }

  /**
   * 注销组件
   * @param {string} componentId - 组件ID
   * @returns {boolean}
   */
  unregister(componentId) {
    const existed = this.components.has(componentId);
    this.components.delete(componentId);
    this.componentStatus.delete(componentId);
    return existed;
  }

  /**
   * 检查单个组件
   * @param {string} componentId - 组件ID
   * @returns {Promise<Object>} 检查结果
   */
  async checkComponent(componentId) {
    const component = this.components.get(componentId);
    if (!component) {
      throw new Error(`组件未注册: ${componentId}`);
    }

    const status = this.componentStatus.get(componentId);
    const startTime = Date.now();

    const record = {
      componentId,
      componentName: component.name,
      startTime,
      success: false,
      status: 'unhealthy',
      details: null,
      error: null,
      duration: 0
    };

    try {
      const result = await this._executeWithTimeout(
        () => component.check(),
        component.timeout
      );

      record.duration = Date.now() - startTime;
      record.success = result.healthy !== false;
      record.details = result;

      if (record.success) {
        status.consecutiveFailures = 0;
        status.consecutiveSuccesses++;
        status.lastSuccess = Date.now();
        record.status = 'healthy';
      } else {
        status.consecutiveFailures++;
        status.consecutiveSuccesses = 0;
        status.lastFailure = Date.now();
        status.totalFailures++;
        record.status = this._calculateStatus(status.consecutiveFailures);
      }
    } catch (error) {
      record.duration = Date.now() - startTime;
      record.error = error.message;
      status.consecutiveFailures++;
      status.consecutiveSuccesses = 0;
      status.lastFailure = Date.now();
      status.totalFailures++;
      record.status = this._calculateStatus(status.consecutiveFailures);
    }

    // 更新组件状态
    const previousStatus = status.status;
    status.status = record.status;
    status.lastCheck = Date.now();
    status.totalChecks++;
    status.details = record.details || record.error;

    // 保存历史
    this.checkHistory.push(record);
    if (this.checkHistory.length > this.config.maxHistorySize) {
      this.checkHistory = this.checkHistory.slice(-this.config.maxHistorySize);
    }

    // 状态变化告警
    if (previousStatus !== 'unknown' && previousStatus !== record.status) {
      this._triggerAlert(componentId, previousStatus, record.status, record);
    }

    return record;
  }

  /**
   * 检查所有组件
   * @returns {Promise<Object>} 综合健康报告
   */
  async checkAll() {
    const results = {};
    const componentIds = [...this.components.keys()];

    // 并行执行所有检查
    const checks = await Promise.allSettled(
      componentIds.map(async (id) => {
        const result = await this.checkComponent(id);
        return { id, result };
      })
    );

    for (const check of checks) {
      if (check.status === 'fulfilled') {
        results[check.value.id] = check.value.result;
      } else {
        const id = componentIds[checks.indexOf(check)];
        results[id] = {
          componentId: id,
          success: false,
          status: 'unhealthy',
          error: check.reason?.message || '检查异常'
        };
      }
    }

    // 计算整体状态
    const overallStatus = this._calculateOverallStatus(results);

    return {
      status: overallStatus,
      timestamp: Date.now(),
      components: results,
      summary: this._buildSummary(results)
    };
  }

  /**
   * 启动定期检查
   */
  start() {
    if (this._running) return;
    this._running = true;
    this._intervalTimer = setInterval(
      () => this.checkAll().catch(() => {}),
      this.config.checkInterval
    );
    // 不阻塞 unref，允许进程退出
    if (this._intervalTimer.unref) {
      this._intervalTimer.unref();
    }
  }

  /**
   * 停止定期检查
   */
  stop() {
    if (this._intervalTimer) {
      clearInterval(this._intervalTimer);
      this._intervalTimer = null;
    }
    this._running = false;
  }

  /**
   * 是否正在运行
   */
  isRunning() {
    return this._running;
  }

  /**
   * 获取组件状态
   * @param {string} componentId - 可选
   * @returns {Object|Map}
   */
  getStatus(componentId) {
    if (componentId) {
      return this.componentStatus.get(componentId) || null;
    }
    // 返回所有状态的快照
    const snapshot = {};
    for (const [id, status] of this.componentStatus.entries()) {
      snapshot[id] = { ...status };
    }
    return snapshot;
  }

  /**
   * 获取检查历史
   * @param {Object} filter - 过滤条件
   * @returns {Array}
   */
  getHistory(filter = {}) {
    let history = [...this.checkHistory];

    if (filter.componentId) {
      history = history.filter(h => h.componentId === filter.componentId);
    }
    if (filter.status) {
      history = history.filter(h => h.status === filter.status);
    }
    if (filter.success !== undefined) {
      history = history.filter(h => h.success === filter.success);
    }
    if (filter.since) {
      history = history.filter(h => h.startTime >= filter.since);
    }
    if (filter.limit) {
      history = history.slice(-filter.limit);
    }

    return history;
  }

  /**
   * 获取统计信息
   * @returns {Object}
   */
  getStats() {
    const totalComponents = this.components.size;
    const statuses = {};
    let healthyCount = 0;
    let degradedCount = 0;
    let unhealthyCount = 0;
    let unknownCount = 0;

    for (const [id, status] of this.componentStatus.entries()) {
      statuses[id] = status.status;
      switch (status.status) {
        case 'healthy': healthyCount++; break;
        case 'degraded': degradedCount++; break;
        case 'unhealthy': unhealthyCount++; break;
        default: unknownCount++; break;
      }
    }

    return {
      totalComponents,
      healthy: healthyCount,
      degraded: degradedCount,
      unhealthy: unhealthyCount,
      unknown: unknownCount,
      overallStatus: this._deriveOverallFromCounts(
        healthyCount, degradedCount, unhealthyCount, unknownCount, totalComponents
      ),
      componentStatuses: statuses,
      totalChecks: this.checkHistory.length,
      running: this._running
    };
  }

  /**
   * 列出已注册组件
   * @returns {Array}
   */
  listComponents() {
    const list = [];
    for (const [id, comp] of this.components.entries()) {
      const status = this.componentStatus.get(id);
      list.push({
        id: comp.id,
        name: comp.name,
        description: comp.description,
        critical: comp.critical,
        status: status ? status.status : 'unknown',
        lastCheck: status ? status.lastCheck : null,
        totalChecks: status ? status.totalChecks : 0,
        totalFailures: status ? status.totalFailures : 0
      });
    }
    return list;
  }

  /**
   * 清理历史
   * @param {number} keepLast - 保留最近N条
   * @returns {number} 清理数量
   */
  clearHistory(keepLast = 50) {
    const before = this.checkHistory.length;
    if (keepLast > 0 && this.checkHistory.length > keepLast) {
      this.checkHistory = this.checkHistory.slice(-keepLast);
    } else if (keepLast === 0) {
      this.checkHistory = [];
    }
    return before - this.checkHistory.length;
  }

  /**
   * 根据连续失败次数计算状态
   */
  _calculateStatus(consecutiveFailures) {
    if (consecutiveFailures >= this.config.unhealthyThreshold) {
      return 'unhealthy';
    }
    if (consecutiveFailures >= this.config.degradedThreshold) {
      return 'degraded';
    }
    return 'healthy';
  }

  /**
   * 计算整体状态（基于检查结果）
   */
  _calculateOverallStatus(results) {
    let hasUnhealthy = false;
    let hasDegraded = false;

    for (const [id, result] of Object.entries(results)) {
      const component = this.components.get(id);
      if (result.status === 'unhealthy') {
        if (component && component.critical) return 'unhealthy';
        hasUnhealthy = true;
      }
      if (result.status === 'degraded') {
        hasDegraded = true;
      }
    }

    if (hasUnhealthy) return 'degraded';
    if (hasDegraded) return 'degraded';
    return 'healthy';
  }

  /**
   * 从计数推导整体状态
   */
  _deriveOverallFromCounts(healthy, degraded, unhealthy, unknown, total) {
    if (total === 0) return 'unknown';
    if (unhealthy > 0) return 'unhealthy';
    if (degraded > 0) return 'degraded';
    if (unknown === total) return 'unknown';
    return 'healthy';
  }

  /**
   * 构建摘要
   */
  _buildSummary(results) {
    const entries = Object.entries(results);
    return {
      total: entries.length,
      healthy: entries.filter(([, r]) => r.status === 'healthy').length,
      degraded: entries.filter(([, r]) => r.status === 'degraded').length,
      unhealthy: entries.filter(([, r]) => r.status === 'unhealthy').length
    };
  }

  /**
   * 触发告警
   */
  _triggerAlert(componentId, previousStatus, newStatus, record) {
    if (typeof this.config.onAlert === 'function') {
      try {
        this.config.onAlert({
          componentId,
          componentName: this.components.get(componentId)?.name || componentId,
          previousStatus,
          newStatus,
          record,
          timestamp: Date.now()
        });
      } catch (e) {
        // 告警回调异常不影响主流程
      }
    }
  }

  /**
   * 带超时执行
   */
  _executeWithTimeout(fn, timeout) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`健康检查超时 (${timeout}ms)`));
      }, timeout);

      Promise.resolve(fn())
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }
}

module.exports = HealthCheck;