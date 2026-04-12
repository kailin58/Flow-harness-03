const HealthCheck = require('../src/health-check');

async function testHealthCheck() {
  console.log('🧪 测试 HealthCheck...\n');

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
    const hc = new HealthCheck({ checkInterval: 60000 });
    assert(hc.config.checkInterval === 60000, '检查间隔正确');
    assert(hc.config.unhealthyThreshold === 3, '默认 unhealthy 阈值为3');
    assert(hc.config.degradedThreshold === 1, '默认 degraded 阈值为1');
    assert(hc.isRunning() === false, '默认不自动启动');
    console.log('');

    // Test 2: 注册组件
    console.log('Test 2: 注册组件');
    hc.register('comp_a', {
      name: '组件A',
      description: '测试组件A',
      critical: true,
      check: async () => ({ healthy: true, detail: 'ok' })
    });
    hc.register('comp_b', {
      name: '组件B',
      check: async () => ({ healthy: true })
    });
    const components = hc.listComponents();
    assert(components.length === 2, '应注册2个组件');
    assert(components[0].name === '组件A', '组件A名称正确');
    assert(components[0].critical === true, '组件A为关键组件');
    assert(components[1].status === 'unknown', '初始状态为 unknown');
    console.log('');

    // Test 3: 注册验证
    console.log('Test 3: 注册验证');
    try {
      hc.register('', { check: async () => ({}) });
      assert(false, '应拒绝空 componentId');
    } catch (e) {
      assert(true, '正确拒绝空 componentId');
    }
    try {
      hc.register('bad', { check: 'not_a_function' });
      assert(false, '应拒绝非函数 check');
    } catch (e) {
      assert(true, '正确拒绝非函数 check');
    }
    console.log('');

    // Test 4: 检查单个健康组件
    console.log('Test 4: 检查单个健康组件');
    const result4 = await hc.checkComponent('comp_a');
    assert(result4.success === true, '检查成功');
    assert(result4.status === 'healthy', '状态为 healthy');
    assert(result4.componentId === 'comp_a', '组件ID正确');
    assert(result4.duration >= 0, '有执行时长');
    assert(result4.details.detail === 'ok', '详情正确');
    const statusA = hc.getStatus('comp_a');
    assert(statusA.status === 'healthy', '组件状态已更新');
    assert(statusA.consecutiveSuccesses === 1, '连续成功1次');
    console.log('');

    // Test 5: 检查失败组件
    console.log('Test 5: 检查失败组件');
    const failHc = new HealthCheck({ degradedThreshold: 1, unhealthyThreshold: 3 });
    failHc.register('fail_comp', {
      name: '失败组件',
      check: async () => ({ healthy: false, reason: '模拟失败' })
    });
    const result5 = await failHc.checkComponent('fail_comp');
    assert(result5.success === false, '检查失败');
    assert(result5.status === 'degraded', '首次失败为 degraded');
    const failStatus = failHc.getStatus('fail_comp');
    assert(failStatus.consecutiveFailures === 1, '连续失败1次');
    console.log('');

    // Test 6: 连续失败升级为 unhealthy
    console.log('Test 6: 连续失败升级为 unhealthy');
    await failHc.checkComponent('fail_comp'); // 第2次
    await failHc.checkComponent('fail_comp'); // 第3次
    const failStatus2 = failHc.getStatus('fail_comp');
    assert(failStatus2.status === 'unhealthy', '3次失败后为 unhealthy');
    assert(failStatus2.consecutiveFailures === 3, '连续失败3次');
    console.log('');

    // Test 7: 成功后恢复
    console.log('Test 7: 成功后恢复');
    const recoverHc = new HealthCheck();
    let recoverCount = 0;
    recoverHc.register('recover', {
      check: async () => {
        recoverCount++;
        if (recoverCount <= 3) return { healthy: false };
        return { healthy: true };
      }
    });
    await recoverHc.checkComponent('recover'); // fail 1
    await recoverHc.checkComponent('recover'); // fail 2
    await recoverHc.checkComponent('recover'); // fail 3
    assert(recoverHc.getStatus('recover').status === 'unhealthy', '3次失败后 unhealthy');
    await recoverHc.checkComponent('recover'); // success
    assert(recoverHc.getStatus('recover').status === 'healthy', '成功后恢复 healthy');
    assert(recoverHc.getStatus('recover').consecutiveFailures === 0, '连续失败归零');
    console.log('');

    // Test 8: 检查抛出异常
    console.log('Test 8: 检查抛出异常');
    const throwHc = new HealthCheck();
    throwHc.register('throw_comp', {
      check: async () => { throw new Error('检查崩溃'); }
    });
    const result8 = await throwHc.checkComponent('throw_comp');
    assert(result8.success === false, '异常视为失败');
    assert(result8.error === '检查崩溃', '记录异常信息');
    assert(result8.status === 'degraded', '异常后为 degraded');
    console.log('');

    // Test 9: 检查超时
    console.log('Test 9: 检查超时');
    const toHc = new HealthCheck({ checkTimeout: 100 });
    toHc.register('slow_comp', {
      check: async () => {
        await new Promise(r => setTimeout(r, 500));
        return { healthy: true };
      }
    });
    const result9 = await toHc.checkComponent('slow_comp');
    assert(result9.success === false, '超时视为失败');
    assert(result9.error.includes('超时'), '记录超时错误');
    console.log('');

    // Test 10: checkAll
    console.log('Test 10: checkAll');
    const allHc = new HealthCheck();
    allHc.register('ok1', { check: async () => ({ healthy: true }) });
    allHc.register('ok2', { check: async () => ({ healthy: true }) });
    allHc.register('bad1', { check: async () => ({ healthy: false }), critical: false });
    const allResult = await allHc.checkAll();
    assert(allResult.status !== undefined, '有整体状态');
    assert(allResult.summary.total === 3, '总计3个组件');
    assert(allResult.summary.healthy === 2, '2个健康');
    assert(allResult.summary.degraded === 1, '1个降级');
    console.log('');

    // Test 11: 关键组件 unhealthy 导致整体 unhealthy
    console.log('Test 11: 关键组件 unhealthy 导致整体 unhealthy');
    const critHc = new HealthCheck({ unhealthyThreshold: 1 });
    critHc.register('critical_comp', {
      critical: true,
      check: async () => ({ healthy: false })
    });
    critHc.register('ok_comp', {
      check: async () => ({ healthy: true })
    });
    const critResult = await critHc.checkAll();
    assert(critResult.status === 'unhealthy', '关键组件失败导致整体 unhealthy');
    console.log('');

    // Test 12: 非关键组件 unhealthy 只导致 degraded
    console.log('Test 12: 非关键组件 unhealthy 只导致 degraded');
    const nonCritHc = new HealthCheck({ unhealthyThreshold: 1 });
    nonCritHc.register('non_critical', {
      critical: false,
      check: async () => ({ healthy: false })
    });
    nonCritHc.register('ok', {
      check: async () => ({ healthy: true })
    });
    const nonCritResult = await nonCritHc.checkAll();
    assert(nonCritResult.status === 'degraded', '非关键组件失败只导致 degraded');
    console.log('');

    // Test 13: 注销组件
    console.log('Test 13: 注销组件');
    const unregResult = hc.unregister('comp_b');
    assert(unregResult === true, '注销成功');
    assert(hc.listComponents().length === 1, '剩余1个组件');
    const unregFail = hc.unregister('nonexistent');
    assert(unregFail === false, '注销不存在的组件返回 false');
    console.log('');

    // Test 14: 检查不存在的组件
    console.log('Test 14: 检查不存在的组件');
    try {
      await hc.checkComponent('nonexistent');
      assert(false, '应抛出异常');
    } catch (e) {
      assert(e.message.includes('未注册'), '正确的错误信息');
    }
    console.log('');

    // Test 15: 获取状态
    console.log('Test 15: 获取状态');
    const singleStatus = hc.getStatus('comp_a');
    assert(singleStatus !== null, '获取单个组件状态');
    assert(singleStatus.status === 'healthy', '状态正确');
    const nullStatus = hc.getStatus('nonexistent');
    assert(nullStatus === null, '不存在的组件返回 null');
    const allStatus = hc.getStatus();
    assert(typeof allStatus === 'object', '获取所有状态');
    assert(allStatus.comp_a !== undefined, '包含 comp_a');
    console.log('');

    // Test 16: 检查历史
    console.log('Test 16: 检查历史');
    const history = hc.getHistory();
    assert(history.length > 0, `应有历史记录 (实际: ${history.length})`);
    const compAHistory = hc.getHistory({ componentId: 'comp_a' });
    assert(compAHistory.length > 0, '按组件过滤');
    const healthyHistory = hc.getHistory({ status: 'healthy' });
    assert(healthyHistory.length > 0, '按状态过滤');
    const successHistory = hc.getHistory({ success: true });
    assert(successHistory.length > 0, '按成功过滤');
    console.log('');

    // Test 17: 统计信息
    console.log('Test 17: 统计信息');
    const stats = hc.getStats();
    assert(stats.totalComponents === 1, `组件总数 (实际: ${stats.totalComponents})`);
    assert(typeof stats.healthy === 'number', '有 healthy 计数');
    assert(typeof stats.overallStatus === 'string', '有整体状态');
    assert(typeof stats.totalChecks === 'number', '有检查总数');
    assert(stats.running === false, '未运行');
    console.log('');

    // Test 18: 告警回调
    console.log('Test 18: 告警回调');
    const alerts = [];
    const alertHc = new HealthCheck({
      onAlert: (alert) => alerts.push(alert)
    });
    let alertCheckCount = 0;
    alertHc.register('alert_comp', {
      check: async () => {
        alertCheckCount++;
        if (alertCheckCount === 1) return { healthy: true };
        return { healthy: false };
      }
    });
    await alertHc.checkComponent('alert_comp'); // healthy
    await alertHc.checkComponent('alert_comp'); // degraded (状态变化)
    assert(alerts.length === 1, `应触发1次告警 (实际: ${alerts.length})`);
    assert(alerts[0].previousStatus === 'healthy', '之前状态为 healthy');
    assert(alerts[0].newStatus === 'degraded', '新状态为 degraded');
    assert(alerts[0].componentId === 'alert_comp', '告警组件ID正确');
    console.log('');

    // Test 19: 告警回调异常不影响主流程
    console.log('Test 19: 告警回调异常不影响主流程');
    const badAlertHc = new HealthCheck({
      onAlert: () => { throw new Error('告警崩溃'); }
    });
    let badAlertCount = 0;
    badAlertHc.register('bad_alert', {
      check: async () => {
        badAlertCount++;
        if (badAlertCount === 1) return { healthy: true };
        return { healthy: false };
      }
    });
    await badAlertHc.checkComponent('bad_alert'); // healthy
    const result19 = await badAlertHc.checkComponent('bad_alert'); // degraded
    assert(result19.status === 'degraded', '告警异常不影响检查结果');
    console.log('');

    // Test 20: start/stop
    console.log('Test 20: start/stop');
    const timerHc = new HealthCheck({ checkInterval: 100000 });
    timerHc.register('timer_comp', { check: async () => ({ healthy: true }) });
    timerHc.start();
    assert(timerHc.isRunning() === true, '启动后 running');
    timerHc.start(); // 重复启动无副作用
    assert(timerHc.isRunning() === true, '重复启动仍 running');
    timerHc.stop();
    assert(timerHc.isRunning() === false, '停止后 not running');
    console.log('');

    // Test 21: 清理历史
    console.log('Test 21: 清理历史');
    const clearHc = new HealthCheck();
    clearHc.register('c', { check: async () => ({ healthy: true }) });
    for (let i = 0; i < 5; i++) await clearHc.checkComponent('c');
    assert(clearHc.getHistory().length === 5, '5条历史');
    const cleared = clearHc.clearHistory(2);
    assert(cleared === 3, `清理了3条 (实际: ${cleared})`);
    assert(clearHc.getHistory().length === 2, '剩余2条');
    console.log('');

    // Test 22: 空组件 checkAll
    console.log('Test 22: 空组件 checkAll');
    const emptyHc = new HealthCheck();
    const emptyResult = await emptyHc.checkAll();
    assert(emptyResult.summary.total === 0, '无组件时总数为0');
    assert(emptyResult.status === 'healthy', '无组件时为 healthy');
    console.log('');

    // Test 23: 历史 limit 过滤
    console.log('Test 23: 历史 limit 过滤');
    const limitHistory = clearHc.getHistory({ limit: 1 });
    assert(limitHistory.length === 1, 'limit 过滤生效');
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

testHealthCheck()
  .then(success => process.exit(success ? 0 : 1))
  .catch(error => {
    console.error('💥 测试异常:', error);
    process.exit(1);
  });
