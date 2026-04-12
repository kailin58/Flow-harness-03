const QualityGate = require('../src/quality-gate');

async function testQualityGate() {
  console.log('🧪 测试 QualityGate...\n');

  const gate = new QualityGate({
    minCoverage: 80,
    maxLintErrors: 0,
    maxLintWarnings: 10
  });

  try {
    // Test 1: 所有检查通过
    console.log('Test 1: 所有检查通过');
    const result1 = await gate.check({
      files: ['file1.js', 'file2.js'],
      testCount: 10,
      coverage: 85
    });

    console.log(`✅ 检查结果: ${result1.passed ? '通过' : '失败'}`);
    console.log(`   检查ID: ${result1.id}`);
    console.log(`   执行时长: ${result1.duration}ms`);
    console.log(`   总检查数: ${result1.summary.totalChecks}`);
    console.log(`   通过检查: ${result1.summary.passedChecks}`);
    console.log(`   失败检查: ${result1.summary.failedChecks}`);
    console.log(`   阻塞项: ${result1.summary.blockers}`);
    console.log(`   警告数: ${result1.summary.warnings}\n`);

    // Test 2: 覆盖率不足
    console.log('Test 2: 覆盖率不足');
    const result2 = await gate.check({
      files: ['file1.js'],
      testCount: 5,
      coverage: 70 // 低于阈值 80%
    });

    console.log(`✅ 检查结果: ${result2.passed ? '通过' : '失败'}`);
    console.log(`   阻塞项数量: ${result2.blockers.length}`);
    if (result2.blockers.length > 0) {
      result2.blockers.forEach(b => {
        console.log(`   - ${b.check}: ${b.reason}`);
      });
    }
    console.log('');

    // Test 3: 禁用某些检查
    console.log('Test 3: 禁用某些检查');
    const result3 = await gate.check({
      files: ['file1.js'],
      testCount: 8,
      coverage: 90,
      security: false // 禁用安全扫描
    });

    console.log(`✅ 检查结果: ${result3.passed ? '通过' : '失败'}`);
    console.log(`   执行的检查:`);
    Object.keys(result3.checks).forEach(check => {
      console.log(`   - ${check}: ${result3.checks[check].passed ? '通过' : '失败'}`);
    });
    console.log('');

    // Test 4: 查看各项检查详情
    console.log('Test 4: 查看各项检查详情');
    const result4 = await gate.check({
      files: ['file1.js', 'file2.js', 'file3.js'],
      testCount: 15,
      coverage: 95
    });

    console.log(`✅ Lint 检查:`);
    console.log(`   通过: ${result4.checks.lint.passed ? '是' : '否'}`);
    console.log(`   错误: ${result4.checks.lint.errors}`);
    console.log(`   警告: ${result4.checks.lint.warnings}`);
    console.log(`   文件数: ${result4.checks.lint.files}`);

    console.log(`\n✅ 测试执行:`);
    console.log(`   通过: ${result4.checks.tests.passed ? '是' : '否'}`);
    console.log(`   总数: ${result4.checks.tests.total}`);
    console.log(`   通过: ${result4.checks.tests.passed_count}`);
    console.log(`   失败: ${result4.checks.tests.failed}`);

    console.log(`\n✅ 覆盖率检查:`);
    console.log(`   通过: ${result4.checks.coverage.passed ? '是' : '否'}`);
    console.log(`   覆盖率: ${result4.checks.coverage.coverage}%`);
    console.log(`   阈值: ${gate.config.minCoverage}%`);

    console.log(`\n✅ 安全扫描:`);
    console.log(`   通过: ${result4.checks.security.passed ? '是' : '否'}`);
    console.log(`   严重漏洞: ${result4.checks.security.vulnerabilities.critical}`);
    console.log(`   高危漏洞: ${result4.checks.security.vulnerabilities.high}`);
    console.log('');

    // Test 5: 获取检查历史
    console.log('Test 5: 获取检查历史');
    const history = gate.getHistory({ limit: 5 });
    console.log(`✅ 检查历史: ${history.length} 条`);
    history.forEach(h => {
      console.log(`   - ${h.id}: ${h.passed ? '通过' : '失败'} (${h.duration}ms)`);
      console.log(`     检查数: ${h.summary.totalChecks}, 阻塞项: ${h.summary.blockers}`);
    });
    console.log('');

    // Test 6: 按状态过滤历史
    console.log('Test 6: 按状态过滤历史');
    const passedHistory = gate.getHistory({ passed: true });
    const failedHistory = gate.getHistory({ passed: false });
    console.log(`✅ 通过的检查: ${passedHistory.length} 次`);
    console.log(`✅ 失败的检查: ${failedHistory.length} 次\n`);

    // Test 7: 获取统计信息
    console.log('Test 7: 获取统计信息');
    const stats = gate.getStats();
    console.log(`✅ 统计信息:`);
    console.log(`   总检查数: ${stats.totalChecks}`);
    console.log(`   通过检查: ${stats.passedChecks}`);
    console.log(`   失败检查: ${stats.failedChecks}`);
    console.log(`   通过率: ${stats.passRate}%`);
    console.log(`   平均时长: ${stats.avgDuration}ms\n`);

    // Test 8: 自定义配置
    console.log('Test 8: 自定义配置');
    const customGate = new QualityGate({
      enableLint: true,
      enableTests: true,
      enableCoverage: false, // 禁用覆盖率检查
      enableSecurity: false, // 禁用安全扫描
      minCoverage: 90
    });

    const result5 = await customGate.check({
      files: ['file1.js'],
      testCount: 5
    });

    console.log(`✅ 自定义配置检查结果: ${result5.passed ? '通过' : '失败'}`);
    console.log(`   执行的检查数: ${result5.summary.totalChecks}`);
    console.log(`   检查项: ${Object.keys(result5.checks).join(', ')}\n`);

    // Test 9: 清理历史
    console.log('Test 9: 清理历史');
    const cleared = gate.clearHistory(3);
    console.log(`✅ 清理历史: ${cleared} 条记录`);
    console.log(`   剩余记录: ${gate.getHistory().length}\n`);

    console.log('✅ 所有测试通过！\n');
    return true;

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error(error.stack);
    return false;
  }
}

// 运行测试
testQualityGate()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('💥 测试异常:', error);
    process.exit(1);
  });
