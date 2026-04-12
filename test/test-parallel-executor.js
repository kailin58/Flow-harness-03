const ParallelExecutor = require('../src/parallel-executor');

async function testParallelExecutor() {
  console.log('🧪 测试 ParallelExecutor...\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, msg) {
    if (condition) {
      passed++;
      console.log(`  ✅ ${msg}`);
    } else {
      failed++;
      console.log(`  ❌ ${msg}`);
    }
  }

  try {
    console.log('\nTest 1: 基本实例化');
    const executor = new ParallelExecutor();
    assert(executor !== null, '实例创建成功');
    assert(executor.maxParallel === 4, '默认 maxParallel = 4');
    assert(executor.mergeStrategy === 'auto', '默认 mergeStrategy = auto');
    assert(executor.worktreeDir === '.flowharness/worktrees', '默认 worktreeDir 正确');

    console.log('\nTest 2: 自定义配置');
    const configured = new ParallelExecutor({
      maxWorkers: 8,
      mergeStrategy: 'manual',
      worktreeDir: 'tmp/worktrees'
    });
    assert(configured.maxParallel === 8, '读取 maxWorkers');
    assert(configured.mergeStrategy === 'manual', '读取 mergeStrategy');
    assert(configured.worktreeDir === 'tmp/worktrees', '读取 worktreeDir');

    console.log('\nTest 3: disabled 状态');
    const disabled = new ParallelExecutor({ enabled: false });
    const disabledResult = await disabled.executeParallel([], () => ({}), {});
    assert(disabledResult.success === false, 'disabled 返回 success=false');
    assert(disabledResult.error === 'ParallelExecutor disabled', 'disabled 错误信息正确');

    console.log('\nTest 4: 单任务自动回退');
    let fallbackReason = null;
    const singleTask = new ParallelExecutor();
    const singleResult = await singleTask.executeParallel(
      [{ subtask: { id: 'solo' } }],
      () => {
        throw new Error('should not run');
      },
      {
        parallelGroups: [['solo']],
        fallback: async (reason) => {
          fallbackReason = reason;
          return { success: true, mode: 'serial' };
        }
      }
    );
    assert(singleResult.success === true, '单任务回退结果保留 success');
    assert(singleResult.fallback === true, '单任务标记 fallback');
    assert(fallbackReason === 'single_task', '单任务回退原因正确');

    console.log('\nTest 5: 无并行组自动回退');
    const noParallel = new ParallelExecutor();
    const noParallelResult = await noParallel.executeParallel(
      [{ subtask: { id: 'a' } }, { subtask: { id: 'b' } }],
      () => {
        throw new Error('should not run');
      },
      {
        parallelGroups: [],
        fallback: async (reason) => ({ success: true, reason })
      }
    );
    assert(noParallelResult.fallbackReason === 'no_parallel_group', '无并行组回退原因正确');

    console.log('\nTest 6: 正常并行主流程');
    const flow = new ParallelExecutor({ maxParallel: 2 });
    const callOrder = [];
    flow.createWorktrees = async (assignments) => {
      callOrder.push('create');
      return assignments.map((item, index) => ({
        id: item.subtask.id,
        path: `wt-${index}`,
        branch: `branch-${index}`,
        repoDir: process.cwd()
      }));
    };
    flow.executeInWorktrees = async (assignments) => {
      callOrder.push('execute');
      return assignments.map((item, index) => ({
        taskId: item.subtask.id,
        success: true,
        output: {
          success: true,
          subtask: item.subtask.name,
          executionTime: 10 + index
        },
        branch: `branch-${index}`,
        worktreePath: `wt-${index}`
      }));
    };
    flow.mergeResults = async () => {
      callOrder.push('merge');
      return { success: true, mergedBranches: ['branch-0', 'branch-1'], conflicts: [] };
    };
    flow.cleanupWorktrees = async () => {
      callOrder.push('cleanup');
      return 2;
    };

    const flowResult = await flow.executeParallel(
      [
        { subtask: { id: 't1', name: '任务1' } },
        { subtask: { id: 't2', name: '任务2' } }
      ],
      async () => ({ success: true }),
      {
        parallelGroups: [['t1', 't2']]
      }
    );
    assert(flowResult.success === true, '并行主流程 success=true');
    assert(flowResult.results.length === 2, '返回 2 个结果');
    assert(flowResult.worktrees.created === 2, '记录创建的 worktree 数');
    assert(callOrder.join(',') === 'create,execute,merge,cleanup', '执行顺序正确');

    console.log('\nTest 7: resolveExecutor 支持 context.executeTask');
    const resolver = new ParallelExecutor();
    const runner = resolver.resolveExecutor(null, {
      executeTask: async () => ({ success: true, via: 'context' })
    });
    const runnerResult = await runner({ subtask: { id: 'ctx' } }, {});
    assert(runnerResult.via === 'context', '从 context.executeTask 解析执行器');
  } catch (error) {
    console.log(`\n❌ 测试异常: ${error.message}`);
    console.log(error.stack);
    failed++;
  }

  console.log('\n========================================');
  console.log(`测试结果: ${passed} 通过, ${failed} 失败`);
  if (failed === 0) {
    console.log('✅ 所有 ParallelExecutor 测试通过！');
  } else {
    console.log('❌ 有测试失败');
    process.exitCode = 1;
  }
}

testParallelExecutor();
