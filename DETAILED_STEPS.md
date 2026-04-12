# Flow Harness 详细实施步骤（小步快跑）

每步 30-60 分钟，可独立测试和验证

---

## Phase 3: Agent Registry（8小步）

### Step 3.1: 创建 AgentRegistry 基础类
**时间**: 30分钟  
**文件**: `src/agent-registry.js`

**任务**:
```javascript
class AgentRegistry {
  constructor() {
    this.agents = new Map();
    this.capabilities = new Map();
  }
  
  // 基础方法框架
  register(agentId, agentConfig) { }
  get(agentId) { }
  list() { }
}
```

**测试**:
```bash
node -e "const AR = require('./src/agent-registry'); const r = new AR(); console.log('✓ 创建成功')"
```

---

### Step 3.2: 注册 5 个核心 Agent
**时间**: 30分钟

**任务**:
```javascript
initializeCoreAgents() {
  this.register('supervisor', {
    name: 'Supervisor Agent',
    role: 'CEO',
    capabilities: ['analyze', 'dispatch', 'inspect', 'review']
  });
  
  this.register('explore', {
    name: 'Explore Agent',
    role: '总监1',
    capabilities: ['file_search', 'code_search', 'dependency_analysis']
  });
  
  // ... 其他 3 个
}
```

**测试**:
```bash
node src/cli.js agents list
# 应显示 5 个 Agent
```

---

### Step 3.3: 实现能力查询
**时间**: 30分钟

**任务**:
```javascript
findByCapability(capability) {
  const agents = [];
  for (const [id, agent] of this.agents) {
    if (agent.capabilities.includes(capability)) {
      agents.push({ id, ...agent });
    }
  }
  return agents;
}
```

**测试**:
```javascript
const agents = registry.findByCapability('code_search');
console.log(agents); // 应返回 Explore Agent
```

---

### Step 3.4: 实现能力匹配算法
**时间**: 45分钟

**任务**:
```javascript
matchBestAgent(task) {
  // 根据任务类型匹配
  const typeMap = {
    'explore': 'explore',
    'analyze': 'plan',
    'plan': 'plan',
    'code': 'general',
    'test': 'inspector'
  };
  
  const agentId = typeMap[task.type];
  return this.get(agentId);
}
```

**测试**:
```javascript
const agent = registry.matchBestAgent({ type: 'explore' });
console.log(agent.name); // 应返回 Explore Agent
```

---

### Step 3.5: 添加子 Agent 注册
**时间**: 30分钟

**任务**:
```javascript
registerSubAgent(parentId, subAgentConfig) {
  const parent = this.get(parentId);
  if (!parent.subAgents) {
    parent.subAgents = [];
  }
  parent.subAgents.push(subAgentConfig);
}

listSubAgents(parentId) {
  const parent = this.get(parentId);
  return parent.subAgents || [];
}
```

**测试**:
```javascript
registry.registerSubAgent('explore', {
  name: 'FileSearchAgent',
  capability: 'file_search'
});
```

---

### Step 3.6: 集成到 Supervisor（读取）
**时间**: 30分钟

**任务**:
```javascript
// src/supervisor-agent.js
constructor(config) {
  // ...
  this.agentRegistry = new AgentRegistry();
  this.agentRegistry.initializeCoreAgents();
}
```

**测试**:
```bash
node src/cli.js supervisor "测试任务" --dry-run
# 应正常运行
```

---

### Step 3.7: 集成到 TaskDispatcher（使用）
**时间**: 45分钟

**任务**:
```javascript
// src/task-dispatcher.js
selectExecutor(subtask, context) {
  // 使用 Registry 而不是硬编码
  const agent = this.agentRegistry.matchBestAgent(subtask);
  return {
    name: agent.name,
    capabilities: agent.capabilities,
    // ...
  };
}
```

**测试**:
```bash
node src/cli.js supervisor "实现功能" --dry-run
# 检查 Agent 分配是否正确
```

---

### Step 3.8: 添加 CLI 命令查看 Agent
**时间**: 30分钟

**任务**:
```javascript
// src/cli.js
program
  .command('agents')
  .description('List all registered agents')
  .action(() => {
    const registry = new AgentRegistry();
    registry.initializeCoreAgents();
    
    console.log('Registered Agents:');
    for (const agent of registry.list()) {
      console.log(`- ${agent.name} (${agent.role})`);
      console.log(`  Capabilities: ${agent.capabilities.join(', ')}`);
    }
  });
```

**测试**:
```bash
node src/cli.js agents
```

---

## Phase 4: 真实 Agent 执行（12小步）

### Step 4.1: 创建 AgentExecutor 基础类
**时间**: 30分钟  
**文件**: `src/agent-executor.js`

