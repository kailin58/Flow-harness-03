'use strict';
/**
 * DeliberationEngine — 多 Agent 商议引擎
 *
 * 职责：
 *  1. 每次任务执行前，召集各总监对"方案分配"进行商议 → 产出执行前共识
 *  2. 执行中遇到问题时，召集相关总监商议"问题解法" → 产出恢复方案
 *  3. 商议必有结果：遵循 OpinionScore 公式得出最优解，并输出 decision
 *
 * 商议公式（OptimalSolution）：
 *
 *   OptionScore(opt) = Σᵢ [ domainWeight(agentᵢ, dim) × agentScore(agentᵢ, opt, dim) ]
 *                      / Σᵢ domainWeight(agentᵢ, dim)
 *
 *   - dim       : 方案的评估维度（可行性/风险/质量/架构/知识）
 *   - agentScore: 该 Agent 对该方案在该维度的评分 [0,1]
 *   - domainWeight: 该 Agent 在该维度上的权威权重 [0,1]
 *
 *   OptimalSolution = argmax_opt Σ_dim OptionScore_dim(opt)
 */

const { createLogger } = require('./logger');

// ── Agent 领域权重矩阵 ────────────────────────────────────────────
//   每个 Agent 在 5 个评估维度上的权重（代表其领域专业度）
const DOMAIN_WEIGHTS = {
  explore:   { feasibility: 0.90, risk: 0.75, architecture: 0.50, quality: 0.60, knowledge: 0.70 },
  plan:      { feasibility: 0.70, risk: 0.85, architecture: 0.95, quality: 0.70, knowledge: 0.65 },
  general:   { feasibility: 0.95, risk: 0.50, architecture: 0.60, quality: 0.70, knowledge: 0.55 },
  inspector: { feasibility: 0.60, risk: 0.95, architecture: 0.70, quality: 0.95, knowledge: 0.75 },
  research:  { feasibility: 0.55, risk: 0.60, architecture: 0.55, quality: 0.60, knowledge: 0.95 }
};

// 评估维度列表
const DIMENSIONS = Object.keys(DOMAIN_WEIGHTS.explore);

// 商议触发阈值
const TRIGGER_THRESHOLDS = {
  complexity:   3,    // 复杂度 >= 3 触发任务前商议
  riskCount:    1,    // 风险数 >= 1 触发任务前商议
  failureScore: 0.4   // 成功率 < 0.4 触发问题商议
};

// 决策枚举
const DECISION = {
  PROCEED:        'proceed',         // 通过，按原方案执行
  PROCEED_MODIFIED: 'proceed_modified', // 通过，但方案有修改
  ESCALATE:       'escalate',        // 升级人工处理
  ABORT:          'abort'            // 放弃本轮，等待人工
};


class DeliberationEngine {
  /**
   * @param {Object} agentRegistry  - AgentRegistry 实例（查找 Agent 定义）
   * @param {Object} knowledgeBase  - KnowledgeBase 实例（读取历史经验）
   */
  constructor(agentRegistry, knowledgeBase) {
    this.agentRegistry  = agentRegistry;
    this.knowledgeBase  = knowledgeBase;
    this.logger         = createLogger({ name: 'deliberation' });
    this.history        = [];   // 商议历史记录
  }

  // ══════════════════════════════════════════════════════════════
  //  公共 API
  // ══════════════════════════════════════════════════════════════

  /**
   * 任务前商议（Step 3 → Step 4 之间触发）
   *
   * @param {Object} assignment  - TaskDispatcher.assign() 的输出
   * @param {Object} analysis    - TaskAnalyzer.analyze()  的输出
   * @returns {DeliberationResult}
   */
  async deliberateTask(assignment, analysis) {
    const topic = `任务方案商议: ${analysis.goal?.description || '未知任务'}`;
    this.logger.info(`\n🗣️  [商议] ${topic}`);

    const participants = this._selectParticipants(assignment, analysis);
    const options      = this._buildTaskOptions(assignment, analysis);

    return await this._deliberate(topic, options, participants, {
      type: 'task',
      analysis,
      assignment
    });
  }

