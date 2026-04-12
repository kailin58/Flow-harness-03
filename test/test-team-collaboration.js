const { TeamCollaboration, MEMBER_ROLE, TASK_STATUS, ACTIVITY_TYPE, ROLE_PERMISSIONS } = require('../src/team-collaboration');
const fs = require('fs');
const path = require('path');
const os = require('os');

async function testTeamCollaboration() {
  console.log('🧪 测试 TeamCollaboration...\n');

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

  const tmpDir = path.join(os.tmpdir(), `fh-team-${Date.now()}`);

  try {
    // ---- Test 1: 常量导出 ----
    console.log('\nTest 1: 常量导出');
    assert(typeof MEMBER_ROLE === 'object', 'MEMBER_ROLE 已导出');
    assert(MEMBER_ROLE.OWNER === 'owner', 'OWNER 角色');
    assert(MEMBER_ROLE.DEVELOPER === 'developer', 'DEVELOPER 角色');
    assert(typeof TASK_STATUS === 'object', 'TASK_STATUS 已导出');
    assert(TASK_STATUS.OPEN === 'open', 'OPEN 状态');
    assert(TASK_STATUS.DONE === 'done', 'DONE 状态');
    assert(typeof ACTIVITY_TYPE === 'object', 'ACTIVITY_TYPE 已导出');
    assert(typeof ROLE_PERMISSIONS === 'object', 'ROLE_PERMISSIONS 已导出');
    assert(ROLE_PERMISSIONS[MEMBER_ROLE.OWNER].includes('manage_team'), 'OWNER 有 manage_team 权限');

    // ---- Test 2: 基本实例化 ----
    console.log('\nTest 2: 基本实例化');
    const team = new TeamCollaboration({ storageDir: tmpDir, teamName: 'test-team', logger: silentLogger });
    assert(team !== null, 'TeamCollaboration 创建成功');
    assert(team.teamName === 'test-team', '团队名正确');

    // ---- Test 3: 成员管理 ----
    console.log('\nTest 3: 成员管理');
    const r1 = team.addMember('user1', 'Alice', MEMBER_ROLE.OWNER);
    assert(r1.success === true, '添加 Alice 成功');
    assert(r1.member.role === MEMBER_ROLE.OWNER, 'Alice 是 OWNER');

    team.addMember('user2', 'Bob', MEMBER_ROLE.DEVELOPER);
    team.addMember('user3', 'Charlie', MEMBER_ROLE.REVIEWER);
    team.addMember('user4', 'Diana', MEMBER_ROLE.VIEWER);

    assert(team.listMembers().length === 4, '4 个成员');

    // 重复添加
    const dup = team.addMember('user1', 'Alice Again');
    assert(dup.success === false, '重复添加失败');

    // ---- Test 4: 权限检查 ----
    console.log('\nTest 4: 权限检查');
    assert(team.hasPermission('user1', 'manage_team') === true, 'OWNER 有 manage_team');
    assert(team.hasPermission('user2', 'manage_tasks') === true, 'DEVELOPER 有 manage_tasks');
    assert(team.hasPermission('user3', 'manage_tasks') === false, 'REVIEWER 无 manage_tasks');
    assert(team.hasPermission('user4', 'view') === true, 'VIEWER 有 view');
    assert(team.hasPermission('user4', 'annotate') === false, 'VIEWER 无 annotate');
    assert(team.hasPermission('nonexistent', 'view') === false, '不存在用户返回 false');

    // ---- Test 5: 角色更新 ----
    console.log('\nTest 5: 角色更新');
    const roleResult = team.updateRole('user4', MEMBER_ROLE.DEVELOPER);
    assert(roleResult.success === true, '更新角色成功');
    assert(team.hasPermission('user4', 'manage_tasks') === true, '升级后有 manage_tasks');

    // ---- Test 6: 创建任务 ----
    console.log('\nTest 6: 创建任务');
    const t1 = team.createTask({ title: 'Fix login bug', description: 'Critical login issue', priority: 'high', createdBy: 'user1', tags: ['bug', 'auth'] });
    assert(t1.id.startsWith('T-'), '任务 ID 正确');
    assert(t1.status === TASK_STATUS.OPEN, '状态为 OPEN');
    assert(t1.priority === 'high', '优先级 high');
    assert(t1.tags.includes('bug'), '标签包含 bug');

    const t2 = team.createTask({ title: 'Add unit tests', createdBy: 'user2', tags: ['test'] });
    const t3 = team.createTask({ title: 'Update docs', priority: 'low' });

    assert(team.listTasks().length === 3, '3 个任务');

    // ---- Test 7: 分配任务 ----
    console.log('\nTest 7: 分配任务');
    const assign1 = team.assignTask(t1.id, 'user2');
    assert(assign1.success === true, '分配成功');
    assert(assign1.task.assignee === 'user2', '分配给 Bob');
    assert(assign1.task.status === TASK_STATUS.ASSIGNED, '状态变为 ASSIGNED');

    // 分配给不存在的人
    const badAssign = team.assignTask(t2.id, 'nonexistent');
    assert(badAssign.success === false, '分配给不存在的人失败');

    // ---- Test 8: 更新任务状态 ----
    console.log('\nTest 8: 更新任务状态');
    const statusUp = team.updateTaskStatus(t1.id, TASK_STATUS.IN_PROGRESS);
    assert(statusUp.success === true, '更新状态成功');
    assert(statusUp.task.status === TASK_STATUS.IN_PROGRESS, '状态变为 IN_PROGRESS');
    assert(statusUp.task.history.length >= 2, '历史记录 >= 2');

    // 无效状态
    const badStatus = team.updateTaskStatus(t1.id, 'invalid');
    assert(badStatus.success === false, '无效状态失败');

    // ---- Test 9: 任务过滤 ----
    console.log('\nTest 9: 任务过滤');
    team.assignTask(t2.id, 'user2');
    const bobTasks = team.listTasks({ assignee: 'user2' });
    assert(bobTasks.length === 2, 'Bob 有 2 个任务');

    const highTasks = team.listTasks({ priority: 'high' });
    assert(highTasks.length === 1, '1 个 high 优先级');

    const tagTasks = team.listTasks({ tag: 'bug' });
    assert(tagTasks.length === 1, '1 个 bug 标签任务');

    // ---- Test 10: 评论 ----
    console.log('\nTest 10: 评论');
    const comment = team.addComment(t1.id, 'user1', 'Please fix ASAP');
    assert(comment.success === true, '添加评论成功');
    assert(comment.comment.content === 'Please fix ASAP', '评论内容正确');

    const task = team.getTask(t1.id);
    assert(task.comments.length === 1, '任务有 1 条评论');

    // ---- Test 11: 共享笔记 ----
    console.log('\nTest 11: 共享笔记');
    const note1 = team.addNote('user1', 'API Design Guidelines', 'Use REST conventions...', ['design', 'api']);
    const note2 = team.addNote('user2', 'Testing Strategy', 'Focus on integration tests', ['test']);
    assert(note1.id.startsWith('N-'), '笔记 ID 正确');
    assert(team.sharedNotes.length === 2, '2 条笔记');

    // 搜索
    const apiNotes = team.searchNotes('api');
    assert(apiNotes.length === 1, '搜索 api 返回 1 条');
    const testNotes = team.searchNotes('test');
    assert(testNotes.length === 1, '搜索 test 返回 1 条');

    // ---- Test 12: 代码标注 ----
    console.log('\nTest 12: 代码标注');
    const anno1 = team.addAnnotation({
      file: 'src/auth.js',
      line: 42,
      content: 'TODO: Add rate limiting',
      userId: 'user1',
      type: 'todo'
    });
    team.addAnnotation({
      file: 'src/auth.js',
      line: 100,
      content: 'Security risk here',
      userId: 'user3',
      type: 'warning'
    });
    team.addAnnotation({
      file: 'src/api.js',
      line: 10,
      content: 'Consider caching',
      userId: 'user2',
      type: 'info'
    });

    assert(anno1.id.startsWith('A-'), '标注 ID 正确');
    const fileAnnos = team.getAnnotations('src/auth.js');
    assert(fileAnnos.length === 2, 'auth.js 有 2 个标注');

    const allAnnos = team.getAnnotations();
    assert(allAnnos.length === 3, '共 3 个标注');

    // 解决标注
    assert(team.resolveAnnotation(anno1.id) === true, '解决标注成功');
    assert(team.resolveAnnotation('nonexistent') === false, '不存在返回 false');

    // ---- Test 13: 移除成员 ----
    console.log('\nTest 13: 移除成员');
    assert(team.removeMember('user3') === true, '移除 Charlie 成功');
    assert(team.listMembers().length === 3, '剩 3 个成员');
    assert(team.removeMember('nonexistent') === false, '不存在返回 false');

    // ---- Test 14: 变更摘要 ----
    console.log('\nTest 14: 变更摘要');
    const summary = team.generateChangeSummary(60000); // 最近 1 分钟
    assert(summary.totalActivities > 0, `有活动 (${summary.totalActivities})`);
    assert(summary.highlights.length > 0, '有高亮');
    assert(typeof summary.byType === 'object', 'byType 是对象');

    // ---- Test 15: 活动日志 ----
    console.log('\nTest 15: 活动日志');
    const log = team.getActivityLog(10);
    assert(log.length > 0, '活动日志非空');
    assert(log[0].type !== undefined, '日志有 type');
    assert(log[0].timestamp !== undefined, '日志有 timestamp');

    // ---- Test 16: 统计 ----
    console.log('\nTest 16: 统计');
    const stats = team.getStats();
    assert(stats.teamName === 'test-team', '团队名正确');
    assert(stats.memberCount === 3, '3 个成员');
    assert(stats.taskCount === 3, '3 个任务');
    assert(typeof stats.tasksByStatus === 'object', 'tasksByStatus 存在');
    assert(stats.annotationCount === 3, '3 个标注');
    assert(stats.unresolvedAnnotations === 2, '2 个未解决标注');
    assert(stats.noteCount === 2, '2 条笔记');
    assert(typeof stats.workload === 'object', 'workload 存在');

    // ---- Test 17: 导出/导入 ----
    console.log('\nTest 17: 导出/导入');
    const exported = team.exportData();
    assert(exported.teamName === 'test-team', '导出团队名');
    assert(typeof exported.members === 'object', '导出成员');
    assert(typeof exported.tasks === 'object', '导出任务');

    const team2 = new TeamCollaboration({ storageDir: path.join(tmpDir, 'import'), logger: silentLogger });
    team2.importData(exported);
    assert(team2.listMembers().length === 3, '导入后 3 个成员');
    assert(team2.teamName === 'test-team', '导入团队名正确');

    // ---- Test 18: 持久化 ----
    console.log('\nTest 18: 持久化');
    const savePath = team.save();
    assert(fs.existsSync(savePath), '保存文件存在');

    const team3 = new TeamCollaboration({ storageDir: tmpDir, logger: silentLogger });
    const loaded = team3.load();
    assert(loaded === true, '加载成功');
    assert(team3.listMembers().length === 3, '加载后 3 个成员');
    assert(team3.teamName === 'test-team', '加载团队名正确');

    // ---- Test 19: getMember ----
    console.log('\nTest 19: getMember');
    const alice = team.getMember('user1');
    assert(alice !== null, 'Alice 存在');
    assert(alice.name === 'Alice', '名称正确');
    assert(team.getMember('nonexistent') === null, '不存在返回 null');

    // ---- Test 20: getTask / addComment edge ----
    console.log('\nTest 20: 边界测试');
    assert(team.getTask('nonexistent') === null, '不存在任务返回 null');
    const badComment = team.addComment('nonexistent', 'user1', 'test');
    assert(badComment.success === false, '不存在任务添加评论失败');
    const badAssign2 = team.assignTask('nonexistent', 'user1');
    assert(badAssign2.success === false, '不存在任务分配失败');

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
    console.log('✅ 所有 TeamCollaboration 测试通过！');
  } else {
    console.log('❌ 有测试失败');
    process.exitCode = 1;
  }
}

testTeamCollaboration();
