/**
 * Diagnostic Reporter - 诊断报告生成器
 * 聚合各监控组件数据，生成可读的诊断报告
 *
 * 核心功能：
 * 1. 聚合执行、偏差、错误、重试、自愈、健康检查数据
 * 2. 生成不同详细级别的报告（summary / standard / detailed）
 * 3. 支持按时间范围过滤
 * 4. 提供问题诊断和建议
 */
class DiagnosticReporter {
  constructor(config = {}) {
    this.config = {
      // 默认报告级别
      defaultLevel: config.defaultLevel || 'standard',
      // 最大历史报告数
      maxReports: config.maxReports || 50,
      // 数据源（由外部注入）
      sources: config.sources || {},
      ...config
    };

    // 报告历史
    this.reportHistory = [];

    // 自定义报告段
    this.customSections = new Map();
  }

  /**
   * 生成诊断报告
   * @param {Object} options - 报告选项
   * @returns {Object} 诊断报告
   */
  generate(options = {}) {
    const level = options.level || this.config.defaultLevel;
    const since = options.since || null;
    const filter = options.filter || {};

    const report = {
      id: `diag_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      level,
      system: this._collectSystemStatus(since),
      execution: this._collectExecutionData(since, level),
      errors: this._collectErrorData(since, level),
      health: this._collectHealthData(level),
      issues: [],
      recommendations: []
    };

    // 详细级别追加更多数据
    if (level === 'standard' || level === 'detailed') {
      report.retry = this._collectRetryData(since, level);
      report.healing = this._collectHealingData(since, level);
      report.deviation = this._collectDeviationData(since, level);
    }

    // 详细级别追加自定义段
    if (level === 'detailed') {
      report.custom = this._collectCustomSections(since);
    }

    // 分析问题和建议
    const analysis = this._analyzeAndRecommend(report);
    report.issues = analysis.issues;
    report.recommendations = analysis.recommendations;

    // 生成摘要文本
    report.summary = this._buildSummaryText(report);

    // 保存历史
    this.reportHistory.push({
      id: report.id,
      timestamp: report.timestamp,
      level,
      issueCount: report.issues.length,
      recommendationCount: report.recommendations.length
    });
    if (this.reportHistory.length > this.config.maxReports) {
      this.reportHistory = this.reportHistory.slice(-this.config.maxReports);
    }

    return report;
  }

  /**
   * 注册自定义报告段
   * @param {string} sectionId - 段ID
   * @param {Object} options - 段配置
   */
  registerSection(sectionId, options = {}) {
    if (!sectionId || typeof sectionId !== 'string') {
      throw new Error('sectionId 必须为非空字符串');
    }
    if (typeof options.collect !== 'function') {
      throw new Error('必须提供 collect 函数');
    }
    this.customSections.set(sectionId, {
      id: sectionId,
      name: options.name || sectionId,
      collect: options.collect
    });
  }

  /**
   * 注销自定义报告段
   * @param {string} sectionId
   * @returns {boolean}
   */
  unregisterSection(sectionId) {
    return this.customSections.delete(sectionId);
  }

  /**
   * 获取报告历史
   * @param {Object} filter
   * @returns {Array}
   */
  getReportHistory(filter = {}) {
    let history = [...this.reportHistory];
    if (filter.level) {
      history = history.filter(h => h.level === filter.level);
    }
    if (filter.since) {
      history = history.filter(h => h.timestamp >= filter.since);
    }
    if (filter.limit) {
      history = history.slice(-filter.limit);
    }
    return history;
  }

  /**
   * 格式化报告为文本
   * @param {Object} report - 报告对象
   * @returns {string}
   */
  formatAsText(report) {
    const lines = [];
    const sep = '='.repeat(60);
    const subsep = '-'.repeat(40);

    lines.push(sep);
    lines.push(`诊断报告 [${report.level}]`);
    lines.push(`ID: ${report.id}`);
    lines.push(`时间: ${new Date(report.timestamp).toISOString()}`);
    lines.push(sep);

    // 摘要
    lines.push('');
    lines.push('【摘要】');
    lines.push(report.summary);

    // 系统状态
    lines.push('');
    lines.push('【系统状态】');
    const sys = report.system;
    lines.push(`  整体状态: ${sys.overallStatus}`);
    lines.push(`  组件数: ${sys.componentCount}`);

    // 执行统计
    if (report.execution) {
      lines.push('');
      lines.push('【执行统计】');
      lines.push(`  总执行数: ${report.execution.totalExecutions}`);
      lines.push(`  成功率: ${report.execution.successRate}%`);
      if (report.execution.activeExecutions > 0) {
        lines.push(`  活跃执行: ${report.execution.activeExecutions}`);
      }
    }

    // 错误信息
    if (report.errors && report.errors.totalErrors > 0) {
      lines.push('');
      lines.push('【错误信息】');
      lines.push(`  总错误数: ${report.errors.totalErrors}`);
      lines.push(`  模式数: ${report.errors.totalPatterns}`);
      if (report.errors.topPatterns && report.errors.topPatterns.length > 0) {
        lines.push('  高频模式:');
        for (const p of report.errors.topPatterns.slice(0, 3)) {
          lines.push(`    - ${p.category}: ${p.count}次`);
        }
      }
    }

    // 健康状态
    if (report.health) {
      lines.push('');
      lines.push('【健康状态】');
      lines.push(`  健康: ${report.health.healthy}, 降级: ${report.health.degraded}, 不健康: ${report.health.unhealthy}`);
    }

    // 重试信息
    if (report.retry) {
      lines.push('');
      lines.push('【重试统计】');
      lines.push(`  总重试: ${report.retry.totalRetries}`);
      lines.push(`  断路器: ${report.retry.circuitBreakerState}`);
    }

    // 自愈信息
    if (report.healing) {
      lines.push('');
      lines.push('【自愈统计】');
      lines.push(`  修复尝试: ${report.healing.totalHeals}`);
      lines.push(`  修复率: ${report.healing.healRate}%`);
    }

    // 问题
    if (report.issues.length > 0) {
      lines.push('');
      lines.push('【发现问题】');
      for (const issue of report.issues) {
        lines.push(`  [${issue.severity}] ${issue.message}`);
      }
    }

    // 建议
    if (report.recommendations.length > 0) {
      lines.push('');
      lines.push('【建议】');
      for (const rec of report.recommendations) {
        lines.push(`  - ${rec}`);
      }
    }

    lines.push('');
    lines.push(sep);
    return lines.join('\n');
  }

  // ========== 数据收集方法 ==========

  _collectSystemStatus(since) {
    const sources = this.config.sources;
    const result = { overallStatus: 'unknown', componentCount: 0 };

    if (sources.healthCheck) {
      try {
        const stats = sources.healthCheck.getStats();
        result.overallStatus = stats.overallStatus || 'unknown';
        result.componentCount = stats.totalComponents || 0;
        result.healthy = stats.healthy || 0;
        result.degraded = stats.degraded || 0;
        result.unhealthy = stats.unhealthy || 0;
      } catch (e) {
        result.error = e.message;
      }
    }

    return result;
  }

  _collectExecutionData(since, level) {
    const sources = this.config.sources;
    const result = { totalExecutions: 0, successRate: '0' };

    if (sources.executionMonitor) {
      try {
        const stats = sources.executionMonitor.getStats();
        result.totalExecutions = stats.totalExecutions || 0;
        result.successRate = stats.successRate || '0';
        result.activeExecutions = sources.executionMonitor.listActiveExecutions().length;

        if (level === 'detailed') {
          const filter = since ? { since } : {};
          result.recentHistory = sources.executionMonitor.getHistory(filter).slice(-10);
        }
      } catch (e) {
        result.error = e.message;
      }
    }

    return result;
  }

  _collectErrorData(since, level) {
    const sources = this.config.sources;
    const result = { totalErrors: 0, totalPatterns: 0 };

    if (sources.errorPatternRecognizer) {
      try {
        const stats = sources.errorPatternRecognizer.getStats();
        result.totalErrors = stats.totalErrors || 0;
        result.totalPatterns = stats.totalPatterns || 0;

        if (level === 'standard' || level === 'detailed') {
          const patterns = sources.errorPatternRecognizer.getPatterns
            ? sources.errorPatternRecognizer.getPatterns()
            : [];
          result.topPatterns = patterns
            .sort((a, b) => (b.count || 0) - (a.count || 0))
            .slice(0, 5);
        }

        if (level === 'detailed') {
          const filter = since ? { since } : {};
          const history = sources.errorPatternRecognizer.getErrorHistory
            ? sources.errorPatternRecognizer.getErrorHistory(filter)
            : [];
          result.recentErrors = history.slice(-10);
        }
      } catch (e) {
        result.error = e.message;
      }
    }

    return result;
  }

  _collectHealthData(level) {
    const sources = this.config.sources;
    const result = { healthy: 0, degraded: 0, unhealthy: 0 };

    if (sources.healthCheck) {
      try {
        const stats = sources.healthCheck.getStats();
        result.healthy = stats.healthy || 0;
        result.degraded = stats.degraded || 0;
        result.unhealthy = stats.unhealthy || 0;

        if (level === 'detailed') {
          result.components = sources.healthCheck.listComponents();
        }
      } catch (e) {
        result.error = e.message;
      }
    }

    return result;
  }

  _collectRetryData(since, level) {
    const sources = this.config.sources;
    const result = { totalRetries: 0, circuitBreakerState: 'unknown' };

    if (sources.autoRetry) {
      try {
        const stats = sources.autoRetry.getStats();
        result.totalRetries = stats.totalRetries || 0;
        result.totalOperations = stats.totalOperations || 0;
        result.circuitBreakerState = stats.circuitBreaker?.state || 'closed';

        if (level === 'detailed') {
          const history = sources.autoRetry.getRetryHistory
            ? sources.autoRetry.getRetryHistory(since ? { since } : {})
            : [];
          result.recentRetries = history.slice(-10);
        }
      } catch (e) {
        result.error = e.message;
      }
    }

    return result;
  }

  _collectHealingData(since, level) {
    const sources = this.config.sources;
    const result = { totalHeals: 0, healRate: '0' };

    if (sources.selfHealing) {
      try {
        const stats = sources.selfHealing.getStats();
        result.totalHeals = stats.totalHeals || 0;
        result.healRate = stats.healRate || '0';
        result.totalStrategies = stats.totalStrategies || 0;

        if (level === 'detailed') {
          const history = sources.selfHealing.getHealHistory
            ? sources.selfHealing.getHealHistory(since ? { since } : {})
            : [];
          result.recentHeals = history.slice(-10);
        }
      } catch (e) {
        result.error = e.message;
      }
    }

    return result;
  }

  _collectDeviationData(since, level) {
    const sources = this.config.sources;
    const result = { totalDeviations: 0 };

    if (sources.deviationDetector) {
      try {
        const stats = sources.deviationDetector.getStats();
        result.totalDeviations = stats.totalDeviations || 0;
        result.totalAlerts = stats.totalAlerts || 0;

        if (level === 'detailed') {
          const history = sources.deviationDetector.getDetectionHistory
            ? sources.deviationDetector.getDetectionHistory(since ? { since } : {})
            : [];
          result.recentDeviations = history.slice(-10);
        }
      } catch (e) {
        result.error = e.message;
      }
    }

    return result;
  }

  _collectCustomSections(since) {
    const sections = {};
    for (const [id, section] of this.customSections.entries()) {
      try {
        sections[id] = {
          name: section.name,
          data: section.collect({ since })
        };
      } catch (e) {
        sections[id] = { name: section.name, error: e.message };
      }
    }
    return sections;
  }

  // ========== 分析与建议 ==========

  _analyzeAndRecommend(report) {
    const issues = [];
    const recommendations = [];

    // 检查系统状态
    if (report.system.overallStatus === 'unhealthy') {
      issues.push({ severity: 'high', message: '系统整体状态为 unhealthy', source: 'system' });
      recommendations.push('检查关键组件状态，优先修复 unhealthy 组件');
    } else if (report.system.overallStatus === 'degraded') {
      issues.push({ severity: 'medium', message: '系统整体状态为 degraded', source: 'system' });
      recommendations.push('检查降级组件，评估是否需要干预');
    }

    // 检查执行成功率
    const execData = report.execution;
    if (execData.totalExecutions > 0) {
      const rate = parseFloat(execData.successRate);
      if (rate < 50) {
        issues.push({ severity: 'high', message: `执行成功率过低: ${rate}%`, source: 'execution' });
        recommendations.push('分析失败执行的错误模式，考虑调整重试策略或修复根因');
      } else if (rate < 80) {
        issues.push({ severity: 'medium', message: `执行成功率偏低: ${rate}%`, source: 'execution' });
      }
    }

    // 检查错误模式
    if (report.errors.totalErrors > 10) {
      issues.push({ severity: 'medium', message: `累计错误较多: ${report.errors.totalErrors}`, source: 'errors' });
    }
    if (report.errors.topPatterns && report.errors.topPatterns.length > 0) {
      const top = report.errors.topPatterns[0];
      if (top.count >= 5) {
        issues.push({
          severity: 'high',
          message: `高频错误模式: ${top.category} (${top.count}次)`,
          source: 'errors'
        });
        recommendations.push(`重点关注 ${top.category} 类错误，考虑添加针对性自愈策略`);
      }
    }

    // 检查健康状态
    if (report.health.unhealthy > 0) {
      issues.push({
        severity: 'high',
        message: `${report.health.unhealthy} 个组件不健康`,
        source: 'health'
      });
    }
    if (report.health.degraded > 0) {
      issues.push({
        severity: 'low',
        message: `${report.health.degraded} 个组件降级`,
        source: 'health'
      });
    }

    // 检查断路器
    if (report.retry && report.retry.circuitBreakerState === 'open') {
      issues.push({ severity: 'high', message: '断路器已打开，重试被阻断', source: 'retry' });
      recommendations.push('等待断路器自动恢复或手动重置，同时排查导致连续失败的根因');
    }

    // 检查自愈效果
    if (report.healing && report.healing.totalHeals > 0) {
      const healRate = parseFloat(report.healing.healRate);
      if (healRate < 30) {
        issues.push({
          severity: 'medium',
          message: `自愈成功率偏低: ${healRate}%`,
          source: 'healing'
        });
        recommendations.push('评估现有自愈策略的有效性，考虑注册更精准的自定义策略');
      }
    }

    return { issues, recommendations };
  }

  _buildSummaryText(report) {
    const parts = [];

    parts.push(`系统状态: ${report.system.overallStatus}`);

    if (report.execution.totalExecutions > 0) {
      parts.push(`执行: ${report.execution.totalExecutions}次 (成功率 ${report.execution.successRate}%)`);
    }

    if (report.errors.totalErrors > 0) {
      parts.push(`错误: ${report.errors.totalErrors}个`);
    }

    if (report.issues.length > 0) {
      const highCount = report.issues.filter(i => i.severity === 'high').length;
      if (highCount > 0) {
        parts.push(`严重问题: ${highCount}个`);
      }
      parts.push(`总问题: ${report.issues.length}个`);
    } else {
      parts.push('无异常');
    }

    return parts.join(' | ');
  }
}

module.exports = DiagnosticReporter;
