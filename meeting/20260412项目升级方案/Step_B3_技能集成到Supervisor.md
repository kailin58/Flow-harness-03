# Step B3：技能系统集成到 Supervisor 调度链路

> **复制本文件给任意 Agent 端（Cursor / Claude Code / Codex）即可独立执行**  
> **需等待 Step B1 + B2 完成**

---

## 上下文

Step B1 创建了 SkillLoader，Step B2 创建了 12 个技能文件。本步骤将技能系统接入 Supervisor 6步闭环的调度链路，使 CEO 在分工（Step 3）时自动为总监匹配并注入技能上下文。

### 关键约束
- **不修改 6步闭环结构**（handleTask / step1-6 方法签名不变）
- **最小侵入**：只在 task-dispatcher.js 中增加方法、在 supervisor-agent.js 中增加初始化
- **技能注入是可选的**：如果 SkillLoader 加载失败或无匹配技能，不影响原有流程

### 涉及的现有代码关键位置
- `src/supervisor-agent.js` 第 15-57 行：构造函数（初始化各组件）
- `src/supervisor-agent.js` 第 334-384 行：`executeTask()` 方法（调用 agentExecutor）
- `src/supervisor-agent.js` 第 389-410 行：`buildAgentTask()` 方法（构建任务对象）
- `src/task-dispatcher.js`：dispatch() 方法

---

## 边界定义

### 本步骤 ONLY 修改
1. `src/supervisor-agent.js` —— 构造函数中新增 SkillLoader 初始化（1行）
2. `src/supervisor-agent.js` —— `executeTask()` 方法中注入技能上下文（3-5行）
3. `src/task-dispatcher.js` —— 新增 `enrichTaskWithSkills()` 方法（不修改已有方法）
4. `src/cli.js` —— 新增 `skills` 子命令（列出技能）

### 本步骤 NOT 修改
- AGENTS.md / config.yml
- 6步闭环的 step1-step6 方法
- agent-executor.js（Phase E 负责）
- 任何现有方法的签名或返回值

---

## 执行步骤

### 步骤 1：在 supervisor-agent.js 构造函数中初始化 SkillLoader

**文件**: `src/supervisor-agent.js`  
**位置**: 构造函数中，在 `this.currentTask = null;` 之前

**新增代码**:

```javascript
// 在 require 区域（文件顶部）添加：
const { SkillLoader } = require('./skill-loader');

// 在构造函数中，this.evolutionEngine = ... 之后添加：
this.skillLoader = new SkillLoader({ rootDir: process.cwd() });
```

---

### 步骤 2：在 task-dispatcher.js 中新增 enrichTaskWithSkills

**文件**: `src/task-dispatcher.js`  
**位置**: 在 class 末尾、`module.exports` 之前新增方法

```javascript
  /**
   * 用匹配的技能上下文丰富任务对象
   * @param {Object} task - 任务对象
   * @param {string} agentRole - Agent 角色 (explore/plan/general/inspector)
   * @param {Object} skillLoader - SkillLoader 实例
   * @returns {Object} 增强后的任务对象
   */
  async enrichTaskWithSkills(task, agentRole, skillLoader) {
    if (!skillLoader) return task;

    try {
      const matchedSkills = await skillLoader.matchSkills(agentRole, task.description || task.name || '');
      if (matchedSkills.length > 0) {
        task.skillContext = matchedSkills.map(s => ({
          id: s.id,
          name: s.name,
          guidance: s.content
        }));
      }
    } catch (e) {
      // 技能匹配失败不阻塞主流程
    }

    return task;
  }
```

---

### 步骤 3：在 executeTask 中调用技能注入

**文件**: `src/supervisor-agent.js`  
**位置**: `executeTask()` 方法（约第 334 行），在 `const task = this.buildAgentTask(subtask, agentId);` 之后、`const result = await this.agentExecutor.execute(...)` 之前

**新增代码**（插入到两行之间）:

```javascript
      // 注入技能上下文
      if (this.skillLoader && agentId) {
        await this.taskDispatcher.enrichTaskWithSkills(task, agentId, this.skillLoader);
      }
```

完整上下文应该看起来像：
```javascript
      const task = this.buildAgentTask(subtask, agentId);

      // 注入技能上下文
      if (this.skillLoader && agentId) {
        await this.taskDispatcher.enrichTaskWithSkills(task, agentId, this.skillLoader);
      }

      const result = await this.agentExecutor.execute(agentId, task, this.currentTask.context);
```

---

### 步骤 4：在 cli.js 中新增 skills 命令

**文件**: `src/cli.js`  
**位置**: 在最后一个 `.command(...)` 之前、`program.parse()` 之前

```javascript
// 技能列表命令
program
  .command('skills')
  .description('列出所有已注册的技能')
  .option('--agent <role>', '按 Agent 角色过滤 (explore/plan/general/inspector)')
  .action(async (options) => {
    try {
      const { SkillLoader } = require('./skill-loader');
      const loader = new SkillLoader({ rootDir: process.cwd() });
      await loader.loadRegistry();
      
      const skills = loader.listSkills(options.agent);
      
      if (skills.length === 0) {
        console.log(chalk.yellow('未找到技能。请检查 .flowharness/skills/registry.json'));
        return;
      }
      
      console.log(chalk.blue(`\n📚 Flow Harness 技能列表 (${skills.length} 个)\n`));
      
      let currentAgent = '';
      for (const skill of skills) {
        const agent = skill.agent || skill.owner_agent || '';
        if (agent !== currentAgent) {
          currentAgent = agent;
          console.log(chalk.cyan(`  [${agent.toUpperCase()}]`));
        }
        const status = skill.status === 'active' ? chalk.green('●') : chalk.gray('○');
        console.log(`    ${status} ${skill.id} - ${skill.name || skill.id}`);
      }
      console.log('');
    } catch (err) {
      console.error(chalk.red('加载技能失败:'), err.message);
      process.exit(1);
    }
  });
```

---

## 验证清单

- [ ] `src/supervisor-agent.js` 顶部新增了 `require('./skill-loader')`
- [ ] 构造函数中初始化了 `this.skillLoader`
- [ ] `executeTask()` 中在 buildAgentTask 之后、execute 之前调用了 enrichTaskWithSkills
- [ ] `src/task-dispatcher.js` 新增了 `enrichTaskWithSkills()` 方法
- [ ] `node src/cli.js skills` 正确输出 12 个技能
- [ ] `node src/cli.js skills --agent inspector` 只输出 3 个技能
- [ ] `npm test` 全部通过（现有测试不退化）
- [ ] 没有修改任何已有方法的签名或返回值

---

## 可并行信息

| 属性 | 值 |
|------|-----|
| 可并行端 | 建议单端执行（涉及多文件协调修改） |
| 依赖前置 | B1 + B2 |
| 被依赖 | Phase C/D/E 不直接依赖（但 E 会使用 skillContext） |
| 冲突文件 | supervisor-agent.js, task-dispatcher.js, cli.js |
| 预计耗时 | 30-45分钟 |
