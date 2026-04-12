# Flow Harness 渐进式实现计划

## 总体策略：11步完成核心功能

每一步都能**独立测试**，逐步构建完整系统。

---

## Phase 1: Supervisor Agent 基础框架（Step 1-5）

### Step 1: 创建 Supervisor 基础结构 ✅
**目标**：搭建6步框架骨架

**实现**：
- 创建 `src/supervisor-agent.js`
- 定义6步方法接口
- 简单的消息接收和分发

**测试**：
```bash
node src/cli.js supervisor "创建一个测试文件"
# 输出：显示6步执行流程（每步暂时只打印日志）
```

**验收标准**：
- 能接收任务消息
- 能按顺序调用6个步骤
- 每步输出清晰的日志

---

### Step 2: 实现 Step 1-2（判断和拆解）✅
**目标**：能够分析任务类型并拆解子任务

**实现**：
- `analyzeTask()`: 判断任务类型（需求/Bug/功能/文档）
- `decomposeTask()`: 拆解为子任务
- 使用简单规则引擎

**测试**：
```bash
node src/cli.js supervisor "修复登录页面的Bug"
# 输出：
# Step 1: 判断 - 任务类型: Bug修复
# Step 2: 拆解 - 子任务:
#   1. 定位Bug位置
#   2. 分析根因
#   3. 修复代码
#   4. 测试验证
```

**验收标准**：
- 能识别5种任务类型
- 能拆解出合理的子任务
- 子任务有明确的目标和验收标准

---

### Step 3: 实现 Step 3-4（分工和指挥）✅
**目标**：能够分配任务给工具并执行

**实现**：
- `assignTasks()`: 根据子任务选择工具
- `executeTasks()`: 调用工具执行
- 简单的工具映射表（先硬编码）

**测试**：
```bash
node src/cli.js supervisor "运行测试"
# 输出：
# Step 3: 分工 - 子任务分配:
#   任务1: 运行测试 -> 分配给: WorkflowEngine
# Step 4: 指挥 - 执行中...
#   [WorkflowEngine] 执行: npm test
#   结果: 成功
```

**验收标准**：
- 能根据任务类型选择合适的执行器
- 能调用现有的 WorkflowEngine
- 能收集执行结果

---

### Step 4: 实现 Step 5（检查）✅
**目标**：能够检查执行结果

**实现**：
- `inspectResults()`: 基础检查逻辑
- 先实现简单的成功/失败判断
- 记录检查结果

**测试**：
```bash
node src/cli.js supervisor "创建README.md文件"
# 输出：
# Step 5: 检查 - 产出检查:
#   ✓ 文件已创建
#   ✓ 文件不为空
#   ✗ 缺少必要章节
#   结论: 需要重做
```

**验收标准**：
- 能检查任务是否完成
- 能识别明显的问题
- 不通过时能给出原因

---

### Step 5: 实现 Step 6（复盘）✅
**目标**：能够回顾和记录

**实现**：
- `reviewTask()`: 回顾任务执行
- 记录成功/失败模式
- 简单的打分机制

**测试**：
```bash
node src/cli.js supervisor "部署到测试环境"
# 输出：
# Step 6: 复盘 - 任务回顾:
#   目标达成率: 100%
#   执行时间: 45s
#   工具选择: 最优
#   问题: 无
#   评分: 9/10
#   已记录到知识库
```

**验收标准**：
- 能生成任务执行报告
- 能记录到 KnowledgeBase
- 能给出改进建议

---

## Phase 2: Inspector 检查层（Step 6-9）

### Step 6: 创建 Inspector 基础框架 ✅
**目标**：搭建5大检查项的框架

**实现**：
- 创建 `src/inspector.js`
- 定义5个检查方法接口
- 集成到 Supervisor Step 5

**测试**：
```bash
node src/cli.js inspect result.json
# 输出：显示5项检查结果（暂时都返回通过）
```

**验收标准**：
- 5个检查方法都能调用
- 返回统一的检查结果格式
- 能集成到 Supervisor

---

### Step 7: 实现目标对齐检查 ✅
**目标**：检查产出是否匹配任务目标

**实现**：
- `checkGoalAlignment()`: 对比任务目标和实际产出
- 使用关键词匹配和文件检查

**测试**：
```bash
# 任务: "创建用户登录API"
# 产出: 创建了 user-profile.js
node src/cli.js inspect --goal "创建用户登录API" --output "user-profile.js"
# 输出：
# ✗ 目标对齐检查失败
#   期望: 登录相关代码
#   实际: 用户资料相关代码
#   建议: 重新检查任务理解
```

**验收标准**：
- 能识别明显的目标偏差
- 能给出具体的偏差说明
- 误报率 < 20%

