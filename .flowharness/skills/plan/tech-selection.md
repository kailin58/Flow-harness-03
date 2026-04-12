---
name: "tech-selection"
owner_agent: "plan"
version: "1.0"
when_to_activate:
  - "需要选择技术方案或框架"
  - "多种实现路径需要对比"
  - "任务描述包含'选型'、'对比'、'方案'"
platforms:
  - cursor
  - claude-code
  - codex
---

# 技术选型技能

## 激活条件

当需要在多个技术方案之间做权衡，并输出推荐结论时激活。

## 工作流步骤

1. **列出候选方案**: 至少 2-3 个可行方案
2. **评估维度**: 性能、安全性、维护成本、学习曲线、社区活跃度
3. **与现有栈兼容性**: 是否与 Node.js/js-yaml/commander/chalk 兼容
4. **给出推荐**: 明确推荐方案及理由

## 输出格式

```json
{
  "type": "tech_selection",
  "candidates": [
    {"name": "方案A", "pros": [], "cons": [], "score": 8},
    {"name": "方案B", "pros": [], "cons": [], "score": 6}
  ],
  "recommendation": "方案A",
  "reason": "..."
}
```

## 禁止行为

- 不安装任何依赖（选型阶段不执行）
- 不推荐未经验证的实验性技术
