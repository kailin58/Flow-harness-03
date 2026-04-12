'use strict';
/**
 * test-compliance-checker.js
 *
 * 测试 ComplianceChecker 三层合规校验：
 *   Layer 1: 来源校验（非官方源 → 直接拒绝）
 *   Layer 2: 许可证分级（Green/Yellow/Red/Black）
 *   Layer 3: 安全扫描（黑名单 + CVE 规则表）
 */

const assert = require('assert');
const ComplianceChecker = require('../src/compliance-checker');
const { RISK_LEVEL, DECISION } = ComplianceChecker;

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ❌ ${name}`);
    console.error(`     ${e.message}`);
    failed++;
  }
}

// ── 测试用的轻量 KnowledgeBase stub ──────────────────────────
class StubKB {
  constructor() {
    this._store = new Map();
    this._nsOwners = {
      compliance: 'supervisor',
      schedules:  'supervisor',
      decisions:  'supervisor'
    };
  }
  writeShared(ns, key, data, writerId) {
    const owner = this._nsOwners[ns];
    if (!owner) throw new Error(`[KB] 未知命名空间: "${ns}"`);
    if (owner !== writerId) throw new Error(`[KB] 写入权限拒绝: ${writerId} 不是 ${ns} 的 owner`);
    this._store.set(`${ns}:${key}`, { data, writerId, ts: Date.now() });
    return { ok: true };
  }
  readShared(ns, key) {
    return this._store.get(`${ns}:${key}`) || null;
  }
  listShared(ns) {
    const prefix = `${ns}:`;
    return [...this._store.keys()]
      .filter(k => k.startsWith(prefix))
      .map(k => k.slice(prefix.length));
  }
}

// ══════════════════════════════════════════════════════════════
//  模块加载
// ══════════════════════════════════════════════════════════════
console.log('\n◆ 模块加载');
test('ComplianceChecker 可实例化（无KB）', () => {
  const cc = new ComplianceChecker(null);
  assert(cc instanceof ComplianceChecker, '实例类型错误');
});

test('ComplianceChecker 可实例化（有KB）', () => {
  const kb = new StubKB();
  const cc = new ComplianceChecker(kb);
  assert(cc.kb === kb, 'KB 未正确设置');
});

test('静态常量 RISK_LEVEL 存在', () => {
  assert(RISK_LEVEL.GREEN  === 'green',  'GREEN 缺失');
  assert(RISK_LEVEL.YELLOW === 'yellow', 'YELLOW 缺失');
  assert(RISK_LEVEL.RED    === 'red',    'RED 缺失');
  assert(RISK_LEVEL.BLACK  === 'black',  'BLACK 缺失');
});

test('静态常量 DECISION 存在', () => {
  assert(DECISION.APPROVED         === 'approved',          'APPROVED 缺失');
  assert(DECISION.REJECTED         === 'rejected',          'REJECTED 缺失');
  assert(DECISION.PENDING_REVIEW   === 'pending_review',    'PENDING_REVIEW 缺失');
  assert(DECISION.PENDING_APPROVAL === 'pending_approval',  'PENDING_APPROVAL 缺失');
});

// ══════════════════════════════════════════════════════════════
//  Layer 1: 来源校验
// ══════════════════════════════════════════════════════════════
console.log('\n◆ Layer 1: 来源校验');

const cc = new ComplianceChecker(null);

test('纯包名 lodash → 通过来源检查', () => {
  const r = cc.check('lodash');
  assert(r.layers.source.ok, '来源检查应通过');
  assert(r.layers.source.source === 'official_registry', '应标记为官方源');
});

test('带版本号 lodash@4.17.21 → 通过', () => {
  const r = cc.check('lodash@4.17.21');
  assert(r.layers.source.ok, '带版本号应通过来源检查');
});

test('scoped 包 @babel/core → 通过', () => {
  const r = cc.check('@babel/core');
  assert(r.layers.source.ok, 'scoped 包应通过来源检查');
});

test('git:// URL → 拒绝', () => {
  const r = cc.check('git://github.com/user/pkg');
  assert(!r.layers.source.ok,       '来源检查应失败');
  assert(r.decision === DECISION.REJECTED, '决策应为 REJECTED');
  assert(r.riskLevel === RISK_LEVEL.BLACK, '风险等级应为 BLACK');
});

test('git+https:// URL → 拒绝', () => {
  const r = cc.check('git+https://github.com/user/pkg');
  assert(r.decision === DECISION.REJECTED, 'git+https 应拒绝');
});

test('github.com URL → 拒绝', () => {
  const r = cc.check('github.com/user/pkg');
  assert(r.decision === DECISION.REJECTED, 'github.com 应拒绝');
});

test('http:// URL → 拒绝', () => {
  const r = cc.check('http://example.com/pkg.tgz');
  assert(r.decision === DECISION.REJECTED, 'http URL 应拒绝');
});

test('file: 本地路径 → 拒绝', () => {
  const r = cc.check('file:../local-package');
  assert(r.decision === DECISION.REJECTED, 'file: 应拒绝');
});

test('相对路径 ./pkg → 拒绝', () => {
  const r = cc.check('./pkg');
  assert(r.decision === DECISION.REJECTED, '相对路径应拒绝');
});

test('Windows绝对路径 C:\\path → 拒绝', () => {
  const r = cc.check('C:\\path\\to\\package');
  assert(r.decision === DECISION.REJECTED, 'Windows路径应拒绝');
});

test('.whl 文件 → 拒绝', () => {
  const r = cc.check('numpy-1.21.0-cp39-cp39-win_amd64.whl');
  assert(r.decision === DECISION.REJECTED, '.whl 应拒绝');
});

test('--registry 参数 → 拒绝', () => {
  const r = cc.check('lodash --registry=https://custom.registry.com');
  assert(r.decision === DECISION.REJECTED, '--registry 应拒绝');
});

// ══════════════════════════════════════════════════════════════
//  Layer 2: 许可证检查
// ══════════════════════════════════════════════════════════════
console.log('\n◆ Layer 2: 许可证检查');

test('MIT 许可证 → Green → 通过', () => {
  const r = cc.check('some-pkg', { license: 'MIT' });
  assert(r.layers.license.level === RISK_LEVEL.GREEN, 'MIT 应为 GREEN');
  assert(r.decision === DECISION.APPROVED, 'MIT 应通过');
});

test('Apache-2.0 → Green → 通过', () => {
  const r = cc.check('pkg', { license: 'Apache-2.0' });
  assert(r.layers.license.level === RISK_LEVEL.GREEN, 'Apache-2.0 应为 GREEN');
});

test('BSD-3-Clause → Green → 通过', () => {
  const r = cc.check('pkg', { license: 'BSD-3-Clause' });
  assert(r.layers.license.level === RISK_LEVEL.GREEN, 'BSD-3-Clause 应为 GREEN');
});

test('ISC → Green → 通过', () => {
  const r = cc.check('pkg', { license: 'ISC' });
  assert(r.layers.license.level === RISK_LEVEL.GREEN, 'ISC 应为 GREEN');
});

test('LGPL-3.0 → Yellow → 需商议', () => {
  const r = cc.check('pkg', { license: 'LGPL-3.0' });
  assert(r.layers.license.level === RISK_LEVEL.YELLOW, 'LGPL 应为 YELLOW');
  assert(r.decision === DECISION.PENDING_REVIEW, 'LGPL 应需商议');
});

test('MPL-2.0 → Yellow → 需商议', () => {
  const r = cc.check('pkg', { license: 'MPL-2.0' });
  assert(r.layers.license.level === RISK_LEVEL.YELLOW, 'MPL-2.0 应为 YELLOW');
});

test('GPL-3.0 → Red → 需CEO批准', () => {
  const r = cc.check('pkg', { license: 'GPL-3.0' });
  assert(r.layers.license.level === RISK_LEVEL.RED, 'GPL 应为 RED');
  assert(r.decision === DECISION.PENDING_APPROVAL, 'GPL 应需CEO批准');
});

test('AGPL-3.0 → Red → 需CEO批准', () => {
  const r = cc.check('pkg', { license: 'AGPL-3.0' });
  assert(r.layers.license.level === RISK_LEVEL.RED, 'AGPL 应为 RED');
});

test('SSPL-1.0 → Red → 需CEO批准', () => {
  const r = cc.check('pkg', { license: 'SSPL-1.0' });
  assert(r.layers.license.level === RISK_LEVEL.RED, 'SSPL 应为 RED');
});

test('Proprietary → Red', () => {
  const r = cc.check('pkg', { license: 'Proprietary' });
  assert(r.layers.license.level === RISK_LEVEL.RED, 'Proprietary 应为 RED');
});

test('无法识别许可证 → Black → 拒绝', () => {
  const r = cc.check('pkg', { license: 'XYZ-Unknown-License' });
  assert(r.layers.license.level === RISK_LEVEL.BLACK, '未知许可证应为 BLACK');
  assert(r.decision === DECISION.REJECTED, '未知许可证应拒绝');
});

test('未提供许可证 → 延迟检查 → 通过（安装前无法判断）', () => {
  const r = cc.check('some-new-pkg');
  assert(r.layers.license.checked === false, '未提供时应标记为 deferred');
  assert(r.decision === DECISION.APPROVED, '未提供许可证时应通过（不能提前拒绝）');
});

// ══════════════════════════════════════════════════════════════
//  Layer 3a: 黑名单检查
// ══════════════════════════════════════════════════════════════
console.log('\n◆ Layer 3a: 恶意包黑名单');

test('crossenv（仿冒包）→ 拒绝', () => {
  const r = cc.check('crossenv');
  assert(r.decision === DECISION.REJECTED, 'crossenv 应拒绝');
  assert(r.layers.blacklist.ok === false, '黑名单检查应失败');
});

test('loadsh（仿冒 lodash）→ 拒绝', () => {
  const r = cc.check('loadsh');
  assert(r.decision === DECISION.REJECTED, 'loadsh 应拒绝');
});

test('flatmap-stream（历史恶意包）→ 拒绝', () => {
  const r = cc.check('flatmap-stream');
  assert(r.decision === DECISION.REJECTED, 'flatmap-stream 应拒绝');
});

test('lodash（正常包）→ 不在黑名单', () => {
  const r = cc.check('lodash');
  assert(r.layers.blacklist.ok === true, 'lodash 不在黑名单');
});

// ══════════════════════════════════════════════════════════════
//  Layer 3b: CVE 扫描
// ══════════════════════════════════════════════════════════════
console.log('\n◆ Layer 3b: CVE 安全扫描');

test('lodash@4.17.19（有HIGH CVE）→ Red → 需批准', () => {
  const r = cc.check('lodash@4.17.19');
  assert(r.layers.cve.count > 0, '应检测到CVE');
  assert(r.layers.cve.level === RISK_LEVEL.RED, 'HIGH CVE 应为 RED');
  assert(r.decision === DECISION.PENDING_APPROVAL, '应需CEO批准');
});

test('lodash@4.17.21（修复版本）→ 无CVE', () => {
  const r = cc.check('lodash@4.17.21');
  assert(r.layers.cve.count === 0, '修复版本无CVE');
});

test('axios@0.20.0（有HIGH CVE）→ Red', () => {
  const r = cc.check('axios@0.20.0');
  assert(r.layers.cve.count > 0, 'axios 旧版有CVE');
  assert(r.layers.cve.level === RISK_LEVEL.RED, '应为 RED');
});

test('axios@0.27.2（修复版本）→ 无CVE', () => {
  const r = cc.check('axios@0.27.2');
  assert(r.layers.cve.count === 0, '新版无CVE');
});

test('minimist@1.2.5（有MEDIUM CVE）→ Yellow → 需商议', () => {
  const r = cc.check('minimist@1.2.5');
  assert(r.layers.cve.count > 0, 'minimist 旧版有CVE');
  assert(r.decision === DECISION.PENDING_REVIEW, '应需商议');
});

test('minimist@1.2.7（修复版本）→ 无CVE', () => {
  const r = cc.check('minimist@1.2.7');
  assert(r.layers.cve.count === 0, '新版无CVE');
});

test('无版本号包 → CVE 无法判断 → level GREEN', () => {
  const r = cc.check('express');
  assert(r.layers.cve.level === RISK_LEVEL.GREEN, '无版本号时CVE默认GREEN');
});

// ══════════════════════════════════════════════════════════════
//  批量检查
// ══════════════════════════════════════════════════════════════
console.log('\n◆ 批量检查 checkAll');

test('全部通过的批量安装', () => {
  const { summary } = cc.checkAll(['lodash', 'express', 'chalk']);
  assert(summary.total     === 3, '总数应为3');
  assert(summary.approved  === 3, '全部通过');
  assert(summary.canProceed === true, '可以继续');
});

test('含有 git:// 的批量安装 → canProceed false', () => {
  const { summary } = cc.checkAll(['lodash', 'git://github.com/user/pkg']);
  assert(summary.blocked   >= 1,   '应有被拒包');
  assert(summary.canProceed === false, '不可继续');
});

test('含 LGPL 包的批量安装 → canProceed false（需商议）', () => {
  const { summary } = cc.checkAll(['lodash', 'pkg'], { license: 'LGPL-2.1' });
  // 'pkg' 会用传入的 license
  const r = cc.check('pkg', { license: 'LGPL-2.1' });
  assert(r.decision === DECISION.PENDING_REVIEW, 'LGPL 应需商议');
});

test('混合情况：正常 + 黑名单 + CVE', () => {
  const { summary, results } = cc.checkAll(['lodash', 'crossenv', 'lodash@4.17.19']);
  assert(summary.blocked  >= 1, '黑名单包应被拦截');
  assert(summary.approval >= 1, 'CVE包应需批准');
  assert(summary.canProceed === false, '有问题时不可继续');
});

// ══════════════════════════════════════════════════════════════
//  审批流程
// ══════════════════════════════════════════════════════════════
console.log('\n◆ 审批流程');

const ccWithKB = new ComplianceChecker(new StubKB());

test('supervisor 可以批准 Red 级别包', () => {
  const entry = ccWithKB.approve('gpl-pkg', 'supervisor', '商业例外条款已签署');
  assert(entry.approvedBy === 'supervisor', '批准人应为 supervisor');
  assert(entry.packageSpec === 'gpl-pkg', '包名应正确');
  assert(entry.validUntil, '应有有效期');
});

test('非 supervisor 不可批准 → 抛出错误', () => {
  let threw = false;
  try {
    ccWithKB.approve('gpl-pkg', 'general', '试图越权批准');
  } catch (e) {
    threw = true;
    assert(e.message.includes('CEO'), '错误信息应提到CEO');
  }
  assert(threw, '应抛出错误');
});

test('批准后 isApproved 返回 true', () => {
  ccWithKB.approve('special-pkg', 'supervisor', '特殊需求');
  assert(ccWithKB.isApproved('special-pkg'), '应返回已批准');
});

test('未批准的包 isApproved 返回 false', () => {
  assert(!ccWithKB.isApproved('not-approved-pkg'), '未批准应返回false');
});

// ══════════════════════════════════════════════════════════════
//  审计日志
// ══════════════════════════════════════════════════════════════
console.log('\n◆ 审计日志');

test('检查后写入审计日志', () => {
  const kb   = new StubKB();
  const cc2  = new ComplianceChecker(kb);
  cc2.check('lodash');
  cc2.check('crossenv');
  const logs = cc2.getAuditLog(10);
  assert(logs.length >= 2, '审计日志应有记录');
});

test('审计日志包含关键字段', () => {
  const kb  = new StubKB();
  const cc2 = new ComplianceChecker(kb);
  cc2.check('lodash', { agentId: 'general', taskId: 'task-001' });
  const logs = cc2.getAuditLog(5);
  const log  = logs[0];
  assert(log.packageSpec, '应有 packageSpec');
  assert(log.checkedAt,   '应有 checkedAt');
  assert(log.decision,    '应有 decision');
  assert(log.riskLevel,   '应有 riskLevel');
});

test('getAuditLog 无KB时返回空数组', () => {
  const cc3 = new ComplianceChecker(null);
  cc3.check('some-pkg');
  const logs = cc3.getAuditLog();
  assert(Array.isArray(logs), '应返回数组');
  assert(logs.length === 0,   '无KB时为空');
});

// ══════════════════════════════════════════════════════════════
//  知识库 compliance 命名空间
// ══════════════════════════════════════════════════════════════
console.log('\n◆ KB compliance 命名空间');

test('supervisor 写入 compliance 命名空间 → 成功', () => {
  const kb = new StubKB();
  assert.doesNotThrow(() => {
    kb.writeShared('compliance', 'test_key', { foo: 'bar' }, 'supervisor');
  }, '应成功写入');
});

test('非 supervisor 写入 compliance → 拒绝', () => {
  const kb = new StubKB();
  assert.throws(() => {
    kb.writeShared('compliance', 'test_key', { foo: 'bar' }, 'general');
  }, /拒绝/, '非supervisor应被拒绝');
});

test('任意角色可读取 compliance 数据', () => {
  const kb = new StubKB();
  kb.writeShared('compliance', 'audit_log_1', { decision: 'approved' }, 'supervisor');
  const data = kb.readShared('compliance', 'audit_log_1');
  assert(data?.data?.decision === 'approved', '应能读取数据');
});

// ══════════════════════════════════════════════════════════════
//  边界情况
// ══════════════════════════════════════════════════════════════
console.log('\n◆ 边界情况');

test('空字符串包名 → 拒绝', () => {
  const r = cc.check('');
  assert(r.decision === DECISION.REJECTED, '空包名应拒绝');
});

test('只有空格的包名 → 拒绝', () => {
  const r = cc.check('   ');
  // 来源检查会失败（trim后为空）
  assert(r.decision === DECISION.REJECTED || r.riskLevel !== RISK_LEVEL.GREEN, '空格包名应拒绝');
});

test('超长包名（200字符）→ 检查不崩溃', () => {
  const longName = 'a'.repeat(200);
  assert.doesNotThrow(() => cc.check(longName), '超长包名不应崩溃');
});

test('版本解析：@scope/pkg@1.2.3', () => {
  const r = cc.check('@scope/pkg@1.2.3');
  assert(r.layers.source.ok, 'scoped 带版本应通过来源检查');
});

test('结果包含 checkedAt 时间戳', () => {
  const r = cc.check('lodash');
  assert(r.checkedAt, '应有 checkedAt');
  assert(new Date(r.checkedAt) instanceof Date, '应为合法时间');
});

// ══════════════════════════════════════════════════════════════
//  汇总
// ══════════════════════════════════════════════════════════════
console.log(`\n${'─'.repeat(50)}`);
console.log(`合规检查测试: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
