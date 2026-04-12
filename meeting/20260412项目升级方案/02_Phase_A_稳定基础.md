# Phase A：稳定基础

**目标**: 将系统整体成功率从 ~40% 提升至 ~85%，不新增功能，只修复稳定性  
**周期**: 1周  
**原则**: 不改变任何现有规则、不修改架构、只做加固

---

## A1. 修复模拟执行随机失败

### 问题定位

`src/agent-executor.js` 中的模拟执行存在约10%随机失败注入，导致：
- 学习系统积累了大量虚假"失败模式"
- patterns.json 中 feature/general/refactor 的 failure_count 接近 success_count
- 系统信心低，熔断器过早触发

### 修复方案

**修改 `src/agent-executor.js`**（增量修改，不改接口）：

```javascript
// 当前（问题代码）
const mockFailRate = 0.10; // 10% 随机失败

// 修复后
const mockFailRate = 0.02; // 降至 2%，仅保留用于测试容错路径
```

同时在 `src/evolution-engine.js` 中增加**噪声过滤**：

```javascript
// 在 Learn 阶段过滤低置信度失败记录
filterSpuriousFailures(patterns) {
  return patterns.filter(p => {
    // 如果同一模式同时出现在成功/失败列表且总次数<5，视为噪声
    return !(p.failure_rate === 1.0 && p.total_count < 5);
  });
}
```

**修改 `.flowharness/knowledge/patterns.json` 清理策略**：
- 迁移 optimizations 到 `optimization_history.json`（防止主文件超限）
- 对 failure_patterns 中 failure_rate === 1.0 且有对应 successful_patterns 的条目降权

---

## A2. 修复 CLI 退出码

### 问题

`policy-checker.js` 的结果未正确传递到 CLI 退出码，导致：
- `check-file` 命令检测到违规但返回 exit 0
- CI 无法依赖此命令做门禁

### 修复方案

**修改 `src/cli.js`**（增量，新增退出码映射）：

```javascript
// 在 check-file 和 check-cmd 命令末尾
if (!result.allowed) {
  console.error('Policy violation detected');
  process.exit(1);  // 明确违规退出码
}
process.exit(0);
```

---

## A3. 优化 evolution-engine.js 置信度阈值

### 问题

`CrossProject` 功能需要 confidence > 0.8 才导出，但当前数据几乎无法达到：
- 成功模式 success_rate = 1.0，但 total_count 不够大（最多82次）
- 导致跨项目学习功能休眠

### 修复方案

**修改 `src/evolution-engine.js`**：

```javascript
// 当前
const EXPORT_CONFIDENCE_THRESHOLD = 0.8;
const MIN_SAMPLES_FOR_EXPORT = 50;

// 修复后（更实际的阈值）
const EXPORT_CONFIDENCE_THRESHOLD = 0.65;
const MIN_SAMPLES_FOR_EXPORT = 20;
```

---

## A4. 优化任务分解粒度（连接知识库）

### 当前问题

`task-decomposer.js` 分解子任务粒度固定，未利用 `patterns.json` 中的历史数据。

### 修复方案

在 `task-decomposer.js` 的 `decompose()` 方法中增加知识库查询：

```javascript
async decompose(task, options = {}) {
  // 新增：查询历史成功模式的平均时间
  const historicalPattern = await this.knowledgeBase.findPattern(
    `${task.type}:full_workflow`
  );
  
  // 如果有历史数据，调整子任务粒度
  if (historicalPattern && historicalPattern.avg_time > 5000) {
    // 历史平均超过5秒，说明任务复杂，增加中间检查点
    options.addCheckpoints = true;
  }
  
  return this.performDecompose(task, options);
}
```

---

## A5. 知识库文件清理策略

### 问题

`metrics.json` 已达 123403 字符（超过 100000 字符限制），影响读写性能。

### 修复方案

在 `src/knowledge-base.js` 中增加自动归档：

```javascript
async archiveOldMetrics() {
  const MAX_ENTRIES = 500;
  const data = await this.loadMetrics();
  
  if (data.events && data.events.length > MAX_ENTRIES) {
    // 归档旧条目到 metrics_archive_YYYYMM.json
    const archivePath = `.flowharness/knowledge/archive/metrics_${this.currentMonth()}.json`;
    await this.saveArchive(archivePath, data.events.slice(0, -MAX_ENTRIES));
    
    // 保留最新 MAX_ENTRIES 条
    data.events = data.events.slice(-MAX_ENTRIES);
    await this.saveMetrics(data);
  }
}
```

---

## A6. 熔断器阈值调整

### 当前问题

3级熔断器阈值过于敏感（由于高模拟失败率触发），导致系统频繁进入降级状态。

### 修复方案

**修改 `src/diagnostic-protocol.js`**：

```javascript
// 当前（过于敏感）
const CIRCUIT_BREAKER = {
  L1: { failRate: 0.3, action: 'throttle' },
  L2: { failRate: 0.5, action: 'degrade' },
  L3: { failRate: 0.7, action: 'shutdown' },
};

// 修复后（更合理的生产阈值）
const CIRCUIT_BREAKER = {
  L1: { failRate: 0.4, action: 'throttle' },
  L2: { failRate: 0.6, action: 'degrade' },
  L3: { failRate: 0.8, action: 'shutdown' },
  windowSize: 50,  // 新增：最近50次为滑动窗口（而非全局累计）
};
```

---

## A7. 验收标准

| 指标 | 当前值 | 目标值 |
|------|--------|--------|
| 系统整体成功率 | 40.2% | ≥80% |
| CLI 退出码正确率 | ~50% | 100% |
| metrics.json 大小 | 123KB | <50KB |
| CrossProject 导出成功 | 0次 | ≥1次 |
| 熔断器误触发率 | 高 | 低 |

## A8. 实施顺序

```
Day 1: A2 (CLI退出码修复) + A1 (模拟失败率降低)
Day 2: A5 (知识库清理)
Day 3: A3 (置信度阈值) + A6 (熔断器阈值)
Day 4: A4 (任务分解优化)
Day 5: 全量回归测试 + 文档更新
```

---

## 注意事项

- **A1 的修改必须在测试环境验证**：模拟失败率降低后，重跑所有集成测试，确认覆盖路径不退化
- **A5 的归档必须幂等**：多次调用不产生重复归档文件
- **以上所有修改均通过增量方式**：不替换现有方法，只在方法末尾/前端插入新逻辑
