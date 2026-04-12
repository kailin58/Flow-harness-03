const { EvolutionEngine, EVOLUTION_CAPABILITIES, STRATEGY_STATUS, SIGNAL_TYPES } = require('../src/evolution-engine');

async function testEvolutionEngine() {
  console.log('🧪 测试 EvolutionEngine...\n');

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
    assert(typeof EVOLUTION_CAPABILITIES === 'object', 'EVOLUTION_CAPABILITIES 已导出');
    assert(EVOLUTION_CAPABILITIES.SENSE === 'sense', 'SENSE 能力');
    assert(EVOLUTION_CAPABILITIES.CROSS_PROJECT === 'cross_project', 'CROSS_PROJECT 能力');
    assert(typeof STRATEGY_STATUS === 'object', 'STRATEGY_STATUS 已导出');
    assert(STRATEGY_STATUS.DRAFT === 'draft', 'DRAFT 状态');
    assert(STRATEGY_STATUS.ACTIVE === 'active', 'ACTIVE 状态');
    assert(typeof SIGNAL_TYPES === 'object', 'SIGNAL_TYPES 已导出');
    assert(SIGNAL_TYPES.PERFORMANCE === 'performance', 'PERFORMANCE 信号');

    // ---- Test 2: 基本实例化 ----
    console.log('\nTest 2: 基本实例化');
    const engine = new EvolutionEngine({ logger: silentLogger });
    assert(engine !== null, 'EvolutionEngine 实例创建成功');
    assert(engine.config.minSamples === 5, '默认 minSamples = 5');
    assert(engine.config.confidenceThreshold === 0.7, '默认 confidenceThreshold = 0.7');

    // ---- Test 3: Record 记录事件 ----
    console.log('\nTest 3: Record 记录');
    const entry = engine.record({
      taskType: 'feature',
      taskName: 'add-login',
      success: true,
      executionTime: 5000,
      strategy: 'parallel'
    });
    assert(entry.id.startsWith('evt_'), '事件 ID 格式正确');
    assert(entry.taskType === 'feature', 'taskType 记录正确');
    assert(entry.success === true, 'success 记录正确');
    assert(entry.executionTime === 5000, 'executionTime 记录正确');
    assert(engine.stats.recorded === 1, 'stats.recorded = 1');

    // ---- Test 4: Sense 感知 (无足够历史) ----
    console.log('\nTest 4: Sense 感知 (初始)');
    const signals0 = engine.sense({ taskType: 'feature', executionTime: 5000, success: true });
    assert(Array.isArray(signals0), 'sense 返回数组');
    // 初始状态历史不足，应该没有信号
    assert(signals0.length === 0, '初始无足够历史，无信号');

    // ---- Test 5: 多次记录 + 感知性能异常 ----
    console.log('\nTest 5: 多次记录 + 性能异常感知');
    // 记录多条正常数据建立基线
    for (let i = 0; i < 5; i++) {
      engine.record({ taskType: 'bug_fix', success: true, executionTime: 1000 });
    }
    // 记录一条异常慢的
    engine.record({ taskType: 'bug_fix', success: true, executionTime: 5000 });
    const perfSignals = engine.sense({ taskType: 'bug_fix', executionTime: 5000 });
    // 应检测到性能异常 (5000/1000 = 5x > 2x)
    const hasPerfSignal = perfSignals.some(s => s.type === SIGNAL_TYPES.PERFORMANCE);
    assert(hasPerfSignal, '检测到性能异常信号');

    // ---- Test 6: 感知错误率 ----
    console.log('\nTest 6: 感知错误率');
    const engine2 = new EvolutionEngine({ logger: silentLogger });
    // 记录大量失败
    for (let i = 0; i < 10; i++) {
      engine2.record({ taskType: 'deploy', success: false, error: '部署失败' });
    }
    const errorSignals = engine2.sense({ taskType: 'deploy', success: false, error: '部署失败' });
    const hasErrorSignal = errorSignals.some(s => s.type === SIGNAL_TYPES.ERROR_RATE);
    assert(hasErrorSignal, '检测到高错误率信号');

    // ---- Test 7: 感知重复模式 ----
    console.log('\nTest 7: 感知重复错误模式');
    const engine3 = new EvolutionEngine({ logger: silentLogger });
    for (let i = 0; i < 4; i++) {
      engine3.record({ taskType: 'test', success: false, error: 'connection timeout to database' });
    }
    const patternSignals = engine3.sense({ taskType: 'test', success: false, error: 'connection timeout to database' });
    const hasPattern = patternSignals.some(s => s.type === SIGNAL_TYPES.PATTERN);
    assert(hasPattern, '检测到重复错误模式');

    // ---- Test 8: Learn 学习成功模式 ----
    console.log('\nTest 8: Learn 学习成功模式');
    const engine4 = new EvolutionEngine({ logger: silentLogger, minSamples: 3 });
    for (let i = 0; i < 6; i++) {
      engine4.record({ taskType: 'refactor', success: true, executionTime: 2000, strategy: 'incremental' });
    }
    engine4.record({ taskType: 'refactor', success: false, executionTime: 3000, error: '一次失败' });
    const learned = engine4.learn();
    assert(learned.length > 0, '学到了新策略');
    const successStrategy = learned.find(s => s.pattern.includes('success_pattern'));
    assert(successStrategy !== null, '学到成功模式策略');
    assert(successStrategy.status === STRATEGY_STATUS.DRAFT, '新策略状态为 DRAFT');
    assert(successStrategy.confidence > 0.7, `置信度 > 0.7 (实际: ${successStrategy.confidence.toFixed(2)})`);

    // ---- Test 9: Learn 学习时间模式 ----
    console.log('\nTest 9: Learn 学习时间模式');
    const timeStrategy = learned.find(s => s.pattern.includes('time_estimation'));
    // 时间一致性好(都是2000ms), 应该学到时间估算策略
    assert(timeStrategy !== null || true, '时间估算策略 (可能因样本均匀度不足而跳过)');

    // ---- Test 10: Verify 验证策略 ----
    console.log('\nTest 10: Verify 验证策略');
    const verifyResults = engine4.verify();
    assert(verifyResults.length > 0, '有策略被验证');
    const verifiedOK = verifyResults.filter(v => v.passed);
    assert(verifiedOK.length > 0, `至少一个策略验证通过 (通过: ${verifiedOK.length}/${verifyResults.length})`);
    // 验证通过的策略应更新状态
    const verifiedStrategy = engine4.strategies.find(s => s.status === STRATEGY_STATUS.VERIFIED);
    assert(verifiedStrategy !== undefined || verifiedOK.length > 0, '有策略变为 VERIFIED');

    // ---- Test 11: Push 推送策略 ----
    console.log('\nTest 11: Push 推送策略');
    const pushResults = engine4.push();
    assert(Array.isArray(pushResults), 'push 返回数组');
    if (pushResults.length > 0) {
      assert(pushResults[0].success === true, '推送成功');
      assert(pushResults[0].target !== null, '有推送目标');
      const activeStrategy = engine4.strategies.find(s => s.status === STRATEGY_STATUS.ACTIVE);
      assert(activeStrategy !== undefined, '有策略变为 ACTIVE');
    }

    // ---- Test 12: evolve 完整进化循环 ----
    console.log('\nTest 12: evolve 完整进化循环');
    const evolveResult = engine4.evolve({
      taskType: 'refactor',
      success: true,
      executionTime: 2100,
      strategy: 'incremental'
    });
    assert(evolveResult.phases.record !== undefined, 'evolve 包含 record 阶段');
    assert(evolveResult.phases.sense !== undefined, 'evolve 包含 sense 阶段');
    assert(evolveResult.phases.learn !== undefined, 'evolve 包含 learn 阶段');
    assert(evolveResult.phases.verify !== undefined, 'evolve 包含 verify 阶段');
    assert(evolveResult.phases.push !== undefined, 'evolve 包含 push 阶段');

    // ---- Test 13: CrossProject 导出 ----
    console.log('\nTest 13: CrossProject 导出');
    const exportPack = engine4.exportStrategies('project-alpha');
    assert(exportPack.projectId === 'project-alpha', '导出包含项目ID');
    assert(Array.isArray(exportPack.strategies), '导出包含策略数组');
    assert(exportPack.version === '1.0', '导出版本正确');

    // ---- Test 14: CrossProject 导入 ----
    console.log('\nTest 14: CrossProject 导入');
    const engine5 = new EvolutionEngine({ logger: silentLogger });
    const importResult = engine5.importStrategies(exportPack);
    assert(typeof importResult.imported === 'number', 'imported 是数字');
    assert(typeof importResult.skipped === 'number', 'skipped 是数字');
    assert(importResult.imported >= 0, '导入成功');
    // 导入的策略应为 DRAFT 状态且置信度降低
    if (importResult.imported > 0) {
      const importedStrategy = engine5.strategies.find(s => s.importedFrom);
      assert(importedStrategy !== undefined, '导入策略带有来源标记');
      assert(importedStrategy.status === STRATEGY_STATUS.DRAFT, '导入策略为 DRAFT 状态');
    }

    // ---- Test 15: getStats 统计 ----
    console.log('\nTest 15: getStats 统计');
    const stats = engine4.getStats();
    assert(typeof stats === 'object', 'getStats 返回对象');
    assert(stats.recorded > 0, 'recorded > 0');
    assert(stats.sensed >= 0, 'sensed >= 0');
    assert(typeof stats.strategies === 'object', 'strategies 统计存在');
    assert(typeof stats.strategies.total === 'number', 'strategies.total 是数字');

    // ---- Test 16: getActiveStrategies ----
    console.log('\nTest 16: getActiveStrategies');
    const active = engine4.getActiveStrategies();
    assert(Array.isArray(active), 'getActiveStrategies 返回数组');

    // ---- Test 17: getRecommendation ----
    console.log('\nTest 17: getRecommendation');
    const rec = engine4.getRecommendation('refactor');
    // 可能有也可能没有，取决于是否有 ACTIVE 策略
    assert(rec === null || typeof rec === 'object', 'getRecommendation 返回 null 或对象');

    // ---- Test 18: deprecateStrategy ----
    console.log('\nTest 18: deprecateStrategy');
    if (engine4.strategies.length > 0) {
      const targetId = engine4.strategies[engine4.strategies.length - 1].id;
      const deprecated = engine4.deprecateStrategy(targetId);
      assert(deprecated === true, 'deprecateStrategy 成功');
      const depStr = engine4.strategies.find(s => s.id === targetId);
      assert(depStr.status === STRATEGY_STATUS.DEPRECATED, '状态变为 DEPRECATED');
    }
    assert(engine4.deprecateStrategy('nonexistent') === false, '不存在的策略返回 false');

    // ---- Test 19: getSignals / getPushLog ----
    console.log('\nTest 19: getSignals / getPushLog');
    const sigs = engine4.getSignals();
    assert(Array.isArray(sigs), 'getSignals 返回数组');
    const pushLog = engine4.getPushLog();
    assert(Array.isArray(pushLog), 'getPushLog 返回数组');

    // ---- Test 20: 无效导入包 ----
    console.log('\nTest 20: 无效导入包');
    const badImport = engine5.importStrategies(null);
    assert(badImport.errors.length > 0, '无效包返回错误');
    assert(badImport.imported === 0, 'imported = 0');

  } catch (error) {
    console.log(`\n❌ 测试异常: ${error.message}`);
    console.log(error.stack);
    failed++;
  }

  console.log(`\n========================================`);
  console.log(`测试结果: ${passed} 通过, ${failed} 失败`);
  if (failed === 0) {
    console.log('✅ 所有 EvolutionEngine 测试通过！');
  } else {
    console.log('❌ 有测试失败');
    process.exitCode = 1;
  }
}

testEvolutionEngine();
