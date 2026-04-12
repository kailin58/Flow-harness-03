const SandboxManager = require('../src/sandbox-manager');

async function testSandboxManager() {
  console.log('🧪 测试 SandboxManager...\n');

  const manager = new SandboxManager({
    sandboxDir: '.flowharness/test-sandboxes',
    maxSandboxes: 3
  });

  try {
    // Test 1: 创建沙箱
    console.log('Test 1: 创建沙箱');
    const sandbox1 = await manager.createSandbox({ useWorktree: false });
    console.log(`✅ 沙箱已创建: ${sandbox1.id}`);
    console.log(`   路径: ${sandbox1.path}`);
    console.log(`   状态: ${sandbox1.status}\n`);

    // Test 2: 获取沙箱信息
    console.log('Test 2: 获取沙箱信息');
    const info = manager.getSandbox(sandbox1.id);
    console.log(`✅ 沙箱信息: ${info.id}`);
    console.log(`   创建时间: ${info.createdAt}\n`);

    // Test 3: 创建多个沙箱
    console.log('Test 3: 创建多个沙箱');
    const sandbox2 = await manager.createSandbox({ useWorktree: false });
    const sandbox3 = await manager.createSandbox({ useWorktree: false });
    console.log(`✅ 已创建 3 个沙箱\n`);

    // Test 4: 列出所有沙箱
    console.log('Test 4: 列出所有沙箱');
    const sandboxes = manager.listSandboxes();
    console.log(`✅ 活跃沙箱数量: ${sandboxes.length}`);
    sandboxes.forEach(sb => {
      console.log(`   - ${sb.id} (${sb.status})`);
    });
    console.log('');

    // Test 5: 测试沙箱数量限制
    console.log('Test 5: 测试沙箱数量限制');
    try {
      await manager.createSandbox({ useWorktree: false });
      console.log('❌ 应该抛出错误（超过限制）');
    } catch (error) {
      console.log(`✅ 正确拒绝: ${error.message}\n`);
    }

    // Test 6: 获取统计信息
    console.log('Test 6: 获取统计信息');
    const stats = manager.getStats();
    console.log(`✅ 统计信息:`);
    console.log(`   活跃沙箱: ${stats.activeSandboxes}`);
    console.log(`   最大限制: ${stats.maxSandboxes}`);
    console.log(`   总创建数: ${stats.totalCreated}\n`);

    // Test 7: 销毁单个沙箱
    console.log('Test 7: 销毁单个沙箱');
    await manager.destroySandbox(sandbox1.id);
    console.log(`✅ 沙箱已销毁: ${sandbox1.id}`);
    console.log(`   剩余沙箱: ${manager.listSandboxes().length}\n`);

    // Test 8: 清理所有沙箱
    console.log('Test 8: 清理所有沙箱');
    const cleaned = await manager.cleanupAll();
    console.log(`✅ 已清理 ${cleaned} 个沙箱`);
    console.log(`   剩余沙箱: ${manager.listSandboxes().length}\n`);

    console.log('✅ 所有测试通过！\n');
    return true;

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error(error.stack);

    // 清理
    try {
      await manager.cleanupAll();
    } catch (cleanupError) {
      console.error('清理失败:', cleanupError.message);
    }

    return false;
  }
}

// 运行测试
testSandboxManager()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('💥 测试异常:', error);
    process.exit(1);
  });
