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
  // dedup 会保留唯一行并添加折叠信息，检查 x3 标记存在
  assert.ok(result.compressed.includes('x3'));
  // 检查折叠标记
  assert.ok(result.compressed.includes('Folded duplicates'));
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
  // 截断后长度应小于原始长度，并包含截断消息
  assert.ok(result.compressedLength < result.originalLength);
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
