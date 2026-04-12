/**
 * multi-model-router.js - 多模型路由与负载均衡
 *
 * 文档要求(P2): 多模型支持
 *   - 多模型注册与配置
 *   - 基于任务类型的智能路由
 *   - 负载均衡策略 (round-robin / least-load / cost-optimized)
 *   - 模型性能跟踪与自动降级
 *   - 重试与 fallback 机制
 *   - 成本控制
 *
 * @version 1.0.0
 * @date 2026-04-13
 */

const { createLogger } = require('./logger');

// ============================================================
// 常量
// ============================================================

const MODEL_STATUS = {
  AVAILABLE: 'available',
  DEGRADED: 'degraded',
  UNAVAILABLE: 'unavailable',
  RATE_LIMITED: 'rate_limited'
};

const ROUTING_STRATEGY = {
  ROUND_ROBIN: 'round_robin',
  LEAST_LOAD: 'least_load',
  COST_OPTIMIZED: 'cost_optimized',
  PERFORMANCE: 'performance',
  TASK_MATCH: 'task_match'
};

const MODEL_CAPABILITY = {
  CODE: 'code',
  ANALYSIS: 'analysis',
  GENERATION: 'generation',
  CONVERSATION: 'conversation',
  EMBEDDING: 'embedding',
  VISION: 'vision'
};

// 预置模型配置模板
const MODEL_PRESETS = {
  'gpt-4': {
    provider: 'openai',
    maxTokens: 8192,
    costPer1kInput: 0.03,
    costPer1kOutput: 0.06,
    capabilities: [MODEL_CAPABILITY.CODE, MODEL_CAPABILITY.ANALYSIS, MODEL_CAPABILITY.GENERATION, MODEL_CAPABILITY.CONVERSATION],
    avgLatencyMs: 2000,
    rateLimit: 500
  },
  'gpt-4-turbo': {
    provider: 'openai',
    maxTokens: 128000,
    costPer1kInput: 0.01,
    costPer1kOutput: 0.03,
    capabilities: [MODEL_CAPABILITY.CODE, MODEL_CAPABILITY.ANALYSIS, MODEL_CAPABILITY.GENERATION, MODEL_CAPABILITY.CONVERSATION, MODEL_CAPABILITY.VISION],
    avgLatencyMs: 1500,
    rateLimit: 800
  },
  'claude-3-opus': {
    provider: 'anthropic',
    maxTokens: 200000,
    costPer1kInput: 0.015,
    costPer1kOutput: 0.075,
    capabilities: [MODEL_CAPABILITY.CODE, MODEL_CAPABILITY.ANALYSIS, MODEL_CAPABILITY.GENERATION, MODEL_CAPABILITY.CONVERSATION, MODEL_CAPABILITY.VISION],
    avgLatencyMs: 3000,
    rateLimit: 400
  },
  'claude-3-sonnet': {
    provider: 'anthropic',
    maxTokens: 200000,
    costPer1kInput: 0.003,
    costPer1kOutput: 0.015,
    capabilities: [MODEL_CAPABILITY.CODE, MODEL_CAPABILITY.ANALYSIS, MODEL_CAPABILITY.GENERATION, MODEL_CAPABILITY.CONVERSATION, MODEL_CAPABILITY.VISION],
    avgLatencyMs: 1800,
    rateLimit: 1000
  },
  'gemini-pro': {
    provider: 'google',
    maxTokens: 32000,
    costPer1kInput: 0.00025,
    costPer1kOutput: 0.0005,
    capabilities: [MODEL_CAPABILITY.ANALYSIS, MODEL_CAPABILITY.GENERATION, MODEL_CAPABILITY.CONVERSATION],
    avgLatencyMs: 1200,
    rateLimit: 600
  },
  'local-llm': {
    provider: 'local',
    maxTokens: 4096,
    costPer1kInput: 0,
    costPer1kOutput: 0,
    capabilities: [MODEL_CAPABILITY.CODE, MODEL_CAPABILITY.GENERATION],
    avgLatencyMs: 500,
    rateLimit: 9999
  }
};

// ============================================================
// MultiModelRouter
// ============================================================

