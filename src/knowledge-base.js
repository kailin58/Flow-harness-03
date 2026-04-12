const fs = require('fs');
const path = require('path');

class KnowledgeBase {
  constructor(knowledgePath = '.flowharness/knowledge') {
    this.knowledgePath = knowledgePath;
    this.patternsFile = path.join(knowledgePath, 'patterns.json');
    this.metricsFile = path.join(knowledgePath, 'metrics.json');
    this.patterns = null;
    this.metrics = null;
  }

  load() {
    try {
      // 加载模式数据
      if (fs.existsSync(this.patternsFile)) {
        const patternsData = fs.readFileSync(this.patternsFile, 'utf8');
        this.patterns = JSON.parse(patternsData);
      } else {
        this.patterns = this.getDefaultPatterns();
      }

      // 加载指标数据
      if (fs.existsSync(this.metricsFile)) {
        const metricsData = fs.readFileSync(this.metricsFile, 'utf8');
        this.metrics = JSON.parse(metricsData);
      } else {
        this.metrics = this.getDefaultMetrics();
      }
    } catch (error) {
      throw new Error(`Failed to load knowledge base: ${error.message}`);
    }
  }

  save() {
    try {
      // 确保目录存在
      if (!fs.existsSync(this.knowledgePath)) {
        fs.mkdirSync(this.knowledgePath, { recursive: true });
      }

      // 保存模式数据
      fs.writeFileSync(
        this.patternsFile,
        JSON.stringify(this.patterns, null, 2),
        'utf8'
      );

      // 保存指标数据
      fs.writeFileSync(
        this.metricsFile,
        JSON.stringify(this.metrics, null, 2),
        'utf8'
      );
    } catch (error) {
      throw new Error(`Failed to save knowledge base: ${error.message}`);
    }
  }

  recordExecution(workflowName, stepName, result) {
    const record = {
      workflow: workflowName,
      step: stepName,
      success: result.success,
      execution_time: result.execution_time,
      timestamp: new Date().toISOString(),
      error: result.error || null
    };

    // 添加到指标
    if (!this.metrics.version) {
      this.metrics = this.getDefaultMetrics();
    }

    this.metrics.metrics.push(record);

    // 更新统计
    this.updateStatistics(record);

    // 分析模式
    this.analyzePatterns(record);

    this.save();
  }

  updateStatistics(record) {
    const stats = this.patterns.statistics;

    stats.total_runs++;

    if (record.success) {
      stats.successful_runs++;
    } else {
      stats.failed_runs++;
    }

    // 更新平均执行时间
    const totalTime = stats.avg_execution_time * (stats.total_runs - 1) + record.execution_time;
    stats.avg_execution_time = totalTime / stats.total_runs;

    this.patterns.last_updated = new Date().toISOString();
  }

  analyzePatterns(record) {
    if (record.success) {
      this.recordSuccessPattern(record);
    } else {
      this.recordFailurePattern(record);
    }
  }

  recordSuccessPattern(record) {
    const patternKey = `${record.workflow}:${record.step}`;

    let pattern = this.patterns.successful_patterns.find(p => p.pattern === patternKey);

    if (!pattern) {
      pattern = {
        pattern: patternKey,
        workflow: record.workflow,
        step: record.step,
        success_count: 0,
        total_count: 0,
        success_rate: 0,
        avg_time: 0,
        learned_at: new Date().toISOString()
      };
      this.patterns.successful_patterns.push(pattern);
    }

    pattern.success_count++;
    pattern.total_count++;
    pattern.success_rate = pattern.success_count / pattern.total_count;

    // 更新平均时间
    const totalTime = pattern.avg_time * (pattern.success_count - 1) + record.execution_time;
    pattern.avg_time = totalTime / pattern.success_count;

    // 生成建议
    if (pattern.success_rate > 0.9 && pattern.total_count >= 10) {
      pattern.recommendation = 'highly_reliable';
    } else if (pattern.success_rate > 0.7) {
      pattern.recommendation = 'reliable';
    }
  }

