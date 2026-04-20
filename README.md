# Flow Harness

一个轻量级、配置驱动的 AI Agent 编程流程控制协作系统。基于 **Supervisor 6步闭环架构**，提供任务编排、安全策略、执行监控、质量门禁、自动进化等完整能力。可以放到任何项目中使用，并在使用过程中不断学习和完善。

## 核心特性

- **Supervisor 6步闭环**: 分析→拆解→分工→执行→检查→复盘，完整的任务生命周期管理
- **配置驱动**: 通过 YAML 配置文件定义工作流，无需修改代码
- **6层架构**: 任务编排→安全策略→执行监控→检查层→质量门禁→反馈闭环
- **安全策略**: deny-by-default、文件/命令白黑名单、6角色权限矩阵、AGENTS.md 运行时解析
- **四类记忆系统**: user/feedback/project/reference 记忆体系，自动持久化与冲突处理
- **自动进化**: Sense→Record→Learn→Verify→Push→CrossProject 6大能力闭环
- **多工具冲突解决**: 资源仲裁、配置统一、能力去重、优先级抢占
- **结构化日志**: Pino 兼容 JSON 日志 + Trace/Span 分布式追踪
- **Token 成本控制**: 多级预算(任务/会话/日/月) + 三级告警 + 硬性阻止
- **问题诊断**: Q1-Q4 决策树 + SEV 四级分级 + 3级熔断器
- **可移植性**: 只需复制 `.flowharness` 目录即可在任何项目中使用
- **5步项目接入**: 自动检测技术栈→生成配置→设置安全→验证→激活

## 快速开始

### 安装依赖

```bash
npm install
```

### 初始化项目（5步自动接入）

```bash
node src/cli.js init
```

自动完成：项目检测→配置生成→安全策略→验证→激活。支持 Node.js/Python/Java/Go/Rust 等 8 种技术栈的自动识别。

### 使用 Supervisor 执行任务

```bash
# 执行任务（6步闭环）
node src/cli.js supervisor "修复登录Bug"

# 预览执行计划（不实际运行）
node src/cli.js supervisor "实现用户注册功能" --dry-run

# 详细输出模式
node src/cli.js supervisor "编写文档" --verbose

# JSON 格式输出
node src/cli.js supervisor "重构支付模块" --json
```

### 其他命令

```bash
# 查看可用工作流
node src/cli.js list

# 运行指定工作流
node src/cli.js run <workflow-name>

# 查看执行统计
node src/cli.js stats

# 查看优化建议
node src/cli.js optimize

# 查看已注册 Agent
node src/cli.js agents

# 检查文件/命令权限
node src/cli.js check-file src/index.js
node src/cli.js check-cmd "npm install"
```

## 架构概览

### 6层架构

```
Layer 1 - 任务编排层    Supervisor 6步闭环、任务分类(8类)、拆解(7策略)、分工
Layer 2 - 安全策略层    deny-by-default、白黑名单、6角色×22操作权限矩阵
Layer 3 - 执行监控层    实时审计、偏差检测、资源监控、3级熔断
Layer 4 - 检查层        目标对齐、规约合规、语义正确、影响范围、安全扫描、AGENTS.md合规
Layer 5 - 质量门禁层    Lint/CI/AI专项扫描(5规则)/Human-in-the-Loop
Layer 6 - 反馈闭环层    6a回顾→6b优化→6c验证→6d固化 + 策略持久化
```

### Supervisor 6步闭环

```
Step 1: 分析 (Analyze)    → 任务类型识别、优先级评估、复杂度分析
Step 2: 拆解 (Decompose)  → 子任务分解、依赖关系、时间估算
Step 3: 分工 (Assign)     → Agent 匹配、执行模式、权限检查
Step 4: 执行 (Execute)    → 并行/串行执行、重试、监控
Step 5: 检查 (Inspect)    → 6项合规检查、偏差检测
Step 6: 复盘 (Review)     → 评分、优化建议、策略固化
```

## 项目结构

