# Step A2：修复 CLI 退出码 + 调整熔断器阈值

> **复制本文件给任意 Agent 端（Cursor / Claude Code / Codex）即可独立执行**  
> **可与 Step A1 并行执行**（无文件冲突）

---

## 上下文

Flow Harness 的 CLI 工具 `src/cli.js` 提供了 `check-file` 和 `check-cmd` 命令用于策略检查，但当检测到违规时仍然返回 exit code 0，导致 CI 无法依赖这些命令做安全门禁。

同时，`src/diagnostic-protocol.js` 中的 3级熔断器因为历史高失败率（40%→60%）频繁被触发到 L1/L2 降级状态，即使在 A1 修复失败率后，历史数据仍会让熔断器误判。

### 现状
- `src/cli.js`：约 828 行，check-file 和 check-cmd 命令在策略违规时不 exit(1)
- `src/diagnostic-protocol.js`：熔断器使用全局累计失败率而非滑动窗口
- IMPROVEMENT_REPORT.md 中已记录："策略检查失败 (2个) - 文件/命令访问检查未正确返回错误码"

---

## 边界定义

### 本步骤 ONLY 修改
1. `src/cli.js` —— check-file 和 check-cmd 的 action 函数
2. `src/diagnostic-protocol.js` —— 熔断器阈值和窗口逻辑

### 本步骤 NOT 修改
- AGENTS.md / config.yml（不可动）
- supervisor-agent.js（A1 负责）
- knowledge-base.js（A1 负责）
- policy-checker.js（只改 CLI 调用层，不改核心策略逻辑）

---

## 执行步骤

### 步骤 1：定位 cli.js 中的 check-file 命令

**文件**: `src/cli.js`  
**搜索**: 在文件中搜索 `check-file` 关键词，找到对应的 `.command('check-file')` 区块

**修改方式**: 在 check-file 命令的 action 函数末尾，根据 policy-checker 返回的结果设置退出码：

```javascript
// 在 check-file action 的返回结果处理中，找到打印结果的位置，在之后添加：
if (!result.allowed) {
  process.exitCode = 1;
}
```

**注意**: 使用 `process.exitCode = 1` 而非 `process.exit(1)`，让程序自然结束（commander 可能有清理逻辑）。

---

### 步骤 2：定位 cli.js 中的 check-cmd 命令

**文件**: `src/cli.js`  
**搜索**: 在文件中搜索 `check-cmd` 关键词

**修改方式**: 同 check-file，在结果判断后：

```javascript
if (!result.allowed) {
  process.exitCode = 1;
}
```

---

### 步骤 3：调整 diagnostic-protocol.js 熔断器

**文件**: `src/diagnostic-protocol.js`  
**搜索**: 搜索 `CIRCUIT_BREAKER` 或 `circuitBreaker` 或 `熔断` 关键词

**找到熔断器配置**（类似以下结构）：
```javascript
// 当前值（示意，具体数值看代码）
L1 threshold: 0.3 (或30%)
L2 threshold: 0.5 (或50%)  
L3 threshold: 0.7 (或70%)
```

**改为**:
```javascript
L1 threshold: 0.4   // 宽松 10%
L2 threshold: 0.6   // 宽松 10%
L3 threshold: 0.8   // 宽松 10%
```

**关键增强**: 找到熔断器判断失败率的计算逻辑，将其改为**滑动窗口**模式（仅计算最近 N 次，而非全局累计）：

```javascript
// 在计算失败率的方法中（如 calculateFailRate 或 checkCircuitBreaker）
// 当前逻辑可能是:
//   failRate = totalFailures / totalRuns
// 改为:
const WINDOW_SIZE = 50;
const recentRuns = allRuns.slice(-WINDOW_SIZE);
const recentFailRate = recentRuns.filter(r => !r.success).length / recentRuns.length;
```

如果代码中没有用数组存储历史运行记录，而是用计数器，则改为维护一个固定长度的环形缓冲区：

```javascript
// 在类中添加
this._recentResults = [];
this._windowSize = 50;

// 在记录结果时
recordResult(success) {
  this._recentResults.push(success);
  if (this._recentResults.length > this._windowSize) {
    this._recentResults.shift();
  }
}

getFailRate() {
  if (this._recentResults.length === 0) return 0;
  const failures = this._recentResults.filter(r => !r).length;
  return failures / this._recentResults.length;
}
```

---

## 验证清单

- [ ] 运行 `node src/cli.js check-file .env` → 返回 exit code 1（因为 .env 在 deny 列表）
- [ ] 运行 `node src/cli.js check-file src/index.js` → 返回 exit code 0（在 allow 列表）
- [ ] 运行 `node src/cli.js check-cmd "rm -rf /"` → 返回 exit code 1
- [ ] 运行 `node src/cli.js check-cmd "npm install"` → 返回 exit code 0
- [ ] diagnostic-protocol.js 中熔断器阈值已调整为 0.4/0.6/0.8
- [ ] 熔断器使用滑动窗口（最近50次）而非全局累计
- [ ] `npm test` 全部通过

---

## 可并行信息

| 属性 | 值 |
|------|-----|
| 可并行端 | 任意一端独立执行 |
| 依赖前置 | 无（可与 A1 并行） |
| 被依赖 | A3 可独立，Phase B/C/D/E 均不直接依赖本步骤 |
| 冲突文件 | cli.js（Phase C 也改 cli.js，但位置不同，不冲突）, diagnostic-protocol.js |
| 预计耗时 | 20-40分钟 |
