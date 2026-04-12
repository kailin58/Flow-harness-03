const LeadershipManager = require('../src/leadership-manager');
const PlatformDetector = require('../src/platform-detector');
const IPCChannel = require('../src/ipc-channel');
const fs = require('fs');
const path = require('path');
const os = require('os');

async function testLeadershipManager() {
  console.log('🧪 测试 LeadershipManager...\n');

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

  const testDir = path.join(os.tmpdir(), `flowharness-lm-test-${Date.now()}`);
  fs.mkdirSync(testDir, { recursive: true });
  fs.mkdirSync(path.join(testDir, '.claude'), { recursive: true });

  try {
    const detector = new PlatformDetector({ workingDir: testDir });
    const ipc = new IPCChannel({ tasksDir: path.join(testDir, 'tasks') });
    await ipc.initialize();

    // Test 1: 构造函数验证
    console.log('Test 1: 构造函数验证');
    try {
      new LeadershipManager(null, ipc);
      assert(false, '应拒绝空 platformDetector');
    } catch (e) { assert(true, '正确拒绝空 platformDetector'); }
    const lm = new LeadershipManager(detector, ipc, { takeoverTimeout: 2000, pollInterval: 100 });
    assert(lm.config.takeoverTimeout === 2000, '超时配置正确');
    console.log('');

    // Test 2: 初始无领导者
    console.log('Test 2: 初始无领导者');
    const leader0 = await lm.getCurrentLeader();
    assert(leader0 === null, '初始无领导者');
    assert(await lm.isLeader() === false, '当前不是领导者');
    console.log('');

    // Test 3: 声明领导权
    console.log('Test 3: 声明领导权');
    const claimed = await lm.claimLeadership();
    assert(claimed === true, '声明成功');
    const leader1 = await lm.getCurrentLeader();
    assert(leader1.platform === 'claude-code', '领导者为 claude-code');
    assert(leader1.since !== undefined, '有时间戳');
    assert(leader1.transferInProgress === null, '无转移中');
    assert(await lm.isLeader() === true, '当前是领导者');
    console.log('');

    // Test 4: 其他平台声明被拒绝
    console.log('Test 4: 其他平台声明被拒绝');
    const rejected = await lm.claimLeadership('cursor');
    assert(rejected === false, '其他平台声明被拒绝');
    console.log('');

    // Test 5: 同平台重复声明成功
    console.log('Test 5: 同平台重复声明成功');
    const reclaimed = await lm.claimLeadership('claude-code');
    assert(reclaimed === true, '同平台重复声明成功');
    console.log('');

    // Test 6: 发起转移
    console.log('Test 6: 发起转移');
    const transfer = await lm.transferLeadership('cursor', {
      currentTask: { id: 'task-1', step: 3 },
      executionLog: ['step1', 'step2', 'step3']
    });
    assert(transfer.success === true, '转移发起成功');
    assert(transfer.transferId.startsWith('xfer-'), '转移ID格式正确');
    const leader2 = await lm.getCurrentLeader();
    assert(leader2.transferInProgress !== null, '有转移中');
    assert(leader2.transferInProgress.to === 'cursor', '目标为 cursor');
    assert(leader2.transferInProgress.state === 'pending', '状态为 pending');
    assert(leader2.transferInProgress.context.currentTask.step === 3, '上下文保留');
    console.log('');

    // Test 7: 确认接管
    console.log('Test 7: 确认接管');
    const acked = await lm.acknowledgeTakeover(transfer.transferId);
    assert(acked === true, '确认成功');
    const leader3 = await lm.getCurrentLeader();
    assert(leader3.transferInProgress.state === 'acknowledged', '状态为 acknowledged');
    console.log('');

    // Test 8: 等待接管完成（已确认）
    console.log('Test 8: 等待接管完成（已确认）');
    const waitResult = await lm.waitForTakeover(transfer.transferId, 2000);
    assert(waitResult.acknowledged === true, '接管已确认');
    assert(waitResult.timedOut === false, '未超时');
    const leader4 = await lm.getCurrentLeader();
    assert(leader4.platform === 'cursor', '领导者已转为 cursor');
    assert(leader4.transferInProgress === null, '转移已完成');
    console.log('');

    // Test 9: 转移超时回退
    console.log('Test 9: 转移超时回退');
    // 当前领导者是 cursor（Test 8 结果），先直接写入状态让 claude-code 成为领导者
    await ipc.writeState('leadership', {
      currentLeader: 'claude-code',
      since: new Date().toISOString(),
      transferInProgress: null
    });
    const transfer2 = await lm.transferLeadership('codex', {});
    assert(transfer2.success === true, '转移发起成功');
    // 不确认，直接等待 → 超时
    const waitResult2 = await lm.waitForTakeover(transfer2.transferId, 500);
    assert(waitResult2.acknowledged === false, '未确认');
    assert(waitResult2.timedOut === true, '已超时');
    const leader5 = await lm.getCurrentLeader();
    assert(leader5.platform === 'claude-code', '超时后领导权回退');
    assert(leader5.transferInProgress === null, '转移已清除');
    console.log('');

    // Test 10: 确认不存在的转移
    console.log('Test 10: 确认不存在的转移');
    const badAck = await lm.acknowledgeTakeover('nonexistent');
    assert(badAck === false, '不存在转移返回 false');
    console.log('');

    // Test 11: saveState / loadState
    console.log('Test 11: saveState / loadState');
    await lm.saveState({ task: 'build', progress: 75 });
    const loaded = await lm.loadState();
    assert(loaded !== null, '状态已加载');
    assert(loaded.task === 'build', '任务数据正确');
    assert(loaded.progress === 75, '进度数据正确');
    console.log('');

    // Test 12: loadState 无数据
    console.log('Test 12: loadState 无数据');
    const lm2 = new LeadershipManager(detector,
      new IPCChannel({ tasksDir: path.join(testDir, 'tasks2') }));
    await lm2.ipcChannel.initialize();
    const noState = await lm2.loadState();
    assert(noState === null, '无数据返回 null');
    console.log('');

    // Test 13: getTransferHistory
    console.log('Test 13: getTransferHistory');
    const history = lm.getTransferHistory();
    assert(history.length >= 2, `历史 >= 2 条 (${history.length})`);
    const completedRecords = history.filter(h => h.state === 'completed');
    const failedRecords = history.filter(h => h.state === 'failed');
    assert(completedRecords.length >= 1, '有已完成记录');
    assert(failedRecords.length >= 1, '有已失败记录');
    console.log('');

    // Test 14: getStats
    console.log('Test 14: getStats');
    const stats = lm.getStats();
    assert(stats.totalTransfers >= 2, `总转移 >= 2 (${stats.totalTransfers})`);
    assert(stats.successfulTransfers >= 1, `成功 >= 1 (${stats.successfulTransfers})`);
    assert(stats.failedTransfers >= 1, `失败 >= 1 (${stats.failedTransfers})`);
    assert(stats.claims >= 2, `声明 >= 2 (${stats.claims})`);
    console.log('');

    // Test 15: 非领导者发起转移
    console.log('Test 15: 非领导者发起转移');
    // 直接写入状态让 cursor 成为领导者
    await ipc.writeState('leadership', {
      currentLeader: 'cursor',
      since: new Date().toISOString(),
      transferInProgress: null
    });
    // 当前检测到的平台是 claude-code，但领导者是 cursor
    const badTransfer = await lm.transferLeadership('codex');
    assert(badTransfer.success === false, '非领导者转移被拒绝');
    assert(badTransfer.reason.includes('不是领导者'), '有拒绝原因');
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

testLeadershipManager()
  .then(success => process.exit(success ? 0 : 1))
  .catch(error => {
    console.error('💥 测试异常:', error);
    process.exit(1);
  });
