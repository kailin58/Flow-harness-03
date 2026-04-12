# 架构总览

## 系统目标
ACmodus 是电商分销平台的高并发生产化基线服务，提供：
- 订单创建与支付回调
- 推广员佣金汇总与结算
- 会员积分流水查询
- 完整的鉴权、限流、幂等、可观测性基础设施

## 技术栈
| 层 | 技术 |
|---|------|
| 运行时 | Node.js 20+ |
| 框架 | Express 4.19 |
| 数据库 | MySQL 8+ |
| 消息队列 | Kafka（outbox 模式） |
| 日志 | Pino JSON |
| 指标 | prom-client / Prometheus |
| 验证 | Zod |
| 容器 | Docker (node:20-alpine) |

## AI 协作层说明
AI 协作层不等于某一个工具的配置集合。
它由以下几部分组成：
- docs/：长期真源
- memory/：开发记忆层
- prompts/：提示词资产
- evals/：评测数据与报告
- .cursor / .claude / .codex：工具适配层
