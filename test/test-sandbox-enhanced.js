const { SandboxEnhanced, SANDBOX_PROFILE, RESOURCE_TYPE, NETWORK_POLICY, AUDIT_EVENT, PROFILE_TEMPLATES } = require('../src/sandbox-enhanced');

async function testSandboxEnhanced() {
  console.log('🧪 测试 SandboxEnhanced...\n');

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
    assert(typeof SANDBOX_PROFILE === 'object', 'SANDBOX_PROFILE 已导出');
    assert(SANDBOX_PROFILE.STRICT === 'strict', 'STRICT 配置');
    assert(SANDBOX_PROFILE.STANDARD === 'standard', 'STANDARD 配置');
    assert(SANDBOX_PROFILE.PERMISSIVE === 'permissive', 'PERMISSIVE 配置');
    assert(typeof RESOURCE_TYPE === 'object', 'RESOURCE_TYPE 已导出');
    assert(typeof NETWORK_POLICY === 'object', 'NETWORK_POLICY 已导出');
    assert(typeof AUDIT_EVENT === 'object', 'AUDIT_EVENT 已导出');
    assert(typeof PROFILE_TEMPLATES === 'object', 'PROFILE_TEMPLATES 已导出');

    // ---- Test 2: 配置模板 ----
    console.log('\nTest 2: 配置模板');
    const profiles = SandboxEnhanced.listProfiles();
    assert(profiles.length === 3, '3 个模板');
    const strictTemplate = SandboxEnhanced.getProfileTemplate(SANDBOX_PROFILE.STRICT);
    assert(strictTemplate !== null, 'strict 模板存在');
    assert(strictTemplate.resources.cpuPercent === 25, 'strict CPU 25%');
    assert(strictTemplate.filesystem.readOnly === true, 'strict 只读');
    assert(strictTemplate.network.policy === NETWORK_POLICY.DENY_ALL, 'strict 拒绝网络');

    // ---- Test 3: 实例化 — standard ----
    console.log('\nTest 3: Standard 实例化');
    const sb = new SandboxEnhanced({ profile: SANDBOX_PROFILE.STANDARD, logger: silentLogger });
    assert(sb !== null, 'SandboxEnhanced 创建成功');
    assert(sb.profile === SANDBOX_PROFILE.STANDARD, '配置为 STANDARD');

    // ---- Test 4: 创建沙箱实例 ----
    console.log('\nTest 4: 创建沙箱实例');
    const inst1 = sb.createInstance('test-sandbox');
    assert(inst1.id.startsWith('sb_'), 'ID 前缀正确');
    assert(inst1.name === 'test-sandbox', '名称正确');
    assert(inst1.status === 'running', '状态 running');

    const inst2 = sb.createInstance('second-sandbox');
    assert(sb.listInstances().length === 2, '2 个实例');

    // ---- Test 5: 资源检查 — 通过 ----
    console.log('\nTest 5: 资源检查 — 通过');
    const check1 = sb.checkResources(inst1.id, { cpuPercent: 30, memoryMB: 256 });
    assert(check1.allowed === true, '资源在限制内');
    assert(check1.violations.length === 0, '无违规');

    // ---- Test 6: 资源检查 — 违规 ----
    console.log('\nTest 6: 资源检查 — 违规');
    const check2 = sb.checkResources(inst1.id, { cpuPercent: 80, memoryMB: 1024 });
    assert(check2.allowed === false, '资源超限');
    assert(check2.violations.length === 2, '2 个违规 (CPU + Memory)');
    assert(check2.violations[0].resource === RESOURCE_TYPE.CPU, 'CPU 违规');
    assert(check2.violations[1].resource === RESOURCE_TYPE.MEMORY, 'Memory 违规');

    // ---- Test 7: 动态调整资源 ----
    console.log('\nTest 7: 动态调整资源');
    const adj = sb.adjustResources(inst1.id, { memoryMB: 2048 });
    assert(adj.success === true, '调整成功');
    assert(adj.resources.memoryMB === 2048, '内存调整为 2048');
    // 之前超限的现在应该通过
    const check3 = sb.checkResources(inst1.id, { memoryMB: 1024 });
    assert(check3.allowed === true, '调整后 1024MB 不再违规');

    // ---- Test 8: 文件系统检查 — Standard ----
    console.log('\nTest 8: 文件系统检查 — Standard');
    const fileOk = sb.checkFileAccess(inst1.id, '/tmp/test.txt', 'read');
    assert(fileOk.allowed === true, '/tmp 读取允许');

    const fileWrite = sb.checkFileAccess(inst1.id, '/tmp/out.txt', 'write');
    assert(fileWrite.allowed === true, 'Standard 模式允许写入');

    const fileDenied = sb.checkFileAccess(inst1.id, '/etc/shadow', 'read');
    assert(fileDenied.allowed === false, '/etc/shadow 读取拒绝');

    // ---- Test 9: 文件系统检查 — Strict ----
    console.log('\nTest 9: 文件系统检查 — Strict');
    const strictSb = new SandboxEnhanced({ profile: SANDBOX_PROFILE.STRICT, logger: silentLogger });
    const strictInst = strictSb.createInstance('strict-test');
    const strictWrite = strictSb.checkFileAccess(strictInst.id, '/tmp/sandbox/file.txt', 'write');
    assert(strictWrite.allowed === false, 'Strict 只读模式禁止写入');

    const strictRead = strictSb.checkFileAccess(strictInst.id, '/tmp/sandbox/file.txt', 'read');
    assert(strictRead.allowed === true, 'Strict 允许沙箱目录读取');

    // ---- Test 10: 网络策略 — Standard (Restricted) ----
    console.log('\nTest 10: 网络策略 — Standard');
    const netOk = sb.checkNetworkAccess(inst1.id, 'registry.npmjs.org', 443);
    assert(netOk.allowed === true, 'npmjs.org:443 允许');

    const netBad = sb.checkNetworkAccess(inst1.id, 'evil.com', 443);
    assert(netBad.allowed === false, 'evil.com 拒绝');

    const netPortBad = sb.checkNetworkAccess(inst1.id, 'registry.npmjs.org', 8080);
    assert(netPortBad.allowed === false, '8080 端口拒绝');

    // ---- Test 11: 网络策略 — Strict (Deny All) ----
    console.log('\nTest 11: 网络策略 — Strict');
    const strictNet = strictSb.checkNetworkAccess(strictInst.id, 'google.com', 443);
    assert(strictNet.allowed === false, 'Strict 拒绝所有网络');

    // ---- Test 12: 网络策略 — Permissive ----
    console.log('\nTest 12: 网络策略 — Permissive');
    const permSb = new SandboxEnhanced({ profile: SANDBOX_PROFILE.PERMISSIVE, logger: silentLogger });
    const permInst = permSb.createInstance('perm-test');
    const permNet = permSb.checkNetworkAccess(permInst.id, 'anything.example.com', 9999);
    assert(permNet.allowed === true, 'Permissive 允许所有');

    // ---- Test 13: 添加网络白名单 ----
    console.log('\nTest 13: 添加网络白名单');
    sb.addNetworkWhitelist(inst1.id, 'api.example.com', [8080]);
    const netAfter = sb.checkNetworkAccess(inst1.id, 'api.example.com', 8080);
    assert(netAfter.allowed === true, '白名单后允许');

    // ---- Test 14: 快照创建与恢复 ----
    console.log('\nTest 14: 快照创建与恢复');
    const snap = sb.createSnapshot(inst1.id, 'before-change');
    assert(snap.success === true, '快照创建成功');
    assert(snap.snapshot.id.startsWith('snap_'), '快照 ID 正确');

    // 修改配置
    sb.adjustResources(inst1.id, { memoryMB: 4096 });
    assert(sb.getResourceLimits(inst1.id).memoryMB === 4096, '修改后 4096');

    // 恢复快照
    const restored = sb.restoreSnapshot(inst1.id, snap.snapshot.id);
    assert(restored.success === true, '恢复成功');
    assert(sb.getResourceLimits(inst1.id).memoryMB === 2048, '恢复到 2048');

    // 列出快照
    const snaps = sb.listSnapshots(inst1.id);
    assert(snaps.length === 1, '1 个快照');

    // ---- Test 15: 销毁实例 ----
    console.log('\nTest 15: 销毁实例');
    assert(sb.destroyInstance(inst2.id) === true, '销毁成功');
    assert(sb.listInstances().length === 1, '剩 1 个实例');
    assert(sb.destroyInstance('nonexistent') === false, '不存在返回 false');

    // ---- Test 16: 审计日志 ----
    console.log('\nTest 16: 审计日志');
    const allLogs = sb.getAuditLog();
    assert(allLogs.length > 0, '审计日志非空');

    const violations = sb.getAuditLog({ event: AUDIT_EVENT.RESOURCE_VIOLATION });
    assert(violations.length > 0, '有资源违规日志');

    const instLogs = sb.getAuditLog({ instanceId: inst1.id, limit: 5 });
    assert(instLogs.length <= 5, '限制 5 条');

    // ---- Test 17: getStats ----
    console.log('\nTest 17: getStats');
    const stats = sb.getStats();
    assert(stats.activeInstances === 1, '1 个活跃实例');
    assert(stats.profile === SANDBOX_PROFILE.STANDARD, '配置 STANDARD');
    assert(stats.totalSnapshots >= 1, '至少 1 个快照');
    assert(stats.totalViolations > 0, '有违规记录');
    assert(stats.auditLogSize > 0, '审计日志大小 > 0');

    // ---- Test 18: 配置覆盖 ----
    console.log('\nTest 18: 配置覆盖');
    const customSb = new SandboxEnhanced({
      profile: SANDBOX_PROFILE.STANDARD,
      overrides: { resources: { cpuPercent: 75 }, network: { policy: NETWORK_POLICY.DENY_ALL } },
      logger: silentLogger
    });
    assert(customSb.config.resources.cpuPercent === 75, 'CPU 覆盖为 75%');
    assert(customSb.config.network.policy === NETWORK_POLICY.DENY_ALL, '网络策略覆盖');
    assert(customSb.config.resources.memoryMB === 512, '未覆盖项保持默认');

    // ---- Test 19: getResourceLimits / getInstance ----
    console.log('\nTest 19: 查询方法');
    const limits = sb.getResourceLimits(inst1.id);
    assert(limits !== null, '资源限制非空');
    assert(limits.cpuPercent === 50, 'CPU 限制 50%');
    assert(sb.getResourceLimits('nonexistent') === null, '不存在返回 null');
    assert(sb.getInstance(inst1.id) !== null, 'getInstance 正常');
    assert(sb.getInstance('nonexistent') === null, '不存在返回 null');

  } catch (error) {
    console.log(`\n❌ 测试异常: ${error.message}`);
    console.log(error.stack);
    failed++;
  }

  console.log(`\n========================================`);
  console.log(`测试结果: ${passed} 通过, ${failed} 失败`);
  if (failed === 0) {
    console.log('✅ 所有 SandboxEnhanced 测试通过！');
  } else {
    console.log('❌ 有测试失败');
    process.exitCode = 1;
  }
}

testSandboxEnhanced();