  recordFailurePattern(record) {
    const patternKey = `${record.workflow}:${record.step}`;

    let pattern = this.patterns.failure_patterns.find(p => p.pattern === patternKey);

    if (!pattern) {
      pattern = {
        pattern: patternKey,
        workflow: record.workflow,
        step: record.step,
        failure_count: 0,
        total_count: 0,
        failure_rate: 0,
        errors: [],
        learned_at: new Date().toISOString()
      };
      this.patterns.failure_patterns.push(pattern);
    }

    pattern.failure_count++;
    pattern.total_count++;
    pattern.failure_rate = pattern.failure_count / pattern.total_count;

    // 记录错误
    if (record.error && !pattern.errors.includes(record.error)) {
      pattern.errors.push(record.error);
    }

    // 生成建议
    if (pattern.failure_rate > 0.5 && pattern.total_count >= 5) {
      pattern.recommendation = 'needs_attention';
      pattern.suggestion = 'Consider reviewing or disabling this step';
    }
  }

  getOptimizations() {
    const optimizations = [];

    // 基于成功模式的优化
    for (const pattern of this.patterns.successful_patterns) {
      if (pattern.success_rate > 0.95 && pattern.total_count >= 10) {
        optimizations.push({
          type: 'enable',
          pattern: pattern.pattern,
          reason: `High success rate (${(pattern.success_rate * 100).toFixed(1)}%)`,
          confidence: pattern.success_rate
        });
      }
    }

    // 基于失败模式的优化
    for (const pattern of this.patterns.failure_patterns) {
      if (pattern.failure_rate > 0.7 && pattern.total_count >= 5) {
        optimizations.push({
          type: 'disable',
          pattern: pattern.pattern,
          reason: `High failure rate (${(pattern.failure_rate * 100).toFixed(1)}%)`,
          confidence: pattern.failure_rate,
          errors: pattern.errors
        });
      }
    }

    return optimizations;
  }

  // ----------------------------------------------------------
  // 导出 / 合并 (方案C: 混合模式经验回流)
  // ----------------------------------------------------------

  /**
   * 导出知识库数据（可移植格式）
   * @param {Object} options
   * @param {string} options.projectId - 项目标识
   * @param {number} options.minConfidence - 最低置信度 (默认 0.7)
   * @returns {Object} 导出包
   */
  exportData(options = {}) {
    if (!this.patterns) this.load();

    const minConfidence = options.minConfidence || 0.7;
    const projectId = options.projectId || 'unknown';

    // 只导出有价值的模式 (有足够样本量的)
    const exportPatterns = this.patterns.successful_patterns
      .filter(p => p.total_count >= 3 && p.success_rate >= minConfidence);

    const exportFailures = this.patterns.failure_patterns
      .filter(p => p.total_count >= 3);

    return {
      version: '1.0',
      type: 'knowledge',
      projectId,
      exportedAt: new Date().toISOString(),
      patterns: {
        successful_patterns: exportPatterns,
        failure_patterns: exportFailures,
        statistics: { ...this.patterns.statistics }
      },
      metrics: this.metrics ? {
        metrics: (this.metrics.metrics || []).slice(-200),
        aggregated: this.metrics.aggregated || {}
      } : null
    };
  }

