# G1 ParallelExecutor 分解落地版

**制定日期**: 2026-04-12  
**依据文档**:
- `10_多端并行调度总表_G.md`
- `Phase_G_借鉴优化总览.md`
- `Step_G1_ParallelExecutor并行执行.md`

---

## 一、深度阅读后的统一结论

G1 的真实目标不是简单新增一个 `ParallelExecutor` 类，而是完成一条**可配置、可降级、零破坏**的并行执行链路：

1. 新增独立模块 `src/parallel-executor.js`
2. 在 `src/supervisor-agent.js` 中新增懒加载入口和并行执行分支
3. 在 `.flowharness/config.yml` 中新增 `execution.parallel` 配置段
4. 新增 `test/test-parallel-executor.js`
5. 保证关闭开关时，现有 `step4_execute()` 行为完全不变

这 5 项缺一不可。仅做模块文件本身，不算 G1 完成。

---

## 二、三份文档的关键差异与采纳口径

### 1. 关于并行波次

- `Phase_G_借鉴优化总览.md` 仍按 Wave 1 / Wave 2 两波执行来写
- `10_多端并行调度总表_G.md` 已升级为 G1-G4 全独立、可四端同开

**采纳口径**:
- 以 `10_多端并行调度总表_G.md` 为最新总调度口径
- 但对 G1 单项实施时，仍要按“独立可合入”标准完成，不依赖 G2-G4

### 2. 关于 CLI 改动

- 总表里提到 G1 会改 `src/cli.js`
- G1 详细文档里只明确要求改 `supervisor-agent.js` 和 `config.yml`

**采纳口径**:
- G1 一次性通过的最小闭环不依赖 CLI 新命令
- CLI 侧的 `mode` 命令更像 Phase G 汇总集成项，不应阻塞 G1 单独合入

### 3. 关于“完全独立”

文档写 G1 完全独立，但仓库现状决定它仍有两个真实集成点：

1. `SupervisorAgent` 必须新增并行入口，否则模块无法被主流程调用
2. `config.yml` 必须补配置，否则默认值来源不统一

**结论**:
G1 是“低耦合集成”，不是“零接线的纯孤岛模块”。

---

## 三、对照当前仓库后的真实现状

### 1. 当前已有能力

- `src/supervisor-agent.js` 只有串行 `step4_execute()`
- `src/task-dispatcher.js` 已经产出 `executionPlan.parallel` / `executionPlan.sequential`
- `src/task-decomposer.js` 已经给子任务标注 `constraints.canRunInParallel`
- `src/cli.js` 当前 `supervisor` 命令统一走 `handleTask()`

### 2. 当前缺口

- 没有 `src/parallel-executor.js`
- `SupervisorAgent` 没有 `getParallelExecutor()`
- `SupervisorAgent` 没有 `step4_execute_parallel()`
- `handleTask()` 没有根据配置或 assignment 自动切换并行执行
- `.flowharness/config.yml` 没有 `execution.parallel`
- 没有 `test/test-parallel-executor.js`

### 3. 对 G1 最重要的现实约束

- `TaskDecomposer` 现在默认给除第一个外的子任务全部加顺序依赖
- 因此业务级“真并行子任务”在默认策略下很少出现
- 所以 G1 的第一版必须支持：
  - 有并行组时走并行执行
  - 没有并行组时自动回退串行执行
  - 单任务时直接复用现有 `step4_execute()`

这正是“一次性通过”的关键。否则模块存在，但主流程基本不会真正用到。

---

## 四、G1 一次性通过的实现边界

### 必做

1. 新增 `ParallelExecutor` 类
2. 提供 `executeParallel(tasks, executor, context)` 主入口
3. 支持 disabled 直接返回
4. 支持单任务回退
5. 支持 worktree 创建、执行、合并、清理四段式流程
6. `SupervisorAgent` 新增 `getParallelExecutor()`
7. `SupervisorAgent` 新增 `step4_execute_parallel()`
8. `handleTask()` 在 Step 4 根据配置决定走串行还是并行
9. `.flowharness/config.yml` 新增 `execution.parallel`
10. 新增单测覆盖最小闭环

### 不必做

1. 不必修改 `src/agent-executor.js`
2. 不必修改 `src/task-dispatcher.js`
3. 不必在 G1 内引入新 CLI 子命令
4. 不必追求第一版就完成复杂冲突自动修复

### 不能做

1. 不能破坏现有 `step4_execute()` 的串行行为
2. 不能强制所有任务切到并行模式
3. 不能把失败场景做成直接中断且无降级

---

## 五、推荐分解步骤

### Step A: 模块骨架先落地

先完成 `src/parallel-executor.js` 的类定义和 5 个核心方法：

