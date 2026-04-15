# Step B2：编写 12 个技能 Markdown 文件

> **复制本文件给任意 Agent 端（Cursor / Claude Code / Codex）即可独立执行**  
> **需等待 Step B1 完成**（需要目录已创建）  
> **内部可多端并行**：4组技能文件可分配给不同端同时写

---

## 上下文

Step B1 已创建目录结构和 registry.json。本步骤编写 12 个技能 Markdown 文件，每个文件遵循统一的 YAML frontmatter + Markdown 正文格式。

### 技能文件格式规范（参考 ECC meeting\13-1）

```markdown
---
name: "技能ID"
owner_agent: "explore|plan|general|inspector"
version: "1.0"
when_to_activate:
  - "触发条件1（自然语言）"
  - "触发条件2"
platforms:
  - cursor
  - claude-code
  - codex
---

# 技能名称

## 激活条件
何时使用此技能的详细说明。

## 工作流步骤
具体的执行步骤。

## 输出格式
返回的结构化数据格式。

## 禁止行为
不能做的事情。
```

---

## 边界定义

### 本步骤 ONLY 创建
1. `.flowharness/skills/explore/code-search.md`
2. `.flowharness/skills/explore/dependency-map.md`
3. `.flowharness/skills/explore/context-gather.md`
4. `.flowharness/skills/plan/risk-assessment.md`
5. `.flowharness/skills/plan/tech-selection.md`
6. `.flowharness/skills/plan/arch-design.md`
7. `.flowharness/skills/general/tdd-workflow.md`
8. `.flowharness/skills/general/refactor-guide.md`
9. `.flowharness/skills/general/api-design.md`
10. `.flowharness/skills/inspector/security-review.md`
11. `.flowharness/skills/inspector/code-review.md`
12. `.flowharness/skills/inspector/antipattern-detect.md`

### 本步骤 NOT 修改
- 任何 src/ 文件
- registry.json（B1 已完成）
- 任何现有文件

---

## 多端并行分工

| 端 | 负责文件 | 估时 |
|---|---------|------|
| **端1** | explore/ 3个 + plan/ risk-assessment.md | 30分钟 |
| **端2** | plan/ tech-selection.md + arch-design.md + general/ tdd-workflow.md + refactor-guide.md | 30分钟 |
| **端3** | general/ api-design.md + inspector/ 3个 | 30分钟 |

---

## 每个文件的完整内容

### 文件 1: `.flowharness/skills/explore/code-search.md`

```markdown
---
name: "code-search"
owner_agent: "explore"
version: "1.0"
when_to_activate:
  - "需要在代码库中搜索特定符号、函数、类"
  - "定位 Bug 所在文件"
  - "查找某个功能的实现位置"
platforms:
  - cursor
  - claude-code
  - codex
---

# 代码搜索技能

## 激活条件

当任务涉及以下场景时激活：
- 用户描述包含"搜索"、"查找"、"定位"、"在哪"等关键词
- 任务类型为 bug_fix 且需要先定位问题位置
- 需要在多个文件中查找某个函数/类的引用

## 工作流步骤

1. **理解搜索目标**: 从任务描述中提取要搜索的关键词（函数名、类名、错误消息）
2. **选择搜索策略**:
   - 精确匹配：已知确切名称 → 使用 grep/ripgrep
   - 模糊搜索：只知道功能描述 → 使用语义搜索
   - 文件类型过滤：限定 *.js / *.ts 等
3. **执行搜索**: 按 src/ → test/ → examples/ 的优先级顺序搜索
4. **排除干扰**: 自动排除 node_modules/、.flowharness/knowledge/、dist/
5. **整理结果**: 按相关性排序，返回文件路径 + 行号 + 上下文片段

## 输出格式

```json
{
  "type": "search_result",
  "query": "搜索关键词",
  "matches": [
    {
      "file": "src/xxx.js",
      "line": 42,
      "context": "匹配行的上下文",
      "relevance": "high"
    }
  ],
  "total": 5,
  "strategy_used": "exact_match"
}
```

## 禁止行为

- 不修改任何文件（Explore Agent 是只读的）
- 不搜索 .env / secrets/ 等敏感路径
- 不返回超过 20 个结果（防止信息过载）
```

---

### 文件 2: `.flowharness/skills/explore/dependency-map.md`

```markdown
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
```

---

### 文件 3: `.flowharness/skills/explore/context-gather.md`

```markdown
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
```

---

### 文件 4: `.flowharness/skills/plan/risk-assessment.md`

```markdown
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
```

---

### 文件 5: `.flowharness/skills/plan/tech-selection.md`

```markdown
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
```

---

### 文件 6: `.flowharness/skills/plan/arch-design.md`

```markdown
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
```

---

