const AgentRegistry = require('../src/agent-registry');
const AgentExecutor = require('../src/agent-executor');

async function testHealthCheckIntegration() {
  console.log('🧪 测试 HealthCheck 与 AgentExecutor 集成...\n');

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
    enableAutoRetry: false,
    enableSelfHealing: false
  });

  try {
    // Test 1: 内置组件已注册
    console.log('Test 1: 内置组件已注册');
    const components = executor.listHealthComponents();
    assert(components.length >= 5, `应有至少5个内置组件 (实际: ${components.length})`);
    const ids = components.map(c => c.id);
    assert(ids.includes('sandboxManager'), '包含 sandboxManager');
    assert(ids.includes('executionMonitor'), '包含 executionMonitor');
    assert(ids.includes('errorPatternRecognizer'), '包含 errorPatternRecognizer');
    assert(ids.includes('autoRetry'), '包含 autoRetry');
    assert(ids.includes('selfHealing'), '包含 selfHealing');
    console.log('');

    // Test 2: 执行健康检查
    console.log('Test 2: 执行健康检查');
    const healthReport = await executor.checkHealth();
    assert(healthReport.status !== undefined, '有整体状态');
    assert(healthReport.summary.total >= 5, `检查了至少5个组件 (实际: ${healthReport.summary.total})`);
    console.log(`   整体状态: ${healthReport.status}`);
    console.log(`   健康: ${healthReport.summary.healthy}, 降级: ${healthReport.summary.degraded}, 不健康: ${healthReport.summary.unhealthy}`);
    console.log('');

    // Test 3: 健康统计
    console.log('Test 3: 健康统计');
    const healthStats = executor.getHealthStats();
    assert(healthStats.totalComponents >= 5, `组件总数 (实际: ${healthStats.totalComponents})`);
    assert(typeof healthStats.overallStatus === 'string', '有整体状态');
    assert(typeof healthStats.totalChecks === 'number', '有检查总数');
    console.log(`   组件总数: ${healthStats.totalComponents}`);
    console.log(`   整体状态: ${healthStats.overallStatus}`);
    console.log('');

    // Test 4: 健康历史
    console.log('Test 4: 健康历史');
    const healthHistory = executor.getHealthHistory();
    assert(Array.isArray(healthHistory), '历史为数组');
    assert(healthHistory.length > 0, `应有历史记录 (实际: ${healthHistory.length})`);
    console.log(`   历史记录数: ${healthHistory.length}`);
    console.log('');

    // Test 5: 注册自定义健康检查
    console.log('Test 5: 注册自定义健康检查');
    executor.registerHealthCheck('custom_check', {
      name: '自定义检查',
      critical: false,
      check: () => ({ healthy: true, detail: 'custom ok' })
    });
    const updatedComponents = executor.listHealthComponents();
    const hasCustom = updatedComponents.some(c => c.id === 'custom_check');
    assert(hasCustom, '自定义检查已注册');
    console.log('');

    // Test 6: 自定义检查生效
    console.log('Test 6: 自定义检查生效');
    const report2 = await executor.checkHealth();
    assert(report2.components.custom_check !== undefined, '报告包含自定义检查');
    assert(report2.components.custom_check.status === 'healthy', '自定义检查健康');
    console.log('');

    // Test 7: 执行操作后再检查
    console.log('Test 7: 执行操作后再检查');
    await executor.execute('explore', {
      action: 'file_search',
      pattern: '*.js',
      cwd: process.cwd()
    }, {});
    const report3 = await executor.checkHealth();
    assert(report3.status !== undefined, '操作后仍可检查');
    assert(report3.components.executionMonitor.status === 'healthy', '执行监控器健康');
    console.log('');

    // Test 8: 失败操作后检查
    console.log('Test 8: 失败操作后检查');
    await executor.execute('explore', {
      action: 'read_file',
      filePath: '/nonexistent/health-test.txt'
    }, {});
    const report4 = await executor.checkHealth();
    assert(report4.components.errorPatternRecognizer.status === 'healthy', '错误识别器仍健康');
    console.log('');

    // Test 9: 按组件过滤历史
    console.log('Test 9: 按组件过滤历史');
    const monitorHistory = executor.getHealthHistory({ componentId: 'executionMonitor' });
    assert(monitorHistory.length > 0, '有执行监控器历史');
    console.log(`   executionMonitor 历史: ${monitorHistory.length}`);
    console.log('');

    // Test 10: 综合统计
    console.log('Test 10: 综合统计');
    const finalStats = executor.getHealthStats();
    const execStats = executor.getExecutionStats();
    console.log(`   健康检查:`);
    console.log(`     组件总数: ${finalStats.totalComponents}`);
    console.log(`     整体状态: ${finalStats.overallStatus}`);
    console.log(`     健康: ${finalStats.healthy}, 降级: ${finalStats.degraded}, 不健康: ${finalStats.unhealthy}`);
    console.log(`   执行统计:`);
    console.log(`     总执行数: ${execStats.totalExecutions}`);
    assert(finalStats.totalComponents > 0, '有组件');
    assert(execStats.totalExecutions > 0, '有执行记录');
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

testHealthCheckIntegration()
  .then(success => process.exit(success ? 0 : 1))
  .catch(error => {
    console.error('💥 测试异常:', error);
    process.exit(1);
  });
