/**
 * review-loop.js - 复盘闭环模块 (6a→6b→6c→6d)
 *
 * 文档要求：完整的复盘闭环
 *   6a 回顾: 收集执行数据、分析成功/失败模式、偏差检测
 *   6b 优化: 生成改进策略、参数调优建议、流程优化方案
 *   6c 验证: 策略可行性评估、A/B对比、风险评估
 *   6d 固化: 持久化到知识库、更新策略配置、生成最佳实践
 *
 * @version 1.0.0
 * @date 2026-04-13
 */

const { createLogger } = require('./logger');

// ============================================================
// ReviewLoop - 复盘闭环引擎
// ============================================================

class ReviewLoop {
  /**
   * @param {Object} options
   * @param {Object} options.knowledgeBase - KnowledgeBase 实例
   * @param {Object} options.memoryStore   - MemoryStore 实例（可选）
   * @param {number} options.scoreThreshold - 评分阈值（>=此分跳过优化，默认7.0）
   * @param {number} options.maxIterations  - 最大优化轮次（默认3）
   */
  constructor(options = {}) {
    this.knowledgeBase = options.knowledgeBase || null;
    this.memoryStore = options.memoryStore || null;
    this.scoreThreshold = options.scoreThreshold || 7.0;
    this.maxIterations = options.maxIterations || 3;
    this.logger = options.logger || createLogger({ name: 'review-loop' });

    // 历史复盘数据（用于跨任务学习）
    this.reviewHistory = [];
    this.strategyRegistry = new Map();  // 已固化的策略
  }

  // ----------------------------------------------------------
  // 主入口: 执行完整的复盘闭环
  // ----------------------------------------------------------

  /**
   * 执行 6a→6b→6c→6d 完整复盘
   * @param {Object} taskData - 任务执行数据
   * @param {Object} taskData.task       - 原始任务对象
   * @param {Object} taskData.analysis   - Step1 分析结果
   * @param {Object} taskData.execution  - Step4 执行结果
   * @param {Object} taskData.inspection - Step5 检查结果
   * @param {Object} taskData.reworkData - 重做数据
   * @returns {Object} 复盘结果
   */
  async runReviewLoop(taskData) {
    const { task, analysis, execution, inspection, reworkData = {} } = taskData;

    this.logger.info({ taskType: analysis?.taskType }, 'Starting review loop (6a→6b→6c→6d)');

    let iteration = 0;
    let review, optimizations, validation, consolidation;
    let currentScore = 0;

    while (iteration <= this.maxIterations) {
      // ──── 6a 回顾 ────
      review = this.step6a_review(task, inspection, execution, reworkData, iteration);
      currentScore = review.score;
      this.logger.info({ score: currentScore, iteration }, '6a Review complete');

      // 评分达标 → 跳过优化
      if (currentScore >= this.scoreThreshold) {
        this.logger.info({ score: currentScore, threshold: this.scoreThreshold }, 'Score above threshold, skipping optimization');
        optimizations = [];
        validation = { feasible: true, expectedBenefit: '当前执行良好', confidence: 1.0 };
        break;
      }

      // ──── 6b 优化 ────
      optimizations = this.step6b_optimize(review, inspection, analysis, reworkData);
      this.logger.info({ count: optimizations.length }, '6b Optimization proposals generated');

      if (optimizations.length === 0) {
        validation = { feasible: true, expectedBenefit: '无可行优化', confidence: 1.0 };
        break;
      }

      // ──── 6c 验证 ────
      validation = this.step6c_validate(optimizations, review, reworkData);
      this.logger.info({ feasible: validation.feasible, confidence: validation.confidence }, '6c Validation complete');

      if (validation.feasible && validation.confidence >= 0.6) {
        this.logger.info('Optimization validated, proceeding to consolidation');
        break;
      }

      iteration++;
      if (iteration > this.maxIterations) {
        this.logger.warn({ maxIterations: this.maxIterations }, 'Max optimization iterations reached');
      }
    }

    // ──── 6d 固化 ────
    consolidation = this.step6d_consolidate({
      task, analysis, review, optimizations, validation, reworkData, iteration
    });
    this.logger.info('6d Consolidation complete');

    const result = {
      review,
      optimizations,
      validation,
      consolidation,
      score: currentScore,
      optimizeIterations: iteration,
      reworkData
    };

    // 记录到复盘历史
    this.reviewHistory.push({
      taskType: analysis?.taskType,
      score: currentScore,
      timestamp: new Date().toISOString(),
      optimizationCount: optimizations.length,
      result
    });

    // 保留最近 50 条
    if (this.reviewHistory.length > 50) {
      this.reviewHistory = this.reviewHistory.slice(-50);
    }

    return result;
  }

