# AI 协作运行手册

## 开工前
- 明确任务目标
- 先阅读相关 docs/
- 检索 memory/ 中的历史经验
- 决定当前最适合使用的工具

## 进行中
- 先计划，再实现
- 必要时切换工具
- 切换时记录原因
- 改动后执行验证（npm run ci）

## 完成后
- 输出变更说明
- 输出风险点与回滚点
- 生成 writeback（bash scripts/writeback-memory.sh）
- 必要时更新 docs/
