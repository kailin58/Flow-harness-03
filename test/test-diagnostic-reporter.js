const DiagnosticReporter = require('../src/diagnostic-reporter');

// 模拟数据源
function createMockSources(overrides = {}) {
  return {
    healthCheck: {
      getStats: () => ({
        totalComponents: 5, healthy: 4, degraded: 1, unhealthy: 0,
        overallStatus: 'degraded', totalChecks: 20, running: false,
        ...overrides.healthStats
      }),
      listComponents: () => [
        { id: 'comp1', name: '组件1', status: 'healthy' },
        { id: 'comp2', name: '组件2', status: 'degraded' }
      ]
    },
    executionMonitor: {
      getStats: () => ({
        totalExecutions: 50, successRate: '85',
        ...overrides.execStats
      }),
      listActiveExecutions: () => overrides.activeExecs || [],
      getHistory: () => overrides.execHistory || [{ id: 'e1' }, { id: 'e2' }]
    },
    errorPatternRecognizer: {
      getStats: () => ({
        totalErrors: 8, totalPatterns: 3,
        ...overrides.errorStats
      }),
      getPatterns: () => overrides.patterns || [
        { category: 'file_not_found', count: 5 },
        { category: 'timeout', count: 2 },
        { category: 'permission', count: 1 }
      ],
      getErrorHistory: () => overrides.errorHistory || [{ id: 'err1' }]
    },
    autoRetry: {
      getStats: () => ({
        totalRetries: 10, totalOperations: 50,
        circuitBreaker: { state: 'closed' },
        ...overrides.retryStats
      }),
      getRetryHistory: () => overrides.retryHistory || [{ id: 'r1' }]
    },
    selfHealing: {
      getStats: () => ({
        totalHeals: 6, healRate: '66.7', totalStrategies: 4,
        ...overrides.healStats
      }),
      getHealHistory: () => overrides.healHistory || [{ id: 'h1' }]
    },
    deviationDetector: {
      getStats: () => ({
        totalDeviations: 3, totalAlerts: 1,
        ...overrides.deviationStats
      }),
      getDetectionHistory: () => overrides.deviationHistory || [{ id: 'd1' }]
    }
  };
}

