/**
 * Deviation Detector - 行为偏差检测器
 * 检测 Agent 执行过程中的异常行为和偏差
 *
 * 核心功能：
 * 1. 基线建立：学习正常执行模式
 * 2. 偏差检测：识别异常执行行为
 * 3. 风险评估：评估偏差的严重程度
 * 4. 告警触发：超过阈值时触发告警
 */
class DeviationDetector {
  constructor(config = {}) {
    this.config = {
      enableLearning: config.enableLearning !== false,
      minSamples: config.minSamples || 5, // 最少样本数
      deviationThreshold: config.deviationThreshold || 2.0, // 偏差阈值（标准差倍数）
      maxBaselines: config.maxBaselines || 100, // 最大基线数量
      ...config
    };

    // 基线数据：agentId/action -> 统计信息
    this.baselines = new Map();

    // 检测历史
    this.detectionHistory = [];

    // 告警列表
    this.alerts = [];
  }

  /**
   * 记录执行数据（用于建立基线）
   * @param {Object} execution - 执行信息
   */
  recordExecution(execution) {
    if (!this.config.enableLearning) {
      return;
    }

    const key = this.getBaselineKey(execution.agentId, execution.taskAction);

    if (!this.baselines.has(key)) {
      this.baselines.set(key, {
        agentId: execution.agentId,
        taskAction: execution.taskAction,
        samples: [],
        stats: null
      });
    }

    const baseline = this.baselines.get(key);

    // 添加样本
    baseline.samples.push({
      duration: execution.duration,
      success: execution.status === 'completed',
      timestamp: execution.endTime || Date.now()
    });

    // 限制样本数量
    if (baseline.samples.length > this.config.maxBaselines) {
      baseline.samples.shift();
    }

    // 更新统计信息
    this.updateBaseline(baseline);
  }

  /**
   * 检测执行偏差
   * @param {Object} execution - 执行信息
   * @returns {Object} 检测结果
   */
  detectDeviation(execution) {
    const key = this.getBaselineKey(execution.agentId, execution.taskAction);
    const baseline = this.baselines.get(key);

    // 如果没有基线或样本不足，无法检测
    if (!baseline || baseline.samples.length < this.config.minSamples) {
      return {
        hasDeviation: false,
        reason: 'insufficient_baseline',
        baseline: null,
        deviations: []
      };
    }

    const deviations = [];

    // 1. 检测执行时间偏差
    const durationDeviation = this.checkDurationDeviation(
      execution.duration,
      baseline.stats
    );

    if (durationDeviation.isDeviation) {
      deviations.push({
        type: 'duration',
        severity: durationDeviation.severity,
        message: durationDeviation.message,
        actual: execution.duration,
        expected: baseline.stats.avgDuration,
        deviation: durationDeviation.deviation
      });
    }

    // 2. 检测成功率偏差
    const successDeviation = this.checkSuccessDeviation(
      execution.status === 'completed',
      baseline.stats
    );

    if (successDeviation.isDeviation) {
      deviations.push({
        type: 'success_rate',
        severity: successDeviation.severity,
        message: successDeviation.message,
        actual: execution.status,
        expected: `${(baseline.stats.successRate * 100).toFixed(1)}%`
      });
    }

    // 3. 检测超时偏差
    if (execution.timedOut) {
      deviations.push({
        type: 'timeout',
        severity: 'high',
        message: '执行超时',
        actual: 'timeout',
        expected: 'completed'
      });
    }

    // 记录检测结果
    const detection = {
      executionId: execution.id,
      agentId: execution.agentId,
      taskAction: execution.taskAction,
      hasDeviation: deviations.length > 0,
      deviations: deviations,
      baseline: baseline.stats,
      timestamp: new Date().toISOString()
    };

    this.detectionHistory.push(detection);

    // 如果有高严重度偏差，触发告警
    const highSeverityDeviations = deviations.filter(d => d.severity === 'high');
    if (highSeverityDeviations.length > 0) {
      this.triggerAlert(execution, highSeverityDeviations);
    }

    return detection;
  }

  /**
   * 检测执行时间偏差
   * @param {number} duration - 实际执行时间
   * @param {Object} stats - 基线统计
   * @returns {Object} 检测结果
   */
  checkDurationDeviation(duration, stats) {
    const avg = stats.avgDuration;
    const stdDev = stats.stdDevDuration;

    // 计算偏差（标准差倍数）
    // 当标准差为0时：如果duration等于avg则偏差为0，否则为无穷大
    let deviation;
    if (stdDev > 0) {
      deviation = Math.abs(duration - avg) / stdDev;
    } else {
      deviation = duration === avg ? 0 : Infinity;
    }

    if (deviation > this.config.deviationThreshold) {
      const severity = deviation > this.config.deviationThreshold * 2 ? 'high' : 'medium';
      const direction = duration > avg ? '过长' : '过短';

      return {
        isDeviation: true,
        severity: severity,
        deviation: deviation,
        message: `执行时间${direction}，偏差 ${deviation.toFixed(2)} 个标准差`
      };
    }

    return { isDeviation: false };
  }

