---
name: "context-gather"
owner_agent: "explore"
version: "1.0"
when_to_activate:
  - "需要全面了解项目现状"
  - "新接手项目的首次探索"
  - "理解当前代码库的技术栈和结构"
platforms:
  - cursor
  - claude-code
  - codex
---

# 上下文收集技能

## 激活条件

当 Explore Agent 需要为后续规划/执行收集项目背景信息时激活。

## 工作流步骤

1. **读取项目配置**: package.json / config.yml / AGENTS.md
2. **扫描目录结构**: 列出 src/ test/ 的一级文件清单
3. **识别技术栈**: Node.js / Python / Go 等
4. **收集关键指标**: 文件数、代码行数、测试覆盖情况
5. **记录约束**: 从 AGENTS.md 提取不可变规则

## 输出格式

```json
{
  "type": "context_summary",
  "tech_stack": ["node.js", "javascript"],
  "file_count": 52,
  "test_count": 58,
  "key_constraints": ["1 CEO + 4 总监", "6步闭环"],
  "entry_point": "src/index.js"
}
```

## 禁止行为

- 不修改任何文件
- 不读取 .env 或包含密钥的文件
