# Step D1：Token 压缩器 + 持久化统计 + 预算报告

> **复制本文件给任意 Agent 端（Cursor / Claude Code / Codex）即可独立执行**  
> **建议在 Phase A + Phase C1 之后执行**（需要 HookEngine 做集成）

---

## 上下文

Flow Harness 的 `token-tracker.js` 已有多级预算框架和三级告警机制，但缺少：
1. **输出压缩能力** — 参考 RTK（meeting\14-1）的 12 种过滤策略
2. **持久化统计** — 无法查询历史 Token 使用数据
3. **可视化报告** — CLI 无 `/budget` 真实数据展示

### RTK 启示
RTK 用 12 种过滤策略将终端输出压缩 60-90%。我们选取最适合 Flow Harness 的 5 种。

---

## 边界定义

### 本步骤 ONLY 创建/修改
1. `src/token-compressor.js` —— 全新文件
2. `.flowharness/knowledge/token_usage.json` —— 全新文件（持久化统计）
3. `src/cli.js` —— 修改 C2 中的 `show_budget` 管理命令（填充真实数据）
4. `test/test-token-compressor.js` —— 全新测试文件

### 本步骤 NOT 修改
- `src/token-tracker.js`（不改现有接口，压缩器是独立模块）
- supervisor-agent.js（HookEngine 集成在 C1 已完成）
- AGENTS.md / config.yml 结构

---

## 执行步骤

### 步骤 1：创建 src/token-compressor.js

**文件**: `src/token-compressor.js`（全新文件，完整代码）