  // ----------------------------------------------------------
  // 6a 回顾: 收集、分析、评分
  // ----------------------------------------------------------

  step6a_review(task, inspection, execution, reworkData, iteration) {
    const totalSteps = task.steps ? task.steps.length : 0;
    const successfulSteps = task.steps
      ? task.steps.filter(s => {
          if (s.name === 'inspect' || (s.name && s.name.startsWith('reinspect'))) {
            return s.result && s.result.passed;
          }
          return s.result && s.result.success !== false;
        }).length
      : 0;

    const completionRate = totalSteps > 0
      ? parseFloat((successfulSteps / totalSteps * 100).toFixed(1))
      : 0;
    const totalTime = task.startTime ? Date.now() - task.startTime : 0;

    // ── 问题收集 ──
    const issues = [];
    const patterns = { success: [], failure: [] };

    if (inspection.failedTasks && inspection.failedTasks.length > 0) {
      issues.push(`${inspection.failedTasks.length} 个子任务执行失败`);
      patterns.failure.push({ type: 'task_failure', count: inspection.failedTasks.length });
    }

    if (inspection.criticalFailures > 0) {
      issues.push(`${inspection.criticalFailures} 个关键任务失败`);
      patterns.failure.push({ type: 'critical_failure', count: inspection.criticalFailures });
    }

    if (!inspection.passed) {
      const failedChecks = Object.entries(inspection.checks || {})
        .filter(([_, check]) => !check.passed)
        .map(([name]) => name);
      if (failedChecks.length > 0) {
        issues.push(`检查未通过: ${failedChecks.join(', ')}`);
        patterns.failure.push({ type: 'check_failure', checks: failedChecks });
      }
    }

    // ── 重做分析 ──
    if (reworkData.reworkCount > 0) {
      issues.push(`经历 ${reworkData.reworkCount} 次重做`);
      patterns.failure.push({ type: 'rework', count: reworkData.reworkCount });
    }

    // ── 偏差分析 ──
    const deviations = this._analyzeDeviations(task, execution);
    if (deviations.length > 0) {
      issues.push(`检测到 ${deviations.length} 项偏差`);
    }

    // ── 成功模式 ──
    if (completionRate > 80) {
      patterns.success.push({ type: 'high_completion', rate: completionRate });
    }
    if (inspection.passed) {
      patterns.success.push({ type: 'inspection_passed' });
    }

    // ── 历史对比 ──
    const historicalComparison = this._compareWithHistory(task, inspection);

    // ── 评分 ──
    const score = this._calculateScore({
      completionRate,
      inspection,
      reworkData,
      issues,
      deviations,
      totalTime
    });

    return {
      completionRate,
      totalTime,
      estimatedTime: this._estimateExpectedTime(task),
      score,
      issues,
      patterns,
      deviations,
      historicalComparison,
      iteration,
      timestamp: new Date().toISOString()
    };
  }

  // ----------------------------------------------------------
  // 6b 优化: 生成改进建议
  // ----------------------------------------------------------

