---
name: "security-review"
owner_agent: "inspector"
version: "1.0"
when_to_activate:
  - "任何涉及安全的检查任务"
  - "代码审查中需要安全视角"
  - "任务描述包含'安全'、'漏洞'、'audit'"
platforms:
  - cursor
  - claude-code
  - codex
---

# 安全审查技能

## 激活条件

当需要从安全性角度检查实现、变更或风险时激活。

## 工作流步骤

1. **密钥泄露**: 搜索硬编码的 API key、密码、token
2. **注入风险**: eval()、new Function()、child_process.exec(用户输入)
3. **路径穿越**: 未校验的文件路径拼接
4. **权限绕过**: 绕过 policy-checker 直接读写文件
5. **依赖安全**: 已知漏洞的 npm 包

## 输出格式

```json
{
  "type": "security_report",
  "severity": "high|medium|low",
  "findings": [
    {
      "id": "SEC001",
      "type": "hardcoded_secret",
      "file": "src/xxx.js",
      "line": 42,
      "fix": "使用环境变量替代"
    }
  ],
  "passed": true
}
```

## 禁止行为

- 不自动修复安全问题（只报告）
- 不忽略任何 high severity 的发现
