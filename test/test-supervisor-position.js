const {
  SupervisorPosition, PLATFORM_STATUS, POSITION_ROLE,
  ELECTION_STATE, TASK_DELEGATION_STATUS
} = require('../src/supervisor-position');

async function testSupervisorPosition() {
  console.log('🧪 测试 SupervisorPosition...\n');

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

  try {
    // ---- Test 1: 常量导出 ----
    console.log('\nTest 1: 常量导出');
    assert(typeof PLATFORM_STATUS === 'object', 'PLATFORM_STATUS 已导出');
    assert(PLATFORM_STATUS.ONLINE === 'online', 'ONLINE 状态');
    assert(PLATFORM_STATUS.OFFLINE === 'offline', 'OFFLINE 状态');
    assert(typeof POSITION_ROLE === 'object', 'POSITION_ROLE 已导出');
    assert(POSITION_ROLE.LEADER === 'leader', 'LEADER 角色');
    assert(POSITION_ROLE.FOLLOWER === 'follower', 'FOLLOWER 角色');
    assert(typeof ELECTION_STATE === 'object', 'ELECTION_STATE 已导出');
    assert(typeof TASK_DELEGATION_STATUS === 'object', 'TASK_DELEGATION_STATUS 已导出');

    // ---- Test 2: 基本实例化 ----
    console.log('\nTest 2: 基本实例化');
    const sp = new SupervisorPosition({
      platformId: 'platform-1',
      logger: silentLogger
    });
    assert(sp !== null, 'SupervisorPosition 创建成功');
    assert(sp.platformId === 'platform-1', '平台 ID 正确');
    assert(sp.role === POSITION_ROLE.FOLLOWER, '默认角色为 FOLLOWER');
    assert(sp.platforms.size === 1, '自动注册自身');

    // ---- Test 3: 平台注册 ----
    console.log('\nTest 3: 平台注册');
    const reg = sp.registerPlatform('platform-2', {
      name: 'VS Code',
      capabilities: ['code', 'debug'],
      priority: 50
    });
    assert(reg.success === true, '注册成功');
    assert(reg.platform.id === 'platform-2', 'ID 正确');
    assert(reg.platform.status === PLATFORM_STATUS.ONLINE, '状态为 ONLINE');
    assert(sp.platforms.size === 2, '2 个平台');

    sp.registerPlatform('platform-3', { name: 'Terminal', priority: 30 });
    assert(sp.platforms.size === 3, '3 个平台');

    // ---- Test 4: 平台限制 ----
    console.log('\nTest 4: 平台限制');
    const smallSP = new SupervisorPosition({ maxPlatforms: 2, logger: silentLogger });
    smallSP.registerPlatform('extra', {});
    const overLimit = smallSP.registerPlatform('too-many', {});
    assert(overLimit.success === false, '超过限制拒绝注册');
    assert(overLimit.error.includes('上限'), '错误信息正确');

    // ---- Test 5: 平台注销 ----
    console.log('\nTest 5: 平台注销');
    sp.registerPlatform('temp-platform', {});
    assert(sp.platforms.size === 4, '注册成功');
    const unreg = sp.unregisterPlatform('temp-platform');
    assert(unreg === true, '注销成功');
    assert(sp.platforms.size === 3, '平台数恢复');
    assert(sp.unregisterPlatform('nonexistent') === false, '不存在返回 false');

    // ---- Test 6: 列出平台 ----
    console.log('\nTest 6: 列出平台');
    const allPlatforms = sp.listPlatforms();
    assert(allPlatforms.length === 3, '列出 3 个平台');
    const onlinePlatforms = sp.listPlatforms({ status: PLATFORM_STATUS.ONLINE });
    assert(onlinePlatforms.length === 3, '3 个在线');

    // ---- Test 7: 心跳发送 ----
    console.log('\nTest 7: 心跳发送');
    const hb1 = sp.sendHeartbeat('platform-2');
    assert(hb1.success === true, '心跳发送成功');
    assert(typeof hb1.timestamp === 'number', '有时间戳');
    assert(sp.stats.heartbeatsSent >= 1, 'heartbeatsSent >= 1');

    const badHb = sp.sendHeartbeat('nonexistent');
    assert(badHb.success === false, '未注册平台拒绝');

    // ---- Test 8: 心跳接收 ----
    console.log('\nTest 8: 心跳接收');
    const hbRecv = sp.receiveHeartbeat('platform-3');
    assert(hbRecv.success === true, '心跳接收成功');
    assert(sp.stats.heartbeatsReceived >= 1, 'heartbeatsReceived >= 1');

    // ---- Test 9: 心跳超时检查 ----
    console.log('\nTest 9: 心跳超时检查');
    // 模拟 platform-3 心跳过期
    sp.heartbeats.set('platform-3', Date.now() - 20000); // 20秒前
    sp.heartbeatTimeout = 15000;
    const hbCheck = sp.checkHeartbeats();
    assert(Array.isArray(hbCheck.timedOut), 'timedOut 是数组');
    assert(hbCheck.timedOut.includes('platform-3'), 'platform-3 超时');
    const p3 = sp.getPlatform('platform-3');
    assert(p3.status === PLATFORM_STATUS.OFFLINE, 'platform-3 状态为 OFFLINE');

    // ---- Test 10: 心跳恢复 ----
    console.log('\nTest 10: 心跳恢复');
    sp.receiveHeartbeat('platform-3');
    const p3after = sp.getPlatform('platform-3');
    assert(p3after.status === PLATFORM_STATUS.ONLINE, '心跳恢复后状态为 ONLINE');

    // ---- Test 11: 领导者选举 ----
    console.log('\nTest 11: 领导者选举');
    const election = sp.startElection('initial');
    assert(election.success === true, '选举成功');
    assert(typeof election.winner === 'string', '有获胜者');
    assert(sp.currentLeader !== null, '有领导者');
    assert(sp.stats.electionsHeld >= 1, 'electionsHeld >= 1');
    // platform-1 优先级 100，应当选
    assert(election.winner === 'platform-1', '最高优先级当选');
    assert(sp.role === POSITION_ROLE.LEADER, '自身角色变为 LEADER');
    assert(sp.isLeader() === true, 'isLeader() = true');

    // ---- Test 12: 获取当前领导者 ----
    console.log('\nTest 12: 获取当前领导者');
    const leader = sp.getCurrentLeader();
    assert(leader !== null, '有领导者');
    assert(leader.id === 'platform-1', '领导者 ID 正确');

    // ---- Test 13: 选举历史 ----
    console.log('\nTest 13: 选举历史');
    const history = sp.getElectionHistory();
    assert(Array.isArray(history), '选举历史是数组');
    assert(history.length >= 1, '有选举记录');
    assert(history[0].winner === 'platform-1', '记录包含获胜者');
    assert(history[0].reason === 'initial', '记录包含原因');

    // ---- Test 14: 任务委派 ----
    console.log('\nTest 14: 任务委派');
    const delegation = sp.delegateTask('platform-2', {
      name: 'code-review',
      type: 'review',
      payload: { file: 'index.js' },
      priority: 1
    });
    assert(delegation.success === true, '委派成功');
    assert(typeof delegation.taskId === 'string', '有任务 ID');
    assert(delegation.delegation.status === TASK_DELEGATION_STATUS.ASSIGNED, '状态为 ASSIGNED');
    assert(sp.stats.tasksDelegated >= 1, 'tasksDelegated >= 1');

    // ---- Test 15: 非领导者不能委派 ----
    console.log('\nTest 15: 非领导者不能委派');
    const sp2 = new SupervisorPosition({ platformId: 'follower', logger: silentLogger });
    const badDeleg = sp2.delegateTask('someone', { name: 'test' });
    assert(badDeleg.success === false, '非领导者拒绝委派');

    // ---- Test 16: 自动分配任务 ----
    console.log('\nTest 16: 自动分配任务');
    const autoResult = sp.autoDelegate({ name: 'auto-task', type: 'build' });
    assert(autoResult.success === true, '自动分配成功');
    // 应分配给负载最少的 follower
    assert(
      autoResult.delegation.targetPlatform === 'platform-2' ||
      autoResult.delegation.targetPlatform === 'platform-3',
      '分配给 follower'
    );

    // ---- Test 17: 完成任务 ----
    console.log('\nTest 17: 完成任务');
    const completed = sp.completeTask(delegation.taskId, {
      success: true,
      output: 'Review complete'
    });
    assert(completed === true, '完成任务成功');
    const task = sp.getDelegatedTask(delegation.taskId);
    assert(task.status === TASK_DELEGATION_STATUS.COMPLETED, '状态为 COMPLETED');
    assert(task.result.output === 'Review complete', '结果正确');
    assert(sp.stats.tasksCompleted >= 1, 'tasksCompleted >= 1');

    // ---- Test 18: 任务失败 ----
    console.log('\nTest 18: 任务失败');
    const failDeleg = sp.delegateTask('platform-2', { name: 'fail-task' });
    sp.completeTask(failDeleg.taskId, { success: false, error: 'timeout' });
    const failTask = sp.getDelegatedTask(failDeleg.taskId);
    assert(failTask.status === TASK_DELEGATION_STATUS.FAILED, '失败任务状态正确');

    // ---- Test 19: 列出任务 ----
    console.log('\nTest 19: 列出任务');
    const allTasks = sp.listDelegatedTasks();
    assert(allTasks.length >= 3, `至少 3 个任务 (实际: ${allTasks.length})`);
    const completedTasks = sp.listDelegatedTasks({ status: TASK_DELEGATION_STATUS.COMPLETED });
    assert(completedTasks.length >= 1, '至少 1 个完成');

    // ---- Test 20: 共享状态更新 ----
    console.log('\nTest 20: 共享状态更新');
    const stateUpdate = sp.updateSharedState('config', { mode: 'production' });
    assert(stateUpdate.success === true, '状态更新成功');
    assert(stateUpdate.version === 1, '版本为 1');
    assert(sp.getSharedState('config').mode === 'production', '状态值正确');

    sp.updateSharedState('metrics', { count: 42 });
    assert(sp.getStateVersion() === 2, '版本递增到 2');

    // ---- Test 21: 获取全部共享状态 ----
    console.log('\nTest 21: 获取全部共享状态');
    const allState = sp.getSharedState();
    assert(typeof allState === 'object', '全部状态是对象');
    assert(allState.config.mode === 'production', 'config 正确');
    assert(allState.metrics.count === 42, 'metrics 正确');

    // ---- Test 22: 状态同步包 ----
    console.log('\nTest 22: 状态同步包');
    const syncPkg = sp.createSyncPackage();
    assert(syncPkg.version === 2, '同步包版本正确');
    assert(typeof syncPkg.state === 'object', '包含状态');
    assert(syncPkg.leader === 'platform-1', '包含领导者');
    assert(Array.isArray(syncPkg.platforms), '包含平台列表');

    // ---- Test 23: 应用同步包 ----
    console.log('\nTest 23: 应用同步包');
    const sp3 = new SupervisorPosition({ platformId: 'platform-4', logger: silentLogger });
    syncPkg.version = 10; // 高于 sp3 的版本
    const applyResult = sp3.applySyncPackage(syncPkg);
    assert(applyResult.success === true, '同步包应用成功');
    assert(sp3.getStateVersion() === 10, '版本已同步');
    assert(sp3.getSharedState('config').mode === 'production', '状态已同步');

    // ---- Test 24: 旧版本同步包拒绝 ----
    console.log('\nTest 24: 旧版本同步包拒绝');
    const oldPkg = { version: 5, state: {} };
    const rejectResult = sp3.applySyncPackage(oldPkg);
    assert(rejectResult.success === false, '旧版本同步包被拒绝');

    // ---- Test 25: 无效同步包 ----
    console.log('\nTest 25: 无效同步包');
    assert(sp3.applySyncPackage(null).success === false, 'null 同步包拒绝');
    assert(sp3.applySyncPackage({}).success === false, '空同步包拒绝');

    // ---- Test 26: 领导者崩溃恢复 ----
    console.log('\nTest 26: 领导者崩溃恢复');
    const crash = sp.simulateLeaderCrash();
    assert(crash.success === true, '崩溃恢复成功');
    assert(crash.crashedLeader === 'platform-1', '崩溃的领导者正确');
    assert(crash.recovered === true, '已恢复');
    // platform-1 离线后，应选出新领导者
    assert(crash.newLeader !== null, '有新领导者');
    assert(sp.stats.leaderChanges >= 2, 'leaderChanges >= 2');

    // ---- Test 27: 领导者注销触发选举 ----
    console.log('\nTest 27: 领导者注销触发选举');
    const sp5 = new SupervisorPosition({ platformId: 'main', logger: silentLogger });
    sp5.registerPlatform('backup', { priority: 50 });
    sp5.startElection('init');
    assert(sp5.currentLeader === 'main', '初始领导者是 main');
    sp5.unregisterPlatform('main');
    // 领导者注销应触发选举
    assert(sp5.currentLeader === 'backup', 'backup 接管领导权');

    // ---- Test 28: 无领导者时崩溃恢复 ----
    console.log('\nTest 28: 无领导者时崩溃恢复');
    const emptySP = new SupervisorPosition({ logger: silentLogger });
    emptySP.currentLeader = null;
    const noCrash = emptySP.simulateLeaderCrash();
    assert(noCrash.success === false, '无领导者返回失败');

    // ---- Test 29: getStats ----
    console.log('\nTest 29: getStats');
    const stats = sp.getStats();
    assert(stats.platformCount >= 3, '平台数 >= 3');
    assert(stats.electionsHeld >= 2, '选举次数 >= 2');
    assert(stats.tasksDelegated >= 3, '委派任务数 >= 3');
    assert(stats.stateSyncs >= 2, '状态同步数 >= 2');
    assert(typeof stats.currentRole === 'string', '有当前角色');
    assert(typeof stats.currentLeader === 'string', '有当前领导者');
    assert(typeof stats.stateVersion === 'number', '有状态版本');

    // ---- Test 30: 事件日志 ----
    console.log('\nTest 30: 事件日志');
    const events = sp.getEventLog();
    assert(Array.isArray(events), '事件日志是数组');
    assert(events.length > 0, '有事件记录');
    assert(events.some(e => e.event === 'platform_registered'), '包含注册事件');
    assert(events.some(e => e.event === 'election_resolved'), '包含选举事件');
    assert(events.some(e => e.event === 'task_delegated'), '包含委派事件');

    // ---- Test 31: 能力匹配自动分配 ----
    console.log('\nTest 31: 能力匹配自动分配');
    // 先把 sp 恢复为领导者
    sp.getPlatform('platform-1').status = PLATFORM_STATUS.ONLINE;
    sp.startElection('restore');
    assert(sp.isLeader(), 'platform-1 恢复领导者');

    const capResult = sp.autoDelegate({
      name: 'debug-task',
      requiredCapability: 'debug'
    });
    assert(capResult.success === true, '能力匹配分配成功');
    // platform-2 有 debug 能力
    assert(capResult.delegation.targetPlatform === 'platform-2', '分配给有能力的平台');

  } catch (error) {
    console.log(`\n❌ 测试异常: ${error.message}`);
    console.log(error.stack);
    failed++;
  }

  console.log(`\n========================================`);
  console.log(`测试结果: ${passed} 通过, ${failed} 失败`);
  if (failed === 0) {
    console.log('✅ 所有 SupervisorPosition 测试通过！');
  } else {
    console.log('❌ 有测试失败');
    process.exitCode = 1;
  }
}

testSupervisorPosition();
