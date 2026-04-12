const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

/**
 * Sandbox Manager - 沙箱管理器
 * 使用 Git Worktree 实现执行环境隔离
 *
 * 核心原则：
 * 1. Deny-by-Default: 默认拒绝所有操作，显式允许才执行
 * 2. Inspect Before Trust: 执行前检查，执行后验证
 * 3. Isolation: 每个任务在独立的 worktree 中执行
 */
class SandboxManager {
  constructor(config = {}) {
    this.config = {
      sandboxDir: config.sandboxDir || '.flowharness/sandboxes',
      maxSandboxes: config.maxSandboxes || 5,
      autoCleanup: config.autoCleanup !== false,
      timeout: config.timeout || 300000, // 5 minutes default
      ...config
    };

    // 活跃的沙箱列表
    this.activeSandboxes = new Map();

    // 沙箱计数器
    this.sandboxCounter = 0;
  }

  /**
   * 创建沙箱
   * @param {Object} options - 沙箱选项
   * @returns {Promise<Object>} 沙箱信息
   */
  async createSandbox(options = {}) {
    // 检查沙箱数量限制
    if (this.activeSandboxes.size >= this.config.maxSandboxes) {
      throw new Error(`沙箱数量已达上限: ${this.config.maxSandboxes}`);
    }

    // 生成沙箱 ID
    const sandboxId = this.generateSandboxId();

    // 创建沙箱目录
    const sandboxPath = path.join(process.cwd(), this.config.sandboxDir, sandboxId);

    try {
      // 确保沙箱根目录存在
      await fs.mkdir(path.dirname(sandboxPath), { recursive: true });

      // 检查是否在 Git 仓库中
      const isGitRepo = await this.isGitRepository();

      let worktreePath = null;
      let branch = null;

      if (isGitRepo && options.useWorktree !== false) {
        // 使用 Git Worktree 创建隔离环境
        branch = `sandbox/${sandboxId}`;
        worktreePath = sandboxPath;

        await this.createGitWorktree(worktreePath, branch);
      } else {
        // 非 Git 仓库，创建普通目录
        await fs.mkdir(sandboxPath, { recursive: true });
      }

      // 记录沙箱信息
      const sandbox = {
        id: sandboxId,
        path: sandboxPath,
        worktreePath: worktreePath,
        branch: branch,
        createdAt: new Date().toISOString(),
        status: 'active',
        options: options
      };

      this.activeSandboxes.set(sandboxId, sandbox);

      return sandbox;
    } catch (error) {
      throw new Error(`创建沙箱失败: ${error.message}`);
    }
  }

  /**
   * 销毁沙箱
   * @param {string} sandboxId - 沙箱 ID
   * @returns {Promise<boolean>} 是否成功
   */
  async destroySandbox(sandboxId) {
    const sandbox = this.activeSandboxes.get(sandboxId);

    if (!sandbox) {
      throw new Error(`沙箱不存在: ${sandboxId}`);
    }

    try {
      // 如果是 Git Worktree，先移除 worktree
      if (sandbox.worktreePath) {
        await this.removeGitWorktree(sandbox.worktreePath, sandbox.branch);
      }

      // 删除沙箱目录
      await this.removeDirectory(sandbox.path);

      // 从活跃列表中移除
      this.activeSandboxes.delete(sandboxId);

      return true;
    } catch (error) {
      throw new Error(`销毁沙箱失败: ${error.message}`);
    }
  }

  /**
   * 获取沙箱信息
   * @param {string} sandboxId - 沙箱 ID
   * @returns {Object|null} 沙箱信息
   */
  getSandbox(sandboxId) {
    return this.activeSandboxes.get(sandboxId) || null;
  }

  /**
   * 列出所有活跃沙箱
   * @returns {Array} 沙箱列表
   */
  listSandboxes() {
    return Array.from(this.activeSandboxes.values());
  }

  /**
   * 清理所有沙箱
   * @returns {Promise<number>} 清理的沙箱数量
   */
  async cleanupAll() {
    const sandboxIds = Array.from(this.activeSandboxes.keys());
    let cleaned = 0;

    for (const sandboxId of sandboxIds) {
      try {
        await this.destroySandbox(sandboxId);
        cleaned++;
      } catch (error) {
        console.error(`清理沙箱失败 ${sandboxId}:`, error.message);
      }
    }

    return cleaned;
  }

  /**
   * 生成沙箱 ID
   * @returns {string} 沙箱 ID
   */
  generateSandboxId() {
    this.sandboxCounter++;
    const timestamp = Date.now();
    return `sb_${timestamp}_${this.sandboxCounter}`;
  }

  /**
   * 检查是否在 Git 仓库中
   * @returns {Promise<boolean>}
   */
  async isGitRepository() {
    try {
      await execAsync('git rev-parse --git-dir');
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 创建 Git Worktree
   * @param {string} worktreePath - Worktree 路径
   * @param {string} branch - 分支名
   * @returns {Promise<void>}
   */
  async createGitWorktree(worktreePath, branch) {
    try {
      // 创建新分支并创建 worktree
      const command = `git worktree add -b ${branch} "${worktreePath}"`;
      await execAsync(command);
    } catch (error) {
      throw new Error(`创建 Git Worktree 失败: ${error.message}`);
    }
  }

  /**
   * 移除 Git Worktree
   * @param {string} worktreePath - Worktree 路径
   * @param {string} branch - 分支名
   * @returns {Promise<void>}
   */
  async removeGitWorktree(worktreePath, branch) {
    try {
      // 移除 worktree
      await execAsync(`git worktree remove "${worktreePath}" --force`);

      // 删除分支
      if (branch) {
        try {
          await execAsync(`git branch -D ${branch}`);
        } catch (error) {
          // 分支删除失败不影响整体流程
          console.warn(`删除分支失败 ${branch}:`, error.message);
        }
      }
    } catch (error) {
      throw new Error(`移除 Git Worktree 失败: ${error.message}`);
    }
  }

  /**
   * 递归删除目录
   * @param {string} dirPath - 目录路径
   * @returns {Promise<void>}
   */
  async removeDirectory(dirPath) {
    try {
      await fs.rm(dirPath, { recursive: true, force: true });
    } catch (error) {
      // 如果目录不存在，忽略错误
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * 获取统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      activeSandboxes: this.activeSandboxes.size,
      maxSandboxes: this.config.maxSandboxes,
      totalCreated: this.sandboxCounter,
      sandboxes: this.listSandboxes().map(sb => ({
        id: sb.id,
        status: sb.status,
        createdAt: sb.createdAt,
        isWorktree: !!sb.worktreePath
      }))
    };
  }
}

module.exports = SandboxManager;
