const PlatformDetector = require('../src/platform-detector');
const fs = require('fs');
const path = require('path');
const os = require('os');

async function testPlatformDetector() {
  console.log('🧪 测试 PlatformDetector...\n');

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

  // 创建临时测试目录
  const testDir = path.join(os.tmpdir(), `flowharness-pd-test-${Date.now()}`);
  fs.mkdirSync(testDir, { recursive: true });

  try {
    // Test 1: 基本初始化
    console.log('Test 1: 基本初始化');
    const detector = new PlatformDetector({ workingDir: testDir });
    assert(detector.config.workingDir === testDir, '工作目录正确');
    assert(detector._cacheTTL === 30000, '默认缓存TTL');
    console.log('');

    // Test 2: 空目录检测 → generic
    console.log('Test 2: 空目录检测 → generic');
    const result = detector.detect();
    assert(result.current === 'generic', `当前平台为 generic (实际: ${result.current})`);
    assert(Array.isArray(result.platforms), '平台列表为数组');
    assert(result.platforms.length >= 4, `至少4个平台定义 (实际: ${result.platforms.length})`);
    assert(result.detectedAt > 0, '有检测时间戳');
    console.log('');

    // Test 3: generic 始终可用
    console.log('Test 3: generic 始终可用');
    const generic = result.platforms.find(p => p.id === 'generic');
    assert(generic !== undefined, 'generic 平台存在');
    assert(generic.available === true, 'generic 始终可用');
    assert(generic.capabilities.includes('code_editing'), 'generic 有 code_editing');
    console.log('');

    // Test 4: 无标记时其他平台不可用
    console.log('Test 4: 无标记时其他平台不可用');
    const claude = result.platforms.find(p => p.id === 'claude-code');
    assert(claude !== undefined, 'claude-code 定义存在');
    assert(claude.available === false, 'claude-code 不可用（无标记）');
    const cursor = result.platforms.find(p => p.id === 'cursor');
    assert(cursor.available === false, 'cursor 不可用（无标记）');
    const codex = result.platforms.find(p => p.id === 'codex');
    assert(codex.available === false, 'codex 不可用（无标记）');
    console.log('');

    // Test 5: 添加 .claude 标记 → 检测到 claude-code
    console.log('Test 5: 添加 .claude 标记 → 检测到 claude-code');
    fs.mkdirSync(path.join(testDir, '.claude'), { recursive: true });
    const detector2 = new PlatformDetector({ workingDir: testDir });
    const result2 = detector2.detect();
    assert(result2.current === 'claude-code', `当前平台为 claude-code (实际: ${result2.current})`);
    const claude2 = result2.platforms.find(p => p.id === 'claude-code');
    assert(claude2.available === true, 'claude-code 可用');
    assert(claude2.capabilities.includes('reasoning'), 'claude-code 有 reasoning 能力');
    console.log('');

    // Test 6: 添加 .cursor 标记 → 多平台可用
    console.log('Test 6: 添加 .cursor 标记 → 多平台可用');
    fs.mkdirSync(path.join(testDir, '.cursor'), { recursive: true });
    const detector3 = new PlatformDetector({ workingDir: testDir });
    const result3 = detector3.detect();
    // claude-code 优先级高于 cursor
    assert(result3.current === 'claude-code', '优先级: claude-code > cursor');
    const available3 = result3.platforms.filter(p => p.available);
    assert(available3.length >= 3, `至少3个可用 (实际: ${available3.length})`);
    assert(detector3.isAvailable('cursor'), 'cursor 可用');
    console.log('');

    // Test 7: detectCurrentPlatform 快捷方法
    console.log('Test 7: detectCurrentPlatform 快捷方法');
    assert(detector3.detectCurrentPlatform() === 'claude-code', 'detectCurrentPlatform 正确');
    console.log('');

    // Test 8: isAvailable 方法
    console.log('Test 8: isAvailable 方法');
    assert(detector3.isAvailable('claude-code') === true, 'claude-code 可用');
    assert(detector3.isAvailable('cursor') === true, 'cursor 可用');
    assert(detector3.isAvailable('codex') === false, 'codex 不可用');
    assert(detector3.isAvailable('generic') === true, 'generic 始终可用');
    assert(detector3.isAvailable('nonexistent') === false, '不存在平台返回 false');
    console.log('');

    // Test 9: getPlatformInfo 方法
    console.log('Test 9: getPlatformInfo 方法');
    const info = detector3.getPlatformInfo('claude-code');
    assert(info !== null, '获取到平台信息');
    assert(info.id === 'claude-code', 'ID 正确');
    assert(info.name === 'Claude Code', '名称正确');
    assert(info.available === true, '可用状态正确');
    assert(Array.isArray(info.capabilities), '能力列表为数组');
    const nullInfo = detector3.getPlatformInfo('nonexistent');
    assert(nullInfo === null, '不存在平台返回 null');
    const genericInfo = detector3.getPlatformInfo('generic');
    assert(genericInfo.id === 'generic', 'generic 信息正确');
    console.log('');

    // Test 10: registerPlatform 自定义平台
    console.log('Test 10: registerPlatform 自定义平台');
    const detector4 = new PlatformDetector({ workingDir: testDir });
    fs.mkdirSync(path.join(testDir, '.windsurf'), { recursive: true });
    detector4.registerPlatform('windsurf', {
      name: 'Windsurf',
      markers: ['.windsurf'],
      capabilities: ['code_editing', 'ai_chat']
    });
    assert(detector4.isAvailable('windsurf') === true, '自定义平台可用');
    const wsInfo = detector4.getPlatformInfo('windsurf');
    assert(wsInfo.name === 'Windsurf', '自定义平台名称正确');
    assert(wsInfo.capabilities.includes('ai_chat'), '自定义能力正确');
    console.log('');

    // Test 11: registerPlatform 验证
    console.log('Test 11: registerPlatform 验证');
    try {
      detector4.registerPlatform('', { markers: ['.test'] });
      assert(false, '应拒绝空 platformId');
    } catch (e) {
      assert(true, '正确拒绝空 platformId');
    }
    try {
      detector4.registerPlatform('bad', { markers: 'not_array' });
      assert(false, '应拒绝非数组 markers');
    } catch (e) {
      assert(true, '正确拒绝非数组 markers');
    }
    console.log('');

    // Test 12: 缓存机制
    console.log('Test 12: 缓存机制');
    const detector5 = new PlatformDetector({ workingDir: testDir, cacheTTL: 100 });
    const r1 = detector5.detect();
    const r2 = detector5.detect();
    assert(r1 === r2, '缓存命中返回同一对象');
    assert(detector5._stats.totalDetections === 1, '只检测了1次');
    console.log('');

    // Test 13: getStats 方法
    console.log('Test 13: getStats 方法');
    const stats = detector3.getStats();
    assert(stats.totalPlatforms >= 4, `总平台数 >= 4 (${stats.totalPlatforms})`);
    assert(stats.availablePlatforms >= 3, `可用平台数 >= 3 (${stats.availablePlatforms})`);
    assert(stats.currentPlatform === 'claude-code', '当前平台正确');
    assert(Array.isArray(stats.platformIds), '平台ID列表为数组');
    assert(Array.isArray(stats.availableIds), '可用ID列表为数组');
    assert(stats.totalDetections >= 1, '有检测次数');
    assert(stats.lastDetection > 0, '有最后检测时间');
    console.log('');

    // Test 14: CLAUDE.md 标记检测
    console.log('Test 14: CLAUDE.md 标记检测');
    const testDir2 = path.join(os.tmpdir(), `flowharness-pd-test2-${Date.now()}`);
    fs.mkdirSync(testDir2, { recursive: true });
    fs.writeFileSync(path.join(testDir2, 'CLAUDE.md'), '# Claude');
    const detector6 = new PlatformDetector({ workingDir: testDir2 });
    assert(detector6.isAvailable('claude-code') === true, 'CLAUDE.md 触发 claude-code 检测');
    assert(detector6.detectCurrentPlatform() === 'claude-code', '当前平台为 claude-code');
    // 清理
    fs.rmSync(testDir2, { recursive: true, force: true });
    console.log('');

    // Test 15: codex 标记检测
    console.log('Test 15: codex 标记检测');
    const testDir3 = path.join(os.tmpdir(), `flowharness-pd-test3-${Date.now()}`);
    fs.mkdirSync(testDir3, { recursive: true });
    fs.mkdirSync(path.join(testDir3, '.codex'), { recursive: true });
    const detector7 = new PlatformDetector({ workingDir: testDir3 });
    assert(detector7.isAvailable('codex') === true, '.codex 触发 codex 检测');
    assert(detector7.detectCurrentPlatform() === 'codex', '当前平台为 codex');
    const codexInfo = detector7.getPlatformInfo('codex');
    assert(codexInfo.capabilities.includes('autonomous_execution'), 'codex 有 autonomous_execution');
    // 清理
    fs.rmSync(testDir3, { recursive: true, force: true });
    console.log('');

    // Test 16: 配置文件路径检测
    console.log('Test 16: 配置文件路径检测');
    fs.writeFileSync(path.join(testDir, '.claude', 'settings.json'), '{}');
    const detector8 = new PlatformDetector({ workingDir: testDir });
    const claudeInfo = detector8.getPlatformInfo('claude-code');
    assert(claudeInfo.configPath !== null, '检测到配置文件路径');
    assert(claudeInfo.configPath.includes('settings.json'), '配置路径包含 settings.json');
    console.log('');

    // 总结
    console.log('='.repeat(50));
    console.log(`\n测试结果: ${passed} 通过, ${failed} 失败`);
    console.log(`总计: ${passed + failed} 个断言\n`);

    if (failed > 0) {
      console.log('❌ 部分测试失败！\n');
      return false;
    }

    console.log('✅ 所有测试通过！\n');
    return true;

  } catch (error) {
    console.error('❌ 测试异常:', error.message);
    console.error(error.stack);
    return false;
  } finally {
    // 清理测试目录
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {}
  }
}

testPlatformDetector()
  .then(success => process.exit(success ? 0 : 1))
  .catch(error => {
    console.error('💥 测试异常:', error);
    process.exit(1);
  });
