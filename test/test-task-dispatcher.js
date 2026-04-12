const TaskDispatcher = require('../src/task-dispatcher');
const AgentRegistry = require('../src/agent-registry');
const TaskAnalyzer = require('../src/task-analyzer');
const TaskDecomposer = require('../src/task-decomposer');

function testTaskDispatcher() {
  console.log('🧪 测试 TaskDispatcher...\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, msg) {
    if (condition) { passed++; console.log(`  ✅ ${msg}`); }
    else { failed++; console.log(`  ❌ ${msg}`); }
  }

  try {
    // 准备依赖
    const registry = new AgentRegistry();
    registry.initializeCoreAgents();
    const analyzer = new TaskAnalyzer();
    const decomposer = new TaskDecomposer();

    // ---- Test 1: 基本实例化 ----
    console.log('\nTest 1: 基本实例化');
    const dispatcher = new TaskDispatcher(registry);
    assert(dispatcher !== null, 'TaskDispatcher 创建成功');
    assert(dispatcher.agentRegistry === registry, '注册表引用正确');

    // ---- Test 2: 分配 Bug 修复任务 ----
    console.log('\nTest 2: 分配 Bug 修复任务');
    const bugAnalysis = analyzer.analyze('修复登录bug');
    const bugDecomp = decomposer.decompose(bugAnalysis);
    const bugAssignment = dispatcher.assign(bugDecomp);
    assert(bugAssignment.totalAssignments === 6, '6 个分配');
    assert(Array.isArray(bugAssignment.assignments), '有分配数组');
    assert(bugAssignment.decomposition === bugDecomp, '保留拆解信息');
    assert(typeof bugAssignment.executionPlan === 'object', '有执行计划');

    // ---- Test 3: 分配结构 ----
    console.log('\nTest 3: 分配结构');
    const a1 = bugAssignment.assignments[0];
    assert(a1.subtask !== undefined, '有子任务');
    assert(a1.executor !== undefined, '有执行器');
    assert(a1.status === 'pending', '状态 pending');
    assert(typeof a1.assignedAt === 'string', '有分配时间');

    // ---- Test 4: 执行器信息 ----
    console.log('\nTest 4: 执行器信息');
    assert(typeof a1.executor.name === 'string', '有执行器名称');
    assert(Array.isArray(a1.executor.capabilities), '有能力列表');
    assert(typeof a1.executor.mode === 'string', '有执行模式');
    assert(typeof a1.executor.config === 'object', '有执行配置');

    // ---- Test 5: 执行器匹配 ----
    console.log('\nTest 5: 执行器匹配');
    // explore 类型子任务 → Explore Agent
    const exploreAssign = bugAssignment.assignments.find(a => a.subtask.type === 'explore');
    assert(exploreAssign.executor.name === 'Explore Agent', 'explore → Explore Agent');

    // code 类型子任务 → General-Purpose Agent
    const codeAssign = bugAssignment.assignments.find(a => a.subtask.type === 'code');
    assert(codeAssign.executor.name === 'General-Purpose Agent', 'code → General-Purpose Agent');

    // test 类型子任务 → Inspector Agent
    const testAssign = bugAssignment.assignments.find(a => a.subtask.type === 'test');
    assert(testAssign.executor.name === 'Inspector Agent', 'test → Inspector Agent');

    // ---- Test 6: 执行模式 (automatic) ----
    console.log('\nTest 6: 执行模式 (automatic)');
    const autoMode = dispatcher.determineExecutionMode({ priority: 'medium' });
    assert(autoMode === 'automatic', '普通任务 → automatic');

    // ---- Test 7: 执行模式 (interactive) ----
    console.log('\nTest 7: 执行模式 (interactive)');
    const interMode = dispatcher.determineExecutionMode({
      constraints: { requiresAuth: true }
    });
    assert(interMode === 'interactive', '需授权 → interactive');

    // ---- Test 8: 执行模式 (supervised) ----
    console.log('\nTest 8: 执行模式 (supervised)');
    const supMode = dispatcher.determineExecutionMode({ priority: 'critical' });
    assert(supMode === 'supervised', 'critical → supervised');

    const coreMode = dispatcher.determineExecutionMode({ involvesCore: true });
    assert(coreMode === 'supervised', 'involvesCore → supervised');

    // ---- Test 9: 执行器配置 ----
    console.log('\nTest 9: 执行器配置');
    const config1 = dispatcher.getExecutorConfig({});
    assert(config1.timeout === 300000, '默认超时 5 分钟');
    assert(config1.maxRetries === 2, '默认重试 2');
    assert(config1.requiresAuth === false, '默认不需授权');
    assert(config1.canRunInParallel === false, '默认不可并行');

    const config2 = dispatcher.getExecutorConfig({
      constraints: {
        timeout: 60000,
        maxRetries: 5,
        requiresAuth: true,
        canRunInParallel: true
      }
    });
    assert(config2.timeout === 60000, '自定义超时');
    assert(config2.maxRetries === 5, '自定义重试');
    assert(config2.requiresAuth === true, '自定义授权');
    assert(config2.canRunInParallel === true, '自定义并行');

    // ---- Test 10: 执行计划结构 ----
    console.log('\nTest 10: 执行计划结构');
    const plan = bugAssignment.executionPlan;
    assert(typeof plan === 'object', '有执行计划');
    assert(Array.isArray(plan.sequential), '有顺序列表');
    assert(Array.isArray(plan.parallel), '有并行列表');

    // ---- Test 11: 功能任务分配 ----
    console.log('\nTest 11: 功能任务分配');
    const featAnalysis = analyzer.analyze('添加用户注册功能');
    const featDecomp = decomposer.decompose(featAnalysis);
    const featAssign = dispatcher.assign(featDecomp);
    assert(featAssign.totalAssignments === 6, '功能任务 6 个分配');

    // analyze 类型 → Plan Agent
    const analyzeAssign = featAssign.assignments.find(a => a.subtask.type === 'analyze');
    assert(analyzeAssign.executor.name === 'Plan Agent', 'analyze → Plan Agent');

    // plan 类型 → Plan Agent
    const planAssign = featAssign.assignments.find(a => a.subtask.type === 'plan');
    assert(planAssign.executor.name === 'Plan Agent', 'plan → Plan Agent');

    // write 类型 → General-Purpose Agent
    const writeAssign = featAssign.assignments.find(a => a.subtask.type === 'write');
    assert(writeAssign.executor.name === 'General-Purpose Agent', 'write → General-Purpose Agent');

    // ---- Test 12: 安全任务分配 ----
    console.log('\nTest 12: 安全任务分配');
    const secAnalysis = analyzer.analyze('存在安全漏洞需要处理');
    const secDecomp = decomposer.decompose(secAnalysis);
    const secAssign = dispatcher.assign(secDecomp);
    assert(secAssign.totalAssignments === 5, '安全任务 5 个分配');

    // critical + involvesCore 应该是 supervised 或 interactive
    const secFirst = secAssign.assignments[0];
    assert(
      secFirst.executor.mode === 'supervised' || secFirst.executor.mode === 'interactive',
      '安全评估为 supervised/interactive'
    );

    // ---- Test 13: 执行计划 - 并行检测 ----
    console.log('\nTest 13: 执行计划 - 并行检测');
    // 通用策略第一个子任务无依赖，但只有 1 个无依赖的，不会放入 parallel
    const genAnalysis = analyzer.analyze('做一些事情');
    const genDecomp = decomposer.decompose(genAnalysis);
    const genAssign = dispatcher.assign(genDecomp);
    const genPlan = genAssign.executionPlan;
    // 只有第一个子任务无依赖 (1个)，所以 parallel 应该为空
    assert(genPlan.parallel.length === 0, '1 个无依赖 → 不并行');
    assert(genPlan.sequential.length === 3, '3 个顺序任务');

    // ---- Test 14: 空任务拆解 ----
    console.log('\nTest 14: 空任务拆解分配');
    const emptyDecomp = { subtasks: [] };
    const emptyAssign = dispatcher.assign(emptyDecomp);
    assert(emptyAssign.totalAssignments === 0, '空拆解 → 0 分配');
    assert(emptyAssign.assignments.length === 0, '空分配数组');

    // ---- Test 15: selectExecutor 方法 ----
    console.log('\nTest 15: selectExecutor 方法');
    const exec1 = dispatcher.selectExecutor({ type: 'explore' }, {});
    assert(exec1.name === 'Explore Agent', 'selectExecutor explore');
    const exec2 = dispatcher.selectExecutor({ type: 'review' }, {});
    assert(exec2.name === 'Inspector Agent', 'selectExecutor review');

  } catch (error) {
    console.log(`\n❌ 测试异常: ${error.message}`);
    console.log(error.stack);
    failed++;
  }

  console.log(`\n========================================`);
  console.log(`测试结果: ${passed} 通过, ${failed} 失败`);
  if (failed === 0) {
    console.log('✅ 所有 TaskDispatcher 测试通过！');
  } else {
    console.log('❌ 有测试失败');
    process.exitCode = 1;
  }
}

testTaskDispatcher();
