const { RolePermission, ROLES, ROLE_HIERARCHY, PERMISSION_LEVELS, PERMISSION_ORDER, OPERATIONS, AUTHORIZATION_MATRIX } = require('../src/role-permission');

async function testRolePermission() {
  console.log('🧪 测试 RolePermission...\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, msg) {
    if (condition) { passed++; console.log(`  ✅ ${msg}`); }
    else { failed++; console.log(`  ❌ ${msg}`); }
  }

  try {
    // ---- Test 1: 常量完整性 ----
    console.log('\nTest 1: 常量完整性');
    assert(typeof ROLES === 'object', 'ROLES 已导出');
    assert(ROLES.ADMIN !== undefined, 'ROLES.ADMIN 存在');
    assert(ROLES.DEVELOPER !== undefined, 'ROLES.DEVELOPER 存在');
    assert(ROLES.OBSERVER !== undefined, 'ROLES.OBSERVER 存在');
    assert(ROLES.TECH_LEAD !== undefined, 'ROLES.TECH_LEAD 存在');
    assert(ROLES.SECURITY_LEAD !== undefined, 'ROLES.SECURITY_LEAD 存在');
    assert(ROLES.DBA !== undefined, 'ROLES.DBA 存在');

    assert(typeof PERMISSION_LEVELS === 'object', 'PERMISSION_LEVELS 已导出');
    assert(typeof OPERATIONS === 'object', 'OPERATIONS 已导出');
    assert(typeof AUTHORIZATION_MATRIX === 'object', 'AUTHORIZATION_MATRIX 已导出');

    // ---- Test 2: 基本实例化 ----
    console.log('\nTest 2: 基本实例化');
    const rp = new RolePermission();
    assert(rp !== null, 'RolePermission 实例创建成功');

    // ---- Test 3: Admin 权限 — 应拥有最高权限 ----
    console.log('\nTest 3: Admin 权限检查');
    const adminRead = rp.checkPermission(ROLES.ADMIN, OPERATIONS.FILE_READ, PERMISSION_LEVELS.READ);
    assert(adminRead.allowed === true, 'Admin 可读文件');
    const adminWrite = rp.checkPermission(ROLES.ADMIN, OPERATIONS.FILE_WRITE, PERMISSION_LEVELS.WRITE);
    assert(adminWrite.allowed === true, 'Admin 可写文件');
    assert(adminWrite.grantedLevel !== undefined, 'checkPermission 返回 grantedLevel');

    // ---- Test 4: Observer 权限 — 最低权限 ----
    console.log('\nTest 4: Observer 权限检查');
    const obsRead = rp.checkPermission(ROLES.OBSERVER, OPERATIONS.FILE_READ, PERMISSION_LEVELS.READ);
    assert(obsRead.allowed === true, 'Observer 可读文件');
    const obsWrite = rp.checkPermission(ROLES.OBSERVER, OPERATIONS.FILE_WRITE, PERMISSION_LEVELS.WRITE);
    assert(obsWrite.allowed === false, 'Observer 不能写文件');

    // ---- Test 5: Developer 权限 ----
    console.log('\nTest 5: Developer 权限检查');
    const devFileRead = rp.checkPermission(ROLES.DEVELOPER, OPERATIONS.FILE_READ, PERMISSION_LEVELS.READ);
    assert(devFileRead.allowed === true, 'Developer 可读文件');
    const devCodeWrite = rp.checkPermission(ROLES.DEVELOPER, OPERATIONS.CODE_MODIFY, PERMISSION_LEVELS.WRITE);
    assert(devCodeWrite.allowed === true, 'Developer 可修改代码');

    // ---- Test 6: 核心链路审批 ----
    console.log('\nTest 6: 核心链路操作审批检查');
    const devSchema = rp.checkApproval(ROLES.DEVELOPER, OPERATIONS.MODIFY_SCHEMA);
    assert(typeof devSchema === 'object', 'checkApproval 返回对象');
    assert(typeof devSchema.needsApproval === 'boolean', 'checkApproval 返回 needsApproval');

    const adminSchema = rp.checkApproval(ROLES.ADMIN, OPERATIONS.MODIFY_SCHEMA);
    assert(typeof adminSchema === 'object', 'Admin checkApproval 返回对象');
    // Admin 通常不需要审批
    assert(adminSchema.needsApproval === false, 'Admin 修改 schema 不需要审批');

    // ---- Test 7: 授权疲劳防护 ----
    console.log('\nTest 7: 授权疲劳防护');
    // 连续两次相同检查，第二次应该命中缓存
    rp.checkPermission(ROLES.DEVELOPER, OPERATIONS.FILE_READ, PERMISSION_LEVELS.READ);
    rp.checkPermission(ROLES.DEVELOPER, OPERATIONS.FILE_READ, PERMISSION_LEVELS.READ);
    // 不应抛出异常即为通过
    assert(true, '连续检查不触发异常');

    // ---- Test 8: 审计日志 ----
    console.log('\nTest 8: 审计日志');
    const auditLog = rp.getAuditLog();
    assert(Array.isArray(auditLog), 'getAuditLog 返回数组');
    assert(auditLog.length > 0, '审计日志有记录');
    const lastEntry = auditLog[auditLog.length - 1];
    assert(lastEntry.role !== undefined, '审计记录包含 role');
    assert(lastEntry.operation !== undefined, '审计记录包含 operation');
    assert(lastEntry.timestamp !== undefined, '审计记录包含 timestamp');

    // ---- Test 9: toPolicyConfig ----
    console.log('\nTest 9: toPolicyConfig 生成策略');
    const devPolicy = rp.toPolicyConfig(ROLES.DEVELOPER);
    assert(typeof devPolicy === 'object', 'toPolicyConfig 返回对象');

    const adminPolicy = rp.toPolicyConfig(ROLES.ADMIN);
    assert(typeof adminPolicy === 'object', 'Admin toPolicyConfig 返回对象');

    // ---- Test 10: ROLE_HIERARCHY 层级 ----
    console.log('\nTest 10: ROLE_HIERARCHY 层级');
    assert(typeof ROLE_HIERARCHY === 'object', 'ROLE_HIERARCHY 已导出');
    assert(ROLE_HIERARCHY[ROLES.ADMIN] > ROLE_HIERARCHY[ROLES.DEVELOPER], 'Admin 层级高于 Developer');
    assert(ROLE_HIERARCHY[ROLES.DEVELOPER] > ROLE_HIERARCHY[ROLES.OBSERVER], 'Developer 层级高于 Observer');

    // ---- Test 11: PERMISSION_ORDER ----
    console.log('\nTest 11: PERMISSION_ORDER');
    assert(typeof PERMISSION_ORDER === 'object', 'PERMISSION_ORDER 已导出');
    assert(PERMISSION_ORDER[PERMISSION_LEVELS.ADMIN] > PERMISSION_ORDER[PERMISSION_LEVELS.WRITE], 'admin > write');
    assert(PERMISSION_ORDER[PERMISSION_LEVELS.WRITE] > PERMISSION_ORDER[PERMISSION_LEVELS.READ], 'write > read');

  } catch (error) {
    console.log(`\n❌ 测试异常: ${error.message}`);
    console.log(error.stack);
    failed++;
  }

  console.log(`\n========================================`);
  console.log(`测试结果: ${passed} 通过, ${failed} 失败`);
  if (failed === 0) {
    console.log('✅ 所有 RolePermission 测试通过！');
  } else {
    console.log('❌ 有测试失败');
    process.exitCode = 1;
  }
}

testRolePermission();