  /**
   * 问题商议（_executeItem 失败后触发）
   *
   * @param {Object} item     - 失败的执行项 { subtask, executor }
   * @param {Object} result   - 失败结果 { error, retryCount, ... }
   * @param {Object} taskCtx  - 当前任务上下文（currentTask）
   * @returns {DeliberationResult}
   */
  async deliberateProblem(item, result, taskCtx) {
    const topic = `问题商议: "${item.subtask.name}" 失败 — ${result.error || '未知错误'}`;
    this.logger.info(`\n🚨  [问题商议] ${topic}`);

    const participants = ['explore', 'plan', 'inspector'];
    const options      = this._buildProblemOptions(item, result, taskCtx);

    return await this._deliberate(topic, options, participants, {
      type: 'problem',
      item,
      result,
      taskCtx
    });
  }

  /**
   * 判断是否应该触发任务前商议
   */
  shouldDeliberateTask(analysis, assignment) {
    const complexity = analysis.complexity || 0;
    const riskCount  = (analysis.risks || []).length;
    const subtaskCnt = assignment.assignments?.length || 0;

    return (
      complexity  >= TRIGGER_THRESHOLDS.complexity ||
      riskCount   >= TRIGGER_THRESHOLDS.riskCount  ||
      subtaskCnt  >= 3
    );
  }

  /**
   * 判断是否应该触发问题商议
   */
  shouldDeliberateProblem(result, retryCount) {
    // 已重试过 || 是核心任务失败 || 错误看起来需要策略调整
    return (
      retryCount  >= 1 ||
      result.retryable === false ||
      (result.error || '').includes('不支持') ||
      (result.error || '').includes('需要')
    );
  }

  // ══════════════════════════════════════════════════════════════
  //  核心商议流程（私有）
  // ══════════════════════════════════════════════════════════════

  /**
   * 商议主流程：收集意见 → 评分 → 最优解 → 决策
   */
  async _deliberate(topic, options, participants, context) {
    const startTime = Date.now();

    // Phase 1: 收集各 Agent 意见
    const opinions = this._collectOpinions(topic, options, participants, context);
    this.logger.info(`   └─ 参与者: ${participants.join(', ')}`);
    this.logger.info(`   └─ 方案数: ${options.length}`);

    // Phase 2: 方案评分（OptimalSolution 公式）
    const scoredOptions = this._scoreOptions(options, opinions, participants);

    // Phase 3: 找最优解
    const optimal = this._findOptimal(scoredOptions);
    this.logger.info(`   └─ 最优方案: [${optimal.id}] ${optimal.label} (得分 ${optimal.totalScore.toFixed(3)})`);

    // Phase 4: 达成共识决策
    const decision = this._makeDecision(optimal, scoredOptions, context);
    this.logger.info(`   └─ 决策: ${decision}`);

    const result = {
      id:           `deliberation_${Date.now()}`,
      topic,
      participants,
      options:      scoredOptions,
      opinions,
      optimal,
      decision,
      context:      context.type,
      duration:     Date.now() - startTime,
      timestamp:    new Date().toISOString()
    };

    this.history.push(result);
    return result;
  }

  /**
   * Phase 1 — 收集各 Agent 的意见
   *
   * 每个 Agent 基于其领域能力，对每个方案的各维度给出 [0,1] 评分
   */
  _collectOpinions(topic, options, participants, context) {
    return participants.map(agentId => {
      const agent  = this.agentRegistry?.get(agentId) || { name: agentId };
      const scores = {};

      for (const opt of options) {
        scores[opt.id] = this._agentEvaluate(agentId, opt, context);
      }

      const summary = this._agentSummarize(agentId, options, context);

      return {
        agentId,
        agentName: agent.name || agentId,
        scores,
        summary,
        timestamp: Date.now()
      };
    });
  }