---

### Step 8: 实现规约合规检查 ✅
**目标**：检查是否违反 schema/契约/API

**实现**：
- `checkSpecCompliance()`: 检查文件变更
- 读取 schema 定义
- 对比修改是否符合规约

**测试**：
```bash
# 修改了数据库 schema
node src/cli.js inspect --type spec --files "schema/user.json"
# 输出：
# ✗ 规约合规检查失败
#   文件: schema/user.json
#   问题: 删除了必需字段 'email'
#   影响: 破坏性变更
#   建议: 需要授权或回滚
```

**验收标准**：
- 能检测 schema 破坏性变更
- 能识别 API 契约违反
- 能标记需要授权的变更

---

### Step 9: 实现其他3个检查 ✅
**目标**：完成语义、影响、安全检查

**实现**：
- `checkSemanticCorrectness()`: 简单的业务逻辑检查
- `analyzeImpact()`: 文件依赖分析
- `scanSecurity()`: 基础安全扫描（正则匹配）

**测试**：
```bash
node src/cli.js inspect --full result.json
# 输出：完整的5项检查报告
```

**验收标准**：
- 5项检查都能正常工作
- 能生成完整的检查报告
- 能集成到 Supervisor Step 5

---

## Phase 3: Agent Registry（Step 10-11）

### Step 10: 创建 Agent Registry ✅
**目标**：建立 1 CEO + 4 总监的注册表

**实现**：
- 创建 `src/agent-registry.js`
- 定义4个总监的接口
- 实现注册和查询机制

**测试**：
```bash
node src/cli.js agents list
# 输出：
# Agent Registry:
# ├── CEO: Supervisor Agent (active)
# ├── 总监1: Explore Agent (available)
# ├── 总监2: Plan Agent (available)
# ├── 总监3: General-Purpose Agent (available)
# └── 总监4: Inspector Agent (available)
```

**验收标准**：
- 能注册和查询 Agent
- 能显示 Agent 状态
- 能根据能力查找 Agent

---

### Step 11: 集成到 Supervisor ✅
**目标**：Supervisor 使用 Agent Registry 分配任务

**实现**：
- 修改 Supervisor Step 3（分工）
- 使用 Registry 查找合适的 Agent
- 实现简单的能力匹配

**测试**：
```bash
node src/cli.js supervisor "探索代码库中的认证逻辑"
# 输出：
# Step 3: 分工
#   任务: 探索代码库
#   匹配能力: 代码探索
#   选择 Agent: Explore Agent
#   分配成功
```

**验收标准**：
- Supervisor 能使用 Registry
- 能根据任务自动选择 Agent
- 能处理没有合适 Agent 的情况

---

## 测试策略

### 单元测试
每个 Step 完成后都要有单元测试：
```bash
npm test -- supervisor.test.js
npm test -- inspector.test.js
npm test -- agent-registry.test.js
```

### 集成测试
每个 Phase 完成后的集成测试：
```bash
# Phase 1 完成后
node src/cli.js supervisor "创建一个简单的TODO应用"

# Phase 2 完成后
node src/cli.js supervisor "修改用户API" --with-inspection

# Phase 3 完成后
node src/cli.js supervisor "重构认证模块" --full
```

### 端到端测试
全部完成后的完整流程测试：
```bash
# 完整的任务执行流程
node src/cli.js supervisor "实现用户注册功能" \
  --with-inspection \
  --with-review \
  --verbose
```

---

## 实现时间估算

| Phase | Steps | 预计时间 | 累计时间 |
|-------|-------|---------|---------|
| Phase 1 | Step 1-5 | 4-6小时 | 4-6小时 |
| Phase 2 | Step 6-9 | 3-4小时 | 7-10小时 |
| Phase 3 | Step 10-11 | 2-3小时 | 9-13小时 |
| **总计** | **11 Steps** | **9-13小时** | - |

---

## 验收里程碑

### Milestone 1: Supervisor 可用（Step 1-5）
- ✅ 能接收任务并拆解
- ✅ 能分配和执行
- ✅ 能检查和复盘
- ✅ 有完整的日志输出

### Milestone 2: Inspector 可用（Step 6-9）
- ✅ 5项检查都能工作
- ✅ 能识别常见问题
- ✅ 能集成到 Supervisor

### Milestone 3: 完整系统（Step 10-11）
- ✅ Agent 架构完整
- ✅ Supervisor 能智能分配
- ✅ 整个系统能闭环运行

---

## 下一步行动

**立即开始 Step 1**：
1. 创建 `src/supervisor-agent.js`
2. 实现基础的6步框架
3. 添加 CLI 命令 `supervisor`
4. 编写简单测试

准备好了吗？我可以立即开始实现 Step 1。
