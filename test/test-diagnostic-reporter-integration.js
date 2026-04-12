const AgentRegistry = require('../src/agent-registry');
const AgentExecutor = require('../src/agent-executor');

async function testDiagnosticReporterIntegration() {
  console.log('🧪 测试 DiagnosticReporter 与 AgentExecutor 集成...\n');

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
    // Test 1: 初始状态报告
    console.log('Test 1: 初始状态报告');
    const report1 = executor.generateDiagnosticReport({ level: 'summary' });
    assert(report1.id.startsWith('diag_'), '报告ID格式正确');
    assert(report1.level === 'summary', '级别为 summary');
    assert(report1.system.overallStatus !== undefined, '有系统状态');
    assert(report1.system.componentCount >= 5, `组件数 >= 5 (实际: ${report1.system.componentCount})`);
    console.log(`   系统状态: ${report1.system.overallStatus}`);
    console.log('');

    // Test 2: 执行操作后生成报告
    console.log('Test 2: 执行操作后生成报告');
    await executor.execute('explore', {
      action: 'file_search',
      pattern: '*.js',
      cwd: process.cwd()
    }, {});
    const report2 = executor.generateDiagnosticReport();
    assert(report2.execution.totalExecutions >= 1, `有执行记录 (实际: ${report2.execution.totalExecutions})`);
    assert(parseFloat(report2.execution.successRate) > 0, '成功率 > 0');
    console.log(`   执行数: ${report2.execution.totalExecutions}`);
    console.log(`   成功率: ${report2.execution.successRate}%`);
    console.log('');

    // Test 3: 失败操作后报告含错误信息
    console.log('Test 3: 失败操作后报告含错误信息');
    await executor.execute('explore', {
      action: 'read_file',
      filePath: '/nonexistent/diag-test.txt'
    }, {});
    const report3 = executor.generateDiagnosticReport();
    assert(report3.errors.totalErrors >= 1, `有错误记录 (实际: ${report3.errors.totalErrors})`);
    console.log(`   错误数: ${report3.errors.totalErrors}`);
    console.log('');

    // Test 4: standard 级别含重试和自愈数据
    console.log('Test 4: standard 级别含重试和自愈数据');
    const report4 = executor.generateDiagnosticReport({ level: 'standard' });
    assert(report4.retry !== undefined, '有重试数据');
    assert(report4.healing !== undefined, '有自愈数据');
    assert(report4.deviation !== undefined, '有偏差数据');
    console.log('');

    // Test 5: detailed 级别含详细历史
    console.log('Test 5: detailed 级别含详细历史');
    const report5 = executor.generateDiagnosticReport({ level: 'detailed' });
    assert(report5.execution.recentHistory !== undefined, '有执行历史');
    assert(report5.custom !== undefined, '有自定义段');
    console.log('');

    // Test 6: 格式化为文本
    console.log('Test 6: 格式化为文本');
    const text = executor.formatDiagnosticReport(report5);
    assert(typeof text === 'string', '输出为字符串');
    assert(text.includes('诊断报告'), '包含标题');
    assert(text.includes('系统状态'), '包含系统状态段');
    assert(text.includes('执行统计'), '包含执行统计段');
    console.log(`   文本长度: ${text.length} 字符`);
    console.log('');

    // Test 7: 注册自定义诊断段
    console.log('Test 7: 注册自定义诊断段');
    executor.registerDiagnosticSection('custom_diag', {
      name: '自定义诊断',
      collect: () => ({ status: 'ok', value: 99 })
    });
    const report7 = executor.generateDiagnosticReport({ level: 'detailed' });
    assert(report7.custom.custom_diag !== undefined, '包含自定义段');
    assert(report7.custom.custom_diag.data.value === 99, '自定义段数据正确');
    console.log('');

    // Test 8: 诊断报告历史
    console.log('Test 8: 诊断报告历史');
    const history = executor.getDiagnosticHistory();
    assert(history.length >= 5, `有历史记录 (实际: ${history.length})`);
    assert(history[0].level === 'summary', '第一条为 summary');
    console.log(`   历史记录数: ${history.length}`);
    console.log('');

    // Test 9: 多次操作后综合报告
    console.log('Test 9: 多次操作后综合报告');
    for (let i = 0; i < 3; i++) {
      await executor.execute('explore', {
        action: 'file_search', pattern: '*.md', cwd: process.cwd()
      }, {});
    }
    const report9 = executor.generateDiagnosticReport();
    assert(report9.execution.totalExecutions >= 5, `多次执行后有记录 (实际: ${report9.execution.totalExecutions})`);
    assert(typeof report9.summary === 'string', '有摘要');
    console.log(`   摘要: ${report9.summary}`);
    console.log('');

    // Test 10: 健康检查数据在报告中
    console.log('Test 10: 健康检查数据在报告中');
    await executor.checkHealth();
    const report10 = executor.generateDiagnosticReport();
    assert(report10.health.healthy >= 0, '有健康组件计数');
    assert(report10.system.componentCount >= 5, '系统组件数正确');
    console.log(`   健康: ${report10.health.healthy}, 降级: ${report10.health.degraded}, 不健康: ${report10.health.unhealthy}`);
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

testDiagnosticReporterIntegration()
  .then(success => process.exit(success ? 0 : 1))
  .catch(error => {
    console.error('💥 测试异常:', error);
    process.exit(1);
  });
