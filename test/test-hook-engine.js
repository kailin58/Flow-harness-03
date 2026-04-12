'use strict';

const assert = require('assert');
const { HookEngine } = require('../src/hook-engine');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    if (fn.constructor.name === 'AsyncFunction') {
      fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
          .catch(e => { failed++; console.log(`  ✗ ${name}: ${e.message}`); });
    } else {
      fn();
      passed++;
      console.log(`  ✓ ${name}`);
    }
  } catch (err) {
    failed++;
    console.log(`  ✗ ${name}: ${err.message}`);
  }
}

console.log('test-hook-engine.js');

test('should create HookEngine with empty config', () => {
  const engine = new HookEngine();
  assert.ok(engine);
});

test('should run hooks with no lifecycle configured', async () => {
  const engine = new HookEngine({});
  const results = await engine.runHooks('pre_task', {});
  assert.deepStrictEqual(results, []);
});

test('should execute builtin hook successfully', async () => {
  const engine = new HookEngine({
    hooks: {
      lifecycle: {
        pre_task: [
          { id: 'test-hook', type: 'builtin', action: 'write_audit_log', on_fail: 'skip', timeout: 5 }
        ]
      }
    }
  });
  const results = await engine.runHooks('pre_task', { test: true });
  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].status, 'success');
});

test('should block on failing block-hook', async () => {
  const engine = new HookEngine({
    hooks: {
      lifecycle: {
        pre_task: [
          { id: 'blocker', type: 'builtin', action: 'nonexistent_action', on_fail: 'block', timeout: 5 }
        ]
      }
    }
  });
  try {
    await engine.runHooks('pre_task', {});
    assert.fail('Should have thrown');
  } catch (err) {
    assert.ok(err.message.includes('Hook blocked'));
  }
});

test('should skip on condition not met', async () => {
  const engine = new HookEngine({
    hooks: {
      lifecycle: {
        post_task: [
          {
            id: 'conditional',
            type: 'builtin',
            action: 'write_audit_log',
            on_fail: 'skip',
            condition: "task.type in ['feature']",
            timeout: 5
          }
        ]
      }
    }
  });
  const results = await engine.runHooks('post_task', { task: { type: 'bug_fix' } });
  assert.strictEqual(results[0].status, 'skipped');
});

test('should execute when condition met', async () => {
  const engine = new HookEngine({
    hooks: {
      lifecycle: {
        post_task: [
          {
            id: 'conditional',
            type: 'builtin',
            action: 'write_audit_log',
            on_fail: 'skip',
            condition: "task.type in ['feature', 'bug_fix']",
            timeout: 5
          }
        ]
      }
    }
  });
  const results = await engine.runHooks('post_task', { task: { type: 'feature' } });
  assert.strictEqual(results[0].status, 'success');
});

// 等异步测试完成
setTimeout(() => {
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}, 2000);
