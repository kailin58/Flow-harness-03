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
