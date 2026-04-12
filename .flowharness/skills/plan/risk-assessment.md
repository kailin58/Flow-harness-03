---
name: "risk-assessment"
owner_agent: "plan"
version: "1.0"
when_to_activate:
  - "任务涉及核心模块修改"
  - "需要评估变更的风险等级"
  - "任务描述包含'安全'、'数据库'、'认证'等敏感词"
platforms:
  - cursor
  - claude-code
  - codex
---

# 风险评估技能

## 激活条件

当 Plan Agent 规划方案时，需要识别技术风险和安全隐患。

## 工作流步骤

1. **识别变更范围**: 列出将被修改的文件
2. **核心链路检查**: 对照 AGENTS.md 禁止项（schema/支付/认证/鉴权/API契约/生产数据）
3. **依赖影响评估**: 修改的文件被多少其他文件引用
4. **回滚可行性**: 评估是否能安全回滚（有无破坏性变更）
5. **风险定级**: SEV1(紧急) / SEV2(重要) / SEV3(一般) / SEV4(低)

## 输出格式

```json
{
  "type": "risk_report",
  "overall_risk": "medium",
  "sev_level": "SEV3",
  "core_path_violations": [],
  "affected_files": 5,
  "rollback_safe": true,
  "recommendations": ["建议先在沙箱中测试"]
}
```

## 禁止行为

- 不执行代码（Plan Agent 只规划不执行）
- 不低估涉及核心链路的风险
