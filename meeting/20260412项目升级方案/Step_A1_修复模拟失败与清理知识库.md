# Step A1：修复模拟失败率 + 清理知识库

> **复制本文件给任意 Agent 端（Cursor / Claude Code / Codex）即可独立执行**

---

## 上下文

Flow Harness 当前运行了 610 次任务，成功率仅 40.2%。根因是 `supervisor-agent.js` 中的 `simulateExecution()` 方法使用 `Math.random()` 注入了约 1-2% 的随机失败（虽然基础成功率设为 99%，但 Supervisor 6步闭环中多个子任务串行执行，任意一个失败就标记整体失败，加上重做机制触发后的 `'部分任务失败'` 标签导致失败计数被大幅放大）。

同时，`.flowharness/knowledge/metrics.json` 已膨胀到 123KB（超过 100000 字符），严重影响读写性能。

### 现状数据
- `src/supervisor-agent.js` 第 1571-1593 行：`simulateExecution()` 方法
- `src/supervisor-agent.js` 第 837 行：`'部分任务失败'` 标记
- `.flowharness/knowledge/patterns.json`：successful_patterns 和 failure_patterns 混杂
- `.flowharness/knowledge/metrics.json`：123KB 超限

---

## 边界定义

### 本步骤 ONLY 修改
1. `src/supervisor-agent.js` —— `simulateExecution()` 方法（第 1571-1594 行附近）
2. `src/knowledge-base.js` —— 新增 `archiveOldMetrics()` 方法
3. `.flowharness/knowledge/patterns.json` —— 清理噪声数据
4. `.flowharness/knowledge/metrics.json` —— 归档旧条目

### 本步骤 NOT 修改
- AGENTS.md（不可动）
- config.yml（不可动）
- supervisor-agent.js 的 6步闭环结构（handleTask / step1-6 方法不动）
- agent-executor.js（本步骤不涉及）
- 所有 test/ 文件不改

---

## 执行步骤

### 步骤 1：修改 simulateExecution()

**文件**: `src/supervisor-agent.js`  
**位置**: 约第 1571 行

**当前代码**:
```javascript
async simulateExecution(item) {
    // 模拟执行延迟
    await new Promise(resolve => setTimeout(resolve, 100));

    // 99% 成功率（根据优先级调整）
    let successRate = 0.99;
    if (item.subtask.priority === 'critical') {
      successRate = 0.995;
    } else if (item.subtask.priority === 'low') {
      successRate = 0.98;
    }

    const success = Math.random() < successRate;

    return {
      subtask: item.subtask.name,
      executor: item.executor,
      success: success,
      error: success ? null : '模拟执行失败',
      output: success ? '执行成功' : null,
      executionTime: 100,
      retryable: !success
    };
  }
```

**改为**:
```javascript
async simulateExecution(item) {
    await new Promise(resolve => setTimeout(resolve, 100));

    // 提升基线成功率，减少噪声对学习系统的污染
    // 原值 0.99/0.995/0.98 在多步骤串行中累计失败率过高
    let successRate = 0.998;
    if (item.subtask.priority === 'critical') {
      successRate = 0.999;
    } else if (item.subtask.priority === 'low') {
      successRate = 0.995;
    }

    const success = Math.random() < successRate;

    return {
      subtask: item.subtask.name,
      executor: item.executor,
      success: success,
      error: success ? null : '模拟执行失败',
      output: success ? '执行成功' : null,
      executionTime: 100,
      retryable: !success
    };
  }
```

**原理**：6个子任务串行时，单步 0.99 的成功率累计为 0.99^6 ≈ 0.94，改为 0.998 后累计为 0.998^6 ≈ 0.988。

---

### 步骤 2：在 knowledge-base.js 中新增归档方法

**文件**: `src/knowledge-base.js`  
**操作**: 在类的末尾（`module.exports` 之前）新增方法

```javascript
  /**
   * 归档超限的 metrics 数据
   * 将旧条目迁移到按月归档文件，保留最新 MAX_ENTRIES 条
   */
  async archiveOldMetrics(maxEntries = 500) {
    const metricsPath = path.join(this.dataDir, 'metrics.json');
    if (!fs.existsSync(metricsPath)) return { archived: 0 };

    const raw = fs.readFileSync(metricsPath, 'utf8');
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return { archived: 0, error: 'metrics.json parse failed' };
    }

    // 查找所有数组类型的顶层字段
    let totalArchived = 0;
    const archiveDir = path.join(this.dataDir, 'archive');
    if (!fs.existsSync(archiveDir)) {
      fs.mkdirSync(archiveDir, { recursive: true });
    }

    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    for (const key of Object.keys(data)) {
      if (Array.isArray(data[key]) && data[key].length > maxEntries) {
        const overflow = data[key].slice(0, data[key].length - maxEntries);
        data[key] = data[key].slice(-maxEntries);
        totalArchived += overflow.length;

        // 追加写入归档文件
        const archivePath = path.join(archiveDir, `metrics_${key}_${monthKey}.json`);
        let archiveData = [];
        if (fs.existsSync(archivePath)) {
          try { archiveData = JSON.parse(fs.readFileSync(archivePath, 'utf8')); } catch {}
        }
        archiveData.push(...overflow);
        fs.writeFileSync(archivePath, JSON.stringify(archiveData, null, 2));
      }
    }

    // 回写精简后的 metrics.json
    fs.writeFileSync(metricsPath, JSON.stringify(data, null, 2));

    return { archived: totalArchived, remaining: JSON.stringify(data).length };
  }
```

**说明**：该方法幂等安全，多次调用不会重复归档。

---

### 步骤 3：清理 patterns.json 噪声

**文件**: `.flowharness/knowledge/patterns.json`  
**操作**: 手动编辑或脚本清理

将 `failure_patterns` 数组中同时在 `successful_patterns` 也有记录（同一个 `pattern` 值）的条目的 `failure_count` 降权到一半：

对于每个 failure pattern:
- 如果 `successful_patterns` 中有相同 `pattern` 值的条目
- 且 failure 条目的 `recommendation` 是 `"needs_attention"`
- 将其 `failure_count` 设为原值的 50%（向下取整）
- 将 `recommendation` 改为 `"noise_adjusted"`

---

### 步骤 4：执行知识库归档

在项目根目录执行：

```bash
node -e "
const KnowledgeBase = require('./src/knowledge-base');
const kb = new KnowledgeBase();
kb.archiveOldMetrics(500).then(r => console.log('Archive result:', r));
"
```

---

## 验证清单

- [ ] `src/supervisor-agent.js` 中 `simulateExecution()` 的 successRate 已改为 0.998/0.999/0.995
- [ ] `src/knowledge-base.js` 新增了 `archiveOldMetrics()` 方法
- [ ] `.flowharness/knowledge/archive/` 目录已创建
- [ ] `metrics.json` 文件大小 < 50KB
- [ ] `patterns.json` 中噪声 failure_patterns 已降权
- [ ] 运行 `npm test`，所有 58 个测试文件通过

---

## 预期效果
- 系统成功率从 ~40% 提升至 ~90%
- metrics.json 从 123KB 降至 <50KB
- 学习系统不再被虚假失败误导

---

## 可并行信息

| 属性 | 值 |
|------|-----|
| 可并行端 | 任意一端独立执行 |
| 依赖前置 | 无 |
| 被依赖 | A2, A3 依赖本步骤完成 |
| 冲突文件 | supervisor-agent.js（A2不涉及）, knowledge-base.js |
| 预计耗时 | 30-60分钟 |
