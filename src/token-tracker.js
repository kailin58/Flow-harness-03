/**
 * token-tracker.js - Token 成本控制模块
 *
 * 文档要求(P1): Token 计数、预算限制、成本告警
 *
 * 核心功能:
 *   1. Token 计数: 跟踪每次 LLM 调用的 input/output tokens
 *   2. 预算限制: 支持按任务/会话/日/月设置上限
 *   3. 成本估算: 按模型定价计算实际成本
 *   4. 成本告警: 接近或超出预算时发出警告
 *   5. 使用报告: 生成按模型/任务类型/时段的成本统计
 *
 * @version 1.0.0
 * @date 2026-04-13
 */

const { createLogger } = require('./logger');

// ============================================================
// 模型定价配置 (USD per 1K tokens)
// ============================================================

const MODEL_PRICING = {
  'claude-sonnet': { input: 0.003, output: 0.015 },
  'claude-opus': { input: 0.015, output: 0.075 },
  'claude-haiku': { input: 0.00025, output: 0.00125 },
  'gpt-4': { input: 0.03, output: 0.06 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
  'default': { input: 0.003, output: 0.015 }
};

// ============================================================
// 预算级别
// ============================================================

const BUDGET_LEVELS = {
  TASK: 'task',         // 单个任务
  SESSION: 'session',   // 单次会话
  DAILY: 'daily',       // 每日
  MONTHLY: 'monthly'    // 每月
};

// 告警阈值
const ALERT_THRESHOLDS = {
  WARNING: 0.8,   // 80% 预算时警告
  CRITICAL: 0.95, // 95% 预算时严重警告
  EXCEEDED: 1.0   // 100% 超出
};

// ============================================================
// TokenTracker
// ============================================================

class TokenTracker {
  /**
   * @param {Object} options
   * @param {Object} options.budgets       - 各级别预算 { task, session, daily, monthly } (USD)
   * @param {Object} options.pricing       - 自定义模型定价
   * @param {Function} options.onAlert     - 告警回调 (alert) => void
   * @param {boolean}  options.enforceHard - 超出预算时硬性阻止（默认 false 仅警告）
   */
  constructor(options = {}) {
    this.logger = options.logger || createLogger({ name: 'token-tracker' });

    // 预算配置
    this.budgets = {
      [BUDGET_LEVELS.TASK]: options.budgets?.task || null,       // null = 不限
      [BUDGET_LEVELS.SESSION]: options.budgets?.session || null,
      [BUDGET_LEVELS.DAILY]: options.budgets?.daily || null,
      [BUDGET_LEVELS.MONTHLY]: options.budgets?.monthly || null
    };

    // 模型定价
    this.pricing = { ...MODEL_PRICING, ...(options.pricing || {}) };

    // 告警回调
    this.onAlert = options.onAlert || null;

    // 硬性预算执行
    this.enforceHard = options.enforceHard || false;

    // 使用数据
    this.currentTaskUsage = this._newUsageBlock();
    this.sessionUsage = this._newUsageBlock();
    this.dailyUsage = this._newDailyBlock();
    this.monthlyUsage = this._newMonthlyBlock();

    // 历史记录
    this.callHistory = [];      // 最近调用记录
    this.alertHistory = [];     // 告警记录
    this.maxHistorySize = 500;
  }

  // ----------------------------------------------------------
  // 核心接口
  // ----------------------------------------------------------

  /**
   * 记录一次 LLM 调用的 token 使用
   * @param {Object} usage
   * @param {string} usage.model       - 模型名称
   * @param {number} usage.inputTokens - 输入 token 数
   * @param {number} usage.outputTokens - 输出 token 数
   * @param {string} usage.taskType    - 任务类型（可选）
   * @param {string} usage.taskId      - 任务 ID（可选）
   * @returns {Object} { cost, alerts, blocked }
   */
  recordUsage(usage) {
    const {
      model = 'default',
      inputTokens = 0,
      outputTokens = 0,
      taskType = 'unknown',
      taskId = null
    } = usage;

    // 计算本次成本
    const pricing = this.pricing[model] || this.pricing['default'];
    const inputCost = (inputTokens / 1000) * pricing.input;
    const outputCost = (outputTokens / 1000) * pricing.output;
    const totalCost = inputCost + outputCost;

    // 构建调用记录
    const record = {
      timestamp: new Date().toISOString(),
      model,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      inputCost,
      outputCost,
      totalCost,
      taskType,
      taskId
    };

    // 更新各级使用数据
    this._addToUsage(this.currentTaskUsage, record);
    this._addToUsage(this.sessionUsage, record);
    this._addToDailyUsage(record);
    this._addToMonthlyUsage(record);

    // 保存历史
    this.callHistory.push(record);
    if (this.callHistory.length > this.maxHistorySize) {
      this.callHistory = this.callHistory.slice(-this.maxHistorySize);
    }

    // 检查预算
    const alerts = this._checkBudgets();
    const blocked = this.enforceHard && alerts.some(a => a.level === 'exceeded');

    if (alerts.length > 0) {
      for (const alert of alerts) {
        this.logger.warn({
          level: alert.level,
          scope: alert.scope,
          usage: alert.usage,
          budget: alert.budget
        }, `Token 预算告警: ${alert.message}`);

        this.alertHistory.push({ ...alert, timestamp: new Date().toISOString() });
      }

      if (this.onAlert) {
        for (const alert of alerts) {
          try { this.onAlert(alert); } catch (e) {}
        }
      }
    }

    this.logger.debug({
      model, inputTokens, outputTokens,
      cost: totalCost.toFixed(6)
    }, 'Token usage recorded');

    return { cost: totalCost, alerts, blocked };
  }

  /**
   * 预算前检查 — 在调用 LLM 前检查是否还有预算
   * @param {number} estimatedTokens - 预估 token 数
   * @param {string} model - 模型名称
   * @returns {Object} { allowed, remaining, reason }
   */
  checkBudget(estimatedTokens = 0, model = 'default') {
    const pricing = this.pricing[model] || this.pricing['default'];
    const estimatedCost = (estimatedTokens / 1000) * ((pricing.input + pricing.output) / 2);

    for (const scope of Object.values(BUDGET_LEVELS)) {
      const budget = this.budgets[scope];
      if (budget === null) continue;

      const current = this._getUsageForScope(scope);
      const remaining = budget - current;

      if (remaining <= 0) {
        return {
          allowed: !this.enforceHard,
          remaining: 0,
          reason: `${scope} 预算已耗尽 ($${current.toFixed(4)} / $${budget.toFixed(4)})`
        };
      }

      if (estimatedCost > remaining) {
        return {
          allowed: !this.enforceHard,
          remaining,
          reason: `预估成本 $${estimatedCost.toFixed(4)} 将超出 ${scope} 剩余预算 $${remaining.toFixed(4)}`
        };
      }
    }

    return { allowed: true, remaining: null, reason: null };
  }

  /**
   * 重置任务级用量（新任务开始时调用）
   */
  resetTask() {
    this.currentTaskUsage = this._newUsageBlock();
    this.logger.debug('Task usage reset');
  }

  /**
   * 重置会话级用量
   */
  resetSession() {
    this.sessionUsage = this._newUsageBlock();
    this.currentTaskUsage = this._newUsageBlock();
    this.logger.debug('Session usage reset');
  }

  // ----------------------------------------------------------
  // 统计与报告
  // ----------------------------------------------------------

  /**
   * 获取当前使用统计
   */
  getStats() {
    return {
      task: this._formatUsage(this.currentTaskUsage, this.budgets[BUDGET_LEVELS.TASK]),
      session: this._formatUsage(this.sessionUsage, this.budgets[BUDGET_LEVELS.SESSION]),
      daily: this._formatUsage(this.dailyUsage, this.budgets[BUDGET_LEVELS.DAILY]),
      monthly: this._formatUsage(this.monthlyUsage, this.budgets[BUDGET_LEVELS.MONTHLY])
    };
  }

  /**
   * 按模型分组的使用报告
   */
  getUsageByModel() {
    const byModel = {};
    for (const record of this.callHistory) {
      if (!byModel[record.model]) {
        byModel[record.model] = {
          calls: 0, inputTokens: 0, outputTokens: 0, totalCost: 0
        };
      }
      const m = byModel[record.model];
      m.calls++;
      m.inputTokens += record.inputTokens;
      m.outputTokens += record.outputTokens;
      m.totalCost += record.totalCost;
    }
    return byModel;
  }

  /**
   * 按任务类型分组的使用报告
   */
  getUsageByTaskType() {
    const byType = {};
    for (const record of this.callHistory) {
      const type = record.taskType || 'unknown';
      if (!byType[type]) {
        byType[type] = { calls: 0, totalTokens: 0, totalCost: 0 };
      }
      byType[type].calls++;
      byType[type].totalTokens += record.totalTokens;
      byType[type].totalCost += record.totalCost;
    }
    return byType;
  }

  /**
   * 获取告警历史
   */
  getAlertHistory() {
    return [...this.alertHistory];
  }

  /**
   * 更新预算
   */
  setBudget(scope, amount) {
    if (Object.values(BUDGET_LEVELS).includes(scope)) {
      this.budgets[scope] = amount;
      this.logger.info({ scope, amount }, 'Budget updated');
    }
  }

  // ----------------------------------------------------------
  // 内部方法
  // ----------------------------------------------------------

  _newUsageBlock() {
    return {
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      totalCost: 0,
      startTime: new Date().toISOString()
    };
  }

  _newDailyBlock() {
    const block = this._newUsageBlock();
    block.date = new Date().toISOString().substring(0, 10);
    return block;
  }

  _newMonthlyBlock() {
    const block = this._newUsageBlock();
    block.month = new Date().toISOString().substring(0, 7);
    return block;
  }

  _addToUsage(usage, record) {
    usage.calls++;
    usage.inputTokens += record.inputTokens;
    usage.outputTokens += record.outputTokens;
    usage.totalTokens += record.totalTokens;
    usage.totalCost += record.totalCost;
  }

  _addToDailyUsage(record) {
    const today = new Date().toISOString().substring(0, 10);
    if (this.dailyUsage.date !== today) {
      this.dailyUsage = this._newDailyBlock();
    }
    this._addToUsage(this.dailyUsage, record);
  }

  _addToMonthlyUsage(record) {
    const month = new Date().toISOString().substring(0, 7);
    if (this.monthlyUsage.month !== month) {
      this.monthlyUsage = this._newMonthlyBlock();
    }
    this._addToUsage(this.monthlyUsage, record);
  }

  _getUsageForScope(scope) {
    switch (scope) {
      case BUDGET_LEVELS.TASK: return this.currentTaskUsage.totalCost;
      case BUDGET_LEVELS.SESSION: return this.sessionUsage.totalCost;
      case BUDGET_LEVELS.DAILY: return this.dailyUsage.totalCost;
      case BUDGET_LEVELS.MONTHLY: return this.monthlyUsage.totalCost;
      default: return 0;
    }
  }

  _checkBudgets() {
    const alerts = [];

    for (const scope of Object.values(BUDGET_LEVELS)) {
      const budget = this.budgets[scope];
      if (budget === null || budget <= 0) continue;

      const usage = this._getUsageForScope(scope);
      const ratio = usage / budget;

      if (ratio >= ALERT_THRESHOLDS.EXCEEDED) {
        alerts.push({
          level: 'exceeded',
          scope,
          usage: parseFloat(usage.toFixed(6)),
          budget,
          ratio: parseFloat(ratio.toFixed(4)),
          message: `${scope} 预算已超出: $${usage.toFixed(4)} / $${budget.toFixed(4)}`
        });
      } else if (ratio >= ALERT_THRESHOLDS.CRITICAL) {
        alerts.push({
          level: 'critical',
          scope,
          usage: parseFloat(usage.toFixed(6)),
          budget,
          ratio: parseFloat(ratio.toFixed(4)),
          message: `${scope} 预算接近耗尽 (${(ratio * 100).toFixed(1)}%): $${usage.toFixed(4)} / $${budget.toFixed(4)}`
        });
      } else if (ratio >= ALERT_THRESHOLDS.WARNING) {
        alerts.push({
          level: 'warning',
          scope,
          usage: parseFloat(usage.toFixed(6)),
          budget,
          ratio: parseFloat(ratio.toFixed(4)),
          message: `${scope} 预算已使用 ${(ratio * 100).toFixed(1)}%: $${usage.toFixed(4)} / $${budget.toFixed(4)}`
        });
      }
    }

    return alerts;
  }

  _formatUsage(usage, budget) {
    return {
      calls: usage.calls,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
      totalCost: parseFloat(usage.totalCost.toFixed(6)),
      budget: budget,
      budgetRemaining: budget !== null ? parseFloat((budget - usage.totalCost).toFixed(6)) : null,
      budgetUsedPct: budget !== null ? parseFloat(((usage.totalCost / budget) * 100).toFixed(2)) : null,
      startTime: usage.startTime
    };
  }
}

// ============================================================
// 导出
// ============================================================

module.exports = {
  TokenTracker,
  MODEL_PRICING,
  BUDGET_LEVELS,
  ALERT_THRESHOLDS
};
