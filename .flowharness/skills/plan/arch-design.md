---
name: "arch-design"
owner_agent: "plan"
version: "1.0"
when_to_activate:
  - "需要设计新模块的架构"
  - "需要规划模块间的接口"
  - "任务描述包含'架构'、'设计'、'接口'"
platforms:
  - cursor
  - claude-code
  - codex
---

# 架构设计技能

## 激活条件

当需要新增模块、规划边界或定义模块接口时激活。

## 工作流步骤

1. **明确边界**: 新模块的输入/输出/职责
2. **遵循分层**: 对照 Flow Harness 6层架构，确定新模块所在层
3. **接口定义**: 定义 class 的 constructor 参数和 public 方法签名
4. **依赖方向**: 只允许上层依赖下层，不可反向
5. **与 AGENTS.md 对齐**: 确认设计不违反 1+4 架构和禁止项

## 输出格式

```json
{
  "type": "arch_design",
  "module_name": "new-module.js",
  "layer": "Layer 3 - 执行监控层",
  "public_api": ["methodA(input): output", "methodB()"],
  "dependencies": ["config-loader.js"],
  "agents_md_compliant": true
}
```

## 禁止行为

- 不创建违反 1+4 架构的新 Agent
- 不设计环形依赖
