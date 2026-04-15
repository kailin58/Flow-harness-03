# Step A3：优化进化引擎阈值 + 任务分解连接知识库

> **复制本文件给任意 Agent 端（Cursor / Claude Code / Codex）即可独立执行**  
> **需等待 Step A1 完成**（依赖知识库清理后的干净数据）

---

## 上下文

Flow Harness 的进化引擎 `evolution-engine.js` 拥有完整的 Sense→Record→Learn→Verify→Push→CrossProject 能力闭环，但 CrossProject（跨项目复用）功能因为导出阈值过高而处于休眠状态。当前要求 confidence > 0.8 且 samples > 50，实际数据中最大的 `successful_patterns` 条目只有 82 次运行。

任务分解器 `task-decomposer.js` 的子任务粒度完全固定，没有利用 `patterns.json` 中的历史数据来动态调整。

### 现状
- `src/evolution-engine.js`：约 1420 行，搜索 `EXPORT` / `threshold` / `confidence` 找阈值
- `src/task-decomposer.js`：decompose() 方法不查询 KnowledgeBase
- `.flowharness/knowledge/patterns.json`：包含 successful_patterns（6条）和 failure_patterns（6条）

---

## 边界定义

### 本步骤 ONLY 修改
1. `src/evolution-engine.js` —— CrossProject 导出阈值
2. `src/task-decomposer.js` —— decompose() 方法中增加知识库查询

### 本步骤 NOT 修改
- AGENTS.md / config.yml（不可动）
- supervisor-agent.js（A1 负责）
- knowledge-base.js（A1 负责）
- cli.js（A2 负责）
- diagnostic-protocol.js（A2 负责）

---

## 执行步骤

### 步骤 1：降低 evolution-engine.js 导出阈值

**文件**: `src/evolution-engine.js`  
**搜索**: 在文件中搜索以下关键词之一：
- `confidence`
- `EXPORT`
- `threshold`
- `MIN_SAMPLES`
- `minSamples`

**找到导出阈值配置**（可能是常量或构造函数参数）：

```javascript
// 当前（搜索到的实际值）
confidenceThreshold: 0.8    // 或类似名称
minSamples: 50              // 或 MIN_SAMPLES_FOR_EXPORT
```

**改为**:
```javascript
confidenceThreshold: 0.65
minSamples: 20
```

**如果阈值在构造函数的 options 中**:
```javascript
// 找到类似 this.xxxThreshold = options.xxx || 0.8 的行
// 将默认值 0.8 改为 0.65
// 将 minSamples 默认值改为 20
```

---

### 步骤 2：在 evolution-engine.js 中添加噪声过滤

**文件**: `src/evolution-engine.js`  
**位置**: 在 Learn 阶段的方法中（搜索 `learn` 或 `Learn`）

**在学习方法开头添加噪声过滤**:

```javascript
/**
 * 过滤虚假失败模式（模拟执行噪声）
 * 同一个 pattern 同时出现在成功和失败列表中，且失败次数 < 5 时视为噪声
 */
_filterSpuriousFailures(failurePatterns, successPatterns) {
  if (!failurePatterns || !successPatterns) return failurePatterns || [];
  
  const successSet = new Set(successPatterns.map(p => p.pattern));
  
  return failurePatterns.filter(fp => {
    if (successSet.has(fp.pattern) && fp.total_count < 5) {
      return false; // 噪声，过滤掉
    }
    return true;
  });
}
```

**然后在 Learn 阶段调用此方法**：在读取 failure_patterns 后、分析之前插入过滤逻辑。

---

### 步骤 3：task-decomposer.js 连接知识库

**文件**: `src/task-decomposer.js`  
**搜索**: 找到主入口方法（`decompose` 或 `decompose(task)` 或类似名称）

**在该方法的开头、实际分解逻辑之前，添加知识库查询**:

```javascript
// 在 decompose() 方法开头添加（在 return 之前）
// 查询历史执行模式，动态调整分解策略
let knowledgeHint = null;
try {
  if (this.knowledgeBase) {
    const patterns = await this.knowledgeBase.getPatterns();
    if (patterns && patterns.successful_patterns) {
      const matchedPattern = patterns.successful_patterns.find(
        p => p.workflow === task.type && p.step === 'full_workflow'
      );
      if (matchedPattern) {
        knowledgeHint = {
          avgTime: matchedPattern.avg_time,
          reliability: matchedPattern.recommendation,
          sampleCount: matchedPattern.success_count
        };
      }
    }
  }
} catch (e) {
  // 知识库查询失败不阻塞分解流程
}
```

**然后利用 knowledgeHint 调整粒度**:

```javascript
// 在确定子任务数量或粒度的逻辑处
if (knowledgeHint) {
  // 如果历史平均时间 > 5000ms，说明任务复杂，增加子任务数
  if (knowledgeHint.avgTime > 5000) {
    // 在子任务列表中插入额外的检查点子任务
    // 具体方式取决于现有分解逻辑的数据结构
  }
}
```

**注意**: `task-decomposer.js` 可能没有 `this.knowledgeBase` 引用。需要确认构造函数是否接受 knowledgeBase 参数。如果没有：

选项A（推荐）：在 `supervisor-agent.js` 中创建 TaskDecomposer 时传入：
```javascript
// supervisor-agent.js 构造函数中，找到:
this.taskDecomposer = new TaskDecomposer();
// 改为:
this.taskDecomposer = new TaskDecomposer({ knowledgeBase: this.knowledgeBase });
```

选项B：让 decompose 方法接受 options 参数，从外部传入 patterns 数据。

---

### 步骤 4：验证 CrossProject 导出

在 A1 完成知识库清理后，运行以下验证：

```bash
node -e "
const { EvolutionEngine } = require('./src/evolution-engine');
const KnowledgeBase = require('./src/knowledge-base');
const kb = new KnowledgeBase();
const engine = new EvolutionEngine({ knowledgeBase: kb });

// 检查是否有可导出的策略
const strategies = engine.getStrategies ? engine.getStrategies() : [];
console.log('Exportable strategies:', strategies.filter(s => s.status === 'verified').length);
console.log('Engine initialized successfully');
"
```

---

## 验证清单

- [ ] evolution-engine.js 中 confidence 阈值已改为 0.65
- [ ] evolution-engine.js 中 minSamples 已改为 20
- [ ] evolution-engine.js 中新增 `_filterSpuriousFailures()` 方法
- [ ] task-decomposer.js 的 decompose() 方法可查询知识库（无报错）
- [ ] `npm test` 全部通过
- [ ] 知识库查询失败不影响正常分解流程（容错测试）

---

## 可并行信息

| 属性 | 值 |
|------|-----|
| 可并行端 | 任意一端独立执行 |
| 依赖前置 | Step A1（需要清理后的知识库数据） |
| 被依赖 | Phase B/C/D/E 不直接依赖 |
| 冲突文件 | evolution-engine.js, task-decomposer.js, supervisor-agent.js（仅改一行构造参数） |
| 预计耗时 | 30-60分钟 |
