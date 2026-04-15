# Step E1：FileOperator 安全封装 + 双模式执行切换

> **复制本文件给任意 Agent 端（Cursor / Claude Code / Codex）即可独立执行**  
> **需等待 Phase A + Phase B 完成**（依赖稳定的基础和技能系统）

---

## 上下文

当前 `src/agent-executor.js` 中4个总监的执行是模拟（mock）数据。本步骤实现：
1. **FileOperator**: 统一的文件操作封装层，强制经过 policy-checker
2. **双模式切换**: simulate（测试用）和 real（生产用），通过环境变量或 CLI flag 切换

### 关键约束
- `NODE_ENV=test` 或 `--simulate` 时使用模拟模式（现有测试不退化）
- 默认使用真实模式（但本步骤仅建立框架，E2/E3 填充具体 Agent 逻辑）
- 所有文件操作必须经过 `policy-checker.js` 的白黑名单检查

### agent-executor.js 现状
- 第 29-162 行：构造函数（已有 sandboxManager、executionMonitor、各种组件）
- 第 171-184 行：`execute()` 入口方法
- 第 312-332 行：Agent 分派 switch
- 第 484-628 行：`executeExploreAgent()` —— 已有真实的 action 处理
- 第 633-703 行：`executePlanAgent()`
- 第 708-868 行：`executeGeneralAgent()`
- 第 873-915 行：`executeInspectorAgent()`

---

## 边界定义

### 本步骤 ONLY 创建/修改
1. `src/file-operator.js` —— 全新文件
2. `src/agent-executor.js` —— 新增构造函数中的 mode 判断 + FileOperator 初始化
3. `test/test-file-operator.js` —— 全新测试文件

### 本步骤 NOT 修改
- supervisor-agent.js（B3/C1 已完成修改）
- 4个 Agent 的 execute 方法内部逻辑（E2/E3 负责）
- AGENTS.md / config.yml
- policy-checker.js 核心逻辑

---

## 执行步骤

### 步骤 1：创建 src/file-operator.js

**文件**: `src/file-operator.js`（全新文件）

```javascript
'use strict';

const fs = require('fs');
const path = require('path');
const { createLogger } = require('./logger');

class FileOperator {
  constructor(options = {}) {
    this.logger = createLogger({ name: 'file-operator' });
    this.policyChecker = options.policyChecker || null;
    this.rootDir = options.rootDir || process.cwd();
    this.auditLog = [];
  }

  async read(filePath) {
    const resolvedPath = this._resolve(filePath);

    if (this.policyChecker) {
      const check = this.policyChecker.checkFileAccess
        ? this.policyChecker.checkFileAccess(resolvedPath)
        : this.policyChecker.checkFile?.(resolvedPath, 'read')
          || { allowed: true };

      if (check && !check.allowed) {
        this._audit('read', resolvedPath, false, check.reason || 'policy denied');
        throw new Error(`Policy denied read: ${filePath}`);
      }
    }

    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const content = fs.readFileSync(resolvedPath, 'utf8');
    this._audit('read', resolvedPath, true);
    return content;
  }

  async write(filePath, content) {
    const resolvedPath = this._resolve(filePath);

    if (this.policyChecker) {
      const check = this.policyChecker.checkFileAccess
        ? this.policyChecker.checkFileAccess(resolvedPath)
        : this.policyChecker.checkFile?.(resolvedPath, 'write')
          || { allowed: true };

      if (check && !check.allowed) {
        this._audit('write', resolvedPath, false, check.reason || 'policy denied');
        throw new Error(`Policy denied write: ${filePath}`);
      }
    }

    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(resolvedPath, content, 'utf8');
    this._audit('write', resolvedPath, true);
    return { written: resolvedPath, size: content.length };
  }

  async search(pattern, options = {}) {
    const baseDir = options.baseDir || this.rootDir;
    const ignore = options.ignore || ['node_modules/**', '.flowharness/knowledge/**', 'dist/**'];

    try {
      const { glob } = require('glob');
      const results = await glob(pattern, { cwd: baseDir, ignore });
      return results.map(f => path.join(baseDir, f));
    } catch {
      return [];
    }
  }

  async exists(filePath) {
    return fs.existsSync(this._resolve(filePath));
  }

  getAuditLog() {
    return [...this.auditLog];
  }

  _resolve(filePath) {
    if (path.isAbsolute(filePath)) return filePath;
    return path.join(this.rootDir, filePath);
  }

  _audit(operation, filePath, success, reason) {
    this.auditLog.push({
      timestamp: new Date().toISOString(),
      operation,
      path: filePath,
      success,
      reason: reason || null
    });

    if (this.auditLog.length > 500) {
      this.auditLog = this.auditLog.slice(-500);
    }
  }
}

module.exports = { FileOperator };
```

---

### 步骤 2：在 agent-executor.js 中新增执行模式

**文件**: `src/agent-executor.js`  
**位置**: 构造函数中（约第 29-162 行）

**2a. 在 require 区域添加**:
```javascript
const { FileOperator } = require('./file-operator');
```

