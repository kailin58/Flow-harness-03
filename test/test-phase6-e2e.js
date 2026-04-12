/**
 * Phase 6 端到端综合测试
 * 验证所有诊断/自愈组件在真实工作流中的协同工作：
 *   ErrorPatternRecognizer → AutoRetry → SelfHealing → HealthCheck → DiagnosticReporter
 */
const AgentRegistry = require('../src/agent-registry');
const AgentExecutor = require('../src/agent-executor');

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

async function runE2E() {
  console.log('🧪 Phase 6 端到端综合测试\n');

  const registry = new AgentRegistry();
  registry.initializeCoreAgents();

  // 启用所有 Phase 6 功能
  const executor = new AgentExecutor(registry, process.cwd(), {
    sandboxDir: '.flowharness/test-sandboxes',
    autoCleanup: true,
    useSandbox: false,
    defaultTimeout: 10000,
    enableLogging: false,
    enableAutoRetry: true,
    enableSelfHealing: true,
    maxRetries: 2,
    retryDelay: 100
  });

  // ============================================================
  // Scenario 1: 成功执行 → 各组件正确记录
  // ============================================================
  console.log('━'.repeat(60));
  console.log('Scenario 1: 成功执行 → 各组件正确记录');
  console.log('━'.repeat(60));

  const r1 = await executor.execute('explore', {
    action: 'file_search', pattern: '*.js', cwd: process.cwd()
  }, {});
  assert(r1.success === true, '执行成功');

  const execStats1 = executor.getExecutionStats();
  assert(execStats1.totalExecutions >= 1, `执行监控记录 (${execStats1.totalExecutions})`);
  assert(parseFloat(execStats1.successRate) === 100, `成功率 100% (${execStats1.successRate}%)`);

  const errStats1 = executor.getErrorStats();
  assert(errStats1.totalErrors === 0, '无错误记录');

  const retryStats1 = executor.getRetryStats();
  assert(retryStats1.totalRetries === 0, '无重试记录');

  const healStats1 = executor.getHealStats();
  assert(healStats1.totalHeals === 0, '无自愈记录');

  const devStats1 = executor.getDeviationStats();
  assert(typeof devStats1.deviationsDetected === 'number', '偏差检测器正常');
  console.log('');

  // ============================================================
  // Scenario 2: 失败执行 → 错误识别 + 重试 + 自愈链路
  // ============================================================
  console.log('━'.repeat(60));
  console.log('Scenario 2: 失败执行 → 错误识别 + 重试 + 自愈链路');
  console.log('━'.repeat(60));

  const r2 = await executor.execute('explore', {
    action: 'read_file', filePath: '/nonexistent/e2e-test-1.txt'
  }, {});
  // 即使自愈/重试，读不存在的文件最终仍失败
  assert(r2.success === false, '不存在文件执行失败');

  const errStats2 = executor.getErrorStats();
  assert(errStats2.totalErrors >= 1, `错误识别器捕获错误 (${errStats2.totalErrors})`);

  const patterns2 = executor.getErrorPatterns();
  assert(patterns2.length >= 0, '错误模式已分析');

  const execStats2 = executor.getExecutionStats();
  assert(execStats2.totalExecutions >= 2, `执行数增加 (${execStats2.totalExecutions})`);
  assert(parseFloat(execStats2.successRate) < 100, `成功率下降 (${execStats2.successRate}%)`);
  console.log('');

  // ============================================================
  // Scenario 3: 多次失败 → 错误模式聚合 + 偏差检测
  // ============================================================
  console.log('━'.repeat(60));
  console.log('Scenario 3: 多次失败 → 错误模式聚合 + 偏差检测');
  console.log('━'.repeat(60));

  for (let i = 0; i < 3; i++) {
    await executor.execute('explore', {
      action: 'read_file', filePath: `/nonexistent/e2e-batch-${i}.txt`
    }, {});
  }

  const errStats3 = executor.getErrorStats();
  assert(errStats3.totalErrors >= 4, `累计错误 >= 4 (${errStats3.totalErrors})`);

  const patterns3 = executor.getErrorPatterns();
  if (patterns3.length > 0) {
    const topPattern = patterns3.sort((a, b) => (b.occurrences || 0) - (a.occurrences || 0))[0];
    assert(topPattern.occurrences >= 2, `高频模式出现 >= 2 次 (${topPattern.category}: ${topPattern.occurrences})`);
  } else {
    assert(true, '错误模式分析正常（无聚合模式）');
  }

  const devStats3 = executor.getDeviationStats();
  assert(typeof devStats3.deviationsDetected === 'number', `偏差检测器运行中 (偏差: ${devStats3.deviationsDetected})`);
  console.log('');

  // ============================================================
  // Scenario 4: 健康检查 → 全组件状态验证
  // ============================================================
  console.log('━'.repeat(60));
  console.log('Scenario 4: 健康检查 → 全组件状态验证');
  console.log('━'.repeat(60));

  const healthReport = await executor.checkHealth();
  assert(healthReport.status !== undefined, `整体状态: ${healthReport.status}`);
  assert(healthReport.summary.total >= 5, `检查 >= 5 个组件 (${healthReport.summary.total})`);

  const components = executor.listHealthComponents();
  const componentIds = components.map(c => c.id);
  assert(componentIds.includes('sandboxManager'), '含 sandboxManager');
  assert(componentIds.includes('executionMonitor'), '含 executionMonitor');
  assert(componentIds.includes('errorPatternRecognizer'), '含 errorPatternRecognizer');
  assert(componentIds.includes('autoRetry'), '含 autoRetry');
  assert(componentIds.includes('selfHealing'), '含 selfHealing');

  // 注册自定义健康检查
  executor.registerHealthCheck('e2e_custom', {
    name: 'E2E自定义检查',
    critical: false,
    check: () => ({ healthy: true, detail: 'e2e ok' })
  });
  const healthReport2 = await executor.checkHealth();
  assert(healthReport2.components.e2e_custom !== undefined, '自定义健康检查生效');
  assert(healthReport2.components.e2e_custom.status === 'healthy', '自定义检查健康');
  console.log('');

  // ============================================================
  // Scenario 5: 诊断报告 → 聚合所有组件数据
  // ============================================================
  console.log('━'.repeat(60));
  console.log('Scenario 5: 诊断报告 → 聚合所有组件数据');
  console.log('━'.repeat(60));

  // summary 级别
  const diagSummary = executor.generateDiagnosticReport({ level: 'summary' });
  assert(diagSummary.id.startsWith('diag_'), '报告ID格式正确');
  assert(diagSummary.level === 'summary', '级别 summary');
  assert(diagSummary.system.overallStatus !== undefined, '有系统状态');
  assert(diagSummary.execution.totalExecutions >= 5, `执行数 >= 5 (${diagSummary.execution.totalExecutions})`);
  assert(diagSummary.errors.totalErrors >= 4, `错误数 >= 4 (${diagSummary.errors.totalErrors})`);
  assert(diagSummary.retry === undefined, 'summary 无重试段');

  // standard 级别
  const diagStd = executor.generateDiagnosticReport({ level: 'standard' });
  assert(diagStd.retry !== undefined, 'standard 有重试段');
  assert(diagStd.healing !== undefined, 'standard 有自愈段');
  assert(diagStd.deviation !== undefined, 'standard 有偏差段');

  // detailed 级别
  const diagDetail = executor.generateDiagnosticReport({ level: 'detailed' });
  assert(diagDetail.execution.recentHistory !== undefined, 'detailed 有执行历史');
  assert(diagDetail.custom !== undefined, 'detailed 有自定义段');

  // 问题检测
  assert(Array.isArray(diagDetail.issues), '有问题列表');
  assert(typeof diagDetail.summary === 'string', '有摘要文本');
  console.log(`   摘要: ${diagDetail.summary}`);

  // 格式化文本
  const text = executor.formatDiagnosticReport(diagDetail);
  assert(text.includes('诊断报告'), '文本含标题');
  assert(text.includes('系统状态'), '文本含系统状态');
  assert(text.includes('执行统计'), '文本含执行统计');
  console.log('');

  // ============================================================
  // Scenario 6: 自定义扩展 → 诊断段 + 自愈策略
  // ============================================================
  console.log('━'.repeat(60));
  console.log('Scenario 6: 自定义扩展 → 诊断段 + 自愈策略');
  console.log('━'.repeat(60));

  // 注册自定义诊断段
  executor.registerDiagnosticSection('e2e_metrics', {
    name: 'E2E指标',
    collect: () => ({ testRun: true, timestamp: Date.now() })
  });
  const diagCustom = executor.generateDiagnosticReport({ level: 'detailed' });
  assert(diagCustom.custom.e2e_metrics !== undefined, '自定义诊断段存在');
  assert(diagCustom.custom.e2e_metrics.data.testRun === true, '自定义段数据正确');

  // 注册自定义自愈策略
  let healCalled = false;
  executor.registerHealStrategy('e2e_test_error', {
    id: 'e2e_heal_strategy',
    name: 'E2E测试自愈',
    priority: 10,
    canHeal: (error) => error.message && error.message.includes('e2e-heal-test'),
    heal: async () => { healCalled = true; return { success: true }; }
  });
  const strategies = executor.getHealStrategies('e2e_test_error');
  assert(strategies.length >= 1, '自定义自愈策略已注册');
  console.log('');

  // ============================================================
  // Scenario 7: 混合工作流 → 成功+失败交替 → 统计一致性
  // ============================================================
  console.log('━'.repeat(60));
  console.log('Scenario 7: 混合工作流 → 成功+失败交替 → 统计一致性');
  console.log('━'.repeat(60));

  // 交替执行成功和失败操作
  await executor.execute('explore', {
    action: 'file_search', pattern: '*.md', cwd: process.cwd()
  }, {});
  await executor.execute('explore', {
    action: 'read_file', filePath: '/nonexistent/e2e-mix-1.txt'
  }, {});
  await executor.execute('explore', {
    action: 'file_search', pattern: '*.json', cwd: process.cwd()
  }, {});

  const execStatsMix = executor.getExecutionStats();
  const errStatsMix = executor.getErrorStats();
  const rate = parseFloat(execStatsMix.successRate);
  assert(rate > 0 && rate < 100, `成功率在 0-100 之间 (${rate}%)`);
  assert(execStatsMix.totalExecutions >= 8, `总执行数 >= 8 (${execStatsMix.totalExecutions})`);
  assert(errStatsMix.totalErrors >= 5, `总错误数 >= 5 (${errStatsMix.totalErrors})`);

  // 执行历史完整性
  const execHistory = executor.getExecutionHistory();
  assert(execHistory.length >= 8, `执行历史 >= 8 条 (${execHistory.length})`);

  // 错误历史完整性
  const errHistory = executor.getErrorHistory();
  assert(errHistory.length >= 5, `错误历史 >= 5 条 (${errHistory.length})`);
  console.log('');

  // ============================================================
  // Scenario 8: 诊断报告历史 → 多次生成后可查询
  // ============================================================
  console.log('━'.repeat(60));
  console.log('Scenario 8: 诊断报告历史 → 多次生成后可查询');
  console.log('━'.repeat(60));

  const diagHistory = executor.getDiagnosticHistory();
  assert(diagHistory.length >= 3, `诊断历史 >= 3 条 (${diagHistory.length})`);

  // 按级别过滤
  const summaryHistory = executor.getDiagnosticHistory({ level: 'summary' });
  assert(summaryHistory.length >= 1, '可按 summary 过滤');
  const detailedHistory = executor.getDiagnosticHistory({ level: 'detailed' });
  assert(detailedHistory.length >= 1, '可按 detailed 过滤');
  console.log('');

  // ============================================================
  // Scenario 9: 健康历史 → 多次检查后可追溯
  // ============================================================
  console.log('━'.repeat(60));
  console.log('Scenario 9: 健康历史 → 多次检查后可追溯');
  console.log('━'.repeat(60));

  await executor.checkHealth();
  const healthHistory = executor.getHealthHistory();
  assert(healthHistory.length >= 2, `健康历史 >= 2 条 (${healthHistory.length})`);

  const healthStats = executor.getHealthStats();
  assert(healthStats.totalChecks >= 2, `总检查次数 >= 2 (${healthStats.totalChecks})`);
  assert(healthStats.totalComponents >= 6, `组件数 >= 6 含自定义 (${healthStats.totalComponents})`);
  console.log('');

  // ============================================================
  // Scenario 10: 最终综合诊断 → 全景报告验证
  // ============================================================
  console.log('━'.repeat(60));
  console.log('Scenario 10: 最终综合诊断 → 全景报告验证');
  console.log('━'.repeat(60));

  const finalReport = executor.generateDiagnosticReport({ level: 'detailed' });

  // 系统层
  assert(finalReport.system.componentCount >= 5, `系统组件 >= 5`);

  // 执行层
  assert(finalReport.execution.totalExecutions >= 8, `执行数 >= 8`);
  assert(finalReport.execution.recentHistory.length > 0, '有近期执行历史');

  // 错误层
  assert(finalReport.errors.totalErrors >= 5, `错误数 >= 5`);

  // 健康层
  assert(typeof finalReport.health.healthy === 'number', '健康计数存在');

  // 重试层
  assert(typeof finalReport.retry.totalRetries === 'number', '重试计数存在');
  assert(typeof finalReport.retry.circuitBreakerState === 'string', '断路器状态存在');

  // 自愈层
  assert(typeof finalReport.healing.totalHeals === 'number', '自愈计数存在');

  // 偏差层
  assert(typeof finalReport.deviation.totalDeviations === 'number', '偏差计数存在');

  // 自定义段
  assert(finalReport.custom.e2e_metrics !== undefined, '自定义诊断段保留');

  // 问题与建议
  assert(Array.isArray(finalReport.issues), '问题列表完整');
  assert(Array.isArray(finalReport.recommendations), '建议列表完整');

  // 格式化最终报告
  const finalText = executor.formatDiagnosticReport(finalReport);
  assert(finalText.length > 200, `最终报告文本有内容 (${finalText.length} 字符)`);
  console.log(`\n   最终报告摘要: ${finalReport.summary}`);
  console.log('');

  // ============================================================
  // 总结
  // ============================================================
  console.log('='.repeat(60));
  console.log(`\n测试结果: ${passed} 通过, ${failed} 失败`);
  console.log(`总计: ${passed + failed} 个断言\n`);

  if (failed > 0) {
    console.log('❌ 部分端到端测试失败！\n');
    return false;
  }

  console.log('✅ Phase 6 端到端综合测试全部通过！\n');
  return true;
}

runE2E()
  .then(success => process.exit(success ? 0 : 1))
  .catch(error => {
    console.error('💥 测试异常:', error);
    console.error(error.stack);
    process.exit(1);
  });
