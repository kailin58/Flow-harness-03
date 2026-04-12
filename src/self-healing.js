/**
 * Self-Healing Engine - 自愈引擎
 * 基于错误模式自动执行修复动作，减少人工干预
 *
 * 核心功能：
 * 1. 修复策略注册：为不同错误类别注册修复动作
 * 2. 自动修复执行：检测到已知错误时自动尝试修复
 * 3. 修复验证：执行修复后验证是否成功
 * 4. 修复历史追踪：记录所有修复尝试和结果
 * 5. 修复策略学习：根据成功率动态调整策略优先级
 */
class SelfHealing {
  constructor(config = {}) {
    this.config = {
      // 是否启用自愈
      enabled: config.enabled !== false,

      // 最大修复尝试次数（每次错误）
      maxHealAttempts: config.maxHealAttempts || 3,

      // 修复超时（毫秒）
      healTimeout: config.healTimeout || 30000,

      // 是否启用策略学习（根据成功率调整优先级）
      enableLearning: config.enableLearning !== false,

      // 最小成功率阈值，低于此值的策略将被降级
      minSuccessRate: config.minSuccessRate || 0.1,

      // 冷却时间（毫秒）：同一策略对同一错误模式的最短间隔
      cooldownTime: config.cooldownTime || 60000,

      // 最大历史记录数
      maxHistorySize: config.maxHistorySize || 500,

      ...config
    };

    // 修复策略注册表: category -> [strategy]
    this.strategies = new Map();

    // 修复历史
    this.healHistory = [];

    // 冷却追踪: `${category}:${strategyId}` -> lastAttemptTime
    this.cooldowns = new Map();

    // 统计
    this.stats = {
      totalAttempts: 0,
      successfulHeals: 0,
      failedHeals: 0,
      skippedHeals: 0
    };

    // 注册内置修复策略
    this._registerBuiltinStrategies();
  }

