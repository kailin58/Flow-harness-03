# Phase D：Token 智能管控

**参考来源**: RTK (meeting\14-1 深度分析报告.md + 技术架构详解.md)  
**目标**: 升级 token-tracker.js，增加输出压缩能力、持久化预算统计、可视化报告  
**周期**: 1周  
**约束**: 不修改现有 token-tracker.js 接口，只增加新能力

---

## D1. 当前 Token 管控的问题

### 现状

`token-tracker.js` 已有框架：
- 多级预算（任务/会话/日/月）
- 三级告警（60%/80%/100%）
- 硬性阻止

### 缺失

| 缺失能力 | RTK 参考 | 影响 |
|----------|---------|------|
| 输出压缩 | 12种过滤策略 | 大量冗余输出消耗 token |
| 持久化统计 | SQLite 追踪 | 历史使用数据无法查询 |
| 按任务类型分析 | `rtk gain` | 不知道哪类任务耗 token 最多 |
| 日报/月报 | `gain --daily` | 无法做成本管理决策 |
| 压缩效果反馈 | `rtk discover` | 不知道优化效果 |

---

## D2. 输出过滤压缩策略（RTK 精华）

RTK 提供了 12 种过滤策略，选取最适合 Flow Harness 的 5 种：

### 策略1: 统计摘要提取（Statistical Summary）

将冗长的测试输出从：
```
✓ test-supervisor-agent.js
  ✓ should analyze task correctly
  ✓ should decompose task
  ✓ should dispatch to correct agent
  ... (50行测试名称)
```
压缩为：
```
test-supervisor-agent.js: 50 passed, 0 failed (avg 23ms)
```

### 策略2: 错误聚焦（Error Focus）

只保留失败条目，过滤所有成功输出：
```javascript
filterTestOutput(output) {
  const lines = output.split('\n');
  const errors = lines.filter(l => 
    l.includes('FAIL') || l.includes('Error') || l.includes('✗')
  );
  const summary = lines.filter(l => 
    l.match(/\d+ passed/) || l.match(/\d+ failed/)
  );
  return [...errors, ...summary].join('\n');
}
```

### 策略3: 重复行折叠（Deduplication）

```javascript
deduplicateOutput(output) {
  const lines = output.split('\n');
  const seen = new Map(); // line -> count
  const result = [];
  
  for (const line of lines) {
    const normalized = line.trim();
    if (seen.has(normalized)) {
      seen.set(normalized, seen.get(normalized) + 1);
    } else {
      seen.set(normalized, 1);
      result.push(line);
    }
  }
  
  // 在末尾注明折叠了多少行
  const folded = [...seen.entries()]
    .filter(([_, count]) => count > 1)
    .map(([line, count]) => `[×${count}] ${line}`);
  
  return result.join('\n') + (folded.length ? '\n--- Folded ---\n' + folded.join('\n') : '');
}
```

### 策略4: JSON 关键字段提取

当命令输出 JSON 时，只保留关键字段：
```javascript
extractJsonFields(output, fields = ['status', 'error', 'summary', 'count']) {
  try {
    const parsed = JSON.parse(output);
    return JSON.stringify(
      Object.fromEntries(
        fields.filter(f => parsed[f] !== undefined).map(f => [f, parsed[f]])
      ),
      null, 2
    );
  } catch {
    return output; // 非 JSON 原样返回
  }
}
```

### 策略5: 进度条折叠

```javascript
collapseProgressBars(output) {
  // 折叠 npm install 的进度输出
  return output.replace(/\[.*?\] \d+% \d+\/\d+[^\n]*/g, '[progress collapsed]');
}
```

---

## D3. Token 压缩模块实现

新增 `src/token-compressor.js`：

