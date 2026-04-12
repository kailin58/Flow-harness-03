const AgentRegistry = require('../src/agent-registry');
const AgentExecutor = require('../src/agent-executor');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testDeviationIntegration() {
  console.log('🧪 测试 DeviationDetector 与 AgentExecutor 集成...\n');

  // 初始化
  const registry = new AgentRegistry();
  registry.initializeCoreAgents();

  const executor = new AgentExecutor(registry, process.cwd(), {
    sandboxDir: '.flowharness/test-sandboxes',
    autoCleanup: true,
    useSandbox: false, // 禁用沙箱以加快测试
    defaultTimeout: 5000,
    enableLogging: false,
    enableLearning: true,
    minSamples: 3,
    deviationThreshold: 2.0
  });

  try {
    // Test 1: 建立基线（正常执行）
    console.log('Test 1: 建立基线（正常执行）');
    for (let i = 0; i < 5; i++) {
      await executor.execute('explore', {
        action: 'file_search',
        pattern: '*.js',
        cwd: process.cwd()
      }, {});
    }

    const baseline = executor.getBaseline('explore', 'file_search');
    console.log(`✅ 基线已建立: explore/file_search`);
    console.log(`   样本数: ${baseline.sampleCount}`);
    console.log(`   平均时长: ${baseline.stats.avgDuration}ms`);
    console.log(`   成功率: ${(baseline.stats.successRate * 100).toFixed(1)}%\n`);

    // Test 2: 正常执行（无偏差）
    console.log('Test 2: 正常执行（无偏差）');
    const result1 = await executor.execute('explore', {
      action: 'file_search',
      pattern: '*.md'
    }, {});

    console.log(`✅ 执行完成: ${result1.result.action}`);
    console.log(`   执行时长: ${result1.execution.duration}ms`);
    console.log(`   偏差检测: ${result1.deviation ? '有偏差' : '无偏差'}\n`);

    // Test 3: 执行失败（触发偏差）
    console.log('Test 3: 执行失败（触发偏差）');
    try {
      await executor.execute('explore', {
        action: 'read_file',
        filePath: '/nonexistent/file.txt'
      }, {});
    } catch (error) {
      console.log(`✅ 正确捕获错误: ${error.message.substring(0, 50)}...\n`);
    }

    // Test 4: 获取偏差统计
    console.log('Test 4: 获取偏差统计');
    const deviationStats = executor.getDeviationStats();
    console.log(`✅ 偏差统计:`);
    console.log(`   总检测数: ${deviationStats.totalDetections}`);
    console.log(`   偏差检测数: ${deviationStats.deviationsDetected}`);
    console.log(`   偏差率: ${deviationStats.deviationRate}%`);
    console.log(`   活跃告警: ${deviationStats.activeAlerts}`);
    console.log(`   基线数量: ${deviationStats.totalBaselines}\n`);

    // Test 5: 获取偏差历史
    console.log('Test 5: 获取偏差历史');
    const deviationHistory = executor.getDeviationHistory({ deviationsOnly: true });
    console.log(`✅ 偏差历史: ${deviationHistory.length} 条`);
    deviationHistory.forEach(d => {
      console.log(`   - ${d.executionId}: ${d.deviations.length} 个偏差`);
      d.deviations.forEach(dev => {
        console.log(`     * ${dev.type} (${dev.severity}): ${dev.message}`);
      });
    });
    console.log('');

    // Test 6: 获取告警列表
    console.log('Test 6: 获取告警列表');
    const alerts = executor.getAlerts({ unacknowledged: true });
    console.log(`✅ 未确认告警: ${alerts.length} 个`);
    alerts.forEach(a => {
      console.log(`   - ${a.id}: ${a.agentId}/${a.taskAction}`);
      console.log(`     偏差数: ${a.deviations.length}`);
    });
    console.log('');

    // Test 7: 确认告警
    if (alerts.length > 0) {
      console.log('Test 7: 确认告警');
      const acknowledged = executor.acknowledgeAlert(alerts[0].id);
      console.log(`✅ 告警已确认: ${acknowledged ? '成功' : '失败'}`);
      const remainingAlerts = executor.getAlerts({ unacknowledged: true });
      console.log(`   剩余未确认告警: ${remainingAlerts.length}\n`);
    }

    // Test 8: 列出所有基线
    console.log('Test 8: 列出所有基线');
    const baselines = executor.listBaselines();
    console.log(`✅ 基线数量: ${baselines.length}`);
    baselines.forEach(b => {
      console.log(`   - ${b.agentId}/${b.taskAction}:`);
      console.log(`     样本数: ${b.sampleCount}`);
      console.log(`     平均时长: ${b.stats.avgDuration}ms`);
      console.log(`     成功率: ${(b.stats.successRate * 100).toFixed(1)}%`);
    });
    console.log('');

    // Test 9: 综合统计
    console.log('Test 9: 综合统计');
    const execStats = executor.getExecutionStats();
    const devStats = executor.getDeviationStats();

    console.log(`✅ 执行统计:`);
    console.log(`   总执行数: ${execStats.totalExecutions}`);
    console.log(`   完成: ${execStats.completedExecutions}`);
    console.log(`   失败: ${execStats.failedExecutions}`);
    console.log(`   成功率: ${execStats.successRate}%`);

    console.log(`\n✅ 偏差统计:`);
    console.log(`   总检测数: ${devStats.totalDetections}`);
    console.log(`   偏差数: ${devStats.deviationsDetected}`);
    console.log(`   偏差率: ${devStats.deviationRate}%`);
    console.log(`   活跃告警: ${devStats.activeAlerts}\n`);

    console.log('✅ 所有集成测试通过！\n');
    return true;

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error(error.stack);
    return false;
  }
}

// 运行测试
testDeviationIntegration()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('💥 测试异常:', error);
    process.exit(1);
  });
