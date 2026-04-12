const { DiagnosticProtocol, SEV_LEVELS, CIRCUIT_BREAKER_LEVELS } = require('../src/diagnostic-protocol');

async function testDiagnosticProtocol() {
  console.log('🧪 测试 DiagnosticProtocol...\n');

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
    // ---- Test 1: 常量 ----
    console.log('\nTest 1: 常量导出');
    assert(typeof SEV_LEVELS === 'object', 'SEV_LEVELS 已导出');
    assert(SEV_LEVELS.SEV1.level === 1, 'SEV1 level = 1');
    assert(SEV_LEVELS.SEV2.level === 2, 'SEV2 level = 2');
    assert(SEV_LEVELS.SEV4.level === 4, 'SEV4 level = 4');
    assert(typeof CIRCUIT_BREAKER_LEVELS === 'object', 'CIRCUIT_BREAKER_LEVELS 已导出');
    assert(CIRCUIT_BREAKER_LEVELS.L1_THROTTLE.level === 1, 'L1 level = 1');
    assert(CIRCUIT_BREAKER_LEVELS.L3_HALT.level === 3, 'L3 level = 3');

    // ---- Test 2: 基本实例化 ----
    console.log('\nTest 2: 基本实例化');
    const dp = new DiagnosticProtocol({ logger: silentLogger });
    assert(dp !== null, 'DiagnosticProtocol 实例创建成功');
    assert(dp.circuitBreaker.level === 0, '初始熔断器级别 = 0');

    // ---- Test 3: Q2 工具问题诊断 ----
    console.log('\nTest 3: Q2 工具问题 — 超时');
    const timeoutResult = dp.diagnose({
      error: '执行超时',
      taskType: 'feature',
      inspection: { failedTasks: [{ subtask: 'test', error: '超时', retryable: true }], criticalFailures: 0 }
    });
    assert(timeoutResult !== null, 'diagnose 返回非空');
    assert(typeof timeoutResult.sev === 'object', '返回 SEV 对象');
    assert(typeof timeoutResult.action === 'object', '返回 action 对象');
    assert(timeoutResult.diagnosis.q2.category === 'tool', 'Q2 判定为 tool 问题');
    assert(timeoutResult.diagnosis.q2.subcategory === 'timeout', 'Q2 子类为 timeout');

    // ---- Test 4: Q2 方法问题诊断 ----
    console.log('\nTest 4: Q2 方法问题 — 不支持');
    const dp2 = new DiagnosticProtocol({ logger: silentLogger });
    const unsupportedResult = dp2.diagnose({
      error: '当前方法不支持此操作',
      taskType: 'refactor',
      inspection: { failedTasks: [], criticalFailures: 0 }
    });
    assert(unsupportedResult.diagnosis.q2.category === 'method', 'Q2 判定为 method 问题');
    assert(unsupportedResult.diagnosis.q4 !== undefined, 'Q4 策略诊断已执行');

    // ---- Test 5: SEV 分级 — 关键失败 ----
    console.log('\nTest 5: SEV 分级');
    const dp3 = new DiagnosticProtocol({ logger: silentLogger });
    const critResult = dp3.diagnose({
      error: '数据丢失风险',
      taskType: 'bug_fix',
      inspection: { failedTasks: [], criticalFailures: 1 }
    });
    assert(critResult.sev.level === 1, 'SEV1: 关键任务失败+数据风险');

    const dp4 = new DiagnosticProtocol({ logger: silentLogger });
    const minorResult = dp4.diagnose({
      error: '轻微格式问题',
      taskType: 'documentation',
      inspection: { failedTasks: [], criticalFailures: 0 }
    });
    assert(minorResult.sev.level <= 3, `低影响问题 SEV ≤ 3 (实际: SEV${minorResult.sev.level})`);

    // ---- Test 6: 熔断器 L1 ----
    console.log('\nTest 6: 熔断器 L1 降速');
    const dpCB = new DiagnosticProtocol({ logger: silentLogger, circuitBreaker: { l1Threshold: 2, l2Threshold: 4, l3Threshold: 6 } });
    // 连续失败触发 L1
    dpCB.diagnose({ error: '错误1', inspection: { failedTasks: [{ error: '1' }], criticalFailures: 0 } });
    dpCB.diagnose({ error: '错误2', inspection: { failedTasks: [{ error: '2' }], criticalFailures: 0 } });
    const cbStatus = dpCB.getCircuitBreakerStatus();
    assert(cbStatus.level >= 1, `L1 熔断触发 (当前: L${cbStatus.level})`);
    assert(cbStatus.consecutiveFailures >= 2, 'consecutiveFailures >= 2');

    // ---- Test 7: 熔断器 L3 停机 ----
    console.log('\nTest 7: 熔断器 L3 停机');
    for (let i = 0; i < 6; i++) {
      dpCB.diagnose({ error: `重复错误${i}`, inspection: { failedTasks: [{ error: `e${i}` }], criticalFailures: 0 } });
    }
    const cbStatus3 = dpCB.getCircuitBreakerStatus();
    assert(cbStatus3.level === 3, `L3 熔断触发 (当前: L${cbStatus3.level})`);
    assert(cbStatus3.isOpen === true, '熔断器已打开');

    // ---- Test 8: recordSuccess 恢复 ----
    console.log('\nTest 8: recordSuccess 恢复');
    dpCB.recordSuccess();
    const afterSuccess = dpCB.getCircuitBreakerStatus();
    assert(afterSuccess.level < 3, `成功后级别降低 (当前: L${afterSuccess.level})`);
    assert(afterSuccess.consecutiveFailures === 0, '成功后 consecutiveFailures 重置');

    // ---- Test 9: resetCircuitBreaker ----
    console.log('\nTest 9: resetCircuitBreaker');
    dpCB.resetCircuitBreaker();
    const afterReset = dpCB.getCircuitBreakerStatus();
    assert(afterReset.level === 0, '重置后级别 = 0');
    assert(afterReset.levelName === 'normal', '重置后状态 = normal');

    // ---- Test 10: Q1 已知问题匹配 ----
    console.log('\nTest 10: Q1 已知问题匹配');
    const dp5 = new DiagnosticProtocol({ logger: silentLogger });
    // 先记录一次诊断
    dp5.diagnose({ error: 'connection refused to database server', inspection: { failedTasks: [], criticalFailures: 0 } });
    // 相同关键词应匹配历史
    const knownResult = dp5.diagnose({ error: 'connection refused to database server again', inspection: { failedTasks: [], criticalFailures: 0 } });
    assert(knownResult.diagnosis.q1.found === true, 'Q1 匹配到历史问题');

    // ---- Test 11: 事故日志 ----
    console.log('\nTest 11: 事故日志');
    const incidents = dpCB.getIncidentLog();
    assert(Array.isArray(incidents), 'getIncidentLog 返回数组');
    assert(incidents.length > 0, '有事故记录');

    // ---- Test 12: 诊断历史 ----
    console.log('\nTest 12: 诊断历史');
    const history = dp5.getDiagnosticHistory();
    assert(Array.isArray(history), 'getDiagnosticHistory 返回数组');
    assert(history.length >= 2, '诊断历史有记录');

    // ---- Test 13: getStats ----
    console.log('\nTest 13: getStats 统计');
    const stats = dp5.getStats();
    assert(typeof stats === 'object', 'getStats 返回对象');
    assert(stats.totalDiagnoses >= 2, 'totalDiagnoses >= 2');
    assert(typeof stats.sevDistribution === 'object', 'sevDistribution 存在');
    assert(typeof stats.circuitBreakerStatus === 'object', 'circuitBreakerStatus 存在');

    // ---- Test 14: 权限错误诊断 ----
    console.log('\nTest 14: 权限错误诊断');
    const dp6 = new DiagnosticProtocol({ logger: silentLogger });
    const permResult = dp6.diagnose({
      error: '权限不足: permission denied',
      inspection: { failedTasks: [{ error: 'permission denied' }], criticalFailures: 0 }
    });
    assert(permResult.diagnosis.q2.category === 'tool', '权限问题归类为 tool');
    assert(permResult.diagnosis.q2.subcategory === 'permission', '子类为 permission');
    assert(permResult.action.type === 'escalate', '建议 escalate');

  } catch (error) {
    console.log(`\n❌ 测试异常: ${error.message}`);
    console.log(error.stack);
    failed++;
  }

  console.log(`\n========================================`);
  console.log(`测试结果: ${passed} 通过, ${failed} 失败`);
  if (failed === 0) {
    console.log('✅ 所有 DiagnosticProtocol 测试通过！');
  } else {
    console.log('❌ 有测试失败');
    process.exitCode = 1;
  }
}

testDiagnosticProtocol();
