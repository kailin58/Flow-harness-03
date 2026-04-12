# Flow Harness 补充实现计划

基于 `meeting/Flow harness沟通.md` 深度分析，当前实现遗漏的关键功能。

## 一、核心遗漏功能清单

### ⭐⭐⭐ 高优先级（核心架构）

#### 1. Supervisor Agent（领导调度器）
**位置**：`src/supervisor-agent.js`

**功能**：
- 6步闭环工作流
  - Step 1: 判断任务类型和目标
  - Step 2: 拆解子任务
  - Step 3: 分工（Agent/Skill/Tool选择）
  - Step 4: 指挥执行
  - Step 5: 检查产出
  - Step 6: 复盘优化（回顾→优化→验证→固化）

**关键特性**：
- 领导不干活，只判断/指挥/检查/复盘
- 没有合适工具时询问用户（降级/创建/人工）
- 2次不通过强制停检
- 复盘验证循环（验证不通过继续优化）

#### 2. Layer 4: 检查层（Inspector）
**位置**：`src/inspector.js`

**5大检查项**：
```javascript
1. 目标对齐检查 (Goal Alignment)
   - 产出是否匹配任务目标
   
2. 规约合规检查 (Spec Compliance)
   - 是否违反 schema/契约/API 定义
   
3. 语义正确性检查 (Semantic Correctness)
   - 业务逻辑是否正确（分销/积分/佣金）
   
4. 影响范围分析 (Impact Analysis)
   - 变更涉及哪些模块
   - 是否有意外副作用
   
5. 安全扫描 (Security Scan)
   - 注入/XSS/敏感信息泄露/越权
```

**与 Layer 5 的区别**：
- Layer 4: 检查"做得对不对"（逻辑审查）
- Layer 5: 检查"做得合不合格"（自动化检查）

#### 3. Agent 组织架构
**位置**：`src/agent-registry.js`

**写死架构**：
```
CEO: Supervisor Agent
├── 总监1: Explore Agent（探索）
├── 总监2: Plan Agent（规划）
├── 总监3: General-Purpose Agent（执行）
└── 总监4: Inspector Agent（质检）
```

**子Agent原则**：
- 灵活数量（0-N个）
- 按需创建
- 职责单一
- 可注册/可发现

### ⭐⭐ 中优先级（质量保障）

#### 4. 问题诊断协议
**位置**：`src/problem-diagnosis.js`

**诊断流程**：
```
Q1: 之前有没有类似问题？
Q2: 是方法不对吗？
Q3: 是理论/模型不对吗？
Q4: 是不适用当前场景吗？
```

**关键规则**：
- 2次不通过停检
- 换方法前验证当前方法是否执行到位
- 警觉熵增（方法越来越复杂）
- 经验复用 ≠ 经验主义

#### 5. 反馈闭环验证机制
**位置**：增强 `src/knowledge-base.js`

**验证循环**：
```javascript
6a. 回顾：任务完成度打分
6b. 优化：生成优化方案
6c. 验证：用优化策略重跑，对比差异
6d. 固化：验证通过后持久化
```

**关键**：验证不通过 → 回到6b继续优化 → 循环直到通过

### ⭐ 低优先级（扩展功能）

#### 6. Agent vs Skill vs Tool 判定
**位置**：`src/task-dispatcher.js`

**选择矩阵**：
- Agent: 需要自主决策、多步推理
- Skill: 固定流程、可模板化
- Tool: 一次性、简单直接

**不重复造轮子检查**：
- 项目内搜索（.claude/commands/）
- 社区搜索（Skills市场）
- 改造评估（现有能否扩展）

#### 7. 跨端委派机制
**位置**：`src/cross-tool-dispatcher.js`

**功能**：
- Claude Code / Cursor / Codex 互相委派
- 根据任务特性选择最优工具
- 谁收到消息谁当领导

## 二、实现优先级

### Phase 1: 核心架构（必须）
1. Supervisor Agent 基础框架
2. Agent Registry（1 CEO + 4 总监）
3. Inspector（Layer 4 检查层）
4. 增强 Workflow Engine 集成 Supervisor

### Phase 2: 质量保障（重要）
1. 问题诊断协议
2. 反馈闭环验证机制
3. 2次不通过停检规则

### Phase 3: 扩展功能（可选）
1. Agent/Skill/Tool 智能选择
2. 跨端委派
3. 子Agent动态创建