class MultiModelRouter {
  /**
   * @param {Object} options
   * @param {string} options.defaultStrategy   - 默认路由策略
   * @param {number} options.maxRetries        - 最大重试次数
   * @param {number} options.degradeThreshold  - 错误率降级阈值 (0-1)
   * @param {number} options.recoveryTimeMs    - 降级恢复时间
   * @param {Object} options.logger            - Logger 实例
   */
  constructor(options = {}) {
    this.defaultStrategy = options.defaultStrategy || ROUTING_STRATEGY.TASK_MATCH;
    this.maxRetries = options.maxRetries || 3;
    this.degradeThreshold = options.degradeThreshold || 0.3;
    this.recoveryTimeMs = options.recoveryTimeMs || 60000;
    this.logger = options.logger || createLogger({ name: 'multi-model-router' });

    // 注册的模型
    this.models = new Map();

    // 模型性能追踪
    this.performance = new Map();

    // Round-robin 索引
    this._rrIndex = 0;

    // 任务类型 → 首选模型映射
    this.taskModelMap = new Map();
  }

  // ----------------------------------------------------------
  // 模型注册
  // ----------------------------------------------------------

  /**
   * 注册模型
   * @param {string} modelId     - 模型标识
   * @param {Object} config      - 模型配置
   * @returns {Object} 注册结果
   */
  registerModel(modelId, config = {}) {
    // 合并预置配置
    const preset = MODEL_PRESETS[modelId] || {};
    const modelConfig = {
      id: modelId,
      provider: config.provider || preset.provider || 'custom',
      maxTokens: config.maxTokens || preset.maxTokens || 4096,
      costPer1kInput: config.costPer1kInput ?? preset.costPer1kInput ?? 0.01,
      costPer1kOutput: config.costPer1kOutput ?? preset.costPer1kOutput ?? 0.03,
      capabilities: config.capabilities || preset.capabilities || [MODEL_CAPABILITY.GENERATION],
      avgLatencyMs: config.avgLatencyMs || preset.avgLatencyMs || 2000,
      rateLimit: config.rateLimit || preset.rateLimit || 100,
      endpoint: config.endpoint || null,
      apiKey: config.apiKey || null,
      status: MODEL_STATUS.AVAILABLE,
      registeredAt: new Date().toISOString(),
      priority: config.priority || 50,
      weight: config.weight || 1
    };

    this.models.set(modelId, modelConfig);

    // 初始化性能追踪
    this.performance.set(modelId, {
      totalRequests: 0,
      successCount: 0,
      errorCount: 0,
      totalLatencyMs: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCost: 0,
      lastErrorAt: null,
      lastSuccessAt: null,
      degradedAt: null,
      recentErrors: [],
      recentLatencies: []
    });

    this.logger.info({ modelId, provider: modelConfig.provider }, 'Model registered');
    return { success: true, model: modelConfig };
  }

  /**
   * 批量注册预置模型
   * @param {string[]} modelIds - 模型ID列表
   */
  registerPresets(modelIds) {
    const results = [];
    for (const id of modelIds) {
      results.push(this.registerModel(id));
    }
    return results;
  }

  /**
   * 注销模型
   */
  unregisterModel(modelId) {
    if (!this.models.has(modelId)) return false;
    this.models.delete(modelId);
    this.performance.delete(modelId);
    return true;
  }

  // ----------------------------------------------------------
  // 路由选择
  // ----------------------------------------------------------

  /**
   * 根据策略选择模型
   * @param {Object} request        - 请求信息
   * @param {string} request.taskType    - 任务类型 (code/analysis/generation等)
   * @param {number} request.estimatedTokens - 预估 token 数
   * @param {number} request.maxBudget       - 最大预算
   * @param {string} request.strategy        - 覆盖路由策略
   * @param {string[]} request.requiredCapabilities - 必需能力
   * @returns {Object} { modelId, model, reason }
   */
  route(request = {}) {
    const strategy = request.strategy || this.defaultStrategy;
    const candidates = this._getCandidates(request);

    if (candidates.length === 0) {
      return { success: false, error: 'No available models match the requirements' };
    }

    let selected;
    switch (strategy) {
      case ROUTING_STRATEGY.ROUND_ROBIN:
        selected = this._routeRoundRobin(candidates);
        break;
      case ROUTING_STRATEGY.LEAST_LOAD:
        selected = this._routeLeastLoad(candidates);
        break;
      case ROUTING_STRATEGY.COST_OPTIMIZED:
        selected = this._routeCostOptimized(candidates);
        break;
      case ROUTING_STRATEGY.PERFORMANCE:
        selected = this._routePerformance(candidates);
        break;
      case ROUTING_STRATEGY.TASK_MATCH:
      default:
        selected = this._routeTaskMatch(candidates, request);
        break;
    }

    this.logger.debug({
      strategy,
      selected: selected.modelId,
      candidates: candidates.length
    }, 'Model routed');

    return { success: true, ...selected };
  }

