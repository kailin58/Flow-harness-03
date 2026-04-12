/**
 * checkpoint-manager.js - 检查点/快照机制
 *
 * 文档要求(Ch16): 兜底与降级
 *   - 任务执行中间状态快照
 *   - 失败恢复点（从最近检查点恢复）
 *   - 状态回滚能力
 *   - 检查点自动清理
 *
 * @version 1.0.0
 * @date 2026-04-13
 */

const fs = require('fs');
const path = require('path');
const { createLogger } = require('./logger');

// ============================================================
// 常量
// ============================================================

const CHECKPOINT_STATUS = {
  CREATED: 'created',
  COMMITTED: 'committed',
  ROLLED_BACK: 'rolled_back',
  EXPIRED: 'expired'
};

// ============================================================
// CheckpointManager
// ============================================================

class CheckpointManager {
  /**
   * @param {Object} options
   * @param {string} options.storageDir   - 检查点存储目录
   * @param {number} options.maxCheckpoints - 最大保留检查点数 (default: 20)
   * @param {number} options.ttlMs         - 检查点 TTL (default: 24小时)
   * @param {Object} options.logger        - Logger 实例
   */
  constructor(options = {}) {
    this.storageDir = options.storageDir || path.join(process.cwd(), '.flowharness', 'checkpoints');
    this.maxCheckpoints = options.maxCheckpoints || 20;
    this.ttlMs = options.ttlMs || 24 * 60 * 60 * 1000; // 24h
    this.logger = options.logger || createLogger({ name: 'checkpoint-manager' });

    // 内存中的检查点索引
    this.checkpoints = [];

    // 加载已有索引
    this._loadIndex();
  }

  // ----------------------------------------------------------
  // 创建检查点
  // ----------------------------------------------------------

