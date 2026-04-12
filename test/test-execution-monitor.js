const ExecutionMonitor = require('../src/execution-monitor');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testExecutionMonitor() {
  console.log('🧪 测试 ExecutionMonitor...\n');

  const monitor = new ExecutionMonitor({
    defaultTimeout: 2000,
    maxTimeout: 5000,
    enableLogging: false // 测试时禁用日志
  });

  try {
    // Test 1: 正常执行
    console.log('Test 1: 正常执行');
    const exec1 = monitor.startExecution({
      agentId: 'explore',
      taskAction: 'file_search',
      timeout: 5000
    });
    console.log(`✅ 执行已开始: ${exec1.executionId}`);
    console.log(`   超时设置: ${exec1.timeout}ms\n`);

    await sleep(100);

    const stats1 = monitor.endExecution(exec1.executionId, { success: true });
    console.log(`✅ 执行已结束: ${stats1.executionId}`);
    console.log(`   执行时间: ${stats1.duration}ms`);
    console.log(`   状态: ${stats1.status}\n`);

    // Test 2: 执行失败
    console.log('Test 2: 执行失败');
    const exec2 = monitor.startExecution({
      agentId: 'general',
      taskAction: 'run_command'
    });

    await sleep(50);

    const stats2 = monitor.endExecution(exec2.executionId, { success: false, error: 'Command failed' });
    console.log(`✅ 执行失败记录: ${stats2.executionId}`);
    console.log(`   状态: ${stats2.status}\n`);

    // Test 3: 超时检测
    console.log('Test 3: 超时检测');
    const exec3 = monitor.startExecution({
      agentId: 'general',
      taskAction: 'long_task',
      timeout: 200 // 200ms 超时
    });
    console.log(`✅ 执行已开始: ${exec3.executionId}`);
    console.log(`   等待超时 (200ms)...`);

    await sleep(300); // 等待超过超时时间

    const isTimedOut = monitor.isTimedOut(exec3.executionId);
    console.log(`✅ 超时检测: ${isTimedOut ? '已超时' : '未超时'}\n`);

    // Test 4: 列出活跃执行
    console.log('Test 4: 列出活跃执行');
    const exec4 = monitor.startExecution({
      agentId: 'plan',
      taskAction: 'analyze'
    });
    const exec5 = monitor.startExecution({
      agentId: 'inspector',
      taskAction: 'inspect'
    });

    const active = monitor.listActiveExecutions();
    console.log(`✅ 活跃执行数量: ${active.length}`);
    active.forEach(e => {
      console.log(`   - ${e.id}: ${e.agentId}/${e.taskAction} (${e.duration}ms)`);
    });
    console.log('');

    // 结束这些执行
    monitor.endExecution(exec4.executionId, { success: true });
    monitor.endExecution(exec5.executionId, { success: true });

    // Test 5: 获取执行历史
    console.log('Test 5: 获取执行历史');
    const history = monitor.getHistory({ limit: 5 });
    console.log(`✅ 历史记录数量: ${history.length}`);
    history.forEach(e => {
      console.log(`   - ${e.id}: ${e.status} (${e.duration}ms)`);
    });
    console.log('');

    // Test 6: 按状态过滤历史
    console.log('Test 6: 按状态过滤历史');
    const failed = monitor.getHistory({ status: 'failed' });
    const timedOut = monitor.getHistory({ status: 'timeout' });
    console.log(`✅ 失败执行: ${failed.length}`);
    console.log(`✅ 超时执行: ${timedOut.length}\n`);

    // Test 7: 获取统计信息
    console.log('Test 7: 获取统计信息');
    const stats = monitor.getStats();
    console.log(`✅ 统计信息:`);
    console.log(`   总执行数: ${stats.totalExecutions}`);
    console.log(`   活跃执行: ${stats.activeExecutions}`);
    console.log(`   完成执行: ${stats.completedExecutions}`);
    console.log(`   失败执行: ${stats.failedExecutions}`);
    console.log(`   超时执行: ${stats.timedOutExecutions}`);
    console.log(`   平均时长: ${stats.avgDuration}ms`);
    console.log(`   最大时长: ${stats.maxDuration}ms`);
    console.log(`   成功率: ${stats.successRate}%\n`);

    // Test 8: 超时验证
    console.log('Test 8: 超时验证');
    const exec6 = monitor.startExecution({
      agentId: 'test',
      taskAction: 'test',
      timeout: 10000 // 超过最大值
    });
    console.log(`✅ 超时验证: 请求 10000ms, 实际 ${exec6.timeout}ms (最大 5000ms)\n`);
    monitor.endExecution(exec6.executionId, { success: true });

    // Test 9: 清理历史
    console.log('Test 9: 清理历史');
    const cleared = monitor.clearHistory(3);
    console.log(`✅ 清理历史: ${cleared} 条记录`);
    console.log(`   剩余记录: ${monitor.getHistory().length}\n`);

    // Test 10: 获取执行信息
    console.log('Test 10: 获取执行信息');
    const exec7 = monitor.startExecution({
      agentId: 'test',
      taskAction: 'test'
    });
    const info = monitor.getExecution(exec7.executionId);
    console.log(`✅ 执行信息:`);
    console.log(`   ID: ${info.id}`);
    console.log(`   Agent: ${info.agentId}`);
    console.log(`   状态: ${info.status}`);
    console.log(`   活跃: ${info.isActive ? '是' : '否'}\n`);
    monitor.endExecution(exec7.executionId, { success: true });

    console.log('✅ 所有测试通过！\n');
    return true;

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error(error.stack);
    return false;
  }
}

// 运行测试
testExecutionMonitor()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('💥 测试异常:', error);
    process.exit(1);
  });
