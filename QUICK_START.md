# Flow Harness 快速开始指南

## 5分钟上手

### 1. 安装依赖

```bash
cd "Flow harness"
npm install
```

### 2. 第一个任务

```bash
node src/cli.js supervisor "修复登录页面的Bug"
```

你会看到完整的6步执行流程：
- 📍 Step 1: 判断 - 分析任务类型、优先级、风险
- 📍 Step 2: 拆解 - 拆解为可执行的子任务
- 📍 Step 3: 分工 - 分配给合适的执行器
- 📍 Step 4: 指挥 - 执行所有子任务
- 📍 Step 5: 检查 - 5项深度检查
- 📍 Step 6: 复盘 - 生成优化建议

### 3. 预览执行计划（不实际执行）

```bash
node src/cli.js supervisor "实现用户注册功能" --dry-run
```

输出：
```
🔍 Dry-run 模式 - 预览执行计划

任务分析:
  类型: feature
  优先级: normal
  复杂度: moderate
  预计时间: 3-8小时

执行计划:
  总任务数: 6
  预计总时间: 2小时45分钟

子任务列表:
  1. 🤖 需求分析 (15分钟)
  2. 🤖 技术方案设计 (30分钟)
  ...
```

---

## 核心命令

### Supervisor - 智能任务执行

```bash
# 基础用法
node src/cli.js supervisor "<任务描述>"

# 预览模式（不实际执行）
node src/cli.js supervisor "<任务>" --dry-run

# 详细日志
node src/cli.js supervisor "<任务>" --verbose

# JSON 输出
node src/cli.js supervisor "<任务>" --json
```

### 其他命令

```bash
# 列出所有工作流
node src/cli.js list

# 查看执行统计
node src/cli.js stats

# 查看优化建议
node src/cli.js optimize

# 检查文件访问权限
node src/cli.js check-file src/index.js

# 检查命令权限
node src/cli.js check-cmd "npm install"
```

---

## 常见任务示例

### 1. Bug 修复

```bash
node src/cli.js supervisor "修复用户登录失败的问题"
```

**自动识别**:
- 类型: bug_fix
- 拆解为: 复现Bug → 定位位置 → 分析根因 → 修复代码 → 测试验证

### 2. 功能开发

```bash
node src/cli.js supervisor "实现用户注册功能，包含邮箱验证"
```

**自动识别**:
- 类型: feature
- 拆解为: 需求分析 → 技术方案 → 接口定义 → 实现代码 → 编写测试 → 更新文档

### 3. 重构

```bash
node src/cli.js supervisor "重构数据库连接模块"
```

**自动识别**:
- 类型: refactor
- 拆解为: 分析现有代码 → 设计重构方案 → 准备测试 → 执行重构 → 验证功能不变

### 4. 文档编写

```bash
node src/cli.js supervisor "编写API使用文档"
```

**自动识别**:
- 类型: documentation
- 拆解为: 收集信息 → 组织结构 → 编写内容 → 添加示例 → 审查校对

### 5. 安全相关

```bash
node src/cli.js supervisor "实现用户认证功能，包含密码加密"
```

**自动检测**:
- 风险: 涉及安全功能
- 检查: 要求安全测试
- 模式: 需要授权（interactive 模式）

### 6. 核心系统变更

```bash
node src/cli.js supervisor "修改支付API的数据库schema"
```

**自动检测**:
- 风险: 涉及核心系统、数据变更
- 检查: 要求授权、影响范围评估
- 所有子任务标记为需要授权（🔒）

---

## 理解输出

### Step 1: 判断

```
📍 Step 1: 判断 - 为什么干？
   类型: feature
   目标: 用户注册功能
   优先级: normal
   复杂度: moderate (3-8小时)
   风险: 2 项
     - [high] 涉及核心系统，需要额外审查
     - [high] 涉及安全相关功能，需要安全审查
   验收标准: 6 条
     1. 任务完成且无错误
     2. 功能按需求实现
     ...
```

**关键信息**:
- **类型**: 8种（bug_fix, feature, refactor, documentation, testing, security, performance, deployment）
- **优先级**: urgent > high > normal > low
- **复杂度**: 5级（trivial, simple, moderate, complex, very_complex）
- **风险**: 核心系统、数据、安全、性能、兼容性

### Step 2: 拆解

