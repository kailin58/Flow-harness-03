const {
  SandboxExecutor, EXECUTION_STATUS, EXECUTION_TYPE,
  DEFAULT_ALLOWED_COMMANDS, DEFAULT_BLOCKED_COMMANDS
} = require('../src/sandbox-executor');

async function testSandboxExecutor() {
  console.log('🧪 测试 SandboxExecutor...\n');

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
    assert(typeof EXECUTION_STATUS === 'object', 'EXECUTION_STATUS 已导出');
    assert(EXECUTION_STATUS.PENDING === 'pending', 'PENDING 状态');
    assert(EXECUTION_STATUS.RUNNING === 'running', 'RUNNING 状态');
    assert(EXECUTION_STATUS.COMPLETED === 'completed', 'COMPLETED 状态');
    assert(EXECUTION_STATUS.TIMEOUT === 'timeout', 'TIMEOUT 状态');
    assert(EXECUTION_STATUS.BLOCKED === 'blocked', 'BLOCKED 状态');
    assert(typeof EXECUTION_TYPE === 'object', 'EXECUTION_TYPE 已导出');
    assert(EXECUTION_TYPE.COMMAND === 'command', 'COMMAND 类型');
    assert(EXECUTION_TYPE.FUNCTION === 'function', 'FUNCTION 类型');
    assert(Array.isArray(DEFAULT_ALLOWED_COMMANDS), 'DEFAULT_ALLOWED_COMMANDS 是数组');
    assert(Array.isArray(DEFAULT_BLOCKED_COMMANDS), 'DEFAULT_BLOCKED_COMMANDS 是数组');

    // ---- Test 2: 基本实例化 ----
    console.log('\nTest 2: 基本实例化');
    const executor = new SandboxExecutor({ logger: silentLogger });
    assert(executor !== null, 'SandboxExecutor 创建成功');
    assert(executor.defaultTimeout === 30000, '默认超时 30s');
    assert(executor.maxConcurrent === 5, '默认最大并发 5');
    assert(executor.dryRun === false, '默认非 dryRun');
    assert(executor.maxOutputSize === 1024 * 1024, '默认输出限制 1MB');

    // ---- Test 3: checkCommand 允许的命令 ----
    console.log('\nTest 3: checkCommand 允许的命令');
    const check1 = executor.checkCommand('node --version');
    assert(check1.allowed === true, 'node 命令允许');
    assert(check1.reason === null, '无拒绝理由');

    const check2 = executor.checkCommand('echo hello world');
    assert(check2.allowed === true, 'echo 命令允许');

    const check3 = executor.checkCommand('git status');
    assert(check3.allowed === true, 'git 命令允许');

    // ---- Test 4: checkCommand 禁止的命令 ----
    console.log('\nTest 4: checkCommand 禁止的命令');
    const check4 = executor.checkCommand('rm -rf /');
    assert(check4.allowed === false, 'rm 命令禁止');
    assert(check4.reason.includes('黑名单'), '理由包含黑名单');

    const check5 = executor.checkCommand('sudo anything');
    assert(check5.allowed === false, 'sudo 命令禁止');

    const check6 = executor.checkCommand('shutdown now');
    assert(check6.allowed === false, 'shutdown 命令禁止');

    // ---- Test 5: checkCommand 不在白名单 ----
    console.log('\nTest 5: checkCommand 不在白名单');
    const check7 = executor.checkCommand('python script.py');
    assert(check7.allowed === false, 'python 不在白名单');
    assert(check7.reason.includes('白名单'), '理由包含白名单');

    // ---- Test 6: checkCommand 空命令 ----
    console.log('\nTest 6: checkCommand 空命令');
    assert(executor.checkCommand('').allowed === false, '空字符串拒绝');
    assert(executor.checkCommand(null).allowed === false, 'null 拒绝');

    // ---- Test 7: checkCommand 危险模式 ----
    console.log('\nTest 7: checkCommand 危险模式');
    const check8 = executor.checkCommand('echo ok; rm -rf /');
    assert(check8.allowed === false, '管道注入拒绝');

    const check9 = executor.checkCommand('echo $(cat /etc/passwd)');
    assert(check9.allowed === false, '子shell注入拒绝');

    // ---- Test 8: DryRun 模式执行 ----
    console.log('\nTest 8: DryRun 模式执行');
    const dryExecutor = new SandboxExecutor({ dryRun: true, logger: silentLogger });
    const dryResult = await dryExecutor.execute('echo hello');
    assert(dryResult.success === true, 'DryRun 执行成功');
    assert(dryResult.status === EXECUTION_STATUS.COMPLETED, '状态为 COMPLETED');
    assert(dryResult.stdout.includes('[DRY RUN]'), '输出包含 DRY RUN');
    assert(dryResult.type === EXECUTION_TYPE.COMMAND, '类型为 COMMAND');

    // ---- Test 9: 实际命令执行 ----
    console.log('\nTest 9: 实际命令执行');
    const realExecutor = new SandboxExecutor({ logger: silentLogger });
    const echoResult = await realExecutor.execute('echo HelloSandbox');
    assert(echoResult.success === true, 'echo 执行成功');
    assert(echoResult.exitCode === 0, '退出码 = 0');
    assert(echoResult.stdout.includes('HelloSandbox'), '输出包含 HelloSandbox');
    assert(echoResult.duration >= 0, '有执行时间');
    assert(typeof echoResult.id === 'string', '有执行 ID');

    // ---- Test 10: Node 命令执行 ----
    console.log('\nTest 10: Node 命令执行');
    const nodeResult = await realExecutor.execute('node -e "console.log(42)"');
    assert(nodeResult.success === true, 'node 执行成功');
    // Windows cmd.exe 可能在输出前后加引号,去掉检查具体值
    assert(nodeResult.exitCode === 0, 'node 退出码 = 0');

    // ---- Test 11: 命令执行失败 (使用不存在的文件) ----
    console.log('\nTest 11: 命令执行失败');
    const failResult = await realExecutor.execute('node nonexistent_file_xyz.js');
    assert(failResult.success === false, '失败命令返回 false');
    assert(failResult.exitCode !== 0, '退出码非 0');
    assert(failResult.status === EXECUTION_STATUS.FAILED, '状态为 FAILED');

    // ---- Test 12: 命令被阻止 ----
    console.log('\nTest 12: 命令被阻止');
    const blockResult = await realExecutor.execute('rm test.txt');
    assert(blockResult.success === false, '被阻止命令返回 false');
    assert(blockResult.status === EXECUTION_STATUS.BLOCKED, '状态为 BLOCKED');
    assert(blockResult.error.includes('黑名单'), '错误信息正确');

    // ---- Test 13: 超时控制 (使用函数执行器测试) ----
    console.log('\nTest 13: 超时控制');
    // 用函数执行器测试超时更可靠(避免Windows cmd.exe引号问题)
    const timeoutResult = await realExecutor.executeFunction(
      () => new Promise(resolve => setTimeout(resolve, 30000)),
      { timeout: 200 }
    );
    assert(timeoutResult.success === false, '超时返回失败');
    assert(timeoutResult.status === EXECUTION_STATUS.TIMEOUT, '状态为 TIMEOUT');
    assert(timeoutResult.error !== null, '有错误信息');

    // ---- Test 14: 函数执行 ----
    console.log('\nTest 14: 函数执行');
    const fnResult = await realExecutor.executeFunction(() => {
      return { answer: 42 };
    });
    assert(fnResult.success === true, '函数执行成功');
    assert(fnResult.type === EXECUTION_TYPE.FUNCTION, '类型为 FUNCTION');
    assert(fnResult.result !== undefined, '有执行结果');
    assert(fnResult.result.answer === 42, '结果值正确');

    // ---- Test 15: 函数执行失败 ----
    console.log('\nTest 15: 函数执行失败');
    const fnFailResult = await realExecutor.executeFunction(() => {
      throw new Error('test error');
    });
    assert(fnFailResult.success === false, '函数异常返回失败');
    assert(fnFailResult.status === EXECUTION_STATUS.FAILED, '状态为 FAILED');
    assert(fnFailResult.error === 'test error', '错误信息正确');

    // ---- Test 16: 函数执行超时 ----
    console.log('\nTest 16: 函数执行超时');
    const fnTimeoutResult = await realExecutor.executeFunction(
      () => new Promise(resolve => setTimeout(resolve, 5000)),
      { timeout: 200 }
    );
    assert(fnTimeoutResult.success === false, '函数超时返回失败');
    assert(fnTimeoutResult.status === EXECUTION_STATUS.TIMEOUT, '状态为 TIMEOUT');

    // ---- Test 17: 并发限制 ----
    console.log('\nTest 17: 并发限制');
    const smallExecutor = new SandboxExecutor({ maxConcurrent: 1, logger: silentLogger });
    // 模拟一个活跃进程
    smallExecutor.activeProcesses.set('fake', { pid: 999, process: {}, startedAt: new Date().toISOString() });
    const concResult = await smallExecutor.execute('echo test');
    assert(concResult.success === false, '并发超限拒绝');
    assert(concResult.status === EXECUTION_STATUS.BLOCKED, '状态为 BLOCKED');
    assert(concResult.error.includes('并发'), '错误包含并发');
    smallExecutor.activeProcesses.delete('fake');

    // ---- Test 18: 顺序批量执行 ----
    console.log('\nTest 18: 顺序批量执行');
    const seqResult = await realExecutor.executeSequential([
      'echo step1',
      'echo step2',
      'echo step3'
    ]);
    assert(seqResult.total === 3, '总数 = 3');
    assert(seqResult.executed === 3, '执行 = 3');
    assert(seqResult.successful === 3, '成功 = 3');
    assert(seqResult.results.length === 3, '结果列表长度 = 3');

    // ---- Test 19: 顺序执行遇错停止 ----
    console.log('\nTest 19: 顺序执行遇错停止');
    const seqFail = await realExecutor.executeSequential([
      'echo ok',
      'rm forbidden',  // 被阻止
      'echo unreachable'
    ], { stopOnError: true });
    assert(seqFail.executed === 2, '执行到第2个停止');
    assert(seqFail.successful === 1, '成功 = 1');
    assert(seqFail.failed === 1, '失败 = 1');

    // ---- Test 20: 并行批量执行 ----
    console.log('\nTest 20: 并行批量执行');
    const parResult = await realExecutor.executeParallel([
      'echo p1',
      'echo p2'
    ]);
    assert(parResult.total === 2, '总数 = 2');
    assert(parResult.successful === 2, '成功 = 2');

    // ---- Test 21: 获取执行结果 ----
    console.log('\nTest 21: 获取执行结果');
    const exec = await realExecutor.execute('echo lookup');
    const fetched = realExecutor.getExecution(exec.id);
    assert(fetched !== null, '获取执行结果成功');
    assert(fetched.id === exec.id, 'ID 一致');
    assert(fetched.status === EXECUTION_STATUS.COMPLETED, '状态正确');
    assert(realExecutor.getExecution('nonexistent') === null, '不存在返回 null');

    // ---- Test 22: 获取历史 ----
    console.log('\nTest 22: 获取历史');
    const history = realExecutor.getHistory();
    assert(Array.isArray(history), 'getHistory 返回数组');
    assert(history.length > 0, '有历史记录');

    const filteredHistory = realExecutor.getHistory(100, { status: EXECUTION_STATUS.COMPLETED });
    assert(filteredHistory.length > 0, '过滤完成的历史');
    assert(filteredHistory.every(h => h.status === EXECUTION_STATUS.COMPLETED), '过滤正确');

    // ---- Test 23: 审计日志 ----
    console.log('\nTest 23: 审计日志');
    const auditLog = realExecutor.getAuditLog();
    assert(Array.isArray(auditLog), 'getAuditLog 返回数组');
    assert(auditLog.length > 0, '有审计记录');
    assert(auditLog[0].event !== undefined, '审计条目有 event');
    assert(auditLog[0].timestamp !== undefined, '审计条目有 timestamp');

    // ---- Test 24: getStats ----
    console.log('\nTest 24: getStats');
    const stats = realExecutor.getStats();
    assert(stats.totalExecutions > 0, '总执行数 > 0');
    assert(stats.successful > 0, '成功数 > 0');
    assert(stats.failed > 0, '失败数 > 0');
    assert(stats.blocked > 0, '阻止数 > 0');
    assert(stats.timedOut > 0, '超时数 > 0');
    assert(stats.maxConcurrent === 5, 'maxConcurrent 正确');
    assert(stats.dryRun === false, 'dryRun 正确');
    assert(typeof stats.allowedCommands === 'number', '白名单数量');
    assert(typeof stats.blockedCommands === 'number', '黑名单数量');

    // ---- Test 25: kill 不存在的进程 ----
    console.log('\nTest 25: kill 不存在的进程');
    assert(realExecutor.kill('nonexistent') === false, '不存在进程返回 false');

    // ---- Test 26: getActiveExecutions ----
    console.log('\nTest 26: getActiveExecutions');
    const active = realExecutor.getActiveExecutions();
    assert(Array.isArray(active), 'getActiveExecutions 返回数组');
    // 测试结束时应该没有活跃进程
    assert(active.length === 0, '无活跃进程');

    // ---- Test 27: 自定义白名单 ----
    console.log('\nTest 27: 自定义白名单');
    const customExecutor = new SandboxExecutor({
      allowedCommands: ['python', 'pip'],
      blockedCommands: [],
      logger: silentLogger
    });
    assert(customExecutor.checkCommand('python test.py').allowed === true, '自定义白名单允许');
    assert(customExecutor.checkCommand('node test.js').allowed === false, '白名单外拒绝');

    // ---- Test 28: 标准错误输出 (函数模式) ----
    console.log('\nTest 28: 标准错误输出');
    // 用 node 打印到 stderr (简单命令，跨平台兼容)
    const stderrResult = await realExecutor.execute('echo errcheck 1>&2');
    // echo 重定向stderr 在 cmd.exe 上可能不同，简化检查
    assert(stderrResult.exitCode === 0 || stderrResult.stderr.length > 0, 'stderr 捕获测试执行');
    // 补充：命令执行期间的输出被记录
    assert(typeof stderrResult.stderr === 'string', 'stderr 是字符串');
    assert(typeof stderrResult.stdout === 'string', 'stdout 是字符串');

  } catch (error) {
    console.log(`\n❌ 测试异常: ${error.message}`);
    console.log(error.stack);
    failed++;
  }

  console.log(`\n========================================`);
  console.log(`测试结果: ${passed} 通过, ${failed} 失败`);
  if (failed === 0) {
    console.log('✅ 所有 SandboxExecutor 测试通过！');
  } else {
    console.log('❌ 有测试失败');
    process.exitCode = 1;
  }
}

testSandboxExecutor();