  /**
   * 获取候选模型（过滤不可用、不满足需求的）
   */
  _getCandidates(request) {
    const candidates = [];
    const now = Date.now();

    for (const [id, model] of this.models.entries()) {
      // 跳过不可用
      if (model.status === MODEL_STATUS.UNAVAILABLE) {
        // 检查是否恢复
        const perf = this.performance.get(id);
        if (perf.degradedAt && (now - new Date(perf.degradedAt).getTime()) > this.recoveryTimeMs) {
          model.status = MODEL_STATUS.AVAILABLE;
          perf.degradedAt = null;
          this.logger.info({ modelId: id }, 'Model recovered from unavailable');
        } else {
          continue;
        }
      }

      // 检查 rate limit 降级恢复
      if (model.status === MODEL_STATUS.RATE_LIMITED) {
        const perf = this.performance.get(id);
        if (perf.degradedAt && (now - new Date(perf.degradedAt).getTime()) > this.recoveryTimeMs) {
          model.status = MODEL_STATUS.AVAILABLE;
          perf.degradedAt = null;
        } else {
          continue;
        }
      }

      // 检查必需能力
      if (request.requiredCapabilities && request.requiredCapabilities.length > 0) {
        const hasAll = request.requiredCapabilities.every(cap => model.capabilities.includes(cap));
        if (!hasAll) continue;
      }

      // 检查 token 限制
      if (request.estimatedTokens && request.estimatedTokens > model.maxTokens) {
        continue;
      }

      // 检查预算
      if (request.maxBudget !== undefined) {
        const estTokensK = (request.estimatedTokens || 1000) / 1000;
        const estCost = estTokensK * model.costPer1kInput;
        if (estCost > request.maxBudget) continue;
      }

      // 排除已尝试的模型（用于 retry/fallback）
      if (request._excludeModels && request._excludeModels.has(id)) continue;

      candidates.push({ modelId: id, model, perf: this.performance.get(id) });
    }

    return candidates;
  }

  _routeRoundRobin(candidates) {
    this._rrIndex = (this._rrIndex + 1) % candidates.length;
    const c = candidates[this._rrIndex];
    return { modelId: c.modelId, model: c.model, reason: 'round_robin' };
  }

  _routeLeastLoad(candidates) {
    const sorted = [...candidates].sort((a, b) => {
      const loadA = a.perf.totalRequests - a.perf.successCount - a.perf.errorCount;
      const loadB = b.perf.totalRequests - b.perf.successCount - b.perf.errorCount;
      return loadA - loadB;
    });
    return { modelId: sorted[0].modelId, model: sorted[0].model, reason: 'least_load' };
  }

  _routeCostOptimized(candidates) {
    const sorted = [...candidates].sort((a, b) => {
      const costA = a.model.costPer1kInput + a.model.costPer1kOutput;
      const costB = b.model.costPer1kInput + b.model.costPer1kOutput;
      return costA - costB;
    });
    return { modelId: sorted[0].modelId, model: sorted[0].model, reason: 'cost_optimized' };
  }

  _routePerformance(candidates) {
    const sorted = [...candidates].sort((a, b) => {
      const avgLatA = a.perf.totalRequests > 0
        ? a.perf.totalLatencyMs / a.perf.totalRequests : a.model.avgLatencyMs;
      const avgLatB = b.perf.totalRequests > 0
        ? b.perf.totalLatencyMs / b.perf.totalRequests : b.model.avgLatencyMs;

      const successRateA = a.perf.totalRequests > 0
        ? a.perf.successCount / a.perf.totalRequests : 1;
      const successRateB = b.perf.totalRequests > 0
        ? b.perf.successCount / b.perf.totalRequests : 1;

      // 综合评分: 成功率 * (1 / 延迟归一化)
      const scoreA = successRateA * (1000 / avgLatA);
      const scoreB = successRateB * (1000 / avgLatB);
      return scoreB - scoreA;
    });
    return { modelId: sorted[0].modelId, model: sorted[0].model, reason: 'performance' };
  }

