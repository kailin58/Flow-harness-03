# Step C1：创建钩子引擎 + 集成到 Supervisor

> **复制本文件给任意 Agent 端（Cursor / Claude Code / Codex）即可独立执行**  
> **可与 Phase A / Phase B 并行**（Phase B3 完成前可先创建 hook-engine.js）

---

## 上下文

Flow Harness 当前 `config.yml` 中只有 echo 级别的钩子（`before_workflow: ["echo 'Starting...'"]`）。参考 ECC 项目（meeting\13-1 架构设计分析.md），需要实现 6 种生命周期钩子点，支持 block/warn/skip 三种失败策略。

### 设计约束
- **向后兼容**：旧格式 `hooks.before_workflow: ["echo ..."]` 继续工作
- **新格式可选**：新增 `hooks.lifecycle` 区块，与旧格式并存
- **不修改 6步闭环结构**：钩子调用插入到步骤之间，不改变步骤本身
- **config.yml YAML 结构不变**：只在 hooks 下新增 lifecycle 字段

---

## 边界定义

### 本步骤 ONLY 创建/修改
1. `src/hook-engine.js` —— 全新文件
2. `src/supervisor-agent.js` —— 构造函数新增 HookEngine 初始化 + handleTask 中插入钩子调用点
3. `.flowharness/config.yml` —— 在 hooks 下新增 lifecycle 示例配置
4. `test/test-hook-engine.js` —— 全新测试文件

### 本步骤 NOT 修改
- AGENTS.md
- 任何现有 step1-step6 方法的内部逻辑
- agent-executor.js / task-dispatcher.js
- config.yml 中 hooks 以外的内容

---

## 执行步骤

### 步骤 1：创建 src/hook-engine.js

**文件**: `src/hook-engine.js`（全新文件）

```javascript
'use strict';

const { createLogger } = require('./logger');

class HookEngine {
  constructor(config = {}, services = {}) {
    this.logger = createLogger({ name: 'hook-engine' });
    this.services = services;
    
    // 从 config.hooks.lifecycle 读取结构化钩子
    this.lifecycleHooks = config.hooks?.lifecycle || {};
    
    // 保留旧格式兼容
    this.legacyHooks = {
      before_workflow: config.hooks?.before_workflow || [],
      after_workflow: config.hooks?.after_workflow || [],
      on_error: config.hooks?.on_error || [],
      on_success: config.hooks?.on_success || [],
    };
  }

  static LIFECYCLE = {
    PRE_TOOL_USE: 'pre_tool_use',
    POST_TOOL_USE: 'post_tool_use',
    PRE_TASK: 'pre_task',
    POST_TASK: 'post_task',
    ON_SUPERVISOR_STOP: 'on_supervisor_stop',
    PRE_COMPACT: 'pre_compact',
  };

  async runHooks(lifecycle, context = {}) {
    const hooks = this.lifecycleHooks[lifecycle] || [];
    const results = [];

    for (const hook of hooks) {
      if (hook.condition && !this._evalCondition(hook.condition, context)) {
        results.push({ id: hook.id, status: 'skipped', reason: 'condition_not_met' });
        continue;
      }

      const timeoutMs = (hook.timeout || 30) * 1000;

      try {
        const result = await this._executeWithTimeout(hook, context, timeoutMs);
        results.push({ id: hook.id, status: 'success', result });
      } catch (err) {
        const entry = { id: hook.id, status: 'failed', error: err.message };
        results.push(entry);

        if (hook.on_fail === 'block') {
          this.logger.error(`Blocking hook failed: ${hook.id} - ${err.message}`);
          throw new Error(`Hook blocked: ${hook.id} - ${err.message}`);
        } else if (hook.on_fail === 'warn') {
          this.logger.warn(`Hook warning: ${hook.id} - ${err.message}`);
        }
        // skip: 静默继续
      }
    }

    return results;
  }

  async _executeWithTimeout(hook, context, timeoutMs) {
    return new Promise(async (resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Hook ${hook.id} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      try {
        const result = await this._executeHook(hook, context);
        clearTimeout(timer);
        resolve(result);
      } catch (err) {
        clearTimeout(timer);
        reject(err);
      }
    });
  }

  async _executeHook(hook, context) {
    switch (hook.type) {
      case 'builtin':
        return await this._executeBuiltin(hook.action, context);
      case 'shell':
        return await this._executeShell(hook.command);
      default:
        throw new Error(`Unknown hook type: ${hook.type}`);
    }
  }

  async _executeBuiltin(action, context) {
    const handler = this.services[action];
    if (typeof handler === 'function') {
      return await handler(context);
    }

    // 内置动作映射
    switch (action) {
      case 'token_budget_check':
        if (this.services.tokenTracker) {
          return this.services.tokenTracker.checkBudget?.() || { status: 'ok' };
        }
        return { status: 'no_tracker' };

      case 'write_audit_log':
        this.logger.info('Audit:', JSON.stringify(context).slice(0, 200));
        return { status: 'logged' };

      case 'policy_validate':
        if (this.services.policyChecker) {
          return this.services.policyChecker.validate?.(context) || { status: 'ok' };
        }
        return { status: 'no_checker' };

      case 'run_quality_gate':
        if (this.services.qualityGate) {
          return this.services.qualityGate.run?.(context) || { status: 'ok' };
        }
        return { status: 'no_gate' };

      case 'save_checkpoint':
        this.logger.info('Checkpoint saved for context');
        return { status: 'saved' };

      case 'extract_patterns_before_compact':
        if (this.services.knowledgeBase) {
          return this.services.knowledgeBase.extractPatterns?.(context) || { status: 'ok' };
        }
        return { status: 'no_kb' };

      default:
        throw new Error(`Unknown builtin action: ${action}`);
    }
  }

  async _executeShell(command) {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    const { stdout } = await execAsync(command, { timeout: 30000 });
    return { status: 'ok', output: stdout.trim() };
  }

  _evalCondition(condition, context) {
    try {
      const inMatch = condition.match(/^(.+?)\s+in\s+(\[.+\])$/);
      if (inMatch) {
        const fieldPath = inMatch[1].trim();
        const values = JSON.parse(inMatch[2]);
        const fieldValue = fieldPath.split('.').reduce((obj, key) => obj?.[key], context);
        return values.includes(fieldValue);
      }

      const eqMatch = condition.match(/^(.+?)\s*===?\s*['"](.+)['"]$/);
      if (eqMatch) {
        const fieldPath = eqMatch[1].trim();
        const expected = eqMatch[2];
        const fieldValue = fieldPath.split('.').reduce((obj, key) => obj?.[key], context);
        return fieldValue === expected;
      }
    } catch {
      return false;
    }
    return false;
  }
}

module.exports = { HookEngine };
```

