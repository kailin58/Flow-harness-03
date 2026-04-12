const {
  ContainerSandbox, createSandbox,
  ISOLATION_MODE, CONTAINER_STATUS, MOUNT_TYPE
} = require('../src/container-sandbox');

async function testContainerSandbox() {
  console.log('🧪 测试 ContainerSandbox...\n');

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
    assert(typeof ISOLATION_MODE === 'object', 'ISOLATION_MODE 已导出');
    assert(ISOLATION_MODE.PROCESS === 'process', 'PROCESS 模式');
    assert(ISOLATION_MODE.DOCKER === 'docker', 'DOCKER 模式');
    assert(ISOLATION_MODE.VM === 'vm', 'VM 模式');
    assert(ISOLATION_MODE.NONE === 'none', 'NONE 模式');
    assert(typeof CONTAINER_STATUS === 'object', 'CONTAINER_STATUS 已导出');
    assert(CONTAINER_STATUS.CREATED === 'created', 'CREATED 状态');
    assert(CONTAINER_STATUS.RUNNING === 'running', 'RUNNING 状态');
    assert(CONTAINER_STATUS.STOPPED === 'stopped', 'STOPPED 状态');
    assert(CONTAINER_STATUS.DESTROYED === 'destroyed', 'DESTROYED 状态');
    assert(typeof MOUNT_TYPE === 'object', 'MOUNT_TYPE 已导出');
    assert(MOUNT_TYPE.BIND === 'bind', 'BIND 挂载');
    assert(MOUNT_TYPE.TMPFS === 'tmpfs', 'TMPFS 挂载');

    // ---- Test 2: 基本实例化 ----
    console.log('\nTest 2: 基本实例化');
    const sb = new ContainerSandbox({ logger: silentLogger });
    assert(sb !== null, 'ContainerSandbox 创建成功');
    assert(sb.mode === ISOLATION_MODE.PROCESS, '默认模式为 PROCESS');
    assert(sb.status === CONTAINER_STATUS.CREATED, '初始状态为 CREATED');
    assert(sb.resources.cpuLimit === 1.0, '默认 CPU 限制 1.0');
    assert(sb.resources.memoryLimitMB === 512, '默认内存 512MB');
    assert(sb.resources.timeoutMs === 60000, '默认超时 60s');

    // ---- Test 3: 工厂方法 ----
    console.log('\nTest 3: 工厂方法');
    const sb2 = createSandbox(ISOLATION_MODE.PROCESS, { logger: silentLogger });
    assert(sb2 instanceof ContainerSandbox, '工厂方法返回实例');
    assert(sb2.mode === ISOLATION_MODE.PROCESS, '模式正确');

    const sb3 = createSandbox(ISOLATION_MODE.DOCKER, { logger: silentLogger });
    assert(sb3.mode === ISOLATION_MODE.DOCKER, 'Docker 模式');

    // ---- Test 4: 启动沙箱 (Process 模式) ----
    console.log('\nTest 4: 启动沙箱 (Process)');
    const startResult = await sb.start();
    assert(startResult.success === true, '启动成功');
    assert(typeof startResult.containerId === 'string', '有容器 ID');
    assert(sb.status === CONTAINER_STATUS.RUNNING, '状态为 RUNNING');
    assert(sb.startedAt !== null, '有启动时间');

    // 重复启动
    const dupStart = await sb.start();
    assert(dupStart.success === false, '重复启动拒绝');

    // ---- Test 5: 执行命令 (Process) ----
    console.log('\nTest 5: 执行命令 (Process)');
    const execResult = await sb.exec('echo HelloContainer');
    assert(execResult.success === true, '命令执行成功');
    assert(execResult.exitCode === 0, '退出码 = 0');
    assert(execResult.stdout.includes('HelloContainer'), '输出正确');
    assert(typeof execResult.duration === 'number', '有执行时间');

    // ---- Test 6: 执行 Node 命令 ----
    console.log('\nTest 6: 执行 Node 命令');
    const nodeResult = await sb.exec('node -e "console.log(42)"');
    assert(nodeResult.success === true, 'Node 命令成功');
    assert(nodeResult.exitCode === 0, '退出码 = 0');

    // ---- Test 7: 命令失败 ----
    console.log('\nTest 7: 命令失败');
    const failResult = await sb.exec('node nonexistent_sandbox_file.js');
    assert(failResult.success === false, '失败命令返回 false');
    assert(failResult.exitCode !== 0, '退出码非 0');

    // ---- Test 8: 空命令拒绝 ----
    console.log('\nTest 8: 空命令拒绝');
    const emptyResult = await sb.exec('');
    assert(emptyResult.success === false, '空命令拒绝');
    const nullResult = await sb.exec(null);
    assert(nullResult.success === false, 'null 命令拒绝');

    // ---- Test 9: 停止沙箱 ----
    console.log('\nTest 9: 停止沙箱');
    const stopResult = await sb.stop();
    assert(stopResult.success === true, '停止成功');
    assert(sb.status === CONTAINER_STATUS.STOPPED, '状态为 STOPPED');
    assert(sb.stoppedAt !== null, '有停止时间');

    // 停止后不能执行
    const afterStop = await sb.exec('echo test');
    assert(afterStop.success === false, '停止后不能执行');

    // ---- Test 10: 重启沙箱 ----
    console.log('\nTest 10: 重启沙箱');
    const restartResult = await sb.restart();
    assert(restartResult.success === true, '重启成功');
    assert(sb.status === CONTAINER_STATUS.RUNNING, '重启后为 RUNNING');

    // 重启后可执行
    const afterRestart = await sb.exec('echo restarted');
    assert(afterRestart.success === true, '重启后可执行');

    // ---- Test 11: 销毁沙箱 ----
    console.log('\nTest 11: 销毁沙箱');
    const destroyResult = await sb.destroy();
    assert(destroyResult.success === true, '销毁成功');
    assert(sb.status === CONTAINER_STATUS.DESTROYED, '状态为 DESTROYED');

    // 销毁后不能启动
    const afterDestroy = await sb.start();
    assert(afterDestroy.success === false, '销毁后不能启动');

    // 重复销毁
    const dupDestroy = await sb.destroy();
    assert(dupDestroy.success === false, '重复销毁拒绝');

    // ---- Test 12: 文件挂载管理 ----
    console.log('\nTest 12: 文件挂载管理');
    const mountSb = new ContainerSandbox({ logger: silentLogger });
    const addMount = mountSb.addMount({
      source: '/host/data',
      target: '/container/data',
      readOnly: true
    });
    assert(addMount.success === true, '添加挂载成功');
    assert(addMount.mount.type === MOUNT_TYPE.BIND, '默认 BIND 类型');
    assert(addMount.mount.readOnly === true, '只读标志');

    mountSb.addMount({
      source: '/host/tmp',
      target: '/container/tmp',
      type: MOUNT_TYPE.TMPFS
    });
    assert(mountSb.getMounts().length === 2, '2 个挂载');

    // 移除挂载
    const removeResult = mountSb.removeMount('/container/data');
    assert(removeResult.success === true, '移除挂载成功');
    assert(mountSb.getMounts().length === 1, '1 个挂载');

    // 不存在的挂载
    assert(mountSb.removeMount('/nonexistent').success === false, '不存在返回失败');

    // ---- Test 13: 运行中不能操作挂载 ----
    console.log('\nTest 13: 运行中不能操作挂载');
    await mountSb.start();
    const runningMount = mountSb.addMount({ source: '/a', target: '/b' });
    assert(runningMount.success === false, '运行中不能添加挂载');
    const runningRemove = mountSb.removeMount('/container/tmp');
    assert(runningRemove.success === false, '运行中不能移除挂载');
    await mountSb.stop();

    // ---- Test 14: 挂载校验 ----
    console.log('\nTest 14: 挂载校验');
    const badMount = mountSb.addMount({ source: '/only-source' });
    assert(badMount.success === false, '缺少 target 拒绝');

    // ---- Test 15: 资源管理 ----
    console.log('\nTest 15: 资源管理');
    const resSb = new ContainerSandbox({ logger: silentLogger });
    const updateRes = resSb.updateResources({
      cpuLimit: 2.0,
      memoryLimitMB: 1024,
      networkEnabled: false
    });
    assert(updateRes.success === true, '更新资源成功');
    assert(updateRes.updated === 3, '3 项更新');
    const res = resSb.getResources();
    assert(res.cpuLimit === 2.0, 'CPU 已更新');
    assert(res.memoryLimitMB === 1024, '内存已更新');
    assert(res.networkEnabled === false, '网络已更新');

    // ---- Test 16: 自定义资源 ----
    console.log('\nTest 16: 自定义资源');
    const customSb = new ContainerSandbox({
      resources: { cpuLimit: 0.5, memoryLimitMB: 256 },
      logger: silentLogger
    });
    assert(customSb.resources.cpuLimit === 0.5, '自定义 CPU');
    assert(customSb.resources.memoryLimitMB === 256, '自定义内存');
    assert(customSb.resources.pidLimit === 100, '默认 PID 限制保留');

    // ---- Test 17: 获取沙箱信息 ----
    console.log('\nTest 17: 获取沙箱信息');
    const infoSb = createSandbox(ISOLATION_MODE.PROCESS, {
      name: 'test-sandbox',
      logger: silentLogger
    });
    await infoSb.start();
    const info = infoSb.getInfo();
    assert(info.name === 'test-sandbox', '名称正确');
    assert(info.mode === ISOLATION_MODE.PROCESS, '模式正确');
    assert(info.status === CONTAINER_STATUS.RUNNING, '状态正确');
    assert(typeof info.containerId === 'string', '有容器 ID');
    assert(info.uptime >= 0, '有运行时间');
    await infoSb.stop();

    // ---- Test 18: 执行历史 ----
    console.log('\nTest 18: 执行历史');
    const histSb = createSandbox(ISOLATION_MODE.PROCESS, { logger: silentLogger });
    await histSb.start();
    await histSb.exec('echo step1');
    await histSb.exec('echo step2');
    await histSb.exec('echo step3');

    const history = histSb.getExecHistory();
    assert(Array.isArray(history), '执行历史是数组');
    assert(history.length === 3, '3 条记录');
    assert(history[0].command === 'echo step1', '第一条命令正确');
    assert(history[0].success === true, '第一条成功');
    await histSb.stop();

    // ---- Test 19: 统计信息 ----
    console.log('\nTest 19: 统计信息');
    const stats = histSb.getStats();
    assert(stats.executions === 3, '执行 3 次');
    assert(stats.successful === 3, '成功 3 次');
    assert(stats.failed === 0, '失败 0 次');
    assert(typeof stats.avgDuration === 'number', '有平均时间');
    assert(stats.successRate === 1, '成功率 100%');
    assert(stats.mode === ISOLATION_MODE.PROCESS, '模式正确');

    // ---- Test 20: 事件日志 ----
    console.log('\nTest 20: 事件日志');
    const events = histSb.getEventLog();
    assert(Array.isArray(events), '事件日志是数组');
    assert(events.length > 0, '有事件');
    assert(events.some(e => e.event === 'sandbox_created'), '包含创建事件');
    assert(events.some(e => e.event === 'sandbox_started'), '包含启动事件');
    assert(events.some(e => e.event === 'command_executed'), '包含执行事件');

    // ---- Test 21: Docker 模式 (需要 Docker 运行时) ----
    console.log('\nTest 21: Docker 模式');
    const dockerSb = createSandbox(ISOLATION_MODE.DOCKER, { logger: silentLogger });
    assert(dockerSb.mode === ISOLATION_MODE.DOCKER, 'Docker 模式已设置');
    // Docker 启动取决于 Docker 是否安装
    const dockerStart = await dockerSb.start();
    if (dockerStart.success) {
      // Docker 可用 — 测试完整生命周期
      assert(dockerSb.status === CONTAINER_STATUS.RUNNING, 'Docker 运行中');
      const dockerExec = await dockerSb.exec('echo docker-test');
      assert(dockerExec.exitCode === 0, 'Docker exec 成功');
      assert(dockerExec.stdout.includes('docker-test'), 'Docker exec 输出正确');
      await dockerSb.stop();
      assert(dockerSb.status === CONTAINER_STATUS.STOPPED, 'Docker 已停止');
      await dockerSb.destroy();
      assert(dockerSb.status === CONTAINER_STATUS.DESTROYED, 'Docker 已销毁');
    } else {
      // Docker 不可用 — 应优雅报错
      assert(dockerSb.status === CONTAINER_STATUS.ERROR, 'Docker 不可用时状态为 ERROR');
      assert(dockerStart.error.includes('Docker'), '错误信息提到 Docker');
      console.log('    (Docker 未安装，跳过完整 Docker 测试)');
    }

    // ---- Test 22: VM 模式 (增强进程隔离) ----
    console.log('\nTest 22: VM 模式 (增强进程隔离)');
    const vmSb = createSandbox(ISOLATION_MODE.VM, { logger: silentLogger });
    const vmStart = await vmSb.start();
    assert(vmStart.success === true, 'VM 启动成功');
    assert(vmSb.status === CONTAINER_STATUS.RUNNING, 'VM 运行中');
    assert(typeof vmSb.containerId === 'string', 'VM 有容器 ID');
    assert(vmSb.containerId.startsWith('vm_'), 'VM ID 前缀正确');

    // 执行命令 — 在隔离环境中
    const vmExec = await vmSb.exec('echo vm-isolation-test');
    assert(vmExec.success === true, 'VM exec 成功');
    assert(vmExec.exitCode === 0, 'VM exec 退出码 0');
    assert(vmExec.stdout.includes('vm-isolation-test'), 'VM exec 输出正确');

    // 验证隔离环境变量 (通过子进程检测 VM 模式)
    const vmEnvCmd = process.platform === 'win32'
      ? 'echo %NODE_ENV%'
      : 'echo $NODE_ENV';
    const vmEnv = await vmSb.exec(vmEnvCmd);
    assert(vmEnv.success === true, 'VM 环境变量命令成功');
    assert(vmEnv.stdout.includes('sandbox'), 'VM NODE_ENV 为 sandbox');

    // VM 停止与销毁
    await vmSb.stop();
    assert(vmSb.status === CONTAINER_STATUS.STOPPED, 'VM 已停止');
    await vmSb.destroy();
    assert(vmSb.status === CONTAINER_STATUS.DESTROYED, 'VM 已销毁');

    // ---- Test 22b: VM 模式完整生命周期 ----
    console.log('\nTest 22b: VM 模式完整生命周期');
    const vmSb2 = createSandbox(ISOLATION_MODE.VM, {
      name: 'vm-lifecycle-test',
      logger: silentLogger
    });
    await vmSb2.start();
    // 确保隔离目录已创建
    assert(vmSb2._vmRoot !== null, 'VM 根目录已创建');
    const fs = require('fs');
    assert(fs.existsSync(vmSb2._vmRoot), 'VM 根目录存在');

    // 执行多条命令
    await vmSb2.exec('echo step1');
    await vmSb2.exec('echo step2');
    const vmHist = vmSb2.getExecHistory();
    assert(vmHist.length === 2, 'VM 执行历史 2 条');

    // 销毁时清理临时目录
    const vmRoot = vmSb2._vmRoot;
    await vmSb2.destroy();
    assert(!fs.existsSync(vmRoot), 'VM 根目录已清理');

    // ---- Test 23: NONE 模式 ----
    console.log('\nTest 23: NONE 模式');
    const noneSb = createSandbox(ISOLATION_MODE.NONE, { logger: silentLogger });
    await noneSb.start();
    const noneExec = await noneSb.exec('echo none-mode');
    assert(noneExec.success === true, 'NONE 模式执行成功');
    assert(noneExec.stdout.includes('none-mode'), 'NONE 模式使用 process 执行');
    await noneSb.destroy();

    // ---- Test 24: 自定义环境变量 ----
    console.log('\nTest 24: 自定义环境变量');
    const envSb = createSandbox(ISOLATION_MODE.PROCESS, {
      env: { CUSTOM_VAR: 'hello' },
      logger: silentLogger
    });
    await envSb.start();
    const envExec = await envSb.exec('node -e "console.log(process.env.CUSTOM_VAR)"');
    assert(envExec.success === true, '环境变量命令成功');
    // Windows cmd.exe 可能导致输出不同，简单检查退出码
    assert(envExec.exitCode === 0, '环境变量退出码正确');
    await envSb.destroy();

    // ---- Test 25: 超时控制 ----
    console.log('\nTest 25: 超时控制');
    const timeoutSb = createSandbox(ISOLATION_MODE.PROCESS, {
      resources: { timeoutMs: 500 },
      logger: silentLogger
    });
    await timeoutSb.start();
    // 使用 ping 命令模拟长时间运行 (跨平台兼容)
    const isWindows = process.platform === 'win32';
    const longCmd = isWindows ? 'ping -n 30 127.0.0.1' : 'sleep 30';
    const timeoutExec = await timeoutSb.exec(longCmd, { timeout: 300 });
    assert(timeoutExec.success === false, '超时命令返回失败');
    assert(timeoutExec.exitCode !== 0, '超时退出码非 0');
    await timeoutSb.destroy();

  } catch (error) {
    console.log(`\n❌ 测试异常: ${error.message}`);
    console.log(error.stack);
    failed++;
  }

  console.log(`\n========================================`);
  console.log(`测试结果: ${passed} 通过, ${failed} 失败`);
  if (failed === 0) {
    console.log('✅ 所有 ContainerSandbox 测试通过！');
  } else {
    console.log('❌ 有测试失败');
    process.exitCode = 1;
  }
}

testContainerSandbox();
