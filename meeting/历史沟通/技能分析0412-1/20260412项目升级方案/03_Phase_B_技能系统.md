# Phase B：技能系统设计与实施

**参考来源**: ECC (meeting\13-1) + Impeccable (meeting\技能分析0412-1)  
**目标**: 为 Flow Harness 添加可复用的技能库，使 4 个总监 Agent 具备领域专业能力  
**周期**: 1-2周  
**约束**: 不修改 AGENTS.md 规定的 1+4 架构，技能是总监的"工具"而非独立 Agent

---

## B1. 技能系统整体设计

### 设计原则（来自 ECC）

1. **技能 ≠ Agent**: 技能是总监的知识/能力增强，不是新增角色
2. **触发明确**: 每个技能有 `when_to_activate` 条件，避免误触发
3. **职责单一**: 每个技能只做一件事
4. **多平台兼容**: 同一技能可在 Cursor/Claude/Codex 上运行

### 技能 vs Agent 的关系

```
总监1 (Explore Agent)
├── skill: code-search     # 代码搜索技能
├── skill: dependency-map  # 依赖图谱技能
└── skill: context-gather  # 上下文收集技能

总监2 (Plan Agent)
├── skill: risk-assessment # 风险评估技能
├── skill: tech-selection  # 技术选型技能
└── skill: arch-design     # 架构设计技能

总监3 (General-Purpose Agent)
├── skill: tdd-workflow    # TDD 流程技能
├── skill: refactor-guide  # 重构指南技能
└── skill: api-design      # API 设计技能

总监4 (Inspector Agent)
├── skill: security-review # 安全审查技能
├── skill: code-review     # 代码审查技能
└── skill: antipattern-detect # 反模式检测（来自 Impeccable）
```

---

## B2. 技能目录结构

```
.flowharness/
└── skills/
    ├── registry.json         # 技能注册表
    ├── explore/
    │   ├── code-search.md
    │   ├── dependency-map.md
    │   └── context-gather.md
    ├── plan/
    │   ├── risk-assessment.md
    │   ├── tech-selection.md
    │   └── arch-design.md
    ├── general/
    │   ├── tdd-workflow.md
    │   ├── refactor-guide.md
    │   └── api-design.md
    └── inspector/
        ├── security-review.md
        ├── code-review.md
        └── antipattern-detect.md
```

---

## B3. 技能文件格式（参考 ECC）

每个技能是一个 Markdown 文件，包含 YAML frontmatter：

```markdown
---
name: "tdd-workflow"
owner_agent: "general"
version: "1.0"
when_to_activate:
  - "用户要求写测试"
  - "任务类型为 testing"
  - "任务描述含 TDD/测试先行"
platforms:
  - cursor
  - claude-code
  - codex
---

# TDD 工作流技能

## 激活条件

当检测到测试相关任务时自动激活。

## 工作流步骤

1. **红灯阶段**: 先写失败的测试
   - 明确输入/输出边界
   - 断言边界条件

2. **绿灯阶段**: 写最简实现让测试通过
   - 不过度设计
   - 保持代码最小化

3. **重构阶段**: 在测试保护下重构
   - 消除重复
   - 提高可读性

## 输出格式

返回结构化测试计划：
```json
{
  "type": "tdd_plan",
  "test_cases": [...],
  "implementation_hints": [...]
}
```

## 禁止行为

- 不先写实现再补测试
- 不跳过红灯阶段
```

---

## B4. 技能注册表 `registry.json`

```json
{
  "version": "1.0",
  "skills": {
    "explore": [
      {
        "id": "code-search",
        "path": ".flowharness/skills/explore/code-search.md",
        "triggers": ["搜索代码", "定位文件", "查找实现"],
        "status": "active"
      }
    ],
    "general": [
      {
        "id": "tdd-workflow",
        "path": ".flowharness/skills/general/tdd-workflow.md",
        "triggers": ["测试", "TDD", "test"],
        "status": "active"
      }
    ],
    "inspector": [
      {
        "id": "antipattern-detect",
        "path": ".flowharness/skills/inspector/antipattern-detect.md",
        "triggers": ["代码审查", "quality check", "安全扫描"],
        "status": "active"
      }
    ]
  }
}
```

---

