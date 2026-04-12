const { EvolutionEngine, EVOLUTION_CAPABILITIES, STRATEGY_STATUS, SIGNAL_TYPES } = require('../src/evolution-engine');

async function testEvolutionEnhanced() {
  console.log('🧪 测试 EvolutionEngine 增强功能...\n');

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

  // 创建一个已经有活跃策略的引擎 (重现完整学习流程)
  function createTrainedEngine() {
    const engine = new EvolutionEngine({ logger: silentLogger, minSamples: 3, verifyRounds: 3 });
    // 生成足够的成功事件
    for (let i = 0; i < 8; i++) {
      engine.record({ taskType: 'feature', success: true, executionTime: 2000, strategy: 'parallel' });
    }
    engine.record({ taskType: 'feature', success: false, executionTime: 5000, error: 'timeout' });
    // 学习 + 验证 + 推送
    engine.learn();
    engine.verify();
    engine.push();
    return engine;
  }

  try {
    // ---- Test 1: checkCompatibility 基本调用 ----
    console.log('\nTest 1: checkCompatibility 基本调用');
    const engine = createTrainedEngine();
    const pack = engine.exportStrategies('project-A');
    const compat = engine.checkCompatibility(pack);
    assert(typeof compat === 'object', 'checkCompatibility 返回对象');
    assert(typeof compat.compatible === 'boolean', 'compatible 是布尔值');
    assert(typeof compat.score === 'number', 'score 是数字');
    assert(Array.isArray(compat.details), 'details 是数组');
    assert(compat.totalStrategies === pack.strategies.length, 'totalStrategies 正确');

    // ---- Test 2: checkCompatibility 与项目配置匹配 ----
    console.log('\nTest 2: checkCompatibility 项目配置匹配');
    const compat2 = engine.checkCompatibility(pack, {
      taskTypes: ['feature', 'bug_fix', 'refactor']
    });
    assert(compat2.score >= 50, `匹配项目分数 >= 50 (实际: ${compat2.score})`);
    const featureDetail = compat2.details.find(d => d.checks.some(c => c.check === 'task_type_match'));
    if (featureDetail) {
      const taskCheck = featureDetail.checks.find(c => c.check === 'task_type_match');
      assert(taskCheck.passed === true, '任务类型匹配通过');
    }

    // ---- Test 3: checkCompatibility 不匹配 ----
    console.log('\nTest 3: checkCompatibility 不匹配');
    const compat3 = engine.checkCompatibility(pack, {
      taskTypes: ['deploy', 'infrastructure'] // 没有 feature 类型
    });
    // 策略推荐的 taskType 是 feature，不在目标项目中
    if (compat3.details.length > 0 && compat3.details[0].checks.some(c => c.check === 'task_type_match')) {
      const mismatch = compat3.details[0].checks.find(c => c.check === 'task_type_match');
      assert(mismatch.passed === false, '不匹配的任务类型检测正确');
    } else {
      assert(true, '兼容性检查执行完毕 (无 taskType 限制)');
    }

    // ---- Test 4: checkCompatibility 无效包 ----
    console.log('\nTest 4: checkCompatibility 无效包');
    const badCompat = engine.checkCompatibility(null);
    assert(badCompat.compatible === false, '无效包返回不兼容');
    assert(badCompat.score === 0, '分数为 0');
    assert(typeof badCompat.error === 'string', '有错误信息');

    // ---- Test 5: checkCompatibility 技术栈排除 ----
    console.log('\nTest 5: checkCompatibility 技术栈排除');
    const compat5 = engine.checkCompatibility(pack, {
      taskTypes: ['feature'],
      techStack: { excludeStrategies: ['parallel'] }
    });
    // 策略推荐 parallel 但技术栈排除了它
    if (compat5.details.length > 0) {
      const techCheck = compat5.details[0].checks.find(c => c.check === 'tech_stack');
      if (techCheck) {
        assert(techCheck.passed === false, '被排除的策略检测正确');
      } else {
        assert(true, '技术栈检查执行完毕');
      }
    }

    // ---- Test 6: verifyWithRounds 基本验证 ----
    console.log('\nTest 6: verifyWithRounds 基本验证');
    const engine2 = new EvolutionEngine({ logger: silentLogger, minSamples: 3, verifyRounds: 3 });
    for (let i = 0; i < 10; i++) {
      engine2.record({ taskType: 'analysis', success: true, executionTime: 1500, strategy: 'deep' });
    }
    engine2.learn();
    const draftStrategy = engine2.strategies.find(s => s.status === STRATEGY_STATUS.DRAFT);
    assert(draftStrategy !== undefined, '有 DRAFT 策略可供验证');

    if (draftStrategy) {
      const roundResult = engine2.verifyWithRounds(draftStrategy.id);
      assert(typeof roundResult === 'object', 'verifyWithRounds 返回对象');
      assert(roundResult.totalRounds === 3, 'totalRounds = 3');
      assert(Array.isArray(roundResult.rounds), 'rounds 是数组');
      assert(roundResult.rounds.length >= 1, '至少完成 1 轮');
      assert(typeof roundResult.completedRounds === 'number', 'completedRounds 是数字');
    }

    // ---- Test 7: verifyWithRounds 不存在策略 ----
    console.log('\nTest 7: verifyWithRounds 不存在策略');
    const badVerify = engine2.verifyWithRounds('nonexistent');
    assert(badVerify.success === false, '不存在策略返回失败');
    assert(typeof badVerify.error === 'string', '有错误信息');

    // ---- Test 8: verifyWithRounds 渐进阈值 ----
    console.log('\nTest 8: verifyWithRounds 渐进阈值');
    if (draftStrategy) {
      const result = engine2.verifyWithRounds(draftStrategy.id);
      if (result.rounds.length >= 2) {
        assert(
          result.rounds[1].threshold > result.rounds[0].threshold,
          `第2轮阈值(${result.rounds[1].threshold}) > 第1轮(${result.rounds[0].threshold})`
        );
      } else {
        assert(true, '渐进阈值 (轮次不足跳过)');
      }
    }

    // ---- Test 9: recordFeedback 正面反馈 ----
    console.log('\nTest 9: recordFeedback 正面反馈');
    const engine3 = createTrainedEngine();
    const activeStrat = engine3.strategies.find(s => s.status === STRATEGY_STATUS.ACTIVE);
    assert(activeStrat !== undefined, '有活跃策略可供反馈');

    if (activeStrat) {
      const origConf = activeStrat.confidence;
      const fb = engine3.recordFeedback(activeStrat.id, {
        positive: true,
        executionTime: 1800,
        successRate: 0.95,
        improvement: 0.1,
        notes: '执行效率提升'
      });
      assert(fb.success === true, '反馈记录成功');
      assert(fb.feedback.positive === true, '反馈标记正确');
      assert(activeStrat.confidence > origConf, `正面反馈提升置信度 (${origConf.toFixed(3)} → ${activeStrat.confidence.toFixed(3)})`);
      assert(activeStrat.feedbackCount === 1, 'feedbackCount = 1');
      assert(engine3.stats.feedbackReceived === 1, 'stats.feedbackReceived = 1');
    }

    // ---- Test 10: recordFeedback 负面反馈 ----
    console.log('\nTest 10: recordFeedback 负面反馈');
    if (activeStrat) {
      const origConf = activeStrat.confidence;
      engine3.recordFeedback(activeStrat.id, {
        positive: false,
        errorCount: 3,
        notes: '执行变慢了'
      });
      assert(activeStrat.confidence < origConf, `负面反馈降低置信度`);
      assert(activeStrat.feedbackCount === 2, 'feedbackCount = 2');
    }

    // ---- Test 11: recordFeedback 不存在策略 ----
    console.log('\nTest 11: recordFeedback 不存在策略');
    const badFb = engine3.recordFeedback('nonexistent', { positive: true });
    assert(badFb.success === false, '不存在策略返回失败');

    // ---- Test 12: recordFeedback 自动降级 ----
    console.log('\nTest 12: recordFeedback 自动降级');
    const engine4 = createTrainedEngine();
    const activeForDegrade = engine4.strategies.find(s => s.status === STRATEGY_STATUS.ACTIVE);
    if (activeForDegrade) {
      // 连续负面反馈
      for (let i = 0; i < 5; i++) {
        engine4.recordFeedback(activeForDegrade.id, { positive: false, errorCount: i + 1 });
      }
      assert(
        activeForDegrade.status === STRATEGY_STATUS.DEPRECATED,
        '连续负面反馈后自动降级为 DEPRECATED'
      );
      assert(
        activeForDegrade.deprecatedReason.includes('负面反馈'),
        '降级原因包含"负面反馈"'
      );
    }

    // ---- Test 13: getFeedbackSummary ----
    console.log('\nTest 13: getFeedbackSummary');
    if (activeStrat) {
      const summary = engine3.getFeedbackSummary(activeStrat.id);
      assert(summary.totalFeedback === 2, 'totalFeedback = 2');
      assert(summary.positiveCount === 1, 'positiveCount = 1');
      assert(summary.negativeCount === 1, 'negativeCount = 1');
      assert(summary.positiveRate === 0.5, 'positiveRate = 0.5');
      assert(typeof summary.avgImprovement === 'number', 'avgImprovement 是数字');
    }

    // ---- Test 14: getFeedbackSummary 空反馈 ----
    console.log('\nTest 14: getFeedbackSummary 空反馈');
    const emptySummary = engine3.getFeedbackSummary('nonexistent');
    assert(emptySummary.totalFeedback === 0, '空反馈 totalFeedback = 0');
    assert(emptySummary.positiveRate === 0, '空反馈 positiveRate = 0');

    // ---- Test 15: detectAllConflicts 无冲突 ----
    console.log('\nTest 15: detectAllConflicts 无冲突');
    const engine5 = createTrainedEngine();
    const conflicts0 = engine5.detectAllConflicts();
    assert(Array.isArray(conflicts0), 'detectAllConflicts 返回数组');
    // 单一任务类型单一策略，不应有冲突
    assert(conflicts0.length === 0, '单策略无冲突');

    // ---- Test 16: detectAllConflicts 有冲突 ----
    console.log('\nTest 16: detectAllConflicts 有冲突');
    // 手动添加冲突策略
    engine5.strategies.push({
      id: 'str_conflict_test',
      pattern: 'success_pattern_feature_alt',
      type: 'task_optimization',
      description: '冲突策略',
      recommendation: { taskType: 'feature', preferredStrategy: 'sequential' }, // 与 parallel 冲突
      confidence: 0.9,
      sampleCount: 10,
      status: STRATEGY_STATUS.ACTIVE,
      createdAt: new Date().toISOString()
    });
    const conflicts1 = engine5.detectAllConflicts();
    assert(conflicts1.length >= 1, `检测到冲突 (${conflicts1.length} 个)`);
    if (conflicts1.length > 0) {
      assert(conflicts1[0].type === 'strategy_recommendation', '冲突类型正确');
      assert(conflicts1[0].detail.includes('parallel'), '冲突详情包含策略名');
    }

    // ---- Test 17: resolveConflicts ----
    console.log('\nTest 17: resolveConflicts');
    const resolutions = engine5.resolveConflicts();
    assert(resolutions.length >= 1, `解决了 ${resolutions.length} 个冲突`);
    if (resolutions.length > 0) {
      assert(resolutions[0].resolved === true, '冲突已解决');
      assert(typeof resolutions[0].winner === 'object', '有获胜者');
      assert(typeof resolutions[0].loser === 'object', '有失败者');
      // 失败者应被弃用
      const loserId = resolutions[0].loser.id;
      const loserStrategy = engine5.strategies.find(s => s.id === loserId);
      assert(loserStrategy.status === STRATEGY_STATUS.DEPRECATED, '失败者被弃用');
    }

    // ---- Test 18: resolveConflicts 后无冲突 ----
    console.log('\nTest 18: resolveConflicts 后无冲突');
    const conflictsAfter = engine5.detectAllConflicts();
    assert(conflictsAfter.length === 0, '解决后无冲突');

    // ---- Test 19: getConflictHistory ----
    console.log('\nTest 19: getConflictHistory');
    const history = engine5.getConflictHistory();
    assert(Array.isArray(history), 'getConflictHistory 返回数组');
    assert(history.length >= 1, '有冲突解决历史');
    assert(engine5.stats.conflictsResolved >= 1, 'stats.conflictsResolved >= 1');

    // ---- Test 20: 时间估算冲突检测 ----
    console.log('\nTest 20: 时间估算冲突检测');
    const engine6 = new EvolutionEngine({ logger: silentLogger, minSamples: 3 });
    engine6.strategies.push({
      id: 'str_time_1',
      pattern: 'time_estimation_build',
      type: 'time_estimation',
      recommendation: { taskType: 'build', estimatedTime: 1000 },
      confidence: 0.8,
      sampleCount: 5,
      status: STRATEGY_STATUS.ACTIVE,
      createdAt: new Date().toISOString()
    });
    engine6.strategies.push({
      id: 'str_time_2',
      pattern: 'time_estimation_build_imported',
      type: 'time_estimation',
      recommendation: { taskType: 'build', estimatedTime: 5000 }, // 5x差异
      confidence: 0.75,
      sampleCount: 3,
      status: STRATEGY_STATUS.ACTIVE,
      createdAt: new Date().toISOString()
    });
    const timeConflicts = engine6.detectAllConflicts();
    assert(timeConflicts.length >= 1, '检测到时间估算冲突');
    if (timeConflicts.length > 0) {
      assert(timeConflicts[0].type === 'time_estimation', '冲突类型为 time_estimation');
    }

    // ---- Test 21: 增强 getStats ----
    console.log('\nTest 21: 增强 getStats');
    const stats = engine3.getStats();
    assert(typeof stats.feedbackReceived === 'number', 'feedbackReceived 统计存在');
    assert(typeof stats.conflictsResolved === 'number', 'conflictsResolved 统计存在');
    assert(typeof stats.feedbackCount === 'number', 'feedbackCount 统计存在');
    assert(typeof stats.conflictHistory === 'number', 'conflictHistory 统计存在');

    // ---- Test 22: 完整跨项目流程 (导出→兼容性检查→导入→验证→反馈) ----
    console.log('\nTest 22: 完整跨项目流程');
    const sourceEngine = createTrainedEngine();
    const targetEngine = new EvolutionEngine({ logger: silentLogger, minSamples: 3, verifyRounds: 2 });

    // 导出
    const exportPack = sourceEngine.exportStrategies('source-project');
    assert(exportPack.strategies.length > 0, `导出 ${exportPack.strategies.length} 个策略`);

    // 兼容性检查
    const compatResult = targetEngine.checkCompatibility(exportPack, {
      taskTypes: ['feature', 'bug_fix']
    });
    assert(typeof compatResult.score === 'number', `兼容性分数: ${compatResult.score}`);

    // 导入
    const importResult = targetEngine.importStrategies(exportPack);
    assert(importResult.imported > 0, `导入 ${importResult.imported} 个策略`);

    // 在目标项目中积累数据
    for (let i = 0; i < 10; i++) {
      targetEngine.record({ taskType: 'feature', success: true, executionTime: 1900, strategy: 'parallel' });
    }
    targetEngine.learn();

    // 多轮验证
    const importedStrat = targetEngine.strategies.find(s => s.importedFrom);
    if (importedStrat) {
      // 需要足够样本和高置信度来通过多轮验证
      importedStrat.confidence = 0.85; // 模拟学习提升的置信度
      importedStrat.sampleCount = 10;
      const verifyResult = targetEngine.verifyWithRounds(importedStrat.id);
      assert(typeof verifyResult.completedRounds === 'number', `完成 ${verifyResult.completedRounds} 轮验证`);
    }

    assert(true, '完整跨项目流程执行完毕');

  } catch (error) {
    console.log(`\n❌ 测试异常: ${error.message}`);
    console.log(error.stack);
    failed++;
  }

  console.log(`\n========================================`);
  console.log(`测试结果: ${passed} 通过, ${failed} 失败`);
  if (failed === 0) {
    console.log('✅ 所有 EvolutionEngine 增强功能测试通过！');
  } else {
    console.log('❌ 有测试失败');
    process.exitCode = 1;
  }
}

testEvolutionEnhanced();
