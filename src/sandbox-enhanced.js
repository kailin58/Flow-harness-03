/**
 * sandbox-enhanced.js - 高级安全沙箱增强
 *
 * 文档要求(P2): 高级安全
 *   - 沙箱配置模板 (strict/standard/permissive)
 *   - 资源限制配置 (CPU/内存/IO/网络)
 *   - 文件系统隔离规则
 *   - 网络策略管理
 *   - 沙箱快照与恢复
 *   - 审计日志增强
 *
 * @version 1.0.0
 * @date 2026-04-13
 */

const { createLogger } = require('./logger');

// ============================================================
// 常量
// ============================================================

const SANDBOX_PROFILE = {
  STRICT: 'strict',
  STANDARD: 'standard',
  PERMISSIVE: 'permissive',
  CUSTOM: 'custom'
};

const RESOURCE_TYPE = {
  CPU: 'cpu',
  MEMORY: 'memory',
  DISK_IO: 'disk_io',
  NETWORK: 'network',
  PROCESS: 'process',
  FILE_DESCRIPTORS: 'file_descriptors'
};

const NETWORK_POLICY = {
  DENY_ALL: 'deny_all',
  ALLOW_ALL: 'allow_all',
  WHITELIST: 'whitelist',
  RESTRICTED: 'restricted'
};

const AUDIT_EVENT = {
  SANDBOX_CREATED: 'sandbox_created',
  SANDBOX_DESTROYED: 'sandbox_destroyed',
  RESOURCE_VIOLATION: 'resource_violation',
  NETWORK_BLOCKED: 'network_blocked',
  FILE_ACCESS_DENIED: 'file_access_denied',
  SNAPSHOT_CREATED: 'snapshot_created',
  SNAPSHOT_RESTORED: 'snapshot_restored',
  POLICY_CHANGED: 'policy_changed'
};

// 预置配置模板
const PROFILE_TEMPLATES = {
  [SANDBOX_PROFILE.STRICT]: {
    resources: {
      cpuPercent: 25,
      memoryMB: 256,
      diskIOMBps: 10,
      maxProcesses: 5,
      maxFileDescriptors: 64
    },
    network: {
      policy: NETWORK_POLICY.DENY_ALL,
      allowedHosts: [],
      allowedPorts: []
    },
    filesystem: {
      readOnly: true,
      allowedPaths: ['/tmp/sandbox'],
      deniedPaths: ['/', '/etc', '/var', '/usr'],
      maxFileSizeMB: 10
    },
    execution: {
      timeoutMs: 30000,
      allowShell: false,
      allowNetwork: false,
      allowFileWrite: false
    }
  },
  [SANDBOX_PROFILE.STANDARD]: {
    resources: {
      cpuPercent: 50,
      memoryMB: 512,
      diskIOMBps: 50,
      maxProcesses: 20,
      maxFileDescriptors: 256
    },
    network: {
      policy: NETWORK_POLICY.RESTRICTED,
      allowedHosts: ['*.npmjs.org', '*.github.com'],
      allowedPorts: [80, 443]
    },
    filesystem: {
      readOnly: false,
      allowedPaths: ['/tmp', '/home', '/workspace'],
      deniedPaths: ['/etc/shadow', '/etc/passwd'],
      maxFileSizeMB: 100
    },
    execution: {
      timeoutMs: 120000,
      allowShell: true,
      allowNetwork: true,
      allowFileWrite: true
    }
  },
  [SANDBOX_PROFILE.PERMISSIVE]: {
    resources: {
      cpuPercent: 90,
      memoryMB: 2048,
      diskIOMBps: 200,
      maxProcesses: 100,
      maxFileDescriptors: 1024
    },
    network: {
      policy: NETWORK_POLICY.ALLOW_ALL,
      allowedHosts: ['*'],
      allowedPorts: []
    },
    filesystem: {
      readOnly: false,
      allowedPaths: ['*'],
      deniedPaths: [],
      maxFileSizeMB: 1024
    },
    execution: {
      timeoutMs: 600000,
      allowShell: true,
      allowNetwork: true,
      allowFileWrite: true
    }
  }
};

