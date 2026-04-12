const SelfHealing = require('../src/self-healing');

async function testSelfHealing() {
  console.log('🧪 测试 SelfHealing...\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`  ✅ ${testName}`);
      passed++;
    } else {
      console.log(`  ❌ ${testName}`);
      failed++;
    }
  }

  try {
    // Test 1: 基本初始化
    console.log('Test 1: 基本初始化');
    const healer = new SelfHealing({
      cooldownTime: 100, // 短冷却加速测试
      healTimeout: 5000
    });
    assert(healer.config.enabled === true, '默认启用');
    assert(healer.config.maxHealAttempts === 3, '默认最大尝试3次');
    const allStrategies = healer.getStrategies();
    assert(allStrategies.length > 0, `应有内置策略 (实际: ${allStrategies.length})`);
    console.log('');

    // Test 2: 内置策略注册
    console.log('Test 2: 内置策略注册');
    const fileStrategies = healer.getStrategies('file_not_found');
    assert(fileStrategies.length >= 1, 'file_not_found 应有策略');
    const depStrategies = healer.getStrategies('dependency_error');
    assert(depStrategies.length >= 1, 'dependency_error 应有策略');
    const timeoutStrategies = healer.getStrategies('timeout');
    assert(timeoutStrategies.length >= 1, 'timeout 应有策略');
    const permStrategies = healer.getStrategies('permission_denied');
    assert(permStrategies.length >= 1, 'permission_denied 应有策略');
    const configStrategies = healer.getStrategies('configuration_error');
    assert(configStrategies.length >= 1, 'configuration_error 应有策略');
    console.log('');

    // Test 3: 自定义策略注册
    console.log('Test 3: 自定义策略注册');
    healer.registerStrategy('custom_error', {
      id: 'custom_fix',
      name: '自定义修复',
      description: '测试用自定义策略',
      priority: 20,
      canHeal: () => true,
      heal: async () => ({ success: true, action: 'custom_fixed' })
    });
    const customStrategies = healer.getStrategies('custom_error');
    assert(customStrategies.length === 1, '应注册自定义策略');
    assert(customStrategies[0].id === 'custom_fix', '策略ID正确');
    assert(customStrategies[0].priority === 20, '优先级正确');
    console.log('');

    // Test 4: 策略注册验证
    console.log('Test 4: 策略注册验证');
    try {
      healer.registerStrategy('test', { id: null, heal: null });
      assert(false, '应拒绝无效策略');
    } catch (e) {
      assert(true, '正确拒绝无效策略');
    }
    console.log('');

    // Test 5: 移除策略
    console.log('Test 5: 移除策略');
    healer.registerStrategy('removable', {
      id: 'to_remove',
      heal: async () => ({ success: true })
    });
    assert(healer.getStrategies('removable').length === 1, '注册成功');
    const removed = healer.removeStrategy('removable', 'to_remove');
    assert(removed === true, '移除成功');
    assert(healer.getStrategies('removable').length === 0, '移除后为空');
    const removeFail = healer.removeStrategy('nonexistent', 'nope');
    assert(removeFail === false, '移除不存在的策略返回 false');
    console.log('');

    // Test 6: 成功修复
    console.log('Test 6: 成功修复');
    const healResult = await healer.attemptHeal({
      category: 'custom_error',
      message: 'test error',
      features: {}
    });
    assert(healResult.healed === true, '修复成功');
    assert(healResult.healedBy === 'custom_fix', '由 custom_fix 修复');
    assert(healResult.attempts.length === 1, '尝试1次');
    assert(healResult.attempts[0].success === true, '尝试结果为成功');
    console.log('');

    // Test 7: 无策略的类别
    console.log('Test 7: 无策略的类别');
    const noStrategyResult = await healer.attemptHeal({
      category: 'totally_unknown_category',
      message: 'unknown',
      features: {}
    });
    assert(noStrategyResult.healed === false, '无策略时不修复');
    assert(noStrategyResult.reason.includes('无'), '有原因说明');
    console.log('');

    // Test 8: 禁用自愈
    console.log('Test 8: 禁用自愈');
    const disabledHealer = new SelfHealing({ enabled: false });
    const disabledResult = await disabledHealer.attemptHeal({
      category: 'timeout',
      message: 'timeout',
      features: {}
    });
    assert(disabledResult.healed === false, '禁用时不修复');
    assert(disabledResult.reason.includes('禁用'), '原因包含禁用');
    console.log('');

    // Test 9: 修复失败
    console.log('Test 9: 修复失败');
    const failHealer = new SelfHealing({ cooldownTime: 0 });
    failHealer.registerStrategy('fail_test', {
      id: 'always_fail',
      priority: 10,
      heal: async () => ({ success: false, reason: '模拟失败' })
    });
    const failResult = await failHealer.attemptHeal({
      category: 'fail_test',
      message: 'test',
      features: {}
    });
    assert(failResult.healed === false, '修复失败');
    assert(failResult.attempts.length === 1, '尝试了1次');
    assert(failResult.attempts[0].success === false, '尝试结果为失败');
    console.log('');

    // Test 10: 修复抛出异常
    console.log('Test 10: 修复抛出异常');
    const throwHealer = new SelfHealing({ cooldownTime: 0 });
    throwHealer.registerStrategy('throw_test', {
      id: 'throws',
      priority: 10,
      heal: async () => { throw new Error('修复崩溃'); }
    });
    const throwResult = await throwHealer.attemptHeal({
      category: 'throw_test',
      message: 'test',
      features: {}
    });
    assert(throwResult.healed === false, '异常时不算修复成功');
    assert(throwResult.attempts[0].error === '修复崩溃', '记录了异常信息');
    console.log('');

    // Test 11: 多策略优先级
    console.log('Test 11: 多策略优先级');
    const multiHealer = new SelfHealing({ cooldownTime: 0 });
    const executionOrder = [];
    multiHealer.registerStrategy('multi_test', {
      id: 'low_priority',
      priority: 1,
      heal: async () => { executionOrder.push('low'); return { success: true }; }
    });
    multiHealer.registerStrategy('multi_test', {
      id: 'high_priority',
      priority: 100,
      heal: async () => { executionOrder.push('high'); return { success: true }; }
    });
    await multiHealer.attemptHeal({
      category: 'multi_test',
      message: 'test',
      features: {}
    });
    assert(executionOrder[0] === 'high', '高优先级先执行');
    assert(executionOrder.length === 1, '成功后不再尝试低优先级');
    console.log('');

    // Test 12: 多策略回退
    console.log('Test 12: 多策略回退');
    const fallbackHealer = new SelfHealing({ cooldownTime: 0 });
    const fbOrder = [];
    fallbackHealer.registerStrategy('fallback_test', {
      id: 'first_fails',
      priority: 100,
      heal: async () => { fbOrder.push('first'); return { success: false }; }
    });
    fallbackHealer.registerStrategy('fallback_test', {
      id: 'second_succeeds',
      priority: 50,
      heal: async () => { fbOrder.push('second'); return { success: true }; }
    });
    const fbResult = await fallbackHealer.attemptHeal({
      category: 'fallback_test',
      message: 'test',
      features: {}
    });
    assert(fbOrder.length === 2, '尝试了两个策略');
    assert(fbOrder[0] === 'first', '先尝试高优先级');
    assert(fbOrder[1] === 'second', '回退到低优先级');
    assert(fbResult.healed === true, '最终修复成功');
    assert(fbResult.healedBy === 'second_succeeds', '由第二个策略修复');
    console.log('');

    // Test 13: canHeal 过滤
    console.log('Test 13: canHeal 过滤');
    const filterHealer = new SelfHealing({ cooldownTime: 0 });
    filterHealer.registerStrategy('filter_test', {
      id: 'filtered_out',
      priority: 100,
      canHeal: (info) => info.message === 'match_me',
      heal: async () => ({ success: true })
    });
    const noMatchResult = await filterHealer.attemptHeal({
      category: 'filter_test',
      message: 'no_match',
      features: {}
    });
    assert(noMatchResult.healed === false, 'canHeal 返回 false 时跳过');
    const matchResult = await filterHealer.attemptHeal({
      category: 'filter_test',
      message: 'match_me',
      features: {}
    });
    assert(matchResult.healed === true, 'canHeal 返回 true 时执行');
    console.log('');

    // Test 14: 最大尝试次数限制
    console.log('Test 14: 最大尝试次数限制');
    const limitHealer = new SelfHealing({ cooldownTime: 0, maxHealAttempts: 2 });
    let limitCount = 0;
    for (let i = 0; i < 5; i++) {
      limitHealer.registerStrategy('limit_test', {
        id: `strategy_${i}`,
        priority: 10 - i,
        heal: async () => { limitCount++; return { success: false }; }
      });
    }
    await limitHealer.attemptHeal({
      category: 'limit_test',
      message: 'test',
      features: {}
    });
    assert(limitCount === 2, `最多尝试2次 (实际: ${limitCount})`);
    console.log('');

    // Test 15: 冷却机制
    console.log('Test 15: 冷却机制');
    const cdHealer = new SelfHealing({ cooldownTime: 500 });
    let cdCount = 0;
    cdHealer.registerStrategy('cd_test', {
      id: 'cd_strategy',
      priority: 10,
      heal: async () => { cdCount++; return { success: false }; }
    });
    await cdHealer.attemptHeal({ category: 'cd_test', message: 'test', features: {} });
    assert(cdCount === 1, '第一次执行');
    await cdHealer.attemptHeal({ category: 'cd_test', message: 'test', features: {} });
    assert(cdCount === 1, '冷却期内不再执行');
    console.log('');

    // Test 16: 清除冷却
    console.log('Test 16: 清除冷却');
    cdHealer.clearCooldowns('cd_test');
    await cdHealer.attemptHeal({ category: 'cd_test', message: 'test', features: {} });
    assert(cdCount === 2, '清除冷却后可再次执行');
    cdHealer.clearCooldowns(); // 清除所有
    console.log('');

    // Test 17: 修复历史
    console.log('Test 17: 修复历史');
    const history = healer.getHealHistory();
    assert(history.length > 0, `应有修复历史 (实际: ${history.length})`);
    const healedHistory = healer.getHealHistory({ healed: true });
    assert(healedHistory.length > 0, '应有成功修复记录');
    console.log('');

    // Test 18: 统计信息
    console.log('Test 18: 统计信息');
    const stats = healer.getStats();
    assert(stats.totalHeals > 0, `应有修复记录 (实际: ${stats.totalHeals})`);
    assert(typeof stats.healRate === 'string', '应有修复率');
    assert(typeof stats.totalStrategies === 'number', '应有策略总数');
    assert(typeof stats.byCategory === 'object', '应有分类统计');
    console.log(`   修复率: ${stats.healRate}%`);
    console.log(`   策略总数: ${stats.totalStrategies}`);
    console.log('');

    // Test 19: 策略学习（低成功率降级）
    console.log('Test 19: 策略学习（低成功率降级）');
    const learnHealer = new SelfHealing({
      cooldownTime: 0,
      enableLearning: true,
      minSuccessRate: 0.3
    });
    learnHealer.registerStrategy('learn_test', {
      id: 'bad_strategy',
      priority: 100,
      heal: async () => ({ success: false })
    });
    learnHealer.registerStrategy('learn_test', {
      id: 'good_strategy',
      priority: 50,
      heal: async () => ({ success: true })
    });
    // 让 bad_strategy 积累足够的失败记录
    for (let i = 0; i < 6; i++) {
      await learnHealer.attemptHeal({ category: 'learn_test', message: 'test', features: {} });
    }
    // bad_strategy 成功率为 0，应被跳过
    const learnStrategies = learnHealer.getStrategies('learn_test');
    const badStrategy = learnStrategies.find(s => s.id === 'bad_strategy');
    assert(badStrategy.successRate < 0.3, `低成功率策略 (${badStrategy.successRate.toFixed(2)})`);
    console.log('');

    // Test 20: 修复超时
    console.log('Test 20: 修复超时');
    const toHealer = new SelfHealing({ cooldownTime: 0, healTimeout: 100 });
    toHealer.registerStrategy('to_test', {
      id: 'slow_fix',
      priority: 10,
      heal: async () => {
        await new Promise(r => setTimeout(r, 500));
        return { success: true };
      }
    });
    const toResult = await toHealer.attemptHeal({
      category: 'to_test',
      message: 'test',
      features: {}
    });
    assert(toResult.healed === false, '超时的修复不算成功');
    assert(toResult.attempts[0].error.includes('超时'), '记录超时错误');
    console.log('');

    // Test 21: 清理历史
    console.log('Test 21: 清理历史');
    const beforeCount = healer.getHealHistory().length;
    const cleared = healer.clearHistory(1);
    const afterCount = healer.getHealHistory().length;
    assert(cleared >= 0, `清理了 ${cleared} 条记录`);
    assert(afterCount <= 1, `清理后最多1条 (实际: ${afterCount})`);
    console.log('');

    // Test 22: timeout 内置策略
    console.log('Test 22: timeout 内置策略');
    const timeoutHealer = new SelfHealing({ cooldownTime: 0 });
    const timeoutResult = await timeoutHealer.attemptHeal({
      category: 'timeout',
      message: 'execution timeout',
      features: {}
    }, { timeout: 30000 });
    assert(timeoutResult.healed === true, 'timeout 策略应成功');
    assert(timeoutResult.attempts[0].result.action === 'suggest_timeout_increase', '应建议增加超时');
    assert(timeoutResult.attempts[0].result.suggestedTimeout === 60000, '建议超时为原来2倍');
    console.log('');

    // Test 23: 策略覆盖（同ID更新）
    console.log('Test 23: 策略覆盖（同ID更新）');
    const overrideHealer = new SelfHealing({ cooldownTime: 0 });
    overrideHealer.registerStrategy('override_test', {
      id: 'same_id',
      priority: 10,
      heal: async () => ({ success: false })
    });
    overrideHealer.registerStrategy('override_test', {
      id: 'same_id',
      priority: 20,
      heal: async () => ({ success: true, action: 'overridden' })
    });
    const overrideStrategies = overrideHealer.getStrategies('override_test');
    assert(overrideStrategies.length === 1, '同ID策略应覆盖而非新增');
    assert(overrideStrategies[0].priority === 20, '优先级已更新');
    console.log('');

    // 总结
    console.log('='.repeat(50));
    console.log(`\n测试结果: ${passed} 通过, ${failed} 失败`);
    console.log(`总计: ${passed + failed} 个断言\n`);

    if (failed > 0) {
      console.log('❌ 部分测试失败！\n');
      return false;
    }

    console.log('✅ 所有测试通过！\n');
    return true;

  } catch (error) {
    console.error('❌ 测试异常:', error.message);
    console.error(error.stack);
    return false;
  }
}

testSelfHealing()
  .then(success => process.exit(success ? 0 : 1))
  .catch(error => {
    console.error('💥 测试异常:', error);
    process.exit(1);
  });
