---
name: "code-review"
owner_agent: "inspector"
version: "1.0"
when_to_activate:
  - "代码审查任务"
  - "PR 审查"
  - "任务描述包含'审查'、'review'、'代码质量'"
platforms:
  - cursor
  - claude-code
  - codex
---

# 代码审查技能

## 激活条件

当 Inspector 需要对代码变更给出质量结论和审查意见时激活。

## 工作流步骤

1. **AGENTS.md 合规**: 是否违反 1+4 架构、CEO 禁止项、核心链路保护
2. **代码质量**: 函数长度、嵌套深度、命名规范
3. **错误处理**: try/catch 是否完善、边界条件
4. **测试覆盖**: 新增代码是否有对应测试
5. **安全**: 调用 security-review 技能辅助

## 输出格式

```json
{
  "type": "review_report",
  "files_reviewed": 3,
  "issues": [],
  "agents_md_compliant": true,
  "recommendation": "approve|request_changes|reject"
}
```

## 禁止行为

- 不修改被审查的代码
- 不跳过 AGENTS.md 合规检查
