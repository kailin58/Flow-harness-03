# Step G1: ParallelExecutor 并行执行器

**负责端**: 端1 (独立开发)
**预计时间**: 4-6 小时
**依赖**: 无（完全独立模块）
**产出文件**: `src/parallel-executor.js`, `test/test-parallel-executor.js`

---

## 一、设计目标

借鉴 ai-website-cloner 的 Worktree 并行构建模式，实现多任务真正并行执行。

### 与现有 SandboxManager 的区别

| 维度 | SandboxManager (现有) | ParallelExecutor (新增) |
|------|----------------------|------------------------|
| **目的** | 执行隔离（安全） | 并行构建（效率） |
| **创建时机** | 单任务执行前 | 多任务并行前 |
| **生命周期** | 任务完成后销毁 | 任务完成后合并 |
| **结果处理** | 直接丢弃 | 合并到主分支 |

---

## 二、实现边界

### 输入

```javascript
{
  tasks: Array<{          // 要并行执行的任务列表
    id: string,
    agentId: string,
    action: string,
    payload: any
  }>,
  executor: AgentExecutor,  // 执行器引用
  context: {               // 执行上下文
    workingDir: string,
    maxParallel?: number,   // 最大并行数，默认 4
    mergeStrategy?: 'auto' | 'manual' | 'abort'
  }
}
```

### 输出

```javascript
{
  success: boolean,
  results: Array<{        // 每个任务的执行结果
    taskId: string,
    success: boolean,
    output: any,
    error?: string
  }>,
  mergeResult: {          // 合并结果
    success: boolean,
    mergedBranches: string[],
    conflicts: string[]
  },
  worktrees: {            // Worktree 信息
    created: number,
    cleaned: number
  }
}
```

### 不修改的文件

- `src/sandbox-manager.js` - 保持不变
- `src/agent-executor.js` - 保持不变
- `src/task-dispatcher.js` - 保持不变

---

## 三、实现规范

### 文件结构

```javascript
// src/parallel-executor.js

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

/**
 * ParallelExecutor - 并行执行器
 * 
 * 借鉴 ai-website-cloner 的 Worktree 并行构建模式
 * 
 * 核心能力:
 * 1. 创建多个 Git Worktree 并行执行
 * 2. 收集所有结果后统一合并
 * 3. 处理合并冲突
 * 4. 自动清理 Worktree
 */
class ParallelExecutor {
  constructor(config = {}) {
    this.maxParallel = config.maxParallel || 4;
    this.mergeStrategy = config.mergeStrategy || 'auto';
    this.worktreeDir = config.worktreeDir || '.flowharness/worktrees';
    this.enabled = config.enabled !== false;
  }

  /**
   * 并行执行多个任务
   * @param {Array} tasks - 任务列表
   * @param {Object} executor - AgentExecutor 实例
   * @param {Object} context - 执行上下文
   * @returns {Promise<Object>} 执行结果
   */
  async executeParallel(tasks, executor, context = {}) {
    if (!this.enabled) {
      return { success: false, error: 'ParallelExecutor disabled' };
    }

    // 1. 创建 Worktrees
    const worktrees = await this.createWorktrees(tasks, context);
    
    // 2. 并行执行
    const results = await this.executeInWorktrees(tasks, executor, worktrees, context);
    
    // 3. 合并结果
    const mergeResult = await this.mergeResults(worktrees, results, context);
    
    // 4. 清理 Worktrees
    await this.cleanupWorktrees(worktrees);
    
    return {
      success: results.every(r => r.success) && mergeResult.success,
      results,
      mergeResult,
      worktrees: {
        created: worktrees.length,
        cleaned: worktrees.length
      }
    };
  }

  // ... 其他私有方法
}

module.exports = ParallelExecutor;
```

### 必须实现的方法