// ============================================================
// SandboxEnhanced
// ============================================================

class SandboxEnhanced {
  /**
   * @param {Object} options
   * @param {string} options.profile       - 安全配置文件
   * @param {Object} options.overrides     - 覆盖配置
   * @param {Object} options.logger
   */
  constructor(options = {}) {
    this.profile = options.profile || SANDBOX_PROFILE.STANDARD;
    this.logger = options.logger || createLogger({ name: 'sandbox-enhanced' });

    // 加载模板配置
    const template = PROFILE_TEMPLATES[this.profile] || PROFILE_TEMPLATES[SANDBOX_PROFILE.STANDARD];
    this.config = this._deepMerge(template, options.overrides || {});

    // 沙箱实例
    this.instances = new Map();
    // 审计日志
    this.auditLog = [];
    // 快照
    this.snapshots = new Map();
    // 资源使用追踪
    this.resourceUsage = new Map();
    // 网络规则缓存
    this._networkRulesCache = new Map();

    this._instanceCounter = 0;
  }

  // ----------------------------------------------------------
  // 沙箱实例管理
  // ----------------------------------------------------------

  /**
   * 创建沙箱实例
   * @param {string} name          - 沙箱名
   * @param {Object} instanceConfig - 实例级配置覆盖
   * @returns {Object} 实例信息
   */
  createInstance(name, instanceConfig = {}) {
    const id = `sb_${++this._instanceCounter}_${Date.now()}`;
    const config = this._deepMerge(this.config, instanceConfig);

    const instance = {
      id,
      name: name || `sandbox-${this._instanceCounter}`,
      profile: this.profile,
      config,
      status: 'running',
      createdAt: new Date().toISOString(),
      pid: null,
      resourceUsage: {
        cpuPercent: 0,
        memoryMB: 0,
        diskIOMBps: 0,
        processCount: 0,
        fileDescriptors: 0
      }
    };

    this.instances.set(id, instance);
    this.resourceUsage.set(id, { violations: [], history: [] });

    this._audit(AUDIT_EVENT.SANDBOX_CREATED, { instanceId: id, name, profile: this.profile });

    return instance;
  }

  /**
   * 销毁沙箱实例
   */
  destroyInstance(instanceId) {
    const instance = this.instances.get(instanceId);
    if (!instance) return false;

    instance.status = 'destroyed';
    instance.destroyedAt = new Date().toISOString();
    this.instances.delete(instanceId);

    this._audit(AUDIT_EVENT.SANDBOX_DESTROYED, { instanceId });
    return true;
  }

  /**
   * 获取实例
   */
  getInstance(instanceId) {
    return this.instances.get(instanceId) || null;
  }

  /**
   * 列出所有实例
   */
  listInstances() {
    return [...this.instances.values()].map(inst => ({
      id: inst.id,
      name: inst.name,
      profile: inst.profile,
      status: inst.status,
      createdAt: inst.createdAt
    }));
  }

  // ----------------------------------------------------------
  // 资源限制
  // ----------------------------------------------------------

