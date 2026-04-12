const assert = require('assert');
const fs = require('fs');
const path = require('path');
const KnowledgeBase = require('../src/knowledge-base');

// 测试 1: 方法存在
async function test_methods_exist() {
  const kb = new KnowledgeBase();
  kb.load();

  assert(typeof kb.writeSpec === 'function', 'writeSpec 应存在');
  assert(typeof kb.readSpec === 'function', 'readSpec 应存在');
  assert(typeof kb.listSpecs === 'function', 'listSpecs 应存在');
  assert(typeof kb.deleteSpec === 'function', 'deleteSpec 应存在');
  assert(typeof kb.calculateReusability === 'function', 'calculateReusability 应存在');
  assert(typeof kb.exportSpecs === 'function', 'exportSpecs 应存在');

  console.log('✓ test_methods_exist');
}

// 测试 2: 写入 Spec
async function test_write_spec() {
  const kb = new KnowledgeBase('.flowharness/knowledge');
  kb.load();

  const result = kb.writeSpec('test-spec', {
    inputs: { url: 'string' },
    outputs: { html: 'string' },
    dependencies: ['axios'],
    examples: [{ input: { url: 'http://example.com' }, output: { html: '<html>...' } }],
    acceptanceCriteria: ['返回有效的 HTML']
  });

  assert(result.path, '应返回路径');
  assert(result.name === 'test-spec', '名称应匹配');
  assert(typeof result.reusability === 'number', '应有可复用性评分');

  // 清理
  kb.deleteSpec('test-spec');
  console.log('✓ test_write_spec');
}

// 测试 3: 读取 Spec
async function test_read_spec() {
  const kb = new KnowledgeBase('.flowharness/knowledge');

  // 先写入
  kb.writeSpec('test-read', { inputs: { a: 'string' } });

  // 再读取
  const spec = kb.readSpec('test-read');
  assert(spec !== null, '应能读取');
  assert(spec.name === 'test-read', '名称应匹配');
  assert(spec.spec.inputs.a === 'string', '内容应正确');

  // 清理
  kb.deleteSpec('test-read');
  console.log('✓ test_read_spec');
}

// 测试 4: 列出 Specs
async function test_list_specs() {
  const kb = new KnowledgeBase('.flowharness/knowledge');

  // 写入多个
  kb.writeSpec('spec-1', { inputs: {} });
  kb.writeSpec('spec-2', { inputs: {}, outputs: {} });

  const list = kb.listSpecs();
  assert(Array.isArray(list), '应返回数组');
  assert(list.length >= 2, '应至少有 2 个 spec');

  // 清理
  kb.deleteSpec('spec-1');
  kb.deleteSpec('spec-2');
  console.log('✓ test_list_specs');
}

// 测试 5: 可复用性计算
async function test_reusability() {
  const kb = new KnowledgeBase();

  // 完整 spec
  const fullSpec = {
    inputs: { a: 'string' },
    outputs: { b: 'string' },
    dependencies: ['lodash'],
    examples: [{ input: { a: 'x' }, output: { b: 'y' } }],
    acceptanceCriteria: ['正确转换']
  };
  const fullScore = kb.calculateReusability(fullSpec);
  assert(fullScore === 1.0, `完整 spec 应得 1.0 分，实际: ${fullScore}`);

  // 空 spec
  const emptyScore = kb.calculateReusability({});
  assert(emptyScore === 0, '空 spec 应得 0 分');

  // 部分 spec
  const partialScore = kb.calculateReusability({ inputs: { a: 'string' } });
  assert(partialScore === 0.15, `仅有 inputs 应得 0.15 分，实际: ${partialScore}`);

  console.log('✓ test_reusability');
}

// 测试 6: 向后兼容
async function test_backward_compatibility() {
  const kb = new KnowledgeBase('.flowharness/knowledge');

  // 验证原有方法仍然可用
  assert(typeof kb.load === 'function', 'load 应可用');
  assert(typeof kb.save === 'function', 'save 应可用');
  assert(typeof kb.recordExecution === 'function', 'recordExecution 应可用');
  assert(typeof kb.exportData === 'function', 'exportData 应可用');
  assert(typeof kb.mergeData === 'function', 'mergeData 应可用');
  assert(typeof kb.getOptimizations === 'function', 'getOptimizations 应可用');

  console.log('✓ test_backward_compatibility');
}

// 测试 7: exportSpecs 功能
async function test_export_specs() {
  const kb = new KnowledgeBase('.flowharness/knowledge');

  // 写入不同质量的 specs
  kb.writeSpec('high-quality', {
    inputs: { a: 'string' },
    outputs: { b: 'string' },
    dependencies: ['lib'],
    examples: [{ input: {}, output: {} }],
    acceptanceCriteria: ['标准']
  }); // reusability = 1.0

  kb.writeSpec('low-quality', { inputs: {} }); // reusability = 0.15

  // 导出，最低可复用性 0.5
  const exported = kb.exportSpecs({ minReusability: 0.5 });
  assert(Array.isArray(exported), '应返回数组');
  assert(exported.length === 1, '应只有 1 个高质量 spec');
  assert(exported[0].name === 'high-quality', '应是高质量 spec');

  // 清理
  kb.deleteSpec('high-quality');
  kb.deleteSpec('low-quality');
  console.log('✓ test_export_specs');
}

// 运行所有测试
async function runTests() {
  await test_methods_exist();
  await test_write_spec();
  await test_read_spec();
  await test_list_specs();
  await test_reusability();
  await test_backward_compatibility();
  await test_export_specs();
  console.log('\n✅ KnowledgeBase Spec 扩展测试通过 (7/7)');
}

runTests().catch(console.error);
