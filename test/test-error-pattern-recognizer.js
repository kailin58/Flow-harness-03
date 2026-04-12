const ErrorPatternRecognizer = require('../src/error-pattern-recognizer');

async function testErrorPatternRecognizer() {
  console.log('🧪 测试 ErrorPatternRecognizer...\n');

  const recognizer = new ErrorPatternRecognizer({
    minOccurrences: 3,
    similarityThreshold: 0.7
  });

  try {
    // Test 1: 错误分类 - 超时错误
    console.log('Test 1: 错误分类 - 超时错误');
    const timeoutError = {
      message: 'Execution timeout after 5000ms',
      agentId: 'explore',
      taskAction: 'file_search'
    };

    const analysis1 = recognizer.recordError(timeoutError);
    console.log(`✅ 错误分类: ${analysis1.category}`);
    console.log(`   严重程度: ${analysis1.severity}`);
    console.log(`   建议数量: ${analysis1.suggestions.length}\n`);

    // Test 2: 错误分类 - 文件不存在
    console.log('Test 2: 错误分类 - 文件不存在');
    const fileNotFoundError = {
      message: 'ENOENT: no such file or directory, open \'/path/to/file.js\'',
      stack: 'Error: ENOENT\n    at Object.openSync (fs.js:476:3)',
      agentId: 'explore',
      taskAction: 'read_file'
    };

    const analysis2 = recognizer.recordError(fileNotFoundError);
    console.log(`✅ 错误分类: ${analysis2.category}`);
    console.log(`   根因: ${analysis2.rootCause.description}`);
    console.log(`   可能原因: ${analysis2.rootCause.possibleCauses.length} 个`);
    analysis2.rootCause.possibleCauses.forEach(cause => {
      console.log(`   - ${cause}`);
    });
    console.log('');

    // Test 3: 错误分类 - 权限错误
    console.log('Test 3: 错误分类 - 权限错误');
    const permissionError = {
      message: 'EACCES: permission denied, access \'/root/file.txt\'',
      agentId: 'general',
      taskAction: 'edit_file'
    };

    const analysis3 = recognizer.recordError(permissionError);
    console.log(`✅ 错误分类: ${analysis3.category}`);
    console.log(`   严重程度: ${analysis3.severity}`);
    console.log(`   建议:`);
    analysis3.suggestions.forEach(s => {
      console.log(`   - [${s.priority}] ${s.description}`);
    });
    console.log('');

    // Test 4: 错误分类 - 网络错误
    console.log('Test 4: 错误分类 - 网络错误');
    const networkError = {
      message: 'ECONNREFUSED: Connection refused at 127.0.0.1:3000',
      agentId: 'general',
      taskAction: 'api_call'
    };

    const analysis4 = recognizer.recordError(networkError);
    console.log(`✅ 错误分类: ${analysis4.category}`);
    console.log(`   根因: ${analysis4.rootCause.description}\n`);

    // Test 5: 错误分类 - 语法错误
    console.log('Test 5: 错误分类 - 语法错误');
    const syntaxError = {
      message: 'SyntaxError: Unexpected token }',
      stack: 'SyntaxError: Unexpected token }\n    at Module._compile (internal/modules/cjs/loader.js:723:23)\n    at Object.Module._extensions..js (internal/modules/cjs/loader.js:789:10)\n    at Module.load (internal/modules/cjs/loader.js:653:32)\n    at tryModuleLoad (internal/modules/cjs/loader.js:593:12)\n    at Function.Module._load (internal/modules/cjs/loader.js:585:3)\n    at Function.Module.runMain (internal/modules/cjs/loader.js:831:12)\n    at startup (internal/bootstrap/node.js:283:19)\n    at bootstrapNodeJSCore (internal/bootstrap/node.js:623:3)\n    at /path/to/file.js:42:5',
      agentId: 'general',
      taskAction: 'run_command'
    };

    const analysis5 = recognizer.recordError(syntaxError);
    console.log(`✅ 错误分类: ${analysis5.category}`);
    console.log(`   严重程度: ${analysis5.severity}`);
    console.log(`   提取的行号: ${analysis5.rootCause.category === 'syntax_error' ? '已提取' : '未提取'}\n`);

    // Test 6: 建立错误模式（重复错误）
    console.log('Test 6: 建立错误模式（重复错误）');
    for (let i = 0; i < 5; i++) {
      recognizer.recordError({
        message: 'ENOENT: no such file or directory, open \'/config/settings.json\'',
        agentId: 'explore',
        taskAction: 'read_file'
      });
    }

    const analysis6 = recognizer.recordError({
      message: 'ENOENT: no such file or directory, open \'/config/app.json\'',
      agentId: 'explore',
      taskAction: 'read_file'
    });

    console.log(`✅ 模式识别: ${analysis6.pattern ? '已识别' : '未识别'}`);
    if (analysis6.pattern) {
      console.log(`   模式ID: ${analysis6.pattern.id}`);
      console.log(`   模式名称: ${analysis6.pattern.name}`);
      console.log(`   出现次数: ${analysis6.pattern.occurrences}`);
      console.log(`   置信度: ${(analysis6.pattern.confidence * 100).toFixed(1)}%`);
    }
    console.log('');

    // Test 7: 获取错误统计
    console.log('Test 7: 获取错误统计');
    const stats = recognizer.getStats();
    console.log(`✅ 统计信息:`);
    console.log(`   总错误数: ${stats.totalErrors}`);
    console.log(`   总模式数: ${stats.totalPatterns}`);
    console.log(`   错误分类:`);
    Object.entries(stats.byCategory).forEach(([category, data]) => {
      console.log(`   - ${category}: ${data.count} (${data.percentage}%)`);
    });
    console.log('');

    // Test 8: 获取最常见错误类别
    console.log('Test 8: 获取最常见错误类别');
    console.log(`✅ Top 5 错误类别:`);
    stats.topCategories.forEach((cat, index) => {
      console.log(`   ${index + 1}. ${cat.category}: ${cat.count} 次`);
    });
    console.log('');

    // Test 9: 获取最活跃模式
    console.log('Test 9: 获取最活跃模式');
    console.log(`✅ Top 5 错误模式:`);
    stats.topPatterns.forEach((pattern, index) => {
      console.log(`   ${index + 1}. ${pattern.name}`);
      console.log(`      出现次数: ${pattern.occurrences}`);
      console.log(`      置信度: ${(pattern.confidence * 100).toFixed(1)}%`);
    });
    console.log('');

    // Test 10: 获取错误历史（按类别过滤）
    console.log('Test 10: 获取错误历史（按类别过滤）');
    const fileErrors = recognizer.getErrorHistory({ category: 'file_not_found' });
    console.log(`✅ 文件不存在错误: ${fileErrors.length} 个`);
    fileErrors.slice(0, 3).forEach(e => {
      console.log(`   - ${e.id}: ${e.message.substring(0, 50)}...`);
    });
    console.log('');

    // Test 11: 获取模式列表
    console.log('Test 11: 获取模式列表');
    const patterns = recognizer.getPatterns({ sortBy: 'occurrences' });
    console.log(`✅ 识别的模式: ${patterns.length} 个`);
    patterns.forEach(p => {
      console.log(`   - ${p.name}`);
      console.log(`     类别: ${p.category}`);
      console.log(`     出现次数: ${p.occurrences}`);
      console.log(`     首次出现: ${new Date(p.firstSeen).toLocaleTimeString()}`);
      console.log(`     最后出现: ${new Date(p.lastSeen).toLocaleTimeString()}`);
    });
    console.log('');

    // Test 12: 测试类型错误
    console.log('Test 12: 测试类型错误');
    const typeError = {
      message: 'TypeError: Cannot read property \'length\' of undefined',
      agentId: 'plan',
      taskAction: 'analyze'
    };

    const analysis7 = recognizer.recordError(typeError);
    console.log(`✅ 错误分类: ${analysis7.category}`);
    console.log(`   严重程度: ${analysis7.severity}`);
    console.log(`   建议数量: ${analysis7.suggestions.length}\n`);

    // Test 13: 测试依赖错误
    console.log('Test 13: 测试依赖错误');
    const dependencyError = {
      message: 'Error: Cannot find module \'express\'',
      agentId: 'general',
      taskAction: 'run_command'
    };

    const analysis8 = recognizer.recordError(dependencyError);
    console.log(`✅ 错误分类: ${analysis8.category}`);
    console.log(`   根因: ${analysis8.rootCause.description}`);
    console.log(`   建议:`);
    analysis8.suggestions.forEach(s => {
      console.log(`   - [${s.priority}] ${s.description}`);
    });
    console.log('');

    // Test 14: 测试资源耗尽错误
    console.log('Test 14: 测试资源耗尽错误');
    const resourceError = {
      message: 'Error: ENOMEM: out of memory',
      agentId: 'general',
      taskAction: 'process_data'
    };

    const analysis9 = recognizer.recordError(resourceError);
    console.log(`✅ 错误分类: ${analysis9.category}`);
    console.log(`   严重程度: ${analysis9.severity}`);
    console.log(`   根因: ${analysis9.rootCause.description}\n`);

    // Test 15: 测试高频错误的严重程度提升
    console.log('Test 15: 测试高频错误的严重程度提升');
    for (let i = 0; i < 10; i++) {
      recognizer.recordError({
        message: 'Network timeout',
        agentId: 'general',
        taskAction: 'api_call'
      });
    }

    const analysis10 = recognizer.recordError({
      message: 'Network timeout',
      agentId: 'general',
      taskAction: 'api_call'
    });

    console.log(`✅ 高频错误分析:`);
    console.log(`   模式: ${analysis10.pattern ? '已识别' : '未识别'}`);
    if (analysis10.pattern) {
      console.log(`   出现次数: ${analysis10.pattern.occurrences}`);
    }
    console.log(`   严重程度: ${analysis10.severity}`);
    console.log(`   建议数量: ${analysis10.suggestions.length}`);
    if (analysis10.suggestions[0].priority === 'critical') {
      console.log(`   ✅ 已添加高优先级建议: ${analysis10.suggestions[0].description}`);
    }
    console.log('');

    // Test 16: 清理历史
    console.log('Test 16: 清理历史');
    const beforeCount = recognizer.getStats().totalErrors;
    const cleared = recognizer.clearHistory(10);
    const afterCount = recognizer.getStats().totalErrors;
    console.log(`✅ 清理历史: ${cleared} 条记录`);
    console.log(`   清理前: ${beforeCount}`);
    console.log(`   清理后: ${afterCount}\n`);

    // Test 17: 最终统计
    console.log('Test 17: 最终统计');
    const finalStats = recognizer.getStats();
    console.log(`✅ 最终统计:`);
    console.log(`   总错误数: ${finalStats.totalErrors}`);
    console.log(`   总模式数: ${finalStats.totalPatterns}`);
    console.log(`   错误类别数: ${Object.keys(finalStats.byCategory).length}`);
    console.log(`   最常见错误: ${finalStats.topCategories[0]?.category || 'N/A'} (${finalStats.topCategories[0]?.count || 0} 次)`);
    console.log('');

    console.log('✅ 所有测试通过！\n');
    return true;

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error(error.stack);
    return false;
  }
}

// 运行测试
testErrorPatternRecognizer()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('💥 测试异常:', error);
    process.exit(1);
  });