**任务**:
```javascript
class AgentExecutor {
  constructor(agentRegistry) {
    this.agentRegistry = agentRegistry;
  }
  
  async execute(agentId, task, context) {
    const agent = this.agentRegistry.get(agentId);
    // 框架代码
  }
}
```

---

### Step 4.2: 实现 Explore Agent - 文件搜索
**时间**: 45分钟

**任务**:
```javascript
async executeExploreAgent(task, context) {
  if (task.action === 'file_search') {
    // 使用 Glob 工具
    const pattern = task.pattern || '**/*.js';
    const files = await this.glob(pattern);
    return { files, count: files.length };
  }
}
```

**测试**:
```javascript
const result = await executor.execute('explore', {
  action: 'file_search',
  pattern: 'src/**/*.js'
});
console.log(result.files);
```

---

### Step 4.3: 实现 Explore Agent - 代码搜索
**时间**: 45分钟

**任务**:
```javascript
async executeExploreAgent(task, context) {
  if (task.action === 'code_search') {
    // 使用 Grep 工具
    const results = await this.grep(task.pattern);
    return { matches: results };
  }
}
```

**测试**:
```javascript
const result = await executor.execute('explore', {
  action: 'code_search',
  pattern: 'class.*Agent'
});
```

---

### Step 4.4: 实现 Explore Agent - 文件读取
**时间**: 30分钟

**任务**:
```javascript
async executeExploreAgent(task, context) {
  if (task.action === 'read_file') {
    // 使用 Read 工具
    const content = await this.read(task.filePath);
    return { content, path: task.filePath };
  }
}
```

---

### Step 4.5: 实现 Plan Agent - 需求分析
**时间**: 45分钟

**任务**:
```javascript
async executePlanAgent(task, context) {
  if (task.action === 'analyze_requirement') {
    // 使用 TaskAnalyzer
    const analysis = this.taskAnalyzer.analyze(task.requirement);
    return analysis;
  }
}
```

---

### Step 4.6: 实现 Plan Agent - 方案设计
**时间**: 45分钟

**任务**:
```javascript
async executePlanAgent(task, context) {
  if (task.action === 'design_solution') {
    // 使用 TaskDecomposer
    const plan = this.taskDecomposer.decompose(task.analysis);
    return plan;
  }
}
```

---

### Step 4.7: 实现 General Agent - 文件编辑
**时间**: 45分钟

**任务**:
```javascript
async executeGeneralAgent(task, context) {
  if (task.action === 'edit_file') {
    // 使用 Edit 工具
    await this.edit(task.filePath, task.oldString, task.newString);
    return { success: true, file: task.filePath };
  }
}
```

---

### Step 4.8: 实现 General Agent - 文件创建
**时间**: 30分钟

**任务**:
```javascript
async executeGeneralAgent(task, context) {
  if (task.action === 'create_file') {
    // 使用 Write 工具
    await this.write(task.filePath, task.content);
    return { success: true, file: task.filePath };
  }
}
```

---

### Step 4.9: 实现 General Agent - 命令执行
**时间**: 45分钟

**任务**:
```javascript
async executeGeneralAgent(task, context) {
  if (task.action === 'run_command') {
    // 使用 Bash 工具
    const result = await this.bash(task.command);
    return result;
  }
}
```

---

### Step 4.10: 实现 Inspector Agent - 集成现有
**时间**: 30分钟

**任务**:
```javascript
async executeInspectorAgent(task, context) {
  // 使用现有的 Inspector 类
  const result = await this.inspector.inspect(
    task.execution,
    task.analysis,
    context
  );
  return result;
}
```

---

### Step 4.11: 替换 Supervisor 的模拟执行
**时间**: 60分钟

**任务**:
```javascript
// src/supervisor-agent.js
async executeTask(item) {
  // 不再使用 simulateExecution
  // 使用 AgentExecutor
  const result = await this.agentExecutor.execute(
    item.executor.name,
    item.subtask,
    this.currentTask.context
  );
  return result;
}
```

---

### Step 4.12: 端到端测试
**时间**: 60分钟

**任务**:
- 运行完整的任务流程
- 验证所有 Agent 真实执行
- 检查测试通过率

**测试**:
```bash
bash test-suite.sh
# 目标：通过率 > 90%
```

---

## Phase 5: 安全和监控（10小步）

### Step 5.1: 创建 SandboxManager 基础类
**时间**: 30分钟  
**文件**: `src/sandbox-manager.js`

**任务**:
```javascript
class SandboxManager {
  constructor() {
    this.activeSandboxes = new Map();
  }
  
  async createSandbox(taskId) { }
  async destroySandbox(taskId) { }
}
```

