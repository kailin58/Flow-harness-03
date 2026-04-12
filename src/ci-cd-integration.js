/**
 * ci-cd-integration.js - CI/CD 配置生成与集成
 *
 * 文档要求(P2): CI/CD 集成
 *   - GitHub Actions workflow 模板生成
 *   - 质量门禁检查步骤
 *   - 测试报告集成
 *   - 多环境部署模板 (dev/staging/prod)
 *   - 自动触发条件配置
 *   - 自定义步骤注入
 *
 * @version 1.0.0
 * @date 2026-04-13
 */

const fs = require('fs');
const path = require('path');
const { createLogger } = require('./logger');

// ============================================================
// 常量
// ============================================================

const PIPELINE_TYPE = {
  CI: 'ci',
  CD: 'cd',
  FULL: 'full'
};

const ENVIRONMENT = {
  DEV: 'dev',
  STAGING: 'staging',
  PRODUCTION: 'production'
};

const CHECK_TYPE = {
  LINT: 'lint',
  TEST: 'test',
  BUILD: 'build',
  SECURITY: 'security',
  QUALITY_GATE: 'quality_gate',
  COVERAGE: 'coverage'
};

// ============================================================
// CICDIntegration
// ============================================================

class CICDIntegration {
  /**
   * @param {Object} options
   * @param {string} options.projectDir     - 项目根目录
   * @param {string} options.outputDir      - 输出目录
   * @param {string} options.platform       - CI平台 (github/gitlab/jenkins)
   * @param {Object} options.projectConfig  - 项目配置
   * @param {Object} options.logger
   */
  constructor(options = {}) {
    this.projectDir = options.projectDir || process.cwd();
    this.outputDir = options.outputDir || path.join(this.projectDir, '.github', 'workflows');
    this.platform = options.platform || 'github';
    this.projectConfig = options.projectConfig || {};
    this.logger = options.logger || createLogger({ name: 'ci-cd-integration' });

    // 自定义步骤
    this.customSteps = [];
    // 质量门禁规则
    this.qualityGates = [];
    // 环境配置
    this.environments = new Map();

    // 默认环境
    this._initDefaultEnvironments();
  }

  // ----------------------------------------------------------
  // 环境管理
  // ----------------------------------------------------------

  _initDefaultEnvironments() {
    this.environments.set(ENVIRONMENT.DEV, {
      name: ENVIRONMENT.DEV,
      branch: 'develop',
      autoDeployOn: 'push',
      requiresApproval: false,
      variables: { NODE_ENV: 'development' }
    });
    this.environments.set(ENVIRONMENT.STAGING, {
      name: ENVIRONMENT.STAGING,
      branch: 'staging',
      autoDeployOn: 'push',
      requiresApproval: false,
      variables: { NODE_ENV: 'staging' }
    });
    this.environments.set(ENVIRONMENT.PRODUCTION, {
      name: ENVIRONMENT.PRODUCTION,
      branch: 'main',
      autoDeployOn: 'release',
      requiresApproval: true,
      variables: { NODE_ENV: 'production' }
    });
  }

  /**
   * 配置环境
   */
  configureEnvironment(envName, config) {
    const existing = this.environments.get(envName) || { name: envName };
    this.environments.set(envName, { ...existing, ...config });
  }

  /**
   * 获取环境配置
   */
  getEnvironment(envName) {
    return this.environments.get(envName) || null;
  }

  // ----------------------------------------------------------
  // 质量门禁
  // ----------------------------------------------------------

  /**
   * 添加质量门禁规则
   * @param {Object} gate
   * @param {string} gate.name           - 门禁名称
   * @param {string} gate.type           - 检查类型
   * @param {string} gate.command        - 执行命令
   * @param {boolean} gate.required      - 是否必须通过
   * @param {number} gate.threshold      - 阈值
   */
  addQualityGate(gate) {
    this.qualityGates.push({
      name: gate.name,
      type: gate.type || CHECK_TYPE.QUALITY_GATE,
      command: gate.command,
      required: gate.required !== false,
      threshold: gate.threshold || null,
      timeoutMinutes: gate.timeoutMinutes || 10
    });
    return this.qualityGates.length;
  }

  /**
   * 添加自定义步骤
   */
  addCustomStep(step) {
    this.customSteps.push({
      name: step.name,
      run: step.run || step.command,
      condition: step.condition || null,
      after: step.after || 'test',
      env: step.env || {}
    });
    return this.customSteps.length;
  }

  // ----------------------------------------------------------
  // 工作流生成 — GitHub Actions
  // ----------------------------------------------------------

