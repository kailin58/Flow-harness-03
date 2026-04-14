'use strict';
/**
 * test-comm-router.js — CommRouter 通信规则 + KB 命名空间测试
 */
const assert  = require('assert');
const path    = require('path');
const fs      = require('fs');
const os      = require('os');
const CommRouter  = require('../src/comm-router');
const { CommError, COMM_RESULT, COMM_RULES, SESSION_TOPOLOGY } = require('../src/comm-router');
const AgentRegistry = require('../src/agent-registry');
const KnowledgeBase = require('../src/knowledge-base');

// ── 测试工具 ───────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) { console.log(`  ✅ ${label}`); passed++; }
  else           { console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}

function shouldThrow(label, fn, code) {
  try {
    fn();
    console.log(`  ❌ ${label} — 应抛出错误但未抛出`); failed++;
  } catch (e) {
    if (code && e.code !== code) {
      console.log(`  ❌ ${label} — 错误码期望 ${code}，实际 ${e.code}`); failed++;
    } else {
      console.log(`  ✅ ${label}`); passed++;
    }
  }
}

function shouldNotThrow(label, fn) {
  try { fn(); console.log(`  ✅ ${label}`); passed++; }
  catch (e) { console.log(`  ❌ ${label} — 不应抛出: ${e.message}`); failed++; }
}

// ── 构建测试用注册表 ───────────────────────────────────────────
function buildRegistry() {
  const reg = new AgentRegistry();
  reg.initializeCoreAgents();
  // 注册两个子Agent到 explore
  reg.registerSubAgent('explore', { id: 'sub_explore_1', name: 'FileSearchAgent', capability: 'file_search' });
  reg.registerSubAgent('explore', { id: 'sub_explore_2', name: 'CodeSearchAgent', capability: 'code_search' });
  // 注册两个子Agent到 plan
  reg.registerSubAgent('plan', { id: 'sub_plan_1', name: 'ArchitectAgent', capability: 'architecture_design' });
  reg.registerSubAgent('plan', { id: 'sub_plan_2', name: 'RiskAgent',      capability: 'risk_assessment' });
  return reg;
}

