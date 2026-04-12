/**
 * ab-testing.js - A/B 测试框架
 *
 * 文档要求(P3): A/B 测试
 *   - 实验定义 — 变体配置、流量分配
 *   - 流量分配 — 加权随机 / 基于特征的分组
 *   - 指标收集 — 每变体独立指标 (成功率/延迟/质量分)
 *   - 统计显著性分析 — Z-Test / 卡方检验
 *   - 自动决策 — 达到显著性后自动选择赢家
 *   - 实验生命周期管理
 *
 * @version 1.0.0
 * @date 2026-04-13
 */

const { createLogger } = require('./logger');

// ============================================================
// 常量
// ============================================================

const EXPERIMENT_STATUS = {
  DRAFT: 'draft',
  RUNNING: 'running',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
};

const VARIANT_TYPE = {
  CONTROL: 'control',
  TREATMENT: 'treatment'
};

const METRIC_GOAL = {
  MAXIMIZE: 'maximize',
  MINIMIZE: 'minimize'
};

const SIGNIFICANCE_LEVEL = {
  HIGH: 0.01,     // 99% 置信
  MEDIUM: 0.05,   // 95% 置信
  LOW: 0.10       // 90% 置信
};

// ============================================================
// ABTestingFramework
// ============================================================

class ABTestingFramework {
  /**
   * @param {Object} options
   * @param {number} options.defaultSampleSize   - 默认最小样本量
   * @param {number} options.significanceLevel    - 默认显著性水平
   * @param {boolean} options.autoComplete        - 达到显著性自动完成
   * @param {number} options.maxExperiments       - 最大并行实验数
   * @param {Object} options.logger
   */
  constructor(options = {}) {
    this.defaultSampleSize = options.defaultSampleSize || 30;
    this.significanceLevel = options.significanceLevel || SIGNIFICANCE_LEVEL.MEDIUM;
    this.autoComplete = options.autoComplete !== false;
    this.maxExperiments = options.maxExperiments || 20;
    this.logger = options.logger || createLogger({ name: 'ab-testing' });

    // 实验注册表
    this.experiments = new Map();

    // 分配记录 (subjectId → experimentId → variantId)
    this.assignments = new Map();

    // 事件日志
    this.eventLog = [];

    // 统计
    this.stats = {
      experimentsCreated: 0,
      experimentsCompleted: 0,
      totalAssignments: 0,
      totalObservations: 0,
      autoDecisions: 0
    };
  }

  // ----------------------------------------------------------
  // 实验管理
  // ----------------------------------------------------------

