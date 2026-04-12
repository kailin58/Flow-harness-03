/**
 * IPC Channel - 进程间通信通道
 * 基于文件系统的跨平台通信机制
 *
 * 目录结构：
 *   .flowharness/tasks/
 *     inbox/    ← 接收的任务
 *     outbox/   ← 发出的任务
 *     results/  ← 任务结果
 *     state/    ← 状态文件（领导权、心跳等）
 */
const fs = require('fs');
const path = require('path');
const TaskSerializer = require('./task-serializer');

class IPCChannel {
  constructor(config = {}) {
    this.config = {
      tasksDir: config.tasksDir || '.flowharness/tasks',
      workingDir: config.workingDir || process.cwd(),
      cleanupAge: config.cleanupAge || 24 * 60 * 60 * 1000, // 24小时
      ...config
    };

    this.serializer = config.serializer || new TaskSerializer();
    this.basePath = path.isAbsolute(this.config.tasksDir)
      ? this.config.tasksDir
      : path.join(this.config.workingDir, this.config.tasksDir);

    this.dirs = {
      inbox: path.join(this.basePath, 'inbox'),
      outbox: path.join(this.basePath, 'outbox'),
      results: path.join(this.basePath, 'results'),
      state: path.join(this.basePath, 'state')
    };

    this._stats = {
      sent: 0,
      received: 0,
      resultsSubmitted: 0,
      resultsCollected: 0,
      errors: 0
    };

    this._initialized = false;
  }

  /**
   * 初始化目录结构
   */
  async initialize() {
    for (const dir of Object.values(this.dirs)) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
    this._initialized = true;
  }

  /**
   * 确保已初始化
   */
  _ensureInit() {
    if (!this._initialized) {
      this.initialize();
    }
  }

  /**
   * 发送任务到 outbox
   * @param {Object} task - 任务对象
   * @param {string} targetPlatform - 目标平台
   * @param {Object} metadata - 附加元数据
   * @returns {string} taskId
   */
  async send(task, targetPlatform, metadata = {}) {
    this._ensureInit();
    const taskId = metadata.taskId || this.serializer.generateTaskId();
    const filePath = path.join(this.dirs.outbox, `${taskId}.json`);

    const fullMeta = {
      ...metadata,
      taskId,
      target: { platform: targetPlatform, agentId: metadata.agentId || null },
      source: metadata.source || { platform: 'unknown' },
      state: 'pending'
    };

    this._atomicWrite(filePath, this.serializer.serialize(task, fullMeta).json);
    this._stats.sent++;
    return taskId;
  }

  /**
   * 接收 inbox 中的任务
   * @returns {Array} 任务列表
   */
  async receive() {
    this._ensureInit();
    const tasks = [];
    const files = this._listJsonFiles(this.dirs.inbox);

    for (const file of files) {
      try {
        const result = this.serializer.deserializeFromFile(file);
        if (result.valid) {
          tasks.push({
            ...result,
            filePath: file
          });
        }
      } catch (e) {
        this._stats.errors++;
      }
    }

    // 按时间排序
    tasks.sort((a, b) => {
      const ta = new Date(a.metadata.timestamp).getTime();
      const tb = new Date(b.metadata.timestamp).getTime();
      return ta - tb;
    });

    this._stats.received += tasks.length;
    return tasks;
  }

  /**
   * 提交任务结果
   * @param {string} taskId
   * @param {Object} result - 结果对象
   */
  async submitResult(taskId, result) {
    this._ensureInit();
    const filePath = path.join(this.dirs.results, `${taskId}-result.json`);
    const data = {
      taskId,
      timestamp: new Date().toISOString(),
      result,
      state: result.success !== false ? 'completed' : 'failed'
    };
    this._atomicWrite(filePath, JSON.stringify(data, null, 2));
    this._stats.resultsSubmitted++;
  }

  /**
   * 获取任务结果
   * @param {string} taskId
   * @returns {Object|null}
   */
  async getResult(taskId) {
    this._ensureInit();
    const filePath = path.join(this.dirs.results, `${taskId}-result.json`);
    try {
      if (!fs.existsSync(filePath)) return null;
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      this._stats.resultsCollected++;
      return data;
    } catch (e) {
      this._stats.errors++;
      return null;
    }
  }