1. `executeParallel()`
2. `createWorktrees()`
3. `executeInWorktrees()`
4. `mergeResults()`
5. `cleanupWorktrees()`

要求：

- 构造函数默认值与文档一致
- 每个方法职责单一
- 所有外部命令走统一封装，便于测试 stub

### Step B: 先做“可回退实现”，不要先做“复杂并行实现”

第一版执行策略建议：

1. `tasks.length <= 1` 时直接返回串行回退结果
2. `executionPlan.parallel` 为空时返回串行回退结果
3. 只有在并行组存在且 `enabled=true` 时才进入 worktree 流程

这样可以先保证主流程稳定，再逐步增强真并行能力。

### Step C: 再接 Supervisor

在 `src/supervisor-agent.js` 中分 3 个小改动：

1. constructor 增加 `this._parallelExecutor = null`
2. 新增 `getParallelExecutor()`
3. 新增 `step4_execute_parallel()`

`step4_execute_parallel()` 的职责只做两件事：

1. 判断当前 assignment 是否值得并行
2. 不适合并行时回退到 `step4_execute()`

不要在这里重写已有的单任务执行细节，避免重复逻辑。

### Step D: 最后补配置

在 `.flowharness/config.yml` 追加：

```yaml
execution:
  parallel:
    enabled: false
    maxWorkers: 4
    mergeStrategy: auto
    worktreeDir: .flowharness/worktrees
```

要求：

- 默认禁用
- 缺配置时代码里也要有默认值
- 配置缺失不能导致启动报错

### Step E: 测试按“能稳定跑”设计

`test/test-parallel-executor.js` 第一版不要依赖真实复杂 Git 合并场景，先覆盖：

1. 模块可加载
2. 配置生效
3. disabled 返回正确
4. 单任务回退
5. create / cleanup 流程可通过 mock 验证调用顺序

把真实 Git 冲突场景留给后续增强，不要把一次性通过建立在高脆弱集成测试上。

---

## 六、建议的代码落点

### `src/parallel-executor.js`

建议包含以下成员：

- `constructor(config = {})`
- `executeParallel(assignments, executor, context = {})`
- `shouldFallback(assignments, context = {})`
- `createWorktrees(assignments, context = {})`
- `executeInWorktrees(assignments, executor, worktrees, context = {})`
- `mergeResults(worktrees, results, context = {})`
- `cleanupWorktrees(worktrees)`
- `runGit(command, cwd)`
- `resolveConflict(conflict, strategy)`

### `src/supervisor-agent.js`

建议新增以下点：

1. 懒加载字段 `_parallelExecutor`
2. `getParallelExecutor()`
3. `step4_execute_parallel(assignment)`
4. `handleTask()` 的 Step 4 分流逻辑

推荐分流条件：

```javascript
if (this.config?.execution?.parallel?.enabled) {
  execution = await this.step4_execute_parallel(assignment);
} else {
  execution = await this.step4_execute(assignment);
}
```

并且在 `step4_execute_parallel()` 内再次做 assignment 级回退。

---

## 七、一次性通过检查清单

### 功能检查

1. `enabled=false` 时一定走回退逻辑
2. 单任务时一定走回退逻辑
3. 无并行组时一定走回退逻辑
4. 并行执行失败时要有可理解错误信息
5. 清理 worktree 失败不能吞掉主错误上下文

### 兼容性检查

1. 原有 `handleTask()` 输出结构不变
2. 原有 `step4_execute()` 不改签名
3. 未配置 `execution.parallel` 时系统仍可启动
4. 旧测试不需要大面积调整

### 质量检查

1. 新模块可以独立 `require()`
2. 新测试可单跑
3. `npm test` 不退化
4. 没有改动 `sandbox-manager.js`、`agent-executor.js`、`task-dispatcher.js`

---

## 八、推荐验收顺序

不要一上来跑全量，按下面顺序验收更稳：

1. `node -e "require('./src/parallel-executor')"`
2. `node test/test-parallel-executor.js`
3. `npm test`

如果第 2 步不过，先修测试和回退逻辑；不要直接用第 3 步放大问题面。

---

## 九、最终结论

从仓库真实状态看，G1 要“一次性通过”，最重要的不是把 Worktree 并行做得多复杂，而是把下面三件事同时做到：

1. **接得上**: `SupervisorAgent` 真能调用到新模块
2. **退得回**: 默认禁用、单任务、无并行组都能稳定回退
3. **测得住**: 测试先验证骨架和回退闭环，不把成功建立在脆弱 Git 场景上

只要沿这个口径实施，G1 就能作为独立 Step 合入，而不会把风险扩散到整个 Phase G。
