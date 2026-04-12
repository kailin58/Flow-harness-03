/**
 * Task Serializer - 任务序列化器
 * 将任务对象序列化为 JSON 格式，用于跨平台传输
 *
 * 核心功能：
 * 1. 序列化/反序列化任务对象
 * 2. SHA256 校验和保证数据完整性
 * 3. 文件读写支持
 * 4. 格式验证
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const CURRENT_VERSION = '1.0';

class TaskSerializer {
  constructor(config = {}) {
    this.config = {
      version: config.version || CURRENT_VERSION,
      indent: config.indent !== undefined ? config.indent : 2,
      ...config
    };

    this._stats = {
      serialized: 0,
      deserialized: 0,
      fileWrites: 0,
      fileReads: 0,
      errors: 0
    };
  }

  /**
   * 生成唯一任务ID
   * @returns {string}
   */
  generateTaskId() {
    const ts = Date.now().toString(36);
    const rand = crypto.randomBytes(4).toString('hex');
    return `task-${ts}-${rand}`;
  }

  /**
   * 序列化任务为 JSON 字符串
   * @param {Object} task - 任务对象
   * @param {Object} metadata - 附加元数据
   * @returns {Object} { json, checksum, envelope }
   */
  serialize(task, metadata = {}) {
    const envelope = {
      version: this.config.version,
      taskId: metadata.taskId || this.generateTaskId(),
      timestamp: new Date().toISOString(),
      source: metadata.source || { platform: 'unknown', agentId: null },
      target: metadata.target || { platform: null, agentId: null },
      task: task,
      context: metadata.context || {},
      state: metadata.state || 'pending'
    };

    // 计算校验和（不含 checksum 字段本身）
    const payload = JSON.stringify(envelope);
    envelope.checksum = this._computeChecksum(payload);

    const json = JSON.stringify(envelope, null, this.config.indent);
    this._stats.serialized++;

    return { json, checksum: envelope.checksum, envelope };
  }

  /**
   * 反序列化 JSON 字符串为任务对象
   * @param {string} json - JSON 字符串
   * @returns {Object} { task, metadata, envelope, valid }
   */
  deserialize(json) {
    try {
      const envelope = JSON.parse(json);

      // 验证校验和
      const storedChecksum = envelope.checksum;
      const copy = { ...envelope };
      delete copy.checksum;
      const expectedChecksum = this._computeChecksum(JSON.stringify(copy));
      const checksumValid = storedChecksum === expectedChecksum;

      // 基本验证
      const validation = this.validate(envelope);

      this._stats.deserialized++;

      return {
        task: envelope.task,
        metadata: {
          taskId: envelope.taskId,
          timestamp: envelope.timestamp,
          source: envelope.source,
          target: envelope.target,
          context: envelope.context,
          state: envelope.state
        },
        envelope,
        valid: validation.valid && checksumValid,
        checksumValid,
        validationErrors: validation.errors
      };
    } catch (e) {
      this._stats.errors++;
      return {
        task: null,
        metadata: null,
        envelope: null,
        valid: false,
        checksumValid: false,
        validationErrors: [`解析失败: ${e.message}`]
      };
    }
  }

  /**
   * 序列化任务并写入文件
   * @param {Object} task - 任务对象
   * @param {string} filePath - 文件路径
   * @param {Object} metadata - 附加元数据
   * @returns {Object} { path, taskId, checksum }
   */
  serializeToFile(task, filePath, metadata = {}) {
    const { json, checksum, envelope } = this.serialize(task, metadata);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, json, 'utf-8');
    this._stats.fileWrites++;
    return { path: filePath, taskId: envelope.taskId, checksum };
  }

  /**
   * 从文件反序列化任务
   * @param {string} filePath - 文件路径
   * @returns {Object} 反序列化结果
   */
  deserializeFromFile(filePath) {
    try {
      const json = fs.readFileSync(filePath, 'utf-8');
      this._stats.fileReads++;
      return this.deserialize(json);
    } catch (e) {
      this._stats.errors++;
      return {
        task: null,
        metadata: null,
        envelope: null,
        valid: false,
        checksumValid: false,
        validationErrors: [`文件读取失败: ${e.message}`]
      };
    }
  }

  /**
   * 验证任务信封格式
   * @param {Object} envelope - 任务信封
   * @returns {Object} { valid, errors }
   */
  validate(envelope) {
    const errors = [];

    if (!envelope || typeof envelope !== 'object') {
      return { valid: false, errors: ['信封必须为对象'] };
    }
    if (!envelope.version) errors.push('缺少 version 字段');
    if (!envelope.taskId) errors.push('缺少 taskId 字段');
    if (!envelope.timestamp) errors.push('缺少 timestamp 字段');
    if (!envelope.task) errors.push('缺少 task 字段');
    if (envelope.version && envelope.version !== CURRENT_VERSION) {
      errors.push(`版本不兼容: ${envelope.version} (当前: ${CURRENT_VERSION})`);
    }
    const validStates = ['pending', 'in_progress', 'completed', 'failed'];
    if (envelope.state && !validStates.includes(envelope.state)) {
      errors.push(`无效状态: ${envelope.state}`);
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * 获取统计信息
   * @returns {Object}
   */
  getStats() {
    return { ...this._stats };
  }

  // ========== 内部方法 ==========

  _computeChecksum(payload) {
    return crypto.createHash('sha256').update(payload, 'utf-8').digest('hex');
  }
}

module.exports = TaskSerializer;