  step6b_optimize(review, inspection, analysis, reworkData) {
    const optimizations = [];

    // ── 基于问题的优化 ──
    for (const issue of review.issues) {
      if (issue.includes('子任务执行失败')) {
        optimizations.push({
          type: 'task_reliability',
          category: 'execution',
          suggestion: '增加子任务的错误处理和重试机制',
          expectedImprovement: '减少任务失败率 20-30%',
          priority: 'high',
          effort: 'medium'
        });
      }

      if (issue.includes('关键任务失败')) {
        optimizations.push({
          type: 'critical_path',
          category: 'execution',
          suggestion: '关键任务增加前置验证和降级方案',
          expectedImprovement: '关键路径可靠性提升至 99%',
          priority: 'critical',
          effort: 'high'
        });
      }

      if (issue.includes('检查未通过')) {
        optimizations.push({
          type: 'quality_improvement',
          category: 'quality',
          suggestion: '在执行阶段增加中间检查点，提前发现问题',
          expectedImprovement: '一次通过率提升 15-25%',
          priority: 'high',
          effort: 'medium'
        });
      }

      if (issue.includes('重做')) {
        optimizations.push({
          type: 'first_pass_quality',
          category: 'process',
          suggestion: '改进任务拆解精度，减少因理解偏差导致的重做',
          expectedImprovement: '首次通过率提升至 85%+',
          priority: 'medium',
          effort: 'medium'
        });
      }
    }

    // ── 基于偏差的优化 ──
    for (const deviation of review.deviations) {
      if (deviation.type === 'time_overrun') {
        optimizations.push({
          type: 'time_estimation',
          category: 'planning',
          suggestion: `调整时间估算系数，当前偏差: ${deviation.detail}`,
          expectedImprovement: '时间估算准确率提升 20%',
          priority: 'low',
          effort: 'low'
        });
      }

      if (deviation.type === 'scope_drift') {
        optimizations.push({
          type: 'scope_control',
          category: 'planning',
          suggestion: '加强任务边界定义，执行前确认验收标准',
          expectedImprovement: '减少范围蔓延导致的延期',
          priority: 'medium',
          effort: 'low'
        });
      }
    }

    // ── 基于历史模式的优化 ──
    if (review.historicalComparison) {
      const comp = review.historicalComparison;
      if (comp.trend === 'declining') {
        optimizations.push({
          type: 'trend_reversal',
          category: 'systemic',
          suggestion: `此类任务表现持续下降（最近${comp.sampleSize}次），建议审查整体流程`,
          expectedImprovement: '恢复到历史最佳水平',
          priority: 'high',
          effort: 'high'
        });
      }
    }

    // ── 基于已固化策略的推荐 ──
    const existingStrategies = this._findApplicableStrategies(analysis?.taskType);
    for (const strategy of existingStrategies) {
      if (!this._isAlreadyApplied(strategy, review)) {
        optimizations.push({
          type: 'strategy_reuse',
          category: 'knowledge',
          suggestion: `复用已验证策略: ${strategy.description}`,
          expectedImprovement: `历史验证效果: ${strategy.verifiedBenefit}`,
          priority: 'medium',
          effort: 'low',
          strategyRef: strategy.id
        });
      }
    }

    // 按优先级排序
    const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
    optimizations.sort((a, b) =>
      (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0)
    );

    return optimizations;
  }

  // ----------------------------------------------------------
  // 6c 验证: 评估优化方案的可行性
  // ----------------------------------------------------------

  step6c_validate(optimizations, review, reworkData) {
    if (optimizations.length === 0) {
      return { feasible: true, expectedBenefit: '无优化项', confidence: 1.0, risks: [] };
    }

    const risks = [];
    let totalConfidence = 0;
    let totalBenefit = 0;

    for (const opt of optimizations) {
      // 可行性评分
      const feasibilityScore = this._assessFeasibility(opt);
      totalConfidence += feasibilityScore;

      // 风险评估
      if (opt.effort === 'high') {
        risks.push({
          optimization: opt.type,
          risk: '实施成本高，可能影响其他模块',
          severity: 'medium'
        });
      }

      if (opt.category === 'systemic') {
        risks.push({
          optimization: opt.type,
          risk: '系统性变更，需要充分测试',
          severity: 'high'
        });
      }

      // 预期收益
      totalBenefit += this._estimateBenefit(opt);
    }

    const avgConfidence = totalConfidence / optimizations.length;
    const avgBenefit = totalBenefit / optimizations.length;

    // 与历史验证数据对比
    const historicalValidation = this._validateAgainstHistory(optimizations);

    // 风险调整置信度
    const riskAdjustment = risks.filter(r => r.severity === 'high').length * 0.1;
    const adjustedConfidence = Math.max(0.1, avgConfidence - riskAdjustment);

    // A/B 对比建议
    const abTestSuggestion = adjustedConfidence < 0.7
      ? '建议先在小范围试行，对比效果后再全面推广'
      : null;

    return {
      feasible: adjustedConfidence >= 0.5,
      expectedBenefit: this._describeBenefit(avgBenefit),
      confidence: parseFloat(adjustedConfidence.toFixed(2)),
      risks,
      historicalValidation,
      abTestSuggestion,
      details: optimizations.map(opt => ({
        type: opt.type,
        feasibility: this._assessFeasibility(opt),
        estimatedBenefit: this._estimateBenefit(opt)
      }))
    };
  }

  // ----------------------------------------------------------
  // 6d 固化: 持久化学习成果
  // ----------------------------------------------------------