  /**
   * 合并外部知识库数据
   * @param {Object} pack - exportData() 的输出
   * @returns {Object} 合并结果
   */
  mergeData(pack) {
    if (!this.patterns) this.load();

    if (!pack || pack.type !== 'knowledge' || !pack.patterns) {
      return { success: false, error: 'Invalid knowledge pack format' };
    }

    let merged = 0;
    let skipped = 0;
    let updated = 0;

    // 合并成功模式
    for (const ext of (pack.patterns.successful_patterns || [])) {
      const existing = this.patterns.successful_patterns
        .find(p => p.pattern === ext.pattern);

      if (existing) {
        // 加权合并: 合并计数，重新计算成功率
        const totalCount = existing.total_count + ext.total_count;
        const successCount = Math.round(existing.success_rate * existing.total_count)
          + Math.round(ext.success_rate * ext.total_count);
        existing.total_count = totalCount;
        existing.success_count = successCount;
        existing.success_rate = totalCount > 0 ? successCount / totalCount : 0;
        existing.avg_time = existing.total_count > 0
          ? Math.round((existing.avg_time * (existing.total_count - ext.total_count)
            + (ext.avg_time || 0) * ext.total_count) / totalCount)
          : existing.avg_time;
        // 重新评估推荐级别
        if (existing.success_rate > 0.9 && existing.total_count >= 10) {
          existing.recommendation = 'highly_reliable';
        } else if (existing.success_rate > 0.7) {
          existing.recommendation = 'reliable';
        }
        updated++;
      } else {
        // 新模式: 降低置信度导入 (0.8x)
        const imported = { ...ext };
        imported.success_rate = Math.round(ext.success_rate * 0.8 * 100) / 100;
        imported.recommendation = imported.success_rate > 0.7 ? 'reliable' : null;
        imported.learned_at = new Date().toISOString();
        this.patterns.successful_patterns.push(imported);
        merged++;
      }
    }

    // 合并失败模式
    for (const ext of (pack.patterns.failure_patterns || [])) {
      const existing = this.patterns.failure_patterns
        .find(p => p.pattern === ext.pattern);

      if (existing) {
        const totalCount = existing.total_count + ext.total_count;
        const failCount = Math.round(existing.failure_rate * existing.total_count)
          + Math.round(ext.failure_rate * ext.total_count);
        existing.total_count = totalCount;
        existing.failure_count = failCount;
        existing.failure_rate = totalCount > 0 ? failCount / totalCount : 0;
        // 合并错误列表 (去重)
        for (const err of (ext.errors || [])) {
          if (!existing.errors.includes(err)) {
            existing.errors.push(err);
          }
        }
        if (existing.failure_rate > 0.5 && existing.total_count >= 5) {
          existing.recommendation = 'needs_attention';
        }
        updated++;
      } else {
        const imported = { ...ext, errors: [...(ext.errors || [])] };
        imported.learned_at = new Date().toISOString();
        this.patterns.failure_patterns.push(imported);
        merged++;
      }
    }

    // 合并统计 (累加)
    if (pack.patterns.statistics) {
      const s = this.patterns.statistics;
      const ext = pack.patterns.statistics;
      const oldTotal = s.total_runs;
      s.total_runs += ext.total_runs || 0;
      s.successful_runs += ext.successful_runs || 0;
      s.failed_runs += ext.failed_runs || 0;
      if (s.total_runs > 0) {
        s.avg_execution_time = Math.round(
          (s.avg_execution_time * oldTotal + (ext.avg_execution_time || 0) * (ext.total_runs || 0))
          / s.total_runs
        );
      }
    }

    // 合并 metrics (追加去重)
    if (pack.metrics && pack.metrics.metrics && this.metrics) {
      const existingKeys = new Set(
        this.metrics.metrics.map(m => `${m.workflow}:${m.step}:${m.timestamp}`)
      );
      for (const m of pack.metrics.metrics) {
        const key = `${m.workflow}:${m.step}:${m.timestamp}`;
        if (!existingKeys.has(key)) {
          this.metrics.metrics.push(m);
          merged++;
        } else {
          skipped++;
        }
      }
    }

    this.patterns.last_updated = new Date().toISOString();
    this.save();

    return {
      success: true,
      merged,
      updated,
      skipped,
      source: pack.projectId || 'unknown',
      totalPatterns: this.patterns.successful_patterns.length + this.patterns.failure_patterns.length
    };
  }

  getDefaultPatterns() {
    return {
      version: '1.0',
      last_updated: new Date().toISOString(),
      successful_patterns: [],
      failure_patterns: [],
      optimizations: [],
      statistics: {
        total_runs: 0,
        successful_runs: 0,
        failed_runs: 0,
        avg_execution_time: 0
      }
    };
  }

  getDefaultMetrics() {
    return {
      version: '1.0',
      metrics: [],
      aggregated: {
        by_workflow: {},
        by_step: {},
        by_day: {}
      }
    };
  }
}

module.exports = KnowledgeBase;
