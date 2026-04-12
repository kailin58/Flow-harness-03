const ConfigLoader = require('../src/config-loader');
const fs = require('fs');
const path = require('path');
const os = require('os');

function testConfigLoader() {
  console.log('🧪 测试 ConfigLoader...\n');

  let passed = 0;
  let failed = 0;

  const tmpDir = path.join(os.tmpdir(), `cl_test_${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  function assert(condition, msg) {
    if (condition) { passed++; console.log(`  ✅ ${msg}`); }
    else { failed++; console.log(`  ❌ ${msg}`); }
  }

  function cleanup() {
    try {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch (e) {}
  }

  // 写入测试配置文件
  function writeConfig(filename, content) {
    const filePath = path.join(tmpDir, filename);
    fs.writeFileSync(filePath, content, 'utf8');
    return filePath;
  }

  try {
    // ---- Test 1: 基本实例化 ----
    console.log('\nTest 1: 基本实例化');
    const loader = new ConfigLoader('some/path.yml');
    assert(loader !== null, 'ConfigLoader 创建成功');
    assert(loader.configPath === 'some/path.yml', '配置路径正确');
    assert(loader.config === null, '初始 config 为 null');

    // ---- Test 2: 默认路径 ----
    console.log('\nTest 2: 默认路径');
    const defaultLoader = new ConfigLoader();
    assert(defaultLoader.configPath === '.flowharness/config.yml', '默认路径正确');

    // ---- Test 3: 加载有效配置 ----
    console.log('\nTest 3: 加载有效配置');
    const validYaml = `
version: "1.0"
workflows:
  - name: build
    steps:
      - name: compile
        command: npm run build
  - name: test
    steps:
      - name: unit
        command: npm test
policies:
  file_access:
    deny:
      - "**/.env"
  commands:
    deny:
      - "rm -rf"
learning:
  enabled: true
  auto_optimize: false
observability:
  logging:
    enabled: true
    level: info
hooks:
  pre_build: echo "building"
`;
    const configPath = writeConfig('config.yml', validYaml);
    // ConfigLoader 使用 path.resolve(process.cwd(), configPath)
    // 所以我们需要用绝对路径
    const validLoader = new ConfigLoader(configPath);
    // 由于 load() 内部用 path.resolve(cwd, configPath)，绝对路径会保持不变
    const config = validLoader.load();
    assert(config !== null, '加载成功');
    assert(config.version === '1.0', '版本正确');
    assert(Array.isArray(config.workflows), '有 workflows 数组');
    assert(config.workflows.length === 2, '2 个工作流');
    assert(typeof config.policies === 'object', '有 policies');

    // ---- Test 4: getWorkflow ----
    console.log('\nTest 4: getWorkflow');
    const buildWf = validLoader.getWorkflow('build');
    assert(buildWf !== undefined, '找到 build 工作流');
    assert(buildWf.name === 'build', '名称正确');
    assert(buildWf.steps.length === 1, '1 个步骤');

    const testWf = validLoader.getWorkflow('test');
    assert(testWf !== undefined, '找到 test 工作流');

    const noWf = validLoader.getWorkflow('nonexistent');
    assert(noWf === undefined, '不存在返回 undefined');

    // ---- Test 5: getPolicies ----
    console.log('\nTest 5: getPolicies');
    const policies = validLoader.getPolicies();
    assert(typeof policies === 'object', '返回对象');
    assert(policies.file_access !== undefined, '有 file_access');
    assert(policies.commands !== undefined, '有 commands');

    // ---- Test 6: getLearningConfig ----
    console.log('\nTest 6: getLearningConfig');
    const learning = validLoader.getLearningConfig();
    assert(learning.enabled === true, 'learning 已启用');
    assert(learning.auto_optimize === false, 'auto_optimize 关闭');

    // ---- Test 7: getObservabilityConfig ----
    console.log('\nTest 7: getObservabilityConfig');
    const obs = validLoader.getObservabilityConfig();
    assert(obs.logging.enabled === true, 'logging 已启用');
    assert(obs.logging.level === 'info', 'level 为 info');

    // ---- Test 8: getHooks ----
    console.log('\nTest 8: getHooks');
    const hooks = validLoader.getHooks();
    assert(typeof hooks === 'object', '返回对象');
    assert(hooks.pre_build === 'echo "building"', 'pre_build 正确');

    // ---- Test 9: 文件不存在 ----
    console.log('\nTest 9: 文件不存在');
    const missingLoader = new ConfigLoader(path.join(tmpDir, 'nonexistent.yml'));
    let threw = false;
    try {
      missingLoader.load();
    } catch (e) {
      threw = true;
      assert(e.message.includes('Failed to load config'), '错误信息正确');
    }
    assert(threw, '文件不存在抛出异常');

    // ---- Test 10: 缺少 version ----
    console.log('\nTest 10: 缺少 version');
    const noVersionYaml = `
workflows:
  - name: build
policies: {}
`;
    const noVersionPath = writeConfig('no-version.yml', noVersionYaml);
    const noVersionLoader = new ConfigLoader(noVersionPath);
    threw = false;
    try {
      noVersionLoader.load();
    } catch (e) {
      threw = true;
      assert(e.message.includes('version'), '错误提到 version');
    }
    assert(threw, '缺少 version 抛出异常');

    // ---- Test 11: 缺少 workflows ----
    console.log('\nTest 11: 缺少 workflows');
    const noWfYaml = `
version: "1.0"
policies: {}
`;
    const noWfPath = writeConfig('no-workflows.yml', noWfYaml);
    const noWfLoader = new ConfigLoader(noWfPath);
    threw = false;
    try {
      noWfLoader.load();
    } catch (e) {
      threw = true;
      assert(e.message.includes('workflows'), '错误提到 workflows');
    }
    assert(threw, '缺少 workflows 抛出异常');

    // ---- Test 12: 缺少 policies ----
    console.log('\nTest 12: 缺少 policies');
    const noPolicyYaml = `
version: "1.0"
workflows:
  - name: build
`;
    const noPolicyPath = writeConfig('no-policies.yml', noPolicyYaml);
    const noPolicyLoader = new ConfigLoader(noPolicyPath);
    threw = false;
    try {
      noPolicyLoader.load();
    } catch (e) {
      threw = true;
      assert(e.message.includes('policies'), '错误提到 policies');
    }
    assert(threw, '缺少 policies 抛出异常');

    // ---- Test 13: 无 learning 配置时的默认值 ----
    console.log('\nTest 13: 无 learning 配置默认值');
    const minimalYaml = `
version: "1.0"
workflows:
  - name: build
policies: {}
`;
    const minimalPath = writeConfig('minimal.yml', minimalYaml);
    const minimalLoader = new ConfigLoader(minimalPath);
    minimalLoader.load();
    const defLearning = minimalLoader.getLearningConfig();
    assert(defLearning.enabled === false, '默认 learning 禁用');

    const defObs = minimalLoader.getObservabilityConfig();
    assert(defObs.logging.enabled === false, '默认 logging 禁用');

    const defHooks = minimalLoader.getHooks();
    assert(typeof defHooks === 'object', '默认 hooks 是对象');
    assert(Object.keys(defHooks).length === 0, '默认 hooks 为空');

    // ---- Test 14: workflows 不是数组 ----
    console.log('\nTest 14: workflows 不是数组');
    const badWfYaml = `
version: "1.0"
workflows: "not an array"
policies: {}
`;
    const badWfPath = writeConfig('bad-workflows.yml', badWfYaml);
    const badWfLoader = new ConfigLoader(badWfPath);
    threw = false;
    try {
      badWfLoader.load();
    } catch (e) {
      threw = true;
      assert(e.message.includes('workflows'), '错误提到 workflows');
    }
    assert(threw, 'workflows 非数组抛出异常');

  } catch (error) {
    console.log(`\n❌ 测试异常: ${error.message}`);
    console.log(error.stack);
    failed++;
  } finally {
    cleanup();
  }

  console.log(`\n========================================`);
  console.log(`测试结果: ${passed} 通过, ${failed} 失败`);
  if (failed === 0) {
    console.log('✅ 所有 ConfigLoader 测试通过！');
  } else {
    console.log('❌ 有测试失败');
    process.exitCode = 1;
  }
}

testConfigLoader();