```
📍 Step 2: 拆解 - 怎么干？
   策略: 功能开发策略
   拆解为 6 个子任务:
   1. 🔒🟡 需求分析 (15分钟)
      ⚠️  需要授权
   2. 🟡 技术方案设计 (30分钟)
   ...
   预计总时间: 2小时45分钟
```

**图标说明**:
- 🔒 = 需要授权
- 🟡 = 高优先级
- 🔴 = 关键任务

### Step 5: 检查

```
📍 Step 5: 检查 - 干得怎么样？
   Inspector 深度检查:
   通过率: 80%
   ✓ 目标对齐检查
   ✓ 规约合规检查
   ✓ 语义正确性检查
   ✓ 影响范围分析
   ✗ ⚠️  安全扫描
      问题: 安全相关功能缺少安全测试
      建议: 添加安全测试用例（注入、XSS、越权等）
```

**5项检查**:
1. **目标对齐**: 产出是否匹配任务目标
2. **规约合规**: 是否违反 schema/契约/API
3. **语义正确**: 业务逻辑是否正确
4. **影响范围**: 变更影响哪些模块
5. **安全扫描**: 常见安全漏洞

### Step 6: 复盘

```
📍 Step 6: 复盘 - 怎么优化？
   6a. 回顾 - 这次干得怎么样？
   完成度: 100%
   成功率: 100%
   评分: 10/10
   
   6b. 优化 - 下次怎么干更好？
   优化建议: 2 条
   1. [执行策略] 为 1 个可重试任务增加重试机制
   2. [质量改进] 确保所有高优先级任务完成
   
   6c. 验证 - 优化方案评估
   可行性: 高
   
   6d. 固化 - 记录到知识库
   ✓ 已记录到知识库
```

**复盘4步**:
- **6a 回顾**: 完成度、成功率、评分
- **6b 优化**: 生成优化建议
- **6c 验证**: 评估可行性
- **6d 固化**: 记录到知识库

---

## 知识库

执行结果自动记录到 `.flowharness/knowledge/`:

### patterns.json - 成功/失败模式

```json
{
  "successful_patterns": [
    {
      "pattern": "feature:full_workflow",
      "success_rate": 1,
      "avg_time": 728,
      "recommendation": "reliable"
    }
  ]
}
```

### metrics.json - 执行指标

```json
{
  "metrics": [
    {
      "workflow": "feature",
      "step": "full_workflow",
      "success": true,
      "execution_time": 728,
      "timestamp": "2026-04-11T14:24:51.859Z"
    }
  ]
}
```

---

## 配置文件

### .flowharness/config.yml

```yaml
# 工作流定义
workflows:
  - name: "test"
    trigger: "manual"
    steps:
      - type: "run"
        command: "npm test"

# 安全策略
policies:
  file_access:
    allow: ["src/**", "tests/**"]
    deny: [".env", "secrets/**"]
  
  commands:
    allow: ["npm", "git", "python"]
    deny: ["rm -rf /"]

# 学习机制
learning:
  enabled: true
  auto_optimize: true
```

---

## 常见问题

### Q: 如何查看详细日志？
```bash
node src/cli.js supervisor "<任务>" --verbose
```

### Q: 如何预览而不执行？
```bash
node src/cli.js supervisor "<任务>" --dry-run
```

### Q: 如何查看历史统计？
```bash
node src/cli.js stats
```

### Q: 知识库在哪里？
```
.flowharness/knowledge/
├── patterns.json  # 成功/失败模式
└── metrics.json   # 执行指标
```

### Q: 如何自定义检查规则？
编辑 `.flowharness/config.yml` 中的 `policies` 部分

---

## 下一步

1. **尝试不同类型的任务**: Bug修复、功能开发、重构、文档
2. **查看知识库**: 观察系统如何学习和优化
3. **自定义配置**: 修改 `.flowharness/config.yml`
4. **查看优化建议**: `node src/cli.js optimize`

---

## 获取帮助

```bash
# 查看所有命令
node src/cli.js --help

# 查看特定命令帮助
node src/cli.js supervisor --help
```

**文档**: [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)  
**进度**: [PROGRESS_REPORT.md](PROGRESS_REPORT.md)  
**完成报告**: [PHASE1_COMPLETE.md](PHASE1_COMPLETE.md), [PHASE2_COMPLETE.md](PHASE2_COMPLETE.md)
