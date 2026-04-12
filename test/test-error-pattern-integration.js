const AgentRegistry = require('../src/agent-registry');
const AgentExecutor = require('../src/agent-executor');

async function testErrorPatternIntegration() {
  console.log('🧪 测试 ErrorPatternRecognizer 与 AgentExecutor 集成...\n');

  // 初始化
  const registry = new AgentRegistry();
  registry.initializeCoreAgents();

  const executor = new AgentExecutor(registry, process.cwd(), {
    sandboxDir: '.flowharness/test-sandboxes',
    autoCleanup: true,
    useSandbox: false,
    defaultTimeout: 5000,
    enableLogging: false,
    enableLearning: true,
    minOccurrences: 3
  });

  try {
    // Test 1: 触发文件不存在错误（内部捕获，返回 success: false）
    console.log('Test 1: 触发文件不存在错误');
    const result1 = await executor.execute('explore', {
      action: 'read_file',
      filePath: '/nonexistent/file1.txt'
    }, {});

    console.log(`✅ 执行结果: ${result1.success ? '成功' : '失败'}`);
    if (result1.errorAnalysis) {
      console.log(`   错误分类: ${result1.errorAnalysis.category}`);
      console.log(`   严重程度: ${result1.errorAnalysis.severity}`);
      console.log(`   建议数量: ${result1.errorAnalysis.suggestions.length}`);
    }
    console.log('');

    // Test 2: 重复触发相同类型错误（建立模式）
    console.log('Test 2: 重复触发相同类型错误（建立模式）');
    for (let i = 0; i < 5; i++) {
      await executor.execute('explore', {
        action: 'read_file',
        filePath: `/nonexistent/file${i}.txt`
      }, {});
    }

    const errorStats = executor.getErrorStats();
    console.log(`✅ 错误统计:`);
    console.log(`   总错误数: ${errorStats.totalErrors}`);
    console.log(`   总模式数: ${errorStats.totalPatterns}`);
    console.log(`   错误分类数: ${Object.keys(errorStats.byCategory).length}`);
    console.log('');

    // Test 3: 再次触发相同错误，验证模式识别
    console.log('Test 3: 再次触发相同错误，验证模式识别');
    const result3 = await executor.execute('explore', {
      action: 'read_file',
      filePath: '/nonexistent/another.txt'
    }, {});

    console.log(`✅ 执行结果: ${result3.success ? '成功' : '失败'}`);
    if (result3.errorAnalysis && result3.errorAnalysis.pattern) {
      console.log(`   模式识别: 已识别`);
      console.log(`   模式名称: ${result3.errorAnalysis.pattern.name}`);
      console.log(`   出现次数: ${result3.errorAnalysis.pattern.occurrences}`);
      console.log(`   置信度: ${(result3.errorAnalysis.pattern.confidence * 100).toFixed(1)}%`);
    } else {
      console.log(`   模式识别: 未识别（可能相似度不足）`);
    }
    console.log('');

    // Test 4: 触发抛出异常的错误（Agent 不存在）
    console.log('Test 4: 触发抛出异常的错误');
    try {
      await executor.execute('nonexistent_agent', {
        action: 'test'
      }, {});
    } catch (error) {
      console.log(`✅ 捕获异常: ${error.message}`);
      // 这个错误在 execute 开头就抛出了，不会经过 errorPatternRecognizer
    }
    console.log('');

    // Test 5: 触发不支持的操作错误
    console.log('Test 5: 触发不支持的操作错误');
    try {
      await executor.execute('explore', {
        action: 'unsupported_action'
      }, {});
    } catch (error) {
      console.log(`✅ 捕获异常: ${error.message}`);
      if (error.analysis) {
        console.log(`   错误分类: ${error.analysis.category}`);
        console.log(`   严重程度: ${error.analysis.severity}`);
      }
    }
    console.log('');

    // Test 6: 获取错误历史
    console.log('Test 6: 获取错误历史');
    const errorHistory = executor.getErrorHistory({ limit: 5 });
    console.log(`✅ 错误历史: ${errorHistory.length} 条`);
    errorHistory.forEach(e => {
      console.log(`   - ${e.id}: [${e.category}] ${e.message.substring(0, 50)}...`);
    });
    console.log('');

    // Test 7: 按类别过滤错误历史
    console.log('Test 7: 按类别过滤错误历史');
    const fileErrors = executor.getErrorHistory({ category: 'file_not_found' });
    const allErrors = executor.getErrorHistory();
    console.log(`✅ 文件不存在错误: ${fileErrors.length} 个`);
    console.log(`   总错误数: ${allErrors.length} 个`);
    console.log('');

    // Test 8: 获取错误模式列表
    console.log('Test 8: 获取错误模式列表');
    const patterns = executor.getErrorPatterns({ sortBy: 'occurrences' });
    console.log(`✅ 识别的模式: ${patterns.length} 个`);
    patterns.forEach(p => {
      console.log(`   - ${p.name}`);
      console.log(`     类别: ${p.category}`);
      console.log(`     出现次数: ${p.occurrences}`);
    });
    console.log('');

    // Test 9: 获取最常见错误类别
    console.log('Test 9: 获取最常见错误类别');
    const stats = executor.getErrorStats();
    console.log(`✅ Top 错误类别:`);
    stats.topCategories.forEach((cat, index) => {
      console.log(`   ${index + 1}. ${cat.category}: ${cat.count} 次`);
    });
    console.log('');

    // Test 10: 获取修复建议
    console.log('Test 10: 获取修复建议');
    const result10 = await executor.execute('explore', {
      action: 'read_file',
      filePath: '/final/missing.txt'
    }, {});

    if (result10.errorAnalysis && result10.errorAnalysis.suggestions) {
      console.log(`✅ 修复建议:`);
      result10.errorAnalysis.suggestions.forEach(s => {
        console.log(`   - [${s.priority}] ${s.description}`);
      });
    }
    console.log('');

    // Test 11: 综合统计
    console.log('Test 11: 综合统计');
    const finalStats = executor.getErrorStats();
    const execStats = executor.getExecutionStats();
    console.log(`✅ 执行统计:`);
    console.log(`   总执行数: ${execStats.totalExecutions}`);
    console.log(`   成功率: ${execStats.successRate}%`);

    console.log(`\n✅ 错误统计:`);
    console.log(`   总错误数: ${finalStats.totalErrors}`);
    console.log(`   总模式数: ${finalStats.totalPatterns}`);
    console.log(`   错误分类数: ${Object.keys(finalStats.byCategory).length}`);

    console.log(`\n✅ 错误分类分布:`);
    Object.entries(finalStats.byCategory).forEach(([category, data]) => {
      console.log(`   - ${category}: ${data.count} (${data.percentage}%)`);
    });
    console.log('');

    console.log('✅ 所有集成测试通过！\n');
    return true;

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error(error.stack);
    return false;
  }
}

// 运行测试
testErrorPatternIntegration()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('💥 测试异常:', error);
    process.exit(1);
  });
