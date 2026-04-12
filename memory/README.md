# Memory 目录说明

## 作用
用于沉淀项目开发过程中的长期记忆，而不是替代正式业务数据库。

## 目录结构
- ingest/：原始输入（对话导出、文档快照、手动归档）
- normalized/：提炼后的结构化知识（决策、bug 模式、提示词）
- writebacks/：任务回写记录（bugfix、决策、提示词迭代）
- exports/：上下文包与检索结果
- indexes/：本地索引（已 gitignore）

## 原则
- 长期业务规则应进入 docs/
- 临时过程信息可先进入 memory/
- 最终可复用经验应从 memory/ 提炼回 docs/ 或 prompts/
