const AgentRegistry = require('../src/agent-registry');
const AgentExecutor = require('../src/agent-executor');

async function testSelfHealingIntegration() {
  console.log('🧪 测试 SelfHealing 与 AgentExecutor 集成...\n');

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

  const registry = new AgentRegistry();
  registry.initializeCoreAgents();

  const executor = new AgentExecutor(registry, process.cwd(), {
    sandboxDir: '.flowharness/test-sandboxes',
    autoCleanup: true,
    useSandbox: false,
    defaultTimeout: 5000,
    enableLogging: false,
    enableLearning: true,
    minOccurrences: 3,
    enableAutoRetry: true,
    maxRetries: 3,
    retryBaseDelay: 50,
    retryMaxDelay: 500,
    retryJitter: false,
    circuitBreakerThreshold: 10,
    circuitBreakerResetTime: 1000,
    // 自愈配置
    enableSelfHealing: true,
    maxHealAttempts: 3,
    healCooldownTime: 100
  });

  try {
    // Test 1: 失败执行应触发自愈
    console.log('Test 1: 失败执行应触发自愈');
    const result1 = await executor.execute('explore', {
      action: 'read_file',
      filePath: '/nonexistent/heal-test.txt'
    }, {});
    assert(result1.success === false, '执行结果应为失败');
    assert(result1.healResult !== undefined, '应有自愈结果');
    console.log(`   自愈结果: ${result1.healResult.healed ? '成功' : '未成功'}`);
    if (result1.healResult.attempts && result1.healResult.attempts.length > 0) {
      console.log(`   尝试策略: ${result1.healResult.attempts.map(a => a.strategyId).join(', ')}`);
    }
    console.log('');

    // Test 2: 自愈统计可通过 executor 获取
    console.log('Test 2: 自愈统计');
    const healStats = executor.getHealStats();
    assert(healStats !== undefined, '应能获取自愈统计');
    assert(typeof healStats.totalHeals === 'number', '应有 totalHeals');
    assert(typeof healStats.healRate === 'string', '应有 healRate');
    assert(typeof healStats.totalStrategies === 'number', '应有 totalStrategies');
    console.log(`   总修复尝试: ${healStats.totalHeals}`);
    console.log(`   修复率: ${healStats.healRate}%`);
    console.log(`   策略总数: ${healStats.totalStrategies}`);
    console.log('');

    // Test 3: 自愈历史
    console.log('Test 3: 自愈历史');
    const healHistory = executor.getHealHistory();
    assert(Array.isArray(healHistory), '自愈历史应为数组');
    assert(healHistory.length > 0, `应有历史记录 (实际: ${healHistory.length})`);
    console.log(`   历史记录数: ${healHistory.length}`);
    console.log('');

    // Test 4: 获取策略列表
    console.log('Test 4: 获取策略列表');
    const strategies = executor.getHealStrategies();
    assert(Array.isArray(strategies), '策略列表应为数组');
    assert(strategies.length > 0, `应有策略 (实际: ${strategies.length})`);
    const fileStrategies = executor.getHealStrategies('file_not_found');
    assert(fileStrategies.length >= 1, 'file_not_found 应有策略');
    console.log(`   总策略数: ${strategies.length}`);
    console.log('');

    // Test 5: 注册自定义策略
    console.log('Test 5: 注册自定义策略');
    executor.registerHealStrategy('file_not_found', {
      id: 'custom_file_fix',
      name: '自定义文件修复',
      priority: 100,
      canHeal: () => true,
      heal: async () => ({ success: true, action: 'custom_fixed' })
    });
    const updatedStrategies = executor.getHealStrategies('file_not_found');
    const hasCustom = updatedStrategies.some(s => s.id === 'custom_file_fix');
    assert(hasCustom, '应注册自定义策略');
    console.log('');

    // Test 6: 自定义策略生效
    console.log('Test 6: 自定义策略生效');
    const result6 = await executor.execute('explore', {
      action: 'read_file',
      filePath: '/nonexistent/custom-heal.txt'
    }, {});
    assert(result6.healResult !== undefined, '应有自愈结果');
    assert(result6.healResult.healed === true, '自定义策略应修复成功');
    assert(result6.healResult.healedBy === 'custom_file_fix', '应由自定义策略修复');
    console.log('');

    // Test 7: 禁用自愈时不触发
    console.log('Test 7: 禁用自愈时不触发');
    const noHealExecutor = new AgentExecutor(registry, process.cwd(), {
      sandboxDir: '.flowharness/test-sandboxes',
      autoCleanup: true,
      useSandbox: false,
      defaultTimeout: 5000,
      enableLogging: false,
      enableAutoRetry: false,
      enableSelfHealing: false
    });
    const result7 = await noHealExecutor.execute('explore', {
      action: 'read_file',
      filePath: '/nonexistent/no-heal.txt'
    }, {});
    assert(result7.success === false, '执行应失败');
    assert(result7.healResult === undefined, '禁用时不应有 healResult');
    console.log('');

    // Test 8: 成功执行不触发自愈
    console.log('Test 8: 成功执行不触发自愈');
    const result8 = await executor.execute('explore', {
      action: 'file_search',
      pattern: '*.js',
      cwd: process.cwd()
    }, {});
    assert(result8.success === true, '文件搜索应成功');
    assert(result8.healResult === undefined, '成功执行不应有 healResult');
    console.log('');

    // Test 9: 多次失败后的统计一致性
    console.log('Test 9: 多次失败后的统计一致性');
    for (let i = 0; i < 3; i++) {
      await executor.execute('explore', {
        action: 'read_file',
        filePath: `/missing/stats_${i}.txt`
      }, {});
    }
    const finalHealStats = executor.getHealStats();
    const finalErrorStats = executor.getErrorStats();
    assert(finalHealStats.totalHeals > 0, `应有修复记录 (实际: ${finalHealStats.totalHeals})`);
    assert(finalErrorStats.totalErrors > 0, `应有错误记录 (实际: ${finalErrorStats.totalErrors})`);
    console.log(`   错误总数: ${finalErrorStats.totalErrors}`);
    console.log(`   修复尝试: ${finalHealStats.totalHeals}`);
    console.log(`   修复率: ${finalHealStats.healRate}%`);
    console.log('');

    // Test 10: 综合统计
    console.log('Test 10: 综合统计');
    const execStats = executor.getExecutionStats();
    const retryStats = executor.getRetryStats();
    console.log(`   执行统计:`);
    console.log(`     总执行数: ${execStats.totalExecutions}`);
    console.log(`     成功率: ${execStats.successRate}%`);
    console.log(`   重试统计:`);
    console.log(`     总操作数: ${retryStats.totalOperations}`);
    console.log(`   自愈统计:`);
    console.log(`     总修复: ${finalHealStats.totalHeals}`);
    console.log(`     修复率: ${finalHealStats.healRate}%`);
    console.log(`     策略数: ${finalHealStats.totalStrategies}`);
    assert(execStats.totalExecutions > 0, '应有执行记录');
    console.log('');

    // 总结
    console.log('='.repeat(50));
    console.log(`\n测试结果: ${passed} 通过, ${failed} 失败`);
    console.log(`总计: ${passed + failed} 个断言\n`);

    if (failed > 0) {
      console.log('❌ 部分集成测试失败！\n');
      return false;
    }

    console.log('✅ 所有集成测试通过！\n');
    return true;

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error(error.stack);
    return false;
  }
}

testSelfHealingIntegration()
  .then(success => process.exit(success ? 0 : 1))
  .catch(error => {
    console.error('💥 测试异常:', error);
    process.exit(1);
  });
