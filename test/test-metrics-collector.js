const { MetricsCollector, METRIC_TYPE, DEFAULT_BUCKETS, DEFAULT_QUANTILES } = require('../src/metrics-collector');

async function testMetricsCollector() {
  console.log('🧪 测试 MetricsCollector...\n');

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
    assert(typeof METRIC_TYPE === 'object', 'METRIC_TYPE 已导出');
    assert(METRIC_TYPE.COUNTER === 'counter', 'COUNTER 类型');
    assert(METRIC_TYPE.GAUGE === 'gauge', 'GAUGE 类型');
    assert(METRIC_TYPE.HISTOGRAM === 'histogram', 'HISTOGRAM 类型');
    assert(METRIC_TYPE.SUMMARY === 'summary', 'SUMMARY 类型');
    assert(Array.isArray(DEFAULT_BUCKETS), 'DEFAULT_BUCKETS 已导出');
    assert(Array.isArray(DEFAULT_QUANTILES), 'DEFAULT_QUANTILES 已导出');

    // ---- Test 2: 基本实例化 ----
    console.log('\nTest 2: 基本实例化');
    const mc = new MetricsCollector({ logger: silentLogger });
    assert(mc !== null, 'MetricsCollector 创建成功');
    assert(mc.prefix === 'flowharness', '默认前缀正确');

    // ---- Test 3: 内置指标已注册 ----
    console.log('\nTest 3: 内置指标已注册');
    const builtins = mc.listMetrics();
    assert(builtins.length >= 9, `至少 9 个内置指标 (实际: ${builtins.length})`);
    const names = builtins.map(m => m.name);
    assert(names.includes('flowharness_tasks_total'), 'tasks_total 已注册');
    assert(names.includes('flowharness_errors_total'), 'errors_total 已注册');
    assert(names.includes('flowharness_tokens_total'), 'tokens_total 已注册');

    // ---- Test 4: Counter 操作 ----
    console.log('\nTest 4: Counter 操作');
    mc.registerCounter('test_counter', 'A test counter', ['method']);
    const cName = 'flowharness_test_counter';
    mc.inc(cName, { method: 'GET' });
    mc.inc(cName, { method: 'GET' });
    mc.inc(cName, { method: 'POST' }, 5);
    assert(mc.getValue(cName, { method: 'GET' }) === 2, 'GET 计数 = 2');
    assert(mc.getValue(cName, { method: 'POST' }) === 5, 'POST 计数 = 5');

    // ---- Test 5: Gauge 操作 ----
    console.log('\nTest 5: Gauge 操作');
    mc.registerGauge('test_gauge', 'A test gauge', ['pool']);
    const gName = 'flowharness_test_gauge';
    mc.set(gName, { pool: 'main' }, 100);
    assert(mc.getValue(gName, { pool: 'main' }) === 100, 'Gauge 设置 = 100');

    mc.gaugeInc(gName, { pool: 'main' }, 10);
    assert(mc.getValue(gName, { pool: 'main' }) === 110, 'Gauge Inc → 110');

    mc.gaugeDec(gName, { pool: 'main' }, 30);
    assert(mc.getValue(gName, { pool: 'main' }) === 80, 'Gauge Dec → 80');

    // ---- Test 6: Histogram 操作 ----
    console.log('\nTest 6: Histogram 操作');
    mc.registerHistogram('test_duration', 'Test duration', ['op'], [0.1, 0.5, 1, 5]);
    const hName = 'flowharness_test_duration';
    mc.observe(hName, { op: 'read' }, 0.3);
    mc.observe(hName, { op: 'read' }, 0.7);
    mc.observe(hName, { op: 'read' }, 3.0);

    const hVal = mc.getValue(hName, { op: 'read' });
    assert(hVal !== null, 'Histogram 值存在');
    assert(hVal.count === 3, 'Histogram count = 3');
    assert(Math.abs(hVal.sum - 4.0) < 0.001, 'Histogram sum ≈ 4.0');

    // ---- Test 7: Summary 操作 ----
    console.log('\nTest 7: Summary 操作');
    mc.registerSummary('test_summary', 'Test summary', ['endpoint'], [0.5, 0.9, 0.99]);
    const sName = 'flowharness_test_summary';
    for (let i = 1; i <= 100; i++) {
      mc.observe(sName, { endpoint: '/api' }, i * 0.01);
    }

    const sVal = mc.getValue(sName, { endpoint: '/api' });
    assert(sVal !== null, 'Summary 值存在');
    assert(sVal.count === 100, 'Summary count = 100');
    assert(sVal.sum > 0, 'Summary sum > 0');

    // ---- Test 8: 便捷方法 - recordTask ----
    console.log('\nTest 8: recordTask');
    mc.recordTask('code_review', 'success', 5000);
    const taskVal = mc.getValue('flowharness_tasks_total', { status: 'success', type: 'code_review' });
    assert(taskVal === 1, 'recordTask 计数正确');

    // ---- Test 9: 便捷方法 - recordError ----
    console.log('\nTest 9: recordError');
    mc.recordError('api_timeout', 'warning');
    mc.recordError('api_timeout', 'warning');
    const errVal = mc.getValue('flowharness_errors_total', { type: 'api_timeout', severity: 'warning' });
    assert(errVal === 2, 'recordError 计数 = 2');

    // ---- Test 10: 便捷方法 - recordTokens ----
    console.log('\nTest 10: recordTokens');
    mc.recordTokens('gpt-4', 500, 200, 0.025);
    const inputTokens = mc.getValue('flowharness_tokens_total', { model: 'gpt-4', direction: 'input' });
    const outputTokens = mc.getValue('flowharness_tokens_total', { model: 'gpt-4', direction: 'output' });
    assert(inputTokens === 500, '输入 token = 500');
    assert(outputTokens === 200, '输出 token = 200');

    // ---- Test 11: 便捷方法 - recordModelLatency ----
    console.log('\nTest 11: recordModelLatency');
    mc.recordModelLatency('claude-3', 1500, true);
    mc.recordModelLatency('claude-3', 8000, false);
    const modelReq = mc.getValue('flowharness_model_requests_total', { model: 'claude-3', status: 'success' });
    assert(modelReq === 1, '模型成功请求 = 1');

    // ---- Test 12: updateSystemMetrics ----
    console.log('\nTest 12: updateSystemMetrics');
    mc.updateSystemMetrics();
    const rss = mc.getValue('flowharness_memory_usage_bytes', { type: 'rss' });
    assert(rss > 0, `RSS > 0 (实际: ${rss})`);
    const uptime = mc.getValue('flowharness_uptime_seconds', {});
    assert(uptime > 0, `Uptime > 0 (实际: ${uptime})`);

    // ---- Test 13: Prometheus Format 输出 ----
    console.log('\nTest 13: Prometheus Format 输出');
    const promText = mc.toPrometheus();
    assert(typeof promText === 'string', 'toPrometheus 返回字符串');
    assert(promText.includes('# HELP'), '包含 HELP 行');
    assert(promText.includes('# TYPE'), '包含 TYPE 行');
    assert(promText.includes('flowharness_tasks_total'), '包含 tasks_total');
    assert(promText.includes('flowharness_test_counter'), '包含自定义 counter');
    assert(promText.includes('_bucket{'), '包含 histogram bucket');
    assert(promText.includes('le="+Inf"'), '包含 +Inf bucket');
    assert(promText.includes('quantile="0.5"'), '包含 summary quantile');
    assert(promText.includes('_sum'), '包含 _sum');
    assert(promText.includes('_count'), '包含 _count');

    // ---- Test 14: 自定义前缀和默认标签 ----
    console.log('\nTest 14: 自定义前缀和默认标签');
    const mc2 = new MetricsCollector({
      prefix: 'myapp',
      defaultLabels: { env: 'test', instance: 'node-1' },
      logger: silentLogger
    });
    mc2.registerCounter('requests', 'Total requests');
    mc2.inc('myapp_requests', {});
    const promText2 = mc2.toPrometheus();
    assert(promText2.includes('myapp_requests'), '自定义前缀生效');
    assert(promText2.includes('env="test"'), '默认标签 env 出现');
    assert(promText2.includes('instance="node-1"'), '默认标签 instance 出现');

    // ---- Test 15: getStats ----
    console.log('\nTest 15: getStats');
    const stats = mc.getStats();
    assert(stats.totalMetrics > 10, `总指标数 > 10 (实际: ${stats.totalMetrics})`);
    assert(stats.byType.counter > 0, 'counter 数量 > 0');
    assert(stats.byType.gauge > 0, 'gauge 数量 > 0');
    assert(stats.byType.histogram > 0, 'histogram 数量 > 0');
    assert(stats.totalDataPoints > 0, 'dataPoints > 0');
    assert(stats.prefix === 'flowharness', 'prefix 正确');

    // ---- Test 16: reset ----
    console.log('\nTest 16: reset');
    mc.reset();
    const afterReset = mc.getValue(cName, { method: 'GET' });
    assert(afterReset === null, '重置后 counter 值为 null');

    // ---- Test 17: unregister ----
    console.log('\nTest 17: unregister');
    const beforeCount = mc.listMetrics().length;
    assert(mc.unregister(cName) === true, '注销成功');
    assert(mc.listMetrics().length === beforeCount - 1, '指标数减 1');
    assert(mc.unregister('nonexistent') === false, '不存在返回 false');

    // ---- Test 18: 无数据指标的 Prometheus 输出 ----
    console.log('\nTest 18: 空指标 Prometheus 输出');
    const mc3 = new MetricsCollector({ prefix: 'empty', logger: silentLogger });
    mc3.registerCounter('empty_counter', 'An empty counter');
    const emptyProm = mc3.toPrometheus();
    assert(emptyProm.includes('empty_empty_counter'), '空指标出现在输出中');
    assert(emptyProm.includes('0'), '空 counter 默认值 0');

  } catch (error) {
    console.log(`\n❌ 测试异常: ${error.message}`);
    console.log(error.stack);
    failed++;
  }

  console.log(`\n========================================`);
  console.log(`测试结果: ${passed} 通过, ${failed} 失败`);
  if (failed === 0) {
    console.log('✅ 所有 MetricsCollector 测试通过！');
  } else {
    console.log('❌ 有测试失败');
    process.exitCode = 1;
  }
}

testMetricsCollector();
