const { MemoryStore, MemoryEntry, MEMORY_TYPES, TTL_CONFIG, MAX_ENTRIES } = require('../src/memory-store');
const fs = require('fs');
const path = require('path');

async function testMemoryStore() {
  console.log('🧪 测试 MemoryStore...\n');

  const testDir = '.flowharness/memory-test-' + Date.now();
  let passed = 0;
  let failed = 0;

  function assert(condition, msg) {
    if (condition) { passed++; console.log(`  ✅ ${msg}`); }
    else { failed++; console.log(`  ❌ ${msg}`); }
  }

  try {
    // ---- Test 1: MemoryEntry 基础 ----
    console.log('\nTest 1: MemoryEntry 创建与元数据');
    const entry = new MemoryEntry({
      key: 'test-key',
      value: { data: 'hello' },
      type: MEMORY_TYPES.USER,
      tags: ['test'],
      source: 'user',
      priority: 'high'
    });
    assert(entry.key === 'test-key', 'key 正确');
    assert(entry.type === 'user', 'type 正确');
    assert(entry.priority === 'high', 'priority 正确');
    assert(entry.version === 1, '初始 version 为 1');
    assert(entry.accessCount === 0, '初始 accessCount 为 0');
    assert(entry.id.startsWith('mem_'), 'id 前缀正确');

    // ---- Test 2: MemoryEntry touch / update ----
    console.log('\nTest 2: MemoryEntry touch 和 update');
    entry.touch();
    assert(entry.accessCount === 1, 'touch 后 accessCount 为 1');
    entry.touch();
    assert(entry.accessCount === 2, '再次 touch 后 accessCount 为 2');
    entry.update({ data: 'updated' }, 'agent');
    assert(entry.value.data === 'updated', 'update 后 value 已更新');
    assert(entry.version === 2, 'update 后 version 为 2');
    assert(entry.source === 'agent', 'update 后 source 已更新');

    // ---- Test 3: MemoryEntry 序列化/反序列化 ----
    console.log('\nTest 3: MemoryEntry 序列化往返');
    const json = entry.toJSON();
    assert(json.key === 'test-key', 'toJSON key 正确');
    assert(json.version === 2, 'toJSON version 正确');
    const restored = MemoryEntry.fromJSON(json);
    assert(restored.key === entry.key, 'fromJSON key 一致');
    assert(restored.version === entry.version, 'fromJSON version 一致');
    assert(restored.accessCount === entry.accessCount, 'fromJSON accessCount 一致');
    assert(restored.priority === 'high', 'fromJSON priority 一致');

    // ---- Test 4: MemoryEntry 过期检测 ----
    console.log('\nTest 4: MemoryEntry isExpired');
    const freshRef = new MemoryEntry({ key: 'fresh', value: 1, type: MEMORY_TYPES.REFERENCE });
    assert(freshRef.isExpired() === false, '新建 reference 未过期');
    const projEntry = new MemoryEntry({ key: 'proj', value: 1, type: MEMORY_TYPES.PROJECT });
    assert(projEntry.isExpired() === false, 'project 类型永不过期');

    // ---- Test 5: MemoryStore 基本 store / retrieve ----
    console.log('\nTest 5: MemoryStore store / retrieve');
    const store = new MemoryStore(testDir);
    store.load();
    assert(store.loaded === true, '加载成功');

    // store(type, key, value, options)
    store.store(MEMORY_TYPES.USER, 'user-pref', { theme: 'dark' }, {
      tags: ['preference'], source: 'user'
    });
    // retrieve(type, key)
    const retrieved = store.retrieve(MEMORY_TYPES.USER, 'user-pref');
    assert(retrieved !== null, 'retrieve 返回非空');
    assert(retrieved.theme === 'dark', 'retrieve 值正确');

    // ---- Test 6: 四种记忆类型存取 ----
    console.log('\nTest 6: 四种记忆类型存取');
    store.store(MEMORY_TYPES.FEEDBACK, 'fb-1', { rating: 5 });
    store.store(MEMORY_TYPES.PROJECT, 'proj-config', { stack: 'node' });
    store.store(MEMORY_TYPES.REFERENCE, 'ref-doc', { url: 'https://example.com' });

    assert(store.retrieve(MEMORY_TYPES.FEEDBACK, 'fb-1') !== null, 'feedback 存取正常');
    assert(store.retrieve(MEMORY_TYPES.PROJECT, 'proj-config') !== null, 'project 存取正常');
    assert(store.retrieve(MEMORY_TYPES.REFERENCE, 'ref-doc') !== null, 'reference 存取正常');
    assert(store.retrieve(MEMORY_TYPES.PROJECT, 'proj-config').stack === 'node', 'project 值正确');

    // ---- Test 7: search 搜索 ----
    console.log('\nTest 7: search 搜索');
    store.store(MEMORY_TYPES.USER, 'user-lang', { lang: 'zh' }, { tags: ['preference', 'lang'] });

    // search(type, query) — query 使用 tags
    const tagSearch = store.search(MEMORY_TYPES.USER, { tags: ['preference'] });
    assert(tagSearch.length >= 1, 'search 按 tag 找到结果');

    // search 全类型关键词搜索
    const kwSearch = store.search(null, { keyword: 'user-pref' });
    assert(kwSearch.length >= 1, 'search 全类型关键词找到结果');

    // search 按 source
    const srcSearch = store.search(MEMORY_TYPES.USER, { source: 'user' });
    assert(srcSearch.length >= 1, 'search 按 source 找到结果');

    // ---- Test 8: update 现有记忆 ----
    console.log('\nTest 8: update 更新记忆');
    const updResult = store.update(MEMORY_TYPES.USER, 'user-pref', { theme: 'light' }, 'user');
    assert(updResult !== null, 'update 返回非空');
    assert(updResult.value.theme === 'light', 'update 后值已更新');
    assert(updResult.version >= 2, 'update 后 version 递增');

    // update 不存在的 key
    const updNull = store.update(MEMORY_TYPES.USER, 'non-existent', {});
    assert(updNull === null, 'update 不存在的 key 返回 null');

    // ---- Test 9: remove ----
    console.log('\nTest 9: remove 删除记忆');
    const removed = store.remove(MEMORY_TYPES.REFERENCE, 'ref-doc');
    assert(removed === true, 'remove 返回 true');
    const afterRemove = store.retrieve(MEMORY_TYPES.REFERENCE, 'ref-doc');
    assert(afterRemove === null, 'remove 后 retrieve 返回 null');

    // remove 不存在的 key
    const removeFalse = store.remove(MEMORY_TYPES.REFERENCE, 'non-existent');
    assert(removeFalse === false, 'remove 不存在的 key 返回 false');

    // ---- Test 10: 冲突处理 — 重复 store ----
    console.log('\nTest 10: 冲突处理（重复 store 覆盖 + priority 只升不降）');
    store.store(MEMORY_TYPES.USER, 'user-pref', { theme: 'auto' }, { priority: 'critical' });
    const entry2 = store.getEntry(MEMORY_TYPES.USER, 'user-pref');
    assert(entry2.value.theme === 'auto', '冲突覆盖：新值生效');
    assert(entry2.priority === 'critical', 'priority 升级为 critical');

    // 再次 store 用 normal priority，不应降级
    store.store(MEMORY_TYPES.USER, 'user-pref', { theme: 'system' }, { priority: 'normal' });
    const entry3 = store.getEntry(MEMORY_TYPES.USER, 'user-pref');
    assert(entry3.priority === 'critical', 'priority 不降级');

    // ---- Test 11: getStats ----
    console.log('\nTest 11: getStats 统计');
    const stats = store.getStats();
    assert(typeof stats === 'object', 'getStats 返回对象');
    assert(stats.user.count > 0, 'user 类型有条目');
    assert(stats.project.count > 0, 'project 类型有条目');
    assert(typeof stats.user.maxCapacity === 'number', 'maxCapacity 是数字');

    // ---- Test 12: save / load 持久化往返 ----
    console.log('\nTest 12: save / load 持久化往返');
    store.save();
    const store2 = new MemoryStore(testDir);
    store2.load();
    const reloaded = store2.retrieve(MEMORY_TYPES.USER, 'user-pref');
    assert(reloaded !== null, '重新加载后 retrieve 成功');
    assert(reloaded.theme === 'system', '重新加载后值一致');

    // ---- Test 13: 6层交互接口 ----
    console.log('\nTest 13: 6层交互接口');
    const taskCtx = store.getTaskContext('test-task');
    assert(typeof taskCtx === 'object', 'getTaskContext 返回对象');
    assert(Array.isArray(taskCtx.projectContext), 'getTaskContext.projectContext 是数组');
    assert(Array.isArray(taskCtx.referenceContext), 'getTaskContext.referenceContext 是数组');

    const permCtx = store.getUserPermissionContext('user-123');
    // 没有 permission 记忆，应返回 null
    assert(permCtx === null, 'getUserPermissionContext 无数据时返回 null');

    store.recordExecutionFeedback('task-1', { success: true, score: 8.5 });
    const fbEntry = store.retrieve(MEMORY_TYPES.FEEDBACK, 'exec_task-1');
    assert(fbEntry !== null, 'recordExecutionFeedback 存入 feedback 记忆');
    assert(fbEntry.score === 8.5, 'recordExecutionFeedback 值正确');

    const optCtx = store.getOptimizationContext('quality');
    assert(Array.isArray(optCtx), 'getOptimizationContext 返回数组');

    // ---- Test 14: expireAll 过期清理 ----
    console.log('\nTest 14: expireAll 过期清理');
    const oldEntry = new MemoryEntry({
      key: 'old-ref', value: 'stale', type: MEMORY_TYPES.REFERENCE
    });
    // 将 createdAt 设为 8 天前（超过 7 天 TTL）
    oldEntry.createdAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    store.memories[MEMORY_TYPES.REFERENCE].set('old-ref', oldEntry);
    const expiredCount = store.expireAll();
    assert(expiredCount >= 1, 'expireAll 清理了过期条目');
    const afterExpire = store.retrieve(MEMORY_TYPES.REFERENCE, 'old-ref');
    assert(afterExpire === null, '过期条目不可 retrieve');

    // ---- Test 15: refreshReference ----
    console.log('\nTest 15: refreshReference 刷新 TTL');
    store.store(MEMORY_TYPES.REFERENCE, 'ref-refresh', { data: 'test' });
    const refreshed = store.refreshReference('ref-refresh');
    assert(refreshed === true, 'refreshReference 返回 true');
    const refreshFalse = store.refreshReference('non-existent');
    assert(refreshFalse === false, '不存在的 key refreshReference 返回 false');

    // ---- Test 16: export / import ----
    console.log('\nTest 16: export / import');
    const exported = store.export();
    assert(exported.version === '1.0', 'export version 正确');
    assert(typeof exported.memories === 'object', 'export memories 是对象');
    assert(Array.isArray(exported.memories.user), 'export memories.user 是数组');

    const store3 = new MemoryStore(testDir + '-import');
    store3.load();
    const importCount = store3.import(exported);
    assert(importCount > 0, 'import 导入了条目');
    const importedVal = store3.retrieve(MEMORY_TYPES.USER, 'user-pref');
    assert(importedVal !== null, 'import 后可以 retrieve');

    // 清理 import 测试目录
    try { fs.rmSync(testDir + '-import', { recursive: true, force: true }); } catch(e){}

    // ---- Test 17: MEMORY.md 生成 ----
    console.log('\nTest 17: MEMORY.md 索引生成');
    store.save(); // save 时会调用 generateMemoryIndex
    const indexPath = path.join(path.dirname(testDir), 'MEMORY.md');
    assert(fs.existsSync(indexPath), 'MEMORY.md 文件已生成');

    // ---- Test 18: 常量正确性 ----
    console.log('\nTest 18: 常量定义正确');
    assert(MEMORY_TYPES.USER === 'user', 'MEMORY_TYPES.USER');
    assert(MEMORY_TYPES.FEEDBACK === 'feedback', 'MEMORY_TYPES.FEEDBACK');
    assert(MEMORY_TYPES.PROJECT === 'project', 'MEMORY_TYPES.PROJECT');
    assert(MEMORY_TYPES.REFERENCE === 'reference', 'MEMORY_TYPES.REFERENCE');
    assert(TTL_CONFIG[MEMORY_TYPES.PROJECT] === null, 'PROJECT TTL 为 null（永久）');
    assert(MAX_ENTRIES[MEMORY_TYPES.USER] === 500, 'USER 最大条目 500');

  } catch (error) {
    console.log(`\n❌ 测试异常: ${error.message}`);
    console.log(error.stack);
    failed++;
  } finally {
    // 清理测试目录
    try {
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
      // 清理生成的 MEMORY.md
      const memoryMd = path.join(path.dirname(testDir), 'MEMORY.md');
      if (fs.existsSync(memoryMd)) fs.unlinkSync(memoryMd);
    } catch (e) {}
  }

  console.log(`\n========================================`);
  console.log(`测试结果: ${passed} 通过, ${failed} 失败`);
  if (failed === 0) {
    console.log('✅ 所有 MemoryStore 测试通过！');
  } else {
    console.log('❌ 有测试失败');
    process.exitCode = 1;
  }
}

testMemoryStore();