  /**
   * 检查资源使用是否在限制内
   * @param {string} instanceId
   * @param {Object} usage - 当前资源使用
   * @returns {Object} { allowed, violations }
   */
  checkResources(instanceId, usage) {
    const instance = this.instances.get(instanceId);
    if (!instance) return { allowed: false, error: 'Instance not found' };

    const limits = instance.config.resources;
    const violations = [];

    if (usage.cpuPercent !== undefined && usage.cpuPercent > limits.cpuPercent) {
      violations.push({ resource: RESOURCE_TYPE.CPU, limit: limits.cpuPercent, actual: usage.cpuPercent });
    }
    if (usage.memoryMB !== undefined && usage.memoryMB > limits.memoryMB) {
      violations.push({ resource: RESOURCE_TYPE.MEMORY, limit: limits.memoryMB, actual: usage.memoryMB });
    }
    if (usage.diskIOMBps !== undefined && usage.diskIOMBps > limits.diskIOMBps) {
      violations.push({ resource: RESOURCE_TYPE.DISK_IO, limit: limits.diskIOMBps, actual: usage.diskIOMBps });
    }
    if (usage.processCount !== undefined && usage.processCount > limits.maxProcesses) {
      violations.push({ resource: RESOURCE_TYPE.PROCESS, limit: limits.maxProcesses, actual: usage.processCount });
    }
    if (usage.fileDescriptors !== undefined && usage.fileDescriptors > limits.maxFileDescriptors) {
      violations.push({ resource: RESOURCE_TYPE.FILE_DESCRIPTORS, limit: limits.maxFileDescriptors, actual: usage.fileDescriptors });
    }

    // 更新实例资源使用
    instance.resourceUsage = { ...instance.resourceUsage, ...usage };

    // 记录违规
    if (violations.length > 0) {
      const tracker = this.resourceUsage.get(instanceId);
      if (tracker) {
        tracker.violations.push(...violations.map(v => ({ ...v, at: new Date().toISOString() })));
      }
      this._audit(AUDIT_EVENT.RESOURCE_VIOLATION, { instanceId, violations });
    }

    return { allowed: violations.length === 0, violations };
  }

  /**
   * 获取资源限制
   */
  getResourceLimits(instanceId) {
    const instance = this.instances.get(instanceId);
    if (!instance) return null;
    return { ...instance.config.resources };
  }

  /**
   * 动态调整资源限制
   */
  adjustResources(instanceId, newLimits) {
    const instance = this.instances.get(instanceId);
    if (!instance) return { success: false, error: 'Instance not found' };

    instance.config.resources = { ...instance.config.resources, ...newLimits };
    this._audit(AUDIT_EVENT.POLICY_CHANGED, { instanceId, changes: newLimits });

    return { success: true, resources: instance.config.resources };
  }

  // ----------------------------------------------------------
  // 文件系统隔离
  // ----------------------------------------------------------

  /**
   * 检查文件访问权限
   * @param {string} instanceId
   * @param {string} filePath
   * @param {string} operation - 'read' | 'write' | 'execute'
   * @returns {Object} { allowed, reason }
   */
  checkFileAccess(instanceId, filePath, operation = 'read') {
    const instance = this.instances.get(instanceId);
    if (!instance) return { allowed: false, reason: 'Instance not found' };

    const fs = instance.config.filesystem;

    // 只读模式下禁止写入
    if (fs.readOnly && (operation === 'write' || operation === 'execute')) {
      this._audit(AUDIT_EVENT.FILE_ACCESS_DENIED, { instanceId, filePath, operation, reason: 'read_only' });
      return { allowed: false, reason: 'Filesystem is read-only' };
    }

    // 执行权限检查
    if (!instance.config.execution.allowFileWrite && operation === 'write') {
      this._audit(AUDIT_EVENT.FILE_ACCESS_DENIED, { instanceId, filePath, operation, reason: 'write_disabled' });
      return { allowed: false, reason: 'File write not allowed' };
    }

    // 允许列表优先（精确匹配优先于拒绝列表）
    let explicitlyAllowed = false;
    if (fs.allowedPaths[0] === '*') {
      explicitlyAllowed = true;
    } else {
      explicitlyAllowed = fs.allowedPaths.some(ap => filePath.startsWith(ap));
    }

    // 拒绝列表（仅对非显式允许的路径生效）
    if (!explicitlyAllowed) {
      for (const denied of fs.deniedPaths) {
        if (filePath.startsWith(denied)) {
          this._audit(AUDIT_EVENT.FILE_ACCESS_DENIED, { instanceId, filePath, operation, reason: 'denied_path' });
          return { allowed: false, reason: `Path denied: ${denied}` };
        }
      }
    } else {
      // 即使显式允许，也检查精确拒绝（拒绝路径比允许路径更具体时生效）
      for (const denied of fs.deniedPaths) {
        if (filePath.startsWith(denied) && denied.length > 1) {
          // 检查是否有更具体的允许路径覆盖
          const hasMoreSpecificAllow = fs.allowedPaths.some(ap =>
            filePath.startsWith(ap) && ap.length >= denied.length
          );
          if (!hasMoreSpecificAllow) {
            this._audit(AUDIT_EVENT.FILE_ACCESS_DENIED, { instanceId, filePath, operation, reason: 'denied_path' });
            return { allowed: false, reason: `Path denied: ${denied}` };
          }
        }
      }
    }

    // 如果不在允许列表且未被拒绝
    if (!explicitlyAllowed) {
      this._audit(AUDIT_EVENT.FILE_ACCESS_DENIED, { instanceId, filePath, operation, reason: 'not_in_allowed' });
      return { allowed: false, reason: 'Path not in allowed list' };
    }

    return { allowed: true };
  }

