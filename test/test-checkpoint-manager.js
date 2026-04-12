const { CheckpointManager, CHECKPOINT_STATUS } = require('../src/checkpoint-manager');
const fs = require('fs');
const path = require('path');
const os = require('os');

async function testCheckpointManager() {
  console.log('🧪 测试 CheckpointManager...\n');

  let passed = 0;
  let failed = 0;
  const silentLogger = {
    trace(){}, debug(){}, info(){}, warn(){}, error(){}, fatal(){},
    child() { return silentLogger; }
  };

  function assert(condition, msg) {
    if (condition) { passed++; console.log(`  ✅ ${msg}`); }
    else { failed++; console.log(`  ❌ ${msg}`); }
  }

  const tmpDir = path.join(os.tmpdir(), `fh-checkpoint-${Date.now()}`);

  try {
    // ---- Test 1: 常量 ----
    console.log('\nTest 1: 常量导出');
    assert(typeof CHECKPOINT_STATUS === 'object', 'CHECKPOINT_STATUS 已导出');
    assert(CHECKPOINT_STATUS.CREATED === 'created', 'CREATED 状态');
    assert(CHECKPOINT_STATUS.COMMITTED === 'committed', 'COMMITTED 状态');
    assert(CHECKPOINT_STATUS.ROLLED_BACK === 'rolled_back', 'ROLLED_BACK 状态');
    assert(CHECKPOINT_STATUS.EXPIRED === 'expired', 'EXPIRED 状态');

    // ---- Test 2: 基本实例化 ----
    console.log('\nTest 2: 基本实例化');
    const mgr = new CheckpointManager({ storageDir: tmpDir, logger: silentLogger });
    assert(mgr !== null, 'CheckpointManager 创建成功');
    assert(mgr.maxCheckpoints === 20, '默认 maxCheckpoints = 20');

    // ---- Test 3: create 创建检查点 ----
    console.log('\nTest 3: create 创建检查点');
    const cp1 = mgr.create('task-1', 'step1_done', { progress: 25, data: [1, 2, 3] });
    assert(cp1.id.startsWith('cp_'), 'ID 前缀正确');
    assert(cp1.taskId === 'task-1', 'taskId 正确');
    assert(cp1.label === 'step1_done', 'label 正确');
    assert(cp1.status === CHECKPOINT_STATUS.CREATED, '状态为 CREATED');

    // 验证文件已创建
    const cpFile = path.join(tmpDir, `${cp1.id}.json`);
    assert(fs.existsSync(cpFile), '检查点文件已创建');

    // ---- Test 4: commit ----
    console.log('\nTest 4: commit 提交');
    const commitResult = mgr.commit(cp1.id);
    assert(commitResult.success === true, 'commit 成功');
    assert(commitResult.checkpoint.status === CHECKPOINT_STATUS.COMMITTED, '状态变为 COMMITTED');

    // 不存在的检查点
    const badCommit = mgr.commit('nonexistent');
    assert(badCommit.success === false, '不存在的检查点 commit 失败');

    // ---- Test 5: restore 恢复 ----
    console.log('\nTest 5: restore 恢复');
    const restored = mgr.restore(cp1.id);
    assert(restored.success === true, '恢复成功');
    assert(restored.state.progress === 25, 'progress 恢复正确');
    assert(restored.state.data.length === 3, 'data 恢复正确');

    // 不存在的检查点
    const badRestore = mgr.restore('nonexistent');
    assert(badRestore.success === false, '不存在的检查点恢复失败');

    // ---- Test 6: 创建多个检查点 ----
    console.log('\nTest 6: 多个检查点');
    const cp2 = mgr.create('task-1', 'step2_done', { progress: 50 });
    const cp3 = mgr.create('task-1', 'step3_done', { progress: 75 });
    const cp4 = mgr.create('task-2', 'step1_done', { progress: 10 });

    const task1Cps = mgr.listByTask('task-1');
    assert(task1Cps.length === 3, 'task-1 有 3 个检查点');
    const allCps = mgr.listAll();
    assert(allCps.length === 4, '共 4 个检查点');

    // ---- Test 7: restoreLatest ----
    console.log('\nTest 7: restoreLatest');
    const latest = mgr.restoreLatest('task-1');
    assert(latest.success === true, 'restoreLatest 成功');
    assert(latest.state.progress === 75, '恢复最新(progress=75)');

    // 不存在的任务
    const noTask = mgr.restoreLatest('nonexistent-task');
    assert(noTask.success === false, '不存在的任务恢复失败');

    // ---- Test 8: rollback ----
    console.log('\nTest 8: rollback');
    const rollResult = mgr.rollback(cp2.id); // 回滚到 step2
    assert(rollResult.success === true, 'rollback 成功');
    assert(rollResult.state.progress === 50, '回滚到 progress=50');
    assert(rollResult.rolledBackCheckpoints.length === 1, '1 个后续检查点被回滚');
    assert(rollResult.rolledBackCheckpoints.includes(cp3.id), 'cp3 被回滚');

    // cp3 状态应该变成 ROLLED_BACK
    const cp3After = mgr.get(cp3.id);
    assert(cp3After.status === CHECKPOINT_STATUS.ROLLED_BACK, 'cp3 状态为 ROLLED_BACK');

    // ---- Test 9: get ----
    console.log('\nTest 9: get 查询');
    const got = mgr.get(cp1.id);
    assert(got !== null, 'get 返回非空');
    assert(got.id === cp1.id, 'ID 匹配');
    assert(mgr.get('nonexistent') === null, '不存在返回 null');

    // ---- Test 10: getStats ----
    console.log('\nTest 10: getStats');
    const stats = mgr.getStats();
    assert(stats.total === 4, 'total = 4');
    assert(stats.rolledBack >= 1, 'rolledBack >= 1');
    assert(stats.storageDir === tmpDir, 'storageDir 正确');

    // ---- Test 11: remove ----
    console.log('\nTest 11: remove');
    assert(mgr.remove(cp4.id) === true, '删除成功');
    assert(mgr.get(cp4.id) === null, '删除后查不到');
    assert(!fs.existsSync(path.join(tmpDir, `${cp4.id}.json`)), '文件已删除');
    assert(mgr.remove('nonexistent') === false, '不存在返回 false');

    // ---- Test 12: clearTask ----
    console.log('\nTest 12: clearTask');
    // 先添加几个 task-3 检查点
    mgr.create('task-3', 'a', { x: 1 });
    mgr.create('task-3', 'b', { x: 2 });
    const cleared = mgr.clearTask('task-3');
    assert(cleared === 2, 'clearTask 清除 2 个');
    assert(mgr.listByTask('task-3').length === 0, 'task-3 无检查点');

    // ---- Test 13: 过期检查点 ----
    console.log('\nTest 13: 过期检查点');
    const expMgr = new CheckpointManager({ storageDir: path.join(tmpDir, 'exp'), ttlMs: 1, logger: silentLogger });
    const expCp = expMgr.create('task-exp', 'expired', { data: 'old' });
    // 等几毫秒让它过期
    await new Promise(r => setTimeout(r, 10));
    const expRestore = expMgr.restore(expCp.id);
    assert(expRestore.success === false, '过期检查点恢复失败');
    assert(expRestore.error.includes('expired'), '错误原因为 expired');

    // purgeExpired
    const purged = expMgr.purgeExpired();
    assert(purged >= 1, 'purgeExpired 清除过期');

    // ---- Test 14: maxCheckpoints 自动清理 ----
    console.log('\nTest 14: maxCheckpoints 自动清理');
    const smallMgr = new CheckpointManager({ storageDir: path.join(tmpDir, 'small'), maxCheckpoints: 3, logger: silentLogger });
    for (let i = 0; i < 5; i++) {
      smallMgr.create('task-max', `step${i}`, { i });
    }
    assert(smallMgr.listAll().length <= 3, `自动清理后 <= 3 个 (实际: ${smallMgr.listAll().length})`);

    // ---- Test 15: 持久化往返 ----
    console.log('\nTest 15: 持久化往返');
    const persistDir = path.join(tmpDir, 'persist');
    const mgr1 = new CheckpointManager({ storageDir: persistDir, logger: silentLogger });
    mgr1.create('task-p', 'save-test', { hello: 'world' });
    // 新建实例加载
    const mgr2 = new CheckpointManager({ storageDir: persistDir, logger: silentLogger });
    assert(mgr2.listAll().length === 1, '持久化后新实例加载到 1 个检查点');
    const pRestore = mgr2.restoreLatest('task-p');
    assert(pRestore.success === true, '持久化恢复成功');
    assert(pRestore.state.hello === 'world', '数据正确');

  } catch (error) {
    console.log(`\n❌ 测试异常: ${error.message}`);
    console.log(error.stack);
    failed++;
  }

  // 清理
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}

  console.log(`\n========================================`);
  console.log(`测试结果: ${passed} 通过, ${failed} 失败`);
  if (failed === 0) {
    console.log('✅ 所有 CheckpointManager 测试通过！');
  } else {
    console.log('❌ 有测试失败');
    process.exitCode = 1;
  }
}

testCheckpointManager();