```javascript
// src/token-compressor.js
class TokenCompressor {
  constructor(config = {}) {
    this.strategies = config.strategies || ['dedup', 'error-focus', 'progress-collapse'];
    this.maxOutputLength = config.maxOutputLength || 2000; // 字符
  }

  compress(output, context = {}) {
    let result = output;
    let originalLength = output.length;

    for (const strategy of this.strategies) {
      result = this.applyStrategy(strategy, result, context);
    }

    // 如果仍超长，截断并附说明
    if (result.length > this.maxOutputLength) {
      const half = this.maxOutputLength / 2;
      result = result.slice(0, half) +
        `\n... [${result.length - this.maxOutputLength} chars truncated] ...\n` +
        result.slice(-half / 2);
    }

    const compressionRatio = 1 - (result.length / originalLength);
    return { 
      compressed: result, 
      originalLength,
      compressedLength: result.length,
      ratio: compressionRatio.toFixed(2)
    };
  }

  applyStrategy(strategy, output, context) {
    switch (strategy) {
      case 'dedup': return this.deduplicateOutput(output);
      case 'error-focus': return context.onError ? this.filterTestOutput(output) : output;
      case 'progress-collapse': return this.collapseProgressBars(output);
      case 'json-extract': return this.extractJsonFields(output);
      case 'stat-summary': return this.statisticalSummary(output);
      default: return output;
    }
  }
  
  // ... 各策略实现（同上）
}

module.exports = { TokenCompressor };
```

---

## D4. 持久化 Token 统计

在 `.flowharness/knowledge/` 下增加 `token_usage.json`：

```json
{
  "version": "1.0",
  "daily": {
    "2026-04-12": {
      "total_tokens": 15420,
      "by_task_type": {
        "feature": 8200,
        "bug_fix": 3100,
        "documentation": 4120
      },
      "compressed_saved": 2340
    }
  },
  "monthly": {
    "2026-04": {
      "total_tokens": 45000,
      "budget": 100000,
      "utilization": 0.45
    }
  },
  "sessions": [
    {
      "session_id": "sess_xxx",
      "start": "2026-04-12T10:00:00Z",
      "tokens": 1200,
      "task_type": "feature"
    }
  ]
}
```

---

## D5. Token 统计报告命令

在 CLI 中增加 `/budget` 命令输出：

```
== Flow Harness Token 预算报告 ==

今日 (2026-04-12):
  已用: 15,420 / 50,000 tokens (30.8%)
  压缩节省: 2,340 tokens (13.2%)
  
按任务类型:
  feature      ████████░░  8,200  (53%)
  documentation████░░░░░░  4,120  (27%)
  bug_fix      ███░░░░░░░  3,100  (20%)

本月:
  已用: 45,000 / 100,000 tokens (45.0%)
  预计月末: ~90,000 tokens

告警状态: ✅ 正常 (阈值: 60% = 60,000)
```

---

## D6. 集成到 HookEngine（Phase C 联动）

利用 Phase C 的 `pre_tool_use` 钩子，在每次工具调用前检查预算：

```yaml
# config.yml 新增
hooks:
  lifecycle:
    pre_tool_use:
      - id: "token-compress"
        type: "builtin"
        action: "compress_previous_output"
        on_fail: "skip"
    post_tool_use:
      - id: "token-record"
        type: "builtin"
        action: "record_token_usage"
        on_fail: "skip"
```

---

## D7. 验收标准

| 指标 | 要求 |
|------|------|
| 压缩率 | 长测试输出压缩率 ≥30% |
| 持久化 | token_usage.json 每次执行后更新 |
| 预算报告 | CLI `/budget` 命令正确展示 |
| 无损压缩 | 错误信息不被过滤 |
| 性能 | 压缩耗时 <50ms（不阻塞主流程） |

---

## D8. 实施顺序

```
Day 1-2: TokenCompressor 实现 + 5种策略
Day 3:   token_usage.json 持久化逻辑
Day 4:   CLI budget 命令 + 报告格式
Day 5:   集成到 HookEngine（联动 Phase C）
Day 6-7: 测试 + 压缩率验证
```
