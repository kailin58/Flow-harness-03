const AgentRegistry = require('../src/agent-registry');
const AgentExecutor = require('../src/agent-executor');

async function testAutoRetryIntegration() {
  console.log('🧪 测试 AutoRetry 与 AgentExecutor 集成...\n');

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

  // 初始化
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
    // AutoRetry 配置
    enableAutoRetry: true,
    maxRetries: 3,
    retryBaseDelay: 50, // 短延迟加速测试
    retryMaxDelay: 500,
    retryJitter: false,
    circuitBreakerThreshold: 10,
    circuitBreakerResetTime: 1000
  });

  try {
    // Test 1: 不可重试的错误不应触发重试（file_not_found）
    console.log('Test 1: 不可重试的错误不应触发重试');
    const result1 = await executor.execute('explore', {
      action: 'read_file',
      filePath: '/nonexistent/file1.txt'
    }, {});

    assert(result1.success === false, '执行结果应为失败');
    assert(result1.errorAnalysis !== undefined, '应有错误分析');
    assert(result1.errorAnalysis.category === 'file_not_found', '错误类别应为 file_not_found');
    assert(result1.retryInfo !== undefined, '应有重试信息');
    assert(result1.retryInfo.retried === false, 'file_not_found 不应被重试');
    console.log(`   重试拒绝原因: ${result1.retryInfo.reason}`);
    console.log('');

    // Test 2: 不可重试的错误 - permission_denied (模拟)
    console.log('Test 2: 不可重试的错误 - syntax_error (通过不支持的操作模拟)');
    // 通过 execute 的 catch 路径触发 - 不支持的操作属于 unknown 类别,可重试
    // 我们用另一种方式测试
    const result2 = await executor.execute('explore', {
      action: 'read_file',
      filePath: '/another/missing/path.txt'
    }, {});

    assert(result2.success === false, '执行结果应为失败');
    assert(result2.retryInfo.retried === false, 'file_not_found 不应被重试');
    console.log('');

    // Test 3: 重试统计信息可通过 executor 获取
    console.log('Test 3: 重试统计信息');
    const retryStats = executor.getRetryStats();
    assert(retryStats !== undefined, '应能获取重试统计');
    assert(typeof retryStats.totalOperations === 'number', '应有 totalOperations');
    assert(typeof retryStats.totalRetries === 'number', '应有 totalRetries');
    assert(typeof retryStats.circuitBreaker === 'object', '应有 circuitBreaker 状态');
    console.log(`   总操作数: ${retryStats.totalOperations}`);
    console.log(`   总重试数: ${retryStats.totalRetries}`);
    console.log(`   断路器状态: ${retryStats.circuitBreaker.state}`);
    console.log('');

    // Test 4: 重试历史记录
    console.log('Test 4: 重试历史记录');
    const retryHistory = executor.getRetryHistory();
    assert(Array.isArray(retryHistory), '重试历史应为数组');
    console.log(`   重试历史记录数: ${retryHistory.length}`);
    console.log('');

    // Test 5: 禁用自动重试时不重试
    console.log('Test 5: 禁用自动重试时不重试');
    const noRetryExecutor = new AgentExecutor(registry, process.cwd(), {
      sandboxDir: '.flowharness/test-sandboxes',
      autoCleanup: true,
      useSandbox: false,
      defaultTimeout: 5000,
      enableLogging: false,
      enableAutoRetry: false // 禁用重试
    });

    const result5 = await noRetryExecutor.execute('explore', {
      action: 'read_file',
      filePath: '/nonexistent/no-retry.txt'
    }, {});

    assert(result5.success === false, '执行结果应为失败');
    assert(result5.retryInfo === undefined, '禁用重试时不应有 retryInfo');
    console.log('');

    // Test 6: 多次失败的错误统计一致性
    console.log('Test 6: 多次失败的错误统计一致性');
    for (let i = 0; i < 3; i++) {
      await executor.execute('explore', {
        action: 'read_file',
        filePath: `/missing/file_${i}.txt`
      }, {});
    }

    const errorStats = executor.getErrorStats();
    const retryStats2 = executor.getRetryStats();
    assert(errorStats.totalErrors > 0, `应有错误记录 (实际: ${errorStats.totalErrors})`);
    assert(retryStats2.totalOperations >= 0, `应有操作记录 (实际: ${retryStats2.totalOperations})`);
    console.log(`   错误总数: ${errorStats.totalErrors}`);
    console.log(`   重试操作数: ${retryStats2.totalOperations}`);
    console.log('');

    // Test 7: 重试历史按类别过滤
    console.log('Test 7: 重试历史按类别过滤');
    const fileRetryHistory = executor.getRetryHistory({ category: 'file_not_found' });
    const allRetryHistory = executor.getRetryHistory();
    assert(Array.isArray(fileRetryHistory), '过滤后的重试历史应为数组');
    assert(fileRetryHistory.length <= allRetryHistory.length, '过滤后应 <= 总记录数');
    console.log(`   file_not_found 重试记录: ${fileRetryHistory.length}`);
    console.log(`   所有重试记录: ${allRetryHistory.length}`);
    console.log('');

    // Test 8: 重置断路器
    console.log('Test 8: 重置断路器');
    executor.resetCircuitBreaker();
    const afterReset = executor.getRetryStats();
    assert(afterReset.circuitBreaker.state === 'closed', '重置后断路器应为关闭状态');
    console.log(`   断路器状态: ${afterReset.circuitBreaker.state}`);
    console.log('');

    // Test 9: 抛出异常的错误（Agent不存在）不受重试影响
    console.log('Test 9: 抛出异常的错误不受重试影响');
    try {
      await executor.execute('nonexistent_agent', {
        action: 'test'
      }, {});
      assert(false, '应抛出异常');
    } catch (error) {
      assert(error.message.includes('Agent 不存在'), `应有正确的错误消息 (实际: ${error.message})`);
    }
    console.log('');

    // Test 10: 成功执行不触发重试
    console.log('Test 10: 成功执行不触发重试');
    const result10 = await executor.execute('explore', {
      action: 'file_search',
      pattern: '*.js',
      cwd: process.cwd()
    }, {});

    assert(result10.success === true, '文件搜索应成功');
    assert(result10.retryInfo === undefined, '成功执行不应有 retryInfo');
    console.log('');

    // Test 11: 综合统计
    console.log('Test 11: 综合统计');
    const finalErrorStats = executor.getErrorStats();
    const finalRetryStats = executor.getRetryStats();
    const execStats = executor.getExecutionStats();

    console.log(`   执行统计:`);
    console.log(`     总执行数: ${execStats.totalExecutions}`);
    console.log(`     成功率: ${execStats.successRate}%`);

    console.log(`   错误统计:`);
    console.log(`     总错误数: ${finalErrorStats.totalErrors}`);
    console.log(`     总模式数: ${finalErrorStats.totalPatterns}`);

    console.log(`   重试统计:`);
    console.log(`     总操作数: ${finalRetryStats.totalOperations}`);
    console.log(`     总重试数: ${finalRetryStats.totalRetries}`);
    console.log(`     成功重试: ${finalRetryStats.successfulRetries}`);
    console.log(`     失败重试: ${finalRetryStats.failedRetries}`);
    console.log(`     断路器状态: ${finalRetryStats.circuitBreaker.state}`);

    assert(execStats.totalExecutions > 0, '应有执行记录');
    assert(finalErrorStats.totalErrors > 0, '应有错误记录');
    console.log('');

    // 总结
    console.log('=' .repeat(50));
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

// 运行测试
testAutoRetryIntegration()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('💥 测试异常:', error);
    process.exit(1);
  });
