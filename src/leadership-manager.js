/**
 * Leadership Manager - 领导权管理器
 * 管理 CEO 角色在不同平台间的转移
 *
 * 核心功能：
 * 1. 声明/查询当前领导权
 * 2. 三阶段转移协议：保存状态 → 通知 → 确认
 * 3. 状态持久化到文件系统
 * 4. 超时回退机制
 */
const crypto = require('crypto');

class LeadershipManager {
  constructor(platformDetector, ipcChannel, config = {}) {
    if (!platformDetector) throw new Error('需要 platformDetector');
    if (!ipcChannel) throw new Error('需要 ipcChannel');

    this.platformDetector = platformDetector;
    this.ipcChannel = ipcChannel;

    this.config = {
      takeoverTimeout: config.takeoverTimeout || 60000,
      pollInterval: config.pollInterval || 500,
      ...config
    };

    this._transferHistory = [];
    this._stats = {
      totalTransfers: 0,
      successfulTransfers: 0,
      failedTransfers: 0,
      claims: 0
    };
  }

  /**
   * 获取当前领导者信息
   * @returns {Object|null}
   */
  async getCurrentLeader() {
    const state = await this.ipcChannel.readState('leadership');
    if (!state) return null;
    return {
      platform: state.currentLeader,
      since: state.since,
      transferInProgress: state.transferInProgress || null
    };
  }

  /**
   * 声明领导权
   * @param {string} platformId - 可选，默认当前平台
   * @returns {boolean} 是否成功
   */
  async claimLeadership(platformId) {
    const platform = platformId || this.platformDetector.detectCurrentPlatform();
    const current = await this.getCurrentLeader();

    // 如果已有领导者且不是自己，且没有转移中，拒绝
    if (current && current.platform !== platform && !current.transferInProgress) {
      return false;
    }

    await this.ipcChannel.writeState('leadership', {
      currentLeader: platform,
      since: new Date().toISOString(),
      transferInProgress: null
    });

    this._stats.claims++;
    return true;
  }

  /**
   * 转移领导权
   * @param {string} toPlatform - 目标平台
   * @param {Object} context - 要保存的状态上下文
   * @returns {Object} { success, transferId }
   */
  async transferLeadership(toPlatform, context = {}) {
    const currentPlatform = this.platformDetector.detectCurrentPlatform();
    const leader = await this.getCurrentLeader();

    // 验证当前是领导者
    if (leader && leader.platform !== currentPlatform) {
      return { success: false, reason: '当前平台不是领导者' };
    }

    const transferId = `xfer-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

    // 保存转移状态
    await this.ipcChannel.writeState('leadership', {
      currentLeader: currentPlatform,
      since: leader ? leader.since : new Date().toISOString(),
      transferInProgress: {
        transferId,
        from: currentPlatform,
        to: toPlatform,
        state: 'pending',
        context,
        initiatedAt: new Date().toISOString()
      }
    });

    this._stats.totalTransfers++;

    const record = {
      transferId,
      from: currentPlatform,
      to: toPlatform,
      initiatedAt: Date.now(),
      state: 'pending'
    };
    this._transferHistory.push(record);

    return { success: true, transferId };
  }

  /**
   * 等待新领导者确认接管
   * @param {string} transferId
   * @param {number} timeout
   * @returns {Object} { acknowledged, timedOut }
   */
  async waitForTakeover(transferId, timeout) {
    const maxWait = timeout || this.config.takeoverTimeout;
    const interval = this.config.pollInterval;
    const start = Date.now();

    while (Date.now() - start < maxWait) {
      const state = await this.ipcChannel.readState('leadership');
      if (state && state.transferInProgress) {
        const transfer = state.transferInProgress;
        if (transfer.transferId === transferId) {
          if (transfer.state === 'acknowledged' || transfer.state === 'completed') {
            // 完成转移
            await this.ipcChannel.writeState('leadership', {
              currentLeader: transfer.to,
              since: new Date().toISOString(),
              transferInProgress: null
            });

            this._stats.successfulTransfers++;
            this._updateTransferRecord(transferId, 'completed');
            return { acknowledged: true, timedOut: false };
          }
        }
      }
      await this._sleep(interval);
    }

    // 超时：回退领导权
    const currentState = await this.ipcChannel.readState('leadership');
    if (currentState && currentState.transferInProgress) {
      await this.ipcChannel.writeState('leadership', {
        currentLeader: currentState.currentLeader,
        since: currentState.since,
        transferInProgress: null
      });
    }

    this._stats.failedTransfers++;
    this._updateTransferRecord(transferId, 'failed');
    return { acknowledged: false, timedOut: true };
  }

  /**
   * 新领导者确认接管
   * @param {string} transferId
   * @returns {boolean}
   */
  async acknowledgeTakeover(transferId) {
    const state = await this.ipcChannel.readState('leadership');
    if (!state || !state.transferInProgress) return false;
    if (state.transferInProgress.transferId !== transferId) return false;

    state.transferInProgress.state = 'acknowledged';
    await this.ipcChannel.writeState('leadership', state);
    return true;
  }

  /**
   * 当前平台是否是领导者
   * @returns {boolean}
   */
  async isLeader() {
    const current = this.platformDetector.detectCurrentPlatform();
    const leader = await this.getCurrentLeader();
    return leader !== null && leader.platform === current;
  }

  /**
   * 保存自定义状态
   * @param {Object} state
   */
  async saveState(state) {
    await this.ipcChannel.writeState('supervisor-state', state);
  }

  /**
   * 加载自定义状态
   * @returns {Object|null}
   */
  async loadState() {
    return await this.ipcChannel.readState('supervisor-state');
  }

  /**
   * 获取转移历史
   * @returns {Array}
   */
  getTransferHistory() {
    return [...this._transferHistory];
  }

  /**
   * 获取统计信息
   * @returns {Object}
   */
  getStats() {
    return {
      ...this._stats,
      transferHistory: this._transferHistory.length
    };
  }

  // ========== 内部方法 ==========

  _updateTransferRecord(transferId, state) {
    const record = this._transferHistory.find(r => r.transferId === transferId);
    if (record) {
      record.state = state;
      record.completedAt = Date.now();
    }
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = LeadershipManager;
