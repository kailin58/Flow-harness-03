const { DocGenerator } = require('../src/doc-generator');
const fs = require('fs');
const path = require('path');
const os = require('os');

async function testDocGenerator() {
  console.log('🧪 测试 DocGenerator...\n');

  let passed = 0;
  let failed = 0;
  const silentLogger = {
    trace(){}, debug(){}, info(){}, warn(){}, error(){}, fatal(){},
    child() { return silentLogger; }
  };

  function assert(condition, msg) {
    if (condition) { passed++; console.log(`  ✅ ${msg}`); }
    else { failed++; console.log(`  ❌ ${msg}`); }
  }

  // 创建临时目录
  const tmpDir = path.join(os.tmpdir(), `fh-docgen-${Date.now()}`);
  const srcDir = path.join(tmpDir, 'src');
  const outDir = path.join(tmpDir, 'docs');
  fs.mkdirSync(srcDir, { recursive: true });

  // 创建测试源文件
  fs.writeFileSync(path.join(srcDir, 'example.js'), `
/**
 * example.js - 示例模块
 *
 * @version 1.0.0
 * @date 2026-04-13
 */

const { Helper } = require('./helper');

class ExampleClass {
  constructor(options = {}) {
    this.name = options.name || 'default';
  }

  /**
   * 执行示例操作
   * @param {string} input - 输入数据
   * @returns {Object} 处理结果
   */
  async execute(input) {
    return { result: input };
  }

  /**
   * 获取状态
   */
  getStatus() {
    return 'ok';
  }

  _privateMethod() {
    return 'hidden';
  }
}

module.exports = {
  ExampleClass
};
`, 'utf8');

  fs.writeFileSync(path.join(srcDir, 'helper.js'), `
/**
 * helper.js - 辅助工具
 */

class Helper {
  help() { return true; }
}

module.exports = { Helper };
`, 'utf8');

  try {
    // ---- Test 1: 基本实例化 ----
    console.log('\nTest 1: 基本实例化');
    const gen = new DocGenerator({ srcDir, outputDir: outDir, logger: silentLogger });
    assert(gen !== null, 'DocGenerator 实例创建成功');
    assert(gen.srcDir === srcDir, 'srcDir 正确');

    // ---- Test 2: generate 完整生成 ----
    console.log('\nTest 2: generate 完整生成');
    const result = gen.generate();
    assert(result.modules.length === 2, `解析到 2 个模块 (实际: ${result.modules.length})`);
    assert(result.outputFiles.length === 3, `生成 3 个文件 (实际: ${result.outputFiles.length})`);
    assert(result.errors.length === 0, '无错误');

    // ---- Test 3: 模块解析 ----
    console.log('\nTest 3: 模块解析');
    const exMod = result.modules.find(m => m.name === 'example');
    assert(exMod !== null, 'example 模块已解析');
    assert(exMod.description.includes('示例模块'), '描述正确');
    assert(exMod.version === '1.0.0', '版本正确');
    assert(exMod.date === '2026-04-13', '日期正确');

    // ---- Test 4: 类解析 ----
    console.log('\nTest 4: 类解析');
    assert(exMod.classes.length === 1, '1 个类');
    const cls = exMod.classes[0];
    assert(cls.name === 'ExampleClass', '类名正确');

    // ---- Test 5: 方法解析 ----
    console.log('\nTest 5: 方法解析');
    const publicMethods = cls.methods.filter(m => !m.isPrivate);
    assert(publicMethods.length >= 2, `至少 2 个公开方法 (实际: ${publicMethods.length})`);
    const execMethod = cls.methods.find(m => m.name === 'execute');
    assert(execMethod !== undefined, 'execute 方法已解析');
    assert(execMethod.isAsync === true, 'execute 标记为 async');
    assert(execMethod.description.includes('执行示例操作'), 'execute 描述正确');

    // ---- Test 6: 私有方法 ----
    console.log('\nTest 6: 私有方法');
    const privateMethods = cls.methods.filter(m => m.isPrivate);
    assert(privateMethods.length >= 1, '至少 1 个私有方法');
    assert(privateMethods.some(m => m.name === '_privateMethod'), '_privateMethod 已检测');

    // ---- Test 7: 依赖解析 ----
    console.log('\nTest 7: 依赖解析');
    assert(exMod.dependencies.includes('helper'), 'example 依赖 helper');

    // ---- Test 8: 导出解析 ----
    console.log('\nTest 8: 导出解析');
    assert(exMod.exports.includes('ExampleClass'), 'ExampleClass 在导出列表');

    // ---- Test 9: 依赖关系分析 ----
    console.log('\nTest 9: 依赖关系分析');
    assert(result.dependencies.forward !== undefined, 'forward 依赖存在');
    assert(result.dependencies.reverse !== undefined, 'reverse 依赖存在');
    assert(result.dependencies.forward['example'].includes('helper'), 'example → helper');
    assert(result.dependencies.reverse['helper'].includes('example'), 'helper ← example');

    // ---- Test 10: API.md 生成 ----
    console.log('\nTest 10: API.md 生成');
    const apiPath = result.outputFiles.find(f => f.endsWith('API.md'));
    assert(apiPath !== undefined, 'API.md 路径存在');
    assert(fs.existsSync(apiPath), 'API.md 文件存在');
    const apiContent = fs.readFileSync(apiPath, 'utf8');
    assert(apiContent.includes('ExampleClass'), 'API.md 包含 ExampleClass');
    assert(apiContent.includes('execute'), 'API.md 包含 execute 方法');

    // ---- Test 11: DEPENDENCIES.md 生成 ----
    console.log('\nTest 11: DEPENDENCIES.md 生成');
    const depPath = result.outputFiles.find(f => f.endsWith('DEPENDENCIES.md'));
    assert(depPath !== undefined, 'DEPENDENCIES.md 路径存在');
    assert(fs.existsSync(depPath), 'DEPENDENCIES.md 文件存在');

    // ---- Test 12: INDEX.md 生成 ----
    console.log('\nTest 12: INDEX.md 生成');
    const indexPath = result.outputFiles.find(f => f.endsWith('INDEX.md'));
    assert(indexPath !== undefined, 'INDEX.md 路径存在');
    assert(fs.existsSync(indexPath), 'INDEX.md 文件存在');
    const indexContent = fs.readFileSync(indexPath, 'utf8');
    assert(indexContent.includes('example'), 'INDEX.md 包含 example');
    assert(indexContent.includes('helper'), 'INDEX.md 包含 helper');

    // ---- Test 13: 对实际项目源码生成 ----
    console.log('\nTest 13: 实际项目源码生成');
    const realOutDir = path.join(tmpDir, 'real-docs');
    const realGen = new DocGenerator({
      srcDir: path.join(process.cwd(), 'src'),
      outputDir: realOutDir,
      logger: silentLogger
    });
    const realResult = realGen.generate();
    assert(realResult.modules.length >= 30, `实际项目至少 30 个模块 (实际: ${realResult.modules.length})`);
    assert(realResult.errors.length === 0, `实际项目无解析错误 (错误: ${realResult.errors.length})`);
    assert(realResult.outputFiles.length === 3, '生成 3 个文档文件');

  } catch (error) {
    console.log(`\n❌ 测试异常: ${error.message}`);
    console.log(error.stack);
    failed++;
  }

  // 清理
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}

  console.log(`\n========================================`);
  console.log(`测试结果: ${passed} 通过, ${failed} 失败`);
  if (failed === 0) {
    console.log('✅ 所有 DocGenerator 测试通过！');
  } else {
    console.log('❌ 有测试失败');
    process.exitCode = 1;
  }
}

testDocGenerator();