### 文件 7: `.flowharness/skills/general/tdd-workflow.md`

```markdown
---
name: "tdd-workflow"
owner_agent: "general"
version: "1.0"
when_to_activate:
  - "用户要求写测试"
  - "任务类型为 testing"
  - "任务描述含 TDD/测试先行/单元测试"
platforms:
  - cursor
  - claude-code
  - codex
---

# TDD 工作流技能

## 工作流步骤

1. **红灯阶段**: 先写失败的测试
   - 明确输入/输出边界
   - 覆盖正常路径 + 至少2个边界条件
   - 测试文件命名 `test/test-<模块名>.js`
2. **绿灯阶段**: 写最简实现让测试通过
   - 不过度设计
   - 只满足测试要求
3. **重构阶段**: 在测试保护下重构
   - 消除重复
   - 提高可读性

## 测试文件格式（匹配项目现有风格）

```javascript
'use strict';
const assert = require('assert');
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch(e) { failed++; console.log('  ✗ ' + name + ': ' + e.message); }
}
// tests here...
console.log(passed + ' passed, ' + failed + ' failed');
if (failed) process.exit(1);
```

## 禁止行为

- 不先写实现再补测试
- 不跳过红灯阶段
- 不使用 jest/mocha 等外部测试框架（项目使用原生 assert）
```

---

### 文件 8: `.flowharness/skills/general/refactor-guide.md`

```markdown
---
name: "refactor-guide"
owner_agent: "general"
version: "1.0"
when_to_activate:
  - "任务类型为 refactor"
  - "需要优化/整理现有代码"
  - "任务描述包含'重构'、'优化'、'整理'"
platforms:
  - cursor
  - claude-code
  - codex
---

# 重构指南技能

## 工作流步骤

1. **确认测试覆盖**: 确保要重构的模块有对应测试文件
2. **小步修改**: 每次只做一个小改动
3. **保持接口**: 不改变 module.exports 的公开 API
4. **验证**: 每步改完运行 `node test/test-<模块>.js`

## 常用重构手法

| 手法 | 适用场景 |
|------|---------|
| 提取函数 | 函数 >50 行 |
| 合并重复 | 两处以上相同逻辑 |
| 重命名 | 变量名不能表达意图 |
| 简化条件 | 嵌套 if >3 层 |

## 禁止行为

- 不在无测试覆盖的情况下重构
- 不改变公开 API 签名（除非任务明确要求）
- 不一次性大规模重写
```

---

### 文件 9: `.flowharness/skills/general/api-design.md`

```markdown
---
name: "api-design"
owner_agent: "general"
version: "1.0"
when_to_activate:
  - "需要设计或实现 API/接口"
  - "任务描述包含'API'、'接口'、'endpoint'"
platforms:
  - cursor
  - claude-code
  - codex
---

# API 设计技能

## 工作流步骤

1. **定义接口契约**: 入参类型、返回值类型、错误码
2. **遵循 JSDoc**: 所有 public 方法添加 JSDoc 注释
3. **错误处理**: 统一使用 throw Error 或 { success, error } 模式
4. **向后兼容**: 新增参数使用 options 对象，带默认值

## 输出格式

按项目风格，每个模块导出一个 class：
```javascript
class NewModule {
  constructor(options = {}) { }
  async publicMethod(input) { }
}
module.exports = NewModule;
// 或 module.exports = { NewModule };
```

## 禁止行为

- 不破坏现有 API 契约（AGENTS.md 禁止项）
- 不引入新的 npm 依赖（除非 Plan Agent 已批准）
```

---

### 文件 10: `.flowharness/skills/inspector/security-review.md`

```markdown
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

## 检查清单

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
```

---

### 文件 11: `.flowharness/skills/inspector/code-review.md`

```markdown
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

## 审查维度

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
```

---

### 文件 12: `.flowharness/skills/inspector/antipattern-detect.md`

```markdown
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

## 检测维度

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
```

---

## 验证清单

- [ ] 12 个 .md 文件全部创建在正确的目录下
- [ ] 每个文件都包含 YAML frontmatter（---...---）
- [ ] 每个文件的 `owner_agent` 值与所在目录一致
- [ ] 每个文件包含"工作流步骤"和"输出格式"段落
- [ ] 每个文件包含"禁止行为"段落
- [ ] `node test/test-skill-loader.js` 测试通过（技能内容可被加载）

---

## 可并行信息

| 属性 | 值 |
|------|-----|
| 可并行端 | 内部 3 端并行（explore+plan / general / inspector） |
| 依赖前置 | Step B1（目录已创建） |
| 被依赖 | B3（集成需要技能文件存在） |
| 冲突文件 | 全部新建，无冲突 |
| 预计耗时 | 30分钟（单端） / 15分钟（3端并行） |