  /**
   * 生成 CI 工作流
   * @param {Object} options
   * @param {string} options.nodeVersion   - Node.js 版本
   * @param {string[]} options.triggers    - 触发事件
   * @param {boolean} options.cache        - 是否缓存依赖
   * @returns {Object} { content, path }
   */
  generateCI(options = {}) {
    const nodeVersion = options.nodeVersion || '18';
    const triggers = options.triggers || ['push', 'pull_request'];
    const cache = options.cache !== false;

    const workflow = {
      name: 'CI',
      on: this._buildTriggers(triggers),
      jobs: {
        test: {
          'runs-on': 'ubuntu-latest',
          steps: this._buildCISteps(nodeVersion, cache)
        }
      }
    };

    // 添加质量门禁作为单独 job
    if (this.qualityGates.length > 0) {
      workflow.jobs['quality-gate'] = {
        'runs-on': 'ubuntu-latest',
        needs: 'test',
        steps: this._buildQualityGateSteps(nodeVersion, cache)
      };
    }

    const content = this._toYaml(workflow);
    return { content, path: path.join(this.outputDir, 'ci.yml') };
  }

  /**
   * 生成 CD 工作流
   * @param {Object} options
   * @param {string} options.environment   - 目标环境
   * @param {string} options.nodeVersion
   * @returns {Object} { content, path }
   */
  generateCD(options = {}) {
    const envName = options.environment || ENVIRONMENT.DEV;
    const nodeVersion = options.nodeVersion || '18';
    const envConfig = this.environments.get(envName);

    const workflow = {
      name: `Deploy to ${envName}`,
      on: this._buildDeployTriggers(envConfig),
      jobs: {
        deploy: {
          'runs-on': 'ubuntu-latest',
          environment: envName,
          steps: this._buildCDSteps(nodeVersion, envConfig)
        }
      }
    };

    // 生产环境需要审批
    if (envConfig && envConfig.requiresApproval) {
      workflow.jobs.deploy['environment'] = {
        name: envName,
        url: `https://\${{ steps.deploy.outputs.url }}`
      };
    }

    const content = this._toYaml(workflow);
    const fileName = `deploy-${envName}.yml`;
    return { content, path: path.join(this.outputDir, fileName) };
  }

  /**
   * 生成完整 CI/CD 工作流
   */
  generateFull(options = {}) {
    const results = [];

    // CI
    results.push(this.generateCI(options));

    // CD for each environment
    for (const [envName] of this.environments) {
      results.push(this.generateCD({ ...options, environment: envName }));
    }

    return results;
  }

  // ----------------------------------------------------------
  // 工作流写入
  // ----------------------------------------------------------

  /**
   * 生成并写入所有工作流文件
   * @returns {Object} { files, errors }
   */
  writeWorkflows(options = {}) {
    const type = options.type || PIPELINE_TYPE.FULL;
    const result = { files: [], errors: [] };

    // 确保输出目录存在
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    let workflows = [];
    switch (type) {
      case PIPELINE_TYPE.CI:
        workflows = [this.generateCI(options)];
        break;
      case PIPELINE_TYPE.CD:
        workflows = [this.generateCD(options)];
        break;
      case PIPELINE_TYPE.FULL:
      default:
        workflows = this.generateFull(options);
        break;
    }

    for (const wf of workflows) {
      try {
        const dir = path.dirname(wf.path);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(wf.path, wf.content, 'utf8');
        result.files.push(wf.path);
      } catch (error) {
        result.errors.push({ path: wf.path, error: error.message });
      }
    }

    this.logger.info({
      files: result.files.length,
      errors: result.errors.length,
      type
    }, 'Workflows written');

    return result;
  }

  // ----------------------------------------------------------
  // 构建步骤
  // ----------------------------------------------------------

  _buildTriggers(triggers) {
    const on = {};
    for (const trigger of triggers) {
      if (trigger === 'push') {
        on.push = { branches: ['main', 'develop'] };
      } else if (trigger === 'pull_request') {
        on.pull_request = { branches: ['main'] };
      } else if (trigger === 'schedule') {
        on.schedule = [{ cron: '0 6 * * 1' }]; // Monday 6am
      } else {
        on[trigger] = {};
      }
    }
    return on;
  }

  _buildDeployTriggers(envConfig) {
    if (!envConfig) return { workflow_dispatch: {} };

    const on = {};
    if (envConfig.autoDeployOn === 'push') {
      on.push = { branches: [envConfig.branch] };
    } else if (envConfig.autoDeployOn === 'release') {
      on.release = { types: ['published'] };
    }
    on.workflow_dispatch = {};
    return on;
  }

  _buildCISteps(nodeVersion, cache) {
    const steps = [
      { name: 'Checkout', uses: 'actions/checkout@v4' },
      {
        name: 'Setup Node.js',
        uses: `actions/setup-node@v4`,
        with: { 'node-version': nodeVersion }
      }
    ];

    if (cache) {
      steps.push({
        name: 'Cache dependencies',
        uses: 'actions/cache@v4',
        with: {
          path: 'node_modules',
          key: `\${{ runner.os }}-node-\${{ hashFiles('package-lock.json') }}`
        }
      });
    }

    steps.push({ name: 'Install dependencies', run: 'npm ci' });
    steps.push({ name: 'Run tests', run: 'npm test' });

    // 自定义步骤
    for (const custom of this.customSteps) {
      const step = { name: custom.name, run: custom.run };
      if (custom.condition) step.if = custom.condition;
      if (Object.keys(custom.env).length > 0) step.env = custom.env;
      steps.push(step);
    }

    return steps;
  }