| 方法 | 职责 | 返回值 |
|------|------|--------|
| `createWorktrees(tasks, context)` | 创建多个 Worktree | `Array<{id, path, branch}>` |
| `executeInWorktrees(tasks, executor, worktrees, context)` | 并行执行任务 | `Array<{taskId, success, output}>` |
| `mergeResults(worktrees, results, context)` | 合并 Worktree 结果 | `{success, mergedBranches, conflicts}` |
| `cleanupWorktrees(worktrees)` | 清理所有 Worktree | `void` |
| `resolveConflict(conflict, strategy)` | 解决合并冲突 | `{resolved, strategy}` |

---

## 四、测试用例

### 文件: `test/test-parallel-executor.js`

```javascript
const assert = require('assert');
const ParallelExecutor = require('../src/parallel-executor');

// 测试 1: 模块加载
async function test_load() {
  const pe = new ParallelExecutor();
  assert(pe !== null);
  assert(typeof pe.executeParallel === 'function');
  console.log('✓ test_load');
}

// 测试 2: 配置生效
async function test_config() {
  const pe = new ParallelExecutor({ maxParallel: 8, mergeStrategy: 'manual' });
  assert(pe.maxParallel === 8);
  assert(pe.mergeStrategy === 'manual');
  console.log('✓ test_config');
}

// 测试 3: 禁用状态
async function test_disabled() {
  const pe = new ParallelExecutor({ enabled: false });
  const result = await pe.executeParallel([], null, {});
  assert(result.success === false);
  assert(result.error === 'ParallelExecutor disabled');
  console.log('✓ test_disabled');
}

// 测试 4: 单任务回退
async function test_single_task_fallback() {
  const pe = new ParallelExecutor();
  // 单任务应该走普通执行流程
  // ...
  console.log('✓ test_single_task_fallback');
}

// 测试 5: 并行执行
async function test_parallel_execution() {
  // 需要在 Git 仓库中测试
  // ...
  console.log('✓ test_parallel_execution');
}

// 运行所有测试
async function runTests() {
  await test_load();
  await test_config();
  await test_disabled();
  await test_single_task_fallback();
  // test_parallel_execution 需要 Git 环境
  console.log('\n✅ ParallelExecutor 测试通过');
}

runTests().catch(console.error);
```

---

## 五、集成点

### supervisor-agent.js 扩展（不修改现有方法）

```javascript
// 在 constructor 中添加
this._parallelExecutor = null;

// 新增 getter
getParallelExecutor() {
  if (!this._parallelExecutor) {
    const ParallelExecutor = require('./parallel-executor');
    this._parallelExecutor = new ParallelExecutor({
      maxParallel: this.config.maxParallelTasks || 4,
      enabled: this.config.enableParallelExecution || false
    });
  }
  return this._parallelExecutor;
}

// 新增方法（不修改 step4_execute）
async step4_execute_parallel(assignment, context = {}) {
  if (!this.config.enableParallelExecution) {
    return this.step4_execute(assignment);
  }
  // ... 并行执行逻辑
}
```

---

## 六、配置项

### config.yml 扩展

```yaml
execution:
  parallel:
    enabled: false        # 默认禁用
    maxWorkers: 4         # 最大并行数
    mergeStrategy: auto   # auto | manual | abort
    worktreeDir: .flowharness/worktrees
```

---

## 七、验收标准

| 检查项 | 验证方法 | 预期结果 |
|--------|----------|----------|
| 模块独立加载 | `node -e "require('./src/parallel-executor')"` | 无报错 |
| 测试全部通过 | `node test/test-parallel-executor.js` | 全部 ✓ |
| 不影响现有测试 | `npm test` | 65 个测试通过 |
| 配置开关生效 | 设置 enabled: false | executeParallel 返回 disabled |

---

## 八、交付物

1. `src/parallel-executor.js` (~150 行)
2. `test/test-parallel-executor.js` (~80 行)
3. 文档更新: `config.yml` 新增配置项
