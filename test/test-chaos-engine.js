const { ChaosEngine, FAULT_TYPE, EXPERIMENT_STATUS, SEVERITY } = require('../src/chaos-engine');

async function testChaosEngine() {
  console.log('🧪 测试 ChaosEngine...\n');

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
    assert(typeof FAULT_TYPE === 'object', 'FAULT_TYPE 已导出');
    assert(FAULT_TYPE.LATENCY === 'latency', 'LATENCY 类型');
    assert(FAULT_TYPE.ERROR === 'error', 'ERROR 类型');
    assert(FAULT_TYPE.ABORT === 'abort', 'ABORT 类型');
    assert(typeof EXPERIMENT_STATUS === 'object', 'EXPERIMENT_STATUS 已导出');
    assert(EXPERIMENT_STATUS.RUNNING === 'running', 'RUNNING 状态');
    assert(typeof SEVERITY === 'object', 'SEVERITY 已导出');

    // ---- Test 2: 基本实例化 ----
    console.log('\nTest 2: 基本实例化');
    const chaos = new ChaosEngine({ logger: silentLogger });
    assert(chaos !== null, 'ChaosEngine 创建成功');
    assert(chaos.dryRun === true, '默认 dryRun = true');
    assert(chaos.maxConcurrent === 3, '默认 maxConcurrent = 3');

    // ---- Test 3: 定义故障规则 ----
    console.log('\nTest 3: 定义故障规则');
    const f1 = chaos.defineFault({
      name: 'API Latency',
      faultType: FAULT_TYPE.LATENCY,
      target: 'api-service',
      params: { delayMs: 2000 },
      probability: 1.0,
      severity: SEVERITY.MEDIUM
    });
    assert(f1.id.startsWith('fault_'), '故障 ID 正确');
    assert(f1.faultType === FAULT_TYPE.LATENCY, '类型正确');
    assert(f1.params.delayMs === 2000, '延迟参数正确');
    assert(f1.params.jitterMs === 200, '默认 jitter 参数');

    const f2 = chaos.defineFault({
      name: 'DB Error',
      faultType: FAULT_TYPE.ERROR,
      target: 'database',
      severity: SEVERITY.HIGH
    });
    assert(f2.params.errorRate === 0.5, '默认错误率 0.5');

    const f3 = chaos.defineFault({
      name: 'Network Timeout',
      faultType: FAULT_TYPE.TIMEOUT,
      target: 'network',
      severity: SEVERITY.LOW
    });

    assert(chaos.listFaultRules().length === 3, '3 个故障规则');

    // ---- Test 4: 获取/切换故障 ----
    console.log('\nTest 4: 获取/切换故障');
    assert(chaos.getFaultRule(f1.id) !== null, '获取规则成功');
    assert(chaos.getFaultRule('nonexistent') === null, '不存在返回 null');
    assert(chaos.toggleFault(f3.id, false) === true, '禁用成功');
    assert(chaos.getFaultRule(f3.id).enabled === false, '已禁用');

    // ---- Test 5: 定义实验 ----
    console.log('\nTest 5: 定义实验');
    const exp = chaos.defineExperiment({
      name: 'API Resilience Test',
      hypothesis: 'API remains available under latency injection',
      faultIds: [f1.id, f2.id, f3.id],
      durationMs: 1000,
      steadyState: { metric: 'availability', threshold: 0.99 }
    });
    assert(exp.id.startsWith('exp_'), '实验 ID 正确');
    assert(exp.status === EXPERIMENT_STATUS.PENDING, '状态为 PENDING');
    assert(exp.faultIds.length === 3, '3 个故障规则');

    // ---- Test 6: 运行实验 (DryRun) ----
    console.log('\nTest 6: 运行实验 (DryRun)');
    const runResult = await chaos.runExperiment(exp.id);
    assert(runResult.success === true, '实验执行成功');
    assert(runResult.result.dryRun === true, 'DryRun 模式');
    assert(runResult.result.faultsInjected.length >= 2, '至少 2 个故障注入');
    assert(runResult.result.score > 0, `弹性分 > 0 (实际: ${runResult.result.score})`);
    assert(runResult.result.healthChecks.length === 2, '2 次健康检查 (前/后)');

    const completedExp = chaos.getExperiment(exp.id);
    assert(completedExp.status === EXPERIMENT_STATUS.COMPLETED, '状态变为 COMPLETED');

    // ---- Test 7: 实验报告 ----
    console.log('\nTest 7: 实验报告');
    const reports = chaos.getReports();
    assert(reports.length === 1, '1 份报告');
    assert(reports[0].name === 'API Resilience Test', '报告名正确');
    assert(typeof reports[0].resilienceScore === 'number', '有弹性分');
    assert(typeof reports[0].summary === 'string', '有摘要');
    assert(reports[0].summary.includes('Resilience Score'), '摘要包含分数');

    // ---- Test 8: 弹性摘要 ----
    console.log('\nTest 8: 弹性摘要');
    const summary = chaos.getResilienceSummary();
    assert(summary.totalExperiments === 1, '1 个实验');
    assert(summary.avgScore > 0, '平均分 > 0');
    assert(typeof summary.passRate === 'number', 'passRate 是数字');

    // ---- Test 9: 自定义健康检查 ----
    console.log('\nTest 9: 自定义健康检查');
    const f4 = chaos.defineFault({
      name: 'Simple Error',
      faultType: FAULT_TYPE.ERROR,
      severity: SEVERITY.LOW
    });
    const exp2 = chaos.defineExperiment({
      name: 'Health Check Test',
      faultIds: [f4.id],
      healthCheck: async () => true,
      steadyState: { metric: 'custom', threshold: 1 }
    });
    const run2 = await chaos.runExperiment(exp2.id);
    assert(run2.success === true, '自定义健康检查实验成功');
    assert(run2.result.steadyStateVerified === true, '稳态验证通过');

    // ---- Test 10: 健康检查失败 ----
    console.log('\nTest 10: 健康检查失败');
    const exp3 = chaos.defineExperiment({
      name: 'Failed Health Test',
      faultIds: [f4.id],
      healthCheck: async () => false
    });
    const run3 = await chaos.runExperiment(exp3.id);
    assert(run3.success === true, '实验执行完成');
    assert(run3.result.steadyStateVerified === false, '稳态验证失败');
    assert(run3.result.score < 100, '分数 < 100');

    // ---- Test 11: 并发限制 ----
    console.log('\nTest 11: 并发限制');
    const smallChaos = new ChaosEngine({ maxConcurrent: 1, logger: silentLogger });
    const sf = smallChaos.defineFault({ name: 'test', faultType: FAULT_TYPE.LATENCY });
    // 模拟一个长时间实验
    const longExp = smallChaos.defineExperiment({ name: 'long', faultIds: [sf.id], durationMs: 100 });
    smallChaos.activeExperiments.add('fake-running');

    const blockResult = await smallChaos.runExperiment(longExp.id);
    assert(blockResult.success === false, '并发超限拒绝');
    assert(blockResult.error.includes('concurrent'), '错误信息正确');
    smallChaos.activeExperiments.delete('fake-running');

    // ---- Test 12: 安全阀 ----
    console.log('\nTest 12: 安全阀');
    const safetyStatus = chaos.getSafetyValveStatus();
    assert(safetyStatus.tripped === false, '安全阀未触发');

    // 手动触发安全阀
    chaos.safetyValve = { tripped: true, reason: 'Manual test', at: new Date().toISOString() };
    const blockExp = chaos.defineExperiment({ name: 'blocked', faultIds: [] });
    const blockedRun = await chaos.runExperiment(blockExp.id);
    assert(blockedRun.success === false, '安全阀阻止实验');
    assert(blockedRun.error.includes('Safety valve'), '错误信息包含安全阀');

    // 重置
    chaos.resetSafetyValve();
    assert(chaos.getSafetyValveStatus().tripped === false, '安全阀已重置');

    // ---- Test 13: 列出实验 ----
    console.log('\nTest 13: 列出实验');
    const allExps = chaos.listExperiments();
    assert(allExps.length >= 4, `至少 4 个实验 (实际: ${allExps.length})`);
    const completed = chaos.listExperiments({ status: EXPERIMENT_STATUS.COMPLETED });
    assert(completed.length >= 2, '至少 2 个已完成');

    // ---- Test 14: 不存在的实验 ----
    console.log('\nTest 14: 不存在的实验');
    const badRun = await chaos.runExperiment('nonexistent');
    assert(badRun.success === false, '不存在实验失败');

    // ---- Test 15: 故障概率 ----
    console.log('\nTest 15: 故障概率');
    const probFault = chaos.defineFault({
      name: 'Low Prob',
      faultType: FAULT_TYPE.ERROR,
      probability: 0.0, // 永不触发
      severity: SEVERITY.LOW
    });
    const probExp = chaos.defineExperiment({
      name: 'Probability Test',
      faultIds: [probFault.id]
    });
    const probRun = await chaos.runExperiment(probExp.id);
    assert(probRun.success === true, '概率实验成功');
    const triggered = probRun.result.faultsInjected.filter(f => f.triggered);
    assert(triggered.length === 0, '0 概率故障未触发');

    // ---- Test 16: 实际运行模式 (非 dryRun) ----
    console.log('\nTest 16: 实际运行模式');
    const realChaos = new ChaosEngine({ dryRun: false, logger: silentLogger });
    const rf = realChaos.defineFault({ name: 'Real Latency', faultType: FAULT_TYPE.LATENCY, severity: SEVERITY.LOW });
    const rExp = realChaos.defineExperiment({ name: 'Real Test', faultIds: [rf.id], durationMs: 10 });
    const realRun = await realChaos.runExperiment(rExp.id);
    assert(realRun.success === true, '实际模式执行成功');
    assert(realRun.result.dryRun === false, 'dryRun = false');

    // ---- Test 17: getStats ----
    console.log('\nTest 17: getStats');
    const stats = chaos.getStats();
    assert(stats.totalExperiments >= 4, '总实验数');
    assert(stats.totalFaultRules >= 4, '总故障规则');
    assert(stats.totalReports >= 3, '总报告');
    assert(stats.dryRun === true, 'dryRun 正确');
    assert(stats.activeExperiments === 0, '无活跃实验');

    // ---- Test 18: 空弹性摘要 ----
    console.log('\nTest 18: 空弹性摘要');
    const emptyChaos = new ChaosEngine({ logger: silentLogger });
    const emptySummary = emptyChaos.getResilienceSummary();
    assert(emptySummary.totalExperiments === 0, '空摘要 0 实验');
    assert(emptySummary.avgScore === 0, '空摘要 0 分');

  } catch (error) {
    console.log(`\n❌ 测试异常: ${error.message}`);
    console.log(error.stack);
    failed++;
  }

  console.log(`\n========================================`);
  console.log(`测试结果: ${passed} 通过, ${failed} 失败`);
  if (failed === 0) {
    console.log('✅ 所有 ChaosEngine 测试通过！');
  } else {
    console.log('❌ 有测试失败');
    process.exitCode = 1;
  }
}

testChaosEngine();