  /**
   * 检测成功率偏差
   * @param {boolean} success - 是否成功
   * @param {Object} stats - 基线统计
   * @returns {Object} 检测结果
   */
  checkSuccessDeviation(success, stats) {
    // 如果历史成功率很高（>90%），但本次失败，则认为是偏差
    if (!success && stats.successRate > 0.9) {
      return {
        isDeviation: true,
        severity: 'medium',
        message: `执行失败，但历史成功率为 ${(stats.successRate * 100).toFixed(1)}%`
      };
    }

    // 如果历史成功率很低（<50%），但本次成功，也记录（低严重度）
    if (success && stats.successRate < 0.5) {
      return {
        isDeviation: true,
        severity: 'low',
        message: `执行成功，但历史成功率仅为 ${(stats.successRate * 100).toFixed(1)}%`
      };
    }

    return { isDeviation: false };
  }

  /**
   * 触发告警
   * @param {Object} execution - 执行信息
   * @param {Array} deviations - 偏差列表
   */
  triggerAlert(execution, deviations) {
    const alert = {
      id: `alert_${Date.now()}`,
      executionId: execution.id,
      agentId: execution.agentId,
      taskAction: execution.taskAction,
      deviations: deviations,
      timestamp: new Date().toISOString(),
      acknowledged: false
    };

    this.alerts.push(alert);

    // 限制告警数量
    if (this.alerts.length > 100) {
      this.alerts.shift();
    }
  }

  /**
   * 获取告警列表
   * @param {Object} filter - 过滤条件
   * @returns {Array} 告警列表
   */
  getAlerts(filter = {}) {
    let alerts = [...this.alerts];

    // 只返回未确认的告警
    if (filter.unacknowledged) {
      alerts = alerts.filter(a => !a.acknowledged);
    }

    // 按 agentId 过滤
    if (filter.agentId) {
      alerts = alerts.filter(a => a.agentId === filter.agentId);
    }

    return alerts;
  }

  /**
   * 确认告警
   * @param {string} alertId - 告警ID
   * @returns {boolean} 是否成功
   */
  acknowledgeAlert(alertId) {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      return true;
    }
    return false;
  }

  /**
   * 获取基线信息
   * @param {string} agentId - Agent ID
   * @param {string} taskAction - 任务动作
   * @returns {Object|null} 基线信息
   */
  getBaseline(agentId, taskAction) {
    const key = this.getBaselineKey(agentId, taskAction);
    const baseline = this.baselines.get(key);

    if (!baseline) {
      return null;
    }

    return {
      agentId: baseline.agentId,
      taskAction: baseline.taskAction,
      sampleCount: baseline.samples.length,
      stats: baseline.stats
    };
  }

  /**
   * 列出所有基线
   * @returns {Array} 基线列表
   */
  listBaselines() {
    return Array.from(this.baselines.values()).map(b => ({
      agentId: b.agentId,
      taskAction: b.taskAction,
      sampleCount: b.samples.length,
      stats: b.stats
    }));
  }

  /**
   * 获取检测历史
   * @param {Object} filter - 过滤条件
   * @returns {Array} 检测历史
   */
  getDetectionHistory(filter = {}) {
    let history = [...this.detectionHistory];

    // 只返回有偏差的记录
    if (filter.deviationsOnly) {
      history = history.filter(d => d.hasDeviation);
    }

    // 按 agentId 过滤
    if (filter.agentId) {
      history = history.filter(d => d.agentId === filter.agentId);
    }

    // 限制数量
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
    const totalDetections = this.detectionHistory.length;
    const deviations = this.detectionHistory.filter(d => d.hasDeviation);
    const alerts = this.alerts.filter(a => !a.acknowledged);

    return {
      totalDetections: totalDetections,
      deviationsDetected: deviations.length,
      deviationRate: totalDetections > 0
        ? (deviations.length / totalDetections * 100).toFixed(1)
        : 0,
      activeAlerts: alerts.length,
      totalBaselines: this.baselines.size,
      avgSamplesPerBaseline: this.baselines.size > 0
        ? Math.round(
            Array.from(this.baselines.values())
              .reduce((sum, b) => sum + b.samples.length, 0) / this.baselines.size
          )
        : 0
    };
  }

  /**
   * 更新基线统计
   * @param {Object} baseline - 基线对象
   */
  updateBaseline(baseline) {
    const samples = baseline.samples;

    if (samples.length === 0) {
      baseline.stats = null;
      return;
    }

    // 计算平均执行时间
    const durations = samples.map(s => s.duration);
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;

    // 计算标准差
    const variance = durations
      .map(d => Math.pow(d - avgDuration, 2))
      .reduce((a, b) => a + b, 0) / durations.length;
    const stdDevDuration = Math.sqrt(variance);

    // 计算成功率
    const successCount = samples.filter(s => s.success).length;
    const successRate = successCount / samples.length;

    baseline.stats = {
      sampleCount: samples.length,
      avgDuration: Math.round(avgDuration),
      stdDevDuration: Math.round(stdDevDuration),
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
      successRate: successRate,
      successCount: successCount,
      failureCount: samples.length - successCount
    };
  }

  /**
   * 生成基线键
   * @param {string} agentId - Agent ID
   * @param {string} taskAction - 任务动作
   * @returns {string} 基线键
   */
  getBaselineKey(agentId, taskAction) {
    return `${agentId}:${taskAction}`;
  }

  /**
   * 清理历史数据
   * @param {number} keepLast - 保留最近N条记录
   * @returns {number} 清理的记录数
   */
  clearHistory(keepLast = 100) {
    const before = this.detectionHistory.length;

    if (keepLast > 0 && this.detectionHistory.length > keepLast) {
      this.detectionHistory = this.detectionHistory.slice(-keepLast);
    } else if (keepLast === 0) {
      this.detectionHistory = [];
    }

    return before - this.detectionHistory.length;
  }
}

module.exports = DeviationDetector;