  /**
   * Phase 2 — OptimalSolution 公式评分
   *
   * OptionScore(opt, dim) = Σᵢ [W(agentᵢ, dim) × S(agentᵢ, opt, dim)]
   *                         / Σᵢ W(agentᵢ, dim)
   *
   * totalScore(opt) = Σ_dim OptionScore(opt, dim)
   */
  _scoreOptions(options, opinions, participants) {
    return options.map(opt => {
      const dimScores = {};

      for (const dim of DIMENSIONS) {
        const weightSum = participants.reduce((s, id) => s + (DOMAIN_WEIGHTS[id]?.[dim] || 0.5), 0);
        const weighted  = opinions.reduce((s, op) => {
          const w = DOMAIN_WEIGHTS[op.agentId]?.[dim] || 0.5;
          const v = op.scores[opt.id]?.[dim] || 0;
          return s + w * v;
        }, 0);
        dimScores[dim] = weightSum > 0 ? weighted / weightSum : 0;
      }

      const totalScore = DIMENSIONS.reduce((s, dim) => s + dimScores[dim], 0);

      return { ...opt, dimScores, totalScore };
    });
  }

  /**
   * Phase 3 — 找最优解（argmax totalScore）
   */
  _findOptimal(scoredOptions) {
    return scoredOptions.reduce((best, cur) =>
      cur.totalScore > best.totalScore ? cur : best
    );
  }

  /**
   * Phase 4 — 共识决策
   *
   * 决策规则：
   * - totalScore >= 3.5  → PROCEED
   * - totalScore >= 2.0  → PROCEED_MODIFIED（最优解得分低，附带修改建议）
   * - totalScore >= 1.0  → ESCALATE
   * - totalScore <  1.0  → ABORT
   */
  _makeDecision(optimal, scoredOptions, context) {
    const score = optimal.totalScore;
    const gap   = scoredOptions.length > 1
      ? score - scoredOptions.filter(o => o.id !== optimal.id)
          .reduce((m, o) => Math.max(m, o.totalScore), 0)
      : 1;

    // 高分且领先明显 → 直接通过
    if (score >= 3.5 && gap >= 0.3) return DECISION.PROCEED;
    // 有可行方案但有保留 → 修改后通过
    if (score >= 2.0) return DECISION.PROCEED_MODIFIED;
    // 得分极低 → 问题商议中建议人工介入
    if (score >= 1.0) return DECISION.ESCALATE;
    return DECISION.ABORT;
  }

  // ══════════════════════════════════════════════════════════════
  //  方案构建（私有）
  // ══════════════════════════════════════════════════════════════

  /**
   * 构建任务前商议的候选方案
   *   - 方案0: 按当前 assignment 原样执行
   *   - 方案1: 串行保守方案（全部串行，最大安全）
   *   - 方案2: 精简方案（仅执行高优先级子任务）
   */
  _buildTaskOptions(assignment, analysis) {
    const hasParallel = (assignment.executionPlan?.parallel?.length || 0) > 0;
    const subtasks    = assignment.assignments || [];

    const options = [
      {
        id:      'opt_original',
        label:   '原方案（按分配执行）',
        details: `${subtasks.length} 个子任务，含并行: ${hasParallel}`,
        modifies: false
      },
      {
        id:      'opt_serial',
        label:   '保守串行方案',
        details: '全部子任务串行，降低并发风险',
        modifies: true,
        patch:   { forceSerial: true }
      }
    ];

    // 如有高优先级任务可裁剪，添加精简方案
    const highPri = subtasks.filter(a => (a.subtask?.priority || '') === 'high');
    if (highPri.length > 0 && highPri.length < subtasks.length) {
      options.push({
        id:      'opt_slim',
        label:   '精简方案（仅高优先级）',
        details: `仅执行 ${highPri.length}/${subtasks.length} 个高优先级子任务`,
        modifies: true,
        patch:   { slimAssignments: highPri }
      });
    }

    return options;
  }