```
.flowharness/                       # 项目配置目录（可移植）
├── config.yml                      # 核心配置文件
├── security.json                   # 安全策略配置
├── snapshot.json                   # 项目快照
├── MEMORY.md                       # 记忆索引
└── knowledge/                      # 学习数据和知识库
    ├── patterns.json               # 成功/失败模式
    └── metrics.json                # 执行指标

src/
├── index.js                        # 主入口 & FlowHarness 类
├── cli.js                          # CLI 工具 (init/run/supervisor/...)
│
│── ── 核心编排 ──
├── supervisor-agent.js             # Supervisor 6步闭环 (~1100行)
├── task-analyzer.js                # 任务分析 (8种类型)
├── task-decomposer.js              # 任务拆解 (7种策略)
├── task-dispatcher.js              # 任务分工 & Agent 匹配
├── agent-registry.js               # Agent 注册表
├── agent-executor.js               # Agent 执行器
│
│── ── 安全策略 ──
├── policy-checker.js               # 文件/命令策略检查
├── role-permission.js              # 6角色×22操作权限矩阵
├── agents-parser.js                # AGENTS.md 运行时解析器
│
│── ── 执行监控 ──
├── execution-monitor.js            # 实时执行监控
├── deviation-detector.js           # 偏差检测
├── workflow-engine.js              # 工作流引擎
├── auto-retry.js                   # 自动重试 (指数退避+断路器)
│
│── ── 检查 & 质量 ──
├── inspector.js                    # 6项检查 (含 AGENTS.md 合规)
├── quality-gate.js                 # 质量门禁 + AI扫描 + HITL
│
│── ── 知识 & 记忆 ──
├── knowledge-base.js               # 知识库管理
├── memory-store.js                 # 四类记忆系统 (user/feedback/project/reference)
├── review-loop.js                  # 复盘闭环引擎 (6a-6d)
│
│── ── 进化 & 诊断 ──
├── evolution-engine.js             # 自动进化 (6大能力)
├── diagnostic-protocol.js          # Q1-Q4诊断 + SEV分级 + 3级熔断
├── token-tracker.js                # Token成本控制
├── conflict-resolver.js            # 多工具冲突解决
│
│── ── 基础设施 ──
├── logger.js                       # 结构化日志 (Pino兼容)
├── config-loader.js                # 配置加载器
├── project-onboarding.js           # 5步项目接入自动化
├── cross-platform-dispatcher.js    # 跨平台调度
├── platform-detector.js            # 平台检测
├── health-check.js                 # 健康检查
├── self-healing.js                 # 自愈机制
├── sandbox-manager.js              # 沙箱管理
├── ipc-channel.js                  # 进程间通信
├── leadership-manager.js           # 领导力管理
├── task-serializer.js              # 任务序列化
├── error-pattern-recognizer.js     # 错误模式识别
└── diagnostic-reporter.js          # 诊断报告

test/                               # 35 个测试文件, 444+ 断言
├── test-supervisor-agent.js
├── test-memory-store.js
├── test-evolution-engine.js
├── test-conflict-resolver.js
├── test-project-onboarding.js
├── ... (30 more test files)
```

## 核心模块说明

### 记忆系统 (memory-store.js)

四类记忆体系，每类有独立的 TTL 和生命周期管理：

| 类型 | TTL | 用途 |
|------|-----|------|
| user | 30天 | 用户偏好、历史指令、个性化设置 |
| feedback | 90天 | 反馈记录、满意度、改进建议 |
| project | 永久 | 项目配置、代码结构、技术栈、约定 |
| reference | 7天(可刷新) | 文档摘要、外部知识、最佳实践 |

### 角色权限 (role-permission.js)

6 种角色 × 22 种操作的完整授权矩阵：

| 角色 | 文件读写 | 命令执行 | 核心链路修改 | 管理操作 |
|------|---------|---------|-------------|---------|
| Admin | admin | admin | admin | admin |
| TechLead | write | write | write | read |
| SecurityLead | read | read | admin | read |
| DBA | read | read | write(schema) | none |
| Developer | write | write | none | none |
| Observer | read | none | none | none |

### 自动进化 (evolution-engine.js)

6大能力完整闭环：
1. **Sense** — 感知执行变化：性能异常、错误率上升、重复模式
2. **Record** — 结构化事件记录 + 记忆系统同步
3. **Learn** — 4种策略学习：成功模式/失败恢复/时间估算/重试优化
4. **Verify** — 4项验证：置信度/样本量/无冲突/历史通过率
5. **Push** — 推送到执行流程：优化任务分析/诊断/分解/重试
6. **CrossProject** — 策略导出(高置信度) + 导入(降低置信度重新验证)

### 问题诊断 (diagnostic-protocol.js)

- **Q1-Q4 决策树**: Q1查历史→Q2分类(工具/方法)→Q3替代工具→Q4换策略
- **SEV 分级**: SEV1(紧急/5分钟) → SEV2(重要/15分钟) → SEV3(一般/1小时) → SEV4(低/24小时)
- **3级熔断**: L1降速 → L2降级 → L3停机，SEV1/SEV2 加速熔断(2x)

## 配置示例

### 定义工作流

```yaml
workflows:
  - name: "test"
    description: "运行测试套件"
    trigger: "manual"
    enabled: true
    steps:
      - type: "run"
        name: "unit_tests"
        command: "npm test"
      - type: "check"
        name: "coverage"
        threshold: 80
```

### 安全策略

```yaml
policies:
  file_access:
    mode: "whitelist"
    allow:
      - "src/**"
      - "tests/**"
    deny:
      - ".env"
      - "secrets/**"

  commands:
    mode: "whitelist"
    allow:
      - "npm"
      - "git"
    deny:
      - "rm -rf /"
```

## 运行测试

```bash
# 运行所有测试 (35 个测试文件, 444+ 断言)
for f in test/test-*.js; do node "$f"; done

# 运行单个测试
node test/test-supervisor-agent.js
node test/test-evolution-engine.js
node test/test-conflict-resolver.js
```

## 移植到其他项目

### 方式一：自动接入（推荐）

```bash
cd /your/project
node /path/to/flow-harness/src/cli.js init
```

自动完成 5 步接入：检测技术栈→生成配置→设置安全策略→验证→激活。

### 方式二：手动复制

1. 复制 `.flowharness` 目录到目标项目
2. 根据项目需求修改 `config.yml`
3. 运行 `npm install` 安装依赖

## 开发进度

| 优先级 | 完成度 | 说明 |
|--------|--------|------|
| P0 核心 | ~95% | Supervisor 6步闭环、记忆系统、权限模型、日志、复盘闭环 |
| P1 生产 | ~60% | Token控制、诊断协议、自动进化、冲突解决、项目接入 |
| P2 增强 | ~5% | 多模型路由、Prometheus、CI/CD集成、检查点 |
| P3 未来 | ~0% | 混沌工程、统一协议、Supervisor位置流动 |
| **整体** | **~48%** | 详见 meeting/0413 完整评估 |

## 许可证

AGPL-3.0
