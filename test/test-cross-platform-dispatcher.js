const CrossPlatformDispatcher = require('../src/cross-platform-dispatcher');
const PlatformDetector = require('../src/platform-detector');
const IPCChannel = require('../src/ipc-channel');
const fs = require('fs');
const path = require('path');
const os = require('os');

async function testCrossPlatformDispatcher() {
  console.log('🧪 测试 CrossPlatformDispatcher...\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`  ✅ ${testName}`);
      passed++;
    } else {
      console.log(`  ❌ ${testName}`);
      failed++;
    }
  }

  const testDir = path.join(os.tmpdir(), `flowharness-cpd-test-${Date.now()}`);
  fs.mkdirSync(testDir, { recursive: true });
  // 创建 .claude 标记使当前平台为 claude-code
  fs.mkdirSync(path.join(testDir, '.claude'), { recursive: true });

  try {
    const detector = new PlatformDetector({ workingDir: testDir });
    const ipc = new IPCChannel({ tasksDir: path.join(testDir, 'tasks') });
    await ipc.initialize();

    // Test 1: 构造函数验证
    console.log('Test 1: 构造函数验证');
    try {
      new CrossPlatformDispatcher(null, ipc);
      assert(false, '应拒绝空 platformDetector');
    } catch (e) { assert(true, '正确拒绝空 platformDetector'); }
    try {
      new CrossPlatformDispatcher(detector, null);
      assert(false, '应拒绝空 ipcChannel');
    } catch (e) { assert(true, '正确拒绝空 ipcChannel'); }
    const dispatcher = new CrossPlatformDispatcher(detector, ipc);
    assert(dispatcher.config.preferLocal === true, '默认本地优先');
    console.log('');

    // Test 2: 本地分发（无特殊需求）
    console.log('Test 2: 本地分发（无特殊需求）');
    const r1 = await dispatcher.dispatch({ action: 'file_search', pattern: '*.js' });
    assert(r1.local === true, '本地执行');
    assert(r1.platform === 'claude-code', `平台为 claude-code (${r1.platform})`);
    assert(r1.taskId.startsWith('local-'), '本地任务ID');
    console.log('');

    // Test 3: 指定目标平台 = 当前平台 → 本地
    console.log('Test 3: 指定目标平台 = 当前平台 → 本地');
    const r2 = await dispatcher.dispatch({ action: 'test', targetPlatform: 'claude-code' });
    assert(r2.local === true, '目标=当前 → 本地');
    console.log('');

    // Test 4: 指定目标平台 ≠ 当前平台 → 远程
    console.log('Test 4: 指定目标平台 ≠ 当前平台 → 远程');
    const r3 = await dispatcher.dispatch({ action: 'refactor', targetPlatform: 'cursor' });
    assert(r3.local === false, '目标≠当前 → 远程');
    assert(r3.platform === 'cursor', '平台为 cursor');
    assert(r3.taskId.startsWith('task-'), '远程任务ID');
    // 验证 outbox 有文件
    const outgoing = await ipc.listOutgoing();
    assert(outgoing.length >= 1, 'outbox 有任务');
    console.log('');

    // Test 5: selectBestPlatform 无需求 → 当前平台
    console.log('Test 5: selectBestPlatform 无需求 → 当前平台');
    const best1 = dispatcher.selectBestPlatform({ action: 'test' });
    assert(best1 === 'claude-code', `无需求选当前 (${best1})`);
    console.log('');

    // Test 6: selectBestPlatform 有需求
    console.log('Test 6: selectBestPlatform 有需求');
    // claude-code 有 reasoning，cursor 没有
    const best2 = dispatcher.selectBestPlatform({
      action: 'analyze',
      requiredCapabilities: ['reasoning', 'code_editing']
    });
    assert(best2 === 'claude-code', `需要 reasoning → claude-code (${best2})`);
    console.log('');

    // Test 7: shouldDispatchRemotely
    console.log('Test 7: shouldDispatchRemotely');
    assert(dispatcher.shouldDispatchRemotely({ action: 'test' }) === false, '无需求 → 不远程');
    assert(dispatcher.shouldDispatchRemotely({ targetPlatform: 'cursor' }) === true, '指定其他平台 → 远程');
    assert(dispatcher.shouldDispatchRemotely({ targetPlatform: 'claude-code' }) === false, '指定当前平台 → 不远程');
    // claude-code 没有 ui_development
    assert(dispatcher.shouldDispatchRemotely({
      requiredCapabilities: ['ui_development']
    }) === true, '缺少能力 → 远程');
    assert(dispatcher.shouldDispatchRemotely({
      requiredCapabilities: ['code_editing']
    }) === false, '有能力 → 不远程');
    console.log('');

    // Test 8: dispatchToPlatform 本地
    console.log('Test 8: dispatchToPlatform 本地');
    const tid1 = await dispatcher.dispatchToPlatform({ action: 'test' }, 'claude-code');
    assert(tid1.startsWith('local-'), '本地任务ID');
    console.log('');

    // Test 9: dispatchToPlatform 远程
    console.log('Test 9: dispatchToPlatform 远程');
    const tid2 = await dispatcher.dispatchToPlatform({ action: 'test' }, 'codex');
    assert(tid2.startsWith('task-'), '远程任务ID');
    console.log('');

    // Test 10: collectResult 有结果
    console.log('Test 10: collectResult 有结果');
    const testTaskId = 'task-collect-test';
    await ipc.submitResult(testTaskId, { success: true, data: 'done' });
    const collected = await dispatcher.collectResult(testTaskId, 2000);
    assert(collected !== null, '收集到结果');
    assert(collected.result.success === true, '结果正确');
    console.log('');

    // Test 11: collectResult 超时
    console.log('Test 11: collectResult 超时');
    const noResult = await dispatcher.collectResult('nonexistent-task', 500);
    assert(noResult === null, '超时返回 null');
    console.log('');

    // Test 12: getStats
    console.log('Test 12: getStats');
    const stats = dispatcher.getStats();
    assert(stats.totalDispatches >= 5, `总分发 >= 5 (${stats.totalDispatches})`);
    assert(stats.localDispatches >= 3, `本地分发 >= 3 (${stats.localDispatches})`);
    assert(stats.remoteDispatches >= 2, `远程分发 >= 2 (${stats.remoteDispatches})`);
    assert(stats.resultsCollected >= 1, `结果收集 >= 1 (${stats.resultsCollected})`);
    assert(stats.timeouts >= 1, `超时 >= 1 (${stats.timeouts})`);
    console.log('');

    // Test 13: getHistory
    console.log('Test 13: getHistory');
    const history = dispatcher.getHistory();
    assert(history.length >= 5, `历史 >= 5 条 (${history.length})`);
    const localHistory = dispatcher.getHistory({ local: true });
    assert(localHistory.length >= 3, `本地历史 >= 3 (${localHistory.length})`);
    const remoteHistory = dispatcher.getHistory({ local: false });
    assert(remoteHistory.length >= 2, `远程历史 >= 2 (${remoteHistory.length})`);
    const limited = dispatcher.getHistory({ limit: 2 });
    assert(limited.length === 2, '限制数量生效');
    console.log('');

    // Test 14: 本地优先关闭
    console.log('Test 14: 本地优先关闭');
    // 添加 cursor 标记
    fs.mkdirSync(path.join(testDir, '.cursor'), { recursive: true });
    const detector2 = new PlatformDetector({ workingDir: testDir });
    const dispatcher2 = new CrossPlatformDispatcher(detector2, ipc, { preferLocal: false });
    // cursor 有 ui_development，claude-code 没有
    const best3 = dispatcher2.selectBestPlatform({
      requiredCapabilities: ['ui_development', 'refactoring']
    });
    assert(best3 === 'cursor', `关闭本地优先 → cursor (${best3})`);
    console.log('');

    // 总结
    console.log('='.repeat(50));
    console.log(`\n测试结果: ${passed} 通过, ${failed} 失败`);
    console.log(`总计: ${passed + failed} 个断言\n`);

    if (failed > 0) {
      console.log('❌ 部分测试失败！\n');
      return false;
    }

    console.log('✅ 所有测试通过！\n');
    return true;

  } catch (error) {
    console.error('❌ 测试异常:', error.message);
    console.error(error.stack);
    return false;
  } finally {
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {}
  }
}

testCrossPlatformDispatcher()
  .then(success => process.exit(success ? 0 : 1))
  .catch(error => {
    console.error('💥 测试异常:', error);
    process.exit(1);
  });
