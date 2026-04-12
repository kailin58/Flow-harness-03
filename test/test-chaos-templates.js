const {
  ChaosEngine, FAULT_TYPE, EXPERIMENT_STATUS,
  SEVERITY, EXPERIMENT_TEMPLATES
} = require('../src/chaos-engine');

async function testChaosTemplates() {
  console.log('🧪 测试 ChaosEngine 实验模板...\n');

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
    // ---- Test 1: EXPERIMENT_TEMPLATES 导出 ----
    console.log('\nTest 1: EXPERIMENT_TEMPLATES 导出');
    assert(typeof EXPERIMENT_TEMPLATES === 'object', 'EXPERIMENT_TEMPLATES 已导出');
    assert(EXPERIMENT_TEMPLATES.cascade_failure !== undefined, '有 cascade_failure 模板');
    assert(EXPERIMENT_TEMPLATES.byzantine_fault !== undefined, '有 byzantine_fault 模板');
    assert(EXPERIMENT_TEMPLATES.split_brain !== undefined, '有 split_brain 模板');
    assert(EXPERIMENT_TEMPLATES.thundering_herd !== undefined, '有 thundering_herd 模板');
    assert(EXPERIMENT_TEMPLATES.memory_leak !== undefined, '有 memory_leak 模板');
    assert(EXPERIMENT_TEMPLATES.total_dependency_outage !== undefined, '有 total_dependency_outage 模板');
    assert(EXPERIMENT_TEMPLATES.slow_request_pileup !== undefined, '有 slow_request_pileup 模板');
    // Phase 10 新增 5 个模板
    assert(EXPERIMENT_TEMPLATES.clock_skew !== undefined, '有 clock_skew 模板');
    assert(EXPERIMENT_TEMPLATES.dns_failure !== undefined, '有 dns_failure 模板');
    assert(EXPERIMENT_TEMPLATES.disk_full !== undefined, '有 disk_full 模板');
    assert(EXPERIMENT_TEMPLATES.certificate_expiry !== undefined, '有 certificate_expiry 模板');
    assert(EXPERIMENT_TEMPLATES.connection_pool_exhaustion !== undefined, '有 connection_pool_exhaustion 模板');

    // ---- Test 2: 获取模板名列表 ----
    console.log('\nTest 2: 获取模板名列表');
    const engine = new ChaosEngine({ dryRun: true, logger: silentLogger });
    const names = engine.getTemplateNames();
    assert(Array.isArray(names), 'getTemplateNames 返回数组');
    assert(names.length === 12, `12 个模板 (实际: ${names.length})`);
    assert(names.includes('cascade_failure'), '包含 cascade_failure');
    assert(names.includes('split_brain'), '包含 split_brain');

    // ---- Test 3: 获取模板详情 ----
    console.log('\nTest 3: 获取模板详情');
    const cascade = engine.getTemplate('cascade_failure');
    assert(cascade !== null, '获取 cascade_failure 成功');
    assert(cascade.name === 'Cascade Failure Test', '名称正确');
    assert(cascade.faultCount === 3, '3 个故障定义');
    assert(typeof cascade.hypothesis === 'string', '有假设');
    assert(typeof cascade.description === 'string', '有描述');
    assert(cascade.steadyState.metric === 'error_rate', '稳态指标正确');

    assert(engine.getTemplate('nonexistent') === null, '不存在返回 null');

    // ---- Test 4: 拜占庭故障模板详情 ----
    console.log('\nTest 4: 拜占庭故障模板');
    const byzantine = engine.getTemplate('byzantine_fault');
    assert(byzantine !== null, 'byzantine_fault 获取成功');
    assert(byzantine.faultCount === 2, '2 个故障');
    assert(byzantine.faults[0].faultType === FAULT_TYPE.DATA_CORRUPTION, '故障类型为 DATA_CORRUPTION');
    assert(byzantine.faults[0].severity === SEVERITY.CRITICAL, '严重度为 CRITICAL');

    // ---- Test 5: 从模板创建实验 ----
    console.log('\nTest 5: 从模板创建实验');
    const created = engine.createFromTemplate('cascade_failure');
    assert(created.success === true, '创建成功');
    assert(typeof created.experimentId === 'string', '有实验 ID');
    assert(created.template === 'cascade_failure', '模板名正确');
    assert(created.faultIds.length === 3, '3 个故障规则');
    assert(created.experiment.status === EXPERIMENT_STATUS.PENDING, '状态为 PENDING');

    // 验证故障规则已创建
    for (const fid of created.faultIds) {
      const rule = engine.getFaultRule(fid);
      assert(rule !== null, `故障规则 ${fid.substr(0, 15)}... 已创建`);
    }

    // ---- Test 6: 不存在的模板 ----
    console.log('\nTest 6: 不存在的模板');
    const badCreate = engine.createFromTemplate('nonexistent');
    assert(badCreate.success === false, '不存在模板拒绝');
    assert(badCreate.error.includes('不存在'), '错误信息正确');

    // ---- Test 7: 运行模板实验 ----
    console.log('\nTest 7: 运行模板实验');
    const runResult = await engine.runTemplate('thundering_herd');
    assert(runResult.success === true, '运行成功');
    assert(runResult.template === 'thundering_herd', '模板名正确');
    assert(typeof runResult.result === 'object', '有结果');
    assert(typeof runResult.result.score === 'number', '有弹性分数');
    assert(runResult.result.dryRun === true, 'DRY RUN 模式');
    assert(runResult.result.faultsInjected.length === 3, '3 个故障注入');

    // ---- Test 8: 运行拜占庭故障模板 ----
    console.log('\nTest 8: 运行拜占庭故障模板');
    const byzResult = await engine.runTemplate('byzantine_fault');
    assert(byzResult.success === true, '拜占庭实验运行成功');
    assert(byzResult.result.name === 'Byzantine Fault Test', '实验名正确');

    // ---- Test 9: 运行内存泄漏模拟 ----
    console.log('\nTest 9: 运行内存泄漏模拟');
    // 安全阀可能被之前的 CRITICAL 故障触发，先重置
    engine.resetSafetyValve();
    const memResult = await engine.runTemplate('memory_leak');
    assert(memResult.success === true, '内存泄漏实验成功');
    assert(memResult.result.faultsInjected.length === 2, '2 个故障注入');

    // ---- Test 10: 带覆盖参数的模板 ----
    console.log('\nTest 10: 带覆盖参数的模板');
    engine.resetSafetyValve();
    const overrideResult = await engine.runTemplate('split_brain', {
      name: 'Custom Split Brain',
      durationMs: 5000
    });
    assert(overrideResult.success === true, '覆盖参数运行成功');
    assert(overrideResult.result.name === 'Custom Split Brain', '自定义名称生效');

    // ---- Test 11: 运行套件 ----
    console.log('\nTest 11: 运行套件');
    const engine2 = new ChaosEngine({ dryRun: true, logger: silentLogger });
    const suiteResult = await engine2.runSuite([
      'cascade_failure',
      'thundering_herd',
      'memory_leak'
    ]);
    assert(suiteResult.total === 3, '套件总数 = 3');
    assert(suiteResult.executed === 3, '执行数 = 3');
    assert(typeof suiteResult.avgScore === 'number', '有平均分');
    assert(typeof suiteResult.minScore === 'number', '有最低分');
    assert(typeof suiteResult.maxScore === 'number', '有最高分');
    assert(suiteResult.results.length === 3, '3 个结果');

    // ---- Test 12: 套件遇故障停止 ----
    console.log('\nTest 12: 套件遇故障停止');
    // 安全阀触发后应停止
    const engine3 = new ChaosEngine({ dryRun: true, safetyThreshold: 0.0, logger: silentLogger });
    const stopSuite = await engine3.runSuite(
      ['cascade_failure', 'byzantine_fault', 'thundering_herd'],
      { stopOnFail: true }
    );
    assert(stopSuite.total === 3, '套件总数 = 3');
    // 安全阀可能被触发（因阈值极低）
    assert(stopSuite.executed >= 1, '至少执行 1 个');

    // ---- Test 13: 全部模板可运行 ----
    console.log('\nTest 13: 全部模板可运行');
    const allEngine = new ChaosEngine({ dryRun: true, logger: silentLogger });
    const allNames = allEngine.getTemplateNames();
    let allOk = true;
    for (const name of allNames) {
      allEngine.resetSafetyValve(); // 每个模板运行前重置安全阀
      const r = await allEngine.runTemplate(name);
      if (!r.success) {
        allOk = false;
        console.log(`    ❌ 模板 ${name} 运行失败: ${r.error}`);
      }
    }
    assert(allOk, '全部 12 个模板均可运行');

    // ---- Test 14: 模板结构一致性 ----
    console.log('\nTest 14: 模板结构一致性');
    let structureOk = true;
    for (const [tname, tmpl] of Object.entries(EXPERIMENT_TEMPLATES)) {
      if (!tmpl.name || !tmpl.hypothesis || !tmpl.faults || !tmpl.steadyState) {
        structureOk = false;
        console.log(`    ❌ 模板 ${tname} 缺少必要字段`);
      }
      if (!Array.isArray(tmpl.faults) || tmpl.faults.length === 0) {
        structureOk = false;
        console.log(`    ❌ 模板 ${tname} faults 为空`);
      }
      for (const f of tmpl.faults) {
        if (!f.name || !f.faultType || !f.target) {
          structureOk = false;
          console.log(`    ❌ 模板 ${tname} 故障 ${f.name} 缺少字段`);
        }
      }
    }
    assert(structureOk, '所有模板结构完整');

    // ---- Test 15: 慢请求堆积模板 ----
    console.log('\nTest 15: 慢请求堆积模板');
    const slowTmpl = allEngine.getTemplate('slow_request_pileup');
    assert(slowTmpl !== null, '获取成功');
    assert(slowTmpl.faults.length === 2, '2 个故障');
    assert(slowTmpl.steadyState.metric === 'response_time_p95', '稳态指标正确');

    // ---- Test 16: 全依赖宕机模板 ----
    console.log('\nTest 16: 全依赖宕机模板');
    const depTmpl = allEngine.getTemplate('total_dependency_outage');
    assert(depTmpl !== null, '获取成功');
    assert(depTmpl.faultCount === 3, '3 个故障 (db/cache/queue)');
    assert(depTmpl.steadyState.threshold === 0.5, '降级可用性阈值 50%');

    // ---- Test 17: 模板报告检查 ----
    console.log('\nTest 17: 模板报告检查');
    const reports = allEngine.getReports(20);
    assert(reports.length >= 12, `至少 12 个报告 (实际: ${reports.length})`);
    const summary = allEngine.getResilienceSummary();
    assert(summary.totalExperiments >= 12, `弹性摘要实验数 >= 12 (实际: ${summary.totalExperiments})`);
    assert(typeof summary.avgScore === 'number', '有平均弹性分数');

    // ---- Test 18: 原有测试回归检查 ----
    console.log('\nTest 18: 原有功能回归');
    const regEngine = new ChaosEngine({ dryRun: true, logger: silentLogger });
    // 手动定义故障+实验
    const f1 = regEngine.defineFault({
      name: 'reg-fault',
      faultType: FAULT_TYPE.LATENCY,
      target: 'test',
      severity: SEVERITY.LOW
    });
    assert(f1.id !== undefined, '手动故障定义仍正常');
    const e1 = regEngine.defineExperiment({
      name: 'reg-exp',
      faultIds: [f1.id]
    });
    assert(e1.id !== undefined, '手动实验定义仍正常');
    const r1 = await regEngine.runExperiment(e1.id);
    assert(r1.success === true, '手动运行仍正常');
    assert(typeof r1.result.score === 'number', '评分仍正常');

    // getStats
    const stats = regEngine.getStats();
    assert(stats.totalExperiments >= 1, 'getStats 仍正常');
    assert(stats.totalFaultRules >= 1, '故障规则统计正常');

    // ---- Test 19: 时钟偏移模板 ----
    console.log('\nTest 19: 时钟偏移模板');
    const clockTmpl = allEngine.getTemplate('clock_skew');
    assert(clockTmpl !== null, 'clock_skew 获取成功');
    assert(clockTmpl.faultCount === 3, '3 个故障 (前漂/后漂/乱序)');
    assert(clockTmpl.steadyState.metric === 'event_ordering_correctness', '稳态指标正确');
    allEngine.resetSafetyValve();
    const clockResult = await allEngine.runTemplate('clock_skew');
    assert(clockResult.success === true, 'clock_skew 运行成功');

    // ---- Test 20: DNS 故障模板 ----
    console.log('\nTest 20: DNS 故障模板');
    const dnsTmpl = allEngine.getTemplate('dns_failure');
    assert(dnsTmpl !== null, 'dns_failure 获取成功');
    assert(dnsTmpl.faultCount === 3, '3 个故障 (超时/NXDOMAIN/错误IP)');
    assert(dnsTmpl.faults.some(f => f.severity === SEVERITY.CRITICAL), '有 CRITICAL 级故障');
    allEngine.resetSafetyValve();
    const dnsResult = await allEngine.runTemplate('dns_failure');
    assert(dnsResult.success === true, 'dns_failure 运行成功');

    // ---- Test 21: 磁盘满模板 ----
    console.log('\nTest 21: 磁盘满模板');
    const diskTmpl = allEngine.getTemplate('disk_full');
    assert(diskTmpl !== null, 'disk_full 获取成功');
    assert(diskTmpl.faultCount === 3, '3 个故障 (空间耗尽/写入失败/日志轮转)');
    assert(diskTmpl.steadyState.metric === 'disk_usage_pct', '稳态指标正确');
    allEngine.resetSafetyValve();
    const diskResult = await allEngine.runTemplate('disk_full');
    assert(diskResult.success === true, 'disk_full 运行成功');

    // ---- Test 22: 证书过期模板 ----
    console.log('\nTest 22: 证书过期模板');
    const certTmpl = allEngine.getTemplate('certificate_expiry');
    assert(certTmpl !== null, 'certificate_expiry 获取成功');
    assert(certTmpl.faultCount === 3, '3 个故障 (过期/即将过期/TLS失败)');
    assert(certTmpl.faults[0].severity === SEVERITY.CRITICAL, '证书过期为 CRITICAL');
    allEngine.resetSafetyValve();
    const certResult = await allEngine.runTemplate('certificate_expiry');
    assert(certResult.success === true, 'certificate_expiry 运行成功');

    // ---- Test 23: 连接池耗尽模板 ----
    console.log('\nTest 23: 连接池耗尽模板');
    const poolTmpl = allEngine.getTemplate('connection_pool_exhaustion');
    assert(poolTmpl !== null, 'connection_pool_exhaustion 获取成功');
    assert(poolTmpl.faultCount === 4, '4 个故障 (DB池/HTTP池/慢查询/超时)');
    assert(poolTmpl.steadyState.metric === 'connection_availability', '稳态指标正确');
    allEngine.resetSafetyValve();
    const poolResult = await allEngine.runTemplate('connection_pool_exhaustion');
    assert(poolResult.success === true, 'connection_pool_exhaustion 运行成功');

    // ---- Test 24: 新模板组合套件 ----
    console.log('\nTest 24: 新模板组合套件');
    const newEngine = new ChaosEngine({ dryRun: true, logger: silentLogger });
    const newSuite = await newEngine.runSuite([
      'clock_skew', 'dns_failure', 'disk_full',
      'certificate_expiry', 'connection_pool_exhaustion'
    ]);
    assert(newSuite.total === 5, '新模板套件总数 5');
    assert(newSuite.executed >= 3, '至少执行 3 个');
    assert(typeof newSuite.avgScore === 'number', '有平均分');

  } catch (error) {
    console.log(`\n❌ 测试异常: ${error.message}`);
    console.log(error.stack);
    failed++;
  }

  console.log(`\n========================================`);
  console.log(`测试结果: ${passed} 通过, ${failed} 失败`);
  if (failed === 0) {
    console.log('✅ 所有 ChaosEngine 模板测试通过！');
  } else {
    console.log('❌ 有测试失败');
    process.exitCode = 1;
  }
}

testChaosTemplates();