  /**
   * 创建一个检查点
   * @param {string} taskId      - 任务ID
   * @param {string} label       - 检查点标签 (e.g. "step3_complete")
   * @param {Object} state       - 要保存的状态数据
   * @param {Object} metadata    - 额外元数据
   * @returns {Object} 创建的检查点
   */
  create(taskId, label, state, metadata = {}) {
    const checkpoint = {
      id: `cp_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      taskId,
      label,
      status: CHECKPOINT_STATUS.CREATED,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + this.ttlMs).toISOString(),
      metadata: {
        ...metadata,
        stateSize: JSON.stringify(state).length
      }
    };

    // 保存状态到文件
    this._ensureDir();
    const statePath = path.join(this.storageDir, `${checkpoint.id}.json`);
    fs.writeFileSync(statePath, JSON.stringify({
      checkpoint,
      state
    }, null, 2), 'utf8');

    // 更新索引
    this.checkpoints.push(checkpoint);
    this._saveIndex();

    // 自动清理超额检查点
    this._cleanup();

    this.logger.info({
      id: checkpoint.id,
      taskId,
      label,
      size: checkpoint.metadata.stateSize
    }, 'Checkpoint created');

    return checkpoint;
  }

  /**
   * 提交检查点（标记为已确认可用）
   */
  commit(checkpointId) {
    const cp = this.checkpoints.find(c => c.id === checkpointId);
    if (!cp) return { success: false, error: 'Checkpoint not found' };

    cp.status = CHECKPOINT_STATUS.COMMITTED;
    cp.committedAt = new Date().toISOString();
    this._saveIndex();

    this.logger.info({ id: checkpointId }, 'Checkpoint committed');
    return { success: true, checkpoint: cp };
  }

  // ----------------------------------------------------------
  // 恢复检查点
  // ----------------------------------------------------------

  /**
   * 从检查点恢复状态
   * @param {string} checkpointId - 检查点ID
   * @returns {Object} { success, state, checkpoint }
   */
  restore(checkpointId) {
    const cp = this.checkpoints.find(c => c.id === checkpointId);
    if (!cp) return { success: false, error: 'Checkpoint not found' };

    // 检查是否过期
    if (new Date(cp.expiresAt) < new Date()) {
      cp.status = CHECKPOINT_STATUS.EXPIRED;
      this._saveIndex();
      return { success: false, error: 'Checkpoint expired' };
    }

    // 读取状态文件
    const statePath = path.join(this.storageDir, `${cp.id}.json`);
    if (!fs.existsSync(statePath)) {
      return { success: false, error: 'Checkpoint data file missing' };
    }

    try {
      const data = JSON.parse(fs.readFileSync(statePath, 'utf8'));

      this.logger.info({
        id: checkpointId,
        label: cp.label,
        taskId: cp.taskId
      }, 'Checkpoint restored');

      return { success: true, state: data.state, checkpoint: cp };
    } catch (error) {
      return { success: false, error: `Failed to read checkpoint: ${error.message}` };
    }
  }

  /**
   * 从最近的检查点恢复（指定任务）
   * @param {string} taskId - 任务ID
   * @returns {Object} { success, state, checkpoint }
   */
  restoreLatest(taskId) {
    const candidates = this.checkpoints
      .filter(c => c.taskId === taskId &&
                   c.status !== CHECKPOINT_STATUS.EXPIRED &&
                   c.status !== CHECKPOINT_STATUS.ROLLED_BACK &&
                   new Date(c.expiresAt) > new Date())
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    if (candidates.length === 0) {
      return { success: false, error: 'No valid checkpoints found for this task' };
    }

    return this.restore(candidates[0].id);
  }

  // ----------------------------------------------------------
  // 回滚
  // ----------------------------------------------------------

  /**
   * 回滚到指定检查点
   * @param {string} checkpointId - 目标检查点
   * @returns {Object} { success, state, rolledBackCheckpoints }
   */
  rollback(checkpointId) {
    const target = this.checkpoints.find(c => c.id === checkpointId);
    if (!target) return { success: false, error: 'Target checkpoint not found' };

    // 恢复状态
    const restoreResult = this.restore(checkpointId);
    if (!restoreResult.success) return restoreResult;

    // 标记之后的检查点为 rolled_back
    const targetTime = new Date(target.createdAt);
    const rolledBack = [];

    for (const cp of this.checkpoints) {
      if (cp.taskId === target.taskId &&
          new Date(cp.createdAt) > targetTime &&
          cp.status !== CHECKPOINT_STATUS.ROLLED_BACK) {
        cp.status = CHECKPOINT_STATUS.ROLLED_BACK;
        cp.rolledBackAt = new Date().toISOString();
        rolledBack.push(cp.id);
      }
    }

    this._saveIndex();

    this.logger.info({
      targetId: checkpointId,
      rolledBack: rolledBack.length
    }, `Rolled back to checkpoint, invalidated ${rolledBack.length} later checkpoints`);

    return {
      success: true,
      state: restoreResult.state,
      checkpoint: target,
      rolledBackCheckpoints: rolledBack
    };
  }

  // ----------------------------------------------------------
  // 查询
  // ----------------------------------------------------------

  /**
   * 列出某任务的检查点
   */
  listByTask(taskId) {
    return this.checkpoints
      .filter(c => c.taskId === taskId)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  }

  /**
   * 列出所有检查点
   */
  listAll() {
    return [...this.checkpoints];
  }

  /**
   * 获取指定检查点详情
   */
  get(checkpointId) {
    return this.checkpoints.find(c => c.id === checkpointId) || null;
  }

  /**
   * 获取统计
   */
  getStats() {
    const now = new Date();
    return {
      total: this.checkpoints.length,
      created: this.checkpoints.filter(c => c.status === CHECKPOINT_STATUS.CREATED).length,
      committed: this.checkpoints.filter(c => c.status === CHECKPOINT_STATUS.COMMITTED).length,
      rolledBack: this.checkpoints.filter(c => c.status === CHECKPOINT_STATUS.ROLLED_BACK).length,
      expired: this.checkpoints.filter(c => c.status === CHECKPOINT_STATUS.EXPIRED ||
                                             new Date(c.expiresAt) < now).length,
      storageDir: this.storageDir
    };
  }

  // ----------------------------------------------------------
  // 删除
  // ----------------------------------------------------------

  /**
   * 删除指定检查点
   */
  remove(checkpointId) {
    const idx = this.checkpoints.findIndex(c => c.id === checkpointId);
    if (idx === -1) return false;

    // 删除文件
    const statePath = path.join(this.storageDir, `${checkpointId}.json`);
    if (fs.existsSync(statePath)) {
      fs.unlinkSync(statePath);
    }

    // 从索引移除
    this.checkpoints.splice(idx, 1);
    this._saveIndex();

    return true;
  }

  /**
   * 清除某任务的所有检查点
   */
  clearTask(taskId) {
    const toRemove = this.checkpoints.filter(c => c.taskId === taskId);
    for (const cp of toRemove) {
      this.remove(cp.id);
    }
    return toRemove.length;
  }

  /**
   * 清除所有过期检查点
   */
  purgeExpired() {
    const now = new Date();
    const expired = this.checkpoints.filter(c => new Date(c.expiresAt) < now);
    for (const cp of expired) {
      this.remove(cp.id);
    }
    return expired.length;
  }

  // ----------------------------------------------------------
  // 内部方法
  // ----------------------------------------------------------

  _ensureDir() {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  _loadIndex() {
    const indexPath = path.join(this.storageDir, '_index.json');
    if (fs.existsSync(indexPath)) {
      try {
        this.checkpoints = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
      } catch (e) {
        this.checkpoints = [];
      }
    }
  }

  _saveIndex() {
    this._ensureDir();
    const indexPath = path.join(this.storageDir, '_index.json');
    fs.writeFileSync(indexPath, JSON.stringify(this.checkpoints, null, 2), 'utf8');
  }

  _cleanup() {
    // 按创建时间排序，保留最新的 maxCheckpoints 个
    if (this.checkpoints.length > this.maxCheckpoints) {
      const sorted = [...this.checkpoints].sort((a, b) =>
        new Date(b.createdAt) - new Date(a.createdAt)
      );
      const toRemove = sorted.slice(this.maxCheckpoints);
      for (const cp of toRemove) {
        this.remove(cp.id);
      }
      this.logger.info({ removed: toRemove.length }, 'Excess checkpoints cleaned up');
    }
  }
}

// ============================================================
// 导出
// ============================================================

module.exports = {
  CheckpointManager,
  CHECKPOINT_STATUS
};