---

### Step 5.2: 实现 Worktree 沙箱创建
**时间**: 45分钟

**任务**:
```javascript
async createSandbox(taskId) {
  // 使用 EnterWorktree 工具
  const worktreeName = `task-${taskId}`;
  await this.enterWorktree(worktreeName);
  
  this.activeSandboxes.set(taskId, {
    type: 'worktree',
    name: worktreeName,
    createdAt: Date.now()
  });
}
```

---

### Step 5.3: 实现沙箱清理
**时间**: 30分钟

**任务**:
```javascript
async destroySandbox(taskId, keepChanges = false) {
  const sandbox = this.activeSandboxes.get(taskId);
  
  // 使用 ExitWorktree 工具
  await this.exitWorktree(keepChanges ? 'keep' : 'remove');
  
  this.activeSandboxes.delete(taskId);
}
```

---

### Step 5.4: 集成沙箱到 Supervisor
**时间**: 45分钟

**任务**:
```javascript
async step4_execute(assignment) {
  // 创建沙箱
  const taskId = this.currentTask.id;
  await this.sandboxManager.createSandbox(taskId);
  
  try {
    // 在沙箱中执行
    const results = await this.executeInSandbox(assignment);
    return results;
  } finally {
    // 清理沙箱
    await this.sandboxManager.destroySandbox(taskId);
  }
}
```

---

### Step 5.5: 创建 ExecutionMonitor 基础类
**时间**: 30分钟  
**文件**: `src/execution-monitor.js`

**任务**:
```javascript
class ExecutionMonitor {
  constructor() {
    this.monitors = new Map();
  }
  
  startMonitoring(executionId) { }
  stopMonitoring(executionId) { }
  getMetrics(executionId) { }
}
```

---

### Step 5.6: 实现执行时间监控
**时间**: 45分钟

**任务**:
```javascript
startMonitoring(executionId) {
  const monitor = {
    startTime: Date.now(),
    timeout: 300000, // 5分钟
    timer: setTimeout(() => {
      this.handleTimeout(executionId);
    }, 300000)
  };
  
  this.monitors.set(executionId, monitor);
}
```

---

### Step 5.7: 实现偏差检测
**时间**: 45分钟

**任务**:
```javascript
detectDeviation(execution, expectedPlan) {
  const deviations = [];
  
  // 检查执行顺序
  if (execution.order !== expectedPlan.order) {
    deviations.push('执行顺序偏差');
  }
  
  // 检查执行时间
  if (execution.time > expectedPlan.estimatedTime * 2) {
    deviations.push('执行时间超出预期');
  }
  
  return deviations;
}
```

---

### Step 5.8: 创建 QualityGate 基础类
**时间**: 30分钟  
**文件**: `src/quality-gate.js`

**任务**:
```javascript
class QualityGate {
  async runChecks(execution) {
    const results = {
      lint: await this.runLint(),
      test: await this.runTests(),
      passed: false
    };
    
    results.passed = results.lint && results.test;
    return results;
  }
}
```

---

### Step 5.9: 实现自动 Lint 检查
**时间**: 45分钟

**任务**:
```javascript
async runLint() {
  try {
    // 运行 lint 命令
    await this.bash('npm run lint');
    return true;
  } catch (error) {
    console.log('Lint 失败:', error.message);
    return false;
  }
}
```

---

### Step 5.10: 实现自动测试运行
**时间**: 45分钟

**任务**:
```javascript
async runTests() {
  try {
    // 运行测试命令
    await this.bash('npm test');
    return true;
  } catch (error) {
    console.log('测试失败:', error.message);
    return false;
  }
}
```

---

## 总结

### Phase 3: Agent Registry
- **8 小步**
- **总时间**: 4-5 小时
- **每步**: 30-45 分钟

### Phase 4: 真实 Agent 执行
- **12 小步**
- **总时间**: 7-9 小时
- **每步**: 30-60 分钟

### Phase 5: 安全和监控
- **10 小步**
- **总时间**: 6-7 小时
- **每步**: 30-45 分钟

---

## 实施建议

### 每天节奏
- **上午**: 2-3 小步
- **下午**: 2-3 小步
- **每天**: 完成 4-6 小步

### 每周目标
- **第1周**: 完成 Phase 3（8步）
- **第2周**: 完成 Phase 4 前半（6步）
- **第3周**: 完成 Phase 4 后半（6步）
- **第4周**: 完成 Phase 5（10步）

### 验证原则
- ✅ 每步完成后立即测试
- ✅ 每天结束前运行完整测试
- ✅ 每周末验收里程碑

---

**下一步**: 开始 Step 3.1 - 创建 AgentRegistry 基础类

准备好了吗？
