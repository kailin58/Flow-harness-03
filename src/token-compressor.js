'use strict';

const os   = require('os');
const fs   = require('fs');
const path = require('path');
const { createLogger } = require('./logger');

/**
 * 默认配置常量
 */
const DEFAULTS = {
  MAX_OUTPUT_LENGTH: 2000,     // 最大输出长度
  MAX_SESSION_HISTORY: 100,    // 最大会话历史记录数
  MONTHLY_TOKEN_BUDGET: 100000 // 每月 Token 预算
};

/** 默认 token 使用记录存在全局目录，不写入业务项目 */
const DEFAULT_USAGE_PATH = path.join(os.homedir(), '.flowharness', 'knowledge', 'token_usage.json');

class TokenCompressor {
  constructor(options = {}) {
    this.strategies = options.strategies || ['dedup', 'error-focus', 'progress-collapse'];
    this.maxOutputLength = options.maxOutputLength || DEFAULTS.MAX_OUTPUT_LENGTH;
    this.monthlyBudget = options.monthlyBudget || DEFAULTS.MONTHLY_TOKEN_BUDGET;
    // 优先使用调用方传入的路径（来自 StorageManager.knowledgeDir），否则使用全局默认路径
    this.usageFilePath = options.usageFilePath || DEFAULT_USAGE_PATH;
    this.logger = createLogger({ name: 'token-compressor' });
  }

  compress(output, context = {}) {
    if (!output || typeof output !== 'string') {
      return { compressed: output || '', originalLength: 0, compressedLength: 0, ratio: '0.00' };
    }

    let result = output;
    const originalLength = output.length;

    for (const strategy of this.strategies) {
      result = this._applyStrategy(strategy, result, context);
    }

    if (result.length > this.maxOutputLength) {
      const keepStart = Math.floor(this.maxOutputLength * 0.6);
      const keepEnd = Math.floor(this.maxOutputLength * 0.3);
      const truncated = result.length - keepStart - keepEnd;
      result = result.slice(0, keepStart) +
        `\n... [${truncated} chars truncated] ...\n` +
        result.slice(-keepEnd);
    }

    const ratio = originalLength > 0 ? (1 - result.length / originalLength) : 0;

    return {
      compressed: result,
      originalLength,
      compressedLength: result.length,
      ratio: ratio.toFixed(2),
      saved: originalLength - result.length
    };
  }

  _applyStrategy(strategy, output, context) {
    switch (strategy) {
      case 'dedup': return this._deduplicateOutput(output);
      case 'error-focus': return context.onError ? this._errorFocus(output) : output;
      case 'progress-collapse': return this._collapseProgress(output);
      case 'json-extract': return this._extractJsonFields(output);
      case 'stat-summary': return this._statSummary(output);
      default: return output;
    }
  }

  _deduplicateOutput(output) {
    const lines = output.split('\n');
    const seen = new Map();
    const result = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) { result.push(line); continue; }

