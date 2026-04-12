const { ConflictResolver, CONFLICT_TYPES, RESOLUTION_STRATEGIES, TOOL_PRIORITY } = require('../src/conflict-resolver');

async function testConflictResolver() {
  console.log('🧪 测试 ConflictResolver...\n');

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
    assert(typeof CONFLICT_TYPES === 'object', 'CONFLICT_TYPES 已导出');
    assert(CONFLICT_TYPES.RESOURCE === 'resource', 'RESOURCE 类型');
    assert(CONFLICT_TYPES.CONFIG === 'config', 'CONFIG 类型');
    assert(typeof RESOLUTION_STRATEGIES === 'object', 'RESOLUTION_STRATEGIES 已导出');
    assert(RESOLUTION_STRATEGIES.PRIORITY === 'priority', 'PRIORITY 策略');
    assert(RESOLUTION_STRATEGIES.MERGE === 'merge', 'MERGE 策略');
    assert(typeof TOOL_PRIORITY === 'object', 'TOOL_PRIORITY 已导出');
    assert(TOOL_PRIORITY.supervisor === 100, 'supervisor 优先级 100');

    // ---- Test 2: 基本实例化 ----
    console.log('\nTest 2: 基本实例化');
    const resolver = new ConflictResolver({ logger: silentLogger });
    assert(resolver !== null, 'ConflictResolver 实例创建成功');
    assert(resolver.defaultStrategy === RESOLUTION_STRATEGIES.PRIORITY, '默认策略为 priority');

    // ---- Test 3: 资源获取 — 无冲突 ----
    console.log('\nTest 3: 资源获取 — 无冲突');
    const res1 = resolver.acquireResource('file:/src/app.js', 'executor');
    assert(res1.acquired === true, '资源获取成功');
    assert(res1.holder === 'executor', '持有者正确');

    // ---- Test 4: 资源获取 — 冲突 + 优先级仲裁 ----
    console.log('\nTest 4: 资源冲突 — 低优先级等待');
    const res2 = resolver.acquireResource('file:/src/app.js', 'monitor');
    // monitor(60) < executor(70), 应该等待
    assert(res2.acquired === false, '低优先级无法获取');
    assert(res2.holder === 'executor', '当前持有者是 executor');
    assert(typeof res2.waitMs === 'number', '返回等待时间');

    // ---- Test 5: 资源获取 — 高优先级抢占 ----
    console.log('\nTest 5: 资源冲突 — 高优先级抢占');
    const res3 = resolver.acquireResource('file:/src/app.js', 'supervisor');
    // supervisor(100) > executor(70), 应该抢占
    assert(res3.acquired === true, '高优先级抢占成功');
    assert(res3.preempted === 'executor', '被抢占者是 executor');

    // ---- Test 6: 资源释放 ----
    console.log('\nTest 6: 资源释放');
    const released = resolver.releaseResource('file:/src/app.js', 'supervisor');
    assert(released === true, '资源释放成功');
    const releaseWrong = resolver.releaseResource('file:/src/app.js', 'unknown');
    assert(releaseWrong === false, '非持有者无法释放');

    // ---- Test 7: 配置注册与解析 ----
    console.log('\nTest 7: 配置注册与解析');
    resolver.registerConfig('maxRetries', 3, 'global', 50);
    resolver.registerConfig('maxRetries', 5, 'project', 70);
    resolver.registerConfig('maxRetries', 2, 'user', 90);

    const resolved = resolver.resolveConfig('maxRetries');
    assert(resolved.value === 2, '最高优先级的值生效 (user=2)');
    assert(resolved.source === 'user', '来源为 user');
    assert(resolved.conflicts.length === 2, '有 2 个冲突值');

    // ---- Test 8: 配置合并 ----
    console.log('\nTest 8: 配置合并');
    resolver.registerConfig('settings', { a: 1, b: 2 }, 'base', 50);
    resolver.registerConfig('settings', { b: 3, c: 4 }, 'project', 70);
    const merged = resolver.mergeConfigs('settings');
    assert(merged.a === 1, '基础配置 a=1 保留');
    assert(merged.b === 3, '高优先级 b=3 覆盖');
    assert(merged.c === 4, '高优先级 c=4 新增');

    // ---- Test 9: 能力注册与重叠检测 ----
    console.log('\nTest 9: 能力注册与重叠检测');
    resolver.registerCapability('code_review', 'inspector', { quality: 'high' });
    resolver.registerCapability('code_review', 'supervisor', { quality: 'medium' });
    resolver.registerCapability('code_generation', 'executor');

    const overlaps = resolver.detectCapabilityOverlaps();
    assert(overlaps.length >= 1, '检测到能力重叠');
    const reviewOverlap = overlaps.find(o => o.capability === 'code_review');
    assert(reviewOverlap !== undefined, 'code_review 有重叠');
    assert(reviewOverlap.providers.length === 2, '2 个提供者');

    // ---- Test 10: selectProvider ----
    console.log('\nTest 10: selectProvider');
    const provider = resolver.selectProvider('code_review');
    assert(provider !== null, '找到提供者');
    // supervisor(100) > inspector(90)
    assert(provider.agent === 'supervisor', '最高优先级 supervisor 被选中');
    assert(provider.alternatives.length === 1, '有 1 个备选');

    // 排除 supervisor 后
    const provider2 = resolver.selectProvider('code_review', { excludeAgents: ['supervisor'] });
    assert(provider2.agent === 'inspector', '排除后选择 inspector');

    // 不存在的能力
    const provider3 = resolver.selectProvider('nonexistent');
    assert(provider3 === null, '不存在的能力返回 null');

    // ---- Test 11: resolve — 资源冲突 ----
    console.log('\nTest 11: resolve — 资源冲突');
    const resolution = resolver.resolve({
      type: CONFLICT_TYPES.RESOURCE,
      resource: 'file:/database.sql',
      parties: ['executor', 'inspector']
    });
    assert(resolution.strategy === RESOLUTION_STRATEGIES.PRIORITY, '资源冲突使用 PRIORITY 策略');
    assert(resolution.result.winner !== undefined, '有胜出者');

    // ---- Test 12: resolve — 配置冲突 ----
    console.log('\nTest 12: resolve — 配置冲突');
    const configResolution = resolver.resolve({
      type: CONFLICT_TYPES.CONFIG,
      resource: 'timeout_setting',
      parties: ['global', 'project']
    });
    assert(configResolution.strategy === RESOLUTION_STRATEGIES.MERGE, '配置冲突使用 MERGE 策略');
    assert(configResolution.result.action === 'merge', '操作为 merge');

    // ---- Test 13: resolve — 依赖冲突 ----
    console.log('\nTest 13: resolve — 依赖冲突');
    const depResolution = resolver.resolve({
      type: CONFLICT_TYPES.DEPENDENCY,
      resource: 'shared_lib',
      parties: ['moduleA', 'moduleB']
    });
    assert(depResolution.strategy === RESOLUTION_STRATEGIES.QUEUE, '依赖冲突使用 QUEUE 策略');
    assert(Array.isArray(depResolution.result.queue), '返回排队顺序');

    // ---- Test 14: HUMAN 决策 ----
    console.log('\nTest 14: HUMAN 决策');
    const humanResolution = resolver.resolve({
      type: CONFLICT_TYPES.PRIORITY,
      resource: 'critical_path',
      parties: ['agentA', 'agentB']
    });
    // PRIORITY type 默认使用 priority 策略
    assert(humanResolution.result !== null, '有解决结果');

    // 测试人工决策流程
    const resolver2 = new ConflictResolver({ logger: silentLogger, defaultStrategy: RESOLUTION_STRATEGIES.HUMAN });
    const humanRes = resolver2.resolve({
      type: 'custom',
      resource: 'unknown_conflict',
      parties: ['x', 'y']
    });
    assert(humanRes.result.action === 'await_human', '需要人工决策');
    const pending = resolver2.getPendingDecisions();
    assert(pending.length === 1, '有 1 个待决策');
    const decisionResult = resolver2.submitHumanDecision(pending[0].id, { winner: 'x' });
    assert(decisionResult.success === true, '提交决策成功');
    const pendingAfter = resolver2.getPendingDecisions();
    assert(pendingAfter.length === 0, '决策后无待处理');

    // ---- Test 15: getStats 统计 ----
    console.log('\nTest 15: getStats 统计');
    const stats = resolver.getStats();
    assert(typeof stats === 'object', 'getStats 返回对象');
    assert(stats.totalConflicts > 0, 'totalConflicts > 0');
    assert(typeof stats.byType === 'object', 'byType 存在');
    assert(stats.registeredConfigs > 0, 'registeredConfigs > 0');
    assert(stats.registeredCapabilities > 0, 'registeredCapabilities > 0');

    // ---- Test 16: getConflictLog ----
    console.log('\nTest 16: getConflictLog');
    const log = resolver.getConflictLog();
    assert(Array.isArray(log), 'getConflictLog 返回数组');
    assert(log.length > 0, '有冲突记录');
    assert(log[0].timestamp !== undefined, '记录有时间戳');

    // ---- Test 17: getResourceLocks ----
    console.log('\nTest 17: getResourceLocks');
    resolver.acquireResource('port:3000', 'executor');
    const locks = resolver.getResourceLocks();
    assert(typeof locks === 'object', 'getResourceLocks 返回对象');
    assert(locks['port:3000'] !== undefined, '端口锁存在');
    assert(locks['port:3000'].holder === 'executor', '持有者正确');

    // ---- Test 18: 不存在的配置解析 ----
    console.log('\nTest 18: 不存在的配置解析');
    const noConfig = resolver.resolveConfig('nonexistent_key');
    assert(noConfig.value === undefined, '不存在的配置返回 undefined');
    assert(noConfig.conflicts.length === 0, '无冲突');

  } catch (error) {
    console.log(`\n❌ 测试异常: ${error.message}`);
    console.log(error.stack);
    failed++;
  }

  console.log(`\n========================================`);
  console.log(`测试结果: ${passed} 通过, ${failed} 失败`);
  if (failed === 0) {
    console.log('✅ 所有 ConflictResolver 测试通过！');
  } else {
    console.log('❌ 有测试失败');
    process.exitCode = 1;
  }
}

testConflictResolver();
