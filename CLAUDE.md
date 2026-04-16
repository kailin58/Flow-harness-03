# CLAUDE.md

请先遵守 AGENTS.md。涉及**学院 / 人机分流 / 对客三态 / 章节交叉引用**时，以 `meeting/20260418升级总结/09学院（可跑顺、可闭环、可扩展）.md` 的 **`§14.4` 速查**、**`§14.5`/`§14.5.6`（平台配置与租户白名单）**、**附录I（VP track 主编交稿）** 与 **`AGENTS.md`** 增补条为准，勿凭记忆写旧章节号。

## 项目概况
ACmodus 是电商分销平台的生产化基线服务，技术栈：Node.js 20+ / Express 4.19 / MySQL 8+ / Prometheus / Kafka（outbox）。
核心 API：订单创建、支付回调、佣金汇总、积分流水。

## 工作方式
- 涉及已有逻辑时，优先阅读 docs/ 和 memory/
- 大范围改动前先输出计划
- 改动完成后输出影响范围、风险、回滚建议与后续建议
- 运行 `npm run ci` 验证改动

## 代码约定
- 入口：src/index.js，路由与中间件：src/app.js
- 验证：Zod schema，日志：Pino JSON，指标：prom-client
- 测试：Node.js 内置 test runner，contract test + integration test
- 当前 store.js 为内存 mock，真实 schema 见 db/migrations/001_init_core.sql

## 协作原则
- 不假设当前工具拥有固定职责
- 当前任务中，如果上下文不足或效果不佳，可以切换到更合适的工具
- 切换原因应记录到 memory/writebacks/

## 写回原则
- 修复 bug 后，将根因、修复方式、影响范围、风险写入 memory/writebacks/bugfixes/
- 新的架构或流程决策写入 docs/decisions/
- Prompt 迭代结论写入 memory/writebacks/prompt-iterations/
