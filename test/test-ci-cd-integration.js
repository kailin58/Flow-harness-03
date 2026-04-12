const { CICDIntegration, PIPELINE_TYPE, ENVIRONMENT, CHECK_TYPE } = require('../src/ci-cd-integration');
const fs = require('fs');
const path = require('path');
const os = require('os');

async function testCICDIntegration() {
  console.log('🧪 测试 CICDIntegration...\n');

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

  const tmpDir = path.join(os.tmpdir(), `fh-cicd-${Date.now()}`);
  const outDir = path.join(tmpDir, '.github', 'workflows');

  try {
    // ---- Test 1: 常量导出 ----
    console.log('\nTest 1: 常量导出');
    assert(typeof PIPELINE_TYPE === 'object', 'PIPELINE_TYPE 已导出');
    assert(PIPELINE_TYPE.CI === 'ci', 'CI 类型');
    assert(PIPELINE_TYPE.CD === 'cd', 'CD 类型');
    assert(PIPELINE_TYPE.FULL === 'full', 'FULL 类型');
    assert(typeof ENVIRONMENT === 'object', 'ENVIRONMENT 已导出');
    assert(ENVIRONMENT.DEV === 'dev', 'DEV 环境');
    assert(ENVIRONMENT.PRODUCTION === 'production', 'PRODUCTION 环境');
    assert(typeof CHECK_TYPE === 'object', 'CHECK_TYPE 已导出');

    // ---- Test 2: 基本实例化 ----
    console.log('\nTest 2: 基本实例化');
    const ci = new CICDIntegration({
      projectDir: tmpDir,
      outputDir: outDir,
      logger: silentLogger
    });
    assert(ci !== null, 'CICDIntegration 创建成功');
    assert(ci.platform === 'github', '默认平台为 github');

    // ---- Test 3: 默认环境 ----
    console.log('\nTest 3: 默认环境');
    const devEnv = ci.getEnvironment(ENVIRONMENT.DEV);
    assert(devEnv !== null, 'DEV 环境已创建');
    assert(devEnv.branch === 'develop', 'DEV 分支为 develop');
    const prodEnv = ci.getEnvironment(ENVIRONMENT.PRODUCTION);
    assert(prodEnv !== null, 'PRODUCTION 环境已创建');
    assert(prodEnv.requiresApproval === true, 'PRODUCTION 需要审批');

    // ---- Test 4: 配置环境 ----
    console.log('\nTest 4: 配置环境');
    ci.configureEnvironment(ENVIRONMENT.STAGING, {
      branch: 'release/*',
      variables: { NODE_ENV: 'staging', API_URL: 'https://staging.example.com' }
    });
    const staging = ci.getEnvironment(ENVIRONMENT.STAGING);
    assert(staging.branch === 'release/*', 'staging 分支已更新');
    assert(staging.variables.API_URL === 'https://staging.example.com', 'staging 变量已设置');

    // ---- Test 5: 添加质量门禁 ----
    console.log('\nTest 5: 质量门禁');
    ci.addQualityGate({ name: 'Lint', type: CHECK_TYPE.LINT, command: 'npm run lint', required: true });
    ci.addQualityGate({ name: 'Coverage', type: CHECK_TYPE.COVERAGE, command: 'npm run coverage', threshold: 80 });
    ci.addQualityGate({ name: 'Security', type: CHECK_TYPE.SECURITY, command: 'npm audit', required: false });
    assert(ci.qualityGates.length === 3, '3 个质量门禁');

    // ---- Test 6: 添加自定义步骤 ----
    console.log('\nTest 6: 自定义步骤');
    ci.addCustomStep({ name: 'Generate docs', run: 'npm run docs', after: 'test' });
    ci.addCustomStep({ name: 'Upload artifacts', run: 'echo upload', condition: "success()" });
    assert(ci.customSteps.length === 2, '2 个自定义步骤');

    // ---- Test 7: 生成 CI 工作流 ----
    console.log('\nTest 7: CI 工作流生成');
    const ciResult = ci.generateCI({ nodeVersion: '20' });
    assert(typeof ciResult.content === 'string', 'CI content 是字符串');
    assert(ciResult.path.endsWith('ci.yml'), '路径以 ci.yml 结尾');
    assert(ciResult.content.includes('name: CI'), '包含 name: CI');
    assert(ciResult.content.includes('actions/checkout@v4'), '包含 checkout action');
    assert(ciResult.content.includes('node-version: 20'), '包含 Node.js 20');
    assert(ciResult.content.includes('npm test'), '包含 npm test');
    assert(ciResult.content.includes('Generate docs'), '包含自定义步骤');
    assert(ciResult.content.includes('Quality Gate'), '包含质量门禁');

    // ---- Test 8: 生成 CD 工作流 ----
    console.log('\nTest 8: CD 工作流生成');
    const cdResult = ci.generateCD({ environment: ENVIRONMENT.DEV });
    assert(typeof cdResult.content === 'string', 'CD content 是字符串');
    assert(cdResult.path.endsWith('deploy-dev.yml'), '路径包含环境名');
    assert(cdResult.content.includes('Deploy to dev'), '包含部署标题');
    assert(cdResult.content.includes('npm run build'), '包含 build 步骤');

    // ---- Test 9: 生产环境 CD ----
    console.log('\nTest 9: 生产环境 CD');
    const prodCD = ci.generateCD({ environment: ENVIRONMENT.PRODUCTION });
    assert(prodCD.content.includes('Deploy to production'), '包含 production');
    assert(prodCD.content.includes('release'), '包含 release 触发');

    // ---- Test 10: 完整 CI/CD 生成 ----
    console.log('\nTest 10: 完整 CI/CD 生成');
    const full = ci.generateFull();
    assert(full.length === 4, `4 个工作流 (CI + 3 环境) (实际: ${full.length})`);
    assert(full[0].path.endsWith('ci.yml'), '第一个是 CI');
    assert(full.some(f => f.path.includes('deploy-dev')), '包含 dev 部署');
    assert(full.some(f => f.path.includes('deploy-staging')), '包含 staging 部署');
    assert(full.some(f => f.path.includes('deploy-production')), '包含 production 部署');

    // ---- Test 11: 写入工作流文件 ----
    console.log('\nTest 11: 写入工作流文件');
    const writeResult = ci.writeWorkflows();
    assert(writeResult.files.length === 4, `写入 4 个文件 (实际: ${writeResult.files.length})`);
    assert(writeResult.errors.length === 0, '无写入错误');
    assert(fs.existsSync(path.join(outDir, 'ci.yml')), 'ci.yml 文件存在');
    assert(fs.existsSync(path.join(outDir, 'deploy-dev.yml')), 'deploy-dev.yml 存在');

    // ---- Test 12: 仅写 CI ----
    console.log('\nTest 12: 仅写 CI');
    const ciOnly = ci.writeWorkflows({ type: PIPELINE_TYPE.CI });
    assert(ciOnly.files.length === 1, '仅 1 个文件');

    // ---- Test 13: 检测现有配置 ----
    console.log('\nTest 13: 检测现有配置');
    const detected = ci.detectExisting();
    assert(detected.hasGithubActions === true, '检测到 GitHub Actions');
    assert(detected.workflowFiles.length >= 1, `检测到工作流文件 (${detected.workflowFiles.length})`);
    assert(detected.platform === 'github', '平台为 github');

    // ---- Test 14: 无 CI 项目检测 ----
    console.log('\nTest 14: 无 CI 项目检测');
    const emptyDir = path.join(tmpDir, 'empty');
    fs.mkdirSync(emptyDir, { recursive: true });
    const ci2 = new CICDIntegration({ projectDir: emptyDir, logger: silentLogger });
    const detected2 = ci2.detectExisting();
    assert(detected2.hasGithubActions === false, '无 GitHub Actions');
    assert(detected2.platform === null, '无检测到平台');

    // ---- Test 15: YAML 内容验证 ----
    console.log('\nTest 15: YAML 内容验证');
    const ciContent = fs.readFileSync(path.join(outDir, 'ci.yml'), 'utf8');
    assert(ciContent.includes('actions/cache@v4'), '包含缓存步骤');
    assert(ciContent.includes('npm ci'), '包含 npm ci');
    assert(ciContent.includes('continue-on-error: true'), 'Security 门禁标记为 continue-on-error');

    // ---- Test 16: getStats ----
    console.log('\nTest 16: getStats');
    const stats = ci.getStats();
    assert(stats.platform === 'github', 'platform 正确');
    assert(stats.environments.length === 3, '3 个环境');
    assert(stats.qualityGates === 3, '3 个质量门禁');
    assert(stats.customSteps === 2, '2 个自定义步骤');

    // ---- Test 17: GitLab CI 生成 ----
    console.log('\nTest 17: GitLab CI 生成');
    const gitlabResult = ci.generateGitLabCI({ nodeVersion: '20' });
    assert(typeof gitlabResult.content === 'string', 'GitLab CI content 是字符串');
    assert(gitlabResult.path.endsWith('.gitlab-ci.yml'), '路径为 .gitlab-ci.yml');
    assert(gitlabResult.content.includes('stages:'), '包含 stages');
    assert(gitlabResult.content.includes('image:') && gitlabResult.content.includes('node:20'), '包含 Node 镜像');
    assert(gitlabResult.content.includes('npm test'), '包含 npm test');
    assert(gitlabResult.content.includes('deploy-dev'), '包含 dev 部署 job');
    assert(gitlabResult.content.includes('deploy-production'), '包含 production 部署 job');

    // ---- Test 18: Jenkinsfile 生成 ----
    console.log('\nTest 18: Jenkinsfile 生成');
    const jenkinsResult = ci.generateJenkinsfile({ nodeVersion: '20' });
    assert(typeof jenkinsResult.content === 'string', 'Jenkinsfile content 是字符串');
    assert(jenkinsResult.path.endsWith('Jenkinsfile'), '路径为 Jenkinsfile');
    assert(jenkinsResult.content.includes('pipeline {'), '包含 pipeline 块');
    assert(jenkinsResult.content.includes('nodejs'), '包含 nodejs 工具');
    assert(jenkinsResult.content.includes("stage('Test')"), '包含 Test stage');
    assert(jenkinsResult.content.includes("stage('Deploy to dev')"), '包含 dev 部署 stage');
    assert(jenkinsResult.content.includes("stage('Deploy to production')"), '包含 production 部署 stage');
    assert(jenkinsResult.content.includes('input {'), 'production 有审批输入');

    // ---- Test 19: generateForPlatform ----
    console.log('\nTest 19: generateForPlatform');
    const ghResult = ci.generateForPlatform('github', { nodeVersion: '18' });
    assert(ghResult.path.endsWith('ci.yml'), 'GitHub 平台生成 ci.yml');
    const glResult = ci.generateForPlatform('gitlab', { nodeVersion: '18' });
    assert(glResult.path.endsWith('.gitlab-ci.yml'), 'GitLab 平台生成 .gitlab-ci.yml');
    const jkResult = ci.generateForPlatform('jenkins', { nodeVersion: '18' });
    assert(jkResult.path.endsWith('Jenkinsfile'), 'Jenkins 平台生成 Jenkinsfile');

    // ---- Test 20: generateAllPlatforms ----
    console.log('\nTest 20: generateAllPlatforms');
    const allPlatforms = ci.generateAllPlatforms({ nodeVersion: '18' });
    assert(allPlatforms.length === 3, '生成 3 个平台配置');
    assert(allPlatforms.some(p => p.platform === 'github'), '包含 GitHub');
    assert(allPlatforms.some(p => p.platform === 'gitlab'), '包含 GitLab');
    assert(allPlatforms.some(p => p.platform === 'jenkins'), '包含 Jenkins');

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
    console.log('✅ 所有 CICDIntegration 测试通过！');
  } else {
    console.log('❌ 有测试失败');
    process.exitCode = 1;
  }
}

testCICDIntegration();