  step6d_consolidate({ task, analysis, review, optimizations, validation, reworkData, iteration }) {
    const consolidation = {
      timestamp: new Date().toISOString(),
      taskType: analysis?.taskType,
      score: review.score,
      savedToKnowledgeBase: false,
      savedToMemory: false,
      newStrategies: [],
      updatedStrategies: [],
      bestPractices: []
    };

    // ── 固化到知识库 ──
    if (this.knowledgeBase) {
      try {
        this.knowledgeBase.load();

        // 记录执行结果
        this.knowledgeBase.recordExecution(
          analysis?.taskType || 'unknown',
          'full_workflow',
          {
            success: review.score >= this.scoreThreshold,
            execution_time: review.totalTime,
            error: review.score < this.scoreThreshold ? '评分未达标' : null,
            learnings: { review, optimizations, validation }
          }
        );

        // 记录重做模式
        if (reworkData.reworkCount > 0) {
          this.knowledgeBase.recordExecution(
            analysis?.taskType || 'unknown',
            'rework_pattern',
            {
              success: review.score >= 5,
              reworkCount: reworkData.reworkCount,
              diagnoses: reworkData.diagnoses,
              finalScore: review.score
            }
          );
        }

        consolidation.savedToKnowledgeBase = true;
        this.logger.info('Learnings saved to knowledge base');
      } catch (error) {
        this.logger.error({ error: error.message }, 'Failed to save to knowledge base');
      }
    }

    // ── 固化到记忆系统 ──
    if (this.memoryStore) {
      try {
        // 存储到 feedback 记忆
        this.memoryStore.store('feedback', `review_${Date.now()}`, {
          taskType: analysis?.taskType,
          score: review.score,
          issues: review.issues,
          optimizations: optimizations.map(o => ({ type: o.type, suggestion: o.suggestion })),
          timestamp: new Date().toISOString()
        }, {
          tags: ['review', analysis?.taskType, review.score >= this.scoreThreshold ? 'success' : 'needs_improvement'],
          source: 'agent',
          priority: review.score < 5 ? 'high' : 'normal'
        });

        // 如果有有效的优化策略，存储到 project 记忆
        if (validation.feasible && optimizations.length > 0) {
          for (const opt of optimizations) {
            if (opt.priority === 'critical' || opt.priority === 'high') {
              const strategyKey = `strategy_${opt.type}_${analysis?.taskType || 'general'}`;
              this.memoryStore.store('project', strategyKey, {
                type: opt.type,
                category: opt.category,
                suggestion: opt.suggestion,
                expectedImprovement: opt.expectedImprovement,
                verifiedBenefit: validation.expectedBenefit,
                confidence: validation.confidence,
                appliedAt: new Date().toISOString()
              }, {
                tags: ['strategy', opt.category, analysis?.taskType],
                source: 'agent',
                priority: opt.priority === 'critical' ? 'critical' : 'high'
              });

              consolidation.newStrategies.push(strategyKey);

              // 注册到策略表
              this.strategyRegistry.set(strategyKey, {
                id: strategyKey,
                description: opt.suggestion,
                verifiedBenefit: validation.expectedBenefit,
                taskType: analysis?.taskType,
                createdAt: new Date().toISOString()
              });
            }
          }
        }

        consolidation.savedToMemory = true;
        this.logger.info({ strategies: consolidation.newStrategies.length }, 'Learnings saved to memory store');
      } catch (error) {
        this.logger.error({ error: error.message }, 'Failed to save to memory store');
      }
    }

    // ── 生成最佳实践 ──
    if (review.score >= 8.0) {
      consolidation.bestPractices.push({
        taskType: analysis?.taskType,
        practice: `高质量执行模式（评分 ${review.score}/10）`,
        details: {
          completionRate: review.completionRate,
          totalTime: review.totalTime,
          reworkCount: reworkData.reworkCount || 0,
          patterns: review.patterns.success
        }
      });
    }

    return consolidation;
  }

  // ----------------------------------------------------------
  // 统计与分析
  // ----------------------------------------------------------

  /**
   * 获取复盘历史趋势
   */
  getReviewTrend(taskType = null, limit = 10) {
    let history = this.reviewHistory;
    if (taskType) {
      history = history.filter(h => h.taskType === taskType);
    }

    const recent = history.slice(-limit);
    if (recent.length < 2) return { trend: 'insufficient_data', data: recent };

    const scores = recent.map(h => h.score);
    const avgFirst = scores.slice(0, Math.floor(scores.length / 2)).reduce((a, b) => a + b, 0) / Math.floor(scores.length / 2);
    const avgSecond = scores.slice(Math.floor(scores.length / 2)).reduce((a, b) => a + b, 0) / (scores.length - Math.floor(scores.length / 2));

    let trend;
    if (avgSecond > avgFirst + 0.5) trend = 'improving';
    else if (avgSecond < avgFirst - 0.5) trend = 'declining';
    else trend = 'stable';

    return {
      trend,
      avgScore: scores.reduce((a, b) => a + b, 0) / scores.length,
      latestScore: scores[scores.length - 1],
      sampleSize: scores.length,
      data: recent
    };
  }