  // ----------------------------------------------------------
  // 网络策略
  // ----------------------------------------------------------

  /**
   * 检查网络访问权限
   * @param {string} instanceId
   * @param {string} host
   * @param {number} port
   * @returns {Object} { allowed, reason }
   */
  checkNetworkAccess(instanceId, host, port = 443) {
    const instance = this.instances.get(instanceId);
    if (!instance) return { allowed: false, reason: 'Instance not found' };

    if (!instance.config.execution.allowNetwork) {
      this._audit(AUDIT_EVENT.NETWORK_BLOCKED, { instanceId, host, port, reason: 'network_disabled' });
      return { allowed: false, reason: 'Network access disabled' };
    }

    const net = instance.config.network;

    switch (net.policy) {
      case NETWORK_POLICY.DENY_ALL:
        this._audit(AUDIT_EVENT.NETWORK_BLOCKED, { instanceId, host, port, reason: 'deny_all' });
        return { allowed: false, reason: 'Network policy: deny all' };

      case NETWORK_POLICY.ALLOW_ALL:
        return { allowed: true };

      case NETWORK_POLICY.WHITELIST:
      case NETWORK_POLICY.RESTRICTED: {
        // 检查主机
        const hostAllowed = net.allowedHosts.some(pattern => {
          if (pattern === '*') return true;
          if (pattern.startsWith('*.')) {
            return host.endsWith(pattern.slice(1));
          }
          return host === pattern;
        });

        if (!hostAllowed) {
          this._audit(AUDIT_EVENT.NETWORK_BLOCKED, { instanceId, host, port, reason: 'host_not_allowed' });
          return { allowed: false, reason: `Host not allowed: ${host}` };
        }

        // 检查端口
        if (net.allowedPorts.length > 0 && !net.allowedPorts.includes(port)) {
          this._audit(AUDIT_EVENT.NETWORK_BLOCKED, { instanceId, host, port, reason: 'port_not_allowed' });
          return { allowed: false, reason: `Port not allowed: ${port}` };
        }

        return { allowed: true };
      }

      default:
        return { allowed: false, reason: 'Unknown network policy' };
    }
  }

  /**
   * 添加网络白名单
   */
  addNetworkWhitelist(instanceId, host, ports = []) {
    const instance = this.instances.get(instanceId);
    if (!instance) return false;

    if (!instance.config.network.allowedHosts.includes(host)) {
      instance.config.network.allowedHosts.push(host);
    }
    for (const port of ports) {
      if (!instance.config.network.allowedPorts.includes(port)) {
        instance.config.network.allowedPorts.push(port);
      }
    }

    this._audit(AUDIT_EVENT.POLICY_CHANGED, { instanceId, addedHost: host, addedPorts: ports });
    return true;
  }

  // ----------------------------------------------------------
  // 快照
  // ----------------------------------------------------------