  _buildQualityGateSteps(nodeVersion, cache) {
    const steps = [
      { name: 'Checkout', uses: 'actions/checkout@v4' },
      {
        name: 'Setup Node.js',
        uses: 'actions/setup-node@v4',
        with: { 'node-version': nodeVersion }
      },
      { name: 'Install dependencies', run: 'npm ci' }
    ];

    for (const gate of this.qualityGates) {
      const step = {
        name: `Quality Gate: ${gate.name}`,
        run: gate.command,
        'timeout-minutes': gate.timeoutMinutes
      };
      if (!gate.required) {
        step['continue-on-error'] = true;
      }
      steps.push(step);
    }

    return steps;
  }

  _buildCDSteps(nodeVersion, envConfig) {
    const steps = [
      { name: 'Checkout', uses: 'actions/checkout@v4' },
      {
        name: 'Setup Node.js',
        uses: 'actions/setup-node@v4',
        with: { 'node-version': nodeVersion }
      },
      { name: 'Install dependencies', run: 'npm ci' },
      { name: 'Build', run: 'npm run build --if-present' },
      {
        name: 'Deploy',
        id: 'deploy',
        run: `echo "Deploying to ${envConfig ? envConfig.name : 'unknown'}..."`,
        env: envConfig ? envConfig.variables : {}
      }
    ];

    return steps;
  }

  // ----------------------------------------------------------
  // YAML 输出（简化版，不依赖外部库）
  // ----------------------------------------------------------

  _toYaml(obj, indent = 0) {
    const lines = [];
    const pad = '  '.repeat(indent);

    for (const [key, value] of Object.entries(obj)) {
      if (value === null || value === undefined) continue;

      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        const strVal = typeof value === 'string' && (value.includes(':') || value.includes('#') || value.includes('{') || value.includes('$'))
          ? `'${value}'`
          : String(value);
        lines.push(`${pad}${key}: ${strVal}`);
      } else if (Array.isArray(value)) {
        if (value.length === 0) {
          lines.push(`${pad}${key}: []`);
        } else if (typeof value[0] === 'string' || typeof value[0] === 'number') {
          lines.push(`${pad}${key}:`);
          for (const item of value) {
            lines.push(`${pad}  - ${item}`);
          }
        } else {
          lines.push(`${pad}${key}:`);
          for (const item of value) {
            const itemLines = this._toYaml(item, indent + 2).split('\n').filter(l => l.trim());
            if (itemLines.length > 0) {
              lines.push(`${pad}  - ${itemLines[0].trim()}`);
              for (let i = 1; i < itemLines.length; i++) {
                lines.push(`${pad}    ${itemLines[i].trim()}`);
              }
            }
          }
        }
      } else if (typeof value === 'object') {
        lines.push(`${pad}${key}:`);
        lines.push(this._toYaml(value, indent + 1));
      }
    }

    return lines.join('\n');
  }

  // ----------------------------------------------------------
  // 分析现有配置
  // ----------------------------------------------------------

  /**
   * 检测项目现有 CI/CD 配置
   * @returns {Object} 检测结果
   */
  detectExisting() {
    const result = {
      hasGithubActions: false,
      hasGitlabCI: false,
      hasJenkinsfile: false,
      workflowFiles: [],
      platform: null
    };

    // GitHub Actions
    const ghDir = path.join(this.projectDir, '.github', 'workflows');
    if (fs.existsSync(ghDir)) {
      result.hasGithubActions = true;
      result.platform = 'github';
      try {
        const files = fs.readdirSync(ghDir);
        result.workflowFiles = files.filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));
      } catch (e) { /* ignore */ }
    }

    // GitLab CI
    if (fs.existsSync(path.join(this.projectDir, '.gitlab-ci.yml'))) {
      result.hasGitlabCI = true;
      if (!result.platform) result.platform = 'gitlab';
    }

    // Jenkins
    if (fs.existsSync(path.join(this.projectDir, 'Jenkinsfile'))) {
      result.hasJenkinsfile = true;
      if (!result.platform) result.platform = 'jenkins';
    }

    return result;
  }

  // ----------------------------------------------------------
  // 统计
  // ----------------------------------------------------------

  getStats() {
    return {
      platform: this.platform,
      environments: [...this.environments.keys()],
      qualityGates: this.qualityGates.length,
      customSteps: this.customSteps.length,
      outputDir: this.outputDir
    };
  }
}

// ============================================================
// 导出
// ============================================================

module.exports = {
  CICDIntegration,
  PIPELINE_TYPE,
  ENVIRONMENT,
  CHECK_TYPE
};
