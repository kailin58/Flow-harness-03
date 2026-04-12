const fs = require('fs');
const path = require('path');
const { createLogger } = require('./logger');

class KnowledgeBase {
  constructor(knowledgePath = '.flowharness/knowledge') {
    this.knowledgePath = knowledgePath;
    this.patternsFile = path.join(knowledgePath, 'patterns.json');
    this.metricsFile = path.join(knowledgePath, 'metrics.json');
    this.patterns = null;
    this.metrics = null;
    this.logger = createLogger({ name: 'knowledge-base' });
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

  // ----------------------------------------------------------
  // Spec 文件支持 (Phase G: 借鉴 ai-website-cloner)
  // ----------------------------------------------------------

  /**
   * 写入 Spec 文件
   * @param {string} specName - Spec 名称
   * @param {Object} spec - Spec 内容
   * @param {Object} options - 可选配置
   * @returns {Object} Spec 文件路径和可复用性评分
   */
  writeSpec(specName, spec, options = {}) {
    const specDir = path.join(this.knowledgePath, 'specs');

    // 确保目录存在
    if (!fs.existsSync(specDir)) {
      fs.mkdirSync(specDir, { recursive: true });
    }

    const specPath = path.join(specDir, `${specName}.json`);

    // 计算可复用性评分
    const reusability = this.calculateReusability(spec);

    const specData = {
      name: specName,
      version: '1.0',
      createdAt: new Date().toISOString(),
      spec: spec,
      metadata: {
        taskType: options.taskType || 'unknown',
        successRate: options.successRate || null,
        reusability: reusability
      }
    };

    fs.writeFileSync(specPath, JSON.stringify(specData, null, 2), 'utf8');

    return {
      path: specPath,
      name: specName,
      reusability: reusability
    };
  }

  /**
   * 读取 Spec 文件
   * @param {string} specName - Spec 名称
   * @returns {Object|null} Spec 内容
   */
  readSpec(specName) {
    const specPath = path.join(this.knowledgePath, 'specs', `${specName}.json`);

    if (!fs.existsSync(specPath)) {
      return null;
    }

    return JSON.parse(fs.readFileSync(specPath, 'utf8'));
  }

  /**
   * 列出所有 Spec
   * @returns {Array} Spec 列表
   */
  listSpecs() {
    const specDir = path.join(this.knowledgePath, 'specs');

    if (!fs.existsSync(specDir)) {
      return [];
    }

    return fs.readdirSync(specDir)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const spec = JSON.parse(fs.readFileSync(path.join(specDir, f), 'utf8'));
        return {
          name: spec.name,
          taskType: spec.metadata?.taskType,
          reusability: spec.metadata?.reusability,
          createdAt: spec.createdAt
        };
      });
  }

  /**
   * 删除 Spec 文件
   * @param {string} specName - Spec 名称
   * @returns {boolean} 是否成功删除
   */
  deleteSpec(specName) {
    const specPath = path.join(this.knowledgePath, 'specs', `${specName}.json`);

    if (fs.existsSync(specPath)) {
      fs.unlinkSync(specPath);
      return true;
    }

    return false;
  }

  /**
   * 计算可复用性评分
   * @param {Object} spec - Spec 内容
   * @returns {number} 0-1 的可复用性评分
   */
  calculateReusability(spec) {
    let score = 0;

    // 有明确的输入输出定义 +0.3
    if (spec.inputs && Object.keys(spec.inputs).length > 0) score += 0.15;
    if (spec.outputs && Object.keys(spec.outputs).length > 0) score += 0.15;

    // 有依赖说明 +0.2
    if (spec.dependencies && spec.dependencies.length > 0) score += 0.2;

    // 有示例 +0.2
    if (spec.examples && spec.examples.length > 0) score += 0.2;

    // 有验收标准 +0.3
    if (spec.acceptanceCriteria && spec.acceptanceCriteria.length > 0) score += 0.3;

    return Math.min(1, Math.round(score * 100) / 100);
  }

  /**
   * 导出 Spec 数据
   * @param {Object} options - 导出选项
   * @returns {Array} 导出的 Spec 列表
   */
  exportSpecs(options = {}) {
    const specs = this.listSpecs();
    const minReusability = options.minReusability || 0.5;

    return specs
      .filter(s => s.reusability >= minReusability)
      .map(s => this.readSpec(s.name));
  }

  // ----------------------------------------------------------
  // 归档功能
  // ----------------------------------------------------------

  /**
   * 归档超限的 metrics 数据
   * 将旧条目迁移到按月归档文件，保留最新 MAX_ENTRIES 条
   */
  async archiveOldMetrics(maxEntries = 500) {
    const metricsPath = this.metricsFile;
    if (!fs.existsSync(metricsPath)) return { archived: 0 };

    const raw = fs.readFileSync(metricsPath, 'utf8');
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return { archived: 0, error: 'metrics.json parse failed' };
    }

    // 查找所有数组类型的顶层字段
    let totalArchived = 0;
    const archiveDir = path.join(this.knowledgePath, 'archive');
    if (!fs.existsSync(archiveDir)) {
      fs.mkdirSync(archiveDir, { recursive: true });
    }

    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    for (const key of Object.keys(data)) {
      if (Array.isArray(data[key]) && data[key].length > maxEntries) {
        const overflow = data[key].slice(0, data[key].length - maxEntries);
        data[key] = data[key].slice(-maxEntries);
        totalArchived += overflow.length;

        // 追加写入归档文件
        const archivePath = path.join(archiveDir, `metrics_${key}_${monthKey}.json`);
        let archiveData = [];
        if (fs.existsSync(archivePath)) {
          try { archiveData = JSON.parse(fs.readFileSync(archivePath, 'utf8')); } catch (error) {
            this.logger.warn(`Failed to parse archive file ${archivePath}: ${error.message}`);
          }
        }
        archiveData.push(...overflow);
        fs.writeFileSync(archivePath, JSON.stringify(archiveData, null, 2));
      }
    }

    // 回写精简后的 metrics.json
    fs.writeFileSync(metricsPath, JSON.stringify(data, null, 2));

    return { archived: totalArchived, remaining: JSON.stringify(data).length };
  }

  // ══════════════════════════════════════════════════════════════
  //  命名空间共享知识层（Shared Knowledge Bus）
  //
  //  设计原则：
  //   - 写入：每个命名空间归属固定 Agent，只有 owner 可写（Write-Owned）
  //   - 读取：任意 Agent 可以无限制读取任何命名空间（Read-All）
  //   - 用途：替代跨 Agent 直接通信，消除信息孤岛
  //
  //  命名空间归属：
  //   codebase  → explore    （代码库探索结果）
  //   plans     → plan       （方案设计结果）
  //   changes   → general    （执行变更记录）
  //   quality   → inspector  （质检结果）
  //   external  → research   （外部知识）
  //   decisions → supervisor （CEO决策与广播）
  // ══════════════════════════════════════════════════════════════

  /**
   * 命名空间所有权表（静态，不可在运行时修改）
   */
  static get NS_OWNERS() {
    return {
      codebase:  'explore',
      plans:     'plan',
      changes:   'general',
      quality:   'inspector',
      external:  'research',
      decisions:  'supervisor',
      schedules:  'supervisor',  // 定时任务记忆层，CEO独占写入
      compliance: 'supervisor'   // 合规审计日志，CEO独占写入
    };
  }

  /**
   * 向命名空间写入数据（Write-Owned：仅 owner 可写）
   *
   * @param {string} namespace - 命名空间（见 NS_OWNERS）
   * @param {string} key       - 数据键
   * @param {*}      data      - 写入内容
   * @param {string} writerId  - 写入方 Agent ID（必须是该命名空间 owner）
   * @returns {{ ok: boolean, path: string }}
   */
  writeShared(namespace, key, data, writerId) {
    const owner = KnowledgeBase.NS_OWNERS[namespace];
    if (!owner) {
      throw new Error(`[KB] 未知命名空间: "${namespace}"，合法值: ${Object.keys(KnowledgeBase.NS_OWNERS).join(', ')}`);
    }
    if (writerId !== owner) {
      throw new Error(`[KB] 写入拒绝：命名空间 "${namespace}" 归属 "${owner}"，"${writerId}" 无写入权限`);
    }

    const nsDir  = path.join(this.knowledgePath, 'shared', namespace);
    const nsFile = path.join(nsDir, `${key}.json`);

    if (!fs.existsSync(nsDir)) {
      fs.mkdirSync(nsDir, { recursive: true });
    }

    const entry = {
      namespace,
      key,
      owner,
      data,
      writtenAt: new Date().toISOString(),
      writtenBy: writerId
    };

    fs.writeFileSync(nsFile, JSON.stringify(entry, null, 2), 'utf8');
    return { ok: true, path: nsFile };
  }

  /**
   * 从命名空间读取数据（Read-All：任意 Agent 可读）
   *
   * @param {string} namespace - 命名空间
   * @param {string} key       - 数据键
   * @param {string} [readerId] - 可选，仅用于审计日志
   * @returns {{ data: *, writtenAt: string, writtenBy: string } | null}
   */
  readShared(namespace, key, readerId) {
    const nsFile = path.join(this.knowledgePath, 'shared', namespace, `${key}.json`);
    if (!fs.existsSync(nsFile)) return null;

    try {
      const raw   = fs.readFileSync(nsFile, 'utf8');
      const entry = JSON.parse(raw);
      return {
        data:      entry.data,
        writtenAt: entry.writtenAt,
        writtenBy: entry.writtenBy,
        namespace: entry.namespace,
        key:       entry.key
      };
    } catch {
      return null;
    }
  }

  /**
   * 列出某命名空间下的所有 key
   *
   * @param {string} namespace
   * @returns {string[]}
   */
  listShared(namespace) {
    const nsDir = path.join(this.knowledgePath, 'shared', namespace);
    if (!fs.existsSync(nsDir)) return [];
    return fs.readdirSync(nsDir)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace(/\.json$/, ''));
  }

  /**
   * 读取某命名空间的全部内容（Read-All）
   *
   * @param {string} namespace
   * @returns {Object} { [key]: entry }
   */
  readAllShared(namespace) {
    const keys = this.listShared(namespace);
    const result = {};
    for (const key of keys) {
      result[key] = this.readShared(namespace, key);
    }
    return result;
  }
}

module.exports = KnowledgeBase;
