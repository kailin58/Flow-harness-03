/**
 * supervisor-position.js - Supervisor 位置流动管理
 *
 * 文档要求(P3): Supervisor 位置流动
 *   - 心跳检测 (Heartbeat) — 领导者存活检测
 *   - 自动故障转移 — 领导者崩溃后自动选举
 *   - 任务委派 — 领导者向参与者分发任务
 *   - 状态同步 — 多平台间状态一致性
 *   - 多平台协调 — 平台注册/发现/通信
 *
 * @version 1.0.0
 * @date 2026-04-13
 */

const { createLogger } = require('./logger');

// ============================================================
// 常量
// ============================================================

const PLATFORM_STATUS = {
  ONLINE: 'online',
  OFFLINE: 'offline',
  DEGRADED: 'degraded',
  JOINING: 'joining',
  LEAVING: 'leaving'
};

const POSITION_ROLE = {
  LEADER: 'leader',
  FOLLOWER: 'follower',
  CANDIDATE: 'candidate',
  OBSERVER: 'observer'
};

const ELECTION_STATE = {
  IDLE: 'idle',
  ELECTING: 'electing',
  RESOLVED: 'resolved'
};

const TASK_DELEGATION_STATUS = {
  PENDING: 'pending',
  ASSIGNED: 'assigned',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

// ============================================================
// SupervisorPosition
// ============================================================

class SupervisorPosition {
  /**
   * @param {Object} options
   * @param {string} options.platformId       - 当前平台 ID
   * @param {number} options.heartbeatInterval - 心跳间隔 (ms)
   * @param {number} options.heartbeatTimeout  - 心跳超时 (ms)
   * @param {number} options.electionTimeout   - 选举超时 (ms)
   * @param {number} options.maxPlatforms      - 最大平台数
   * @param {Object} options.logger
   */
  constructor(options = {}) {
    this.platformId = options.platformId || `platform_${Date.now()}`;
    this.heartbeatInterval = options.heartbeatInterval || 5000;
    this.heartbeatTimeout = options.heartbeatTimeout || 15000;
    this.electionTimeout = options.electionTimeout || 10000;
    this.maxPlatforms = options.maxPlatforms || 10;
    this.logger = options.logger || createLogger({ name: 'supervisor-position' });

    // 当前角色
    this.role = POSITION_ROLE.FOLLOWER;
    // 当前领导者
    this.currentLeader = null;

    // 平台注册表
    this.platforms = new Map();

    // 心跳记录
    this.heartbeats = new Map();

    // 选举状态
    this.electionState = ELECTION_STATE.IDLE;
    this.electionHistory = [];

    // 任务委派
    this.delegatedTasks = new Map();
    this.taskQueue = [];

    // 状态同步
    this.sharedState = {};
    this.stateVersion = 0;
    this.stateLog = [];

    // 事件日志
    this.eventLog = [];

    // 统计
    this.stats = {
      heartbeatsSent: 0,
      heartbeatsReceived: 0,
      heartbeatsMissed: 0,
      electionsHeld: 0,
      leaderChanges: 0,
      tasksDelegated: 0,
      tasksCompleted: 0,
      stateSyncs: 0
    };

    // 注册自身
    this._registerSelf();
  }

  // ----------------------------------------------------------
  // 平台管理
  // ----------------------------------------------------------

  /**
   * 注册平台
   * @param {string} platformId - 平台 ID
   * @param {Object} config - 平台配置
   * @returns {Object} 平台信息
   */
  registerPlatform(platformId, config = {}) {
    if (this.platforms.size >= this.maxPlatforms) {
      return { success: false, error: `最大平台数已达上限 (${this.maxPlatforms})` };
    }

    const platform = {
      id: platformId,
      name: config.name || platformId,
      capabilities: config.capabilities || [],
      priority: config.priority || 0,
      status: PLATFORM_STATUS.JOINING,
      role: POSITION_ROLE.FOLLOWER,
      registeredAt: new Date().toISOString(),
      lastHeartbeat: new Date().toISOString(),
      metadata: config.metadata || {}
    };

    this.platforms.set(platformId, platform);
    this.heartbeats.set(platformId, Date.now());

    // 标记为在线
    platform.status = PLATFORM_STATUS.ONLINE;

    this._logEvent('platform_registered', { platformId, name: platform.name });
    this.logger.info({ platformId }, 'Platform registered');

    return { success: true, platform };
  }

  /**
   * 注销平台
   */
  unregisterPlatform(platformId) {
    const platform = this.platforms.get(platformId);
    if (!platform) return false;

    const wasLeader = (this.currentLeader === platformId);

    platform.status = PLATFORM_STATUS.LEAVING;
    this.platforms.delete(platformId);
    this.heartbeats.delete(platformId);

    this._logEvent('platform_unregistered', { platformId });

    // 如果是领导者，触发选举
    if (wasLeader) {
      this.currentLeader = null;
      this._triggerElection('leader_unregistered');
    }

    return true;
  }

  /**
   * 获取平台列表
   */
  listPlatforms(filters = {}) {
    let platforms = [...this.platforms.values()];
    if (filters.status) {
      platforms = platforms.filter(p => p.status === filters.status);
    }
    if (filters.role) {
      platforms = platforms.filter(p => p.role === filters.role);
    }
    return platforms;
  }

  /**
   * 获取平台
   */
  getPlatform(platformId) {
    return this.platforms.get(platformId) || null;
  }

  _registerSelf() {
    this.registerPlatform(this.platformId, {
      name: this.platformId,
      priority: 100 // 自身优先级高
    });
  }

  // ----------------------------------------------------------
  // 心跳检测
  // ----------------------------------------------------------

  /**
   * 发送心跳
   * @param {string} fromPlatformId - 发送方 ID
   * @returns {Object} 心跳结果
   */
  sendHeartbeat(fromPlatformId) {
    const platform = this.platforms.get(fromPlatformId);
    if (!platform) return { success: false, error: '平台未注册' };

    const now = Date.now();
    this.heartbeats.set(fromPlatformId, now);
    platform.lastHeartbeat = new Date(now).toISOString();
    platform.status = PLATFORM_STATUS.ONLINE;

    this.stats.heartbeatsSent++;

    return { success: true, timestamp: now };
  }

  /**
   * 接收并处理心跳
   * @param {string} fromPlatformId - 来源平台
   * @returns {Object} 处理结果
   */
  receiveHeartbeat(fromPlatformId) {
    const platform = this.platforms.get(fromPlatformId);
    if (!platform) return { success: false, error: '平台未注册' };

    this.heartbeats.set(fromPlatformId, Date.now());
    platform.lastHeartbeat = new Date().toISOString();

    // 如果之前是 DEGRADED/OFFLINE，恢复
    if (platform.status === PLATFORM_STATUS.DEGRADED || platform.status === PLATFORM_STATUS.OFFLINE) {
      platform.status = PLATFORM_STATUS.ONLINE;
      this._logEvent('platform_recovered', { platformId: fromPlatformId });
    }

    this.stats.heartbeatsReceived++;
    return { success: true };
  }

  /**
   * 检查心跳超时
   * @returns {Object} 超时检查结果
   */
  checkHeartbeats() {
    const now = Date.now();
    const timedOut = [];
    const degraded = [];

    for (const [platformId, lastBeat] of this.heartbeats) {
      if (platformId === this.platformId) continue; // 跳过自身

      const elapsed = now - lastBeat;
      const platform = this.platforms.get(platformId);
      if (!platform) continue;

      if (elapsed > this.heartbeatTimeout) {
        // 超时 — 标记为离线
        platform.status = PLATFORM_STATUS.OFFLINE;
        timedOut.push(platformId);
        this.stats.heartbeatsMissed++;
        this._logEvent('heartbeat_timeout', { platformId, elapsed });
      } else if (elapsed > this.heartbeatTimeout * 0.7) {
        // 接近超时 — 标记为降级
        if (platform.status === PLATFORM_STATUS.ONLINE) {
          platform.status = PLATFORM_STATUS.DEGRADED;
          degraded.push(platformId);
        }
      }
    }

    // 如果领导者超时，触发选举
    if (this.currentLeader && timedOut.includes(this.currentLeader)) {
      this._triggerElection('leader_timeout');
    }

    return { timedOut, degraded, checked: this.heartbeats.size };
  }

  // ----------------------------------------------------------
  // 选举机制
  // ----------------------------------------------------------

  /**
   * 触发领导者选举
   * @param {string} reason - 选举原因
   * @returns {Object} 选举结果
   */
  startElection(reason) {
    return this._triggerElection(reason || 'manual');
  }

  _triggerElection(reason) {
    if (this.electionState === ELECTION_STATE.ELECTING) {
      return { success: false, error: '选举进行中' };
    }

    this.electionState = ELECTION_STATE.ELECTING;
    this.stats.electionsHeld++;

    // 获取所有在线平台
    const candidates = [...this.platforms.values()].filter(
      p => p.status === PLATFORM_STATUS.ONLINE
    );

    if (candidates.length === 0) {
      this.electionState = ELECTION_STATE.IDLE;
      return { success: false, error: '无可用候选平台' };
    }

    // 选举规则: 按优先级 → 注册时间排序
    candidates.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return new Date(a.registeredAt) - new Date(b.registeredAt);
    });

    const winner = candidates[0];
    const previousLeader = this.currentLeader;

    // 更新角色
    for (const platform of this.platforms.values()) {
      platform.role = platform.id === winner.id ? POSITION_ROLE.LEADER : POSITION_ROLE.FOLLOWER;
    }

    this.currentLeader = winner.id;
    this.electionState = ELECTION_STATE.RESOLVED;

    if (winner.id === this.platformId) {
      this.role = POSITION_ROLE.LEADER;
    } else {
      this.role = POSITION_ROLE.FOLLOWER;
    }

    if (previousLeader !== winner.id) {
      this.stats.leaderChanges++;
    }

    const electionRecord = {
      id: `election_${Date.now()}`,
      reason,
      candidates: candidates.map(c => ({ id: c.id, priority: c.priority })),
      winner: winner.id,
      previousLeader,
      resolvedAt: new Date().toISOString()
    };
    this.electionHistory.push(electionRecord);

    this._logEvent('election_resolved', {
      winner: winner.id,
      reason,
      candidates: candidates.length
    });

    // 重置选举状态
    setTimeout(() => { this.electionState = ELECTION_STATE.IDLE; }, 0);

    return {
      success: true,
      winner: winner.id,
      previousLeader,
      candidates: candidates.length,
      reason
    };
  }

  /**
   * 获取当前领导者
   */
  getCurrentLeader() {
    if (!this.currentLeader) return null;
    return this.platforms.get(this.currentLeader) || null;
  }

  /**
   * 当前是否是领导者
   */
  isLeader() {
    return this.role === POSITION_ROLE.LEADER;
  }

  // ----------------------------------------------------------
  // 任务委派
  // ----------------------------------------------------------

  /**
   * 委派任务给指定平台
   * @param {string} targetPlatformId - 目标平台
   * @param {Object} task - 任务定义
   * @returns {Object} 委派结果
   */
  delegateTask(targetPlatformId, task) {
    // 只有领导者可以委派
    if (this.role !== POSITION_ROLE.LEADER) {
      return { success: false, error: '只有领导者可以委派任务' };
    }

    const target = this.platforms.get(targetPlatformId);
    if (!target) {
      return { success: false, error: '目标平台未注册' };
    }
    if (target.status !== PLATFORM_STATUS.ONLINE) {
      return { success: false, error: `目标平台状态异常: ${target.status}` };
    }

    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    const delegation = {
      id: taskId,
      targetPlatform: targetPlatformId,
      delegatedBy: this.platformId,
      task: {
        name: task.name || 'unnamed',
        type: task.type || 'general',
        payload: task.payload || {},
        priority: task.priority || 0,
        timeout: task.timeout || 30000
      },
      status: TASK_DELEGATION_STATUS.ASSIGNED,
      delegatedAt: new Date().toISOString(),
      completedAt: null,
      result: null
    };

    this.delegatedTasks.set(taskId, delegation);
    this.stats.tasksDelegated++;

    this._logEvent('task_delegated', { taskId, target: targetPlatformId, name: task.name });

    return { success: true, taskId, delegation };
  }

  /**
   * 自动分配任务 (按负载均衡)
   * @param {Object} task - 任务定义
   * @returns {Object} 分配结果
   */
  autoDelegate(task) {
    if (this.role !== POSITION_ROLE.LEADER) {
      return { success: false, error: '只有领导者可以委派任务' };
    }

    // 获取所有在线的 follower
    const followers = [...this.platforms.values()].filter(
      p => p.status === PLATFORM_STATUS.ONLINE &&
        p.role === POSITION_ROLE.FOLLOWER
    );

    if (followers.length === 0) {
      // 如果只有领导者，自己处理
      return this.delegateTask(this.platformId, task);
    }

    // 按能力匹配
    let best = null;
    if (task.requiredCapability) {
      best = followers.find(f => f.capabilities.includes(task.requiredCapability));
    }

    // 按当前负载 (分配的任务数)
    if (!best) {
      const taskCounts = new Map();
      for (const f of followers) {
        taskCounts.set(f.id, 0);
      }
      for (const [, d] of this.delegatedTasks) {
        if (d.status === TASK_DELEGATION_STATUS.ASSIGNED || d.status === TASK_DELEGATION_STATUS.ACCEPTED) {
          const count = taskCounts.get(d.targetPlatform) || 0;
          taskCounts.set(d.targetPlatform, count + 1);
        }
      }
      // 选最少任务的
      best = followers.reduce((min, f) => {
        const count = taskCounts.get(f.id) || 0;
        const minCount = taskCounts.get(min.id) || 0;
        return count < minCount ? f : min;
      }, followers[0]);
    }

    return this.delegateTask(best.id, task);
  }

  /**
   * 完成委派的任务
   * @param {string} taskId - 任务 ID
   * @param {Object} result - 结果
   * @returns {boolean}
   */
  completeTask(taskId, result = {}) {
    const delegation = this.delegatedTasks.get(taskId);
    if (!delegation) return false;

    delegation.status = result.success !== false
      ? TASK_DELEGATION_STATUS.COMPLETED
      : TASK_DELEGATION_STATUS.FAILED;
    delegation.completedAt = new Date().toISOString();
    delegation.result = result;

    if (delegation.status === TASK_DELEGATION_STATUS.COMPLETED) {
      this.stats.tasksCompleted++;
    }

    this._logEvent('task_completed', {
      taskId,
      status: delegation.status,
      target: delegation.targetPlatform
    });

    return true;
  }

  /**
   * 获取委派的任务
   */
  getDelegatedTask(taskId) {
    return this.delegatedTasks.get(taskId) || null;
  }

  /**
   * 列出委派的任务
   */
  listDelegatedTasks(filters = {}) {
    let tasks = [...this.delegatedTasks.values()];
    if (filters.status) {
      tasks = tasks.filter(t => t.status === filters.status);
    }
    if (filters.platform) {
      tasks = tasks.filter(t => t.targetPlatform === filters.platform);
    }
    return tasks;
  }

  // ----------------------------------------------------------
  // 状态同步
  // ----------------------------------------------------------

  /**
   * 更新共享状态 (仅领导者)
   * @param {string} key - 键
   * @param {*} value - 值
   * @returns {Object} 更新结果
   */
  updateSharedState(key, value) {
    if (this.role !== POSITION_ROLE.LEADER && this.platforms.size > 1) {
      return { success: false, error: '只有领导者可以更新共享状态' };
    }

    const previous = this.sharedState[key];
    this.sharedState[key] = value;
    this.stateVersion++;

    this.stateLog.push({
      version: this.stateVersion,
      key,
      previousValue: previous,
      newValue: value,
      updatedBy: this.platformId,
      updatedAt: new Date().toISOString()
    });

    // 限制状态日志
    if (this.stateLog.length > 200) {
      this.stateLog = this.stateLog.slice(-200);
    }

    this.stats.stateSyncs++;
    this._logEvent('state_updated', { key, version: this.stateVersion });

    return { success: true, version: this.stateVersion };
  }

  /**
   * 获取共享状态
   */
  getSharedState(key) {
    if (key) return this.sharedState[key];
    return { ...this.sharedState };
  }

  /**
   * 获取状态版本
   */
  getStateVersion() {
    return this.stateVersion;
  }

  /**
   * 同步状态到目标平台 (生成同步包)
   * @returns {Object} 状态同步包
   */
  createSyncPackage() {
    return {
      version: this.stateVersion,
      state: { ...this.sharedState },
      leader: this.currentLeader,
      platforms: [...this.platforms.values()].map(p => ({
        id: p.id,
        status: p.status,
        role: p.role
      })),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 应用同步包
   * @param {Object} syncPackage - 同步包
   * @returns {Object} 应用结果
   */
  applySyncPackage(syncPackage) {
    if (!syncPackage || !syncPackage.version) {
      return { success: false, error: '无效的同步包' };
    }

    // 只接受更新版本的状态
    if (syncPackage.version <= this.stateVersion) {
      return { success: false, error: '同步包版本过旧', localVersion: this.stateVersion };
    }

    this.sharedState = { ...syncPackage.state };
    this.stateVersion = syncPackage.version;

    if (syncPackage.leader) {
      this.currentLeader = syncPackage.leader;
      if (this.currentLeader === this.platformId) {
        this.role = POSITION_ROLE.LEADER;
      } else {
        this.role = POSITION_ROLE.FOLLOWER;
      }
    }

    this.stats.stateSyncs++;
    this._logEvent('state_synced', { version: syncPackage.version });

    return { success: true, version: this.stateVersion };
  }

  // ----------------------------------------------------------
  // 故障恢复
  // ----------------------------------------------------------

  /**
   * 模拟领导者崩溃并自动恢复
   * @returns {Object} 恢复结果
   */
  simulateLeaderCrash() {
    if (!this.currentLeader) {
      return { success: false, error: '当前无领导者' };
    }

    const crashedLeader = this.currentLeader;
    const platform = this.platforms.get(crashedLeader);
    if (platform) {
      platform.status = PLATFORM_STATUS.OFFLINE;
    }

    this._logEvent('leader_crash', { leader: crashedLeader });

    // 触发自动选举
    const election = this._triggerElection('leader_crash');

    return {
      success: election.success,
      crashedLeader,
      newLeader: election.winner || null,
      recovered: election.success
    };
  }

  // ----------------------------------------------------------
  // 查询接口
  // ----------------------------------------------------------

  /**
   * 获取选举历史
   */
  getElectionHistory(limit = 10) {
    return this.electionHistory.slice(-limit);
  }

  /**
   * 获取事件日志
   */
  getEventLog(limit = 50) {
    return this.eventLog.slice(-limit);
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ...this.stats,
      currentRole: this.role,
      currentLeader: this.currentLeader,
      platformCount: this.platforms.size,
      onlinePlatforms: [...this.platforms.values()].filter(p => p.status === PLATFORM_STATUS.ONLINE).length,
      stateVersion: this.stateVersion,
      delegatedTaskCount: this.delegatedTasks.size,
      electionState: this.electionState
    };
  }

  // ----------------------------------------------------------
  // 内部方法
  // ----------------------------------------------------------

  _logEvent(event, data = {}) {
    this.eventLog.push({
      event,
      timestamp: new Date().toISOString(),
      ...data
    });

    if (this.eventLog.length > 500) {
      this.eventLog = this.eventLog.slice(-500);
    }
  }
}

// ============================================================
// 导出
// ============================================================

module.exports = {
  SupervisorPosition,
  PLATFORM_STATUS,
  POSITION_ROLE,
  ELECTION_STATE,
  TASK_DELEGATION_STATUS
};
