const KnowledgeBase = require('../src/knowledge-base');
const fs = require('fs');
const path = require('path');
const os = require('os');

function testKnowledgeBase() {
  console.log('🧪 测试 KnowledgeBase...\n');

  let passed = 0;
  let failed = 0;

  // 使用临时目录
  const tmpDir = path.join(os.tmpdir(), `kb_test_${Date.now()}`);

  function assert(condition, msg) {
    if (condition) { passed++; console.log(`  ✅ ${msg}`); }
    else { failed++; console.log(`  ❌ ${msg}`); }
  }

  function cleanup() {
    try {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch (e) {}
  }

  try {
    // ---- Test 1: 基本实例化 ----
    console.log('\nTest 1: 基本实例化');
    const kb = new KnowledgeBase(tmpDir);
    assert(kb !== null, 'KnowledgeBase 创建成功');
    assert(kb.knowledgePath === tmpDir, '知识路径正确');
    assert(kb.patterns === null, '初始 patterns 为 null');
    assert(kb.metrics === null, '初始 metrics 为 null');

    // ---- Test 2: 默认配置 ----
    console.log('\nTest 2: 默认配置');
    const defaultKb = new KnowledgeBase();
    assert(defaultKb.knowledgePath === '.flowharness/knowledge', '默认路径正确');

    // ---- Test 3: 加载 (无文件，使用默认值) ----
    console.log('\nTest 3: 加载默认值');
    kb.load();
    assert(kb.patterns !== null, 'patterns 已加载');
    assert(kb.metrics !== null, 'metrics 已加载');
    assert(kb.patterns.version === '1.0', 'patterns 版本正确');
    assert(kb.metrics.version === '1.0', 'metrics 版本正确');
    assert(kb.patterns.statistics.total_runs === 0, '初始运行 0');

    // ---- Test 4: 默认 patterns 结构 ----
    console.log('\nTest 4: 默认 patterns 结构');
    const defaultPatterns = kb.getDefaultPatterns();
    assert(defaultPatterns.version === '1.0', '版本正确');
    assert(Array.isArray(defaultPatterns.successful_patterns), '有成功模式数组');
    assert(Array.isArray(defaultPatterns.failure_patterns), '有失败模式数组');
    assert(typeof defaultPatterns.statistics === 'object', '有统计对象');
    assert(defaultPatterns.statistics.total_runs === 0, '初始运行 0');
    assert(defaultPatterns.statistics.successful_runs === 0, '初始成功 0');
    assert(defaultPatterns.statistics.failed_runs === 0, '初始失败 0');
    assert(defaultPatterns.statistics.avg_execution_time === 0, '初始平均时间 0');

    // ---- Test 5: 默认 metrics 结构 ----
    console.log('\nTest 5: 默认 metrics 结构');
    const defaultMetrics = kb.getDefaultMetrics();
    assert(defaultMetrics.version === '1.0', '版本正确');
    assert(Array.isArray(defaultMetrics.metrics), '有指标数组');
    assert(typeof defaultMetrics.aggregated === 'object', '有聚合对象');

    // ---- Test 6: 记录成功执行 ----
    console.log('\nTest 6: 记录成功执行');
    kb.recordExecution('build', 'compile', {
      success: true,
      execution_time: 100
    });
    assert(kb.patterns.statistics.total_runs === 1, '运行次数 1');
    assert(kb.patterns.statistics.successful_runs === 1, '成功次数 1');
    assert(kb.patterns.statistics.failed_runs === 0, '失败次数 0');
    assert(kb.patterns.statistics.avg_execution_time === 100, '平均时间 100');

    // ---- Test 7: 记录失败执行 ----
    console.log('\nTest 7: 记录失败执行');
    kb.recordExecution('build', 'test', {
      success: false,
      execution_time: 50,
      error: 'Test failed: assertion error'
    });
    assert(kb.patterns.statistics.total_runs === 2, '运行次数 2');
    assert(kb.patterns.statistics.successful_runs === 1, '成功次数 1');
    assert(kb.patterns.statistics.failed_runs === 1, '失败次数 1');
    assert(kb.patterns.statistics.avg_execution_time === 75, '平均时间 75');

    // ---- Test 8: 成功模式记录 ----
    console.log('\nTest 8: 成功模式记录');
    assert(kb.patterns.successful_patterns.length === 1, '1 个成功模式');
    const sp = kb.patterns.successful_patterns[0];
    assert(sp.pattern === 'build:compile', '模式键正确');
    assert(sp.workflow === 'build', '工作流正确');
    assert(sp.step === 'compile', '步骤正确');
    assert(sp.success_count === 1, '成功次数 1');
    assert(sp.total_count === 1, '总次数 1');
    assert(sp.success_rate === 1, '成功率 100%');

    // ---- Test 9: 失败模式记录 ----
    console.log('\nTest 9: 失败模式记录');
    assert(kb.patterns.failure_patterns.length === 1, '1 个失败模式');
    const fp = kb.patterns.failure_patterns[0];
    assert(fp.pattern === 'build:test', '模式键正确');
    assert(fp.failure_count === 1, '失败次数 1');
    assert(fp.errors.includes('Test failed: assertion error'), '记录了错误');

    // ---- Test 10: 多次记录同一模式 ----
    console.log('\nTest 10: 多次记录同一模式');
    for (let i = 0; i < 9; i++) {
      kb.recordExecution('build', 'compile', {
        success: true,
        execution_time: 100 + i * 10
      });
    }
    const sp2 = kb.patterns.successful_patterns.find(p => p.pattern === 'build:compile');
    assert(sp2.success_count === 10, '成功次数 10');
    assert(sp2.total_count === 10, '总次数 10');
    assert(sp2.success_rate === 1, '成功率 100%');
    assert(sp2.recommendation === 'highly_reliable', '推荐为 highly_reliable');

    // ---- Test 11: 失败模式建议 ----
    console.log('\nTest 11: 失败模式建议');
    for (let i = 0; i < 5; i++) {
      kb.recordExecution('deploy', 'push', {
        success: false,
        execution_time: 200,
        error: i % 2 === 0 ? 'Connection timeout' : 'Auth failed'
      });
    }
    const fp2 = kb.patterns.failure_patterns.find(p => p.pattern === 'deploy:push');
    assert(fp2 !== undefined, '有 deploy:push 模式');
    assert(fp2.failure_count === 5, '失败次数 5');
    assert(fp2.recommendation === 'needs_attention', '推荐为 needs_attention');
    assert(fp2.suggestion !== undefined, '有建议');
    assert(fp2.errors.length === 2, '2 种不同错误');

    // ---- Test 12: 错误去重 ----
    console.log('\nTest 12: 错误去重');
    kb.recordExecution('deploy', 'push', {
      success: false,
      execution_time: 200,
      error: 'Connection timeout'  // 重复错误
    });
    const fp3 = kb.patterns.failure_patterns.find(p => p.pattern === 'deploy:push');
    assert(fp3.errors.length === 2, '重复错误不增加');

    // ---- Test 13: getOptimizations ----
    console.log('\nTest 13: getOptimizations');
    const optimizations = kb.getOptimizations();
    assert(Array.isArray(optimizations), '返回数组');
    // build:compile 成功率 > 0.95 且次数 >= 10 → enable
    const enableOpt = optimizations.find(o => o.type === 'enable');
    assert(enableOpt !== undefined, '有启用优化');
    assert(enableOpt.pattern === 'build:compile', '优化模式正确');
    assert(enableOpt.confidence > 0.95, '置信度高');

    // deploy:push 失败率 > 0.7 且次数 >= 5 → disable
    const disableOpt = optimizations.find(o => o.type === 'disable');
    assert(disableOpt !== undefined, '有禁用优化');
    assert(disableOpt.pattern === 'deploy:push', '优化模式正确');
    assert(disableOpt.errors.length > 0, '有错误列表');

    // ---- Test 14: 保存和重新加载 ----
    console.log('\nTest 14: 保存和重新加载');
    // 数据已在 recordExecution 中自动保存
    assert(fs.existsSync(path.join(tmpDir, 'patterns.json')), 'patterns.json 已创建');
    assert(fs.existsSync(path.join(tmpDir, 'metrics.json')), 'metrics.json 已创建');

    // 创建新实例重新加载
    const kb2 = new KnowledgeBase(tmpDir);
    kb2.load();
    assert(kb2.patterns.statistics.total_runs === kb.patterns.statistics.total_runs, '运行次数一致');
    assert(kb2.patterns.successful_patterns.length > 0, '有成功模式');
    assert(kb2.patterns.failure_patterns.length > 0, '有失败模式');

    // ---- Test 15: metrics 记录 ----
    console.log('\nTest 15: metrics 记录');
    assert(kb.metrics.metrics.length > 0, '有指标记录');
    const firstMetric = kb.metrics.metrics[0];
    assert(firstMetric.workflow === 'build', '工作流正确');
    assert(firstMetric.step === 'compile', '步骤正确');
    assert(firstMetric.success === true, '成功状态正确');
    assert(typeof firstMetric.timestamp === 'string', '有时间戳');

    // ---- Test 16: updateStatistics 平均时间计算 ----
    console.log('\nTest 16: 平均时间计算');
    const freshKb = new KnowledgeBase(path.join(tmpDir, 'fresh'));
    freshKb.load();
    freshKb.recordExecution('w', 's', { success: true, execution_time: 100 });
    freshKb.recordExecution('w', 's', { success: true, execution_time: 200 });
    freshKb.recordExecution('w', 's', { success: true, execution_time: 300 });
    assert(freshKb.patterns.statistics.avg_execution_time === 200, '平均时间 200');
    assert(freshKb.patterns.statistics.total_runs === 3, '运行次数 3');

    // ---- Test 17: reliable 推荐级别 ----
    console.log('\nTest 17: reliable 推荐级别');
    const relKb = new KnowledgeBase(path.join(tmpDir, 'reliable'));
    relKb.load();
    // 成功率 > 0.7 但 < 0.9 或次数 < 10
    for (let i = 0; i < 8; i++) {
      relKb.recordExecution('x', 'y', { success: true, execution_time: 50 });
    }
    const relPattern = relKb.patterns.successful_patterns[0];
    assert(relPattern.recommendation === 'reliable', '推荐为 reliable (8次,100%成功但<10次)');

  } catch (error) {
    console.log(`\n❌ 测试异常: ${error.message}`);
    console.log(error.stack);
    failed++;
  } finally {
    cleanup();
  }

  console.log(`\n========================================`);
  console.log(`测试结果: ${passed} 通过, ${failed} 失败`);
  if (failed === 0) {
    console.log('✅ 所有 KnowledgeBase 测试通过！');
  } else {
    console.log('❌ 有测试失败');
    process.exitCode = 1;
  }
}

testKnowledgeBase();
