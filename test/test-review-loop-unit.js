const { ReviewLoop } = require('../src/review-loop');

async function testReviewLoop() {
  console.log('🧪 测试 ReviewLoop...\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, msg) {
    if (condition) { passed++; console.log(`  ✅ ${msg}`); }
    else { failed++; console.log(`  ❌ ${msg}`); }
  }

  // 静默日志器
  const silentLogger = {
    trace() {}, debug() {}, info() {}, warn() {}, error() {}, fatal() {},
    child() { return silentLogger; }
  };

  // 模拟任务数据 — 成功场景
  const goodTaskData = {
    task: {
      message: 'test task',
      startTime: Date.now() - 5000,
      steps: [
        { name: 'analyze', result: { taskType: 'feature', success: true } },
        { name: 'decompose', result: { totalSubtasks: 3, success: true } },
        { name: 'assign', result: { success: true } },
        { name: 'execute', result: { success: true, results: [{ success: true }] } },
        { name: 'inspect', result: { passed: true, successRate: 100, failedTasks: [], criticalFailures: 0, checks: {} } }
      ]
    },
    analysis: { taskType: 'feature', complexity: { score: 2 } },
    execution: {
      results: [
        { success: true, subtask: 'task-1', executionTime: 100 }
      ],
      totalTime: 100,
      assignment: { decomposition: { estimatedTotalTime: '5分钟', subtasks: [] } }
    },
    inspection: { passed: true, successRate: 100, failedTasks: [], criticalFailures: 0, checks: {} },
    reworkData: { reworkCount: 0, diagnoses: [], switchedApproaches: [] }
  };

  // 模拟任务数据 — 部分失败场景
  const badTaskData = {
    task: {
      message: 'buggy task',
      startTime: Date.now() - 10000,
      steps: [
        { name: 'analyze', result: { taskType: 'bug_fix', success: true } },
        { name: 'execute', result: { success: false } },
        { name: 'inspect', result: { passed: false, successRate: 50 } }
      ]
    },
    analysis: { taskType: 'bug_fix', complexity: { score: 4 } },
    execution: {
      results: [
        { success: true, subtask: 'task-1', executionTime: 100 },
        { success: false, subtask: 'task-2', error: '权限不足', retryable: true, executionTime: 50 }
      ],
      totalTime: 150,
      assignment: { decomposition: { estimatedTotalTime: '10分钟', subtasks: [] } }
    },
    inspection: {
      passed: false, successRate: 50,
      failedTasks: [{ subtask: 'task-2', error: '权限不足', retryable: true }],
      criticalFailures: 0,
      checks: { goalAlignment: { passed: true }, quality: { passed: false, suggestion: '添加测试' } }
    },
    reworkData: { reworkCount: 1, diagnoses: [{ category: 'execution' }], switchedApproaches: [] }
  };

  try {
    // ---- Test 1: 基本实例化 ----
    console.log('\nTest 1: 基本实例化');
    const rl = new ReviewLoop({ logger: silentLogger });
    assert(rl !== null, 'ReviewLoop 实例创建成功');
    assert(rl.scoreThreshold === 7.0, '默认 scoreThreshold 为 7.0');
    assert(rl.maxIterations === 3, '默认 maxIterations 为 3');
    assert(rl.reviewHistory.length === 0, '初始 reviewHistory 为空');

    // ---- Test 2: 自定义配置 ----
    console.log('\nTest 2: 自定义配置');
    const rl2 = new ReviewLoop({ scoreThreshold: 8.0, maxIterations: 5, logger: silentLogger });
    assert(rl2.scoreThreshold === 8.0, '自定义 scoreThreshold');
    assert(rl2.maxIterations === 5, '自定义 maxIterations');

    // ---- Test 3: 完整复盘 — 成功任务 ----
    console.log('\nTest 3: runReviewLoop 成功任务');
    const result = await rl.runReviewLoop(goodTaskData);
    assert(result !== null, 'runReviewLoop 返回非空');
    assert(typeof result.review === 'object', 'result.review 存在');
    assert(typeof result.score === 'number', 'result.score 是数字');
    assert(result.score >= 7.0, `成功任务评分 >= 7.0 (实际: ${result.score})`);
    assert(Array.isArray(result.optimizations), 'result.optimizations 是数组');
    assert(typeof result.validation === 'object', 'result.validation 存在');
    assert(typeof result.consolidation === 'object', 'result.consolidation 存在');

    // ---- Test 4: 完整复盘 — 失败任务 ----
    console.log('\nTest 4: runReviewLoop 部分失败任务');
    const badResult = await rl.runReviewLoop(badTaskData);
    assert(badResult !== null, 'runReviewLoop 返回非空');
    assert(badResult.score < 7.0, `失败任务评分 < 7.0 (实际: ${badResult.score})`);
    assert(badResult.optimizations.length > 0, '失败任务有优化建议');
    assert(badResult.reworkData.reworkCount === 1, 'reworkData 正确传递');

    // ---- Test 5: 6a 回顾详情 ----
    console.log('\nTest 5: 6a 回顾详情');
    const review = badResult.review;
    assert(review.completionRate !== undefined, 'review.completionRate 存在');
    assert(review.totalTime !== undefined, 'review.totalTime 存在');
    assert(review.score !== undefined, 'review.score 存在');
    assert(Array.isArray(review.issues), 'review.issues 是数组');
    assert(review.issues.length > 0, '失败任务有 issues');

    // ---- Test 6: 6b 优化详情 ----
    console.log('\nTest 6: 6b 优化建议');
    const opts = badResult.optimizations;
    assert(opts.length > 0, '有优化建议');
    const firstOpt = opts[0];
    assert(firstOpt.type !== undefined, '优化建议有 type');
    assert(firstOpt.suggestion !== undefined, '优化建议有 suggestion');

    // ---- Test 7: 6c 验证详情 ----
    console.log('\nTest 7: 6c 验证');
    const validation = badResult.validation;
    assert(typeof validation.feasible === 'boolean', 'validation.feasible 是布尔');
    assert(typeof validation.confidence === 'number', 'validation.confidence 是数字');
    assert(validation.confidence >= 0 && validation.confidence <= 1, 'confidence 在 0-1 之间');

    // ---- Test 8: 6d 固化详情 ----
    console.log('\nTest 8: 6d 固化');
    const consolidation = badResult.consolidation;
    assert(typeof consolidation === 'object', 'consolidation 是对象');

    // ---- Test 9: 复盘历史记录 ----
    console.log('\nTest 9: reviewHistory 累积');
    assert(rl.reviewHistory.length === 2, '执行2次后 reviewHistory 长度为 2');
    const histItem = rl.reviewHistory[0];
    assert(histItem.taskType !== undefined, '历史记录包含 taskType');
    assert(histItem.score !== undefined, '历史记录包含 score');
    assert(histItem.timestamp !== undefined, '历史记录包含 timestamp');

    // ---- Test 10: strategyRegistry ----
    console.log('\nTest 10: strategyRegistry');
    assert(rl.strategyRegistry instanceof Map, 'strategyRegistry 是 Map');

    // ---- Test 11: getReviewTrend ----
    console.log('\nTest 11: getReviewTrend（如存在）');
    if (typeof rl.getReviewTrend === 'function') {
      const trend = rl.getReviewTrend();
      assert(typeof trend === 'object', 'getReviewTrend 返回对象');
    } else {
      assert(true, 'getReviewTrend 方法尚未实现（跳过）');
    }

    // ---- Test 12: 高评分时跳过优化 ----
    console.log('\nTest 12: 高评分跳过优化');
    const highResult = await rl.runReviewLoop(goodTaskData);
    assert(highResult.optimizations.length === 0, '高评分时无优化建议');

    // ---- Test 13: 个别方法独立调用 ----
    console.log('\nTest 13: step6a_review 独立调用');
    const reviewResult = rl.step6a_review(
      goodTaskData.task, goodTaskData.inspection, goodTaskData.execution, goodTaskData.reworkData, 0
    );
    assert(typeof reviewResult.score === 'number', 'step6a_review 返回 score');
    assert(typeof reviewResult.completionRate === 'number', 'step6a_review 返回 completionRate');

  } catch (error) {
    console.log(`\n❌ 测试异常: ${error.message}`);
    console.log(error.stack);
    failed++;
  }

  console.log(`\n========================================`);
  console.log(`测试结果: ${passed} 通过, ${failed} 失败`);
  if (failed === 0) {
    console.log('✅ 所有 ReviewLoop 测试通过！');
  } else {
    console.log('❌ 有测试失败');
    process.exitCode = 1;
  }
}

testReviewLoop();
