'use strict';
const assert  = require('assert');
const path    = require('path');
const fs      = require('fs');
const os      = require('os');
const ScheduleMemory = require('../src/schedule-memory');
const KnowledgeBase  = require('../src/knowledge-base');

// ── 测试工具 ──────────────────────────────────────────────────
let passed = 0, failed = 0;
function check(label, cond, detail = '') {
  if (cond) { console.log(`  ✅ ${label}`); passed++; }
  else       { console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}
function shouldThrow(label, fn) {
  try { fn(); console.log(`  ❌ ${label} — 应抛出但未抛出`); failed++; }
  catch { console.log(`  ✅ ${label}`); passed++; }
}

// ── 共享 KB（临时目录）───────────────────────────────────────
const TMP = path.join(os.tmpdir(), `sm_test_${Date.now()}`);
let sm, kb;

async function run() {
  kb = new KnowledgeBase(TMP);
  sm = new ScheduleMemory(kb, { executionLogHot: 5, contextSnapshotMax: 3 });

  // ── Test 1: 静态常量 ────────────────────────────────────────
  console.log('\nTest 1: 静态常量');
  check('TASK_STATUS 存在',  !!ScheduleMemory.TASK_STATUS);
  check('PRIORITY 存在',     !!ScheduleMemory.PRIORITY);
  check('THRESHOLDS 存在',   !!ScheduleMemory.THRESHOLDS);
  check('HIGH 阈值 = 2',     ScheduleMemory.THRESHOLDS.high   === 2);
  check('NORMAL 阈值 = 3',   ScheduleMemory.THRESHOLDS.normal === 3);

  // ── Test 2: Layer 1 — Registry ──────────────────────────────
  console.log('\nTest 2: Layer 1 — Registry（任务定义）');

  const r1 = sm.registerTask({
    id: 'daily_scan', name: '每日安全扫描',
    cron: '0 2 * * *', handler: 'inspector',
    taskMessage: '执行安全漏洞扫描', priority: 'high'
  });
  check('注册新任务成功',   r1.isNew === true);
  check('version = 1',     r1.version === 1);
  check('prevVersion = null', r1.prevVersion === null);

  const def = sm.getTask('daily_scan');
  check('getTask 返回定义',  def !== null);
  check('priority 正确',    def.priority === 'high');
  check('enabled 默认 true', def.enabled === true);
  check('contentHash 存在', typeof def.contentHash === 'string');

  // 更新非核心字段 → 不升版
  const r2 = sm.registerTask({
    id: 'daily_scan', name: '每日安全扫描（更新描述）',
    cron: '0 2 * * *', handler: 'inspector',
    taskMessage: '执行安全漏洞扫描', priority: 'high'
  });
  check('相同核心字段不升版', r2.version === 1);

  // 修改 cron → 升版
  const r3 = sm.registerTask({
    id: 'daily_scan', name: '每日安全扫描',
    cron: '0 3 * * *', handler: 'inspector',   // cron 变了
    taskMessage: '执行安全漏洞扫描', priority: 'high'
  });
  check('核心字段变化升版',  r3.version === 2);
  check('prevVersion = 1',   r3.prevVersion === 1);

  // 注册另一个任务
  sm.registerTask({
    id: 'weekly_report', name: '周报', cron: '0 9 * * 1',
    handler: 'general', taskMessage: '生成周报', priority: 'normal'
  });
  const list = sm.listTasks();
  check('listTasks 返回数组', Array.isArray(list));
  check('listTasks 含2个任务', list.length === 2);

  // 缺少必需字段抛错
  shouldThrow('缺少 cron 抛错',
    () => sm.registerTask({ id: 'x', handler: 'g', taskMessage: 't' }));

  // ── Test 3: getNextRun ───────────────────────────────────────
  console.log('\nTest 3: getNextRun（下次触发时间）');
  const next = sm.getNextRun('daily_scan');
  check('getNextRun 返回 Date', next instanceof Date);
  check('下次时间在未来', next > new Date());
  check('未注册任务返回 null', sm.getNextRun('non_existent') === null);

  // ── Test 4: Layer 2 — ExecutionLog ──────────────────────────
  console.log('\nTest 4: Layer 2 — ExecutionLog（执行历史）');

  const execId1 = sm.recordStart('daily_scan');
  check('recordStart 返回 execId', typeof execId1 === 'string' && execId1.startsWith('exec_'));

  const e1 = sm.recordSuccess(execId1, { filesScanned: 42 });
  check('recordSuccess status = success', e1.status === 'success');
  check('duration 是数字', typeof e1.duration === 'number');
  check('result 正确', e1.result?.filesScanned === 42);

  const execId2 = sm.recordStart('daily_scan');
  const e2 = sm.recordFailure(execId2, '连接数据库失败');
  check('recordFailure status = failed', e2.status === 'failed');
  check('error 正确', e2.error === '连接数据库失败');

  const execId3 = sm.recordStart('daily_scan');
  const e3 = sm.recordTimeout(execId3);
  check('recordTimeout status = timeout', e3.status === 'timeout');

  const log = sm.getExecutionLog('daily_scan');
  check('getExecutionLog 返回数组', Array.isArray(log));
  check('日志含3条记录', log.length === 3);

  const last = sm.getLastExecution('daily_scan');
  check('getLastExecution 返回最后一条', last.executionId === execId3);

  shouldThrow('未注册任务 recordStart 抛错',
    () => sm.recordStart('non_existent'));

  // ── Test 5: ExecutionLog Hot 上限 ────────────────────────────
  console.log('\nTest 5: ExecutionLog Hot 上限（配置 max=5）');
  // 再跑3次，总共6次（超过 hot=5）
  for (let i = 0; i < 3; i++) {
    const id = sm.recordStart('daily_scan');
    sm.recordSuccess(id);
  }
  const hotLog = sm.getExecutionLog('daily_scan', 100);
  check('Hot 日志不超过5条', hotLog.length <= 5);

  // ── Test 6: Layer 3 — StateStore ─────────────────────────────
  console.log('\nTest 6: Layer 3 — StateStore（断点续传）');

  sm.saveState('daily_scan', { lastProcessedId: 1234, cursor: 'page_5' });
  const s1 = sm.loadState('daily_scan');
  check('loadState 返回状态', s1 !== null);
  check('state 内容正确', s1.state.lastProcessedId === 1234);
  check('version = 1', s1.version === 1);
  check('savedAt 存在', typeof s1.savedAt === 'string');

  sm.saveState('daily_scan', { lastProcessedId: 1500, cursor: 'page_8' });
  const s2 = sm.loadState('daily_scan');
  check('state 更新正确', s2.state.lastProcessedId === 1500);
  check('version = 2', s2.version === 2);

  sm.clearState('daily_scan');
  const s3 = sm.loadState('daily_scan');
  check('clearState 后 state = null', s3.state === null);

  check('未保存状态返回 null', sm.loadState('weekly_report') === null);

  // ── Test 7: Layer 4 — FailureMemory ──────────────────────────
  console.log('\nTest 7: Layer 4 — FailureMemory（失败记忆 + 商议触发）');

  // weekly_report 是 normal 优先级，阈值3
  const r_wr1 = sm.registerTask({
    id: 'weekly_report', name: '周报', cron: '0 9 * * 1',
    handler: 'general', taskMessage: '生成周报', priority: 'normal'
  });
  sm.registerTask({
    id: 'high_task', name: '高优任务', cron: '* * * * *',
    handler: 'inspector', taskMessage: '关键检查', priority: 'high'
  });

  // normal 任务连续失败
  for (let i = 0; i < 2; i++) {
    const id = sm.recordStart('weekly_report');
    sm.recordFailure(id, '网络超时');
  }
  let d1 = sm.shouldDeliberate('weekly_report');
  check('2次失败未达 normal 阈值(3)', d1.should === false);
  check('consecutiveFails = 2', d1.consecutiveFails === 2);

  const id3 = sm.recordStart('weekly_report');
  sm.recordFailure(id3, '网络超时');
  let d2 = sm.shouldDeliberate('weekly_report');
  check('3次失败触发 normal 商议', d2.should === true);
  check('reason = consecutive_failures', d2.reason === 'consecutive_failures');

  // 成功后清零
  const id4 = sm.recordStart('weekly_report');
  sm.recordSuccess(id4);
  let d3 = sm.shouldDeliberate('weekly_report');
  check('成功后不触发商议', d3.should === false);
  check('consecutiveFails 清零', d3.consecutiveFails === 0);

  // high 任务 2 次失败触发
  for (let i = 0; i < 2; i++) {
    const id = sm.recordStart('high_task');
    sm.recordFailure(id, '安全检查失败');
  }
  let d4 = sm.shouldDeliberate('high_task');
  check('2次失败触发 high 商议', d4.should === true);

  // 超时触发（不论优先级）
  sm.registerTask({
    id: 'timeout_task', name: '超时任务', cron: '0 0 * * *',
    handler: 'general', taskMessage: '耗时操作', priority: 'low'
  });
  for (let i = 0; i < 2; i++) {
    const id = sm.recordStart('timeout_task');
    sm.recordTimeout(id);
  }
  let d5 = sm.shouldDeliberate('timeout_task');
  check('连续超时2次触发商议', d5.should === true);
  check('reason = consecutive_timeouts', d5.reason === 'consecutive_timeouts');

  // 商议计数
  sm.recordDeliberation('weekly_report', { decision: 'proceed_modified' });
  const fm = sm.getFailureMemory('weekly_report');
  check('商议计数 = 1', fm.deliberationCount === 1);
  check('lastDeliberationDecision 记录', fm.lastDeliberationDecision === 'proceed_modified');

  sm.recordDeliberation('weekly_report', { decision: 'proceed' });
  check('商议2次后需要人工介入', sm.needsHuman('weekly_report') === true);

  // 版本升级清零失败计数
  const beforeFails = sm.getFailureMemory('high_task').consecutiveFails;
  sm.registerTask({
    id: 'high_task', name: '高优任务v2', cron: '0 * * * *',  // cron 变了
    handler: 'inspector', taskMessage: '关键检查', priority: 'high'
  });
  const afterFails = sm.getFailureMemory('high_task').consecutiveFails;
  check('版本升级清零失败计数', afterFails === 0);
  check('升级前失败计数>0', beforeFails > 0);

  // ── Test 8: Layer 5 — ContextSnapshot ────────────────────────
  console.log('\nTest 8: Layer 5 — ContextSnapshot（上下文快照）');

  const snapExecId = sm.recordStart('daily_scan');
  const snap1 = sm.saveSnapshot(snapExecId, {
    codeVersion: 'abc123', relatedFiles: ['src/auth.js'], agentFindings: { issues: 2 }
  });
  check('saveSnapshot 返回快照', !!snap1);
  check('executionId 正确', snap1.executionId === snapExecId);
  check('context 存在', !!snap1.context.codeVersion);

  const snaps = sm.getSnapshots('daily_scan');
  check('getSnapshots 返回数组', Array.isArray(snaps));
  check('快照数量 >= 1', snaps.length >= 1);

  // 超过 max(3) 会截断
  for (let i = 0; i < 4; i++) {
    const id = sm.recordStart('daily_scan');
    sm.saveSnapshot(id, { codeVersion: `v${i}` });
  }
  const snapsAfter = sm.getSnapshots('daily_scan', 10);
  check('快照不超过 max(3)', snapsAfter.length <= 3);

  // ── Test 9: getMemorySnapshot ────────────────────────────────
  console.log('\nTest 9: getMemorySnapshot（综合快照）');

  const ms = sm.getMemorySnapshot('daily_scan');
  check('返回快照对象', !!ms);
  check('含 definition',     !!ms.definition);
  check('含 lastExecution',  ms.lastExecution !== undefined);
  check('含 currentState',   ms.currentState !== undefined);
  check('含 failureMemory',  ms.failureMemory !== undefined);
  check('含 deliberate',     !!ms.deliberate);
  check('含 nextRun',        typeof ms.nextRun === 'string');
  check('含 needsHuman',     typeof ms.needsHuman === 'boolean');
  check('含 snapshotAt',     typeof ms.snapshotAt === 'string');

  // ── 清理 ────────────────────────────────────────────────────
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}

  // ── 统计 ────────────────────────────────────────────────────
  console.log('\n========================================');
  console.log(`测试结果: ${passed} 通过, ${failed} 失败`);
  console.log('========================================\n');

  if (failed > 0) { console.error('❌ 有测试失败'); process.exit(1); }
  else             { console.log('✅ 全部通过'); }
}

run().catch(err => { console.error('测试运行异常:', err); process.exit(1); });