---

### 步骤 2：在 supervisor-agent.js 中集成 HookEngine

**文件**: `src/supervisor-agent.js`

**2a. 在 require 区域添加**:
```javascript
const { HookEngine } = require('./hook-engine');
```

**2b. 在构造函数中初始化**（在 `this.skillLoader = ...` 之后）:
```javascript
    this.hookEngine = new HookEngine(this.config, {
      knowledgeBase: this.knowledgeBase,
      // 后续 Phase D 会注入 tokenTracker
    });
```

**2c. 在 handleTask() 方法中插入钩子调用**:

在 `step3_assign` 之后、`step4_execute` 之前：
```javascript
      // Hook: pre_task
      try {
        await this.hookEngine.runHooks(HookEngine.LIFECYCLE.PRE_TASK, {
          task: { type: analysis.type, message: taskMessage }
        });
      } catch (hookErr) {
        this.logger.error(`Pre-task hook blocked execution: ${hookErr.message}`);
        throw hookErr;
      }
```

在 `step4_execute` 结果拿到之后（在 `while (!inspection.passed ...)` 之前）：
```javascript
      // Hook: post_task
      try {
        await this.hookEngine.runHooks(HookEngine.LIFECYCLE.POST_TASK, {
          task: { type: analysis.type, message: taskMessage },
          result: execution
        });
      } catch (hookErr) {
        this.logger.warn(`Post-task hook error: ${hookErr.message}`);
      }
```

在 `return { success: ... }` 之前（方法末尾）：
```javascript
      // Hook: on_supervisor_stop
      try {
        await this.hookEngine.runHooks(HookEngine.LIFECYCLE.ON_SUPERVISOR_STOP, {
          task: { type: analysis.type, message: taskMessage },
          totalTime,
          success: inspection.passed
        });
      } catch {}
```

---

### 步骤 3：扩展 config.yml

**文件**: `.flowharness/config.yml`  
**位置**: 在现有 `hooks:` 区块末尾追加（不删除旧内容）