  /**
   * 更新任务状态
   * @param {string} taskId
   * @param {string} newState
   */
  async updateState(taskId, newState) {
    this._ensureInit();
    // 在 inbox 和 outbox 中查找
    for (const dir of [this.dirs.inbox, this.dirs.outbox]) {
      const filePath = path.join(dir, `${taskId}.json`);
      if (fs.existsSync(filePath)) {
        try {
          const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          data.state = newState;
          // 重新计算 checksum
          const copy = { ...data };
          delete copy.checksum;
          data.checksum = require('crypto')
            .createHash('sha256')
            .update(JSON.stringify(copy), 'utf-8')
            .digest('hex');
          this._atomicWrite(filePath, JSON.stringify(data, null, 2));
          return true;
        } catch (e) {
          this._stats.errors++;
        }
      }
    }
    return false;
  }

  /**
   * 列出 inbox 中待处理的任务
   * @returns {Array}
   */
  async listPending() {
    this._ensureInit();
    const tasks = await this.receive();
    return tasks.filter(t => t.metadata.state === 'pending');
  }

  /**
   * 列出 outbox 中的任务
   * @returns {Array}
   */
  async listOutgoing() {
    this._ensureInit();
    const tasks = [];
    const files = this._listJsonFiles(this.dirs.outbox);

    for (const file of files) {
      try {
        const result = this.serializer.deserializeFromFile(file);
        if (result.valid) {
          tasks.push({ ...result, filePath: file });
        }
      } catch (e) {
        this._stats.errors++;
      }
    }
    return tasks;
  }

  /**
   * 写入状态文件
   * @param {string} key - 状态键
   * @param {Object} data - 状态数据
   */
  async writeState(key, data) {
    this._ensureInit();
    const filePath = path.join(this.dirs.state, `${key}.json`);
    this._atomicWrite(filePath, JSON.stringify(data, null, 2));
  }

  /**
   * 读取状态文件
   * @param {string} key - 状态键
   * @returns {Object|null}
   */
  async readState(key) {
    this._ensureInit();
    const filePath = path.join(this.dirs.state, `${key}.json`);
    try {
      if (!fs.existsSync(filePath)) return null;
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (e) {
      return null;
    }
  }

  /**
   * 清理过期文件
   * @param {number} olderThanMs - 过期时间（毫秒）
   * @returns {number} 清理的文件数
   */
  async cleanup(olderThanMs) {
    this._ensureInit();
    const maxAge = olderThanMs || this.config.cleanupAge;
    const now = Date.now();
    let cleaned = 0;

    for (const dir of [this.dirs.inbox, this.dirs.outbox, this.dirs.results]) {
      const files = this._listJsonFiles(dir);
      for (const file of files) {
        try {
          const stat = fs.statSync(file);
          if (now - stat.mtimeMs > maxAge) {
            fs.unlinkSync(file);
            cleaned++;
          }
        } catch (e) {
          // 忽略清理错误
        }
      }
    }
    return cleaned;
  }

  /**
   * 获取统计信息
   * @returns {Object}
   */
  getStats() {
    const pending = this._listJsonFiles(this.dirs.inbox).length;
    const outgoing = this._listJsonFiles(this.dirs.outbox).length;
    const results = this._listJsonFiles(this.dirs.results).length;

    return {
      ...this._stats,
      pendingInbox: pending,
      pendingOutbox: outgoing,
      totalResults: results,
      initialized: this._initialized
    };
  }

  // ========== 内部方法 ==========

  /**
   * 原子写入：先写临时文件再重命名
   */
  _atomicWrite(filePath, content) {
    const tmpPath = filePath + '.tmp';
    fs.writeFileSync(tmpPath, content, 'utf-8');
    fs.renameSync(tmpPath, filePath);
  }

  /**
   * 列出目录中的 JSON 文件
   */
  _listJsonFiles(dir) {
    try {
      if (!fs.existsSync(dir)) return [];
      return fs.readdirSync(dir)
        .filter(f => f.endsWith('.json'))
        .map(f => path.join(dir, f));
    } catch {
      return [];
    }
  }
}

module.exports = IPCChannel;
