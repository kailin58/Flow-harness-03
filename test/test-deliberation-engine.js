'use strict';
/**
 * test-deliberation-engine.js — DeliberationEngine 单元测试
 */
const assert = require('assert');
const DeliberationEngine = require('../src/deliberation-engine');

// ── 最小 Mock ──────────────────────────────────────────────────
const mockRegistry = {
  get: (id) => ({ name: id, role: id })
};
const mockKB = {};

// ── 测试工具 ───────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

// ──────────────────────────────────────────────────────────────
async function run() {
  const engine = new DeliberationEngine(mockRegistry, mockKB);

  // ── Test 1: 模块加载 ────────────────────────────────────────
  console.log('\nTest 1: 模块加载');
  check('DeliberationEngine 构造成功', engine !== null);
  check('DECISION 枚举存在', !!DeliberationEngine.DECISION);
  check('THRESHOLDS 常量存在', !!DeliberationEngine.THRESHOLDS);
  check('history 初始为空', Array.isArray(engine.history) && engine.history.length === 0);

  // ── Test 2: 触发条件判断 ────────────────────────────────────
  console.log('\nTest 2: 触发条件判断');

  const simpleAnalysis = { complexity: 1, risks: [] };
  const complexAnalysis = { complexity: 4, risks: [{ type: 'performance' }, { type: 'security' }] };
  const simpleAssignment = { assignments: [{}], executionPlan: { parallel: [] } };
  const bigAssignment    = { assignments: [{},{},{}], executionPlan: { parallel: [] } };

  check('简单任务不触发商议', !engine.shouldDeliberateTask(simpleAnalysis, simpleAssignment));
  check('高复杂度触发商议',    engine.shouldDeliberateTask(complexAnalysis, simpleAssignment));
  check('多风险触发商议',      engine.shouldDeliberateTask({ complexity: 1, risks: [{},{},{}] }, simpleAssignment));
  check('3个以上子任务触发商议', engine.shouldDeliberateTask(simpleAnalysis, bigAssignment));

  const successResult   = { success: true,  error: null, retryable: true };
  const retryResult     = { success: false, error: '失败', retryable: true  };
  const noRetryResult   = { success: false, error: '不支持此操作', retryable: false };

  check('成功结果不触发问题商议', !engine.shouldDeliberateProblem(successResult, 0));
  check('已重试1次触发问题商议',   engine.shouldDeliberateProblem(retryResult, 1));
  check('不可重试触发问题商议',    engine.shouldDeliberateProblem(noRetryResult, 0));
  check('"不支持"关键词触发',      engine.shouldDeliberateProblem({ error: '不支持该action', retryable: true }, 0));

  // ── Test 3: 任务前商议 ──────────────────────────────────────
  console.log('\nTest 3: 任务前商议');

  const assignment = {
    assignments: [
      { subtask: { name: '分析代码', priority: 'high' } },
      { subtask: { name: '实现功能', priority: 'high' } },
      { subtask: { name: '写文档',  priority: 'low'  } }
    ],
    executionPlan: {
      phases: [{ phase: 0, tasks: ['t1'] }, { phase: 1, tasks: ['t2','t3'] }],
      parallel: ['t2', 't3'],
      sequential: []
    }
  };
  const analysis = {
    taskType: 'feature',
    goal: { description: '实现用户注册功能' },
    complexity: 4,
    risks: [{ type: 'security', description: '需要校验输入' }]
  };

  const result = await engine.deliberateTask(assignment, analysis);

  check('商议结果存在', !!result);
  check('有 topic', typeof result.topic === 'string' && result.topic.length > 0);
  check('有 participants 数组', Array.isArray(result.participants) && result.participants.length > 0);
  check('有 options 数组', Array.isArray(result.options) && result.options.length >= 2);
  check('有 opinions 数组', Array.isArray(result.opinions) && result.opinions.length > 0);
  check('有 optimal', !!result.optimal);
  check('optimal 有 totalScore', typeof result.optimal.totalScore === 'number');
  check('optimal.totalScore > 0', result.optimal.totalScore > 0);
  check('有 decision 字符串', typeof result.decision === 'string');
  check('decision 是合法枚举',
    Object.values(DeliberationEngine.DECISION).includes(result.decision));
  check('有 duration', typeof result.duration === 'number');
  check('有 timestamp', typeof result.timestamp === 'string');

  // ── Test 4: 商议结果记入历史 ────────────────────────────────
  console.log('\nTest 4: 历史记录');
  check('history 已增加1条', engine.history.length === 1);
  check('getHistory 返回数组', Array.isArray(engine.getHistory()));
  check('getHistory limit 生效', engine.getHistory(1).length === 1);

  // ── Test 5: 问题商议 ────────────────────────────────────────
  console.log('\nTest 5: 问题商议');

  const failedItem = {
    subtask: { name: '写入配置文件', type: 'write' },
    executor: { name: 'general', agentId: 'general' }
  };
  const failedResult = {
    success: false,
    error: '不支持该操作',
    retryable: false,
    retryCount: 1
  };

  const probResult = await engine.deliberateProblem(failedItem, failedResult, {});

  check('问题商议结果存在', !!probResult);
  check('topic 包含失败子任务名', probResult.topic.includes('写入配置文件'));
  check('问题方案至少3个', probResult.options.length >= 3);
  check('有最优解', !!probResult.optimal);
  check('最优解有 patch', !!probResult.optimal.patch);
  check('最优解 patch 有 action', typeof probResult.optimal.patch.action === 'string');
  check('history 增加到2条', engine.history.length === 2);

  // ── Test 6: 最优解公式正确性 ────────────────────────────────
  console.log('\nTest 6: 最优解公式');

  // 方案评分的单调性：totalScore 之和应等于各维度得分之和
  const scored = probResult.options;
  const manualCheck = scored.every(opt => {
    const dimSum = Object.values(opt.dimScores).reduce((s, v) => s + v, 0);
    return Math.abs(dimSum - opt.totalScore) < 0.001;
  });
  check('totalScore = Σ dimScores（公式正确）', manualCheck);
  check('各维度得分在 [0,1] 内', scored.every(opt =>
    Object.values(opt.dimScores).every(v => v >= 0 && v <= 1)
  ));
  check('最优解确实得分最高', scored.every(opt =>
    probResult.optimal.totalScore >= opt.totalScore
  ));

  // ── Test 7: formatSummary ───────────────────────────────────
  console.log('\nTest 7: formatSummary');
  const summary = DeliberationEngine.formatSummary(result);
  check('摘要是字符串', typeof summary === 'string');
  check('摘要含 topic', summary.includes('商议结果'));
  check('摘要含 decision', summary.includes('决策'));
  check('摘要含最优解标签', summary.includes(result.optimal.label));

  // ── Test 8: 参与者选择 ──────────────────────────────────────
  console.log('\nTest 8: 参与者选择（按任务类型）');

  const mkAnalysis = (type, complexity, riskCount) => ({
    taskType: type, complexity, risks: Array(riskCount).fill({})
  });
  const mkAssignment = () => ({ assignments: [], executionPlan: { parallel: [] } });

  async function getParticipants(type, complex, risks) {
    const r = await engine.deliberateTask(
      mkAssignment(),
      mkAnalysis(type, complex, risks)
    );
    return r.participants;
  }

  const bugParts  = await getParticipants('bug_fix',  2, 0);
  const secParts  = await getParticipants('security', 2, 1);
  const fullParts = await getParticipants('feature',  5, 0);

  check('bug_fix 包含 explore',   bugParts.includes('explore'));
  check('bug_fix 包含 inspector', bugParts.includes('inspector'));
  check('security 包含 inspector', secParts.includes('inspector'));
  check('高复杂度召集全员 (5 agents)', fullParts.length === 5);

  // ── 输出统计 ────────────────────────────────────────────────
  console.log('\n========================================');
  console.log(`测试结果: ${passed} 通过, ${failed} 失败`);
  console.log('========================================\n');

  if (failed > 0) {
    console.error('❌ 有测试失败');
    process.exit(1);
  } else {
    console.log('✅ 全部通过');
  }
}

run().catch(err => {
  console.error('测试运行异常:', err);
  process.exit(1);
});
