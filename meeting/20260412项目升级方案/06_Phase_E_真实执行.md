# Phase E：真实 Agent 执行接入

**参考来源**: ECC (meeting\13-1 架构设计分析.md) + ROADMAP.md Phase 4  
**目标**: 将4个总监从模拟执行切换到真实 LLM 调用，同时保留模拟模式用于测试  
**周期**: 2-3周  
**约束**: 不改变 AGENTS.md 规定的架构；模拟模式必须保留（用于 CI 测试）

---

## E1. 当前模拟执行的问题

`src/agent-executor.js` 中4个总监的执行是纯模拟：

```javascript
// 当前模拟（问题所在）
async executeExploreAgent(task) {
  await sleep(100 + Math.random() * 500);
  if (Math.random() < 0.10) throw new Error('模拟失败');
  return { files: ['mock-file.js'], dependencies: [] }; // 假数据
}
```

**问题**：
1. 返回假数据，下游检查层无法正确验证
2. 随机失败污染学习系统
3. 没有真实文件读取、代码搜索等操作

---

## E2. 执行模式设计（双模式）

| 模式 | 用途 | 触发条件 |
|------|------|----------|
| `simulate` | CI/单元测试 | `NODE_ENV=test` 或 `--simulate` flag |
| `real` | 生产使用 | 默认，连接真实工具 |

---

## E3. 总监1：Explore Agent 真实执行

```javascript
// src/agent-executor.js 的 executeExploreAgent 增强版
async executeExploreAgent(task) {
  if (this.mode === 'simulate') {
    return this._simulateExplore(task);
  }
  
  const result = {
    type: 'explore_result',
    findings: {}
  };

  // 文件搜索（使用 glob）
  if (task.needsFileSearch) {
    result.findings.files = await this.fileSearcher.search(
      task.searchPattern || '**/*.js',
      { exclude: ['node_modules', '.flowharness'] }
    );
  }

  // 代码搜索（使用 ripgrep 风格）
  if (task.searchQuery) {
    result.findings.codeMatches = await this.codeSearcher.search(
      task.searchQuery,
      { type: task.fileType }
    );
  }

  // 依赖分析
  if (task.needsDependencyMap) {
    result.findings.dependencies = await this.dependencyAnalyzer.analyze(
      task.targetFile
    );
  }

  return result;
}
```

---

## E4. 总监2：Plan Agent 真实执行

```javascript
async executePlanAgent(task) {
  if (this.mode === 'simulate') {
    return this._simulatePlan(task);
  }

  // 激活对应技能（Phase B 联动）
  const skills = await this.skillLoader.matchSkills('plan', task.description);
  
  const result = {
    type: 'plan_result',
    plan: {}
  };

  // 技术方案分析
  result.plan.approach = await this.analyzeApproach(task, skills);
  
  // 风险识别
  result.plan.risks = await this.identifyRisks(task);
  
  // 步骤拆解
  result.plan.steps = await this.breakdownSteps(task);
  
  // 时间估算（基于 patterns.json 历史数据）
  const historicalPattern = await this.knowledgeBase.findPattern(
    `${task.type}:full_workflow`
  );
  result.plan.estimatedTime = historicalPattern?.avg_time || 3000;

  return result;
}
```

---

## E5. 总监3：General-Purpose Agent 真实执行

```javascript
async executeGeneralAgent(task) {
  if (this.mode === 'simulate') {
    return this._simulateGeneral(task);
  }

  // 激活对应技能（Phase B 联动）
  const skills = await this.skillLoader.matchSkills('general', task.description);
  const result = {
    type: 'execution_result',
    changes: {
      files_modified: [],
      files_created: [],
      commands_executed: [],
      summary: ''
    }
  };

  // 根据任务类型选择执行策略
  switch (task.type) {
    case 'feature':
    case 'bug_fix':
      return await this.executeCodeTask(task, skills, result);
    case 'documentation':
      return await this.executeDocTask(task, skills, result);
    case 'refactor':
      return await this.executeRefactorTask(task, skills, result);
    default:
      return await this.executeGenericTask(task, skills, result);
  }
}

async executeCodeTask(task, skills, result) {
  // 使用 TDD 技能（如果激活）
  const tddSkill = skills.find(s => s.id === 'tdd-workflow');
  if (tddSkill) {
    // 先写测试
    result.changes.files_created.push(
      await this.writeTests(task, tddSkill)
    );
  }
  
  // 实现代码
  const implFile = await this.writeImplementation(task);
  result.changes.files_modified.push(implFile);
  
  // 运行测试验证
  const testResult = await this.runTests(task);
  result.changes.commands_executed.push(`npm test -- ${task.testPattern}`);
  
  result.changes.summary = `实现完成: ${implFile}`;
  return result;
}
```

---

## E6. 总监4：Inspector Agent 真实执行