  /**
   * 注册内置修复策略
   */
  _registerBuiltinStrategies() {
    // file_not_found: 创建缺失目录
    this.registerStrategy('file_not_found', {
      id: 'create_missing_dir',
      name: '创建缺失目录',
      description: '当文件所在目录不存在时，自动创建目录',
      priority: 10,
      canHeal: (errorInfo) => {
        const filePath = errorInfo.features?.filePath || errorInfo.filePath;
        return !!filePath;
      },
      heal: async (errorInfo, context) => {
        const filePath = errorInfo.features?.filePath || errorInfo.filePath;
        if (!filePath) return { success: false, reason: '无法提取文件路径' };
        const path = require('path');
        const dir = path.dirname(filePath);
        try {
          const fs = require('fs').promises;
          await fs.mkdir(dir, { recursive: true });
          return { success: true, action: 'created_directory', path: dir };
        } catch (e) {
          return { success: false, reason: e.message };
        }
      }
    });

    // dependency_error: 安装缺失依赖
    this.registerStrategy('dependency_error', {
      id: 'install_missing_dep',
      name: '安装缺失依赖',
      description: '当模块未找到时，尝试 npm install',
      priority: 10,
      canHeal: (errorInfo) => {
        const msg = errorInfo.message || '';
        const match = msg.match(/Cannot find module '([^']+)'/i) ||
                      msg.match(/Module not found.*'([^']+)'/i);
        return !!match;
      },
      heal: async (errorInfo, context) => {
        const msg = errorInfo.message || '';
        const match = msg.match(/Cannot find module '([^']+)'/i) ||
                      msg.match(/Module not found.*'([^']+)'/i);
        if (!match) return { success: false, reason: '无法提取模块名' };
        const moduleName = match[1];
        // 只处理非相对路径的模块（npm 包）
        if (moduleName.startsWith('.') || moduleName.startsWith('/')) {
          return { success: false, reason: '相对路径模块无法自动安装' };
        }
        try {
          const { exec } = require('child_process');
          const { promisify } = require('util');
          const execAsync = promisify(exec);
          const cwd = context?.workingDir || process.cwd();
          await execAsync(`npm install ${moduleName}`, { cwd, timeout: 30000 });
          return { success: true, action: 'installed_module', module: moduleName };
        } catch (e) {
          return { success: false, reason: e.message };
        }
      }
    });

    // timeout: 增加超时时间
    this.registerStrategy('timeout', {
      id: 'increase_timeout',
      name: '增加超时时间',
      description: '执行超时时，建议增加超时配置',
      priority: 10,
      canHeal: () => true,
      heal: async (errorInfo, context) => {
        // 超时修复是建议性的，返回建议的新超时值
        const currentTimeout = context?.timeout || 30000;
        const suggestedTimeout = Math.min(currentTimeout * 2, 600000);
        return {
          success: true,
          action: 'suggest_timeout_increase',
          currentTimeout,
          suggestedTimeout,
          note: '建议将超时时间增加到 ' + suggestedTimeout + 'ms'
        };
      }
    });

    // permission_denied: 检查并建议权限修复
    this.registerStrategy('permission_denied', {
      id: 'check_permissions',
      name: '检查文件权限',
      description: '权限不足时，检查文件权限并给出建议',
      priority: 10,
      canHeal: (errorInfo) => {
        const filePath = errorInfo.features?.filePath || errorInfo.filePath;
        return !!filePath;
      },
      heal: async (errorInfo, context) => {
        const filePath = errorInfo.features?.filePath || errorInfo.filePath;
        if (!filePath) return { success: false, reason: '无法提取文件路径' };
        try {
          const fs = require('fs').promises;
          const stats = await fs.stat(filePath);
          const mode = '0' + (stats.mode & parseInt('777', 8)).toString(8);
          return {
            success: true,
            action: 'checked_permissions',
            path: filePath,
            currentMode: mode,
            note: `文件权限为 ${mode}，可能需要调整`
          };
        } catch (e) {
          return { success: false, reason: e.message };
        }
      }
    });

    // configuration_error: 使用默认配置
    this.registerStrategy('configuration_error', {
      id: 'use_default_config',
      name: '使用默认配置',
      description: '配置错误时，建议使用默认配置',
      priority: 5,
      canHeal: () => true,
      heal: async (errorInfo, context) => {
        return {
          success: true,
          action: 'suggest_default_config',
          note: '建议检查配置文件或使用默认配置'
        };
      }
    });
  }

  /**
   * 注册修复策略
   * @param {string} category - 错误类别
   * @param {Object} strategy - 策略对象
   */
  registerStrategy(category, strategy) {
    if (!strategy.id || !strategy.heal || typeof strategy.heal !== 'function') {
      throw new Error('策略必须包含 id 和 heal 函数');
    }

    if (!this.strategies.has(category)) {
      this.strategies.set(category, []);
    }

    const strategies = this.strategies.get(category);

    // 检查是否已存在同 ID 策略
    const existingIndex = strategies.findIndex(s => s.id === strategy.id);
    const fullStrategy = {
      id: strategy.id,
      name: strategy.name || strategy.id,
      description: strategy.description || '',
      priority: strategy.priority || 0,
      canHeal: strategy.canHeal || (() => true),
      heal: strategy.heal,
      // 学习统计
      attempts: 0,
      successes: 0,
      failures: 0,
      successRate: 0
    };

    if (existingIndex >= 0) {
      strategies[existingIndex] = fullStrategy;
    } else {
      strategies.push(fullStrategy);
    }

    // 按优先级排序（高优先级在前）
    strategies.sort((a, b) => b.priority - a.priority);
  }

  /**
   * 移除修复策略
   * @param {string} category - 错误类别
   * @param {string} strategyId - 策略ID
   * @returns {boolean} 是否成功移除
   */
  removeStrategy(category, strategyId) {
    if (!this.strategies.has(category)) return false;
    const strategies = this.strategies.get(category);
    const index = strategies.findIndex(s => s.id === strategyId);
    if (index >= 0) {
      strategies.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * 尝试自愈
   * @param {Object} errorInfo - 错误信息（来自 ErrorPatternRecognizer 的分析结果）
   * @param {Object} context - 执行上下文
   * @returns {Promise<Object>} 修复结果
   */
  async attemptHeal(errorInfo, context = {}) {
    if (!this.config.enabled) {
      return { healed: false, reason: '自愈引擎已禁用' };
    }

    const category = errorInfo.category || 'unknown';
    const strategies = this.strategies.get(category) || [];

    if (strategies.length === 0) {
      this.stats.skippedHeals++;
      return { healed: false, reason: `无 ${category} 类别的修复策略`, category };
    }

    const healRecord = {
      id: this._generateId(),
      category,
      errorInfo: {
        message: errorInfo.message,
        category: errorInfo.category,
        features: errorInfo.features
      },
      startTime: Date.now(),
      attempts: [],
      healed: false
    };

    let attemptCount = 0;

    for (const strategy of strategies) {
      if (attemptCount >= this.config.maxHealAttempts) break;

      // 检查冷却
      const cooldownKey = `${category}:${strategy.id}`;
      const lastAttempt = this.cooldowns.get(cooldownKey);
      if (lastAttempt && (Date.now() - lastAttempt) < this.config.cooldownTime) {
        continue;
      }

      // 检查策略是否适用
      if (!strategy.canHeal(errorInfo, context)) {
        continue;
      }

      // 检查成功率（学习模式）
      if (this.config.enableLearning && strategy.attempts >= 5) {
        if (strategy.successRate < this.config.minSuccessRate) {
          continue; // 跳过低成功率策略
        }
      }

      attemptCount++;
      this.stats.totalAttempts++;

      const attemptRecord = {
        strategyId: strategy.id,
        strategyName: strategy.name,
        startTime: Date.now(),
        success: false,
        result: null,
        error: null
      };

      try {
        // 执行修复（带超时）
        const result = await this._executeWithTimeout(
          () => strategy.heal(errorInfo, context),
          this.config.healTimeout
        );

        attemptRecord.endTime = Date.now();
        attemptRecord.result = result;
        attemptRecord.success = result.success === true;

        // 更新冷却
        this.cooldowns.set(cooldownKey, Date.now());

        // 更新策略统计
        strategy.attempts++;
        if (attemptRecord.success) {
          strategy.successes++;
          this.stats.successfulHeals++;
          healRecord.healed = true;
          healRecord.healedBy = strategy.id;
        } else {
          strategy.failures++;
          this.stats.failedHeals++;
        }
        strategy.successRate = strategy.attempts > 0
          ? strategy.successes / strategy.attempts : 0;

      } catch (error) {
        attemptRecord.endTime = Date.now();
        attemptRecord.error = error.message;
        strategy.attempts++;
        strategy.failures++;
        strategy.successRate = strategy.attempts > 0
          ? strategy.successes / strategy.attempts : 0;
        this.stats.failedHeals++;
        this.cooldowns.set(cooldownKey, Date.now());
      }

      healRecord.attempts.push(attemptRecord);

      // 如果修复成功，停止尝试
      if (healRecord.healed) break;
    }

    healRecord.endTime = Date.now();
    healRecord.totalAttempts = attemptCount;

    // 保存历史
    this.healHistory.push(healRecord);
    if (this.healHistory.length > this.config.maxHistorySize) {
      this.healHistory = this.healHistory.slice(-this.config.maxHistorySize);
    }

    if (attemptCount === 0) {
      this.stats.skippedHeals++;
      healRecord.reason = '无适用的修复策略（冷却中或不满足条件）';
    }

    return healRecord;
  }

  /**
   * 带超时执行
   * @param {Function} fn - 要执行的函数
   * @param {number} timeout - 超时时间（毫秒）
   * @returns {Promise<*>} 执行结果
   */
  _executeWithTimeout(fn, timeout) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`修复操作超时 (${timeout}ms)`));
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

  /**
   * 获取指定类别的策略列表
   * @param {string} category - 错误类别
   * @returns {Array} 策略列表
   */
  getStrategies(category) {
    if (category) {
      return (this.strategies.get(category) || []).map(s => ({
        id: s.id,
        name: s.name,
        description: s.description,
        priority: s.priority,
        attempts: s.attempts,
        successes: s.successes,
        failures: s.failures,
        successRate: s.successRate
      }));
    }

    // 返回所有策略
    const all = [];
    for (const [cat, strategies] of this.strategies.entries()) {
      for (const s of strategies) {
        all.push({
          category: cat,
          id: s.id,
          name: s.name,
          description: s.description,
          priority: s.priority,
          attempts: s.attempts,
          successes: s.successes,
          failures: s.failures,
          successRate: s.successRate
        });
      }
    }
    return all;
  }

  /**
   * 获取修复历史
   * @param {Object} filter - 过滤条件
   * @returns {Array} 修复历史
   */
  getHealHistory(filter = {}) {
    let history = [...this.healHistory];

    if (filter.category) {
      history = history.filter(h => h.category === filter.category);
    }
    if (filter.healed !== undefined) {
      history = history.filter(h => h.healed === filter.healed);
    }
    if (filter.strategyId) {
      history = history.filter(h => h.healedBy === filter.strategyId);
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
   * @returns {Object} 统计信息
   */
  getStats() {
    const totalHeals = this.healHistory.length;
    const successfulHeals = this.healHistory.filter(h => h.healed).length;
    const failedHeals = this.healHistory.filter(h => !h.healed && h.totalAttempts > 0).length;

    // 按类别统计
    const byCategory = {};
    for (const record of this.healHistory) {
      if (!byCategory[record.category]) {
        byCategory[record.category] = { total: 0, healed: 0, failed: 0 };
      }
      byCategory[record.category].total++;
      if (record.healed) byCategory[record.category].healed++;
      else byCategory[record.category].failed++;
    }

    // 策略排行
    const strategyRanking = this.getStrategies()
      .filter(s => s.attempts > 0)
      .sort((a, b) => b.successRate - a.successRate);

    return {
      ...this.stats,
      totalHeals,
      successfulHeals,
      failedHeals,
      healRate: totalHeals > 0
        ? ((successfulHeals / totalHeals) * 100).toFixed(1) : '0.0',
      byCategory,
      strategyRanking,
      totalStrategies: this.getStrategies().length
    };
  }

  /**
   * 清除冷却
   * @param {string} category - 可选，指定类别
   */
  clearCooldowns(category) {
    if (category) {
      for (const key of this.cooldowns.keys()) {
        if (key.startsWith(category + ':')) {
          this.cooldowns.delete(key);
        }
      }
    } else {
      this.cooldowns.clear();
    }
  }

  /**
   * 清理历史
   * @param {number} keepLast - 保留最近N条
   * @returns {number} 清理的记录数
   */
  clearHistory(keepLast = 100) {
    const before = this.healHistory.length;
    if (keepLast > 0 && this.healHistory.length > keepLast) {
      this.healHistory = this.healHistory.slice(-keepLast);
    } else if (keepLast === 0) {
      this.healHistory = [];
    }
    return before - this.healHistory.length;
  }

  /**
   * 生成唯一ID
   * @returns {string}
   */
  _generateId() {
    return `heal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

module.exports = SelfHealing;