```javascript
'use strict';

const fs = require('fs');
const path = require('path');

class TokenCompressor {
  constructor(options = {}) {
    this.strategies = options.strategies || ['dedup', 'error-focus', 'progress-collapse'];
    this.maxOutputLength = options.maxOutputLength || 2000;
    this.usageFilePath = options.usageFilePath ||
      path.join(process.cwd(), '.flowharness', 'knowledge', 'token_usage.json');
  }

  compress(output, context = {}) {
    if (!output || typeof output !== 'string') {
      return { compressed: output || '', originalLength: 0, compressedLength: 0, ratio: '0.00' };
    }

    let result = output;
    const originalLength = output.length;

    for (const strategy of this.strategies) {
      result = this._applyStrategy(strategy, result, context);
    }

    if (result.length > this.maxOutputLength) {
      const keepStart = Math.floor(this.maxOutputLength * 0.6);
      const keepEnd = Math.floor(this.maxOutputLength * 0.3);
      const truncated = result.length - keepStart - keepEnd;
      result = result.slice(0, keepStart) +
        `\n... [${truncated} chars truncated] ...\n` +
        result.slice(-keepEnd);
    }

    const ratio = originalLength > 0 ? (1 - result.length / originalLength) : 0;

    return {
      compressed: result,
      originalLength,
      compressedLength: result.length,
      ratio: ratio.toFixed(2),
      saved: originalLength - result.length
    };
  }

  _applyStrategy(strategy, output, context) {
    switch (strategy) {
      case 'dedup': return this._deduplicateOutput(output);
      case 'error-focus': return context.onError ? this._errorFocus(output) : output;
      case 'progress-collapse': return this._collapseProgress(output);
      case 'json-extract': return this._extractJsonFields(output);
      case 'stat-summary': return this._statSummary(output);
      default: return output;
    }
  }

  _deduplicateOutput(output) {
    const lines = output.split('\n');
    const seen = new Map();
    const result = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) { result.push(line); continue; }

      if (seen.has(trimmed)) {
        seen.set(trimmed, seen.get(trimmed) + 1);
      } else {
        seen.set(trimmed, 1);
        result.push(line);
      }
    }

    const folded = [...seen.entries()]
      .filter(([_, count]) => count > 1)
      .map(([line, count]) => `[x${count}] ${line}`);

    if (folded.length > 0) {
      result.push('--- Folded duplicates ---');
      result.push(...folded);
    }

    return result.join('\n');
  }

  _errorFocus(output) {
    const lines = output.split('\n');
    const kept = lines.filter(l =>
      l.includes('FAIL') || l.includes('Error') || l.includes('✗') ||
      l.includes('error') || l.includes('ERR') ||
      l.match(/\d+\s+(passed|failed)/) || l.match(/Tests?:/)
    );
    if (kept.length === 0) return output;
    return kept.join('\n');
  }

  _collapseProgress(output) {
    let result = output;
    result = result.replace(/\[.*?\]\s*\d+%\s*\d+\/\d+[^\n]*/g, '[progress collapsed]');
    result = result.replace(/(npm\s+warn[^\n]*\n){3,}/g, '[npm warnings collapsed]\n');
    return result;
  }

  _extractJsonFields(output, fields) {
    const defaultFields = ['status', 'error', 'summary', 'count', 'success', 'message'];
    const targetFields = fields || defaultFields;

    try {
      const parsed = JSON.parse(output);
      const extracted = {};
      for (const f of targetFields) {
        if (parsed[f] !== undefined) extracted[f] = parsed[f];
      }
      return JSON.stringify(extracted, null, 2);
    } catch {
      return output;
    }
  }

  _statSummary(output) {
    const lines = output.split('\n');
    const passCount = lines.filter(l => l.includes('✓') || l.includes('PASS')).length;
    const failCount = lines.filter(l => l.includes('✗') || l.includes('FAIL')).length;

    if (passCount + failCount > 5) {
      const summaryLines = lines.filter(l =>
        l.match(/\d+\s+(passed|failed)/) || l.includes('Tests:') ||
        l.includes('FAIL') || l.includes('✗') || l.includes('Error')
      );
      summaryLines.unshift(`Summary: ${passCount} passed, ${failCount} failed`);
      return summaryLines.join('\n');
    }
    return output;
  }

  // ============ 持久化 Token 统计 ============

  recordUsage(tokens, taskType, sessionId) {
    const usage = this._loadUsage();
    const today = new Date().toISOString().split('T')[0];
    const month = today.slice(0, 7);

    if (!usage.daily[today]) {
      usage.daily[today] = { total_tokens: 0, by_task_type: {}, compressed_saved: 0 };
    }
    usage.daily[today].total_tokens += tokens;
    usage.daily[today].by_task_type[taskType] =
      (usage.daily[today].by_task_type[taskType] || 0) + tokens;

    if (!usage.monthly[month]) {
      usage.monthly[month] = { total_tokens: 0, budget: 100000, utilization: 0 };
    }
    usage.monthly[month].total_tokens += tokens;
    usage.monthly[month].utilization =
      usage.monthly[month].total_tokens / usage.monthly[month].budget;

    if (sessionId) {
      usage.sessions.push({
        session_id: sessionId,
        timestamp: new Date().toISOString(),
        tokens,
        task_type: taskType
      });
      if (usage.sessions.length > 100) {
        usage.sessions = usage.sessions.slice(-100);
      }
    }

    this._saveUsage(usage);
  }

  recordSavedTokens(saved) {
    const usage = this._loadUsage();
    const today = new Date().toISOString().split('T')[0];
    if (!usage.daily[today]) {
      usage.daily[today] = { total_tokens: 0, by_task_type: {}, compressed_saved: 0 };
    }
    usage.daily[today].compressed_saved += saved;
    this._saveUsage(usage);
  }

  getBudgetReport() {
    const usage = this._loadUsage();
    const today = new Date().toISOString().split('T')[0];
    const month = today.slice(0, 7);

    const dailyData = usage.daily[today] || { total_tokens: 0, by_task_type: {}, compressed_saved: 0 };
    const monthlyData = usage.monthly[month] || { total_tokens: 0, budget: 100000, utilization: 0 };

    return {
      daily: {
        date: today,
        used: dailyData.total_tokens,
        saved: dailyData.compressed_saved,
        by_type: dailyData.by_task_type
      },
      monthly: {
        month: month,
        used: monthlyData.total_tokens,
        budget: monthlyData.budget,
        utilization: (monthlyData.utilization * 100).toFixed(1) + '%'
      }
    };
  }

  _loadUsage() {
    try {
      if (fs.existsSync(this.usageFilePath)) {
        return JSON.parse(fs.readFileSync(this.usageFilePath, 'utf8'));
      }
    } catch {}
    return { version: '1.0', daily: {}, monthly: {}, sessions: [] };
  }

  _saveUsage(usage) {
    try {
      const dir = path.dirname(this.usageFilePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.usageFilePath, JSON.stringify(usage, null, 2));
    } catch {}
  }
}

module.exports = { TokenCompressor };
```

---

### 步骤 2：更新 cli.js 中的 show_budget 命令

**文件**: `src/cli.js`  
**位置**: 找到 C2 中创建的 `case 'show_budget':` 区块

**替换为**:

