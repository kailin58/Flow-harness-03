---
name: Agent Architecture
description: 1 CEO + 5 总监架构，Research Agent 负责站外搜索
type: project
---

## Agent 职责划分 (已锁定)

**Explore Agent** = 站内搜索（本地代码库）
**Research Agent** = 站外搜索（互联网/外部资源）

### 判断规则
- 任务包含"搜索项目"、"查找代码"、"分析依赖" → Explore Agent
- 任务包含"搜索网络"、"查阅文档"、"查 API"、"调研" → Research Agent

### Why
职责清晰分离，避免混淆本地代码搜索和网络资料搜索。

### How to apply
TaskAnalyzer 已内置关键词识别，会自动路由到正确的 Agent。

详见: [.flowharness/architecture/agent-roles.md](.flowharness/architecture/agent-roles.md)