  /**
   * 创建 A/B 实验
   * @param {Object} config - 实验配置
   * @param {string} config.name - 实验名称
   * @param {string} config.description - 实验描述
   * @param {Object[]} config.variants - 变体列表
   * @param {Object} config.primaryMetric - 主要指标定义
   * @param {number} config.minSampleSize - 最小样本量
   * @param {number} config.significanceLevel - 显著性水平
   * @returns {Object} 创建结果
   */
  createExperiment(config = {}) {
    if (!config.name) {
      return { success: false, error: '实验名称不能为空' };
    }

    const activeCount = [...this.experiments.values()]
      .filter(e => e.status === EXPERIMENT_STATUS.RUNNING).length;
    if (activeCount >= this.maxExperiments) {
      return { success: false, error: `活跃实验数已达上限 (${this.maxExperiments})` };
    }

    const experimentId = `exp_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;

    // 解析变体
    const variants = this._parseVariants(config.variants);
    if (!variants.success) {
      return { success: false, error: variants.error };
    }

    const experiment = {
      id: experimentId,
      name: config.name,
      description: config.description || '',
      status: EXPERIMENT_STATUS.DRAFT,
      variants: variants.data,
      primaryMetric: {
        name: (config.primaryMetric && config.primaryMetric.name) || 'success_rate',
        goal: (config.primaryMetric && config.primaryMetric.goal) || METRIC_GOAL.MAXIMIZE
      },
      minSampleSize: config.minSampleSize || this.defaultSampleSize,
      significanceLevel: config.significanceLevel || this.significanceLevel,
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      winner: null,
      observations: new Map(), // variantId → [values]
      metadata: config.metadata || {}
    };

    // 初始化变体观测
    for (const v of experiment.variants) {
      experiment.observations.set(v.id, []);
    }

    this.experiments.set(experimentId, experiment);
    this.stats.experimentsCreated++;

    this._logEvent('experiment_created', { experimentId, name: config.name });
    this.logger.info({ experimentId }, 'Experiment created');

    return { success: true, experimentId, experiment: this._formatExperiment(experiment) };
  }

  /**
   * 启动实验
   */
  startExperiment(experimentId) {
    const exp = this.experiments.get(experimentId);
    if (!exp) return { success: false, error: '实验不存在' };
    if (exp.status === EXPERIMENT_STATUS.RUNNING) {
      return { success: false, error: '实验已在运行' };
    }
    if (exp.status === EXPERIMENT_STATUS.COMPLETED || exp.status === EXPERIMENT_STATUS.CANCELLED) {
      return { success: false, error: `实验已结束 (${exp.status})` };
    }

    exp.status = EXPERIMENT_STATUS.RUNNING;
    exp.startedAt = new Date().toISOString();

    this._logEvent('experiment_started', { experimentId });
    return { success: true };
  }

  /**
   * 暂停实验
   */
  pauseExperiment(experimentId) {
    const exp = this.experiments.get(experimentId);
    if (!exp) return { success: false, error: '实验不存在' };
    if (exp.status !== EXPERIMENT_STATUS.RUNNING) {
      return { success: false, error: '实验未在运行' };
    }

    exp.status = EXPERIMENT_STATUS.PAUSED;
    this._logEvent('experiment_paused', { experimentId });
    return { success: true };
  }

  /**
   * 完成实验并选出赢家
   */
  completeExperiment(experimentId, winnerId) {
    const exp = this.experiments.get(experimentId);
    if (!exp) return { success: false, error: '实验不存在' };

    if (winnerId) {
      const variant = exp.variants.find(v => v.id === winnerId);
      if (!variant) return { success: false, error: '赢家变体不存在' };
      exp.winner = winnerId;
    }

    exp.status = EXPERIMENT_STATUS.COMPLETED;
    exp.completedAt = new Date().toISOString();
    this.stats.experimentsCompleted++;

    this._logEvent('experiment_completed', { experimentId, winner: exp.winner });
    return { success: true, winner: exp.winner };
  }

  /**
   * 取消实验
   */
  cancelExperiment(experimentId) {
    const exp = this.experiments.get(experimentId);
    if (!exp) return { success: false, error: '实验不存在' };

    exp.status = EXPERIMENT_STATUS.CANCELLED;
    exp.completedAt = new Date().toISOString();

    this._logEvent('experiment_cancelled', { experimentId });
    return { success: true };
  }

  /**
   * 获取实验
   */
  getExperiment(experimentId) {
    const exp = this.experiments.get(experimentId);
    return exp ? this._formatExperiment(exp) : null;
  }

  /**
   * 列出实验
   */
  listExperiments(filters = {}) {
    let exps = [...this.experiments.values()];
    if (filters.status) {
      exps = exps.filter(e => e.status === filters.status);
    }
    return exps.map(e => this._formatExperiment(e));
  }

  // ----------------------------------------------------------
  // 流量分配
  // ----------------------------------------------------------

  /**
   * 为 subject 分配变体
   * @param {string} experimentId - 实验 ID
   * @param {string} subjectId - 用户/请求 ID
   * @param {Object} features - 特征 (用于特征分组)
   * @returns {Object} 分配结果
   */
  assignVariant(experimentId, subjectId, features = {}) {
    const exp = this.experiments.get(experimentId);
    if (!exp) return { success: false, error: '实验不存在' };
    if (exp.status !== EXPERIMENT_STATUS.RUNNING) {
      return { success: false, error: '实验未在运行' };
    }

    // 检查是否已分配 (粘性分配)
    const key = `${experimentId}:${subjectId}`;
    if (this.assignments.has(key)) {
      const variantId = this.assignments.get(key);
      return { success: true, variantId, cached: true };
    }

    // 分配变体
    let variantId;

    // 特征分组: 如果定义了 targetFeature 且 subject 有对应特征
    const featureVariant = exp.variants.find(v =>
      v.targetFeature && features[v.targetFeature.key] === v.targetFeature.value
    );

    if (featureVariant) {
      variantId = featureVariant.id;
    } else {
      // 加权随机分配
      variantId = this._weightedRandom(exp.variants);
    }

    this.assignments.set(key, variantId);
    this.stats.totalAssignments++;

    this._logEvent('variant_assigned', { experimentId, subjectId, variantId });

    return { success: true, variantId, cached: false };
  }

  /**
   * 获取 subject 的分配
   */
  getAssignment(experimentId, subjectId) {
    const key = `${experimentId}:${subjectId}`;
    return this.assignments.get(key) || null;
  }

  // ----------------------------------------------------------
  // 观测收集
  // ----------------------------------------------------------

  /**
   * 记录观测值
   * @param {string} experimentId - 实验 ID
   * @param {string} variantId - 变体 ID
   * @param {number} value - 观测值
   * @param {Object} metadata - 附加信息
   * @returns {Object} 记录结果
   */
  recordObservation(experimentId, variantId, value, metadata = {}) {
    const exp = this.experiments.get(experimentId);
    if (!exp) return { success: false, error: '实验不存在' };

    if (exp.status !== EXPERIMENT_STATUS.RUNNING && exp.status !== EXPERIMENT_STATUS.PAUSED) {
      return { success: false, error: '实验未在运行或暂停' };
    }

    const observations = exp.observations.get(variantId);
    if (!observations) return { success: false, error: '变体不存在' };

    if (typeof value !== 'number' || isNaN(value)) {
      return { success: false, error: '观测值必须为数字' };
    }

    observations.push({
      value,
      timestamp: new Date().toISOString(),
      ...metadata
    });

    this.stats.totalObservations++;

    // 自动完成检查
    if (this.autoComplete && exp.status === EXPERIMENT_STATUS.RUNNING) {
      this._checkAutoComplete(experimentId);
    }

    return { success: true, count: observations.length };
  }

  /**
   * 批量记录观测
   */
  recordBatch(experimentId, variantId, values) {
    if (!Array.isArray(values)) return { success: false, error: 'values 必须为数组' };

    let recorded = 0;
    for (const v of values) {
      const val = typeof v === 'number' ? v : v.value;
      const result = this.recordObservation(experimentId, variantId, val);
      if (result.success) recorded++;
    }
    return { success: true, recorded, total: values.length };
  }

  // ----------------------------------------------------------
  // 统计分析
  // ----------------------------------------------------------

  /**
   * 获取变体指标摘要
   * @param {string} experimentId - 实验 ID
   * @returns {Object} 各变体指标
   */
  getVariantMetrics(experimentId) {
    const exp = this.experiments.get(experimentId);
    if (!exp) return null;

    const metrics = {};
    for (const variant of exp.variants) {
      const obs = exp.observations.get(variant.id) || [];
      const values = obs.map(o => o.value);

      metrics[variant.id] = {
        variantId: variant.id,
        name: variant.name,
        type: variant.type,
        sampleSize: values.length,
        mean: this._mean(values),
        stddev: this._stddev(values),
        min: values.length > 0 ? Math.min(...values) : null,
        max: values.length > 0 ? Math.max(...values) : null,
        median: this._median(values),
        sum: values.reduce((a, b) => a + b, 0)
      };
    }

    return metrics;
  }

  /**
   * 执行统计显著性检验 (Z-Test for proportions / two-sample t-test)
   * @param {string} experimentId - 实验 ID
   * @returns {Object} 检验结果
   */
  analyzeSignificance(experimentId) {
    const exp = this.experiments.get(experimentId);
    if (!exp) return { success: false, error: '实验不存在' };

    const variants = exp.variants;
    if (variants.length < 2) {
      return { success: false, error: '至少需要 2 个变体' };
    }

    // 获取 control 和 treatment
    const control = variants.find(v => v.type === VARIANT_TYPE.CONTROL) || variants[0];
    const treatment = variants.find(v => v.type === VARIANT_TYPE.TREATMENT && v.id !== control.id) || variants[1];

    const controlObs = (exp.observations.get(control.id) || []).map(o => o.value);
    const treatmentObs = (exp.observations.get(treatment.id) || []).map(o => o.value);

    // 样本量不够
    if (controlObs.length < 2 || treatmentObs.length < 2) {
      return {
        success: true,
        significant: false,
        reason: '样本量不足',
        controlSample: controlObs.length,
        treatmentSample: treatmentObs.length,
        minRequired: exp.minSampleSize
      };
    }

    // Two-sample Z-test (or t-test approximation)
    const controlMean = this._mean(controlObs);
    const treatmentMean = this._mean(treatmentObs);
    const controlStd = this._stddev(controlObs);
    const treatmentStd = this._stddev(treatmentObs);

    const n1 = controlObs.length;
    const n2 = treatmentObs.length;

    // 合并标准误
    const se = Math.sqrt((controlStd * controlStd / n1) + (treatmentStd * treatmentStd / n2));

    let zScore = 0;
    let pValue = 1;

    if (se > 0) {
      zScore = (treatmentMean - controlMean) / se;
      // 近似 p-value (双侧)
      pValue = this._approximatePValue(Math.abs(zScore));
    }

    const significant = pValue < exp.significanceLevel &&
      n1 >= exp.minSampleSize && n2 >= exp.minSampleSize;

    // 效应量 (Cohen's d)
    const pooledStd = Math.sqrt(
      ((n1 - 1) * controlStd * controlStd + (n2 - 1) * treatmentStd * treatmentStd) /
      (n1 + n2 - 2)
    );
    const effectSize = pooledStd > 0 ? (treatmentMean - controlMean) / pooledStd : 0;

    // 确定赢家
    let winner = null;
    if (significant) {
      const isMaximize = exp.primaryMetric.goal === METRIC_GOAL.MAXIMIZE;
      if (isMaximize) {
        winner = treatmentMean > controlMean ? treatment.id : control.id;
      } else {
        winner = treatmentMean < controlMean ? treatment.id : control.id;
      }
    }

    return {
      success: true,
      significant,
      pValue: Math.round(pValue * 10000) / 10000,
      zScore: Math.round(zScore * 1000) / 1000,
      effectSize: Math.round(effectSize * 1000) / 1000,
      control: {
        id: control.id,
        mean: Math.round(controlMean * 1000) / 1000,
        stddev: Math.round(controlStd * 1000) / 1000,
        sampleSize: n1
      },
      treatment: {
        id: treatment.id,
        mean: Math.round(treatmentMean * 1000) / 1000,
        stddev: Math.round(treatmentStd * 1000) / 1000,
        sampleSize: n2
      },
      significanceLevel: exp.significanceLevel,
      winner
    };
  }

  /**
   * 获取实验报告
   */
  getExperimentReport(experimentId) {
    const exp = this.experiments.get(experimentId);
    if (!exp) return null;

    return {
      experiment: this._formatExperiment(exp),
      metrics: this.getVariantMetrics(experimentId),
      significance: this.analyzeSignificance(experimentId),
      duration: exp.startedAt
        ? Date.now() - new Date(exp.startedAt).getTime()
        : 0,
      totalObservations: [...exp.observations.values()]
        .reduce((sum, obs) => sum + obs.length, 0)
    };
  }

  // ----------------------------------------------------------
  // 查询接口
  // ----------------------------------------------------------

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ...this.stats,
      activeExperiments: [...this.experiments.values()]
        .filter(e => e.status === EXPERIMENT_STATUS.RUNNING).length,
      totalExperiments: this.experiments.size,
      assignmentCount: this.assignments.size
    };
  }

  /**
   * 获取事件日志
   */
  getEventLog(limit = 50) {
    return this.eventLog.slice(-limit);
  }

  // ----------------------------------------------------------
  // 内部方法
  // ----------------------------------------------------------

  _parseVariants(variants) {
    if (!variants || !Array.isArray(variants) || variants.length < 2) {
      return { success: false, error: '至少需要 2 个变体' };
    }

    const parsed = variants.map((v, i) => ({
      id: v.id || `variant_${i}`,
      name: v.name || `Variant ${i}`,
      type: v.type || (i === 0 ? VARIANT_TYPE.CONTROL : VARIANT_TYPE.TREATMENT),
      weight: v.weight || (1 / variants.length),
      config: v.config || {},
      targetFeature: v.targetFeature || null
    }));

    // 归一化权重
    const totalWeight = parsed.reduce((sum, v) => sum + v.weight, 0);
    for (const v of parsed) {
      v.weight = v.weight / totalWeight;
    }

    return { success: true, data: parsed };
  }

  _weightedRandom(variants) {
    const r = Math.random();
    let cumulative = 0;
    for (const v of variants) {
      cumulative += v.weight;
      if (r < cumulative) return v.id;
    }
    return variants[variants.length - 1].id;
  }

  _checkAutoComplete(experimentId) {
    const exp = this.experiments.get(experimentId);
    if (!exp) return;

    // 检查所有变体是否达到最小样本量
    const allReady = exp.variants.every(v => {
      const obs = exp.observations.get(v.id) || [];
      return obs.length >= exp.minSampleSize;
    });

    if (!allReady) return;

    // 执行显著性检验
    const analysis = this.analyzeSignificance(experimentId);
    if (analysis.success && analysis.significant && analysis.winner) {
      exp.winner = analysis.winner;
      exp.status = EXPERIMENT_STATUS.COMPLETED;
      exp.completedAt = new Date().toISOString();
      this.stats.experimentsCompleted++;
      this.stats.autoDecisions++;

      this._logEvent('auto_completed', {
        experimentId,
        winner: analysis.winner,
        pValue: analysis.pValue
      });
    }
  }

  _mean(values) {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  _stddev(values) {
    if (values.length < 2) return 0;
    const m = this._mean(values);
    const variance = values.reduce((sum, v) => sum + (v - m) * (v - m), 0) / (values.length - 1);
    return Math.sqrt(variance);
  }

  _median(values) {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  /**
   * 近似双侧 p-value (基于标准正态分布)
   * 使用 Abramowitz & Stegun 近似公式
   */
  _approximatePValue(z) {
    if (z === 0) return 1;
    // 单侧概率
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989422804014327; // 1/sqrt(2*pi)
    const p = d * Math.exp(-z * z / 2) *
      (0.3193815 * t +
        -0.3565638 * t * t +
        1.781478 * t * t * t +
        -1.8212560 * t * t * t * t +
        1.3302744 * t * t * t * t * t);
    // 双侧
    return 2 * p;
  }

  _formatExperiment(exp) {
    const result = {
      id: exp.id,
      name: exp.name,
      description: exp.description,
      status: exp.status,
      variants: exp.variants.map(v => ({
        id: v.id,
        name: v.name,
        type: v.type,
        weight: v.weight
      })),
      primaryMetric: exp.primaryMetric,
      minSampleSize: exp.minSampleSize,
      significanceLevel: exp.significanceLevel,
      winner: exp.winner,
      createdAt: exp.createdAt,
      startedAt: exp.startedAt,
      completedAt: exp.completedAt,
      observationCounts: {}
    };

    for (const v of exp.variants) {
      result.observationCounts[v.id] = (exp.observations.get(v.id) || []).length;
    }

    return result;
  }

  _logEvent(event, data = {}) {
    this.eventLog.push({
      event,
      timestamp: new Date().toISOString(),
      ...data
    });
    if (this.eventLog.length > 500) {
      this.eventLog = this.eventLog.slice(-500);
    }
  }
}

// ============================================================
// 导出
// ============================================================

module.exports = {
  ABTestingFramework,
  EXPERIMENT_STATUS,
  VARIANT_TYPE,
  METRIC_GOAL,
  SIGNIFICANCE_LEVEL
};