async function testDiagnosticReporter() {
  console.log('🧪 测试 DiagnosticReporter...\n');

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
    const reporter = new DiagnosticReporter();
    assert(reporter.config.defaultLevel === 'standard', '默认级别为 standard');
    assert(reporter.config.maxReports === 50, '默认最大报告数为 50');
    assert(reporter.reportHistory.length === 0, '初始无历史');
    console.log('');

    // Test 2: 无数据源生成报告
    console.log('Test 2: 无数据源生成报告');
    const emptyReport = reporter.generate();
    assert(emptyReport.id.startsWith('diag_'), '报告ID格式正确');
    assert(emptyReport.level === 'standard', '级别为 standard');
    assert(emptyReport.system.overallStatus === 'unknown', '无数据源时状态 unknown');
    assert(typeof emptyReport.summary === 'string', '有摘要文本');
    assert(Array.isArray(emptyReport.issues), '有问题列表');
    assert(Array.isArray(emptyReport.recommendations), '有建议列表');
    console.log('');

    // Test 3: 有数据源的 summary 级别报告
    console.log('Test 3: summary 级别报告');
    const sources = createMockSources();
    const summaryReporter = new DiagnosticReporter({ sources });
    const summaryReport = summaryReporter.generate({ level: 'summary' });
    assert(summaryReport.level === 'summary', '级别为 summary');
    assert(summaryReport.system.overallStatus === 'degraded', '系统状态正确');
    assert(summaryReport.execution.totalExecutions === 50, '执行数正确');
    assert(summaryReport.errors.totalErrors === 8, '错误数正确');
    assert(summaryReport.health.healthy === 4, '健康组件数正确');
    assert(summaryReport.retry === undefined, 'summary 无重试数据');
    assert(summaryReport.healing === undefined, 'summary 无自愈数据');
    assert(summaryReport.deviation === undefined, 'summary 无偏差数据');
    console.log('');

    // Test 4: standard 级别报告
    console.log('Test 4: standard 级别报告');
    const stdReport = summaryReporter.generate({ level: 'standard' });
    assert(stdReport.retry !== undefined, 'standard 有重试数据');
    assert(stdReport.healing !== undefined, 'standard 有自愈数据');
    assert(stdReport.deviation !== undefined, 'standard 有偏差数据');
    assert(stdReport.retry.totalRetries === 10, '重试数正确');
    assert(stdReport.healing.totalHeals === 6, '自愈数正确');
    assert(stdReport.deviation.totalDeviations === 3, '偏差数正确');
    assert(stdReport.custom === undefined, 'standard 无自定义段');
    console.log('');

    // Test 5: detailed 级别报告
    console.log('Test 5: detailed 级别报告');
    const detailedReport = summaryReporter.generate({ level: 'detailed' });
    assert(detailedReport.custom !== undefined, 'detailed 有自定义段');
    assert(detailedReport.execution.recentHistory !== undefined, 'detailed 有执行历史');
    assert(detailedReport.errors.recentErrors !== undefined, 'detailed 有错误历史');
    console.log('');

    // Test 6: 问题检测 - degraded 系统
    console.log('Test 6: 问题检测 - degraded 系统');
    const degradedIssues = stdReport.issues.filter(i => i.source === 'system');
    assert(degradedIssues.length > 0, '检测到系统降级问题');
    assert(degradedIssues[0].severity === 'medium', '降级为 medium 严重度');
    console.log('');

    // Test 7: 问题检测 - unhealthy 系统
    console.log('Test 7: 问题检测 - unhealthy 系统');
    const unhealthySources = createMockSources({
      healthStats: { overallStatus: 'unhealthy', unhealthy: 1 }
    });
    const unhealthyReporter = new DiagnosticReporter({ sources: unhealthySources });
    const unhealthyReport = unhealthyReporter.generate();
    const sysIssues = unhealthyReport.issues.filter(i => i.source === 'system');
    assert(sysIssues.length > 0, '检测到 unhealthy 问题');
    assert(sysIssues[0].severity === 'high', 'unhealthy 为 high 严重度');
    assert(unhealthyReport.recommendations.length > 0, '有修复建议');
    console.log('');

    // Test 8: 问题检测 - 低成功率
    console.log('Test 8: 问题检测 - 低成功率');
    const lowRateSources = createMockSources({
      execStats: { totalExecutions: 100, successRate: '40' },
      healthStats: { overallStatus: 'healthy' }
    });
    const lowRateReporter = new DiagnosticReporter({ sources: lowRateSources });
    const lowRateReport = lowRateReporter.generate();
    const execIssues = lowRateReport.issues.filter(i => i.source === 'execution');
    assert(execIssues.length > 0, '检测到低成功率');
    assert(execIssues[0].severity === 'high', '低于50%为 high');
    console.log('');

    // Test 9: 问题检测 - 高频错误模式
    console.log('Test 9: 问题检测 - 高频错误模式');
    const highErrorSources = createMockSources({
      healthStats: { overallStatus: 'healthy' },
      patterns: [{ category: 'timeout', count: 10 }]
    });
    const highErrorReporter = new DiagnosticReporter({ sources: highErrorSources });
    const highErrorReport = highErrorReporter.generate();
    const errIssues = highErrorReport.issues.filter(i => i.source === 'errors');
    assert(errIssues.some(i => i.message.includes('timeout')), '检测到高频错误模式');
    console.log('');

    // Test 10: 问题检测 - 断路器打开
    console.log('Test 10: 问题检测 - 断路器打开');
    const cbSources = createMockSources({
      healthStats: { overallStatus: 'healthy' },
      retryStats: { circuitBreaker: { state: 'open' } }
    });
    const cbReporter = new DiagnosticReporter({ sources: cbSources });
    const cbReport = cbReporter.generate();
    const retryIssues = cbReport.issues.filter(i => i.source === 'retry');
    assert(retryIssues.length > 0, '检测到断路器打开');
    assert(retryIssues[0].severity === 'high', '断路器打开为 high');
    console.log('');

    // Test 11: 问题检测 - 低自愈率
    console.log('Test 11: 问题检测 - 低自愈率');
    const lowHealSources = createMockSources({
      healthStats: { overallStatus: 'healthy' },
      healStats: { totalHeals: 10, healRate: '20' }
    });
    const lowHealReporter = new DiagnosticReporter({ sources: lowHealSources });
    const lowHealReport = lowHealReporter.generate();
    const healIssues = lowHealReport.issues.filter(i => i.source === 'healing');
    assert(healIssues.length > 0, '检测到低自愈率');
    console.log('');

    // Test 12: 无问题场景
    console.log('Test 12: 无问题场景');
    const okSources = createMockSources({
      healthStats: { overallStatus: 'healthy', degraded: 0 },
      execStats: { totalExecutions: 100, successRate: '95' },
      errorStats: { totalErrors: 2, totalPatterns: 1 },
      patterns: [{ category: 'timeout', count: 2 }]
    });
    const okReporter = new DiagnosticReporter({ sources: okSources });
    const okReport = okReporter.generate();
    assert(okReport.issues.length === 0, '无问题');
    assert(okReport.summary.includes('无异常'), '摘要显示无异常');
    console.log('');

    // Test 13: 自定义报告段
    console.log('Test 13: 自定义报告段');
    const customReporter = new DiagnosticReporter({ sources: createMockSources() });
    customReporter.registerSection('mySection', {
      name: '自定义段',
      collect: ({ since }) => ({ value: 42, since })
    });
    const customReport = customReporter.generate({ level: 'detailed' });
    assert(customReport.custom.mySection !== undefined, '包含自定义段');
    assert(customReport.custom.mySection.data.value === 42, '自定义段数据正确');
    console.log('');

    // Test 14: 自定义段验证
    console.log('Test 14: 自定义段验证');
    try {
      customReporter.registerSection('', { collect: () => ({}) });
      assert(false, '应拒绝空 sectionId');
    } catch (e) {
      assert(true, '正确拒绝空 sectionId');
    }
    try {
      customReporter.registerSection('bad', { collect: 'not_fn' });
      assert(false, '应拒绝非函数 collect');
    } catch (e) {
      assert(true, '正确拒绝非函数 collect');
    }
    console.log('');

    // Test 15: 注销自定义段
    console.log('Test 15: 注销自定义段');
    assert(customReporter.unregisterSection('mySection') === true, '注销成功');
    assert(customReporter.unregisterSection('nonexistent') === false, '注销不存在返回 false');
    const afterUnreg = customReporter.generate({ level: 'detailed' });
    assert(afterUnreg.custom.mySection === undefined, '注销后不再包含');
    console.log('');

    // Test 16: 报告历史
    console.log('Test 16: 报告历史');
    const histReporter = new DiagnosticReporter({ sources: createMockSources() });
    histReporter.generate({ level: 'summary' });
    histReporter.generate({ level: 'standard' });
    histReporter.generate({ level: 'detailed' });
    const history = histReporter.getReportHistory();
    assert(history.length === 3, '3条历史');
    assert(history[0].level === 'summary', '第一条为 summary');
    assert(history[2].level === 'detailed', '第三条为 detailed');
    console.log('');

    // Test 17: 历史过滤
    console.log('Test 17: 历史过滤');
    const byLevel = histReporter.getReportHistory({ level: 'standard' });
    assert(byLevel.length === 1, '按级别过滤');
    const byLimit = histReporter.getReportHistory({ limit: 2 });
    assert(byLimit.length === 2, '按数量限制');
    console.log('');

    // Test 18: 历史上限
    console.log('Test 18: 历史上限');
    const smallReporter = new DiagnosticReporter({
      sources: createMockSources(),
      maxReports: 3
    });
    for (let i = 0; i < 5; i++) smallReporter.generate();
    assert(smallReporter.getReportHistory().length === 3, '历史不超过上限');
    console.log('');

    // Test 19: formatAsText
    console.log('Test 19: formatAsText');
    const textReporter = new DiagnosticReporter({ sources: createMockSources() });
    const textReport = textReporter.generate();
    const text = textReporter.formatAsText(textReport);
    assert(typeof text === 'string', '输出为字符串');
    assert(text.includes('诊断报告'), '包含标题');
    assert(text.includes('系统状态'), '包含系统状态');
    assert(text.includes('执行统计'), '包含执行统计');
    assert(text.includes('健康状态'), '包含健康状态');
    console.log('');

    // Test 20: formatAsText 含错误和建议
    console.log('Test 20: formatAsText 含错误和建议');
    const issueReport = new DiagnosticReporter({
      sources: createMockSources({
        healthStats: { overallStatus: 'unhealthy', unhealthy: 1 }
      })
    }).generate();
    const issueText = new DiagnosticReporter().formatAsText(issueReport);
    assert(issueText.includes('发现问题'), '包含问题段');
    assert(issueText.includes('建议'), '包含建议段');
    console.log('');

    // Test 21: 数据源异常不崩溃
    console.log('Test 21: 数据源异常不崩溃');
    const badSources = {
      healthCheck: { getStats: () => { throw new Error('boom'); }, listComponents: () => [] },
      executionMonitor: { getStats: () => { throw new Error('boom'); }, listActiveExecutions: () => [], getHistory: () => [] },
      errorPatternRecognizer: { getStats: () => { throw new Error('boom'); }, getPatterns: () => [], getErrorHistory: () => [] },
      autoRetry: { getStats: () => { throw new Error('boom'); }, getRetryHistory: () => [] },
      selfHealing: { getStats: () => { throw new Error('boom'); }, getHealHistory: () => [] },
      deviationDetector: { getStats: () => { throw new Error('boom'); }, getDetectionHistory: () => [] }
    };
    const badReporter = new DiagnosticReporter({ sources: badSources });
    const badReport = badReporter.generate();
    assert(badReport.system.error === 'boom', '记录数据源错误');
    assert(badReport.execution.error === 'boom', '执行数据源错误');
    console.log('');

    // Test 22: 自定义段异常不崩溃
    console.log('Test 22: 自定义段异常不崩溃');
    const errSectionReporter = new DiagnosticReporter({ sources: createMockSources() });
    errSectionReporter.registerSection('broken', {
      name: '坏段',
      collect: () => { throw new Error('段崩溃'); }
    });
    const errSectionReport = errSectionReporter.generate({ level: 'detailed' });
    assert(errSectionReport.custom.broken.error === '段崩溃', '记录自定义段错误');
    console.log('');

    // Test 23: since 过滤传递
    console.log('Test 23: since 过滤传递');
    let capturedSince = null;
    const sinceReporter = new DiagnosticReporter({
      sources: createMockSources()
    });
    sinceReporter.registerSection('tracker', {
      name: 'tracker',
      collect: ({ since }) => { capturedSince = since; return {}; }
    });
    sinceReporter.generate({ level: 'detailed', since: 12345 });
    assert(capturedSince === 12345, 'since 正确传递到自定义段');
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

testDiagnosticReporter()
  .then(success => process.exit(success ? 0 : 1))
  .catch(error => {
    console.error('💥 测试异常:', error);
    process.exit(1);
  });
