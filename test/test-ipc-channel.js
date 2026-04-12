const IPCChannel = require('../src/ipc-channel');
const TaskSerializer = require('../src/task-serializer');
const fs = require('fs');
const path = require('path');
const os = require('os');

async function testIPCChannel() {
  console.log('🧪 测试 IPCChannel...\n');

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

  const testDir = path.join(os.tmpdir(), `flowharness-ipc-test-${Date.now()}`);
  fs.mkdirSync(testDir, { recursive: true });

  try {
    // Test 1: 初始化
    console.log('Test 1: 初始化');
    const ipc = new IPCChannel({ tasksDir: path.join(testDir, 'tasks') });
    await ipc.initialize();
    assert(ipc._initialized === true, '已初始化');
    assert(fs.existsSync(ipc.dirs.inbox), 'inbox 目录存在');
    assert(fs.existsSync(ipc.dirs.outbox), 'outbox 目录存在');
    assert(fs.existsSync(ipc.dirs.results), 'results 目录存在');
    assert(fs.existsSync(ipc.dirs.state), 'state 目录存在');
    console.log('');

    // Test 2: send 发送任务
    console.log('Test 2: send 发送任务');
    const taskId = await ipc.send(
      { action: 'file_search', pattern: '*.js' },
      'cursor',
      { source: { platform: 'claude-code' } }
    );
    assert(taskId.startsWith('task-'), `任务ID格式正确 (${taskId})`);
    const outFile = path.join(ipc.dirs.outbox, `${taskId}.json`);
    assert(fs.existsSync(outFile), 'outbox 文件已创建');
    console.log('');

    // Test 3: receive 接收任务（inbox 为空）
    console.log('Test 3: receive 接收任务（inbox 为空）');
    const empty = await ipc.receive();
    assert(Array.isArray(empty), '返回数组');
    assert(empty.length === 0, 'inbox 为空');
    console.log('');

    // Test 4: 模拟 inbox 任务 → receive
    console.log('Test 4: 模拟 inbox 任务 → receive');
    const serializer = new TaskSerializer();
    const { json } = serializer.serialize(
      { action: 'code_search', query: 'function' },
      { taskId: 'task-inbox-1', source: { platform: 'cursor' }, target: { platform: 'claude-code' } }
    );
    fs.writeFileSync(path.join(ipc.dirs.inbox, 'task-inbox-1.json'), json);
    const received = await ipc.receive();
    assert(received.length === 1, '接收到1个任务');
    assert(received[0].task.action === 'code_search', '任务内容正确');
    assert(received[0].metadata.taskId === 'task-inbox-1', '任务ID正确');
    assert(received[0].filePath !== undefined, '有文件路径');
    console.log('');

    // Test 5: submitResult / getResult
    console.log('Test 5: submitResult / getResult');
    await ipc.submitResult('task-inbox-1', { success: true, data: 'found 10 matches' });
    const result = await ipc.getResult('task-inbox-1');
    assert(result !== null, '结果存在');
    assert(result.taskId === 'task-inbox-1', '结果任务ID正确');
    assert(result.result.success === true, '结果成功');
    assert(result.result.data === 'found 10 matches', '结果数据正确');
    assert(result.state === 'completed', '状态为 completed');
    console.log('');

    // Test 6: getResult 不存在
    console.log('Test 6: getResult 不存在');
    const noResult = await ipc.getResult('nonexistent-task');
    assert(noResult === null, '不存在任务返回 null');
    console.log('');

    // Test 7: submitResult 失败任务
    console.log('Test 7: submitResult 失败任务');
    await ipc.submitResult('task-fail-1', { success: false, error: 'timeout' });
    const failResult = await ipc.getResult('task-fail-1');
    assert(failResult.state === 'failed', '失败任务状态为 failed');
    console.log('');

    // Test 8: updateState
    console.log('Test 8: updateState');
    const updated = await ipc.updateState('task-inbox-1', 'in_progress');
    assert(updated === true, '更新成功');
    // 验证更新后的文件
    const updatedData = JSON.parse(fs.readFileSync(
      path.join(ipc.dirs.inbox, 'task-inbox-1.json'), 'utf-8'
    ));
    assert(updatedData.state === 'in_progress', '状态已更新');
    console.log('');

    // Test 9: updateState 不存在的任务
    console.log('Test 9: updateState 不存在的任务');
    const notUpdated = await ipc.updateState('nonexistent', 'completed');
    assert(notUpdated === false, '不存在任务返回 false');
    console.log('');

    // Test 10: listPending
    console.log('Test 10: listPending');
    // 添加一个 pending 任务
    const { json: json2 } = serializer.serialize(
      { action: 'read_file' },
      { taskId: 'task-inbox-2', source: { platform: 'codex' }, state: 'pending' }
    );
    fs.writeFileSync(path.join(ipc.dirs.inbox, 'task-inbox-2.json'), json2);
    const pending = await ipc.listPending();
    assert(pending.length >= 1, `有待处理任务 (${pending.length})`);
    assert(pending.some(t => t.metadata.taskId === 'task-inbox-2'), '包含新任务');
    console.log('');

    // Test 11: listOutgoing
    console.log('Test 11: listOutgoing');
    const outgoing = await ipc.listOutgoing();
    assert(outgoing.length >= 1, `有发出任务 (${outgoing.length})`);
    console.log('');

    // Test 12: writeState / readState
    console.log('Test 12: writeState / readState');
    await ipc.writeState('heartbeat-claude', { platform: 'claude-code', timestamp: Date.now() });
    const state = await ipc.readState('heartbeat-claude');
    assert(state !== null, '状态存在');
    assert(state.platform === 'claude-code', '状态数据正确');
    console.log('');

    // Test 13: readState 不存在
    console.log('Test 13: readState 不存在');
    const noState = await ipc.readState('nonexistent');
    assert(noState === null, '不存在状态返回 null');
    console.log('');

    // Test 14: cleanup
    console.log('Test 14: cleanup');
    // 创建一个"旧"文件
    const oldFile = path.join(ipc.dirs.results, 'old-result.json');
    fs.writeFileSync(oldFile, '{}');
    // 修改时间为2天前
    const twoDAysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    fs.utimesSync(oldFile, twoDAysAgo, twoDAysAgo);
    const cleaned = await ipc.cleanup();
    assert(cleaned >= 1, `清理了 >= 1 个文件 (${cleaned})`);
    assert(!fs.existsSync(oldFile), '旧文件已删除');
    console.log('');

    // Test 15: 多任务发送和接收
    console.log('Test 15: 多任务发送和接收');
    const ipc2 = new IPCChannel({ tasksDir: path.join(testDir, 'tasks2') });
    await ipc2.initialize();
    for (let i = 0; i < 5; i++) {
      // 直接写入 inbox 模拟接收
      const { json: j } = serializer.serialize(
        { action: 'test', index: i },
        { taskId: `task-multi-${i}`, state: 'pending' }
      );
      fs.writeFileSync(path.join(ipc2.dirs.inbox, `task-multi-${i}.json`), j);
    }
    const multiReceived = await ipc2.receive();
    assert(multiReceived.length === 5, `接收5个任务 (${multiReceived.length})`);
    console.log('');

    // Test 16: getStats
    console.log('Test 16: getStats');
    const stats = ipc.getStats();
    assert(stats.sent >= 1, `发送数 >= 1 (${stats.sent})`);
    assert(stats.received >= 1, `接收数 >= 1 (${stats.received})`);
    assert(stats.resultsSubmitted >= 2, `结果提交 >= 2 (${stats.resultsSubmitted})`);
    assert(stats.resultsCollected >= 2, `结果收集 >= 2 (${stats.resultsCollected})`);
    assert(stats.initialized === true, '已初始化');
    assert(typeof stats.pendingInbox === 'number', '有 inbox 计数');
    assert(typeof stats.pendingOutbox === 'number', '有 outbox 计数');
    console.log('');

    // Test 17: 原子写入验证
    console.log('Test 17: 原子写入验证');
    const atomicPath = path.join(ipc.dirs.state, 'atomic-test.json');
    ipc._atomicWrite(atomicPath, JSON.stringify({ test: true }));
    assert(fs.existsSync(atomicPath), '原子写入文件存在');
    assert(!fs.existsSync(atomicPath + '.tmp'), '临时文件已清理');
    const atomicData = JSON.parse(fs.readFileSync(atomicPath, 'utf-8'));
    assert(atomicData.test === true, '原子写入数据正确');
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

testIPCChannel()
  .then(success => process.exit(success ? 0 : 1))
  .catch(error => {
    console.error('💥 测试异常:', error);
    process.exit(1);
  });