async function run() {
  const reg    = buildRegistry();
  const router = new CommRouter(reg, { strict: true, logAll: false });

  // ── Test 1: 模块加载 ────────────────────────────────────────
  console.log('\nTest 1: 模块加载');
  check('CommRouter 构造成功', router !== null);
  check('COMM_RESULT 枚举存在', !!COMM_RESULT);
  check('CommError 类存在', !!CommError);
  check('sessions 初始为空', router.sessions.size === 0);
  check('auditLog 初始为空', router.auditLog.length === 0);

  // ── Test 2: 层级判断 ────────────────────────────────────────
  console.log('\nTest 2: AgentRegistry 层级字段（4层架构）');
  const sup    = reg.get('supervisor');
  const vp     = reg.get('vp_digital');
  const exp    = reg.get('explore');
  check('supervisor level = 0',     sup.level === 0);
  check('vp_digital level = 1',     vp.level === 1);
  check('vp_digital parentId = supervisor', vp.parentId === 'supervisor');
  check('explore level = 2',        exp.level === 2);
  check('explore parentId = vp_digital', exp.parentId === 'vp_digital');
  check('plan parentId = vp_digital',    reg.get('plan').parentId === 'vp_digital');
  check('getLevel(supervisor) = 0', reg.getLevel('supervisor') === 0);
  check('getLevel(vp_digital) = 1', reg.getLevel('vp_digital') === 1);
  check('getLevel(explore) = 2',    reg.getLevel('explore') === 2);
  check('getLevel(sub_explore_1) = 3',   reg.getLevel('sub_explore_1') === 3);
  check('getParentId(explore) = vp_digital', reg.getParentId('explore') === 'vp_digital');
  check('getParentId(sub_explore_1) = explore', reg.getParentId('sub_explore_1') === 'explore');
  check('getCommonParent(sub_e1, sub_e2) = explore',
    reg.getCommonParent('sub_explore_1', 'sub_explore_2') === 'explore');
  check('getCommonParent(sub_e1, sub_p1) = null (跨部门)',
    reg.getCommonParent('sub_explore_1', 'sub_plan_1') === null);

  // ── Test 3: 合法的2方通信（4层架构）───────────────────────────
  console.log('\nTest 3: 合法的2方通信（4层架构）');
  shouldNotThrow('外部用户 → CEO',              () => router.send('external', 'supervisor'));
  shouldNotThrow('CEO → 外部用户',              () => router.send('supervisor', 'external'));
  shouldNotThrow('CEO → vp_digital（CEO→VP）',  () => router.send('supervisor', 'vp_digital'));
  shouldNotThrow('vp_digital → CEO（VP→CEO）',  () => router.send('vp_digital', 'supervisor'));
  shouldNotThrow('vp_digital → explore（VP→总监）', () => router.send('vp_digital', 'explore'));
  shouldNotThrow('explore → vp_digital（总监→VP）', () => router.send('explore', 'vp_digital'));
  shouldNotThrow('explore → sub_explore_1（总监→子Agent）',
    () => router.send('explore', 'sub_explore_1'));
  shouldNotThrow('sub_explore_1 → explore（子Agent→总监）',
    () => router.send('sub_explore_1', 'explore'));

  // ── Test 4: 非法通信——跳级 ──────────────────────────────────
  console.log('\nTest 4: 非法通信 — 跳级');
  shouldThrow('CEO → explore（跳过VP，禁止）',
    () => router.send('supervisor', 'explore'),
    COMM_RESULT.DENIED_SKIP_LEVEL);
  shouldThrow('CEO → plan（跳过VP，禁止）',
    () => router.send('supervisor', 'plan'),
    COMM_RESULT.DENIED_SKIP_LEVEL);
  shouldThrow('CEO → sub_explore_1（跨级）',
    () => router.send('supervisor', 'sub_explore_1'),
    COMM_RESULT.DENIED_SKIP_LEVEL);
  shouldThrow('explore → CEO（跳过VP上报，禁止）',
    () => router.send('explore', 'supervisor'),
    COMM_RESULT.DENIED_SKIP_LEVEL);
  shouldThrow('sub_explore_1 → CEO（跨级）',
    () => router.send('sub_explore_1', 'supervisor'),
    COMM_RESULT.DENIED_SKIP_LEVEL);

  // ── Test 5: 非法通信——平级需三方会话 ────────────────────────
  console.log('\nTest 5: 非法通信 — 平级需三方会话');
  shouldThrow('explore → plan（同VP下总监↔总监 需VP主持三方）',
    () => router.send('explore', 'plan'),
    COMM_RESULT.DENIED_NEED_3WAY);
  shouldThrow('plan → inspector（同VP下总监↔总监 需VP主持三方）',
    () => router.send('plan', 'inspector'),
    COMM_RESULT.DENIED_NEED_3WAY);
  shouldThrow('sub_e1 → sub_e2（同总监下子Agent需总监主持三方）',
    () => router.send('sub_explore_1', 'sub_explore_2'),
    COMM_RESULT.DENIED_NEED_3WAY);

  // ── Test 6: 非法通信——跨部门 ────────────────────────────────
  console.log('\nTest 6: 非法通信 — 跨部门');
  shouldThrow('explore → sub_plan_1（跨部门）',
    () => router.send('explore', 'sub_plan_1'),
    COMM_RESULT.DENIED_CROSS_DEPT);
  shouldThrow('sub_explore_1 → sub_plan_1（跨部门子Agent）',
    () => router.send('sub_explore_1', 'sub_plan_1'),
    COMM_RESULT.DENIED_CROSS_DEPT);
  shouldThrow('sub_explore_1 → plan（非自己总监）',
    () => router.send('sub_explore_1', 'plan'),
    COMM_RESULT.DENIED_CROSS_DEPT);

  // ── Test 7: 非法通信——外部直连 ──────────────────────────────
  console.log('\nTest 7: 非法通信 — 外部边界');
  shouldThrow('外部 → explore（非CEO）',
    () => router.send('external', 'explore'),
    COMM_RESULT.DENIED_EXTERNAL);
  shouldThrow('external → sub_explore_1',
    () => router.send('external', 'sub_explore_1'),
    COMM_RESULT.DENIED_EXTERNAL);
  shouldThrow('explore → external（非CEO）',
    () => router.send('explore', 'external'),
    COMM_RESULT.DENIED_EXTERNAL);

  // ── Test 8: 三方会话——总监间（VP主持）──────────────────────
  console.log('\nTest 8: 三方会话 — 同VP下总监 ↔ 总监');
  const sess1 = router.openDirectorSession('explore', 'plan', 'vp_digital');
  check('会话创建成功', sess1.ok && !!sess1.sessionId);
  check('会话含3个参与者', router.getSession(sess1.sessionId).participants.length === 3);
  check('主持人是VP(vp_digital)', router.getSession(sess1.sessionId).moderator === 'vp_digital');

  // 在会话内发消息
  shouldNotThrow('explore 在会话内发消息',
    () => router.sendInSession(sess1.sessionId, 'explore', { text: '方案确认' }));
  shouldNotThrow('plan 在会话内发消息',
    () => router.sendInSession(sess1.sessionId, 'plan', { text: '同意' }));
  shouldNotThrow('vp_digital（主持人）在会话内发消息',
    () => router.sendInSession(sess1.sessionId, 'vp_digital', { text: '通过' }));

  // 非参与者不能发消息
  shouldThrow('general（非参与者）不能在会话内发消息',
    () => router.sendInSession(sess1.sessionId, 'general', { text: '插话' }));

  router.closeSession(sess1.sessionId);
  check('会话已关闭', router.getSession(sess1.sessionId).closed === true);

  // 关闭后不能再发消息
  shouldThrow('已关闭会话不能发消息',
    () => router.sendInSession(sess1.sessionId, 'explore', { text: '再说一句' }));

  // ── Test 9: 三方会话——子Agent间（总监主持）──────────────────
  console.log('\nTest 9: 三方会话 — 同总监下子Agent');
  const sess2 = router.openSubAgentSession('sub_explore_1', 'sub_explore_2', 'explore');
  check('子Agent会话创建成功', sess2.ok && !!sess2.sessionId);
  check('主持人是explore', router.getSession(sess2.sessionId).moderator === 'explore');

  shouldNotThrow('sub_explore_1 在会话内发消息',
    () => router.sendInSession(sess2.sessionId, 'sub_explore_1', { text: '我找到文件了' }));
  shouldNotThrow('explore 主持人在会话内发消息',
    () => router.sendInSession(sess2.sessionId, 'explore', { text: '好的，继续' }));
  router.closeSession(sess2.sessionId);

  // ── Test 10: 非法三方会话 ────────────────────────────────────
  console.log('\nTest 10: 非法三方会话');
  shouldThrow('CEO主持但参与者含子Agent（跳级）',
    () => router.openSession(['supervisor', 'explore', 'sub_explore_1'], 'supervisor'));
  shouldThrow('总监主持但参与者是其他部门子Agent',
    () => router.openSession(['explore', 'sub_plan_1', 'sub_plan_2'], 'explore'));
  shouldThrow('主持人不在参与者列表',
    () => router.openSession(['explore', 'plan'], 'supervisor'));

  // ── Test 11: 审计日志 ────────────────────────────────────────
  console.log('\nTest 11: 审计日志');
  check('auditLog 有记录', router.auditLog.length > 0);
  const stats = router.getViolationStats();
  check('违规统计有跳级记录',   (stats[COMM_RESULT.DENIED_SKIP_LEVEL] || 0) > 0);
  check('违规统计有跨部门记录', (stats[COMM_RESULT.DENIED_CROSS_DEPT] || 0) > 0);
  check('违规统计有三方需求记录',(stats[COMM_RESULT.DENIED_NEED_3WAY] || 0) > 0);
  check('违规统计有外部边界记录',(stats[COMM_RESULT.DENIED_EXTERNAL] || 0) > 0);

  // ── Test 12: KB 命名空间（write-owned / read-all）────────────
  console.log('\nTest 12: KnowledgeBase 命名空间');
  const tmpDir = path.join(os.tmpdir(), `kb_test_${Date.now()}`);
  const kb = new KnowledgeBase(tmpDir);

  // NS_OWNERS 静态表
  check('NS_OWNERS 存在', !!KnowledgeBase.NS_OWNERS);
  check('codebase → explore',  KnowledgeBase.NS_OWNERS.codebase  === 'explore');
  check('decisions → supervisor', KnowledgeBase.NS_OWNERS.decisions === 'supervisor');

  // 合法写入
  shouldNotThrow('explore 写入 codebase 命名空间',
    () => kb.writeShared('codebase', 'module_map', { files: ['a.js', 'b.js'] }, 'explore'));

  shouldNotThrow('supervisor 写入 decisions 命名空间',
    () => kb.writeShared('decisions', 'broadcast_001', { msg: '任务开始' }, 'supervisor'));

  // 非法写入（非owner）
  shouldThrow('plan 无权写 codebase（属于explore）',
    () => kb.writeShared('codebase', 'hack', {}, 'plan'));
  shouldThrow('未知命名空间',
    () => kb.writeShared('unknown_ns', 'key', {}, 'explore'));

  // 任意 Agent 都能读
  const r1 = kb.readShared('codebase', 'module_map', 'plan');
  check('plan 可以读取 codebase（read-all）', r1 !== null && r1.data.files.length === 2);
  check('读取结果含 writtenBy', r1.writtenBy === 'explore');
  check('读取结果含 writtenAt', typeof r1.writtenAt === 'string');

  const r2 = kb.readShared('codebase', 'non_existent');
  check('不存在的 key 返回 null', r2 === null);

  // listShared
  const keys = kb.listShared('codebase');
  check('listShared 返回数组', Array.isArray(keys));
  check('listShared 含 module_map', keys.includes('module_map'));

  // readAllShared
  const all = kb.readAllShared('codebase');
  check('readAllShared 返回对象', typeof all === 'object');
  check('readAllShared 含 module_map key', !!all.module_map);

  // 清理临时目录
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}

  // ══════════════════════════════════════════════════════════════
  // Test 13: COMM_RULES 冻结常量 — 可见性 + 不可篡改
  // ══════════════════════════════════════════════════════════════
  console.log('\nTest 13: COMM_RULES 冻结常量');

  // 导出存在
  check('COMM_RULES 已导出', Array.isArray(COMM_RULES));
  check('CommRouter.RULES 静态属性存在', Array.isArray(CommRouter.RULES));
  check('COMM_RULES 与 CommRouter.RULES 是同一对象', COMM_RULES === CommRouter.RULES);

  // 冻结验证（Object.freeze 对数组顶层生效）
  check('COMM_RULES 顶层冻结（不可新增元素）', Object.isFrozen(COMM_RULES));

  // 尝试篡改——strict mode 下会抛出，非strict模式下静默失败
  let tampered = false;
  try { COMM_RULES.push({ ruleNo: 'HACK', match: () => true, action: 'ALLOW' }); tampered = true; }
  catch { tampered = false; }
  check('COMM_RULES 不可新增规则', !tampered);

  // 每条规则自身也冻结
  check('每条规则是冻结对象', COMM_RULES.every(r => Object.isFrozen(r)));

  // 规则内容验证
  const ruleNos = COMM_RULES.map(r => r.ruleNo);
  check('包含规则 S（自发自收）',  ruleNos.includes('S'));
  check('包含规则 0a（外部→CEO）', ruleNos.includes('0a'));
  check('包含规则 0b（CEO→外部）', ruleNos.includes('0b'));
  check('包含规则 0c（外部→非CEO禁止）', ruleNos.includes('0c'));
  check('包含规则 0d（非CEO→外部禁止）', ruleNos.includes('0d'));
  check('包含规则 1a（CEO→VP）',             ruleNos.includes('1a'));
  check('包含规则 1b（VP→CEO）',             ruleNos.includes('1b'));
  check('包含规则 2a（VP→自己的总监）',       ruleNos.includes('2a'));
  check('包含规则 2b（总监→自己的VP）',       ruleNos.includes('2b'));
  check('包含规则 3a（总监→子Agent）',        ruleNos.includes('3a'));
  check('包含规则 3b（子Agent→总监）',        ruleNos.includes('3b'));
  check('包含规则 5a（CEO→总监/子Agent跨级禁止）', ruleNos.includes('5a'));
  check('包含规则 5b（总监/子Agent→CEO跨级禁止）', ruleNos.includes('5b'));
  check('包含规则 VP-VP（VP↔VP需三方）',     ruleNos.includes('VP-VP'));
  check('包含规则 DIR-DIR（同VP总监↔总监需三方）', ruleNos.includes('DIR-DIR'));
  check('包含规则 SUB-SUB（同总监子Agent↔子Agent需三方）', ruleNos.includes('SUB-SUB'));
  check('包含规则 6c（总监→跨部门子Agent禁止）', ruleNos.includes('6c'));
  check('包含规则 6d（子Agent→非自己总监禁止）', ruleNos.includes('6d'));
  check('包含规则 7（跨VP总监禁止）',        ruleNos.includes('7'));
  check('包含规则 8（跨部门子Agent禁止）',   ruleNos.includes('8'));
  check('包含规则 X（兜底拒绝）',            ruleNos.includes('X'));

  // 兜底规则必须是最后一条
  check('规则 X（兜底）是最后一条', COMM_RULES[COMM_RULES.length - 1].ruleNo === 'X');

  // 每条规则有 match 函数
  check('每条规则有 match 函数', COMM_RULES.every(r => typeof r.match === 'function'));

  // ══════════════════════════════════════════════════════════════
  // Test 14: SESSION_TOPOLOGY 冻结常量 — 可见性 + 不可篡改
  // ══════════════════════════════════════════════════════════════
  console.log('\nTest 14: SESSION_TOPOLOGY 冻结常量');

  // 导出存在
  check('SESSION_TOPOLOGY 已导出', typeof SESSION_TOPOLOGY === 'object');
  check('CommRouter.SESSION_TOPOLOGY 静态属性存在', typeof CommRouter.SESSION_TOPOLOGY === 'object');
  check('SESSION_TOPOLOGY 与 CommRouter.SESSION_TOPOLOGY 是同一对象',
    SESSION_TOPOLOGY === CommRouter.SESSION_TOPOLOGY);

  // 顶层冻结
  check('SESSION_TOPOLOGY 顶层冻结', Object.isFrozen(SESSION_TOPOLOGY));

  // 不可新增类型
  let topoTampered = false;
  try { SESSION_TOPOLOGY.HACKED = { desc: 'hack' }; topoTampered = true; }
  catch { topoTampered = false; }
  check('SESSION_TOPOLOGY 不可新增类型', !topoTampered);

  // 必须包含两个固定类型
  check('包含 DIRECTOR_DIRECTOR 类型', !!SESSION_TOPOLOGY.DIRECTOR_DIRECTOR);
  check('包含 SUB_AGENT_PEER 类型',    !!SESSION_TOPOLOGY.SUB_AGENT_PEER);

  // 每个类型自身冻结
  check('DIRECTOR_DIRECTOR 是冻结对象', Object.isFrozen(SESSION_TOPOLOGY.DIRECTOR_DIRECTOR));
  check('SUB_AGENT_PEER 是冻结对象',    Object.isFrozen(SESSION_TOPOLOGY.SUB_AGENT_PEER));

  // DIRECTOR_DIRECTOR 规则细节
  const dd = SESSION_TOPOLOGY.DIRECTOR_DIRECTOR;
  check('DIRECTOR_DIRECTOR: moderatorLevel = 0（CEO）', dd.moderatorLevel === 0);
  check('DIRECTOR_DIRECTOR: fixedModerator = supervisor（写死CEO）', dd.fixedModerator === 'supervisor');
  check('DIRECTOR_DIRECTOR: participantLevel = 1（总监）', dd.participantLevel === 1);
  check('DIRECTOR_DIRECTOR: minPeers = 2', dd.minPeers === 2);

  // SUB_AGENT_PEER 规则细节
  const sa = SESSION_TOPOLOGY.SUB_AGENT_PEER;
  check('SUB_AGENT_PEER: moderatorLevel = 1（总监）', sa.moderatorLevel === 1);
  check('SUB_AGENT_PEER: fixedModerator = null（动态确定）', sa.fixedModerator === null);
  check('SUB_AGENT_PEER: participantLevel = 2（子Agent）', sa.participantLevel === 2);
  check('SUB_AGENT_PEER: sameParentRequired = true', sa.sameParentRequired === true);
  check('SUB_AGENT_PEER: minPeers = 2', sa.minPeers === 2);

  // DIRECTOR_DIRECTOR fixedModerator 不可篡改
  let modTampered = false;
  try { SESSION_TOPOLOGY.DIRECTOR_DIRECTOR.fixedModerator = 'general'; modTampered = true; }
  catch { modTampered = false; }
  check('DIRECTOR_DIRECTOR.fixedModerator 不可修改', !modTampered && dd.fixedModerator === 'supervisor');

  // ══════════════════════════════════════════════════════════════
  // Test 15: 审计日志含规则编号
  // ══════════════════════════════════════════════════════════════
  console.log('\nTest 15: 审计日志含规则编号');

  const reg15 = new AgentRegistry();
  reg15.initializeCoreAgents();
  const cr15  = new CommRouter(reg15, { strict: false });

  cr15.send('supervisor', 'explore');           // 规则 1a
  cr15.send('explore', 'supervisor');           // 规则 1b
  cr15.send('external', 'supervisor');          // 规则 0a
  cr15.send('explore', 'plan');                 // 规则 2（被拒）
  cr15.send('supervisor', 'external');          // 规则 0b

  const log15 = cr15.getAuditLog();
  check('审计日志非空', log15.length > 0);
  check('每条日志含 ruleNo 字段', log15.every(e => typeof e.ruleNo === 'string'));

  const entry1a = log15.find(e => e.from === 'supervisor' && e.to === 'vp_digital' && e.ok);
  check('CEO→VP 日志 ruleNo = 1a', entry1a?.ruleNo === '1a');

  const entryDIR = log15.find(e => e.from === 'explore' && e.to === 'plan' && !e.ok);
  check('总监↔总监 违规 日志 ruleNo = DIR-DIR', entryDIR?.ruleNo === 'DIR-DIR');

  const entry0a = log15.find(e => e.from === 'external'  && e.to === 'supervisor' && e.ok);
  check('外部→CEO 日志 ruleNo = 0a', entry0a?.ruleNo === '0a');

  // ══════════════════════════════════════════════════════════════
  // Test 16: openDirectorSession 使用 SESSION_TOPOLOGY（VP主持）
  // ══════════════════════════════════════════════════════════════
  console.log('\nTest 16: openDirectorSession — VP主持（4层架构）');

  const reg16 = new AgentRegistry();
  reg16.initializeCoreAgents();
  const cr16  = new CommRouter(reg16, { strict: true });

  const sess16 = cr16.openDirectorSession('explore', 'plan', 'vp_digital');
  check('openDirectorSession 成功', sess16.ok);
  check('主持人是 vp_digital', cr16.getSession(sess16.sessionId).moderator === 'vp_digital');
  check('sessionType 是 DIRECTOR_DIRECTOR', sess16.sessionType === 'DIRECTOR_DIRECTOR');

  // openSubAgentSession
  reg16.registerSubAgent('explore', { name: 'Sub1', capability: 'search' });
  reg16.registerSubAgent('explore', { name: 'Sub2', capability: 'index'  });
  const subs = reg16.listSubAgents('explore');
  if (subs.length >= 2) {
    const sessS = cr16.openSubAgentSession(subs[0].id, subs[1].id, 'explore');
    check('openSubAgentSession 成功', sessS.ok);
    check('sessionType 是 SUB_AGENT_PEER', sessS.sessionType === 'SUB_AGENT_PEER');
    check('主持人是 explore', cr16.getSession(sessS.sessionId).moderator === 'explore');
  }

  // ── 输出统计 ────────────────────────────────────────────────
  console.log('\n========================================');
  console.log(`测试结果: ${passed} 通过, ${failed} 失败`);
  console.log('========================================\n');

  if (failed > 0) { console.error('❌ 有测试失败'); process.exit(1); }
  else             { console.log('✅ 全部通过'); }
}

run().catch(err => { console.error('测试运行异常:', err); process.exit(1); });
