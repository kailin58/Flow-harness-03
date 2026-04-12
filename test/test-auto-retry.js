const AutoRetry = require('../src/auto-retry');

async function testAutoRetry() {
  console.log('🧪 测试 AutoRetry...\n');

  const retry = new AutoRetry({
    maxRetries: 3,
    backoffStrategy: 'exponential',
    baseDelay: 100, // 使用短延迟加速测试
    maxDelay: 2000,
    backoffMultiplier: 2,
    jitter: false, // 禁用抖动以便测试可预测
    circuitBreakerThreshold: 5,
    circuitBreakerResetTime: 500 // 短恢复时间加速测试
  });

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
    // Test 1: 可重试错误类别判断
    console.log('Test 1: 可重试错误类别判断');
    const timeoutDecision = retry.shouldRetry('timeout', { attempt: 0 });
    assert(timeoutDecision.shouldRetry === true, 'timeout 应该可重试');

    const networkDecision = retry.shouldRetry('network_error', { attempt: 0 });
    assert(networkDecision.shouldRetry === true, 'network_error 应该可重试');

    const resourceDecision = retry.shouldRetry('resource_exhausted', { attempt: 0 });
    assert(resourceDecision.shouldRetry === true, 'resource_exhausted 应该可重试');

    const unknownDecision = retry.shouldRetry('unknown', { attempt: 0 });
    assert(unknownDecision.shouldRetry === true, 'unknown 应该可重试');
    console.log('');

    // Test 2: 不可重试错误类别判断
    console.log('Test 2: 不可重试错误类别判断');
    const fileDecision = retry.shouldRetry('file_not_found', { attempt: 0 });
    assert(fileDecision.shouldRetry === false, 'file_not_found 不应重试');

    const permDecision = retry.shouldRetry('permission_denied', { attempt: 0 });
    assert(permDecision.shouldRetry === false, 'permission_denied 不应重试');

    const syntaxDecision = retry.shouldRetry('syntax_error', { attempt: 0 });
    assert(syntaxDecision.shouldRetry === false, 'syntax_error 不应重试');

    const typeDecision = retry.shouldRetry('type_error', { attempt: 0 });
    assert(typeDecision.shouldRetry === false, 'type_error 不应重试');

    const refDecision = retry.shouldRetry('reference_error', { attempt: 0 });
    assert(refDecision.shouldRetry === false, 'reference_error 不应重试');

    const configDecision = retry.shouldRetry('configuration_error', { attempt: 0 });
    assert(configDecision.shouldRetry === false, 'configuration_error 不应重试');

    const depDecision = retry.shouldRetry('dependency_error', { attempt: 0 });
    assert(depDecision.shouldRetry === false, 'dependency_error 不应重试');
    console.log('');

    // Test 3: 最大重试次数限制
    console.log('Test 3: 最大重试次数限制');
    const attempt0 = retry.shouldRetry('timeout', { attempt: 0 });
    assert(attempt0.shouldRetry === true, '第0次尝试应可重试');

    const attempt2 = retry.shouldRetry('timeout', { attempt: 2 });
    assert(attempt2.shouldRetry === true, '第2次尝试应可重试 (timeout maxRetries=3)');

    const attempt3 = retry.shouldRetry('timeout', { attempt: 3 });
    assert(attempt3.shouldRetry === false, '第3次尝试不应重试 (已达最大)');
    console.log('');

    // Test 4: 延迟计算 - 指数退避
    console.log('Test 4: 延迟计算 - 指数退避');
    const delay0 = retry.calculateDelay(0, { backoffStrategy: 'exponential', baseDelay: 100 });
    assert(delay0 === 100, `第0次延迟应为 100ms (实际: ${delay0}ms)`);

    const delay1 = retry.calculateDelay(1, { backoffStrategy: 'exponential', baseDelay: 100 });
    assert(delay1 === 200, `第1次延迟应为 200ms (实际: ${delay1}ms)`);

    const delay2 = retry.calculateDelay(2, { backoffStrategy: 'exponential', baseDelay: 100 });
    assert(delay2 === 400, `第2次延迟应为 400ms (实际: ${delay2}ms)`);
    console.log('');

    // Test 5: 延迟计算 - 固定间隔
    console.log('Test 5: 延迟计算 - 固定间隔');
    const fixedDelay0 = retry.calculateDelay(0, { backoffStrategy: 'fixed', baseDelay: 100 });
    assert(fixedDelay0 === 100, `固定延迟应为 100ms (实际: ${fixedDelay0}ms)`);

    const fixedDelay3 = retry.calculateDelay(3, { backoffStrategy: 'fixed', baseDelay: 100 });
    assert(fixedDelay3 === 100, `固定延迟应始终为 100ms (实际: ${fixedDelay3}ms)`);
    console.log('');

    // Test 6: 延迟计算 - 线性增长
    console.log('Test 6: 延迟计算 - 线性增长');
    const linearDelay0 = retry.calculateDelay(0, { backoffStrategy: 'linear', baseDelay: 100 });
    assert(linearDelay0 === 100, `线性第0次延迟应为 100ms (实际: ${linearDelay0}ms)`);

    const linearDelay2 = retry.calculateDelay(2, { backoffStrategy: 'linear', baseDelay: 100 });
    assert(linearDelay2 === 300, `线性第2次延迟应为 300ms (实际: ${linearDelay2}ms)`);
    console.log('');

    // Test 7: 最大延迟限制
    console.log('Test 7: 最大延迟限制');
    const cappedDelay = retry.calculateDelay(10, { backoffStrategy: 'exponential', baseDelay: 100 });
    assert(cappedDelay <= retry.config.maxDelay, `延迟应不超过 ${retry.config.maxDelay}ms (实际: ${cappedDelay}ms)`);
    console.log('');

    // Test 8: 成功操作（无需重试）
    console.log('Test 8: 成功操作（无需重试）');
    let callCount8 = 0;
    const result8 = await retry.executeWithRetry(async (attempt) => {
      callCount8++;
      return { data: 'success' };
    }, { category: 'timeout' });

    assert(result8.success === true, '操作应成功');
    assert(result8.attempts === 1, `应只尝试1次 (实际: ${result8.attempts})`);
    assert(result8.retried === false, '不应标记为重试过');
    assert(callCount8 === 1, `回调应调用1次 (实际: ${callCount8})`);
    console.log('');

    // Test 9: 失败后重试成功
    console.log('Test 9: 失败后重试成功');
    let callCount9 = 0;
    const result9 = await retry.executeWithRetry(async (attempt) => {
      callCount9++;
      if (attempt < 2) {
        throw new Error('Network timeout');
      }
      return { data: 'recovered' };
    }, { category: 'timeout' });

    assert(result9.success === true, '操作最终应成功');
    assert(result9.attempts === 3, `应尝试3次 (实际: ${result9.attempts})`);
    assert(result9.retried === true, '应标记为重试过');
    assert(callCount9 === 3, `回调应调用3次 (实际: ${callCount9})`);
    console.log('');

    // Test 10: 不可重试的错误类别
    console.log('Test 10: 不可重试的错误类别');
    let callCount10 = 0;
    const result10 = await retry.executeWithRetry(async (attempt) => {
      callCount10++;
      throw new Error('File not found');
    }, { category: 'file_not_found' });

    assert(result10.success === false, '操作应失败');
    assert(result10.attempts === 1, `不可重试类别应只尝试1次 (实际: ${result10.attempts})`);
    assert(callCount10 === 1, `回调应调用1次 (实际: ${callCount10})`);
    console.log('');

    // Test 11: 达到最大重试次数后失败
    console.log('Test 11: 达到最大重试次数后失败');
    let callCount11 = 0;
    const result11 = await retry.executeWithRetry(async (attempt) => {
      callCount11++;
      throw new Error('Network error');
    }, { category: 'network_error', maxRetries: 3 });

    assert(result11.success === false, '操作应最终失败');
    assert(result11.attempts <= 4, `最多尝试4次 (实际: ${result11.attempts})`);
    assert(callCount11 <= 4, `回调最多调用4次 (实际: ${callCount11})`);
    console.log('');

    // Test 12: 重试回调通知
    console.log('Test 12: 重试回调通知');
    const retryNotifications = [];
    await retry.executeWithRetry(async (attempt) => {
      if (attempt < 1) {
        throw new Error('Temporary error');
      }
      return { data: 'ok' };
    }, {
      category: 'timeout',
      onRetry: async (info) => {
        retryNotifications.push(info);
      }
    });

    assert(retryNotifications.length === 1, `应收到1次重试通知 (实际: ${retryNotifications.length})`);
    if (retryNotifications.length > 0) {
      assert(retryNotifications[0].attempt === 0, `重试通知应包含 attempt=0`);
      assert(retryNotifications[0].delay > 0, `重试通知应包含正延迟`);
    }
    console.log('');

    // Test 13: 重试历史记录
    console.log('Test 13: 重试历史记录');
    const history = retry.getRetryHistory();
    assert(history.length > 0, `应有重试历史记录 (实际: ${history.length}条)`);

    const retriedHistory = retry.getRetryHistory({ retried: true });
    assert(retriedHistory.length > 0, `应有重试过的记录`);

    const successHistory = retry.getRetryHistory({ success: true });
    assert(successHistory.length > 0, `应有成功的记录`);

    const failedHistory = retry.getRetryHistory({ success: false });
    assert(failedHistory.length > 0, `应有失败的记录`);
    console.log('');

    // Test 14: 统计信息
    console.log('Test 14: 统计信息');
    const stats = retry.getStats();
    assert(stats.totalOperations > 0, `应有操作记录 (实际: ${stats.totalOperations})`);
    assert(stats.totalRetries > 0, `应有重试记录 (实际: ${stats.totalRetries})`);
    assert(stats.successfulRetries > 0, `应有成功重试 (实际: ${stats.successfulRetries})`);
    assert(stats.failedRetries > 0, `应有失败重试 (实际: ${stats.failedRetries})`);
    assert(stats.circuitBreaker.state === 'closed', `断路器应为关闭状态`);
    console.log('');

    // Test 15: 断路器触发
    console.log('Test 15: 断路器触发');
    const cbRetry = new AutoRetry({
      maxRetries: 0, // 不重试,让失败快速积累
      circuitBreakerThreshold: 3,
      circuitBreakerResetTime: 500,
      baseDelay: 10,
      jitter: false
    });

    // 触发多次失败来打开断路器
    for (let i = 0; i < 3; i++) {
      await cbRetry.executeWithRetry(async () => {
        throw new Error('Repeated failure');
      }, { category: 'unknown', maxRetries: 0 });
    }

    const cbState = cbRetry.checkCircuitBreaker();
    assert(cbState.state === 'open', `断路器应为打开状态 (实际: ${cbState.state})`);
    assert(cbState.blocked === true, '断路器应阻塞新请求');

    const blockedDecision = cbRetry.shouldRetry('timeout', { attempt: 0 });
    assert(blockedDecision.shouldRetry === false, '断路器打开时应拒绝重试');
    console.log('');

    // Test 16: 断路器恢复
    console.log('Test 16: 断路器恢复');
    // 等待断路器恢复
    await new Promise(resolve => setTimeout(resolve, 600));

    const recoveredState = cbRetry.checkCircuitBreaker();
    assert(recoveredState.state === 'half-open', `断路器应为半开状态 (实际: ${recoveredState.state})`);
    assert(recoveredState.blocked === false, '半开状态应允许尝试');

    // 成功执行使断路器完全关闭
    cbRetry.onSuccess();
    const closedState = cbRetry.checkCircuitBreaker();
    assert(closedState.state === 'closed', `成功后断路器应关闭 (实际: ${closedState.state})`);
    console.log('');

    // Test 17: 手动重置断路器
    console.log('Test 17: 手动重置断路器');
    // 重新打开断路器
    for (let i = 0; i < 3; i++) {
      await cbRetry.executeWithRetry(async () => {
        throw new Error('Failure');
      }, { category: 'unknown', maxRetries: 0 });
    }
    assert(cbRetry.checkCircuitBreaker().state === 'open', '断路器应再次打开');

    cbRetry.resetCircuitBreaker();
    assert(cbRetry.checkCircuitBreaker().state === 'closed', '重置后断路器应关闭');
    console.log('');

    // Test 18: 类别配置自定义
    console.log('Test 18: 类别配置自定义');
    retry.setCategoryConfig('file_not_found', {
      retryable: true,
      maxRetries: 2,
      baseDelay: 500
    });

    const customDecision = retry.shouldRetry('file_not_found', { attempt: 0 });
    assert(customDecision.shouldRetry === true, '自定义后 file_not_found 应可重试');

    // 恢复默认
    retry.setCategoryConfig('file_not_found', {
      retryable: false,
      maxRetries: 0
    });
    console.log('');

    // Test 19: 获取类别配置
    console.log('Test 19: 获取类别配置');
    const timeoutConfig = retry.getCategoryConfig('timeout');
    assert(timeoutConfig.retryable === true, 'timeout 应可重试');
    assert(timeoutConfig.maxRetries === 3, `timeout maxRetries 应为 3 (实际: ${timeoutConfig.maxRetries})`);

    const unknownConfig = retry.getCategoryConfig('nonexistent_category');
    assert(unknownConfig.retryable === true, '未知类别应使用 unknown 配置');
    console.log('');

    // Test 20: 抖动测试
    console.log('Test 20: 抖动测试');
    const jitterRetry = new AutoRetry({
      baseDelay: 1000,
      jitter: true,
      jitterFactor: 0.3,
      maxRetries: 3
    });

    const delays = [];
    for (let i = 0; i < 10; i++) {
      delays.push(jitterRetry.calculateDelay(1, { backoffStrategy: 'exponential', baseDelay: 1000 }));
    }

    const uniqueDelays = new Set(delays);
    assert(uniqueDelays.size > 1, `抖动应产生不同的延迟值 (唯一值: ${uniqueDelays.size})`);

    const minDelay = Math.min(...delays);
    const maxDelay = Math.max(...delays);
    assert(minDelay >= 0, `最小延迟应 >= 0 (实际: ${minDelay})`);
    assert(maxDelay <= 3000, `最大延迟应合理 (实际: ${maxDelay})`);
    console.log('');

    // Test 21: 清理历史
    console.log('Test 21: 清理历史');
    const beforeCount = retry.getRetryHistory().length;
    const cleared = retry.clearHistory(3);
    const afterCount = retry.getRetryHistory().length;
    assert(cleared >= 0, `应清理记录 (清理: ${cleared}条)`);
    assert(afterCount <= 3, `清理后应最多保留3条 (实际: ${afterCount}条)`);
    console.log('');

    // Test 22: 自定义覆盖初始化
    console.log('Test 22: 自定义覆盖初始化');
    const customRetry = new AutoRetry({
      categoryOverrides: {
        file_not_found: { retryable: true, maxRetries: 2 },
        custom_error: { retryable: true, maxRetries: 5, baseDelay: 500 }
      }
    });

    const fileConfig = customRetry.getCategoryConfig('file_not_found');
    assert(fileConfig.retryable === true, '覆盖后 file_not_found 应可重试');
    assert(fileConfig.maxRetries === 2, '覆盖后 maxRetries 应为 2');

    const customConfig = customRetry.getCategoryConfig('custom_error');
    assert(customConfig.retryable === true, '自定义类别应可重试');
    assert(customConfig.maxRetries === 5, '自定义类别 maxRetries 应为 5');
    console.log('');

    // 总结
    console.log('=' .repeat(50));
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

// 运行测试
testAutoRetry()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('💥 测试异常:', error);
    process.exit(1);
  });
