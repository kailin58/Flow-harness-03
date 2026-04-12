const { ProjectOnboarding, TECH_STACKS, PROJECT_TYPES, ONBOARDING_STEPS } = require('../src/project-onboarding');
const fs = require('fs');
const path = require('path');
const os = require('os');

async function testProjectOnboarding() {
  console.log('🧪 测试 ProjectOnboarding...\n');

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

  // 创建临时测试目录
  const testDir = path.join(os.tmpdir(), `flowharness-test-${Date.now()}`);
  fs.mkdirSync(testDir, { recursive: true });

  // 在临时目录中创建一个模拟 Node.js 项目
  const mockPkg = {
    name: 'test-project',
    version: '1.0.0',
    bin: { 'test-cli': './src/cli.js' },
    dependencies: { express: '^4.0.0' },
    devDependencies: { jest: '^29.0.0' }
  };
  fs.writeFileSync(path.join(testDir, 'package.json'), JSON.stringify(mockPkg, null, 2));
  fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(testDir, 'test'), { recursive: true });
  fs.writeFileSync(path.join(testDir, 'src', 'index.js'), '// main');
  fs.writeFileSync(path.join(testDir, '.gitignore'), 'node_modules/\n');

  try {
    // ---- Test 1: 常量导出 ----
    console.log('\nTest 1: 常量导出');
    assert(typeof TECH_STACKS === 'object', 'TECH_STACKS 已导出');
    assert(TECH_STACKS.NODE.name === 'Node.js', 'Node.js 技术栈');
    assert(typeof PROJECT_TYPES === 'object', 'PROJECT_TYPES 已导出');
    assert(PROJECT_TYPES.WEB_APP === 'web_app', 'WEB_APP 项目类型');
    assert(typeof ONBOARDING_STEPS === 'object', 'ONBOARDING_STEPS 已导出');
    assert(ONBOARDING_STEPS.DETECT === 'detect', 'DETECT 步骤');

    // ---- Test 2: 基本实例化 ----
    console.log('\nTest 2: 基本实例化');
    const ob = new ProjectOnboarding({ projectRoot: testDir, logger: silentLogger });
    assert(ob !== null, 'ProjectOnboarding 实例创建成功');
    assert(ob.projectRoot === testDir, 'projectRoot 正确');

    // ---- Test 3: Step 1 — 检测 ----
    console.log('\nTest 3: Step 1 检测');
    const detection = await ob.step1_detect();
    assert(detection !== null, 'detection 返回非空');
    assert(detection.techStacks.length > 0, '检测到技术栈');
    assert(detection.techStacks.some(s => s.name === 'Node.js'), '检测到 Node.js');
    // 有 bin 字段应检测为 CLI_TOOL
    assert(detection.projectType === PROJECT_TYPES.CLI_TOOL, `项目类型为 CLI_TOOL (实际: ${detection.projectType})`);
    assert(detection.structure.hasSrc === true, '检测到 src 目录');
    assert(detection.structure.hasTest === true, '检测到 test 目录');
    assert(detection.existingConfig === false, '无已有配置');

    // ---- Test 4: Step 2 — 配置 ----
    console.log('\nTest 4: Step 2 配置');
    const config = await ob.step2_configure(detection);
    assert(config.configPath !== undefined, 'configPath 存在');
    assert(fs.existsSync(config.configPath), 'config.yml 文件已创建');
    assert(fs.existsSync(config.knowledgeDir), 'knowledge 目录已创建');
    assert(fs.existsSync(config.memoryPath), 'MEMORY.md 已创建');

    // 验证配置内容
    const configContent = fs.readFileSync(config.configPath, 'utf8');
    assert(configContent.includes('flowharness-test') || configContent.includes('test-project'), '配置包含项目名');
    assert(configContent.includes('javascript'), '配置包含语言');

    // ---- Test 5: Step 3 — 安全 ----
    console.log('\nTest 5: Step 3 安全');
    const security = await ob.step3_secure(detection);
    assert(security.securityConfig.defaultDeny === true, 'defaultDeny 为 true');
    assert(security.securityConfig.roles.includes('developer'), '包含 developer 角色');
    assert(security.securityConfig.roles.includes('admin'), '包含 admin 角色');
    assert(fs.existsSync(security.securityPath), 'security.json 已创建');

    // 检查 .gitignore 是否更新
    const gitignore = fs.readFileSync(path.join(testDir, '.gitignore'), 'utf8');
    assert(gitignore.includes('.flowharness/knowledge'), '.gitignore 已更新');

    // ---- Test 6: Step 4 — 验证 ----
    console.log('\nTest 6: Step 4 验证');
    const validation = await ob.step4_validate();
    assert(validation.allPassed === true, '所有检查通过');
    assert(validation.checks.length >= 5, `至少 5 项检查 (实际: ${validation.checks.length})`);
    assert(validation.passed === validation.total, `全部通过: ${validation.passed}/${validation.total}`);

    // ---- Test 7: Step 5 — 启动 ----
    console.log('\nTest 7: Step 5 启动');
    const activation = await ob.step5_activate();
    assert(activation.activated === true, '激活成功');
    assert(fs.existsSync(activation.snapshotPath), 'snapshot.json 已创建');

    // 验证快照内容
    const snapshot = JSON.parse(fs.readFileSync(activation.snapshotPath, 'utf8'));
    assert(snapshot.status === 'active', '快照状态为 active');
    assert(snapshot.version === '1.0', '快照版本正确');

    // 验证知识库初始文件
    const patternsPath = path.join(testDir, '.flowharness', 'knowledge', 'patterns.json');
    assert(fs.existsSync(patternsPath), 'patterns.json 已创建');
    const patterns = JSON.parse(fs.readFileSync(patternsPath, 'utf8'));
    assert(patterns.version === '1.0', 'patterns.json 版本正确');

    // ---- Test 8: getSummary ----
    console.log('\nTest 8: getSummary');
    const summary = ob.getSummary();
    assert(summary.projectRoot === testDir, 'summary.projectRoot 正确');
    assert(summary.allComplete === true, '所有步骤完成');
    assert(summary.steps.length === 5, '5 个步骤');

    // ---- Test 9: 完整 onboard 流程 (新目录) ----
    console.log('\nTest 9: 完整 onboard 流程');
    const testDir2 = path.join(os.tmpdir(), `flowharness-test2-${Date.now()}`);
    fs.mkdirSync(testDir2, { recursive: true });
    fs.writeFileSync(path.join(testDir2, 'requirements.txt'), 'flask==2.0\n');
    fs.mkdirSync(path.join(testDir2, 'src'), { recursive: true });

    const ob2 = new ProjectOnboarding({ projectRoot: testDir2, logger: silentLogger });
    const result = await ob2.onboard();
    assert(result.success === true, 'onboard 成功');
    assert(result.steps.detect !== undefined, '包含 detect 步骤');
    assert(result.steps.activate !== undefined, '包含 activate 步骤');
    // 应检测到 Python
    assert(result.steps.detect.techStacks.some(s => s.name === 'Python'), '检测到 Python');

    // 清理 testDir2
    fs.rmSync(testDir2, { recursive: true, force: true });

    // ---- Test 10: 重复检测已有配置 ----
    console.log('\nTest 10: 重复检测已有配置');
    const ob3 = new ProjectOnboarding({ projectRoot: testDir, logger: silentLogger });
    const detection2 = await ob3.step1_detect();
    assert(detection2.existingConfig === true, '检测到已有配置');

    // ---- Test 11: 空项目检测 ----
    console.log('\nTest 11: 空项目检测');
    const emptyDir = path.join(os.tmpdir(), `flowharness-empty-${Date.now()}`);
    fs.mkdirSync(emptyDir, { recursive: true });
    const ob4 = new ProjectOnboarding({ projectRoot: emptyDir, logger: silentLogger });
    const emptyDetection = await ob4.step1_detect();
    assert(emptyDetection.techStacks.length === 0, '空项目无技术栈');
    assert(emptyDetection.projectType === PROJECT_TYPES.UNKNOWN, '空项目类型为 UNKNOWN');

    // 清理 emptyDir
    fs.rmSync(emptyDir, { recursive: true, force: true });

  } catch (error) {
    console.log(`\n❌ 测试异常: ${error.message}`);
    console.log(error.stack);
    failed++;
  }

  // 清理临时目录
  try {
    fs.rmSync(testDir, { recursive: true, force: true });
  } catch (e) { /* ignore */ }

  console.log(`\n========================================`);
  console.log(`测试结果: ${passed} 通过, ${failed} 失败`);
  if (failed === 0) {
    console.log('✅ 所有 ProjectOnboarding 测试通过！');
  } else {
    console.log('❌ 有测试失败');
    process.exitCode = 1;
  }
}

testProjectOnboarding();
