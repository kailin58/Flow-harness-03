---
name: "dependency-map"
owner_agent: "explore"
version: "1.0"
when_to_activate:
  - "需要了解模块间的依赖关系"
  - "分析某个文件被谁引用"
  - "评估修改影响范围"
platforms:
  - cursor
  - claude-code
  - codex
---

# 依赖图谱技能

## 激活条件

当任务涉及"依赖"、"引用"、"影响范围"、"import/require 分析"时激活。

## 工作流步骤

1. **确定分析目标**: 明确要分析哪个文件/模块的依赖
2. **向上追溯**: 查找谁 require/import 了目标文件（被依赖方）
3. **向下展开**: 查找目标文件 require/import 了谁（依赖方）
4. **构建图谱**: 用邻接表表示依赖关系
5. **标注层级**: 标记核心模块（被引用 >5 次）和叶子模块（无下游依赖）

## 输出格式

```json
{
  "type": "dependency_map",
  "target": "src/supervisor-agent.js",
  "depends_on": ["src/config-loader.js", "src/knowledge-base.js"],
  "depended_by": ["src/cli.js", "src/index.js"],
  "depth": 2,
  "critical_paths": ["src/supervisor-agent.js → src/agent-executor.js → src/inspector.js"]
}
```

## 禁止行为

- 不修改任何文件
- 不分析 node_modules 内部依赖（只到包名层面）