  _routeTaskMatch(candidates, request) {
    const taskType = request.taskType || 'generation';

    // 检查自定义映射
    if (this.taskModelMap.has(taskType)) {
      const preferred = this.taskModelMap.get(taskType);
      const found = candidates.find(c => c.modelId === preferred);
      if (found) {
        return { modelId: found.modelId, model: found.model, reason: `task_map:${taskType}` };
      }
    }

    // 按能力匹配 + 优先级排序
    const capMap = {
      'code': MODEL_CAPABILITY.CODE,
      'analysis': MODEL_CAPABILITY.ANALYSIS,
      'generation': MODEL_CAPABILITY.GENERATION,
      'conversation': MODEL_CAPABILITY.CONVERSATION,
      'embedding': MODEL_CAPABILITY.EMBEDDING,
      'vision': MODEL_CAPABILITY.VISION
    };

    const requiredCap = capMap[taskType];
    let matched = candidates;
    if (requiredCap) {
      matched = candidates.filter(c => c.model.capabilities.includes(requiredCap));
      if (matched.length === 0) matched = candidates; // fallback
    }

    // 按优先级排序
    matched.sort((a, b) => b.model.priority - a.model.priority);
    return { modelId: matched[0].modelId, model: matched[0].model, reason: `task_match:${taskType}` };
  }

  // ----------------------------------------------------------
  // 任务-模型映射
  // ----------------------------------------------------------

  /**
   * 设置任务类型的首选模型
   */
  setTaskModel(taskType, modelId) {
    this.taskModelMap.set(taskType, modelId);
  }

  /**
   * 获取任务-模型映射
   */
  getTaskModelMap() {
    const map = {};
    for (const [k, v] of this.taskModelMap.entries()) {
      map[k] = v;
    }
    return map;
  }

  // ----------------------------------------------------------
  // 性能跟踪
  // ----------------------------------------------------------

  /**
   * 记录请求结果
   * @param {string} modelId
   * @param {Object} result
   * @param {boolean} result.success
   * @param {number} result.latencyMs
   * @param {number} result.inputTokens
   * @param {number} result.outputTokens
   * @param {string} result.error
   */
  recordResult(modelId, result) {
    const perf = this.performance.get(modelId);
    if (!perf) return;

    const model = this.models.get(modelId);
    perf.totalRequests++;

    if (result.success) {
      perf.successCount++;
      perf.lastSuccessAt = new Date().toISOString();
    } else {
      perf.errorCount++;
      perf.lastErrorAt = new Date().toISOString();
      perf.recentErrors.push({
        time: new Date().toISOString(),
        error: result.error || 'unknown'
      });
      // 保留最近20个错误
      if (perf.recentErrors.length > 20) perf.recentErrors.shift();
    }

    if (result.latencyMs !== undefined) {
      perf.totalLatencyMs += result.latencyMs;
      perf.recentLatencies.push(result.latencyMs);
      if (perf.recentLatencies.length > 50) perf.recentLatencies.shift();
    }

    if (result.inputTokens) perf.totalInputTokens += result.inputTokens;
    if (result.outputTokens) perf.totalOutputTokens += result.outputTokens;

    // 计算成本
    if (model && result.inputTokens) {
      const cost = (result.inputTokens / 1000) * model.costPer1kInput +
                   ((result.outputTokens || 0) / 1000) * model.costPer1kOutput;
      perf.totalCost += cost;
    }

    // 检查是否需要降级
    this._checkDegradation(modelId);
  }

  /**
   * 检查是否需要降级
   */
  _checkDegradation(modelId) {
    const perf = this.performance.get(modelId);
    const model = this.models.get(modelId);
    if (!perf || !model || perf.totalRequests < 5) return;

    const errorRate = perf.errorCount / perf.totalRequests;

    if (errorRate >= this.degradeThreshold * 2) {
      // 严重错误率 → 不可用
      if (model.status !== MODEL_STATUS.UNAVAILABLE) {
        model.status = MODEL_STATUS.UNAVAILABLE;
        perf.degradedAt = new Date().toISOString();
        this.logger.warn({ modelId, errorRate: errorRate.toFixed(2) }, 'Model marked unavailable');
      }
    } else if (errorRate >= this.degradeThreshold) {
      // 中等错误率 → 降级
      if (model.status === MODEL_STATUS.AVAILABLE) {
        model.status = MODEL_STATUS.DEGRADED;
        perf.degradedAt = new Date().toISOString();
        this.logger.warn({ modelId, errorRate: errorRate.toFixed(2) }, 'Model degraded');
      }
    }
  }

  // ----------------------------------------------------------
  // 重试与 Fallback
  // ----------------------------------------------------------