**2b. 在构造函数末尾（`this.enableCrossPlatform` 逻辑之后）添加**:

```javascript
    // 执行模式: simulate（测试）或 real（生产）
    this.mode = config.mode || (process.env.NODE_ENV === 'test' ? 'simulate' : 'real');

    // 初始化 FileOperator（真实模式下使用）
    this.fileOperator = new FileOperator({
      rootDir: this.workingDir,
      policyChecker: config.policyChecker || null
    });
```

**2c. 在类中新增模式判断辅助方法**（在 `execute()` 方法之前）:

```javascript
  isSimulateMode() {
    return this.mode === 'simulate';
  }

  setMode(mode) {
    if (mode !== 'simulate' && mode !== 'real') {
      throw new Error(`Invalid mode: ${mode}. Must be 'simulate' or 'real'`);
    }
    this.mode = mode;
  }
```

---

### 步骤 3：创建测试文件

**文件**: `test/test-file-operator.js`

```javascript
'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { FileOperator } = require('../src/file-operator');

let passed = 0;
let failed = 0;

function test(name, fn) {
  const result = fn();
  if (result && typeof result.then === 'function') {
    result
      .then(() => { passed++; console.log(`  ✓ ${name}`); })
      .catch(e => { failed++; console.log(`  ✗ ${name}: ${e.message}`); });
  } else {
    passed++;
    console.log(`  ✓ ${name}`);
  }
}

console.log('test-file-operator.js');

const tmpDir = path.join(os.tmpdir(), 'fh-test-' + Date.now());
fs.mkdirSync(tmpDir, { recursive: true });
fs.writeFileSync(path.join(tmpDir, 'test.txt'), 'hello world');

test('should create FileOperator', () => {
  const op = new FileOperator({ rootDir: tmpDir });
  assert.ok(op);
});

test('should read existing file', async () => {
  const op = new FileOperator({ rootDir: tmpDir });
  const content = await op.read('test.txt');
  assert.strictEqual(content, 'hello world');
});

test('should throw on read nonexistent file', async () => {
  const op = new FileOperator({ rootDir: tmpDir });
  try {
    await op.read('nonexistent.txt');
    assert.fail('Should have thrown');
  } catch (e) {
    assert.ok(e.message.includes('not found'));
  }
});

test('should write file', async () => {
  const op = new FileOperator({ rootDir: tmpDir });
  await op.write('output.txt', 'written content');
  const written = fs.readFileSync(path.join(tmpDir, 'output.txt'), 'utf8');
  assert.strictEqual(written, 'written content');
});

test('should block read when policy denies', async () => {
  const mockPolicy = {
    checkFileAccess: () => ({ allowed: false, reason: 'test deny' })
  };
  const op = new FileOperator({ rootDir: tmpDir, policyChecker: mockPolicy });
  try {
    await op.read('test.txt');
    assert.fail('Should have thrown');
  } catch (e) {
    assert.ok(e.message.includes('Policy denied'));
  }
});

test('should block write when policy denies', async () => {
  const mockPolicy = {
    checkFileAccess: () => ({ allowed: false, reason: 'test deny' })
  };
  const op = new FileOperator({ rootDir: tmpDir, policyChecker: mockPolicy });
  try {
    await op.write('blocked.txt', 'data');
    assert.fail('Should have thrown');
  } catch (e) {
    assert.ok(e.message.includes('Policy denied'));
  }
});

test('should check file existence', async () => {
  const op = new FileOperator({ rootDir: tmpDir });
  assert.strictEqual(await op.exists('test.txt'), true);
  assert.strictEqual(await op.exists('nope.txt'), false);
});

test('should maintain audit log', async () => {
  const op = new FileOperator({ rootDir: tmpDir });
  await op.read('test.txt');
  await op.write('audit-test.txt', 'data');
  const log = op.getAuditLog();
  assert.strictEqual(log.length, 2);
  assert.strictEqual(log[0].operation, 'read');
  assert.strictEqual(log[1].operation, 'write');
});

// 清理
setTimeout(() => {
  try { fs.rmSync(tmpDir, { recursive: true }); } catch {}
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}, 2000);
```

---

## 验证清单

- [ ] `src/file-operator.js` 已创建，可正常 require
- [ ] `src/agent-executor.js` 构造函数中有 `this.mode` 和 `this.fileOperator`
- [ ] `NODE_ENV=test` 时 mode 自动为 'simulate'
- [ ] 非 test 环境 mode 默认为 'real'
- [ ] FileOperator 的 read/write 在 policyChecker deny 时抛错
- [ ] `node test/test-file-operator.js` 全部通过（8个断言）
- [ ] `npm test` 全部通过（现有测试运行在 test 模式，不受影响）

---

## 可并行信息

| 属性 | 值 |
|------|-----|
| 可并行端 | 可与 D1 并行 |
| 依赖前置 | Phase A 完成（稳定基础）|
| 被依赖 | E2（真实Agent逻辑需要 FileOperator）|
| 冲突文件 | agent-executor.js（构造函数末尾，冲突概率低） |
| 预计耗时 | 40-60分钟 |