  /**
   * 构建问题商议的候选方案
   *   - 方案0: 跳过失败任务，继续执行其余
   *   - 方案1: 降级执行（换用更简单的 action）
   *   - 方案2: 人工介入
   */
  _buildProblemOptions(item, result, taskCtx) {
    return [
      {
        id:      'prob_skip',
        label:   '跳过此子任务，继续流程',
        details: `跳过 "${item.subtask.name}"，标记为 warning`,
        modifies: true,
        patch:   { action: 'skip' }
      },
      {
        id:      'prob_fallback',
        label:   '降级执行（简化任务）',
        details: `将 "${item.subtask.name}" 改为简化版本执行`,
        modifies: true,
        patch:   { action: 'fallback', simplify: true }
      },
      {
        id:      'prob_human',
        label:   '请求人工介入',
        details: `暂停并等待人工处理: ${result.error}`,
        modifies: false,
        patch:   { action: 'human' }
      }
    ];
  }

  // ══════════════════════════════════════════════════════════════
  //  Agent 评分逻辑（基于规则，不调 LLM）
  // ══════════════════════════════════════════════════════════════

  /**
   * 某个 Agent 对一个方案的各维度评分
   */
  _agentEvaluate(agentId, option, context) {
    const scores = {};
    const isTask = context.type === 'task';
    const risks  = (context.analysis?.risks || []).length;
    const complex = context.analysis?.complexity || 1;

    for (const dim of DIMENSIONS) {
      let score = 0.5; // 默认中性

      if (isTask) {
        score = this._taskDimScore(agentId, dim, option, risks, complex);
      } else {
        score = this._problemDimScore(agentId, dim, option, context.result);
      }

      scores[dim] = Math.max(0, Math.min(1, score));
    }

    return scores;
  }

  /** 任务方案的维度评分（规则表） */
  _taskDimScore(agentId, dim, option, risks, complexity) {
    const isOriginal = option.id === 'opt_original';
    const isSerial   = option.id === 'opt_serial';
    const isSlim     = option.id === 'opt_slim';

    const table = {
      explore: {
        feasibility:  isOriginal ? 0.7 : isSerial ? 0.8 : 0.6,
        risk:         isOriginal ? (risks > 2 ? 0.4 : 0.7) : isSerial ? 0.9 : 0.5,
        architecture: 0.5,
        quality:      isOriginal ? 0.6 : 0.5,
        knowledge:    0.6
      },
      plan: {
        feasibility:  isSlim ? 0.5 : isSerial ? 0.7 : 0.8,
        risk:         isSerial ? 0.9 : isOriginal ? (risks > 1 ? 0.5 : 0.75) : 0.4,
        architecture: isOriginal ? (complexity >= 4 ? 0.5 : 0.85) : 0.6,
        quality:      isOriginal ? 0.75 : 0.55,
        knowledge:    0.65
      },
      general: {
        feasibility:  isOriginal ? 0.9 : isSerial ? 0.8 : isSlim ? 0.7 : 0.75,
        risk:         0.5,
        architecture: 0.55,
        quality:      isOriginal ? 0.7 : 0.6,
        knowledge:    0.5
      },
      inspector: {
        feasibility:  isSerial ? 0.8 : isOriginal ? 0.7 : 0.55,
        risk:         isSerial ? 0.95 : isOriginal ? (risks > 0 ? 0.45 : 0.8) : 0.35,
        architecture: 0.65,
        quality:      isSerial ? 0.9 : isOriginal ? 0.7 : 0.55,
        knowledge:    0.7
      },
      research: {
        feasibility:  0.6,
        risk:         isSerial ? 0.7 : 0.55,
        architecture: 0.5,
        quality:      0.6,
        knowledge:    isOriginal ? 0.8 : 0.65
      }
    };

    return table[agentId]?.[dim] ?? 0.5;
  }

