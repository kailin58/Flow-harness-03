const KnowledgeBase = require('../src/knowledge-base');
const fs = require('fs');
const path = require('path');
const os = require('os');

function testKnowledgeMerge() {
  console.log('🧪 测试 KnowledgeBase 导出/合并...\n');

  let passed = 0;
  let failed = 0;

  const tmpDir = path.join(os.tmpdir(), `kb_merge_${Date.now()}`);

  function assert(condition, msg) {
    if (condition) { passed++; console.log(`  ✅ ${msg}`); }
    else { failed++; console.log(`  ❌ ${msg}`); }
  }

  function cleanup() {
    try {
      if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {}
  }

  try {
    // ---- Test 1: exportData 基本结构 ----
    console.log('\nTest 1: exportData 基本结构');
    const kb = new KnowledgeBase(path.join(tmpDir, 'a'));
    kb.load();
    // 积累一些数据
    for (let i = 0; i < 5; i++) {
      kb.recordExecution('build', 'compile', { success: true, execution_time: 100 + i * 10 });
    }
    kb.recordExecution('build', 'test', { success: false, execution_time: 50, error: 'assertion failed' });
    kb.recordExecution('build', 'test', { success: false, execution_time: 55, error: 'assertion failed' });
    kb.recordExecution('build', 'test', { success: false, execution_time: 60, error: 'timeout' });

    const pack = kb.exportData({ projectId: 'projectA' });
    assert(pack.version === '1.0', '版本正确');
    assert(pack.type === 'knowledge', '类型正确');
    assert(pack.projectId === 'projectA', '项目ID正确');
    assert(typeof pack.exportedAt === 'string', '有导出时间');
    assert(pack.patterns !== undefined, '有 patterns');
    assert(pack.metrics !== undefined, '有 metrics');

    // ---- Test 2: exportData 过滤低样本 ----
    console.log('\nTest 2: exportData 过滤低样本');
    const pack2 = kb.exportData({ minConfidence: 0.9 });
    // build:compile 有 5 次成功 (100% > 0.9) 且 total_count=5 >= 3
    assert(pack2.patterns.successful_patterns.length === 1, '只导出高置信度模式');
    assert(pack2.patterns.successful_patterns[0].pattern === 'build:compile', '模式正确');

    // ---- Test 3: exportData 包含统计 ----
    console.log('\nTest 3: exportData 包含统计');
    assert(pack.patterns.statistics.total_runs === 8, '总运行 8');
    assert(pack.patterns.statistics.successful_runs === 5, '成功 5');
    assert(pack.patterns.statistics.failed_runs === 3, '失败 3');

    // ---- Test 4: mergeData 基本合并 ----
    console.log('\nTest 4: mergeData 基本合并');
    const kb2 = new KnowledgeBase(path.join(tmpDir, 'b'));
    kb2.load();
    // kb2 是空的，合并 pack 进来
    const result = kb2.mergeData(pack);
    assert(result.success === true, '合并成功');
    assert(result.merged > 0, '有新增模式');
    assert(result.source === 'projectA', '来源正确');

    // ---- Test 5: 合并后数据正确 ----
    console.log('\nTest 5: 合并后数据正确');
    assert(kb2.patterns.successful_patterns.length > 0, '有成功模式');
    assert(kb2.patterns.failure_patterns.length > 0, '有失败模式');
    assert(kb2.patterns.statistics.total_runs === 8, '统计已合并');

    // ---- Test 6: 新模式置信度降级 ----
    console.log('\nTest 6: 新模式置信度降级');
    const imported = kb2.patterns.successful_patterns.find(p => p.pattern === 'build:compile');
    assert(imported !== undefined, '找到导入的模式');
    // 原始 success_rate=1.0, 导入后 0.8x = 0.8
    assert(imported.success_rate === 0.8, '置信度降级为 0.8');

    // ---- Test 7: 重复合并 — 加权更新 ----
    console.log('\nTest 7: 重复合并 — 加权更新');
    const result2 = kb2.mergeData(pack);
    assert(result2.success === true, '二次合并成功');
    assert(result2.updated > 0, '有更新的模式');
    // 合并后 total_count 应该增加
    const merged = kb2.patterns.successful_patterns.find(p => p.pattern === 'build:compile');
    assert(merged.total_count > 5, '计数已累加');

    // ---- Test 8: 失败模式错误去重 ----
    console.log('\nTest 8: 失败模式错误去重');
    const failPattern = kb2.patterns.failure_patterns.find(p => p.pattern === 'build:test');
    assert(failPattern !== undefined, '有失败模式');
    // 两次合并同一个错误，应该只有 1 个
    const uniqueErrors = failPattern.errors.filter((e, i, arr) => arr.indexOf(e) === i);
    assert(uniqueErrors.length === failPattern.errors.length, '错误已去重');

    // ---- Test 9: 无效包拒绝 ----
    console.log('\nTest 9: 无效包拒绝');
    const bad1 = kb2.mergeData(null);
    assert(bad1.success === false, 'null 拒绝');
    const bad2 = kb2.mergeData({ type: 'wrong' });
    assert(bad2.success === false, '错误类型拒绝');
    const bad3 = kb2.mergeData({ type: 'knowledge' });
    assert(bad3.success === false, '缺少 patterns 拒绝');

    // ---- Test 10: 持久化验证 ----
    console.log('\nTest 10: 持久化验证');
    // kb2 合并后应该已保存
    const kb3 = new KnowledgeBase(path.join(tmpDir, 'b'));
    kb3.load();
    assert(kb3.patterns.successful_patterns.length > 0, '重新加载后有数据');
    assert(kb3.patterns.statistics.total_runs > 0, '统计已持久化');

    // ---- Test 11: 空知识库导出 ----
    console.log('\nTest 11: 空知识库导出');
    const emptyKb = new KnowledgeBase(path.join(tmpDir, 'empty'));
    emptyKb.load();
    const emptyPack = emptyKb.exportData();
    assert(emptyPack.patterns.successful_patterns.length === 0, '空导出无模式');
    assert(emptyPack.patterns.statistics.total_runs === 0, '空导出无运行');

    // ---- Test 12: metrics 合并去重 ----
    console.log('\nTest 12: metrics 合并去重');
    const kb4 = new KnowledgeBase(path.join(tmpDir, 'c'));
    kb4.load();
    kb4.recordExecution('w', 's', { success: true, execution_time: 100 });
    const pack4 = kb4.exportData({ projectId: 'c' });
    const metricsBefore = kb4.metrics.metrics.length;
    kb4.mergeData(pack4); // 合并自己的数据
    // 相同 timestamp 的 metrics 不应重复
    assert(kb4.metrics.metrics.length === metricsBefore, 'metrics 去重正确');

    // ---- Test 13: 推荐级别重新评估 ----
    console.log('\nTest 13: 推荐级别重新评估');
    const kb5 = new KnowledgeBase(path.join(tmpDir, 'd'));
    kb5.load();
    for (let i = 0; i < 10; i++) {
      kb5.recordExecution('api', 'call', { success: true, execution_time: 50 });
    }
    const pack5 = kb5.exportData({ projectId: 'd' });
    const kb6 = new KnowledgeBase(path.join(tmpDir, 'e'));
    kb6.load();
    for (let i = 0; i < 10; i++) {
      kb6.recordExecution('api', 'call', { success: true, execution_time: 60 });
    }
    kb6.mergeData(pack5);
    const apiPattern = kb6.patterns.successful_patterns.find(p => p.pattern === 'api:call');
    assert(apiPattern.total_count === 20, '合并后总数 20');
    assert(apiPattern.recommendation === 'highly_reliable', '合并后推荐为 highly_reliable');

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
    console.log('✅ 所有 KnowledgeBase 合并测试通过！');
  } else {
    console.log('❌ 有测试失败');
    process.exitCode = 1;
  }
}

testKnowledgeMerge();
