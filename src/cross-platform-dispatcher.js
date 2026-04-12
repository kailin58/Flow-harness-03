/**
 * Cross-Platform Dispatcher - 跨平台任务分发器
 * 决定任务在本地执行还是分发到其他平台
 *
 * 核心功能：
 * 1. 根据任务需求和平台能力选择最佳平台
 * 2. 本地优先策略（低延迟）
 * 3. 远程分发通过 IPCChannel
 * 4. 结果轮询收集
 */
class CrossPlatformDispatcher {
  constructor(platformDetector, ipcChannel, config = {}) {
    if (!platformDetector) throw new Error('需要 platformDetector');
    if (!ipcChannel) throw new Error('需要 ipcChannel');

    this.platformDetector = platformDetector;
    this.ipcChannel = ipcChannel;

    this.config = {
      preferLocal: config.preferLocal !== false,
      collectTimeout: config.collectTimeout || 30000,
      collectInterval: config.collectInterval || 500,
      ...config
    };

    this._history = [];
    this._stats = {
      totalDispatches: 0,
      localDispatches: 0,
      remoteDispatches: 0,
      resultsCollected: 0,
      timeouts: 0,
      errors: 0
    };
  }

  /**
   * 分发任务：决定本地或远程执行
   * @param {Object} task - 任务对象
   * @param {Object} context - 执行上下文
   * @returns {Object} { local, platform, taskId }
   */
  async dispatch(task, context = {}) {
    // 如果指定了目标平台
    if (task.targetPlatform) {
      const current = this.platformDetector.detectCurrentPlatform();
      if (task.targetPlatform === current) {
        return this._recordDispatch(task, current, true);
      }
      return this._dispatchRemote(task, task.targetPlatform, context);
    }

    // 自动选择最佳平台
    const bestPlatform = this.selectBestPlatform(task);
    const current = this.platformDetector.detectCurrentPlatform();

    if (bestPlatform === current || (this.config.preferLocal && this._canHandleLocally(task))) {
      return this._recordDispatch(task, current, true);
    }

    return this._dispatchRemote(task, bestPlatform, context);
  }

  /**
   * 强制分发到指定平台
   * @param {Object} task
   * @param {string} platformId
   * @param {Object} context
   * @returns {string} taskId
   */
  async dispatchToPlatform(task, platformId, context = {}) {
    const current = this.platformDetector.detectCurrentPlatform();
    if (platformId === current) {
      const record = this._recordDispatch(task, current, true);
      return record.taskId;
    }

    const result = await this._dispatchRemote(task, platformId, context);
    return result.taskId;
  }

  /**
   * 轮询收集远程任务结果
   * @param {string} taskId
   * @param {number} timeout - 超时毫秒
   * @returns {Object|null}
   */
  async collectResult(taskId, timeout) {
    const maxWait = timeout || this.config.collectTimeout;
    const interval = this.config.collectInterval;
    const start = Date.now();

    while (Date.now() - start < maxWait) {
      const result = await this.ipcChannel.getResult(taskId);
      if (result) {
        this._stats.resultsCollected++;
        return result;
      }
      await this._sleep(interval);
    }

    this._stats.timeouts++;
    return null;
  }

  /**
   * 选择最佳平台
   * @param {Object} task
   * @returns {string} platformId
   */
  selectBestPlatform(task) {
    const requiredCaps = task.requiredCapabilities || [];
    if (requiredCaps.length === 0) {
      return this.platformDetector.detectCurrentPlatform();
    }

    const detection = this.platformDetector.detect();
    const available = detection.platforms.filter(p => p.available);

    // 计算每个平台的匹配分数
    let bestPlatform = detection.current;
    let bestScore = 0;

    for (const platform of available) {
      const score = requiredCaps.reduce((s, cap) => {
        return s + (platform.capabilities.includes(cap) ? 1 : 0);
      }, 0);

      // 当前平台有加分（本地优先）
      const bonus = platform.id === detection.current && this.config.preferLocal ? 0.5 : 0;

      if (score + bonus > bestScore) {
        bestScore = score + bonus;
        bestPlatform = platform.id;
      }
    }

    return bestPlatform;
  }

  /**
   * 判断任务是否应远程分发
   * @param {Object} task
   * @returns {boolean}
   */
  shouldDispatchRemotely(task) {
    if (task.targetPlatform) {
      const current = this.platformDetector.detectCurrentPlatform();
      return task.targetPlatform !== current;
    }

    const requiredCaps = task.requiredCapabilities || [];
    if (requiredCaps.length === 0) return false;

    const current = this.platformDetector.detectCurrentPlatform();
    const info = this.platformDetector.getPlatformInfo(current);
    if (!info) return false;

    // 检查当前平台是否满足所有需求
    return !requiredCaps.every(cap => info.capabilities.includes(cap));
  }

  /**
   * 获取统计信息
   * @returns {Object}
   */
  getStats() {
    return { ...this._stats };
  }

  /**
   * 获取分发历史
   * @param {Object} filter
   * @returns {Array}
   */
  getHistory(filter = {}) {
    let history = [...this._history];
    if (filter.local !== undefined) {
      history = history.filter(h => h.local === filter.local);
    }
    if (filter.platform) {
      history = history.filter(h => h.platform === filter.platform);
    }
    if (filter.limit) {
      history = history.slice(-filter.limit);
    }
    return history;
  }

  // ========== 内部方法 ==========

  _canHandleLocally(task) {
    const requiredCaps = task.requiredCapabilities || [];
    if (requiredCaps.length === 0) return true;

    const current = this.platformDetector.detectCurrentPlatform();
    const info = this.platformDetector.getPlatformInfo(current);
    if (!info) return true;

    return requiredCaps.every(cap => info.capabilities.includes(cap));
  }

  async _dispatchRemote(task, platformId, context) {
    try {
      const current = this.platformDetector.detectCurrentPlatform();
      const taskId = await this.ipcChannel.send(task, platformId, {
        source: { platform: current },
        context
      });
      this._stats.remoteDispatches++;
      this._stats.totalDispatches++;

      const record = {
        taskId,
        platform: platformId,
        local: false,
        task: { action: task.action },
        timestamp: Date.now()
      };
      this._history.push(record);
      return record;
    } catch (e) {
      this._stats.errors++;
      throw e;
    }
  }

  _recordDispatch(task, platform, local) {
    const taskId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    this._stats.totalDispatches++;
    if (local) this._stats.localDispatches++;

    const record = {
      taskId,
      platform,
      local,
      task: { action: task.action },
      timestamp: Date.now()
    };
    this._history.push(record);
    return record;
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = CrossPlatformDispatcher;
