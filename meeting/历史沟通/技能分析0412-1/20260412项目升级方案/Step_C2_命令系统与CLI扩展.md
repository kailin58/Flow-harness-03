# Step C2：命令系统注册表 + CLI 命令扩展

> **复制本文件给任意 Agent 端（Cursor / Claude Code / Codex）即可独立执行**  
> **可与 Step C1 并行执行**（C2 修改 cli.js 的不同位置）

---

## 上下文

Flow Harness CLI（`src/cli.js`）当前支持 init/list/run/supervisor/stats/optimize/agents/check-file/check-cmd 命令。参考 ECC（79+ 斜杠命令）和 Impeccable（18 个命令），我们需要添加预定义的命令快捷方式，使用户可以直接用 `/plan`、`/build`、`/review` 等方式触发 Supervisor 工作流。

### 设计约束
- 命令只是 Supervisor 调用的语法糖，不引入新逻辑
- 命令注册表存放在 `.flowharness/commands/registry.json`
- CLI 新增 `cmd` 子命令来解析斜杠命令

---

## 边界定义

### 本步骤 ONLY 创建/修改
1. `.flowharness/commands/` —— 新建目录
2. `.flowharness/commands/registry.json` —— 命令注册表
3. `src/cli.js` —— 新增 `cmd` 子命令 + `history` 子命令 + `status` 子命令

### 本步骤 NOT 修改
- supervisor-agent.js（C1 负责钩子集成）
- agent-executor.js
- config.yml（钩子扩展在 C1 做）
- AGENTS.md

---

## 执行步骤

### 步骤 1：创建命令注册表目录

```bash
mkdir -p .flowharness/commands
```

Windows PowerShell:
```powershell
New-Item -ItemType Directory -Force -Path ".flowharness/commands"
```

---

### 步骤 2：创建 .flowharness/commands/registry.json

```json
{
  "version": "1.0",
  "description": "Flow Harness 预定义命令注册表 - 斜杠命令是 Supervisor 工作流的快捷入口",
  "commands": {
    "/plan": {
      "type": "workflow",
      "task_type": "planning",
      "flags": ["--dry-run"],
      "description": "规划任务（只分析不执行）",
      "example": "/plan 用户认证功能"
    },
    "/build": {
      "type": "workflow",
      "task_type": "feature",
      "description": "功能开发工作流",
      "example": "/build 实现用户注册"
    },
    "/fix": {
      "type": "workflow",
      "task_type": "bug_fix",
      "description": "Bug 修复工作流",
      "example": "/fix 登录页面空白"
    },
    "/refactor": {
      "type": "workflow",
      "task_type": "refactor",
      "description": "代码重构工作流",
      "example": "/refactor 提取公共工具函数"
    },
    "/docs": {
      "type": "workflow",
      "task_type": "documentation",
      "description": "文档生成工作流",
      "example": "/docs API 接口文档"
    },
    "/test": {
      "type": "workflow",
      "task_type": "testing",
      "description": "测试编写工作流",
      "example": "/test 为 hook-engine 写单元测试"
    },
    "/review": {
      "type": "inspector",
      "skills": ["code-review", "security-review"],
      "description": "代码审查",
      "example": "/review src/agent-executor.js"
    },
    "/security": {
      "type": "inspector",
      "skills": ["security-review"],
      "description": "专项安全扫描",
      "example": "/security src/"
    },
    "/quality": {
      "type": "inspector",
      "skills": ["code-review", "antipattern-detect"],
      "description": "全面质量检查",
      "example": "/quality"
    },
    "/antipattern": {
      "type": "inspector",
      "skills": ["antipattern-detect"],
      "description": "反模式检测",
      "example": "/antipattern src/supervisor-agent.js"
    },
    "/status": {
      "type": "management",
      "action": "show_status",
      "description": "查看系统状态"
    },
    "/budget": {
      "type": "management",
      "action": "show_budget",
      "description": "Token 预算查看"
    },
    "/skills": {
      "type": "management",
      "action": "list_skills",
      "description": "列出已激活技能"
    },
    "/history": {
      "type": "management",
      "action": "show_history",
      "description": "最近执行历史"
    }
  }
}
```

