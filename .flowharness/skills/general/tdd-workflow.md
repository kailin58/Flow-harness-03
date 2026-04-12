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

## 激活条件

当任务要求先写测试、补测试或按测试驱动方式开发时激活。

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

## 输出格式

测试文件格式（匹配项目现有风格）：

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
