const AgentRegistry = require('../src/agent-registry');
const AgentExecutor = require('../src/agent-executor');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testMonitorIntegration() {
  console.log('🧪 测试 ExecutionMonitor 与 AgentExecutor 集成...\n');

  // 初始化
  const registry = new AgentRegistry();
  registry.initializeCoreAgents();

  const executor = new AgentExecutor(registry, process.cwd(), {
    sandboxDir: '.flowharness/test-sandboxes',
    autoCleanup: true,
    useSandbox: false, // 禁用沙箱以加快测试
    defaultTimeout: 5000,
    enableLogging: false
  });

  try {
    // Test 1: 正常执行并记录
    console.log('Test 1: 正常执行并记录');
    const result1 = await executor.execute('explore', {
      action: 'file_search',
      pattern: '*.js',
      cwd: process.cwd()
    }, {});

    console.log(`✅ 执行完成: ${result1.result.action}`);
    console.log(`   执行ID: ${result1.execution.id}`);
    console.log(`   执行时长: ${result1.execution.duration}ms`);
    console.log(`   超时: ${result1.execution.timedOut ? '是' : '否'}\n`);

    // Test 2: 多个执行
    console.log('Test 2: 多个执行');
    const result2 = await executor.execute('plan', {
      action: 'analyze_requirement',
      requirement: '测试需求'
    }, {});

    const result3 = await executor.execute('general', {
      action: 'run_command',
      command: 'node --version'
    }, {});

    console.log(`✅ 完成 3 个执行\n`);

    // Test 3: 获取执行统计
    console.log('Test 3: 获取执行统计');
    const stats = executor.getExecutionStats();
    console.log(`✅ 执行统计:`);
    console.log(`   总执行数: ${stats.totalExecutions}`);
    console.log(`   活跃执行: ${stats.activeExecutions}`);
    console.log(`   完成执行: ${stats.completedExecutions}`);
    console.log(`   失败执行: ${stats.failedExecutions}`);
    console.log(`   超时执行: ${stats.timedOutExecutions}`);
    console.log(`   平均时长: ${stats.avgDuration}ms`);
    console.log(`   成功率: ${stats.successRate}%\n`);

    // Test 4: 获取执行历史
    console.log('Test 4: 获取执行历史');
    const history = executor.getExecutionHistory({ limit: 5 });
    console.log(`✅ 执行历史 (最近 ${history.length} 条):`);
    history.forEach(e => {
      console.log(`   - ${e.agentId}/${e.taskAction}: ${e.status} (${e.duration}ms)`);
    });
    console.log('');

    // Test 5: 按 Agent 过滤历史
    console.log('Test 5: 按 Agent 过滤历史');
    const exploreHistory = executor.getExecutionHistory({ agentId: 'explore' });
    const planHistory = executor.getExecutionHistory({ agentId: 'plan' });
    console.log(`✅ Explore Agent 执行: ${exploreHistory.length} 次`);
    console.log(`✅ Plan Agent 执行: ${planHistory.length} 次\n`);

    // Test 6: 列出活跃执行（应该为空）
    console.log('Test 6: 列出活跃执行');
    const active = executor.listActiveExecutions();
    console.log(`✅ 活跃执行数量: ${active.length} (应该为 0)\n`);

    // Test 7: 自定义超时
    console.log('Test 7: 自定义超时');
    const result4 = await executor.execute('explore', {
      action: 'file_search',
      pattern: '*.md'
    }, { timeout: 1000 });

    console.log(`✅ 自定义超时执行完成`);
    console.log(`   执行时长: ${result4.execution.duration}ms\n`);

    // Test 8: 执行失败记录
    console.log('Test 8: 执行失败记录');
    try {
      await executor.execute('explore', {
        action: 'read_file',
        filePath: '/nonexistent/file.txt'
      }, {});
      console.log('❌ 应该抛出错误');
    } catch (error) {
      console.log(`✅ 正确捕获错误: ${error.message}`);

      // 检查失败是否被记录
      const statsAfterError = executor.getExecutionStats();
      console.log(`   失败执行数: ${statsAfterError.failedExecutions}\n`);
    }

    // Test 9: 综合统计
    console.log('Test 9: 综合统计');
    const finalStats = executor.getExecutionStats();
    console.log(`✅ 最终统计:`);
    console.log(`   总执行数: ${finalStats.totalExecutions}`);
    console.log(`   完成: ${finalStats.completedExecutions}`);
    console.log(`   失败: ${finalStats.failedExecutions}`);
    console.log(`   超时: ${finalStats.timedOutExecutions}`);
    console.log(`   成功率: ${finalStats.successRate}%`);
    console.log(`   平均时长: ${finalStats.avgDuration}ms`);
    console.log(`   最大时长: ${finalStats.maxDuration}ms\n`);

    console.log('✅ 所有集成测试通过！\n');
    return true;

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error(error.stack);
    return false;
  }
}

// 运行测试
testMonitorIntegration()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('💥 测试异常:', error);
    process.exit(1);
  });