      if (seen.has(trimmed)) {
        seen.set(trimmed, seen.get(trimmed) + 1);
      } else {
        seen.set(trimmed, 1);
        result.push(line);
      }
    }

    const folded = [...seen.entries()]
      .filter(([_, count]) => count > 1)
      .map(([line, count]) => `[x${count}] ${line}`);

    if (folded.length > 0) {
      result.push('--- Folded duplicates ---');
      result.push(...folded);
    }

    return result.join('\n');
  }

  _errorFocus(output) {
    const lines = output.split('\n');
    const kept = lines.filter(l =>
      l.includes('FAIL') || l.includes('Error') || l.includes('✗') ||
      l.includes('error') || l.includes('ERR') ||
      l.match(/\d+\s+(passed|failed)/) || l.match(/Tests?:/)
    );
    if (kept.length === 0) return output;
    return kept.join('\n');
  }

  _collapseProgress(output) {
    let result = output;
    result = result.replace(/\[.*?\]\s*\d+%\s*\d+\/\d+[^\n]*/g, '[progress collapsed]');
    result = result.replace(/(npm\s+warn[^\n]*\n){3,}/g, '[npm warnings collapsed]\n');
    return result;
  }

  _extractJsonFields(output, fields) {
    const defaultFields = ['status', 'error', 'summary', 'count', 'success', 'message'];
    const targetFields = fields || defaultFields;

    try {
      const parsed = JSON.parse(output);
      const extracted = {};
      for (const f of targetFields) {
        if (parsed[f] !== undefined) extracted[f] = parsed[f];
      }
      return JSON.stringify(extracted, null, 2);
    } catch {
      return output;
    }
  }

  _statSummary(output) {
    const lines = output.split('\n');
    const passCount = lines.filter(l => l.includes('✓') || l.includes('PASS')).length;
    const failCount = lines.filter(l => l.includes('✗') || l.includes('FAIL')).length;

    if (passCount + failCount > 5) {
      const summaryLines = lines.filter(l =>
        l.match(/\d+\s+(passed|failed)/) || l.includes('Tests:') ||
        l.includes('FAIL') || l.includes('✗') || l.includes('Error')
      );
      summaryLines.unshift(`Summary: ${passCount} passed, ${failCount} failed`);
      return summaryLines.join('\n');
    }
    return output;
  }

  // ============ 持久化 Token 统计 ============

  recordUsage(tokens, taskType, sessionId) {
    const usage = this._loadUsage();
    const today = new Date().toISOString().split('T')[0];
    const month = today.slice(0, 7);

    if (!usage.daily[today]) {
      usage.daily[today] = { total_tokens: 0, by_task_type: {}, compressed_saved: 0 };
    }
    usage.daily[today].total_tokens += tokens;
    usage.daily[today].by_task_type[taskType] =
      (usage.daily[today].by_task_type[taskType] || 0) + tokens;

    if (!usage.monthly[month]) {
      usage.monthly[month] = { total_tokens: 0, budget: this.monthlyBudget, utilization: 0 };
    }
    usage.monthly[month].total_tokens += tokens;
    usage.monthly[month].utilization =
      usage.monthly[month].total_tokens / usage.monthly[month].budget;

    if (sessionId) {
      usage.sessions.push({
        session_id: sessionId,
        timestamp: new Date().toISOString(),
        tokens,
        task_type: taskType
      });
      if (usage.sessions.length > DEFAULTS.MAX_SESSION_HISTORY) {
        usage.sessions = usage.sessions.slice(-DEFAULTS.MAX_SESSION_HISTORY);
      }
    }

    this._saveUsage(usage);
  }

  recordSavedTokens(saved) {
    const usage = this._loadUsage();
    const today = new Date().toISOString().split('T')[0];
    if (!usage.daily[today]) {
      usage.daily[today] = { total_tokens: 0, by_task_type: {}, compressed_saved: 0 };
    }
    usage.daily[today].compressed_saved += saved;
    this._saveUsage(usage);
  }

  getBudgetReport() {
    const usage = this._loadUsage();
    const today = new Date().toISOString().split('T')[0];
    const month = today.slice(0, 7);

    const dailyData = usage.daily[today] || { total_tokens: 0, by_task_type: {}, compressed_saved: 0 };
    const monthlyData = usage.monthly[month] || { total_tokens: 0, budget: this.monthlyBudget, utilization: 0 };

    return {
      daily: {
        date: today,
        used: dailyData.total_tokens,
        saved: dailyData.compressed_saved,
        by_type: dailyData.by_task_type
      },
      monthly: {
        month: month,
        used: monthlyData.total_tokens,
        budget: monthlyData.budget,
        utilization: (monthlyData.utilization * 100).toFixed(1) + '%'
      }
    };
  }

  _loadUsage() {
    try {
      if (fs.existsSync(this.usageFilePath)) {
        return JSON.parse(fs.readFileSync(this.usageFilePath, 'utf8'));
      }
    } catch (error) {
      this.logger.warn(`Failed to load token usage file: ${error.message}`);
    }
    return { version: '1.0', daily: {}, monthly: {}, sessions: [] };
  }

  _saveUsage(usage) {
    try {
      const dir = path.dirname(this.usageFilePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.usageFilePath, JSON.stringify(usage, null, 2));
    } catch (error) {
      this.logger.warn(`Failed to save token usage file: ${error.message}`);
    }
  }
}

module.exports = { TokenCompressor };
