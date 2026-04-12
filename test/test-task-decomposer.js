const TaskDecomposer = require('../src/task-decomposer');
const TaskAnalyzer = require('../src/task-analyzer');

function testTaskDecomposer() {
  console.log('🧪 测试 TaskDecomposer...\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, msg) {
    if (condition) { passed++; console.log(`  ✅ ${msg}`); }
    else { failed++; console.log(`  ❌ ${msg}`); }
  }

  try {
    const analyzer = new TaskAnalyzer();
    const decomposer = new TaskDecomposer();

    // ---- Test 1: 基本实例化 ----
    console.log('\nTest 1: 基本实例化');
    assert(decomposer !== null, 'TaskDecomposer 创建成功');
    assert(typeof decomposer.decompositionStrategies === 'object', '策略已初始化');
    assert(Object.keys(decomposer.decompositionStrategies).length === 7, '7 种策略');

    // ---- Test 2: Bug修复策略拆解 ----
    console.log('\nTest 2: Bug修复策略拆解');
    const bugAnalysis = analyzer.analyze('修复登录bug');
    const bugDecomp = decomposer.decompose(bugAnalysis);
    assert(bugDecomp.strategy === 'Bug修复策略', '使用 Bug修复策略');
    assert(bugDecomp.subtasks.length === 6, '6 个子任务');
    assert(bugDecomp.totalSubtasks === 6, 'totalSubtasks = 6');
    assert(bugDecomp.subtasks[0].name === '复现Bug', '第 1 步: 复现');
    assert(bugDecomp.subtasks[5].name === '测试验证', '第 6 步: 测试');
    assert(typeof bugDecomp.estimatedTotalTime === 'string', '有时间估算');

    // ---- Test 3: 功能开发策略 ----
    console.log('\nTest 3: 功能开发策略');
    const featAnalysis = analyzer.analyze('添加用户注册功能');
    const featDecomp = decomposer.decompose(featAnalysis);
    assert(featDecomp.strategy === '功能开发策略', '使用 功能开发策略');
    assert(featDecomp.subtasks.length === 6, '6 个子任务');
    assert(featDecomp.subtasks[0].name === '需求分析', '第 1 步: 需求分析');
    assert(featDecomp.subtasks[3].name === '核心逻辑实现', '第 4 步: 核心逻辑');

    // ---- Test 4: 重构策略 ----
    console.log('\nTest 4: 重构策略');
    const refactorAnalysis = analyzer.analyze('重构模块结构');
    const refactorDecomp = decomposer.decompose(refactorAnalysis);
    assert(refactorDecomp.strategy === '重构策略', '使用 重构策略');
    assert(refactorDecomp.subtasks.length === 6, '6 个子任务');

    // ---- Test 5: 文档策略 ----
    console.log('\nTest 5: 文档策略');
    const docAnalysis = analyzer.analyze('编写API文档');
    const docDecomp = decomposer.decompose(docAnalysis);
    assert(docDecomp.strategy === '文档编写策略', '使用 文档编写策略');
    assert(docDecomp.subtasks.length === 5, '5 个子任务');

    // ---- Test 6: 测试策略 ----
    console.log('\nTest 6: 测试策略');
    const testAnalysis = analyzer.analyze('编写单元测试');
    const testDecomp = decomposer.decompose(testAnalysis);
    assert(testDecomp.strategy === '测试策略', '使用 测试策略');
    assert(testDecomp.subtasks.length === 4, '4 个子任务');

    // ---- Test 7: 安全修复策略 ----
    console.log('\nTest 7: 安全修复策略');
    const secAnalysis = analyzer.analyze('存在安全漏洞需要处理');
    const secDecomp = decomposer.decompose(secAnalysis);
    assert(secDecomp.strategy === '安全修复策略', '使用 安全修复策略');
    assert(secDecomp.subtasks.length === 5, '5 个子任务');
    // 安全任务有核心系统标记
    assert(secDecomp.subtasks[0].involvesCore === true, '安全评估涉及核心');

    // ---- Test 8: 通用策略 ----
    console.log('\nTest 8: 通用策略');
    const genAnalysis = analyzer.analyze('做一些随机事情');
    const genDecomp = decomposer.decompose(genAnalysis);
    assert(genDecomp.strategy === '通用策略', '使用 通用策略');
    assert(genDecomp.subtasks.length === 4, '4 个子任务');

    // ---- Test 9: 依赖关系 ----
    console.log('\nTest 9: 依赖关系');
    const deps = bugDecomp.subtasks;
    assert(deps[0].dependencies.length === 0, '第 1 个子任务无依赖');
    assert(deps[1].dependencies.length === 1, '第 2 个子任务依赖 1 个');
    assert(deps[1].dependencies[0] === 'bug_1', '第 2 个依赖 bug_1');
    assert(deps[5].dependencies.length === 1, '最后一个有 1 个依赖');
    assert(deps[5].dependencies[0] === 'bug_5', '最后一个依赖 bug_5');

    // ---- Test 10: 约束条件 (基础) ----
    console.log('\nTest 10: 约束条件 (基础)');
    const constraints = genDecomp.subtasks[0].constraints;
    assert(constraints !== undefined, '有约束对象');
    assert(typeof constraints.maxRetries === 'number', '有重试限制');
    assert(constraints.maxRetries === 2, '默认重试 2');
    assert(typeof constraints.timeout === 'number', '有超时');
    assert(constraints.timeout === 300000, '默认超时 5 分钟');
    assert(genDecomp.subtasks[0].constraints.canRunInParallel === true, '第 1 个可并行');
    assert(genDecomp.subtasks[1].constraints.canRunInParallel === false, '第 2 个不可并行');

    // ---- Test 11: 约束条件 (高风险) ----
    console.log('\nTest 11: 约束条件 (高风险)');
    // 安全任务有高风险，应自动设置 requiresAuth
    // 注: requiresReview 仅在 analysis.risks 有 high level 时设置
    const secConstraints = secDecomp.subtasks[0].constraints;
    assert(secConstraints.requiresAuth === true, '核心系统标记需授权');

    // ---- Test 12: 约束条件 (核心系统) ----
    console.log('\nTest 12: 约束条件 (核心系统)');
    // involvesCore = true 的子任务需要授权
    const coreTask = secDecomp.subtasks.find(t => t.involvesCore === true);
    assert(coreTask !== undefined, '有核心系统子任务');
    assert(coreTask.constraints.requiresAuth === true, '核心系统需授权');

    // ---- Test 13: 时间估算 (分钟) ----
    console.log('\nTest 13: 时间估算');
    const shortTime = decomposer.estimateTotalTime([
      { estimatedTime: 10 },
      { estimatedTime: 20 }
    ]);
    assert(shortTime === '30分钟', '30分钟');

    const exactHour = decomposer.estimateTotalTime([
      { estimatedTime: 30 },
      { estimatedTime: 30 }
    ]);
    assert(exactHour === '1小时', '1小时');

    const mixedTime = decomposer.estimateTotalTime([
      { estimatedTime: 30 },
      { estimatedTime: 45 }
    ]);
    assert(mixedTime === '1小时15分钟', '1小时15分钟');

    // ---- Test 14: 时间估算 (默认) ----
    console.log('\nTest 14: 时间估算 (默认值)');
    const defaultTime = decomposer.estimateTotalTime([
      {}, {}, {}  // 无 estimatedTime，默认 5 分钟
    ]);
    assert(defaultTime === '15分钟', '3 个默认 → 15分钟');

    // ---- Test 15: selectStrategy ----
    console.log('\nTest 15: 策略选择');
    const s1 = decomposer.selectStrategy({ taskType: 'bug_fix' });
    assert(s1.name === 'Bug修复策略', 'bug_fix → Bug修复策略');
    const s2 = decomposer.selectStrategy({ taskType: 'feature' });
    assert(s2.name === '功能开发策略', 'feature → 功能开发策略');
    const s3 = decomposer.selectStrategy({ taskType: 'unknown_type' });
    assert(s3.name === '通用策略', '未知类型 → 通用策略');

    // ---- Test 16: decompose 返回结构完整 ----
    console.log('\nTest 16: 返回结构完整');
    const result = decomposer.decompose(featAnalysis);
    assert(result.analysis === featAnalysis, '包含原始分析');
    assert(typeof result.strategy === 'string', '有策略名');
    assert(Array.isArray(result.subtasks), '有子任务数组');
    assert(typeof result.totalSubtasks === 'number', '有子任务总数');
    assert(typeof result.estimatedTotalTime === 'string', '有估算时间');

    // ---- Test 17: 子任务字段完整性 ----
    console.log('\nTest 17: 子任务字段完整性');
    const subtask = featDecomp.subtasks[0];
    assert(typeof subtask.id === 'string', '有 id');
    assert(typeof subtask.name === 'string', '有 name');
    assert(typeof subtask.description === 'string', '有 description');
    assert(typeof subtask.type === 'string', '有 type');
    assert(typeof subtask.estimatedTime === 'number', '有 estimatedTime');
    assert(typeof subtask.priority === 'string', '有 priority');
    assert(Array.isArray(subtask.dependencies), '有 dependencies');
    assert(typeof subtask.constraints === 'object', '有 constraints');

    // ---- Test 18: 所有策略产出有效子任务 ----
    console.log('\nTest 18: 所有策略产出有效子任务');
    const types = ['bug_fix', 'feature', 'refactor', 'documentation', 'testing', 'security', 'general'];
    let allValid = true;
    for (const type of types) {
      const analysis = { taskType: type, risks: [] };
      const result = decomposer.decompose(analysis);
      if (!result.subtasks || result.subtasks.length === 0) {
        allValid = false;
        console.log(`    ❌ ${type} 策略无子任务`);
      }
      for (const st of result.subtasks) {
        if (!st.id || !st.name) {
          allValid = false;
          console.log(`    ❌ ${type} 策略子任务缺字段`);
        }
      }
    }
    assert(allValid, '所有 7 策略产出有效子任务');

  } catch (error) {
    console.log(`\n❌ 测试异常: ${error.message}`);
    console.log(error.stack);
    failed++;
  }

  console.log(`\n========================================`);
  console.log(`测试结果: ${passed} 通过, ${failed} 失败`);
  if (failed === 0) {
    console.log('✅ 所有 TaskDecomposer 测试通过！');
  } else {
    console.log('❌ 有测试失败');
    process.exitCode = 1;
  }
}

testTaskDecomposer();