  /** 问题方案的维度评分（规则表） */
  _problemDimScore(agentId, dim, option, result) {
    const isSkip     = option.id === 'prob_skip';
    const isFallback = option.id === 'prob_fallback';
    const isHuman    = option.id === 'prob_human';
    const isCritical = (result?.error || '').includes('Layer2') ||
                       (result?.error || '').includes('安全');

    const base = {
      explore:   { feasibility: isSkip ? 0.8 : 0.6, risk: isSkip ? 0.5 : 0.7, architecture: 0.5, quality: isSkip ? 0.4 : 0.7, knowledge: 0.6 },
      plan:      { feasibility: isFallback ? 0.8 : 0.6, risk: isFallback ? 0.7 : 0.6, architecture: isFallback ? 0.75 : 0.5, quality: 0.7, knowledge: 0.6 },
      general:   { feasibility: isSkip ? 0.9 : isFallback ? 0.8 : 0.3, risk: 0.5, architecture: 0.5, quality: isSkip ? 0.5 : 0.7, knowledge: 0.5 },
      inspector: { feasibility: isCritical ? 0.3 : isSkip ? 0.6 : 0.7, risk: isCritical && isSkip ? 0.2 : isHuman ? 0.9 : 0.6, architecture: 0.6, quality: isSkip ? 0.4 : 0.8, knowledge: 0.7 },
      research:  { feasibility: 0.5, risk: 0.6, architecture: 0.5, quality: 0.6, knowledge: isHuman ? 0.7 : 0.55 }
    };

    return base[agentId]?.[dim] ?? 0.5;
  }

  /**
   * Agent 的文字总结意见（记录在商议结果里，便于审计）
   */
  _agentSummarize(agentId, options, context) {
    const summaries = {
      explore:   '已分析代码库结构，关注可行性与文件访问风险。',
      plan:      '从架构角度评估方案，重点考量风险与长期一致性。',
      general:   '从执行角度评估，优先选择可操作性强的方案。',
      inspector: '从质量与安全角度评估，倾向低风险、可验证的方案。',
      research:  '参考外部知识与文档，评估方案的知识覆盖度。'
    };
    return summaries[agentId] || '已完成评估。';
  }

  // ══════════════════════════════════════════════════════════════
  //  参与者选择（私有）
  // ══════════════════════════════════════════════════════════════

  /**
   * 根据任务类型选择参与商议的 Agent
   * - 全量商议：复杂度高 / 涉及安全 / 多 Agent 协作
   * - 轻量商议：简单任务只召集 2~3 个最相关 Agent
   */
  _selectParticipants(assignment, analysis) {
    const complexity = analysis.complexity || 1;
    const taskType   = analysis.taskType   || 'general';
    const risks      = (analysis.risks || []).length;

    // 高复杂度或有风险 → 全员
    if (complexity >= 4 || risks >= 2) {
      return ['explore', 'plan', 'general', 'inspector', 'research'];
    }

    // 按任务类型选核心参与者
    const coreMap = {
      bug_fix:       ['explore', 'general', 'inspector'],
      feature:       ['plan', 'general', 'inspector'],
      research:      ['research', 'plan', 'explore'],
      security:      ['inspector', 'plan', 'general'],
      documentation: ['research', 'general'],
      testing:       ['inspector', 'general'],
      refactor:      ['plan', 'general', 'inspector'],
      performance:   ['explore', 'general', 'inspector'],
      deployment:    ['plan', 'inspector', 'general']
    };

    return coreMap[taskType] || ['plan', 'general', 'inspector'];
  }

  // ══════════════════════════════════════════════════════════════
  //  工具方法
  // ══════════════════════════════════════════════════════════════

  /** 获取商议历史 */
  getHistory(limit = 10) {
    return this.history.slice(-limit);
  }

  /** 获取决策枚举 */
  static get DECISION() { return DECISION; }

  /** 获取触发阈值（可被外部配置覆盖） */
  static get THRESHOLDS() { return TRIGGER_THRESHOLDS; }

  /** 格式化商议结果摘要（用于日志输出）*/
  static formatSummary(result) {
    const top2 = [...result.options]
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, 2)
      .map(o => `  [${o.id}] ${o.label}: ${o.totalScore.toFixed(3)}`)
      .join('\n');

    return [
      `📋 商议结果: ${result.topic}`,
      `👥 参与者: ${result.participants.join(', ')}`,
      `📊 方案排名（前2）:\n${top2}`,
      `✅ 最优解: ${result.optimal.label}`,
      `🔑 决策: ${result.decision}`,
      `⏱  耗时: ${result.duration}ms`
    ].join('\n');
  }
}

module.exports = DeliberationEngine;