## B5. 技能加载器实现

新增 `src/skill-loader.js`（新文件，不修改现有代码）：

```javascript
// src/skill-loader.js
const fs = require('fs');
const path = require('path');

class SkillLoader {
  constructor(config) {
    this.skillsDir = path.join(config.rootDir, '.flowharness/skills');
    this.registry = null;
  }

  async loadRegistry() {
    const registryPath = path.join(this.skillsDir, 'registry.json');
    if (fs.existsSync(registryPath)) {
      this.registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    }
    return this.registry;
  }

  // 根据 Agent 角色和任务描述匹配技能
  async matchSkills(agentRole, taskDescription) {
    if (!this.registry) await this.loadRegistry();
    
    const agentSkills = this.registry?.skills?.[agentRole] || [];
    const matched = [];

    for (const skill of agentSkills) {
      if (skill.status !== 'active') continue;
      
      const triggered = skill.triggers.some(trigger =>
        taskDescription.toLowerCase().includes(trigger.toLowerCase())
      );

      if (triggered) {
        const skillContent = await this.loadSkillContent(skill.path);
        matched.push({ ...skill, content: skillContent });
      }
    }

    return matched;
  }

  async loadSkillContent(skillPath) {
    const fullPath = path.resolve(skillPath);
    if (fs.existsSync(fullPath)) {
      return fs.readFileSync(fullPath, 'utf8');
    }
    return null;
  }
}

module.exports = { SkillLoader };
```

---

## B6. 集成到 Supervisor（最小侵入）

在 `src/task-dispatcher.js` 中增加技能注入（仅添加，不修改现有逻辑）：

```javascript
// 在 dispatch() 方法执行前注入技能上下文
async enrichTaskWithSkills(task, agentRole) {
  const skills = await this.skillLoader.matchSkills(agentRole, task.description);
  if (skills.length > 0) {
    task.enrichedContext = task.enrichedContext || {};
    task.enrichedContext.skills = skills.map(s => ({
      id: s.id,
      guidance: s.content
    }));
  }
  return task;
}
```

---

## B7. 反模式检测技能（来自 Impeccable）

作为 Inspector Agent 的专属技能，在代码审查时激活：

`.flowharness/skills/inspector/antipattern-detect.md`

```markdown
---
name: "antipattern-detect"
owner_agent: "inspector"
when_to_activate:
  - "代码审查任务"
  - "质量检查"
  - "Inspector 执行检查步骤"
---

# 反模式检测技能

## 检测维度

### 代码架构反模式
- **越级调用**: 总监直接调用其他总监（违反 AGENTS.md）
- **CEO执行代码**: Supervisor 直接修改文件（违反规则）
- **职责混淆**: 一个模块承担多个层的职责

### AI生成代码反模式
- 过度嵌套（>4层）
- 神奇字符串（无注释的硬编码值）
- 过长函数（>100行）
- 重复逻辑（DRY 违反）

### 安全反模式
- 明文密钥/密码
- 不受控的 eval/exec
- 未验证的用户输入直接执行

## 输出格式

```json
{
  "type": "antipattern_report",
  "severity": "high|medium|low",
  "issues": [
    {
      "id": "AP001",
      "pattern": "越级调用",
      "location": "src/xxx.js:42",
      "suggestion": "通过 Supervisor 进行任务委托"
    }
  ],
  "passed": false
}
```

## 禁止修改

- 不自动修复（只报告，由 General-Purpose Agent 执行修复）
- 不阻止合规代码
```

---

## B8. 验收标准

| 指标 | 要求 |
|------|------|
| 技能文件结构 | 所有12个技能文件创建完毕 |
| 注册表完整 | registry.json 包含全部技能 |
| 技能触发准确率 | ≥80%（关键词匹配正确） |
| 集成无回归 | 现有58个测试文件全部通过 |
| 反模式检测 | 能识别至少5种核心反模式 |

---

## B9. 实施顺序

```
Day 1-2: 创建目录结构 + registry.json + SkillLoader 代码
Day 3-4: 编写 12 个技能 Markdown 文件
Day 5:   集成到 task-dispatcher.js（最小侵入）
Day 6:   反模式检测技能完善
Day 7-8: 测试 + 回归验证
```