## 三、架构调整

### 当前架构
```
FlowHarness
├── ConfigLoader
├── WorkflowEngine
├── PolicyChecker
└── KnowledgeBase
```

### 目标架构
```
FlowHarness
├── SupervisorAgent (新增) ⭐
│   ├── TaskAnalyzer (判断)
│   ├── TaskDecomposer (拆解)
│   ├── TaskDispatcher (分工)
│   └── ReviewLoop (复盘)
├── AgentRegistry (新增) ⭐
│   ├── ExploreAgent
│   ├── PlanAgent
│   ├── GeneralPurposeAgent
│   └── InspectorAgent
├── Inspector (新增) ⭐
│   ├── GoalAlignmentChecker
│   ├── SpecComplianceChecker
│   ├── SemanticChecker
│   ├── ImpactAnalyzer
│   └── SecurityScanner
├── ProblemDiagnosis (新增)
├── ConfigLoader
├── WorkflowEngine (增强)
├── PolicyChecker
└── KnowledgeBase (增强)
```

## 四、关键设计原则（来自文档）

1. **Deny-by-Default**: 核心链路默认禁止
2. **Inspect Before Trust**: Agent产出必须检查
3. **Feedback Control Loop**: 持续监控、自动纠偏
4. **2次不通过停检**: 不能蛮干
5. **警觉熵增**: 方法不能越来越复杂
6. **经验复用 ≠ 经验主义**: 有验证才复用
7. **不频繁换方法**: 换前先验证当前方法

## 五、实现建议

### 最小可行实现（MVP）
专注 Phase 1 的 3 个核心组件：
1. Supervisor Agent（简化版，只实现6步框架）
2. Inspector（实现5大检查的基础版本）
3. Agent Registry（注册表 + 4个总监的接口定义）

### 渐进增强
- Phase 1 完成后，系统具备基本的"领导-检查-反馈"能力
- Phase 2 增加质量保障，提升可靠性
- Phase 3 增加智能化，提升易用性

## 六、与现有代码的集成

### WorkflowEngine 改造
```javascript
// 当前
async runWorkflow(workflowName, context) {
  // 直接执行步骤
}

// 改造后
async runWorkflow(workflowName, context) {
  // 1. 交给 Supervisor 判断和拆解
  const plan = await this.supervisor.analyze(workflowName, context);
  
  // 2. Supervisor 分配任务给 Agent
  const results = await this.supervisor.dispatch(plan);
  
  // 3. Inspector 检查产出
  const inspection = await this.inspector.inspect(results);
  
  // 4. Supervisor 复盘优化
  await this.supervisor.review(plan, results, inspection);
}
```

## 七、配置文件扩展

### .flowharness/config.yml 新增
```yaml
# Supervisor 配置
supervisor:
  enabled: true
  review_threshold: 0.8  # 复盘满意度阈值
  max_retry: 2  # 2次不通过停检
  
# Agent 配置
agents:
  explore:
    enabled: true
    timeout: 60
  plan:
    enabled: true
    timeout: 120
  general:
    enabled: true
    timeout: 300
  inspector:
    enabled: true
    timeout: 60

# 检查层配置
inspection:
  goal_alignment:
    enabled: true
    strict: true
  spec_compliance:
    enabled: true
    schema_paths: ["schema/**/*.json"]
  semantic_check:
    enabled: true
    business_rules: ["rules/**/*.js"]
  impact_analysis:
    enabled: true
    max_files: 10
  security_scan:
    enabled: true
    rules: ["owasp", "injection", "xss"]

# 问题诊断配置
diagnosis:
  enabled: true
  max_method_switches: 3  # 最多换3次方法
  entropy_alert: true  # 熵增警报
```

## 八、下一步行动

建议按以下顺序实现：

1. **创建 Supervisor Agent 框架**（最核心）
2. **实现 Inspector 基础检查**（质量保障）
3. **建立 Agent Registry**（架构基础）
4. **集成到 WorkflowEngine**（串联整体）
5. **增加问题诊断协议**（提升可靠性）
6. **完善反馈闭环验证**（持续优化）

---

**总结**：当前实现是一个良好的基础（配置驱动 + 策略检查 + 学习机制），但缺少文档中最核心的"Supervisor领导调度"和"深度检查层"。建议优先实现这两个核心组件。
