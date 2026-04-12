/**
 * Phase 7 端到端综合测试
 * 验证跨平台协作组件在真实工作流中的协同工作：
 *   PlatformDetector → TaskSerializer → IPCChannel → CrossPlatformDispatcher → LeadershipManager
 */
const AgentRegistry = require('../src/agent-registry');
const AgentExecutor = require('../src/agent-executor');
const PlatformDetector = require('../src/platform-detector');
const TaskSerializer = require('../src/task-serializer');
const IPCChannel = require('../src/ipc-channel');
const CrossPlatformDispatcher = require('../src/cross-platform-dispatcher');
const LeadershipManager = require('../src/leadership-manager');
const fs = require('fs');
const path = require('path');
const os = require('os');

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  ✅ ${testName}`);
    passed++;
  } else {
    console.log(`  ❌ ${testName}`);
    failed++;
  }
}

async function runE2E() {
  console.log('🧪 Phase 7 端到端综合测试\n');

  // 使用临时目录避免污染项目
  const testDir = path.join(os.tmpdir(), `flowharness-p7e2e-${Date.now()}`);
  fs.mkdirSync(testDir, { recursive: true });
  // 创建平台标记
  fs.mkdirSync(path.join(testDir, '.claude'), { recursive: true });
  fs.mkdirSync(path.join(testDir, '.cursor'), { recursive: true });

  try {
    const registry = new AgentRegistry();
    registry.initializeCoreAgents();

    // 启用跨平台功能
    const executor = new AgentExecutor(registry, process.cwd(), {
      sandboxDir: path.join(testDir, 'sandboxes'),
      autoCleanup: true,
      useSandbox: false,
      defaultTimeout: 10000,
      enableLogging: false,
      enableAutoRetry: false,
      enableSelfHealing: false,
      enableCrossPlatform: true,
      tasksDir: path.join(testDir, 'tasks'),
      platformDetector: { workingDir: testDir }
    });

    // ============================================================
    // Scenario 1: 本地执行仍正常（跨平台启用不影响）
    // ============================================================
    console.log('━'.repeat(60));
    console.log('Scenario 1: 本地执行仍正常');
    console.log('━'.repeat(60));

    const r1 = await executor.execute('explore', {
      action: 'file_search', pattern: '*.js', cwd: process.cwd()
    }, {});
    assert(r1.success === true, '本地执行成功');
    const execStats = executor.getExecutionStats();
    assert(execStats.totalExecutions >= 1, `执行记录正常 (${execStats.totalExecutions})`);
    console.log('');

    // ============================================================
    // Scenario 2: 平台检测
    // ============================================================
    console.log('━'.repeat(60));
    console.log('Scenario 2: 平台检测');
    console.log('━'.repeat(60));

    const platformInfo = executor.getPlatformInfo();
    assert(platformInfo !== null, '平台信息存在');
    assert(platformInfo.current === 'claude-code', `当前平台: ${platformInfo.current}`);
    assert(platformInfo.platforms.length >= 4, `平台数 >= 4 (${platformInfo.platforms.length})`);
    const available = platformInfo.platforms.filter(p => p.available);
    assert(available.length >= 3, `可用平台 >= 3 (${available.length})`);
    assert(available.some(p => p.id === 'claude-code'), '含 claude-code');
    assert(available.some(p => p.id === 'cursor'), '含 cursor');
    assert(available.some(p => p.id === 'generic'), '含 generic');
    console.log('');

    // ============================================================
    // Scenario 3: 任务序列化往返
    // ============================================================
    console.log('━'.repeat(60));
    console.log('Scenario 3: 任务序列化往返');
    console.log('━'.repeat(60));

    const serializer = new TaskSerializer();
    const task = { action: 'code_search', query: 'function', cwd: '/project' };
    const { json, checksum, envelope } = serializer.serialize(task, {
      source: { platform: 'claude-code', agentId: 'explore' },
      target: { platform: 'cursor' }
    });
    assert(typeof json === 'string', 'JSON 序列化成功');
    assert(checksum.length === 64, 'SHA256 校验和');

    const deserialized = serializer.deserialize(json);
    assert(deserialized.valid === true, '反序列化有效');
    assert(deserialized.checksumValid === true, '校验和验证通过');
    assert(deserialized.task.action === 'code_search', '任务数据完整');
    assert(deserialized.metadata.source.platform === 'claude-code', '来源保留');
    console.log('');

    // ============================================================
    // Scenario 4: IPC 通道发送/接收
    // ============================================================
    console.log('━'.repeat(60));
    console.log('Scenario 4: IPC 通道发送/接收');
    console.log('━'.repeat(60));

    const ipc = executor.ipcChannel;
    // 发送任务
    const taskId = await ipc.send(
      { action: 'refactor', target: 'component.tsx' },
      'cursor',
      { source: { platform: 'claude-code' } }
    );
    assert(taskId.startsWith('task-'), `任务已发送 (${taskId})`);

    // 模拟接收方提交结果
    await ipc.submitResult(taskId, { success: true, changes: 5 });
    const result = await ipc.getResult(taskId);
    assert(result !== null, '结果已提交');
    assert(result.result.success === true, '结果成功');
    assert(result.result.changes === 5, '结果数据正确');

    const ipcStats = executor.getIPCStats();
    assert(ipcStats.sent >= 1, `IPC 发送 >= 1 (${ipcStats.sent})`);
    assert(ipcStats.resultsSubmitted >= 1, `结果提交 >= 1`);
    console.log('');

    // ============================================================
    // Scenario 5: 跨平台分发
    // ============================================================
    console.log('━'.repeat(60));
    console.log('Scenario 5: 跨平台分发');
    console.log('━'.repeat(60));

    const dispatcher = executor.crossPlatformDispatcher;

    // 本地分发（无特殊需求）
    const local = await dispatcher.dispatch({ action: 'file_search' });
    assert(local.local === true, '无需求 → 本地');
    assert(local.platform === 'claude-code', '本地平台正确');

    // 远程分发（指定目标）
    const remote = await dispatcher.dispatch({ action: 'ui_edit', targetPlatform: 'cursor' });
    assert(remote.local === false, '指定 cursor → 远程');
    assert(remote.platform === 'cursor', '远程平台正确');

    // 能力不足 → 远程
    const capRemote = await dispatcher.dispatch({
      action: 'ui_dev',
      requiredCapabilities: ['ui_development', 'inline_edit']
    });
    assert(capRemote.local === false, '缺少能力 → 远程');

    const cpStats = executor.getCrossPlatformStats();
    assert(cpStats.totalDispatches >= 3, `总分发 >= 3 (${cpStats.totalDispatches})`);
    assert(cpStats.localDispatches >= 1, `本地分发 >= 1`);
    assert(cpStats.remoteDispatches >= 2, `远程分发 >= 2`);

    const cpHistory = executor.getCrossPlatformHistory();
    assert(cpHistory.length >= 3, `分发历史 >= 3 (${cpHistory.length})`);
    console.log('');

    // ============================================================
    // Scenario 6: 领导权转移协议
    // ============================================================
    console.log('━'.repeat(60));
    console.log('Scenario 6: 领导权转移协议');
    console.log('━'.repeat(60));

    const lm = executor.leadershipManager;

    // 声明领导权
    const claimed = await lm.claimLeadership();
    assert(claimed === true, '声明领导权成功');

    const leader = await executor.getCurrentLeader();
    assert(leader.platform === 'claude-code', '领导者为 claude-code');

    // 发起转移
    const transfer = await lm.transferLeadership('cursor', {
      currentTask: { id: 'task-ui', step: 2 },
      progress: 40
    });
    assert(transfer.success === true, '转移发起成功');

    // 模拟新领导者确认
    await lm.acknowledgeTakeover(transfer.transferId);

    // 等待完成
    const waitResult = await lm.waitForTakeover(transfer.transferId, 2000);
    assert(waitResult.acknowledged === true, '接管已确认');

    const newLeader = await executor.getCurrentLeader();
    assert(newLeader.platform === 'cursor', '领导者已转为 cursor');

    const lStats = executor.getLeadershipStats();
    assert(lStats.totalTransfers >= 1, `转移次数 >= 1`);
    assert(lStats.successfulTransfers >= 1, `成功转移 >= 1`);
    console.log('');

    // ============================================================
    // Scenario 7: 诊断报告含跨平台数据
    // ============================================================
    console.log('━'.repeat(60));
    console.log('Scenario 7: 诊断报告含跨平台数据');
    console.log('━'.repeat(60));

    // 注册跨平台诊断段
    executor.registerDiagnosticSection('crossPlatform', {
      name: '跨平台协作',
      collect: () => ({
        platformInfo: executor.getPlatformInfo(),
        ipcStats: executor.getIPCStats(),
        dispatchStats: executor.getCrossPlatformStats(),
        leadershipStats: executor.getLeadershipStats()
      })
    });

    const report = executor.generateDiagnosticReport({ level: 'detailed' });
    assert(report.custom.crossPlatform !== undefined, '诊断报告含跨平台段');
    assert(report.custom.crossPlatform.data.platformInfo !== null, '含平台信息');
    assert(report.custom.crossPlatform.data.ipcStats !== null, '含 IPC 统计');
    assert(report.custom.crossPlatform.data.dispatchStats !== null, '含分发统计');
    assert(report.custom.crossPlatform.data.leadershipStats !== null, '含领导权统计');

    const text = executor.formatDiagnosticReport(report);
    assert(text.includes('诊断报告'), '报告文本正常');
    assert(text.length > 200, `报告有内容 (${text.length} 字符)`);
    console.log('');

    // ============================================================
    // Scenario 8: 跨平台关闭时方法返回 null
    // ============================================================
    console.log('━'.repeat(60));
    console.log('Scenario 8: 跨平台关闭时方法返回 null');
    console.log('━'.repeat(60));

    const executor2 = new AgentExecutor(registry, process.cwd(), {
      useSandbox: false,
      enableCrossPlatform: false,
      enableLogging: false
    });
    assert(executor2.getPlatformInfo() === null, 'getPlatformInfo → null');
    assert(executor2.getCrossPlatformStats() === null, 'getCrossPlatformStats → null');
    assert(executor2.getLeadershipStats() === null, 'getLeadershipStats → null');
    assert(executor2.getIPCStats() === null, 'getIPCStats → null');
    const cpHist2 = executor2.getCrossPlatformHistory();
    assert(Array.isArray(cpHist2) && cpHist2.length === 0, 'getCrossPlatformHistory → []');
    const leader2 = await executor2.getCurrentLeader();
    assert(leader2 === null, 'getCurrentLeader → null');
    console.log('');

    // ============================================================
    // 总结
    // ============================================================
    console.log('='.repeat(60));
    console.log(`\n测试结果: ${passed} 通过, ${failed} 失败`);
    console.log(`总计: ${passed + failed} 个断言\n`);

    if (failed > 0) {
      console.log('❌ 部分端到端测试失败！\n');
      return false;
    }

    console.log('✅ Phase 7 端到端综合测试全部通过！\n');
    return true;

  } catch (error) {
    console.error('❌ 测试异常:', error.message);
    console.error(error.stack);
    return false;
  } finally {
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {}
  }
}

runE2E()
  .then(success => process.exit(success ? 0 : 1))
  .catch(error => {
    console.error('💥 测试异常:', error);
    console.error(error.stack);
    process.exit(1);
  });