```javascript
    case 'show_budget': {
      const { TokenCompressor } = require('./token-compressor');
      const compressor = new TokenCompressor();
      const report = compressor.getBudgetReport();
      
      console.log(chalk.blue('\n== Flow Harness Token 预算报告 ==\n'));
      
      console.log(chalk.cyan(`今日 (${report.daily.date}):`));
      console.log(`  已用: ${report.daily.used.toLocaleString()} tokens`);
      console.log(`  压缩节省: ${report.daily.saved.toLocaleString()} tokens`);
      
      if (Object.keys(report.daily.by_type).length > 0) {
        console.log(chalk.cyan('\n按任务类型:'));
        const sorted = Object.entries(report.daily.by_type).sort((a, b) => b[1] - a[1]);
        for (const [type, count] of sorted) {
          const pct = report.daily.used > 0 ? ((count / report.daily.used) * 100).toFixed(0) : 0;
          const bar = '█'.repeat(Math.ceil(pct / 10)) + '░'.repeat(10 - Math.ceil(pct / 10));
          console.log(`  ${type.padEnd(15)} ${bar}  ${count.toLocaleString()}  (${pct}%)`);
        }
      }
      
      console.log(chalk.cyan(`\n本月 (${report.monthly.month}):`));
      console.log(`  已用: ${report.monthly.used.toLocaleString()} / ${report.monthly.budget.toLocaleString()} tokens (${report.monthly.utilization})`);
      console.log('');
      break;
    }
```

---

### 步骤 3：创建测试文件

**文件**: `test/test-token-compressor.js`

```javascript
'use strict';

const assert = require('assert');
const { TokenCompressor } = require('../src/token-compressor');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      result.then(() => { passed++; console.log(`  ✓ ${name}`); })
            .catch(e => { failed++; console.log(`  ✗ ${name}: ${e.message}`); });
    } else {
      passed++;
      console.log(`  ✓ ${name}`);
    }
  } catch (err) {
    failed++;
    console.log(`  ✗ ${name}: ${err.message}`);
  }
}

console.log('test-token-compressor.js');

test('should create compressor with defaults', () => {
  const c = new TokenCompressor();
  assert.ok(c);
  assert.ok(c.strategies.length > 0);
});

test('should handle empty input', () => {
  const c = new TokenCompressor();
  const result = c.compress('');
  assert.strictEqual(result.originalLength, 0);
});

test('should deduplicate repeated lines', () => {
  const c = new TokenCompressor({ strategies: ['dedup'] });
  const input = 'line1\nline2\nline1\nline1\nline3';
  const result = c.compress(input);
  assert.ok(result.compressedLength < result.originalLength);
  assert.ok(result.compressed.includes('x3'));
});

test('should collapse progress bars', () => {
  const c = new TokenCompressor({ strategies: ['progress-collapse'] });
  const input = '[###    ] 45% 23/50 some-package\n[#####  ] 78% 39/50 other-pkg';
  const result = c.compress(input);
  assert.ok(result.compressed.includes('[progress collapsed]'));
});

test('should focus on errors', () => {
  const c = new TokenCompressor({ strategies: ['error-focus'] });
  const input = '✓ test1\n✓ test2\n✗ test3 failed\n✓ test4\n3 passed, 1 failed';
  const result = c.compress(input, { onError: true });
  assert.ok(result.compressed.includes('✗'));
  assert.ok(result.compressed.includes('failed'));
  assert.ok(!result.compressed.includes('test1'));
});

test('should truncate oversized output', () => {
  const c = new TokenCompressor({ maxOutputLength: 100, strategies: [] });
  const input = 'a'.repeat(500);
  const result = c.compress(input);
  assert.ok(result.compressedLength <= 120); // allow for truncation message
  assert.ok(result.compressed.includes('truncated'));
});

test('should calculate compression ratio', () => {
  const c = new TokenCompressor({ strategies: ['dedup'] });
  const input = 'same\n'.repeat(100);
  const result = c.compress(input);
  assert.ok(parseFloat(result.ratio) > 0);
});

test('should generate budget report', () => {
  const c = new TokenCompressor({
    usageFilePath: require('path').join(require('os').tmpdir(), 'test_token_usage.json')
  });
  const report = c.getBudgetReport();
  assert.ok(report.daily);
  assert.ok(report.monthly);
});

setTimeout(() => {
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}, 1000);
```

---

## 验证清单

- [ ] `src/token-compressor.js` 已创建，可正常 require
- [ ] 压缩器5种策略均有实现
- [ ] `node test/test-token-compressor.js` 全部通过（8个断言）
- [ ] `node src/cli.js cmd /budget` 正确展示报告（即使数据为空）
- [ ] `npm test` 全部通过

---

## 可并行信息

| 属性 | 值 |
|------|-----|
| 可并行端 | 可与 B2/A3 并行 |
| 依赖前置 | C1（HookEngine 用于后续集成）+ C2（CLI 的 show_budget 框架） |
| 被依赖 | Phase E 的输出压缩 |
| 冲突文件 | cli.js 的 show_budget 区域（与 C2 配合） |
| 预计耗时 | 40-60分钟 |
