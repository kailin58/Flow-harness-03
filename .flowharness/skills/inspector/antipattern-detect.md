---
name: "antipattern-detect"
owner_agent: "inspector"
version: "1.0"
when_to_activate:
  - "代码审查任务"
  - "质量检查"
  - "Inspector 执行检查步骤"
  - "任务描述包含'反模式'、'坏味道'、'quality'"
platforms:
  - cursor
  - claude-code
  - codex
---

# 反模式检测技能

参考来源: Impeccable 项目 (meeting\技能分析0412-1)

## 激活条件

当需要系统识别架构反模式、AI 生成代码坏味道或安全反模式时激活。

## 工作流步骤

### 架构反模式（Flow Harness 专用）
- **AP001 越级调用**: 总监直接调用其他总监（违反 AGENTS.md）
- **AP002 CEO执行代码**: Supervisor 类中直接 fs.write / exec（违反规则）
- **AP003 职责混淆**: 单文件跨越多个架构层
- **AP004 绕过策略**: 不经过 policy-checker 直接操作文件

### AI生成代码反模式
- **AP010 过度嵌套**: if/for 嵌套 >4 层
- **AP011 神奇字符串**: 无注释的硬编码数值/字符串
- **AP012 超长函数**: 单函数 >100 行
- **AP013 重复逻辑**: 两处以上几乎相同的代码块

### 安全反模式
- **AP020 明文密钥**: 代码中包含 password/secret/key = "xxx"
- **AP021 危险 eval**: eval() / new Function(用户输入)
- **AP022 未校验输入**: 用户输入直接拼接到 exec/路径

## 输出格式

```json
{
  "type": "antipattern_report",
  "severity": "high",
  "issues": [
    {
      "id": "AP001",
      "pattern": "越级调用",
      "location": "src/xxx.js:42",
      "description": "Explore Agent 直接调用了 Inspector Agent",
      "suggestion": "通过 Supervisor 进行任务委托"
    }
  ],
  "total_issues": 1,
  "passed": false
}
```

## 禁止行为

- 不自动修复（只报告，由 General-Purpose Agent 执行修复）
- 不阻止合规代码
- 不将警告级别的问题升级为错误
