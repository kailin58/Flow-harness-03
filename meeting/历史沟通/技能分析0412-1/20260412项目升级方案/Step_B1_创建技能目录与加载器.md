# Step B1：创建技能目录结构 + SkillLoader + registry.json

> **复制本文件给任意 Agent 端（Cursor / Claude Code / Codex）即可独立执行**  
> **可与 Phase A 并行执行**（无文件冲突）

---

## 上下文

Flow Harness 当前缺少技能系统。4个总监 Agent（Explore/Plan/General/Inspector）没有可复用的专业知识库。参考 ECC 项目（meeting\13-1）的技能体系设计，我们需要为每个总监创建可配置的技能文件。

### 设计原则（来自 AGENTS.md 约束）
- **技能 ≠ Agent**：技能是总监的工具/知识增强，不是新增角色
- 不增加任何新 Agent（1 CEO + 4 总监架构不可变）
- 技能通过 Markdown + YAML frontmatter 描述，被 SkillLoader 加载
- 技能目录放在 `.flowharness/skills/`，与 `.flowharness/knowledge/` 平级

### 项目当前文件结构
```
.flowharness/
├── config.yml
├── hooks/
├── knowledge/
│   ├── metrics.json
│   └── patterns.json
├── policies/
├── sandboxes/
├── test-sandboxes/
└── workflows/
```

---

## 边界定义

### 本步骤 ONLY 创建/修改
1. `.flowharness/skills/` —— 新建整个目录结构（4个子目录）
2. `.flowharness/skills/registry.json` —— 技能注册表
3. `src/skill-loader.js` —— 新建文件
4. `test/test-skill-loader.js` —— 新建测试文件

### 本步骤 NOT 修改
- 任何现有 src/ 文件（集成在 B3 做）
- AGENTS.md / config.yml
- 技能 Markdown 内容文件（在 B2 写）

---

## 执行步骤

### 步骤 1：创建目录结构

```bash
mkdir -p .flowharness/skills/explore
mkdir -p .flowharness/skills/plan
mkdir -p .flowharness/skills/general
mkdir -p .flowharness/skills/inspector
```

Windows PowerShell:
```powershell
New-Item -ItemType Directory -Force -Path ".flowharness/skills/explore"
New-Item -ItemType Directory -Force -Path ".flowharness/skills/plan"
New-Item -ItemType Directory -Force -Path ".flowharness/skills/general"
New-Item -ItemType Directory -Force -Path ".flowharness/skills/inspector"
```

---

### 步骤 2：创建 registry.json

**文件**: `.flowharness/skills/registry.json`