---

### 步骤 3：在 cli.js 中新增 cmd 子命令

**文件**: `src/cli.js`  
**位置**: 在 `program.parse()` 之前添加

```javascript
// ============ 斜杠命令系统 ============
program
  .command('cmd <slash_command> [args...]')
  .description('执行预定义斜杠命令 (如 /plan, /build, /review 等)')
  .addHelpText('after', `
示例:
  $ flowharness cmd /plan 用户认证功能
  $ flowharness cmd /build 实现注册接口
  $ flowharness cmd /fix 登录Bug
  $ flowharness cmd /review src/index.js
  $ flowharness cmd /status
`)
  .action(async (slashCmd, args) => {
    try {
      // 加载命令注册表
      const fs = require('fs');
      const cmdRegistryPath = path.join(process.cwd(), '.flowharness', 'commands', 'registry.json');
      
      if (!fs.existsSync(cmdRegistryPath)) {
        console.error(chalk.red('命令注册表不存在: .flowharness/commands/registry.json'));
        console.log(chalk.gray('运行 flowharness init 初始化'));
        process.exit(1);
      }
      
      const cmdRegistry = JSON.parse(fs.readFileSync(cmdRegistryPath, 'utf8'));
      
      // 确保斜杠前缀
      const cmdKey = slashCmd.startsWith('/') ? slashCmd : `/${slashCmd}`;
      const cmdDef = cmdRegistry.commands[cmdKey];
      
      if (!cmdDef) {
        console.error(chalk.red(`未知命令: ${cmdKey}`));
        console.log(chalk.cyan('\n可用命令:'));
        for (const [key, def] of Object.entries(cmdRegistry.commands)) {
          console.log(`  ${chalk.green(key.padEnd(15))} ${def.description}`);
        }
        process.exit(1);
      }
      
      const argsStr = args.join(' ');
      
      // 管理命令（不走 Supervisor）
      if (cmdDef.type === 'management') {
        await handleManagementCommand(cmdDef.action, argsStr);
        return;
      }
      
      // 工作流命令 → 调用 Supervisor
      if (cmdDef.type === 'workflow') {
        console.log(chalk.blue(`\n🚀 执行命令: ${cmdKey} ${argsStr}\n`));
        
        const configPath = path.join(process.cwd(), '.flowharness', 'config.yml');
        const harness = new FlowHarness(configPath);
        const supervisor = new SupervisorAgent(harness.config);
        
        const taskDesc = `${cmdDef.description}: ${argsStr}`;
        const isDryRun = (cmdDef.flags || []).includes('--dry-run');
        
        if (isDryRun) {
          const analysis = await supervisor.step1_analyze(taskDesc, {});
          const decomposition = await supervisor.step2_decompose(analysis);
          console.log(chalk.cyan('📋 执行计划 (预览):'));
          console.log(`  类型: ${analysis.type}`);
          console.log(`  子任务: ${decomposition.subtasks?.length || 0} 个`);
          if (decomposition.subtasks) {
            decomposition.subtasks.forEach((st, i) => {
              console.log(`  ${i + 1}. ${st.name}`);
            });
          }
        } else {
          const result = await supervisor.handleTask(taskDesc, {});
          console.log(result.success ? chalk.green('✅ 完成') : chalk.red('❌ 失败'));
        }
        return;
      }
      
      // Inspector 命令 → 调用 Supervisor 并指定 Inspector
      if (cmdDef.type === 'inspector') {
        console.log(chalk.blue(`\n🔍 执行检查: ${cmdKey} ${argsStr}\n`));
        
        const configPath = path.join(process.cwd(), '.flowharness', 'config.yml');
        const harness = new FlowHarness(configPath);
        const supervisor = new SupervisorAgent(harness.config);
        
        const taskDesc = `代码检查 - ${cmdDef.description}: ${argsStr}`;
        const result = await supervisor.handleTask(taskDesc, {
          forceAgent: 'inspector',
          skills: cmdDef.skills
        });
        console.log(result.success ? chalk.green('✅ 检查通过') : chalk.yellow('⚠️ 发现问题'));
        return;
      }
      
    } catch (err) {
      console.error(chalk.red(`命令执行失败: ${err.message}`));
      process.exit(1);
    }
  });

// 管理命令处理
async function handleManagementCommand(action, args) {
  const fs = require('fs');
  
  switch (action) {
    case 'show_status': {
      console.log(chalk.blue('\n📊 Flow Harness 系统状态\n'));
      const patternsPath = path.join(process.cwd(), '.flowharness', 'knowledge', 'patterns.json');
      if (fs.existsSync(patternsPath)) {
        const patterns = JSON.parse(fs.readFileSync(patternsPath, 'utf8'));
        console.log(`  总运行: ${patterns.statistics?.total_runs || 0} 次`);
        console.log(`  成功: ${patterns.statistics?.successful_runs || 0}`);
        console.log(`  失败: ${patterns.statistics?.failed_runs || 0}`);
        const rate = patterns.statistics?.total_runs
          ? ((patterns.statistics.successful_runs / patterns.statistics.total_runs) * 100).toFixed(1)
          : 0;
        console.log(`  成功率: ${rate}%`);
      }
      console.log('');
      break;
    }
    
    case 'show_budget': {
      console.log(chalk.blue('\n💰 Token 预算（Phase D 实现后完善）\n'));
      console.log(chalk.gray('  尚未配置 Token 追踪'));
      console.log('');
      break;
    }
    
    case 'list_skills': {
      // 复用 skills 命令逻辑
      const { SkillLoader } = require('./skill-loader');
      const loader = new SkillLoader({ rootDir: process.cwd() });
      await loader.loadRegistry();
      const skills = loader.listSkills();
      console.log(chalk.blue(`\n📚 技能列表 (${skills.length} 个)\n`));
      for (const s of skills) {
        console.log(`  ${chalk.green('●')} [${(s.agent || '').padEnd(10)}] ${s.id}`);
      }
      console.log('');
      break;
    }
    
    case 'show_history': {
      console.log(chalk.blue('\n📜 最近执行历史\n'));
      const patternsPath = path.join(process.cwd(), '.flowharness', 'knowledge', 'patterns.json');
      if (fs.existsSync(patternsPath)) {
        const patterns = JSON.parse(fs.readFileSync(patternsPath, 'utf8'));
        const allPatterns = [
          ...(patterns.successful_patterns || []),
          ...(patterns.failure_patterns || [])
        ].sort((a, b) => new Date(b.learned_at) - new Date(a.learned_at)).slice(0, 10);
        
        for (const p of allPatterns) {
          const icon = p.success_rate ? chalk.green('✓') : chalk.red('✗');
          console.log(`  ${icon} ${p.pattern} (${p.success_count || p.failure_count || 0} runs)`);
        }
      }
      console.log('');
      break;
    }
    
    default:
      console.log(chalk.yellow(`未知管理命令: ${action}`));
  }
}
```

---

## 验证清单

- [ ] `.flowharness/commands/registry.json` 存在且包含 14 个命令定义
- [ ] `node src/cli.js cmd /plan 用户认证` 正确执行（dry-run 模式，只展示计划）
- [ ] `node src/cli.js cmd /build 实现登录` 正确调用 Supervisor
- [ ] `node src/cli.js cmd /status` 输出系统状态
- [ ] `node src/cli.js cmd /skills` 列出技能
- [ ] `node src/cli.js cmd /history` 显示历史
- [ ] `node src/cli.js cmd /unknown` 报错并列出可用命令
- [ ] `npm test` 全部通过

---

## 可并行信息

| 属性 | 值 |
|------|-----|
| 可并行端 | 可与 C1 并行（修改 cli.js 的不同区域） |
| 依赖前置 | B1（需要 SkillLoader 用于 /skills 命令）；若无 B1，/skills 会报错但其他命令正常 |
| 被依赖 | Phase D 的 /budget 命令需要本步骤的框架 |
| 冲突文件 | cli.js（与 B3 和 C1 共享，注意合并位置） |
| 预计耗时 | 30-45分钟 |
