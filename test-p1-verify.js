'use strict';
// 验证 P1 buildAgentTask 各类型输出是否语义正确
const TaskDispatcher = require('./src/task-dispatcher');
const AgentRegistry  = require('./src/agent-registry');

const registry = new AgentRegistry();
registry.initializeCoreAgents();
const dispatcher = new TaskDispatcher(registry);

// 模拟 bug_fix 流程
const subtasks = [
  { id: 'bug_1', name: '复现Bug',  description: '确认Bug能稳定复现',    type: 'explore', priority: 'high' },
  { id: 'bug_2', name: '定位Bug',  description: '定位Bug代码位置',       type: 'explore', priority: 'high' },
  { id: 'bug_3', name: '分析根因', description: '分析Bug产生的根本原因', type: 'analyze', priority: 'high' },
  { id: 'bug_4', name: '设计方案', description: '设计修复方案，考虑副作用', type: 'plan',  priority: 'high' },
  { id: 'bug_5', name: '修复代码', description: '实施修复方案',           type: 'code',   priority: 'high' },
  { id: 'bug_6', name: '测试验证', description: '验证Bug已修复且未引入新问题', type: 'test', priority: 'high' },
];

const result = dispatcher.assign({ subtasks, taskType: 'bug_fix' }, {});

console.log('=== P2: executor 直接携带 agentId ===');
let p2ok = true;
result.assignments.forEach(a => {
  const ok = typeof a.executor.agentId === 'string';
  if (!ok) p2ok = false;
  console.log((ok ? '✓' : '✗') + ' ' + a.subtask.name + ' -> agentId=' + a.executor.agentId);
});
console.log('P2 结论:', p2ok ? '✅ 通过' : '❌ 失败');

console.log('\n=== P3: executionPlan.phases ===');
const plan = result.executionPlan;
const hasPhases = Array.isArray(plan.phases) && plan.phases.length > 0;
plan.phases.forEach(p => {
  const names = p.tasks.map(id => subtasks.find(s => s.id === id).name);
  console.log('Phase ' + p.phase + ' [并行 ' + names.length + ']: ' + names.join(', '));
});
console.log('P3 结论:', hasPhases ? '✅ 通过' : '❌ 失败');

console.log('\n=== P1: buildAgentTask 内容 ===');
// 不需要完整构造函数，直接引用方法
const SA_proto = require('./src/supervisor-agent').prototype;
const buildAgentTask = SA_proto
  ? SA_proto.buildAgentTask
  : null;

if (!buildAgentTask) {
  // Fallback: load via file and extract
  const code = require('fs').readFileSync('./src/supervisor-agent.js', 'utf8');
  const match = code.match(/buildAgentTask\(subtask, agentId\) \{[\s\S]+?\n  \}/);
  console.log('无法直接调用 buildAgentTask（需要实例），跳过 P1 直接测试');
} else {
  const context = { buildAgentTask };
  result.assignments.forEach(a => {
    const task = context.buildAgentTask.call({}, a.subtask, a.executor.agentId);
    const notHardcoded = task.action !== 'default' &&
      !(task.action === 'run_command' && task.command && task.command.includes('echo "Task:'));
    console.log((notHardcoded ? '✓' : '✗') + ' ' + a.subtask.name + ' [' + a.executor.agentId + '] action=' + task.action);
  });
}