  /**
   * 创建快照
   * @param {string} instanceId
   * @param {string} label
   * @returns {Object} 快照信息
   */
  createSnapshot(instanceId, label = '') {
    const instance = this.instances.get(instanceId);
    if (!instance) return { success: false, error: 'Instance not found' };

    const snapshotId = `snap_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    const snapshot = {
      id: snapshotId,
      instanceId,
      label: label || `snapshot-${snapshotId}`,
      config: JSON.parse(JSON.stringify(instance.config)),
      resourceUsage: { ...instance.resourceUsage },
      createdAt: new Date().toISOString()
    };

    if (!this.snapshots.has(instanceId)) {
      this.snapshots.set(instanceId, []);
    }
    this.snapshots.get(instanceId).push(snapshot);

    this._audit(AUDIT_EVENT.SNAPSHOT_CREATED, { instanceId, snapshotId, label });

    return { success: true, snapshot };
  }

  /**
   * 恢复快照
   */
  restoreSnapshot(instanceId, snapshotId) {
    const snaps = this.snapshots.get(instanceId);
    if (!snaps) return { success: false, error: 'No snapshots found' };

    const snapshot = snaps.find(s => s.id === snapshotId);
    if (!snapshot) return { success: false, error: 'Snapshot not found' };

    const instance = this.instances.get(instanceId);
    if (!instance) return { success: false, error: 'Instance not found' };

    instance.config = JSON.parse(JSON.stringify(snapshot.config));
    instance.resourceUsage = { ...snapshot.resourceUsage };

    this._audit(AUDIT_EVENT.SNAPSHOT_RESTORED, { instanceId, snapshotId });

    return { success: true, snapshot };
  }

  /**
   * 列出快照
   */
  listSnapshots(instanceId) {
    return this.snapshots.get(instanceId) || [];
  }

  // ----------------------------------------------------------
  // 审计日志
  // ----------------------------------------------------------

  _audit(event, data) {
    this.auditLog.push({
      id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      event,
      data,
      timestamp: new Date().toISOString()
    });

    if (this.auditLog.length > 5000) {
      this.auditLog = this.auditLog.slice(-2500);
    }
  }

  /**
   * 获取审计日志
   * @param {Object} filters
   */
  getAuditLog(filters = {}) {
    let log = [...this.auditLog];

    if (filters.event) {
      log = log.filter(l => l.event === filters.event);
    }
    if (filters.instanceId) {
      log = log.filter(l => l.data && l.data.instanceId === filters.instanceId);
    }
    if (filters.limit) {
      log = log.slice(-filters.limit);
    }

    return log;
  }

  // ----------------------------------------------------------
  // 配置模板
  // ----------------------------------------------------------

  /**
   * 获取配置模板
   */
  static getProfileTemplate(profile) {
    return PROFILE_TEMPLATES[profile] ? JSON.parse(JSON.stringify(PROFILE_TEMPLATES[profile])) : null;
  }

  /**
   * 列出可用模板
   */
  static listProfiles() {
    return Object.keys(PROFILE_TEMPLATES);
  }

  // ----------------------------------------------------------
  // 统计
  // ----------------------------------------------------------

  getStats() {
    const violations = [];
    for (const [id, tracker] of this.resourceUsage) {
      violations.push(...tracker.violations.map(v => ({ instanceId: id, ...v })));
    }

    return {
      activeInstances: this.instances.size,
      profile: this.profile,
      totalSnapshots: [...this.snapshots.values()].reduce((s, snaps) => s + snaps.length, 0),
      totalViolations: violations.length,
      recentViolations: violations.slice(-10),
      auditLogSize: this.auditLog.length,
      config: {
        resources: this.config.resources,
        networkPolicy: this.config.network.policy,
        filesystemReadOnly: this.config.filesystem.readOnly
      }
    };
  }

  // ----------------------------------------------------------
  // 内部工具
  // ----------------------------------------------------------

  _deepMerge(target, source) {
    const result = { ...target };
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) &&
          target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
        result[key] = this._deepMerge(target[key], source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  }
}

// ============================================================
// 导出
// ============================================================

module.exports = {
  SandboxEnhanced,
  SANDBOX_PROFILE,
  RESOURCE_TYPE,
  NETWORK_POLICY,
  AUDIT_EVENT,
  PROFILE_TEMPLATES
};
