# Phase C：钩子与命令系统增强

**参考来源**: ECC (meeting\13-1 架构设计分析.md + 技能清单.md)  
**目标**: 升级 Hooks 系统从 echo 级别到生产级钩子；增加结构化斜杠命令体系  
**周期**: 1-2周  
**约束**: 不修改 `config.yml` 的 YAML 结构（向后兼容），只扩展钩子能力

---

## C1. 当前钩子系统问题

当前 `config.yml` 中的 hooks 配置：

```yaml
hooks:
  before_workflow:
    - "echo 'Starting workflow...'"
  after_workflow:
    - "echo 'Workflow completed'"
  on_error:
    - "echo 'Error occurred, rolling back...'"
  on_success:
    - "echo 'Success!'"
```

**问题**：
1. 只支持 shell 命令字符串，无结构化元数据
2. 没有 Pre/Post/Stop/Session/PreCompact 等生命周期区分（参考 ECC）
3. 没有超时控制
4. 没有钩子失败处理策略
5. 没有条件执行（只有全局钩子，无针对特定任务类型的钩子）

---

## C2. 增强版钩子格式设计

在 `config.yml` 中扩展（向后兼容，旧格式继续支持）：

```yaml
hooks:
  # 旧格式（继续支持）
  before_workflow:
    - "echo 'Starting...'"
  
  # 新增：结构化钩子（可选）
  lifecycle:
    pre_tool_use:
      - id: "token-check"
        type: "builtin"
        action: "token_budget_check"
        on_fail: "warn"          # warn | block | skip
        timeout: 5
      
    post_tool_use:
      - id: "audit-log"
        type: "builtin"
        action: "write_audit_log"
        on_fail: "skip"
        
    pre_task:
      - id: "policy-check"
        type: "builtin"
        action: "policy_validate"
        on_fail: "block"         # 安全相关钩子必须 block
        
    post_task:
      - id: "quality-gate"
        type: "builtin"
        action: "run_quality_gate"
        on_fail: "warn"
        condition: "task.type in ['feature', 'bug_fix']"
        
    on_supervisor_stop:
      - id: "save-checkpoint"
        type: "builtin"
        action: "save_checkpoint"
        on_fail: "skip"
        
    pre_compact:
      - id: "knowledge-extract"
        type: "builtin"
        action: "extract_patterns_before_compact"
        on_fail: "skip"
```

---

## C3. 钩子执行引擎实现

新增 `src/hook-engine.js`（新文件）：

```javascript
// src/hook-engine.js
class HookEngine {
  constructor(config, services) {
    this.config = config;
    this.services = services; // tokenTracker, policyChecker, qualityGate 等
    this.lifecycleHooks = config.hooks?.lifecycle || {};
  }

  // 钩子执行点枚举
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
      // 检查条件（如果有）
      if (hook.condition && !this.evalCondition(hook.condition, context)) {
        continue;
      }

      try {
        const result = await this.executeHook(hook, context);
        results.push({ id: hook.id, status: 'success', result });
      } catch (err) {
        results.push({ id: hook.id, status: 'failed', error: err.message });
        
        if (hook.on_fail === 'block') {
          throw new Error(`Blocking hook failed: ${hook.id} - ${err.message}`);
        }
        // warn 或 skip: 记录日志继续
      }
    }

    return results;
  }

  async executeHook(hook, context) {
    switch (hook.type) {
      case 'builtin':
        return await this.executeBuiltinHook(hook.action, context);
      case 'shell':
        return await this.executeShellHook(hook.command, hook.timeout || 30);
      default:
        throw new Error(`Unknown hook type: ${hook.type}`);
    }
  }

  async executeBuiltinHook(action, context) {
    switch (action) {
      case 'token_budget_check':
        return await this.services.tokenTracker.checkBudget();
      case 'write_audit_log':
        return await this.services.logger.writeAudit(context);
      case 'policy_validate':
        return await this.services.policyChecker.validate(context);
      case 'run_quality_gate':
        return await this.services.qualityGate.run(context);
      case 'save_checkpoint':
        return await this.services.checkpointManager.save(context);
      case 'extract_patterns_before_compact':
        return await this.services.knowledgeBase.extractPatterns(context);
      default:
        throw new Error(`Unknown builtin hook action: ${action}`);
    }
  }

  evalCondition(condition, context) {
    // 简单安全的条件求值（不使用 eval）
    try {
      const parts = condition.split(' in ');
      if (parts.length === 2) {
        const field = parts[0].trim();
        const values = JSON.parse(parts[1].trim());
        const fieldValue = field.split('.').reduce((obj, key) => obj?.[key], context);
        return values.includes(fieldValue);
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

## C4. 集成到 Supervisor（最小侵入）

在 `src/supervisor-agent.js` 的 execute 方法中注入钩子调用：

```javascript
// 在 Step 3 (Assign) 之前：pre_task 钩子
await this.hookEngine.runHooks(HookEngine.LIFECYCLE.PRE_TASK, { task });

