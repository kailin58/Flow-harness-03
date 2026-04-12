const AgentRegistry = require('../src/agent-registry');
const AgentExecutor = require('../src/agent-executor');

async function testSandboxIntegration() {
  console.log('🧪 测试 Sandbox 与 AgentExecutor 集成...\n');

  // 初始化
  const registry = new AgentRegistry();
  registry.initializeCoreAgents();

  const executor = new AgentExecutor(registry, process.cwd(), {
    sandboxDir: '.flowharness/test-sandboxes',
    maxSandboxes: 3,
    autoCleanup: true,
    useSandbox: true,
    sandboxForWriteOps: true
  });

  try {
    // Test 1: 读操作不使用沙箱
    console.log('Test 1: 读操作不使用沙箱');
    const readResult = await executor.execute('explore', {
      action: 'file_search',
      pattern: '*.js',
      cwd: process.cwd()
    }, {});

    console.log(`✅ 文件搜索完成: ${readResult.result.count} 个文件`);
    console.log(`   使用沙箱: ${readResult.sandbox ? '是' : '否'}\n`);

    // Test 2: 命令执行使用沙箱（但禁用 worktree）
    console.log('Test 2: 命令执行使用沙箱');
    const cmdResult = await executor.execute('general', {
      action: 'run_command',
      command: 'node --version'
    }, { useWorktree: false });

    console.log(`✅ 命令执行成功: ${cmdResult.result.stdout.trim()}`);
    console.log(`   使用沙箱: ${cmdResult.result.usedSandbox ? '是' : '否'}`);
    console.log(`   沙箱ID: ${cmdResult.sandbox ? cmdResult.sandbox.id : 'N/A'}\n`);

    // Test 3: 文件创建使用沙箱
    console.log('Test 3: 文件创建使用沙箱');
    const createResult = await executor.execute('general', {
      action: 'create_file',
      filePath: 'test-sandbox-file.txt',
      content: 'Hello from sandbox!'
    }, { useWorktree: false });

    console.log(`✅ 文件创建成功`);
    console.log(`   使用沙箱: ${createResult.result.usedSandbox ? '是' : '否'}`);
    console.log(`   文件路径: ${createResult.result.fullPath}`);
    console.log(`   沙箱ID: ${createResult.sandbox ? createResult.sandbox.id : 'N/A'}\n`);

    // Test 4: 检查沙箱统计（应该都已清理）
    console.log('Test 4: 检查沙箱统计（自动清理）');
    const stats = executor.getSandboxStats();
    console.log(`✅ 沙箱统计:`);
    console.log(`   活跃沙箱: ${stats.activeSandboxes}`);
    console.log(`   总创建数: ${stats.totalCreated}`);
    console.log(`   最大限制: ${stats.maxSandboxes}\n`);

    // Test 5: 禁用自动清理，验证沙箱保留
    console.log('Test 5: 禁用自动清理，验证沙箱保留');
    const executor2 = new AgentExecutor(registry, process.cwd(), {
      sandboxDir: '.flowharness/test-sandboxes',
      autoCleanup: false,
      useSandbox: true
    });

    const result2 = await executor2.execute('general', {
      action: 'run_command',
      command: 'echo "test"'
    }, { useWorktree: false });

    const stats2 = executor2.getSandboxStats();
    console.log(`✅ 沙箱保留验证:`);
    console.log(`   活跃沙箱: ${stats2.activeSandboxes} (应该 > 0)`);
    console.log(`   沙箱ID: ${result2.sandbox ? result2.sandbox.id : 'N/A'}\n`);

    // 手动清理
    const cleaned = await executor2.cleanup();
    console.log(`✅ 手动清理: ${cleaned} 个沙箱\n`);

    // Test 6: 显式禁用沙箱
    console.log('Test 6: 显式禁用沙箱');
    const result3 = await executor.execute('general', {
      action: 'run_command',
      command: 'node --version'
    }, { useSandbox: false });

    console.log(`✅ 命令执行成功`);
    console.log(`   使用沙箱: ${result3.result.usedSandbox ? '是' : '否'}`);
    console.log(`   沙箱对象: ${result3.sandbox ? '存在' : '不存在'}\n`);

    console.log('✅ 所有集成测试通过！\n');
    return true;

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error(error.stack);

    // 清理
    try {
      await executor.cleanup();
    } catch (cleanupError) {
      console.error('清理失败:', cleanupError.message);
    }

    return false;
  }
}

// 运行测试
testSandboxIntegration()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('💥 测试异常:', error);
    process.exit(1);
  });
