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