  /**
   * 获取已固化的策略列表
   */
  getStrategies(taskType = null) {
    const strategies = Array.from(this.strategyRegistry.values());
    if (taskType) {
      return strategies.filter(s => s.taskType === taskType || s.taskType === 'general');
    }
    return strategies;
  }

  // ----------------------------------------------------------
  // 私有方法
  // ----------------------------------------------------------

  _calculateScore({ completionRate, inspection, reworkData, issues, deviations, totalTime }) {
    let score = 10;

    // 完成率扣分
    if (completionRate < 100) score -= (100 - completionRate) / 20;

    // 检查未通过扣分
    if (!inspection.passed) score -= 2;
    if (inspection.criticalFailures > 0) score -= inspection.criticalFailures;

    // 重做扣分
    if (reworkData.reworkCount > 0) score -= reworkData.reworkCount * 0.5;

    // 问题扣分
    score -= issues.length * 0.3;

    // 偏差扣分
    score -= deviations.length * 0.2;

    return Math.max(0, Math.min(10, parseFloat(score.toFixed(1))));
  }

  _analyzeDeviations(task, execution) {
    const deviations = [];

    // 时间偏差
    if (task.startTime) {
      const actualTime = Date.now() - task.startTime;
      const expectedTime = this._estimateExpectedTime(task);
      if (typeof expectedTime === 'number' && actualTime > expectedTime * 1.5) {
        deviations.push({
          type: 'time_overrun',
          detail: `实际 ${actualTime}ms 超过预期 ${expectedTime}ms 的 50%`
        });
      }
    }

    // 范围偏差（步骤数异常）
    if (task.steps && task.steps.length > 10) {
      deviations.push({
        type: 'scope_drift',
        detail: `步骤数 ${task.steps.length} 超过常规范围`
      });
    }

    return deviations;
  }

  _estimateExpectedTime(task) {
    // 根据步骤数估算（每步平均 2 秒）
    const stepCount = task.steps ? task.steps.length : 5;
    return stepCount * 2000;
  }

  _compareWithHistory(task, inspection) {
    if (this.reviewHistory.length < 3) return null;

    const recent = this.reviewHistory.slice(-5);
    const scores = recent.map(h => h.score);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;

    let trend;
    if (scores.length >= 3) {
      const firstHalf = scores.slice(0, Math.ceil(scores.length / 2));
      const secondHalf = scores.slice(Math.ceil(scores.length / 2));
      const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
      trend = avgSecond > avgFirst ? 'improving' : avgSecond < avgFirst ? 'declining' : 'stable';
    } else {
      trend = 'insufficient';
    }

    return { avgScore: avg, trend, sampleSize: recent.length };
  }

  _findApplicableStrategies(taskType) {
    return Array.from(this.strategyRegistry.values())
      .filter(s => s.taskType === taskType || s.taskType === 'general');
  }

  _isAlreadyApplied(strategy, review) {
    // 简单检查：如果评分已经很高，说明策略可能已生效
    return review.score >= 8.5;
  }

  _assessFeasibility(optimization) {
    const effortScore = { low: 0.9, medium: 0.7, high: 0.5 };
    const base = effortScore[optimization.effort] || 0.6;

    // 已有策略复用的可行性更高
    if (optimization.type === 'strategy_reuse') return Math.min(1.0, base + 0.2);

    return base;
  }

  _estimateBenefit(optimization) {
    const priorityBenefit = { critical: 0.9, high: 0.7, medium: 0.5, low: 0.3 };
    return priorityBenefit[optimization.priority] || 0.5;
  }

  _describeBenefit(avgBenefit) {
    if (avgBenefit >= 0.8) return '显著改进，预计提升 30%+ 效率';
    if (avgBenefit >= 0.6) return '较大改进，预计提升 15-30% 效率';
    if (avgBenefit >= 0.4) return '适度改进，预计提升 5-15% 效率';
    return '微小改进，预计提升 <5% 效率';
  }

  _validateAgainstHistory(optimizations) {
    const validated = [];
    for (const opt of optimizations) {
      // 检查策略注册表中是否有类似策略的历史数据
      const similar = Array.from(this.strategyRegistry.values())
        .filter(s => s.description && s.description.includes(opt.type));

      if (similar.length > 0) {
        validated.push({
          type: opt.type,
          historicallyValidated: true,
          priorResult: similar[0].verifiedBenefit
        });
      }
    }
    return validated;
  }
}

// ============================================================
// 导出
// ============================================================

module.exports = { ReviewLoop };
