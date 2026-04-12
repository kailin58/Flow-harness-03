const { MultiModelRouter, MODEL_STATUS, ROUTING_STRATEGY, MODEL_CAPABILITY, MODEL_PRESETS } = require('../src/multi-model-router');

async function testMultiModelRouter() {
  console.log('🧪 测试 MultiModelRouter...\n');

  let passed = 0;
  let failed = 0;
  const silentLogger = {
    trace(){}, debug(){}, info(){}, warn(){}, error(){}, fatal(){},
    child() { return silentLogger; }
  };

  function assert(condition, msg) {
    if (condition) { passed++; console.log(`  ✅ ${msg}`); }
    else { failed++; console.log(`  ❌ ${msg}`); }
  }

  try {
    // ---- Test 1: 常量导出 ----
    console.log('\nTest 1: 常量导出');
    assert(typeof MODEL_STATUS === 'object', 'MODEL_STATUS 已导出');
    assert(MODEL_STATUS.AVAILABLE === 'available', 'AVAILABLE 状态');
    assert(MODEL_STATUS.DEGRADED === 'degraded', 'DEGRADED 状态');
    assert(typeof ROUTING_STRATEGY === 'object', 'ROUTING_STRATEGY 已导出');
    assert(ROUTING_STRATEGY.ROUND_ROBIN === 'round_robin', 'ROUND_ROBIN 策略');
    assert(typeof MODEL_CAPABILITY === 'object', 'MODEL_CAPABILITY 已导出');
    assert(typeof MODEL_PRESETS === 'object', 'MODEL_PRESETS 已导出');
    assert(MODEL_PRESETS['gpt-4'] !== undefined, 'GPT-4 预置配置存在');

    // ---- Test 2: 基本实例化 ----
    console.log('\nTest 2: 基本实例化');
    const router = new MultiModelRouter({ logger: silentLogger });
    assert(router !== null, 'MultiModelRouter 创建成功');
    assert(router.defaultStrategy === ROUTING_STRATEGY.TASK_MATCH, '默认策略为 TASK_MATCH');
    assert(router.maxRetries === 3, '默认 maxRetries = 3');

    // ---- Test 3: 模型注册 ----
    console.log('\nTest 3: 模型注册');
    const reg1 = router.registerModel('gpt-4');
    assert(reg1.success === true, '注册 GPT-4 成功');
    assert(reg1.model.provider === 'openai', 'provider 为 openai');
    assert(reg1.model.maxTokens === 8192, 'maxTokens 正确');

    router.registerModel('claude-3-sonnet');
    router.registerModel('gemini-pro');
    router.registerModel('local-llm', { priority: 10 });

    assert(router.listModels().length === 4, '4 个模型已注册');

    // ---- Test 4: 批量注册预置模型 ----
    console.log('\nTest 4: 批量注册预置模型');
    const router2 = new MultiModelRouter({ logger: silentLogger });
    const results = router2.registerPresets(['gpt-4', 'claude-3-sonnet', 'gemini-pro']);
    assert(results.length === 3, '批量注册 3 个');
    assert(results.every(r => r.success), '全部成功');

    // ---- Test 5: 注销模型 ----
    console.log('\nTest 5: 注销模型');
    assert(router.unregisterModel('local-llm') === true, '注销成功');
    assert(router.listModels().length === 3, '剩余 3 个');
    assert(router.unregisterModel('nonexistent') === false, '不存在返回 false');

    // ---- Test 6: Round Robin 路由 ----
    console.log('\nTest 6: Round Robin 路由');
    const rr = new MultiModelRouter({ logger: silentLogger });
    rr.registerModel('model-a', { provider: 'test', capabilities: [MODEL_CAPABILITY.GENERATION] });
    rr.registerModel('model-b', { provider: 'test', capabilities: [MODEL_CAPABILITY.GENERATION] });
    rr.registerModel('model-c', { provider: 'test', capabilities: [MODEL_CAPABILITY.GENERATION] });

    const rr1 = rr.route({ strategy: ROUTING_STRATEGY.ROUND_ROBIN });
    const rr2 = rr.route({ strategy: ROUTING_STRATEGY.ROUND_ROBIN });
    const rr3 = rr.route({ strategy: ROUTING_STRATEGY.ROUND_ROBIN });
    assert(rr1.success && rr2.success && rr3.success, 'Round Robin 3次路由成功');
    // 三次应该选不同模型
    const rrModels = new Set([rr1.modelId, rr2.modelId, rr3.modelId]);
    assert(rrModels.size === 3, 'Round Robin 轮转了 3 个不同模型');

    // ---- Test 7: Cost Optimized 路由 ----
    console.log('\nTest 7: Cost Optimized 路由');
    const cr = new MultiModelRouter({ logger: silentLogger });
    cr.registerModel('expensive', { provider: 'test', costPer1kInput: 0.1, costPer1kOutput: 0.2, capabilities: [MODEL_CAPABILITY.GENERATION] });
    cr.registerModel('cheap', { provider: 'test', costPer1kInput: 0.001, costPer1kOutput: 0.002, capabilities: [MODEL_CAPABILITY.GENERATION] });

    const costResult = cr.route({ strategy: ROUTING_STRATEGY.COST_OPTIMIZED });
    assert(costResult.success === true, 'Cost Optimized 路由成功');
    assert(costResult.modelId === 'cheap', '选择最便宜的模型');

    // ---- Test 8: 能力过滤 ----
    console.log('\nTest 8: 能力过滤');
    const capRouter = new MultiModelRouter({ logger: silentLogger });
    capRouter.registerModel('coder', { capabilities: [MODEL_CAPABILITY.CODE] });
    capRouter.registerModel('chatter', { capabilities: [MODEL_CAPABILITY.CONVERSATION] });

    const codeRoute = capRouter.route({ requiredCapabilities: [MODEL_CAPABILITY.CODE] });
    assert(codeRoute.success === true, '能力过滤路由成功');
    assert(codeRoute.modelId === 'coder', '选择有 CODE 能力的模型');

    const noMatch = capRouter.route({ requiredCapabilities: [MODEL_CAPABILITY.VISION] });
    assert(noMatch.success === false, '无匹配能力返回失败');

    // ---- Test 9: 预算过滤 ----
    console.log('\nTest 9: 预算过滤');
    const budgetResult = cr.route({
      strategy: ROUTING_STRATEGY.COST_OPTIMIZED,
      maxBudget: 0.005,
      estimatedTokens: 1000
    });
    assert(budgetResult.success === true, '预算过滤路由成功');
    assert(budgetResult.modelId === 'cheap', '在预算内选择模型');

    // ---- Test 10: 性能记录 ----
    console.log('\nTest 10: 性能记录');
    router.recordResult('gpt-4', { success: true, latencyMs: 1500, inputTokens: 100, outputTokens: 50 });
    router.recordResult('gpt-4', { success: true, latencyMs: 2000, inputTokens: 200, outputTokens: 100 });
    router.recordResult('gpt-4', { success: false, latencyMs: 5000, error: 'timeout' });

    const perf = router.getPerformance('gpt-4');
    assert(perf !== null, '性能数据存在');
    assert(perf.totalRequests === 3, '总请求 3');
    assert(perf.successCount === 2, '成功 2');
    assert(perf.errorCount === 1, '错误 1');
    assert(perf.avgLatencyMs > 0, '平均延迟 > 0');
    assert(perf.successRate > 0.5, '成功率 > 50%');
    assert(perf.totalCost > 0, '总成本 > 0');

    // ---- Test 11: 自动降级 ----
    console.log('\nTest 11: 自动降级');
    const degradeRouter = new MultiModelRouter({
      logger: silentLogger,
      degradeThreshold: 0.3
    });
    degradeRouter.registerModel('fragile', { capabilities: [MODEL_CAPABILITY.GENERATION] });

    // 先发一些成功，再大量失败
    for (let i = 0; i < 3; i++) {
      degradeRouter.recordResult('fragile', { success: true, latencyMs: 100 });
    }
    for (let i = 0; i < 7; i++) {
      degradeRouter.recordResult('fragile', { success: false, latencyMs: 5000, error: 'error' });
    }

    const fragileModel = degradeRouter.getModel('fragile');
    assert(fragileModel.status !== MODEL_STATUS.AVAILABLE,
      `高错误率后状态不再是 AVAILABLE (实际: ${fragileModel.status})`);

    // ---- Test 12: Task Match 路由 ----
    console.log('\nTest 12: Task Match 路由');
    const tmRouter = new MultiModelRouter({ logger: silentLogger });
    tmRouter.registerModel('gpt-4', { priority: 90 });
    tmRouter.registerModel('gemini-pro', { priority: 50 });

    const taskResult = tmRouter.route({ taskType: 'code' });
    assert(taskResult.success === true, 'Task Match 路由成功');
    assert(taskResult.modelId === 'gpt-4', '选择优先级高且有 CODE 能力的模型');

    // ---- Test 13: 自定义任务-模型映射 ----
    console.log('\nTest 13: 自定义任务-模型映射');
    tmRouter.setTaskModel('code', 'gemini-pro');
    const mappedResult = tmRouter.route({ taskType: 'code' });
    assert(mappedResult.modelId === 'gemini-pro', '使用自定义映射');

    const map = tmRouter.getTaskModelMap();
    assert(map['code'] === 'gemini-pro', '映射查询正确');

    // ---- Test 14: Performance 路由 ----
    console.log('\nTest 14: Performance 路由');
    const perfRouter = new MultiModelRouter({ logger: silentLogger });
    perfRouter.registerModel('fast-model', { capabilities: [MODEL_CAPABILITY.GENERATION], avgLatencyMs: 500 });
    perfRouter.registerModel('slow-model', { capabilities: [MODEL_CAPABILITY.GENERATION], avgLatencyMs: 5000 });

    const perfResult = perfRouter.route({ strategy: ROUTING_STRATEGY.PERFORMANCE });
    assert(perfResult.success === true, 'Performance 路由成功');
    assert(perfResult.modelId === 'fast-model', '选择低延迟模型');

    // ---- Test 15: executeWithRetry ----
    console.log('\nTest 15: executeWithRetry');
    const retryRouter = new MultiModelRouter({ logger: silentLogger, maxRetries: 3 });
    retryRouter.registerModel('fail-model', { capabilities: [MODEL_CAPABILITY.GENERATION], priority: 100 });
    retryRouter.registerModel('ok-model', { capabilities: [MODEL_CAPABILITY.GENERATION], priority: 50 });

    let callCount = 0;
    const retryResult = await retryRouter.executeWithRetry(
      { taskType: 'generation' },
      async (modelId, model) => {
        callCount++;
        if (modelId === 'fail-model') throw new Error('API Error');
        return { output: 'success', inputTokens: 100, outputTokens: 50 };
      }
    );

    assert(retryResult.success === true, 'executeWithRetry 最终成功');
    assert(retryResult.modelId === 'ok-model', 'fallback 到 ok-model');
    assert(retryResult.attempts.length >= 2, '至少 2 次尝试');

    // ---- Test 16: executeWithRetry 全部失败 ----
    console.log('\nTest 16: executeWithRetry 全部失败');
    const allFailRouter = new MultiModelRouter({ logger: silentLogger, maxRetries: 2 });
    allFailRouter.registerModel('bad1', { capabilities: [MODEL_CAPABILITY.GENERATION] });
    allFailRouter.registerModel('bad2', { capabilities: [MODEL_CAPABILITY.GENERATION] });

    const allFailResult = await allFailRouter.executeWithRetry(
      { taskType: 'generation' },
      async () => { throw new Error('Always fails'); }
    );

    assert(allFailResult.success === false, '全部失败返回失败');
    assert(allFailResult.attempts.length === 2, '尝试了 2 次');

    // ---- Test 17: getStats ----
    console.log('\nTest 17: getStats');
    const stats = router.getStats();
    assert(stats.registeredModels === 3, `注册模型数 = 3 (实际: ${stats.registeredModels})`);
    assert(stats.totalRequests >= 3, '总请求 >= 3');
    assert(stats.totalCost >= 0, '总成本 >= 0');
    assert(stats.modelStats.length > 0, 'modelStats 非空');
    assert(typeof stats.overallSuccessRate === 'number', 'overallSuccessRate 是数字');

    // ---- Test 18: resetModel ----
    console.log('\nTest 18: resetModel');
    assert(router.resetModel('gpt-4') === true, '重置成功');
    const afterReset = router.getPerformance('gpt-4');
    assert(afterReset.totalRequests === 0, '重置后请求数 = 0');
    assert(router.resetModel('nonexistent') === false, '不存在返回 false');

    // ---- Test 19: listModels 详情 ----
    console.log('\nTest 19: listModels 详情');
    const models = router.listModels();
    assert(models.length > 0, 'listModels 非空');
    const gpt4 = models.find(m => m.id === 'gpt-4');
    assert(gpt4 !== undefined, 'GPT-4 在列表中');
    assert(gpt4.provider === 'openai', 'provider 正确');
    assert(Array.isArray(gpt4.capabilities), 'capabilities 是数组');

    // ---- Test 20: Token 限制过滤 ----
    console.log('\nTest 20: Token 限制过滤');
    const tokenRouter = new MultiModelRouter({ logger: silentLogger });
    tokenRouter.registerModel('small', { maxTokens: 1000, capabilities: [MODEL_CAPABILITY.GENERATION] });
    tokenRouter.registerModel('large', { maxTokens: 100000, capabilities: [MODEL_CAPABILITY.GENERATION] });

    const tokenResult = tokenRouter.route({ estimatedTokens: 50000 });
    assert(tokenResult.success === true, 'Token 过滤路由成功');
    assert(tokenResult.modelId === 'large', '选择能容纳 50K token 的模型');

  } catch (error) {
    console.log(`\n❌ 测试异常: ${error.message}`);
    console.log(error.stack);
    failed++;
  }

  console.log(`\n========================================`);
  console.log(`测试结果: ${passed} 通过, ${failed} 失败`);
  if (failed === 0) {
    console.log('✅ 所有 MultiModelRouter 测试通过！');
  } else {
    console.log('❌ 有测试失败');
    process.exitCode = 1;
  }
}

testMultiModelRouter();
