const AgentRegistry = require('../src/agent-registry');

function testAgentRegistry() {
  console.log('🧪 测试 AgentRegistry...\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, msg) {
    if (condition) { passed++; console.log(`  ✅ ${msg}`); }
    else { failed++; console.log(`  ❌ ${msg}`); }
  }

  try {
    // ---- Test 1: 基本实例化 ----
    console.log('\nTest 1: 基本实例化');
    const registry = new AgentRegistry();
    assert(registry !== null, 'AgentRegistry 创建成功');
    assert(registry.agents instanceof Map, 'agents 是 Map');
    assert(registry.capabilities instanceof Map, 'capabilities 是 Map');
    assert(registry.initialized === false, '未初始化');
    assert(registry.size() === 0, '初始大小 0');

    // ---- Test 2: 注册 Agent ----
    console.log('\nTest 2: 注册 Agent');
    const result = registry.register('test-agent', {
      name: 'Test Agent',
      role: 'tester',
      capabilities: ['testing', 'debugging']
    });
    assert(result === true, '注册成功');
    assert(registry.size() === 1, '大小变为 1');
    assert(registry.has('test-agent') === true, 'has 返回 true');

    // ---- Test 3: 注册验证 ----
    console.log('\nTest 3: 注册验证');
    let threw = false;
    try {
      registry.register('bad-agent', { name: 'Bad' }); // 缺 role
    } catch (e) {
      threw = true;
      assert(e.message.includes('缺少必需字段'), '错误信息正确');
    }
    assert(threw, '缺少 role 抛出异常');

    threw = false;
    try {
      registry.register('bad2', { role: 'worker' }); // 缺 name
    } catch (e) {
      threw = true;
    }
    assert(threw, '缺少 name 抛出异常');

    // ---- Test 4: 获取 Agent ----
    console.log('\nTest 4: 获取 Agent');
    const agent = registry.get('test-agent');
    assert(agent !== undefined, '获取成功');
    assert(agent.name === 'Test Agent', '名称正确');
    assert(agent.role === 'tester', '角色正确');
    assert(agent.id === 'test-agent', 'ID 正确');
    assert(typeof agent.registeredAt === 'string', '有注册时间');
    assert(Array.isArray(agent.subAgents), '有子 Agent 列表');

    assert(registry.get('nonexistent') === undefined, '不存在返回 undefined');

    // ---- Test 5: 列出所有 Agent ----
    console.log('\nTest 5: 列出所有 Agent');
    registry.register('agent-2', { name: 'Agent 2', role: 'worker' });
    const list = registry.list();
    assert(Array.isArray(list), '返回数组');
    assert(list.length === 2, '2 个 Agent');

    // ---- Test 6: 能力索引 ----
    console.log('\nTest 6: 能力索引');
    const caps = registry.listCapabilities();
    assert(Array.isArray(caps), '能力列表是数组');
    assert(caps.includes('testing'), '包含 testing');
    assert(caps.includes('debugging'), '包含 debugging');

    // ---- Test 7: 按能力查找 ----
    console.log('\nTest 7: 按能力查找');
    const found = registry.findByCapability('testing');
    assert(found.length === 1, '找到 1 个');
    assert(found[0].name === 'Test Agent', '名称正确');

    const notFound = registry.findByCapability('nonexistent');
    assert(notFound.length === 0, '不存在返回空数组');

    // ---- Test 8: 按角色查找 ----
    console.log('\nTest 8: 按角色查找');
    const byRole = registry.findByRole('tester');
    assert(byRole !== null, '找到 tester');
    assert(byRole.name === 'Test Agent', '名称正确');

    const noRole = registry.findByRole('nonexistent');
    assert(noRole === null, '不存在返回 null');

    // ---- Test 9: 初始化核心 Agent ----
    console.log('\nTest 9: 初始化核心 Agent');
    const coreRegistry = new AgentRegistry();
    const coreCount = coreRegistry.initializeCoreAgents();
    assert(coreCount === 5, '5 个核心 Agent');
    assert(coreRegistry.initialized === true, '标记已初始化');
    assert(coreRegistry.has('supervisor'), '有 supervisor');
    assert(coreRegistry.has('explore'), '有 explore');
    assert(coreRegistry.has('plan'), '有 plan');
    assert(coreRegistry.has('general'), '有 general');
    assert(coreRegistry.has('inspector'), '有 inspector');

    // ---- Test 10: 核心 Agent 角色 ----
    console.log('\nTest 10: 核心 Agent 角色');
    const sup = coreRegistry.get('supervisor');
    assert(sup.role === 'CEO', 'supervisor 是 CEO');
    const exp = coreRegistry.get('explore');
    assert(exp.role === '总监1', 'explore 是 总监1');
    const pln = coreRegistry.get('plan');
    assert(pln.role === '总监2', 'plan 是 总监2');
    const gen = coreRegistry.get('general');
    assert(gen.role === '总监3', 'general 是 总监3');
    const ins = coreRegistry.get('inspector');
    assert(ins.role === '总监4', 'inspector 是 总监4');

    // ---- Test 11: 核心 Agent 能力 ----
    console.log('\nTest 11: 核心 Agent 能力');
    assert(sup.capabilities.includes('analyze'), 'supervisor 有 analyze');
    assert(sup.capabilities.includes('dispatch'), 'supervisor 有 dispatch');
    assert(exp.capabilities.includes('file_search'), 'explore 有 file_search');
    assert(pln.capabilities.includes('architecture_design'), 'plan 有 architecture_design');
    assert(gen.capabilities.includes('code_writing'), 'general 有 code_writing');
    assert(ins.capabilities.includes('code_review'), 'inspector 有 code_review');

    // ---- Test 12: matchBestAgent (类型匹配) ----
    console.log('\nTest 12: matchBestAgent (类型匹配)');
    const exploreMatch = coreRegistry.matchBestAgent({ type: 'explore' });
    assert(exploreMatch.name === 'Explore Agent', 'explore → Explore Agent');

    const codeMatch = coreRegistry.matchBestAgent({ type: 'code' });
    assert(codeMatch.name === 'General-Purpose Agent', 'code → General-Purpose Agent');

    const testMatch = coreRegistry.matchBestAgent({ type: 'test' });
    assert(testMatch.name === 'Inspector Agent', 'test → Inspector Agent');

    const planMatch = coreRegistry.matchBestAgent({ type: 'plan' });
    assert(planMatch.name === 'Plan Agent', 'plan → Plan Agent');

    const reviewMatch = coreRegistry.matchBestAgent({ type: 'review' });
    assert(reviewMatch.name === 'Inspector Agent', 'review → Inspector Agent');

    // ---- Test 13: matchBestAgent (能力匹配) ----
    console.log('\nTest 13: matchBestAgent (能力匹配)');
    const capMatch = coreRegistry.matchBestAgent({ capability: 'security_scan' });
    assert(capMatch.name === 'Inspector Agent', 'security_scan → Inspector Agent');

    // ---- Test 14: matchBestAgent (默认) ----
    console.log('\nTest 14: matchBestAgent (默认)');
    const defaultMatch = coreRegistry.matchBestAgent({});
    assert(defaultMatch.name === 'General-Purpose Agent', '空任务 → General-Purpose Agent');

    // ---- Test 15: selectExecutor (兼容接口) ----
    console.log('\nTest 15: selectExecutor (兼容接口)');
    const executor = coreRegistry.selectExecutor({ type: 'code' });
    assert(executor.name === 'General-Purpose Agent', 'selectExecutor 正确');

    // ---- Test 16: 子 Agent 注册 ----
    console.log('\nTest 16: 子 Agent 注册');
    const subResult = coreRegistry.registerSubAgent('general', {
      name: 'File Writer',
      capability: 'file_writing'
    });
    assert(subResult === true, '子 Agent 注册成功');
    const generalAgent = coreRegistry.get('general');
    assert(generalAgent.subAgents.length === 1, '1 个子 Agent');
    assert(generalAgent.subAgents[0].name === 'File Writer', '子 Agent 名称正确');

    // ---- Test 17: 子 Agent 验证 ----
    console.log('\nTest 17: 子 Agent 验证');
    threw = false;
    try {
      coreRegistry.registerSubAgent('nonexistent', { name: 'Bad', capability: 'x' });
    } catch (e) {
      threw = true;
      assert(e.message.includes('不存在'), '父不存在错误');
    }
    assert(threw, '父不存在抛出异常');

    threw = false;
    try {
      coreRegistry.registerSubAgent('general', { name: 'Bad' }); // 缺 capability
    } catch (e) {
      threw = true;
      assert(e.message.includes('缺少必需字段'), '缺字段错误');
    }
    assert(threw, '缺字段抛出异常');

    // ---- Test 18: 列出子 Agent ----
    console.log('\nTest 18: 列出子 Agent');
    const subs = coreRegistry.listSubAgents('general');
    assert(subs.length === 1, '1 个子 Agent');
    assert(subs[0].name === 'File Writer', '子 Agent 正确');

    const noSubs = coreRegistry.listSubAgents('nonexistent');
    assert(noSubs.length === 0, '不存在父 → 空列表');

    const emptySubs = coreRegistry.listSubAgents('explore');
    assert(emptySubs.length === 0, '无子 Agent → 空列表');

    // ---- Test 19: 查找子 Agent ----
    console.log('\nTest 19: 查找子 Agent');
    const foundSub = coreRegistry.findSubAgent('general', 'file_writing');
    assert(foundSub !== null, '找到子 Agent');
    assert(foundSub.name === 'File Writer', '名称正确');

    const noSub = coreRegistry.findSubAgent('general', 'nonexistent');
    assert(noSub === null, '不存在返回 null');

    // ---- Test 20: 多能力 Agent ----
    console.log('\nTest 20: 多能力 Agent');
    const multiReg = new AgentRegistry();
    multiReg.register('multi', {
      name: 'Multi Agent',
      role: 'multi',
      capabilities: ['cap_a', 'cap_b', 'cap_c']
    });
    assert(multiReg.findByCapability('cap_a').length === 1, 'cap_a → 1');
    assert(multiReg.findByCapability('cap_b').length === 1, 'cap_b → 1');
    assert(multiReg.findByCapability('cap_c').length === 1, 'cap_c → 1');
    assert(multiReg.listCapabilities().length === 3, '3 个能力');

    // ---- Test 21: 多 Agent 共享能力 ----
    console.log('\nTest 21: 多 Agent 共享能力');
    multiReg.register('shared', {
      name: 'Shared Agent',
      role: 'shared',
      capabilities: ['cap_a', 'shared_cap']
    });
    const sharedResult = multiReg.findByCapability('cap_a');
    assert(sharedResult.length === 2, '2 个 Agent 共享 cap_a');

  } catch (error) {
    console.log(`\n❌ 测试异常: ${error.message}`);
    console.log(error.stack);
    failed++;
  }

  console.log(`\n========================================`);
  console.log(`测试结果: ${passed} 通过, ${failed} 失败`);
  if (failed === 0) {
    console.log('✅ 所有 AgentRegistry 测试通过！');
  } else {
    console.log('❌ 有测试失败');
    process.exitCode = 1;
  }
}

testAgentRegistry();
