const { TokenTracker, MODEL_PRICING, BUDGET_LEVELS, ALERT_THRESHOLDS } = require('../src/token-tracker');

async function testTokenTracker() {
  console.log('🧪 测试 TokenTracker...\n');

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
    // ---- Test 1: 常量 ----
    console.log('\nTest 1: 常量');
    assert(typeof MODEL_PRICING === 'object', 'MODEL_PRICING 已导出');
    assert(MODEL_PRICING['claude-sonnet'] !== undefined, 'claude-sonnet 定价存在');
    assert(MODEL_PRICING['default'] !== undefined, 'default 定价存在');
    assert(typeof BUDGET_LEVELS === 'object', 'BUDGET_LEVELS 已导出');
    assert(BUDGET_LEVELS.TASK === 'task', 'BUDGET_LEVELS.TASK');
    assert(BUDGET_LEVELS.SESSION === 'session', 'BUDGET_LEVELS.SESSION');
    assert(typeof ALERT_THRESHOLDS === 'object', 'ALERT_THRESHOLDS 已导出');
    assert(ALERT_THRESHOLDS.WARNING === 0.8, 'WARNING 阈值 80%');

    // ---- Test 2: 基本实例化 ----
    console.log('\nTest 2: 基本实例化');
    const tracker = new TokenTracker({ logger: silentLogger });
    assert(tracker !== null, 'TokenTracker 实例创建成功');

    // ---- Test 3: recordUsage — 基础记录 ----
    console.log('\nTest 3: recordUsage 基础记录');
    const result = tracker.recordUsage({
      model: 'claude-sonnet',
      inputTokens: 1000,
      outputTokens: 500,
      taskType: 'feature',
      taskId: 'task-1'
    });
    assert(typeof result.cost === 'number', 'recordUsage 返回 cost');
    assert(result.cost > 0, 'cost > 0');
    assert(Array.isArray(result.alerts), 'recordUsage 返回 alerts');
    assert(result.blocked === false, '无预算限制时 blocked 为 false');

    // 验证成本计算: 1000/1000 * 0.003 + 500/1000 * 0.015 = 0.003 + 0.0075 = 0.0105
    assert(Math.abs(result.cost - 0.0105) < 0.001, `成本计算正确 (${result.cost.toFixed(6)} ≈ 0.0105)`);

    // ---- Test 4: getStats ----
    console.log('\nTest 4: getStats 统计');
    const stats = tracker.getStats();
    assert(typeof stats === 'object', 'getStats 返回对象');
    assert(stats.task.calls === 1, 'task.calls = 1');
    assert(stats.task.inputTokens === 1000, 'task.inputTokens = 1000');
    assert(stats.task.outputTokens === 500, 'task.outputTokens = 500');
    assert(stats.session.calls === 1, 'session.calls = 1');
    assert(stats.daily.calls === 1, 'daily.calls = 1');
    assert(stats.monthly.calls === 1, 'monthly.calls = 1');

    // ---- Test 5: 多次记录累积 ----
    console.log('\nTest 5: 多次记录累积');
    tracker.recordUsage({
      model: 'claude-haiku',
      inputTokens: 2000,
      outputTokens: 1000,
      taskType: 'bug_fix'
    });
    const stats2 = tracker.getStats();
    assert(stats2.task.calls === 2, '累积后 task.calls = 2');
    assert(stats2.task.totalTokens === 4500, '累积后 totalTokens = 4500');
    assert(stats2.session.calls === 2, '累积后 session.calls = 2');

    // ---- Test 6: 预算告警 ----
    console.log('\nTest 6: 预算告警');
    let alertReceived = null;
    const budgetTracker = new TokenTracker({
      logger: silentLogger,
      budgets: { task: 0.01 },  // 0.01 USD 预算
      onAlert: (alert) => { alertReceived = alert; }
    });

    // 先用 80% 预算
    budgetTracker.recordUsage({
      model: 'claude-sonnet', inputTokens: 2000, outputTokens: 500
    });
    // 成本约 0.0135，> 0.01
    assert(alertReceived !== null, '超出预算触发告警');
    assert(alertReceived.level === 'exceeded', `告警级别为 exceeded (实际: ${alertReceived?.level})`);

    // ---- Test 7: checkBudget 预算前检查 ----
    console.log('\nTest 7: checkBudget 预算前检查');
    const budgetCheck = budgetTracker.checkBudget(5000, 'claude-sonnet');
    assert(typeof budgetCheck === 'object', 'checkBudget 返回对象');
    assert(typeof budgetCheck.allowed === 'boolean', 'checkBudget.allowed 是布尔');

    // ---- Test 8: enforceHard 硬性阻止 ----
    console.log('\nTest 8: enforceHard 硬性阻止');
    const hardTracker = new TokenTracker({
      logger: silentLogger,
      budgets: { task: 0.001 },
      enforceHard: true
    });
    const hardResult = hardTracker.recordUsage({
      model: 'claude-sonnet', inputTokens: 5000, outputTokens: 2000
    });
    assert(hardResult.blocked === true, '硬性模式超预算时 blocked = true');

    const hardCheck = hardTracker.checkBudget(1000, 'claude-sonnet');
    assert(hardCheck.allowed === false, '硬性模式预算耗尽 allowed = false');
    assert(hardCheck.reason !== null, 'hardCheck 有拒绝原因');

    // ---- Test 9: resetTask ----
    console.log('\nTest 9: resetTask');
    tracker.resetTask();
    const statsAfterReset = tracker.getStats();
    assert(statsAfterReset.task.calls === 0, 'resetTask 后 task.calls = 0');
    assert(statsAfterReset.session.calls === 2, 'resetTask 不影响 session');

    // ---- Test 10: resetSession ----
    console.log('\nTest 10: resetSession');
    tracker.resetSession();
    const statsAfterSessionReset = tracker.getStats();
    assert(statsAfterSessionReset.session.calls === 0, 'resetSession 后 session.calls = 0');

    // ---- Test 11: getUsageByModel ----
    console.log('\nTest 11: getUsageByModel');
    const byModel = tracker.getUsageByModel();
    assert(typeof byModel === 'object', 'getUsageByModel 返回对象');
    // 之前记录了 claude-sonnet 和 claude-haiku
    assert(byModel['claude-sonnet'] !== undefined, 'claude-sonnet 统计存在');

    // ---- Test 12: getUsageByTaskType ----
    console.log('\nTest 12: getUsageByTaskType');
    const byType = tracker.getUsageByTaskType();
    assert(typeof byType === 'object', 'getUsageByTaskType 返回对象');
    assert(byType['feature'] !== undefined, 'feature 类型统计存在');

    // ---- Test 13: setBudget ----
    console.log('\nTest 13: setBudget');
    tracker.setBudget(BUDGET_LEVELS.DAILY, 1.0);
    const statsWithBudget = tracker.getStats();
    assert(statsWithBudget.daily.budget === 1.0, 'setBudget 设置成功');

    // ---- Test 14: getAlertHistory ----
    console.log('\nTest 14: getAlertHistory');
    const alertHist = budgetTracker.getAlertHistory();
    assert(Array.isArray(alertHist), 'getAlertHistory 返回数组');
    assert(alertHist.length > 0, '有告警记录');

    // ---- Test 15: 默认模型定价 ----
    console.log('\nTest 15: 未知模型使用默认定价');
    const defaultTracker = new TokenTracker({ logger: silentLogger });
    const defResult = defaultTracker.recordUsage({
      model: 'unknown-model', inputTokens: 1000, outputTokens: 500
    });
    assert(defResult.cost > 0, '未知模型使用默认定价');

  } catch (error) {
    console.log(`\n❌ 测试异常: ${error.message}`);
    console.log(error.stack);
    failed++;
  }

  console.log(`\n========================================`);
  console.log(`测试结果: ${passed} 通过, ${failed} 失败`);
  if (failed === 0) {
    console.log('✅ 所有 TokenTracker 测试通过！');
  } else {
    console.log('❌ 有测试失败');
    process.exitCode = 1;
  }
}

testTokenTracker();