  /**
   * 执行请求（带重试和 fallback）
   * @param {Object} request           - 路由请求
   * @param {Function} executor        - 实际执行函数 (modelId, model) => Promise<result>
   * @returns {Object} { success, result, modelId, attempts }
   */
  async executeWithRetry(request, executor) {
    const attempts = [];
    const triedModels = new Set();

    for (let i = 0; i < this.maxRetries; i++) {
      // 路由选择（排除已尝试失败的）
      const routeResult = this.route({
        ...request,
        _excludeModels: triedModels
      });

      if (!routeResult.success) {
        return {
          success: false,
          error: 'No available models after retries',
          attempts
        };
      }

      const { modelId, model } = routeResult;
      triedModels.add(modelId);

      const startTime = Date.now();
      try {
        const result = await executor(modelId, model);
        const latencyMs = Date.now() - startTime;

        this.recordResult(modelId, {
          success: true,
          latencyMs,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens
        });

        attempts.push({ modelId, success: true, latencyMs });

        return {
          success: true,
          result,
          modelId,
          attempts
        };
      } catch (error) {
        const latencyMs = Date.now() - startTime;
        this.recordResult(modelId, {
          success: false,
          latencyMs,
          error: error.message
        });

        attempts.push({ modelId, success: false, error: error.message, latencyMs });

        this.logger.warn({
          modelId,
          attempt: i + 1,
          error: error.message
        }, 'Model request failed, trying fallback');
      }
    }

    return {
      success: false,
      error: `All ${this.maxRetries} attempts failed`,
      attempts
    };
  }

  // ----------------------------------------------------------
  // 查询
  // ----------------------------------------------------------

  /**
   * 列出所有已注册模型
   */
  listModels() {
    const list = [];
    for (const [id, model] of this.models.entries()) {
      list.push({
        id,
        provider: model.provider,
        status: model.status,
        capabilities: model.capabilities,
        maxTokens: model.maxTokens,
        costPer1k: model.costPer1kInput + model.costPer1kOutput,
        priority: model.priority
      });
    }
    return list;
  }

  /**
   * 获取模型详情
   */
  getModel(modelId) {
    return this.models.get(modelId) || null;
  }

  /**
   * 获取模型性能数据
   */
  getPerformance(modelId) {
    const perf = this.performance.get(modelId);
    if (!perf) return null;

    const avgLatency = perf.totalRequests > 0
      ? perf.totalLatencyMs / perf.totalRequests : 0;
    const successRate = perf.totalRequests > 0
      ? perf.successCount / perf.totalRequests : 0;
    const p95Latency = this._percentile(perf.recentLatencies, 0.95);

    return {
      ...perf,
      avgLatencyMs: Math.round(avgLatency),
      successRate: parseFloat(successRate.toFixed(4)),
      p95LatencyMs: p95Latency
    };
  }

  _percentile(arr, p) {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, idx)];
  }

  /**
   * 获取所有模型的综合统计
   */
  getStats() {
    let totalRequests = 0, totalErrors = 0, totalCost = 0;
    const modelStats = [];

    for (const [id, perf] of this.performance.entries()) {
      const model = this.models.get(id);
      totalRequests += perf.totalRequests;
      totalErrors += perf.errorCount;
      totalCost += perf.totalCost;

      modelStats.push({
        modelId: id,
        status: model ? model.status : 'unknown',
        requests: perf.totalRequests,
        successRate: perf.totalRequests > 0
          ? parseFloat((perf.successCount / perf.totalRequests).toFixed(4)) : 0,
        avgLatencyMs: perf.totalRequests > 0
          ? Math.round(perf.totalLatencyMs / perf.totalRequests) : 0,
        cost: parseFloat(perf.totalCost.toFixed(6))
      });
    }

    return {
      registeredModels: this.models.size,
      availableModels: [...this.models.values()].filter(m => m.status === MODEL_STATUS.AVAILABLE).length,
      totalRequests,
      totalErrors,
      overallSuccessRate: totalRequests > 0
        ? parseFloat(((totalRequests - totalErrors) / totalRequests).toFixed(4)) : 0,
      totalCost: parseFloat(totalCost.toFixed(6)),
      defaultStrategy: this.defaultStrategy,
      modelStats
    };
  }

  /**
   * 重置模型状态
   */
  resetModel(modelId) {
    const model = this.models.get(modelId);
    if (!model) return false;

    model.status = MODEL_STATUS.AVAILABLE;
    this.performance.set(modelId, {
      totalRequests: 0,
      successCount: 0,
      errorCount: 0,
      totalLatencyMs: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCost: 0,
      lastErrorAt: null,
      lastSuccessAt: null,
      degradedAt: null,
      recentErrors: [],
      recentLatencies: []
    });

    this.logger.info({ modelId }, 'Model reset');
    return true;
  }
}

// ============================================================
// 导出
// ============================================================

module.exports = {
  MultiModelRouter,
  MODEL_STATUS,
  ROUTING_STRATEGY,
  MODEL_CAPABILITY,
  MODEL_PRESETS
};
