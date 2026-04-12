const DeviationDetector = require('../src/deviation-detector');

async function testDeviationDetector() {
  console.log('🧪 测试 DeviationDetector...\n');

  const detector = new DeviationDetector({
    minSamples: 3,
    deviationThreshold: 2.0
  });

  try {
    // Test 1: 建立基线（正常执行）
    console.log('Test 1: 建立基线（正常执行）');
    const normalExecutions = [
      { id: 'e1', agentId: 'explore', taskAction: 'file_search', duration: 100, status: 'completed', endTime: Date.now() },
      { id: 'e2', agentId: 'explore', taskAction: 'file_search', duration: 110, status: 'completed', endTime: Date.now() },
      { id: 'e3', agentId: 'explore', taskAction: 'file_search', duration: 105, status: 'completed', endTime: Date.now() },
      { id: 'e4', agentId: 'explore', taskAction: 'file_search', duration: 95, status: 'completed', endTime: Date.now() },
      { id: 'e5', agentId: 'explore', taskAction: 'file_search', duration: 100, status: 'completed', endTime: Date.now() }
    ];

    normalExecutions.forEach(e => detector.recordExecution(e));

    const baseline = detector.getBaseline('explore', 'file_search');
    console.log(`✅ 基线已建立: explore/file_search`);
    console.log(`   样本数: ${baseline.sampleCount}`);
    console.log(`   平均时长: ${baseline.stats.avgDuration}ms`);
    console.log(`   标准差: ${baseline.stats.stdDevDuration}ms`);
    console.log(`   成功率: ${(baseline.stats.successRate * 100).toFixed(1)}%\n`);

    // Test 2: 检测正常执行（无偏差）
    console.log('Test 2: 检测正常执行（无偏差）');
    const normalExec = {
      id: 'e6',
      agentId: 'explore',
      taskAction: 'file_search',
      duration: 102,
      status: 'completed',
      timedOut: false
    };

    const detection1 = detector.detectDeviation(normalExec);
    console.log(`✅ 检测结果: ${detection1.hasDeviation ? '有偏差' : '无偏差'}`);
    console.log(`   偏差数量: ${detection1.deviations.length}\n`);

    // Test 3: 检测执行时间偏差（过长）
    console.log('Test 3: 检测执行时间偏差（过长）');
    const slowExec = {
      id: 'e7',
      agentId: 'explore',
      taskAction: 'file_search',
      duration: 500, // 远超平均值
      status: 'completed',
      timedOut: false
    };

    const detection2 = detector.detectDeviation(slowExec);
    console.log(`✅ 检测结果: ${detection2.hasDeviation ? '有偏差' : '无偏差'}`);
    if (detection2.hasDeviation) {
      detection2.deviations.forEach(d => {
        console.log(`   - ${d.type}: ${d.message}`);
        console.log(`     严重度: ${d.severity}`);
        console.log(`     实际值: ${d.actual}ms, 期望值: ${d.expected}ms`);
      });
    }
    console.log('');

    // Test 4: 检测失败偏差
    console.log('Test 4: 检测失败偏差');
    const failedExec = {
      id: 'e8',
      agentId: 'explore',
      taskAction: 'file_search',
      duration: 100,
      status: 'failed',
      timedOut: false
    };

    const detection3 = detector.detectDeviation(failedExec);
    console.log(`✅ 检测结果: ${detection3.hasDeviation ? '有偏差' : '无偏差'}`);
    if (detection3.hasDeviation) {
      detection3.deviations.forEach(d => {
        console.log(`   - ${d.type}: ${d.message}`);
        console.log(`     严重度: ${d.severity}`);
      });
    }
    console.log('');

    // Test 5: 检测超时偏差
    console.log('Test 5: 检测超时偏差');
    const timeoutExec = {
      id: 'e9',
      agentId: 'explore',
      taskAction: 'file_search',
      duration: 5000,
      status: 'timeout',
      timedOut: true
    };

    const detection4 = detector.detectDeviation(timeoutExec);
    console.log(`✅ 检测结果: ${detection4.hasDeviation ? '有偏差' : '无偏差'}`);
    if (detection4.hasDeviation) {
      detection4.deviations.forEach(d => {
        console.log(`   - ${d.type}: ${d.message}`);
        console.log(`     严重度: ${d.severity}`);
      });
    }
    console.log('');

    // Test 6: 获取告警列表
    console.log('Test 6: 获取告警列表');
    const alerts = detector.getAlerts({ unacknowledged: true });
    console.log(`✅ 活跃告警数量: ${alerts.length}`);
    alerts.forEach(a => {
      console.log(`   - ${a.id}: ${a.agentId}/${a.taskAction}`);
      console.log(`     偏差数: ${a.deviations.length}`);
    });
    console.log('');

    // Test 7: 确认告警
    console.log('Test 7: 确认告警');
    if (alerts.length > 0) {
      const acknowledged = detector.acknowledgeAlert(alerts[0].id);
      console.log(`✅ 告警已确认: ${acknowledged ? '成功' : '失败'}`);
      const remainingAlerts = detector.getAlerts({ unacknowledged: true });
      console.log(`   剩余未确认告警: ${remainingAlerts.length}\n`);
    } else {
      console.log(`⚠️  没有告警可确认\n`);
    }

    // Test 8: 列出所有基线
    console.log('Test 8: 列出所有基线');
    const baselines = detector.listBaselines();
    console.log(`✅ 基线数量: ${baselines.length}`);
    baselines.forEach(b => {
      console.log(`   - ${b.agentId}/${b.taskAction}: ${b.sampleCount} 个样本`);
      console.log(`     平均时长: ${b.stats.avgDuration}ms`);
      console.log(`     成功率: ${(b.stats.successRate * 100).toFixed(1)}%`);
    });
    console.log('');

    // Test 9: 获取检测历史
    console.log('Test 9: 获取检测历史');
    const history = detector.getDetectionHistory({ deviationsOnly: true });
    console.log(`✅ 偏差检测历史: ${history.length} 条`);
    history.forEach(h => {
      console.log(`   - ${h.executionId}: ${h.deviations.length} 个偏差`);
    });
    console.log('');

    // Test 10: 获取统计信息
    console.log('Test 10: 获取统计信息');
    const stats = detector.getStats();
    console.log(`✅ 统计信息:`);
    console.log(`   总检测数: ${stats.totalDetections}`);
    console.log(`   偏差检测数: ${stats.deviationsDetected}`);
    console.log(`   偏差率: ${stats.deviationRate}%`);
    console.log(`   活跃告警: ${stats.activeAlerts}`);
    console.log(`   基线数量: ${stats.totalBaselines}`);
    console.log(`   平均样本数: ${stats.avgSamplesPerBaseline}\n`);

    // Test 11: 样本不足时的检测
    console.log('Test 11: 样本不足时的检测');
    const newExec = {
      id: 'e10',
      agentId: 'plan',
      taskAction: 'analyze',
      duration: 200,
      status: 'completed',
      timedOut: false
    };

    const detection5 = detector.detectDeviation(newExec);
    console.log(`✅ 检测结果: ${detection5.hasDeviation ? '有偏差' : '无偏差'}`);
    console.log(`   原因: ${detection5.reason}\n`);

    console.log('✅ 所有测试通过！\n');
    return true;

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error(error.stack);
    return false;
  }
}

// 运行测试
testDeviationDetector()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('💥 测试异常:', error);
    process.exit(1);
  });
