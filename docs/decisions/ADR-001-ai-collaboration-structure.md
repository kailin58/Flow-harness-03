# ADR-001 AI 协作层结构

## 状态
Accepted

## 背景
项目已进入开发阶段，需要引入 Cursor、Claude Code、Codex 的协作开发机制。
同时需要避免把不同工具的职责写死，导致流程僵化。

## 决策
采用以下结构：
- docs/ 作为长期真源
- memory/ 作为开发记忆层
- prompts/ 作为提示词资产
- evals/ 作为评测层
- .cursor / .claude / .codex 仅作为工具适配层

## 影响
- 所有 AI 工具的输出最终都应回写到 docs/ 或 memory/
- 工具切换时需记录原因
- 不依赖任何单一工具的专有格式作为真源