// 在 Step 4 (Execute) 之后：post_task 钩子
await this.hookEngine.runHooks(HookEngine.LIFECYCLE.POST_TASK, { task, result });

// 在 Supervisor 停止时：on_supervisor_stop 钩子
await this.hookEngine.runHooks(HookEngine.LIFECYCLE.ON_SUPERVISOR_STOP, { summary });
```

---

## C5. 命令系统设计（参考 ECC + Impeccable）

### 设计理念

- **斜杠命令** = 预定义的任务模板，触发特定的 Supervisor 工作流
- **不是新功能**，而是对现有 Supervisor 6步闭环的快捷入口
- **不增加新 Agent**，只是预配置任务参数

### 命令分类

#### 工作流命令（直接触发 Supervisor）

| 命令 | 等价调用 | 说明 |
|------|---------|------|
| `/plan <task>` | `supervisor analyze --detailed` | 规划模式（只分析不执行） |
| `/build <task>` | `supervisor "实现: <task>"` | 功能开发工作流 |
| `/fix <bug>` | `supervisor "修复: <bug>" --type=bug_fix` | Bug修复工作流 |
| `/refactor <target>` | `supervisor "重构: <target>" --type=refactor` | 重构工作流 |
| `/docs <scope>` | `supervisor "文档: <scope>" --type=documentation` | 文档生成工作流 |

#### 审查命令（触发 Inspector Agent）

| 命令 | 说明 |
|------|------|
| `/review [file]` | 代码审查（启用 security-review + code-review 技能） |
| `/security [file]` | 专项安全扫描 |
| `/quality` | 全面质量门禁检查 |
| `/antipattern [file]` | 反模式检测（Impeccable 风格） |

#### 管理命令

| 命令 | 说明 |
|------|------|
| `/status` | 查看系统状态 + 当前熔断器状态 |
| `/budget` | Token 预算查看 |
| `/skills` | 列出已激活技能 |
| `/history` | 最近10次执行历史 |

### 命令注册文件

`.flowharness/commands/registry.json`：

```json
{
  "version": "1.0",
  "commands": {
    "/plan": {
      "type": "workflow",
      "task_type": "planning",
      "flags": ["--dry-run"],
      "description": "规划任务，不执行"
    },
    "/build": {
      "type": "workflow",
      "task_type": "feature",
      "description": "功能开发工作流"
    },
    "/fix": {
      "type": "workflow",
      "task_type": "bug_fix",
      "description": "Bug修复工作流"
    },
    "/review": {
      "type": "inspector",
      "skills": ["code-review", "security-review"],
      "description": "代码审查"
    },
    "/antipattern": {
      "type": "inspector",
      "skills": ["antipattern-detect"],
      "description": "反模式检测"
    }
  }
}
```

---

## C6. CLI 命令集成

在 `src/cli.js` 中新增命令解析（最小侵入）：

```javascript
// 新增：斜杠命令解析
program
  .command('cmd <slash_command> [args...]')
  .description('执行预定义命令（如 /plan, /build, /review）')
  .action(async (slashCmd, args) => {
    const cmdRegistry = await loadCommandRegistry();
    const cmdDef = cmdRegistry.commands[slashCmd];
    
    if (!cmdDef) {
      console.error(`未知命令: ${slashCmd}`);
      console.log('可用命令:', Object.keys(cmdRegistry.commands).join(', '));
      process.exit(1);
    }
    
    // 转换为 supervisor 调用
    const taskDesc = `${cmdDef.description}: ${args.join(' ')}`;
    await runSupervisor(taskDesc, { type: cmdDef.task_type });
  });
```

---

## C7. 验收标准

| 指标 | 要求 |
|------|------|
| 钩子生命周期完整 | 6种生命周期全部可配置 |
| 钩子失败策略 | block/warn/skip 全部生效 |
| 命令注册完整 | ≥10个命令注册且可执行 |
| 向后兼容 | 旧 echo 格式钩子继续工作 |
| 条件钩子 | condition 表达式正确求值 |
| 测试覆盖 | 新增文件测试覆盖 ≥80% |

---

## C8. 实施顺序

```
Day 1-2: 创建 HookEngine + config.yml 扩展格式（向后兼容）
Day 3:   集成 HookEngine 到 supervisor-agent.js
Day 4:   命令注册表 + CLI cmd 子命令
Day 5:   编写生命周期测试
Day 6-8: 回归测试 + 边界条件验证
```
