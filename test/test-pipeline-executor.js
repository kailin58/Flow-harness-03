const assert = require('assert');
const { PipelineExecutor, PIPELINE_STAGES, GATE_CHECKERS } = require('../src/pipeline-executor');

// 测试 1: 阶段定义
async function test_stages() {
  assert(PIPELINE_STAGES.RECONNAISSANCE, 'RECONNAISSANCE 阶段应存在');
  assert(PIPELINE_STAGES.FOUNDATION, 'FOUNDATION 阶段应存在');
  assert(PIPELINE_STAGES.BUILD, 'BUILD 阶段应存在');
  assert(PIPELINE_STAGES.ASSEMBLY, 'ASSEMBLY 阶段应存在');

  assert(PIPELINE_STAGES.RECONNAISSANCE.name === 'reconnaissance', '名称应匹配');
  assert(Array.isArray(PIPELINE_STAGES.RECONNAISSANCE.gates), '应有 gates 数组');
  console.log('✓ test_stages');
}

// 测试 2: 门控检查器
async function test_gate_checkers() {
  const pipeline = new PipelineExecutor({});

  // info_complete 门控
  const result1 = await pipeline.checkGate('info_complete', { data: 'test' });
  assert(result1.passed === true, '有数据应通过');

  const result2 = await pipeline.checkGate('info_complete', null);
  assert(result2.passed === false, '无数据应失败');

  // 未知门控自动通过
  const result3 = await pipeline.checkGate('unknown_gate', null);
  assert(result3.passed === true, '未知门控应自动通过');

  // resources_available 永远通过
  const result4 = await pipeline.checkGate('resources_available', null);
  assert(result4.passed === true, 'resources_available 应通过');

  console.log('✓ test_gate_checkers');
}

// 测试 3: 阶段执行
async function test_stage_execution() {
  const pipeline = new PipelineExecutor({});
  const stage = PIPELINE_STAGES.RECONNAISSANCE;

  const result = await pipeline.executeStage(stage, { task: 'test' });
  assert(result.name === 'reconnaissance', '阶段名称应匹配');
  assert(typeof result.passed === 'boolean', '应有 passed 字段');
  assert(typeof result.duration === 'number', '应有 duration 字段');
  assert(typeof result.gates === 'object', '应有 gates 字段');
  assert(result.gates['info_complete'] !== undefined, 'info_complete 门控应被检查');

  console.log('✓ test_stage_execution');
}

// 测试 4: 完整流水线（使用轻量自定义阶段，避免触发 npm test/build）
async function test_full_pipeline() {
  const lightStages = [
    {
      name: 'stage_a',
      gates: ['resources_available'],
      execute: () => ({ done: true })
    },
    {
      name: 'stage_b',
      gates: ['resources_available'],
      execute: () => ({ done: true })
    }
  ];

  const pipeline = new PipelineExecutor({
    stages: lightStages,
    stopOnGateFailure: false
  });

  const result = await pipeline.execute({ task: 'test' });
  assert(Array.isArray(result.stages), '应有 stages 数组');
  assert(typeof result.passed === 'boolean', '应有 passed 字段');
  assert(typeof result.totalTime === 'number', '应有 totalTime 字段');
  assert(result.stages.length === 2, '应有 2 个阶段');
  assert(result.passed === true, '所有门控通过应整体通过');

  console.log('✓ test_full_pipeline');
}

// 测试 5: 门控失败时停止
async function test_stop_on_gate_failure() {
  let secondStageReached = false;

  const customStages = [
    {
      name: 'failing_stage',
      gates: ['info_complete'],
      execute: () => null   // 返回 null → info_complete 门控失败
    },
    {
      name: 'never_reached',
      gates: [],
      execute: () => {
        secondStageReached = true;
        return {};
      }
    }
  ];

  const pipeline = new PipelineExecutor({
    stages: customStages,
    stopOnGateFailure: true
  });

  const result = await pipeline.execute({});
  assert(result.passed === false, '应失败');
  assert(result.failedAt === 'failing_stage', '应在 failing_stage 停止');
  assert(result.stages.length === 1, '应只执行了一个阶段');
  assert(secondStageReached === false, '第二阶段不应被执行');

  console.log('✓ test_stop_on_gate_failure');
}

// 测试 6: stopOnGateFailure=false 时继续执行
async function test_continue_on_gate_failure() {
  const customStages = [
    {
      name: 'failing_stage',
      gates: ['info_complete'],
      execute: () => null
    },
    {
      name: 'second_stage',
      gates: ['resources_available'],
      execute: () => ({})
    }
  ];

  const pipeline = new PipelineExecutor({
    stages: customStages,
    stopOnGateFailure: false
  });

  const result = await pipeline.execute({});
  assert(result.stages.length === 2, '应执行所有阶段');
  assert(result.passed === false, '整体应失败');
  assert(result.failedAt === 'failing_stage', '应记录第一个失败');

  console.log('✓ test_continue_on_gate_failure');
}

// 测试 7: 自定义阶段 execute 函数
async function test_custom_stage_execute() {
  let called = false;
  const customStages = [
    {
      name: 'custom_stage',
      gates: ['info_complete'],
      execute: (ctx) => {
        called = true;
        return { result: 'custom', key: 'value' };
      }
    }
  ];

  const pipeline = new PipelineExecutor({ stages: customStages });
  const result = await pipeline.execute({});
  assert(called === true, 'execute 函数应被调用');
  assert(result.stages[0].passed === true, '有输出对象应通过 info_complete');

  console.log('✓ test_custom_stage_execute');
}

// 运行所有测试
async function runTests() {
  await test_stages();
  await test_gate_checkers();
  await test_stage_execution();
  await test_full_pipeline();
  await test_stop_on_gate_failure();
  await test_continue_on_gate_failure();
  await test_custom_stage_execute();
  console.log('\n✅ PipelineExecutor 测试通过');
}

runTests().catch(err => {
  console.error('❌ 测试失败:', err.message);
  process.exit(1);
});