```yaml
  # 新增：结构化生命周期钩子
  lifecycle:
    pre_task:
      - id: "audit-pre-task"
        type: "builtin"
        action: "write_audit_log"
        on_fail: "skip"
        timeout: 5

    post_task:
      - id: "audit-post-task"
        type: "builtin"
        action: "write_audit_log"
        on_fail: "skip"
        timeout: 5

    on_supervisor_stop:
      - id: "save-checkpoint"
        type: "builtin"
        action: "save_checkpoint"
        on_fail: "skip"
        timeout: 10
```

---

### 步骤 4：创建测试文件

**文件**: `test/test-hook-engine.js`

```javascript
'use strict';

const assert = require('assert');
const { HookEngine } = require('../src/hook-engine');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    if (fn.constructor.name === 'AsyncFunction') {
      fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
          .catch(e => { failed++; console.log(`  ✗ ${name}: ${e.message}`); });
    } else {
      fn();
      passed++;
      console.log(`  ✓ ${name}`);
    }
  } catch (err) {
    failed++;
    console.log(`  ✗ ${name}: ${err.message}`);
  }
}

console.log('test-hook-engine.js');

test('should create HookEngine with empty config', () => {
  const engine = new HookEngine();
  assert.ok(engine);
});

test('should run hooks with no lifecycle configured', async () => {
  const engine = new HookEngine({});
  const results = await engine.runHooks('pre_task', {});
  assert.deepStrictEqual(results, []);
});

test('should execute builtin hook successfully', async () => {
  const engine = new HookEngine({
    hooks: {
      lifecycle: {
        pre_task: [
          { id: 'test-hook', type: 'builtin', action: 'write_audit_log', on_fail: 'skip', timeout: 5 }
        ]
      }
    }
  });
  const results = await engine.runHooks('pre_task', { test: true });
  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].status, 'success');
});

test('should block on failing block-hook', async () => {
  const engine = new HookEngine({
    hooks: {
      lifecycle: {
        pre_task: [
          { id: 'blocker', type: 'builtin', action: 'nonexistent_action', on_fail: 'block', timeout: 5 }
        ]
      }
    }
  });
  try {
    await engine.runHooks('pre_task', {});
    assert.fail('Should have thrown');
  } catch (err) {
    assert.ok(err.message.includes('Hook blocked'));
  }
});

test('should skip on condition not met', async () => {
  const engine = new HookEngine({
    hooks: {
      lifecycle: {
        post_task: [
          {
            id: 'conditional',
            type: 'builtin',
            action: 'write_audit_log',
            on_fail: 'skip',
            condition: "task.type in ['feature']",
            timeout: 5
          }
        ]
      }
    }
  });
  const results = await engine.runHooks('post_task', { task: { type: 'bug_fix' } });
  assert.strictEqual(results[0].status, 'skipped');
});

test('should execute when condition met', async () => {
  const engine = new HookEngine({
    hooks: {
      lifecycle: {
        post_task: [
          {
            id: 'conditional',
            type: 'builtin',
            action: 'write_audit_log',
            on_fail: 'skip',
            condition: "task.type in ['feature', 'bug_fix']",
            timeout: 5
          }
        ]
      }
    }
  });
  const results = await engine.runHooks('post_task', { task: { type: 'feature' } });
  assert.strictEqual(results[0].status, 'success');
});

// 等异步测试完成
setTimeout(() => {
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}, 2000);
```

---

## 验证清单

- [ ] `src/hook-engine.js` 已创建，可正常 require
- [ ] supervisor-agent.js 构造函数中初始化了 HookEngine
- [ ] handleTask() 中有 pre_task / post_task / on_supervisor_stop 三个钩子调用点
- [ ] config.yml 新增了 lifecycle 区块，旧格式 echo 钩子仍存在
- [ ] `node test/test-hook-engine.js` 全部通过（6个断言）
- [ ] `npm test` 全部通过
- [ ] block 策略钩子失败时确实阻止了执行

---

## 可并行信息

| 属性 | 值 |
|------|-----|
| 可并行端 | 可与 A1/A2/B1/B2 并行；建议在 B3 之后或同步执行 |
| 依赖前置 | 无硬依赖（但建议在 B3 之后，共享 supervisor-agent.js 的修改） |
| 被依赖 | C2（命令系统需要 CLI 空间）、D（Token钩子需要 HookEngine） |
| 冲突文件 | supervisor-agent.js（与 B3 共享，注意合并） |
| 预计耗时 | 40-60分钟 |