```javascript
async executeInspectorAgent(task) {
  if (this.mode === 'simulate') {
    return this._simulateInspect(task);
  }

  // 激活反模式检测技能（Phase B 联动）
  const skills = await this.skillLoader.matchSkills('inspector', task.description);
  
  const result = {
    type: 'inspection_result',
    checks: {}
  };

  // 使用现有 Inspector 类（Layer 4）
  const inspectorResult = await this.inspector.runAllChecks(task);
  result.checks = inspectorResult;

  // 反模式检测（Phase B 技能）
  const antipatternSkill = skills.find(s => s.id === 'antipattern-detect');
  if (antipatternSkill) {
    result.checks.antipattern = await this.detectAntipatterns(
      task.targetFiles,
      antipatternSkill
    );
  }

  result.summary = this.buildInspectionSummary(result.checks);
  return result;
}
```

---

## E7. 文件操作能力封装

新增 `src/file-operator.js`（被各总监使用）：

```javascript
// src/file-operator.js
class FileOperator {
  constructor(policyChecker) {
    this.policyChecker = policyChecker;
  }

  async read(filePath) {
    // 先过政策检查
    const check = await this.policyChecker.checkFile(filePath, 'read');
    if (!check.allowed) throw new Error(`Policy denied: ${filePath}`);
    return fs.readFileSync(filePath, 'utf8');
  }

  async write(filePath, content) {
    const check = await this.policyChecker.checkFile(filePath, 'write');
    if (!check.allowed) throw new Error(`Policy denied: ${filePath}`);
    
    // 确保目录存在
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
    return { written: filePath, size: content.length };
  }

  async glob(pattern, options = {}) {
    // 文件搜索，排除 node_modules 等
    const { glob } = require('glob');
    return await glob(pattern, {
      ignore: ['node_modules/**', '.flowharness/knowledge/**'],
      ...options
    });
  }
}
```

---

## E8. 沙箱集成（最简方案）

对高风险操作（文件写入、命令执行），使用 Git Worktree 隔离：

```javascript
// src/sandbox-manager.js 增强（现有文件增量修改）
async executeInSandbox(task, executeFn) {
  if (!task.requiresSandbox) {
    return await executeFn();
  }
  
  const sandboxId = `sandbox-${Date.now()}`;
  
  try {
    // 创建 worktree 沙箱
    await this.createWorktree(sandboxId);
    
    // 在沙箱中执行
    const result = await executeFn({ sandboxPath: `.flowharness/sandboxes/${sandboxId}` });
    
    // 检查结果（Inspector 验证）
    if (result.approved) {
      await this.mergeToMain(sandboxId);
    }
    
    return result;
  } finally {
    // 清理沙箱
    await this.cleanupWorktree(sandboxId);
  }
}
```

---

## E9. 测试策略（保证回归不退化）

### 双模式测试矩阵

| 测试文件 | 模拟模式 | 真实模式 |
|----------|---------|---------|
| test-agent-executor.js | ✅ 必须通过 | ✅ 新增测试 |
| test-supervisor-agent.js | ✅ 必须通过 | ✅ 新增集成测试 |
| test-phase6-e2e.js | ✅ 必须通过 | 新增 e2e-real 测试 |

### 保护措施

```javascript
// 测试文件中强制模拟模式
beforeAll(() => {
  process.env.NODE_ENV = 'test';
  // 所有现有测试继续使用模拟模式
});
```

---

## E10. 验收标准

| 指标 | 要求 |
|------|------|
| 模拟模式测试通过 | 58个测试文件全部通过（不可退化） |
| 真实模式基础功能 | Explore Agent 能读取真实文件 |
| 政策检查集成 | 文件读写全部经过 policy-checker |
| 沙箱执行 | 高风险任务进沙箱，低风险直接执行 |
| 模式切换 | `--simulate` 和默认真实模式均可用 |

---

## E11. 实施顺序

```
Week 1:
  Day 1-2: FileOperator 实现
  Day 3-4: Explore Agent 真实执行
  Day 5:   Plan Agent 真实执行

Week 2:
  Day 1-3: General-Purpose Agent 真实执行
  Day 4-5: Inspector Agent 真实执行

Week 3:
  Day 1-2: 沙箱集成
  Day 3-4: 集成测试 + E2E 测试
  Day 5:   性能优化 + 文档更新
```

---

## 关键决策

### 决策1: LLM 调用方式

**选择**: 通过系统提示词 + 上下文注入（不调用外部 API）

- Flow Harness 运行在 AI 编辑器（Cursor/Claude/Codex）内
- 真实执行 = 利用当前会话的 AI 能力，通过结构化提示词指导 AI
- 不需要独立的 API Key

### 决策2: 文件操作安全

**选择**: 所有文件操作通过 `FileOperator`，强制经过 `policy-checker`

### 决策3: 沙箱方案

**选择**: Phase E 使用临时目录（非 Git Worktree），后续升级