```json
{
  "version": "1.0",
  "description": "Flow Harness 技能注册表 - 为 4 个总监 Agent 提供专业能力增强",
  "skills": {
    "explore": [
      {
        "id": "code-search",
        "name": "代码搜索技能",
        "path": ".flowharness/skills/explore/code-search.md",
        "triggers": ["搜索代码", "定位文件", "查找实现", "代码在哪", "find", "search", "grep"],
        "status": "active"
      },
      {
        "id": "dependency-map",
        "name": "依赖图谱技能",
        "path": ".flowharness/skills/explore/dependency-map.md",
        "triggers": ["依赖关系", "模块依赖", "import", "require", "引用分析"],
        "status": "active"
      },
      {
        "id": "context-gather",
        "name": "上下文收集技能",
        "path": ".flowharness/skills/explore/context-gather.md",
        "triggers": ["收集上下文", "了解现状", "分析项目", "项目结构", "目录结构"],
        "status": "active"
      }
    ],
    "plan": [
      {
        "id": "risk-assessment",
        "name": "风险评估技能",
        "path": ".flowharness/skills/plan/risk-assessment.md",
        "triggers": ["风险", "risk", "评估风险", "安全影响", "影响分析"],
        "status": "active"
      },
      {
        "id": "tech-selection",
        "name": "技术选型技能",
        "path": ".flowharness/skills/plan/tech-selection.md",
        "triggers": ["技术选型", "框架选择", "工具选择", "方案对比", "技术栈"],
        "status": "active"
      },
      {
        "id": "arch-design",
        "name": "架构设计技能",
        "path": ".flowharness/skills/plan/arch-design.md",
        "triggers": ["架构", "设计方案", "系统设计", "模块设计", "接口设计"],
        "status": "active"
      }
    ],
    "general": [
      {
        "id": "tdd-workflow",
        "name": "TDD 工作流技能",
        "path": ".flowharness/skills/general/tdd-workflow.md",
        "triggers": ["测试", "TDD", "test", "先写测试", "测试驱动", "单元测试"],
        "status": "active"
      },
      {
        "id": "refactor-guide",
        "name": "重构指南技能",
        "path": ".flowharness/skills/general/refactor-guide.md",
        "triggers": ["重构", "refactor", "优化代码", "代码整理", "消除重复"],
        "status": "active"
      },
      {
        "id": "api-design",
        "name": "API 设计技能",
        "path": ".flowharness/skills/general/api-design.md",
        "triggers": ["API", "接口", "endpoint", "REST", "路由设计"],
        "status": "active"
      }
    ],
    "inspector": [
      {
        "id": "security-review",
        "name": "安全审查技能",
        "path": ".flowharness/skills/inspector/security-review.md",
        "triggers": ["安全", "security", "漏洞", "vulnerability", "安全扫描", "审计"],
        "status": "active"
      },
      {
        "id": "code-review",
        "name": "代码审查技能",
        "path": ".flowharness/skills/inspector/code-review.md",
        "triggers": ["代码审查", "code review", "review", "代码质量", "PR审查"],
        "status": "active"
      },
      {
        "id": "antipattern-detect",
        "name": "反模式检测技能",
        "path": ".flowharness/skills/inspector/antipattern-detect.md",
        "triggers": ["反模式", "antipattern", "bad practice", "代码坏味道", "质量检查"],
        "status": "active"
      }
    ]
  }
}
```

---

### 步骤 3：创建 src/skill-loader.js

**文件**: `src/skill-loader.js`（全新文件）

```javascript
'use strict';

const fs = require('fs');
const path = require('path');

class SkillLoader {
  constructor(options = {}) {
    this.rootDir = options.rootDir || process.cwd();
    this.skillsDir = path.join(this.rootDir, '.flowharness', 'skills');
    this.registry = null;
    this._loaded = false;
  }

  async loadRegistry() {
    const registryPath = path.join(this.skillsDir, 'registry.json');
    if (!fs.existsSync(registryPath)) {
      this.registry = { version: '1.0', skills: {} };
      return this.registry;
    }

    try {
      const raw = fs.readFileSync(registryPath, 'utf8');
      this.registry = JSON.parse(raw);
    } catch (err) {
      this.registry = { version: '1.0', skills: {} };
    }
    this._loaded = true;
    return this.registry;
  }

  async matchSkills(agentRole, taskDescription) {
    if (!this._loaded) await this.loadRegistry();

    const agentSkills = this.registry?.skills?.[agentRole] || [];
    const matched = [];
    const descLower = (taskDescription || '').toLowerCase();

    for (const skill of agentSkills) {
      if (skill.status !== 'active') continue;

      const triggered = skill.triggers.some(trigger =>
        descLower.includes(trigger.toLowerCase())
      );

      if (triggered) {
        const content = this._loadSkillContent(skill.path);
        matched.push({
          id: skill.id,
          name: skill.name,
          path: skill.path,
          content: content
        });
      }
    }

    return matched;
  }

  listSkills(agentRole) {
    if (!this._loaded) {
      this.loadRegistry();
    }

    if (agentRole) {
      return this.registry?.skills?.[agentRole] || [];
    }

    const all = [];
    for (const [role, skills] of Object.entries(this.registry?.skills || {})) {
      for (const skill of skills) {
        all.push({ ...skill, agent: role });
      }
    }
    return all;
  }

  _loadSkillContent(skillPath) {
    const fullPath = path.isAbsolute(skillPath)
      ? skillPath
      : path.join(this.rootDir, skillPath);

    if (fs.existsSync(fullPath)) {
      try {
        return fs.readFileSync(fullPath, 'utf8');
      } catch {
        return null;
      }
    }
    return null;
  }
}

module.exports = { SkillLoader };
```

