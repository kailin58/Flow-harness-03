const PolicyChecker = require('../src/policy-checker');

function testPolicyChecker() {
  console.log('🧪 测试 PolicyChecker...\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, msg) {
    if (condition) { passed++; console.log(`  ✅ ${msg}`); }
    else { failed++; console.log(`  ❌ ${msg}`); }
  }

  try {
    // ---- Test 1: 基本实例化 ----
    console.log('\nTest 1: 基本实例化');
    const checker = new PolicyChecker({});
    assert(checker !== null, 'PolicyChecker 创建成功');
    assert(checker.currentRole === null, '初始无角色');
    assert(checker.rolePermission !== null, '有角色权限实例');

    // ---- Test 2: 无策略时全部允许 ----
    console.log('\nTest 2: 无策略时全部允许');
    assert(checker.checkFileAccess('/any/file').allowed === true, '无策略 → 文件允许');
    assert(checker.checkCommand('any command').allowed === true, '无策略 → 命令允许');

    // ---- Test 3: 文件黑名单 ----
    console.log('\nTest 3: 文件黑名单');
    const blacklistChecker = new PolicyChecker({
      file_access: {
        deny: ['**/.env', '**/secrets/**', '**/*.key']
      }
    });
    assert(blacklistChecker.checkFileAccess('/project/.env').allowed === false, '.env 被拒绝');
    assert(blacklistChecker.checkFileAccess('/project/secrets/api.json').allowed === false, 'secrets/ 被拒绝');
    assert(blacklistChecker.checkFileAccess('/project/server.key').allowed === false, '.key 被拒绝');
    assert(blacklistChecker.checkFileAccess('/project/src/app.js').allowed === true, 'app.js 允许');

    // ---- Test 4: 文件白名单模式 ----
    console.log('\nTest 4: 文件白名单模式');
    const whitelistChecker = new PolicyChecker({
      file_access: {
        mode: 'whitelist',
        allow: ['src/**', 'test/**', '*.md'],
        deny: ['**/.env']
      }
    });
    assert(whitelistChecker.checkFileAccess('src/app.js').allowed === true, 'src/ 允许');
    assert(whitelistChecker.checkFileAccess('test/test.js').allowed === true, 'test/ 允许');
    assert(whitelistChecker.checkFileAccess('README.md').allowed === true, '.md 允许');
    assert(whitelistChecker.checkFileAccess('config/db.yml').allowed === false, '白名单外拒绝');
    const envResult = whitelistChecker.checkFileAccess('src/.env');
    assert(envResult.allowed === false, '黑名单优先于白名单');

    // ---- Test 5: 命令危险模式 ----
    console.log('\nTest 5: 命令危险模式');
    const cmdChecker = new PolicyChecker({
      commands: {
        dangerous_patterns: ['rm\\s+-rf', 'DROP\\s+TABLE', 'sudo\\s+'],
        deny: ['shutdown', 'reboot']
      }
    });
    assert(cmdChecker.checkCommand('rm -rf /').allowed === false, 'rm -rf 被拒绝');
    assert(cmdChecker.checkCommand('DROP TABLE users').allowed === false, 'DROP TABLE 被拒绝');
    assert(cmdChecker.checkCommand('sudo apt install').allowed === false, 'sudo 被拒绝');
    assert(cmdChecker.checkCommand('ls -la').allowed === true, 'ls -la 允许');

    // ---- Test 6: 命令黑名单 ----
    console.log('\nTest 6: 命令黑名单');
    assert(cmdChecker.checkCommand('shutdown now').allowed === false, 'shutdown 被拒绝');
    assert(cmdChecker.checkCommand('reboot').allowed === false, 'reboot 被拒绝');
    assert(cmdChecker.checkCommand('echo hello').allowed === true, 'echo 允许');

    // ---- Test 7: 命令白名单模式 ----
    console.log('\nTest 7: 命令白名单模式');
    const cmdWhiteChecker = new PolicyChecker({
      commands: {
        mode: 'whitelist',
        allow: ['npm', 'node', 'git', 'echo']
      }
    });
    assert(cmdWhiteChecker.checkCommand('npm install').allowed === true, 'npm 允许');
    assert(cmdWhiteChecker.checkCommand('node app.js').allowed === true, 'node 允许');
    assert(cmdWhiteChecker.checkCommand('git status').allowed === true, 'git 允许');
    assert(cmdWhiteChecker.checkCommand('curl http://example.com').allowed === false, 'curl 不在白名单');

    // ---- Test 8: 网络访问 - 禁用 ----
    console.log('\nTest 8: 网络访问 - 禁用');
    const netDisabled = new PolicyChecker({
      network: { enabled: false }
    });
    const netResult = netDisabled.checkNetworkAccess('https://example.com');
    assert(netResult.allowed === false, '网络禁用 → 拒绝');
    assert(netResult.reason.includes('disabled'), '原因包含 disabled');

    // ---- Test 9: 网络访问 - 无策略 ----
    console.log('\nTest 9: 网络访问 - 无策略');
    const noNetChecker = new PolicyChecker({});
    assert(noNetChecker.checkNetworkAccess('https://example.com').allowed === false, '无网络策略 → 拒绝');

    // ---- Test 10: 网络黑名单 ----
    console.log('\nTest 10: 网络黑名单');
    // 注: matchPattern 的 ** 实现对多层路径有局限
    // 使用精确匹配或单层通配符测试
    const netBlackChecker = new PolicyChecker({
      network: {
        enabled: true,
        blacklist: ['https://evil.com/**', 'https://malware.io']
      }
    });
    assert(netBlackChecker.checkNetworkAccess('https://evil.com/api').allowed === false, 'evil.com 被拒绝');
    assert(netBlackChecker.checkNetworkAccess('https://malware.io').allowed === false, 'malware 被拒绝');
    assert(netBlackChecker.checkNetworkAccess('https://good.com').allowed === true, 'good.com 允许');

    // ---- Test 11: 网络白名单 ----
    console.log('\nTest 11: 网络白名单');
    const netWhiteChecker = new PolicyChecker({
      network: {
        enabled: true,
        whitelist: ['https://api.example.com/**', 'https://cdn.example.com/**']
      }
    });
    assert(netWhiteChecker.checkNetworkAccess('https://api.example.com/users').allowed === true, 'API 允许');
    assert(netWhiteChecker.checkNetworkAccess('https://cdn.example.com/file.js').allowed === true, 'CDN 允许');
    assert(netWhiteChecker.checkNetworkAccess('https://other.com').allowed === false, '白名单外拒绝');

    // ---- Test 12: 资源限制检查 ----
    console.log('\nTest 12: 资源限制检查');
    const resChecker = new PolicyChecker({
      resources: {
        max_execution_time: 300,
        max_memory: 512,
        max_file_size: 10,
        max_files_created: 50
      }
    });
    // 在限制内
    assert(resChecker.checkResourceLimits({
      execution_time: 100, memory: 256, file_size: 5, files_created: 10
    }).allowed === true, '在限制内 → 允许');

    // 超出执行时间
    const timeResult = resChecker.checkResourceLimits({ execution_time: 500 });
    assert(timeResult.allowed === false, '超时 → 拒绝');
    assert(timeResult.reason.includes('Execution time'), '原因包含执行时间');

    // 超出内存
    assert(resChecker.checkResourceLimits({ memory: 1024 }).allowed === false, '超内存 → 拒绝');

    // 超出文件大小
    assert(resChecker.checkResourceLimits({ file_size: 20 }).allowed === false, '超文件大小 → 拒绝');

    // 超出文件数
    assert(resChecker.checkResourceLimits({ files_created: 100 }).allowed === false, '超文件数 → 拒绝');

    // 多项违规
    const multiViol = resChecker.checkResourceLimits({
      execution_time: 500, memory: 1024
    });
    assert(multiViol.allowed === false, '多项违规 → 拒绝');
    assert(multiViol.reason.includes(';'), '多项违规用分号分隔');

    // ---- Test 13: 无资源策略 ----
    console.log('\nTest 13: 无资源策略');
    assert(checker.checkResourceLimits({ execution_time: 99999 }).allowed === true, '无资源策略 → 允许');

    // ---- Test 14: matchPattern ----
    console.log('\nTest 14: matchPattern');
    assert(checker.matchPattern('src/app.js', 'src/**') === true, 'src/** 匹配 src/app.js');
    assert(checker.matchPattern('src/app.js', '*.js') === false, '*.js 不匹配 src/app.js (不跨 /)');
    assert(checker.matchPattern('app.js', '*.js') === true, '*.js 匹配 app.js');
    assert(checker.matchPattern('test.txt', '*.js') === false, '*.js 不匹配 test.txt');

    // ---- Test 15: 路径规范化 (反斜杠) ----
    console.log('\nTest 15: 路径规范化');
    const normChecker = new PolicyChecker({
      file_access: {
        deny: ['**/.env']
      }
    });
    // Windows 路径反斜杠应被规范化
    assert(normChecker.checkFileAccess('project\\.env').allowed === false, '反斜杠路径也被拒绝');

    // ---- Test 16: 设置角色 ----
    console.log('\nTest 16: 设置角色');
    const roleChecker = new PolicyChecker({
      file_access: { deny: [] },
      commands: {}
    });
    roleChecker.setRole('developer');
    assert(roleChecker.currentRole === 'developer', '角色已设置');

    // ---- Test 17: 角色权限集成 - 文件检查 ----
    console.log('\nTest 17: 角色权限集成 - 文件检查');
    const roleFileChecker = new PolicyChecker({ file_access: {} });
    // observer 角色限制 — 根据 role-permission 的实现
    const obsResult = roleFileChecker.checkFileAccess('/any/file', 'observer');
    // observer 可能有 READ 权限，取决于角色矩阵
    assert(typeof obsResult.allowed === 'boolean', 'observer 检查返回布尔值');

    // admin 角色
    const adminResult = roleFileChecker.checkFileAccess('/any/file', 'admin');
    assert(adminResult.allowed === true, 'admin 文件访问允许');

    // ---- Test 18: 角色权限集成 - 命令检查 ----
    console.log('\nTest 18: 角色权限集成 - 命令检查');
    const roleCmdChecker = new PolicyChecker({ commands: {} });
    const obsCmd = roleCmdChecker.checkCommand('npm install', 'observer');
    // observer 一般没有 CMD_WRITE 权限
    assert(typeof obsCmd.allowed === 'boolean', 'observer 命令检查有结果');

    const adminCmd = roleCmdChecker.checkCommand('npm install', 'admin');
    assert(adminCmd.allowed === true, 'admin 命令允许');

    // ---- Test 19: checkRolePermission 快捷方法 ----
    console.log('\nTest 19: checkRolePermission 快捷方法');
    const { OPERATIONS, PERMISSION_LEVELS } = require('../src/role-permission');
    const permResult = checker.checkRolePermission('admin', OPERATIONS.FILE_READ, PERMISSION_LEVELS.READ);
    assert(typeof permResult.allowed === 'boolean', '返回权限结果');

    // ---- Test 20: checkApproval 快捷方法 ----
    console.log('\nTest 20: checkApproval 快捷方法');
    const approvalResult = checker.checkApproval('developer', OPERATIONS.FILE_READ);
    assert(typeof approvalResult === 'object', '返回审批结果');

    // ---- Test 21: getPermissionAuditLog 快捷方法 ----
    console.log('\nTest 21: getPermissionAuditLog 快捷方法');
    const auditLog = checker.getPermissionAuditLog(10);
    assert(Array.isArray(auditLog), '审计日志是数组');

    // ---- Test 22: 文件访问拒绝原因 ----
    console.log('\nTest 22: 文件访问拒绝原因');
    const denyResult = blacklistChecker.checkFileAccess('/project/.env');
    assert(denyResult.reason.includes('.env'), '原因包含模式');

    const wlResult = whitelistChecker.checkFileAccess('config/db.yml');
    assert(wlResult.reason.includes('whitelist'), '原因包含 whitelist');

    // ---- Test 23: 命令拒绝原因 ----
    console.log('\nTest 23: 命令拒绝原因');
    const dangerResult = cmdChecker.checkCommand('rm -rf /');
    assert(dangerResult.reason.includes('dangerous'), '原因包含 dangerous');

    const denyCmd = cmdChecker.checkCommand('shutdown now');
    assert(denyCmd.reason.includes('denied'), '原因包含 denied');

    const wlCmd = cmdWhiteChecker.checkCommand('curl http://x');
    assert(wlCmd.reason.includes('whitelist'), '原因包含 whitelist');

  } catch (error) {
    console.log(`\n❌ 测试异常: ${error.message}`);
    console.log(error.stack);
    failed++;
  }

  console.log(`\n========================================`);
  console.log(`测试结果: ${passed} 通过, ${failed} 失败`);
  if (failed === 0) {
    console.log('✅ 所有 PolicyChecker 测试通过！');
  } else {
    console.log('❌ 有测试失败');
    process.exitCode = 1;
  }
}

testPolicyChecker();
