/**
 * project-onboarding.js - 项目接入自动化
 *
 * 文档要求(Ch25): 5步接入流程
 *   Step 1: 检测 — 检测项目类型、技术栈、目录结构
 *   Step 2: 配置 — 生成 .flowharness/ 配置文件
 *   Step 3: 安全 — 设置安全策略、权限配置
 *   Step 4: 验证 — 验证配置有效性、运行健康检查
 *   Step 5: 启动 — 初始化运行时、创建首个快照
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

const TECH_STACKS = {
  NODE: { name: 'Node.js', markers: ['package.json', 'node_modules'], language: 'javascript' },
  PYTHON: { name: 'Python', markers: ['requirements.txt', 'setup.py', 'pyproject.toml', 'Pipfile'], language: 'python' },
  JAVA: { name: 'Java', markers: ['pom.xml', 'build.gradle', 'build.gradle.kts'], language: 'java' },
  GO: { name: 'Go', markers: ['go.mod', 'go.sum'], language: 'go' },
  RUST: { name: 'Rust', markers: ['Cargo.toml'], language: 'rust' },
  DOTNET: { name: '.NET', markers: ['*.csproj', '*.sln'], language: 'csharp' },
  RUBY: { name: 'Ruby', markers: ['Gemfile', 'Rakefile'], language: 'ruby' },
  PHP: { name: 'PHP', markers: ['composer.json'], language: 'php' }
};

const PROJECT_TYPES = {
  WEB_APP: 'web_app',
  API_SERVICE: 'api_service',
  CLI_TOOL: 'cli_tool',
  LIBRARY: 'library',
  MONOREPO: 'monorepo',
  UNKNOWN: 'unknown'
};

const ONBOARDING_STEPS = {
  DETECT: 'detect',
  CONFIGURE: 'configure',
  SECURE: 'secure',
  VALIDATE: 'validate',
  ACTIVATE: 'activate'
};

// ============================================================
// ProjectOnboarding
// ============================================================

class ProjectOnboarding {
  /**
   * @param {Object} options
   * @param {string} options.projectRoot - 项目根目录
   * @param {Object} options.logger      - Logger 实例
   */
  constructor(options = {}) {
    this.projectRoot = options.projectRoot || process.cwd();
    this.logger = options.logger || createLogger({ name: 'project-onboarding' });
    this.harnessDir = path.join(this.projectRoot, '.flowharness');

    // 检测结果
    this.detection = null;
    this.stepResults = {};
  }

  // ----------------------------------------------------------
  // 完整接入流程
  // ----------------------------------------------------------

  /**
   * 执行完整的 5 步接入流程
   * @returns {Object} 接入结果
   */
  async onboard() {
    const result = {
      startTime: new Date().toISOString(),
      steps: {},
      success: false,
      error: null
    };

    try {
      // Step 1: 检测
      result.steps.detect = await this.step1_detect();

      // Step 2: 配置
      result.steps.configure = await this.step2_configure(result.steps.detect);

      // Step 3: 安全
      result.steps.secure = await this.step3_secure(result.steps.detect);

      // Step 4: 验证
      result.steps.validate = await this.step4_validate();

      // Step 5: 启动
      result.steps.activate = await this.step5_activate();

      result.success = true;
    } catch (error) {
      result.error = error.message;
      this.logger.error({ error: error.message }, 'Onboarding failed');
    }

    result.endTime = new Date().toISOString();
    return result;
  }

  // ----------------------------------------------------------
  // Step 1: 检测
  // ----------------------------------------------------------

  async step1_detect() {
    this.logger.info({ projectRoot: this.projectRoot }, 'Step 1: Detecting project...');

    const detection = {
      projectRoot: this.projectRoot,
      techStacks: [],
      projectType: PROJECT_TYPES.UNKNOWN,
      structure: {},
      existingConfig: false
    };

    // 检测技术栈
    detection.techStacks = this._detectTechStacks();

    // 检测项目类型
    detection.projectType = this._detectProjectType();

    // 检测目录结构
    detection.structure = this._detectStructure();

    // 检测是否已有 .flowharness
    detection.existingConfig = fs.existsSync(this.harnessDir);

    // 检测版本控制
    detection.vcs = this._detectVCS();

    this.detection = detection;
    this.stepResults[ONBOARDING_STEPS.DETECT] = detection;

    this.logger.info({
      stacks: detection.techStacks.map(s => s.name),
      type: detection.projectType,
      hasExisting: detection.existingConfig,
      vcs: detection.vcs
    }, 'Detection complete');

    return detection;
  }

  _detectTechStacks() {
    const detected = [];

    for (const [key, stack] of Object.entries(TECH_STACKS)) {
      for (const marker of stack.markers) {
        let found = false;
        if (marker.includes('*')) {
          // 通配符匹配
          try {
            const dir = fs.readdirSync(this.projectRoot);
            const ext = marker.replace('*', '');
            found = dir.some(f => f.endsWith(ext));
          } catch (e) { /* ignore */ }
        } else {
          found = fs.existsSync(path.join(this.projectRoot, marker));
        }
        if (found) {
          detected.push({ key, ...stack });
          break;
        }
      }
    }

    return detected;
  }

  _detectProjectType() {
    const root = this.projectRoot;

    // 检测 monorepo
    const monoIndicators = ['lerna.json', 'pnpm-workspace.yaml', 'nx.json'];
    if (monoIndicators.some(f => fs.existsSync(path.join(root, f)))) {
      return PROJECT_TYPES.MONOREPO;
    }
    // packages/ or workspaces 目录
    if (fs.existsSync(path.join(root, 'packages'))) {
      return PROJECT_TYPES.MONOREPO;
    }

    // 检测 package.json 中的线索
    const pkgPath = path.join(root, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

        // CLI tool
        if (pkg.bin) return PROJECT_TYPES.CLI_TOOL;

        // Web app (有前端框架依赖)
        const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
        const webFrameworks = ['react', 'vue', 'angular', 'next', 'nuxt', 'svelte'];
        if (webFrameworks.some(f => allDeps[f])) return PROJECT_TYPES.WEB_APP;

        // API service (有后端框架)
        const apiFrameworks = ['express', 'koa', 'fastify', 'hapi', 'nestjs'];
        if (apiFrameworks.some(f => allDeps[f] || allDeps[`@${f}/core`])) return PROJECT_TYPES.API_SERVICE;

        // Library (有 main/module/exports)
        if (pkg.main || pkg.module || pkg.exports) return PROJECT_TYPES.LIBRARY;
      } catch (e) { /* ignore */ }
    }

    return PROJECT_TYPES.UNKNOWN;
  }

  _detectStructure() {
    const structure = { dirs: [], files: [], depth: 0 };

    try {
      const entries = fs.readdirSync(this.projectRoot, { withFileTypes: true });
      structure.dirs = entries.filter(e => e.isDirectory() && !e.name.startsWith('.')).map(e => e.name);
      structure.files = entries.filter(e => e.isFile()).map(e => e.name);
      structure.depth = 1; // 只检测第一层

      // 检测常见目录
      structure.hasSrc = structure.dirs.includes('src');
      structure.hasTest = structure.dirs.includes('test') || structure.dirs.includes('tests') || structure.dirs.includes('__tests__');
      structure.hasDocs = structure.dirs.includes('docs') || structure.dirs.includes('doc');
      structure.hasCI = fs.existsSync(path.join(this.projectRoot, '.github')) ||
                        fs.existsSync(path.join(this.projectRoot, '.gitlab-ci.yml'));
    } catch (e) {
      this.logger.warn({ error: e.message }, 'Failed to read project structure');
    }

    return structure;
  }

  _detectVCS() {
    if (fs.existsSync(path.join(this.projectRoot, '.git'))) return 'git';
    if (fs.existsSync(path.join(this.projectRoot, '.svn'))) return 'svn';
    if (fs.existsSync(path.join(this.projectRoot, '.hg'))) return 'mercurial';
    return null;
  }

  // ----------------------------------------------------------
  // Step 2: 配置
  // ----------------------------------------------------------

  async step2_configure(detection) {
    this.logger.info('Step 2: Generating configuration...');

    // 创建 .flowharness 目录
    if (!fs.existsSync(this.harnessDir)) {
      fs.mkdirSync(this.harnessDir, { recursive: true });
    }

    // 生成配置
    const config = this._generateConfig(detection);
    const configPath = path.join(this.harnessDir, 'config.yml');
    fs.writeFileSync(configPath, this._toYamlLike(config), 'utf8');

    // 创建知识库目录
    const knowledgeDir = path.join(this.harnessDir, 'knowledge');
    if (!fs.existsSync(knowledgeDir)) {
      fs.mkdirSync(knowledgeDir, { recursive: true });
    }

    // 创建 MEMORY.md 初始文件
    const memoryPath = path.join(this.harnessDir, 'MEMORY.md');
    if (!fs.existsSync(memoryPath)) {
      fs.writeFileSync(memoryPath, `# Flow Harness Memory Index\n\nInitialized: ${new Date().toISOString()}\n\n## Statistics\n- Total entries: 0\n`, 'utf8');
    }

    const result = {
      configPath,
      knowledgeDir,
      memoryPath,
      config
    };

    this.stepResults[ONBOARDING_STEPS.CONFIGURE] = result;
    this.logger.info({ configPath }, 'Configuration generated');
    return result;
  }

  _generateConfig(detection) {
    const primaryStack = detection.techStacks[0];
    const config = {
      version: '1.0',
      project: {
        name: path.basename(this.projectRoot),
        type: detection.projectType,
        language: primaryStack?.language || 'unknown',
        techStack: detection.techStacks.map(s => s.name)
      },
      supervisor: {
        maxRetries: 2,
        reviewThreshold: 7.0,
        maxOptimizeIterations: 3
      },
      policies: {
        file_access: {
          allowed_patterns: this._getDefaultAllowedPatterns(detection),
          blocked_patterns: this._getDefaultBlockedPatterns()
        },
        commands: {
          allowed: this._getDefaultAllowedCommands(detection),
          blocked: ['rm -rf /', 'format', 'fdisk', 'mkfs']
        }
      },
      workflows: [],
      hooks: {}
    };

    // 添加默认工作流
    if (primaryStack?.key === 'NODE') {
      config.workflows.push({
        name: 'ci',
        description: 'Run CI pipeline',
        enabled: true,
        steps: [
          { name: 'lint', type: 'check', action: 'lint' },
          { name: 'test', type: 'run', command: 'npm test' },
          { name: 'security', type: 'check', action: 'security_scan' }
        ]
      });
    }

    return config;
  }

  _getDefaultAllowedPatterns(detection) {
    const patterns = ['src/**', 'lib/**', 'test/**', 'tests/**'];
    if (detection.structure?.hasDocs) patterns.push('docs/**');
    return patterns;
  }

  _getDefaultBlockedPatterns() {
    return [
      '.env', '.env.*', '*.pem', '*.key',
      'node_modules/**', '.git/**',
      'credentials.*', 'secrets.*'
    ];
  }

  _getDefaultAllowedCommands(detection) {
    const primaryStack = detection.techStacks[0];
    const commands = ['git', 'echo', 'cat', 'ls', 'find', 'grep'];

    switch (primaryStack?.key) {
      case 'NODE':
        commands.push('npm', 'npx', 'node', 'yarn', 'pnpm');
        break;
      case 'PYTHON':
        commands.push('python', 'pip', 'pytest', 'black', 'flake8');
        break;
      case 'JAVA':
        commands.push('mvn', 'gradle', 'java', 'javac');
        break;
      case 'GO':
        commands.push('go', 'gofmt');
        break;
      case 'RUST':
        commands.push('cargo', 'rustc', 'rustfmt');
        break;
    }

    return commands;
  }

  _toYamlLike(obj, indent = 0) {
    let result = '';
    const prefix = '  '.repeat(indent);

    for (const [key, value] of Object.entries(obj)) {
      if (value === null || value === undefined) continue;

      if (Array.isArray(value)) {
        result += `${prefix}${key}:\n`;
        for (const item of value) {
          if (typeof item === 'object') {
            result += `${prefix}  -\n`;
            for (const [k, v] of Object.entries(item)) {
              if (Array.isArray(v)) {
                result += `${prefix}    ${k}:\n`;
                for (const vi of v) {
                  result += typeof vi === 'object'
                    ? `${prefix}      -\n${this._toYamlLike(vi, indent + 4)}`
                    : `${prefix}      - ${vi}\n`;
                }
              } else {
                result += `${prefix}    ${k}: ${v}\n`;
              }
            }
          } else {
            result += `${prefix}  - ${item}\n`;
          }
        }
      } else if (typeof value === 'object') {
        result += `${prefix}${key}:\n`;
        result += this._toYamlLike(value, indent + 1);
      } else {
        result += `${prefix}${key}: ${value}\n`;
      }
    }

    return result;
  }

  // ----------------------------------------------------------
  // Step 3: 安全
  // ----------------------------------------------------------

  async step3_secure(detection) {
    this.logger.info('Step 3: Setting up security...');

    const securityConfig = {
      defaultDeny: true,
      roles: ['developer', 'tech_lead', 'admin'],
      defaultRole: 'developer',
      criticalPaths: [],
      auditEnabled: true
    };

    // 基于项目类型设置关键路径
    switch (detection.projectType) {
      case PROJECT_TYPES.WEB_APP:
        securityConfig.criticalPaths = ['src/auth/**', 'src/payment/**', 'src/config/**'];
        break;
      case PROJECT_TYPES.API_SERVICE:
        securityConfig.criticalPaths = ['src/middleware/auth*', 'src/routes/payment*', 'config/database*'];
        break;
      default:
        securityConfig.criticalPaths = ['src/config/**', 'src/security/**'];
    }

    // 创建 .gitignore 条目
    const gitignorePath = path.join(this.projectRoot, '.gitignore');
    const harnessIgnore = '\n# Flow Harness\n.flowharness/knowledge/\n.flowharness/memory/\n';

    if (fs.existsSync(gitignorePath)) {
      const existing = fs.readFileSync(gitignorePath, 'utf8');
      if (!existing.includes('.flowharness/knowledge')) {
        fs.appendFileSync(gitignorePath, harnessIgnore, 'utf8');
      }
    }

    // 写入安全配置
    const securityPath = path.join(this.harnessDir, 'security.json');
    fs.writeFileSync(securityPath, JSON.stringify(securityConfig, null, 2), 'utf8');

    const result = { securityConfig, securityPath, gitignoreUpdated: true };
    this.stepResults[ONBOARDING_STEPS.SECURE] = result;

    this.logger.info({ roles: securityConfig.roles, criticalPaths: securityConfig.criticalPaths.length }, 'Security configured');
    return result;
  }

  // ----------------------------------------------------------
  // Step 4: 验证
  // ----------------------------------------------------------

  async step4_validate() {
    this.logger.info('Step 4: Validating configuration...');

    const checks = [];

    // Check 1: .flowharness 目录存在
    checks.push({
      name: 'harness_directory',
      passed: fs.existsSync(this.harnessDir),
      detail: '.flowharness/ 目录'
    });

    // Check 2: config.yml 存在且可读
    const configPath = path.join(this.harnessDir, 'config.yml');
    const configExists = fs.existsSync(configPath);
    checks.push({
      name: 'config_file',
      passed: configExists,
      detail: 'config.yml 配置文件'
    });

    // Check 3: 知识库目录存在
    const knowledgeDir = path.join(this.harnessDir, 'knowledge');
    checks.push({
      name: 'knowledge_directory',
      passed: fs.existsSync(knowledgeDir),
      detail: 'knowledge/ 知识库目录'
    });

    // Check 4: 安全配置存在
    const securityPath = path.join(this.harnessDir, 'security.json');
    const securityExists = fs.existsSync(securityPath);
    checks.push({
      name: 'security_config',
      passed: securityExists,
      detail: 'security.json 安全配置'
    });

    // Check 5: 安全配置有效
    if (securityExists) {
      try {
        const secData = JSON.parse(fs.readFileSync(securityPath, 'utf8'));
        checks.push({
          name: 'security_valid',
          passed: secData.defaultDeny === true && Array.isArray(secData.roles),
          detail: '安全配置有效性'
        });
      } catch (e) {
        checks.push({
          name: 'security_valid',
          passed: false,
          detail: `安全配置解析失败: ${e.message}`
        });
      }
    }

    // Check 6: MEMORY.md 存在
    checks.push({
      name: 'memory_index',
      passed: fs.existsSync(path.join(this.harnessDir, 'MEMORY.md')),
      detail: 'MEMORY.md 索引文件'
    });

    const passed = checks.filter(c => c.passed).length;
    const total = checks.length;
    const allPassed = passed === total;

    const result = { checks, passed, total, allPassed };
    this.stepResults[ONBOARDING_STEPS.VALIDATE] = result;

    this.logger.info({ passed, total, allPassed }, 'Validation complete');
    return result;
  }

  // ----------------------------------------------------------
  // Step 5: 启动
  // ----------------------------------------------------------

  async step5_activate() {
    this.logger.info('Step 5: Activating Flow Harness...');

    // 创建首个快照
    const snapshot = {
      version: '1.0',
      activatedAt: new Date().toISOString(),
      detection: this.detection,
      status: 'active'
    };

    const snapshotPath = path.join(this.harnessDir, 'snapshot.json');
    fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf8');

    // 创建初始 patterns.json 和 metrics.json (如果不存在)
    const knowledgeDir = path.join(this.harnessDir, 'knowledge');
    const patternsPath = path.join(knowledgeDir, 'patterns.json');
    const metricsPath = path.join(knowledgeDir, 'metrics.json');

    if (!fs.existsSync(patternsPath)) {
      fs.writeFileSync(patternsPath, JSON.stringify({
        version: '1.0',
        last_updated: new Date().toISOString(),
        successful_patterns: [],
        failure_patterns: [],
        optimizations: [],
        statistics: {
          total_runs: 0,
          successful_runs: 0,
          failed_runs: 0,
          avg_execution_time: 0
        }
      }, null, 2), 'utf8');
    }

    if (!fs.existsSync(metricsPath)) {
      fs.writeFileSync(metricsPath, JSON.stringify({
        version: '1.0',
        metrics: [],
        aggregated: { by_workflow: {}, by_step: {}, by_day: {} }
      }, null, 2), 'utf8');
    }

    const result = {
      snapshotPath,
      activated: true,
      harnessDir: this.harnessDir
    };
    this.stepResults[ONBOARDING_STEPS.ACTIVATE] = result;

    this.logger.info({ harnessDir: this.harnessDir }, 'Flow Harness activated');
    return result;
  }

  // ----------------------------------------------------------
  // 辅助方法
  // ----------------------------------------------------------

  /**
   * 获取接入结果概要
   */
  getSummary() {
    return {
      projectRoot: this.projectRoot,
      detection: this.detection,
      steps: Object.keys(this.stepResults),
      allComplete: Object.keys(this.stepResults).length === 5
    };
  }
}

// ============================================================
// 导出
// ============================================================

module.exports = {
  ProjectOnboarding,
  TECH_STACKS,
  PROJECT_TYPES,
  ONBOARDING_STEPS
};