---

### 步骤 4：创建测试文件 test/test-skill-loader.js

**文件**: `test/test-skill-loader.js`（全新文件）

```javascript
'use strict';

const assert = require('assert');
const path = require('path');
const { SkillLoader } = require('../src/skill-loader');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ✗ ${name}: ${err.message}`);
  }
}

console.log('test-skill-loader.js');

// Test 1: 构造函数
test('should create SkillLoader with default rootDir', () => {
  const loader = new SkillLoader();
  assert.ok(loader.rootDir);
  assert.strictEqual(loader._loaded, false);
});

// Test 2: 加载 registry
test('should load registry from .flowharness/skills/', async () => {
  const loader = new SkillLoader({ rootDir: process.cwd() });
  const registry = await loader.loadRegistry();
  assert.ok(registry);
  assert.strictEqual(registry.version, '1.0');
});

// Test 3: 匹配技能 - explore agent
test('should match code-search skill for explore agent', async () => {
  const loader = new SkillLoader({ rootDir: process.cwd() });
  await loader.loadRegistry();
  const skills = await loader.matchSkills('explore', '搜索代码找到相关文件');
  assert.ok(skills.length > 0);
  assert.strictEqual(skills[0].id, 'code-search');
});

// Test 4: 匹配技能 - inspector agent
test('should match security-review for inspector', async () => {
  const loader = new SkillLoader({ rootDir: process.cwd() });
  await loader.loadRegistry();
  const skills = await loader.matchSkills('inspector', '进行安全审查');
  assert.ok(skills.length > 0);
  const ids = skills.map(s => s.id);
  assert.ok(ids.includes('security-review'));
});

// Test 5: 不匹配的任务描述
test('should return empty array for unmatched description', async () => {
  const loader = new SkillLoader({ rootDir: process.cwd() });
  await loader.loadRegistry();
  const skills = await loader.matchSkills('explore', '吃晚饭');
  assert.strictEqual(skills.length, 0);
});

// Test 6: 无效 agentRole
test('should return empty for invalid agent role', async () => {
  const loader = new SkillLoader({ rootDir: process.cwd() });
  await loader.loadRegistry();
  const skills = await loader.matchSkills('nonexistent', '搜索代码');
  assert.strictEqual(skills.length, 0);
});

// Test 7: listSkills
test('should list all skills', async () => {
  const loader = new SkillLoader({ rootDir: process.cwd() });
  await loader.loadRegistry();
  const all = loader.listSkills();
  assert.ok(all.length >= 12);
});

// Test 8: listSkills by role
test('should list skills for specific role', async () => {
  const loader = new SkillLoader({ rootDir: process.cwd() });
  await loader.loadRegistry();
  const inspectorSkills = loader.listSkills('inspector');
  assert.strictEqual(inspectorSkills.length, 3);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

---

## 验证清单

- [ ] `.flowharness/skills/` 目录及4个子目录已创建
- [ ] `.flowharness/skills/registry.json` 存在且包含12个技能定义
- [ ] `src/skill-loader.js` 存在且可正常 require
- [ ] `node test/test-skill-loader.js` 全部通过（8个断言）
- [ ] `npm test` 全部通过（原有58个 + 新增1个）
- [ ] 没有修改任何现有 src/ 文件

---

## 可并行信息

| 属性 | 值 |
|------|-----|
| 可并行端 | **端1** 执行 B1，**端2** 同时执行 A1/A2 |
| 依赖前置 | 无 |
| 被依赖 | B2（需要目录结构）、B3（需要 SkillLoader） |
| 冲突文件 | 全部新建，无冲突 |
| 预计耗时 | 30-45分钟 |
