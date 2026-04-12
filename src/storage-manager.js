'use strict';

/**
 * StorageManager - 零足迹存储管理器
 *
 * 设计原则：
 *   - 业务项目目录零污染：所有框架数据存储在用户 Home 目录
 *   - 按项目路径哈希隔离：多个项目互不干扰
 *   - 层级配置合并：全局配置 < 项目局部覆盖（可选）
 *   - 业务项目代码只读：框架不自动写入业务目录
 *
 * 存储布局：
 *   ~/.flowharness/                    ← 全局根（GLOBAL_ROOT）
 *     config.yml                       ← 全局默认配置
 *     skills/registry.json             ← 全局技能注册表
 *     commands/registry.json           ← 全局命令注册表
 *     projects/
 *       <name>-<hash8>/                ← 每个业务项目独立目录
 *         config.yml                   ← 项目级配置覆盖（可选）
 *         knowledge/                   ← 知识库（patterns/metrics/token_usage）
 *         logs/                        ← 运行日志
 *         worktrees/                   ← 并行执行工作树
 *         skills/                      ← 项目私有技能（覆盖全局）
 *
 * 业务项目目录：只读，不写入任何文件
 */

const os   = require('os');
const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_GLOBAL_ROOT = path.join(os.homedir(), '.flowharness');

class StorageManager {
  /**
   * @param {Object} options
   * @param {string} [options.projectRoot]  - 业务项目根目录（默认 process.cwd()）
   * @param {string} [options.globalRoot]   - 框架全局根目录（默认 ~/.flowharness）
   */
  constructor(options = {}) {
    this.projectRoot = options.projectRoot
      ? path.resolve(options.projectRoot)
      : process.cwd();

    this.globalRoot = options.globalRoot
      ? path.resolve(options.globalRoot)
      : DEFAULT_GLOBAL_ROOT;

    this.projectId   = this._computeProjectId(this.projectRoot);
    this.projectDataDir = path.join(this.globalRoot, 'projects', this.projectId);
  }

  // ─── 全局路径 ────────────────────────────────────────────────

  /** 全局配置文件路径 */
  get globalConfigPath()   { return path.join(this.globalRoot, 'config.yml'); }

  /** 全局技能目录 */
  get globalSkillsDir()    { return path.join(this.globalRoot, 'skills'); }

  /** 全局命令目录 */
  get globalCommandsDir()  { return path.join(this.globalRoot, 'commands'); }

  // ─── 项目级路径（存在 ~/.flowharness/projects/<id>/ 下） ─────

  /** 项目知识库目录 */
  get knowledgeDir()  { return path.join(this.projectDataDir, 'knowledge'); }

  /** 项目日志目录 */
  get logsDir()       { return path.join(this.projectDataDir, 'logs'); }

  /** 项目并行工作树目录 */
  get worktreesDir()  { return path.join(this.projectDataDir, 'worktrees'); }

  /** 项目私有技能目录（覆盖全局同名技能） */
  get projectSkillsDir() { return path.join(this.projectDataDir, 'skills'); }

  /** 项目级配置覆盖文件 */
  get projectConfigPath() { return path.join(this.projectDataDir, 'config.yml'); }

  // ─── 兼容路径：旧版 .flowharness/ 在项目内（仅读取，不写入）──

  /** 业务项目内的旧版配置路径（只读，向后兼容） */
  get legacyConfigPath() {
    return path.join(this.projectRoot, '.flowharness', 'config.yml');
  }

  // ─── 初始化 ──────────────────────────────────────────────────

  /**
   * 确保所有存储目录存在（首次使用时调用）
   */
  ensureDirs() {
    const dirs = [
      this.globalRoot,
      this.globalSkillsDir,
      this.globalCommandsDir,
      this.projectDataDir,
      this.knowledgeDir,
      this.logsDir,
      this.worktreesDir,
      this.projectSkillsDir
    ];
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    // 如果全局配置不存在，从项目内旧版配置迁移（或生成默认配置）
    if (!fs.existsSync(this.globalConfigPath)) {
      this._bootstrapGlobalConfig();
    }

    return this;
  }

  /**
   * 解析最终配置文件路径
   * 优先级：项目级覆盖 > 全局配置 > 项目内旧版配置（向后兼容）
   */
  resolveConfigPath(explicitPath) {
    if (explicitPath) return path.resolve(explicitPath);
    if (fs.existsSync(this.projectConfigPath)) return this.projectConfigPath;
    if (fs.existsSync(this.globalConfigPath))  return this.globalConfigPath;
    if (fs.existsSync(this.legacyConfigPath))  return this.legacyConfigPath;
    return this.globalConfigPath; // fallback（ensureDirs 会创建）
  }

  /**
   * 技能注册表路径列表（按优先级从低到高：全局 → 项目私有）
   */
  skillRegistryPaths() {
    const paths = [];
    const globalReg  = path.join(this.globalSkillsDir, 'registry.json');
    const projectReg = path.join(this.projectSkillsDir, 'registry.json');
    if (fs.existsSync(globalReg))  paths.push(globalReg);
    if (fs.existsSync(projectReg)) paths.push(projectReg);
    return paths;
  }

  /**
   * 返回当前项目信息摘要（调试/日志用）
   */
  info() {
    return {
      projectRoot:    this.projectRoot,
      projectId:      this.projectId,
      globalRoot:     this.globalRoot,
      projectDataDir: this.projectDataDir,
      configPath:     this.resolveConfigPath()
    };
  }

  // ─── 内部工具 ─────────────────────────────────────────────────

  _computeProjectId(projectRoot) {
    const name = path.basename(projectRoot)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 24);
    const hash = crypto
      .createHash('md5')
      .update(projectRoot)
      .digest('hex')
      .slice(0, 8);
    return `${name}-${hash}`;
  }

  _bootstrapGlobalConfig() {
    // 如果旧版项目内配置存在，复制到全局（一次性迁移）
    if (fs.existsSync(this.legacyConfigPath)) {
      fs.copyFileSync(this.legacyConfigPath, this.globalConfigPath);
      return;
    }

    // 否则写入最小默认配置
    const defaultConfig = `# Flow Harness 全局配置
# 由 StorageManager 自动生成
# 所有数据存储在此目录（~/.flowharness/），业务项目代码零污染

version: "1.0"

execution:
  mode: "closed_loop"   # closed_loop | pipeline
  parallel:
    enabled: false
    maxWorkers: 4
    mergeStrategy: "auto"

policies:
  file_access:
    mode: "whitelist"
    allow:
      - "src/**"
      - "test/**"
      - "docs/**"
      - "*.md"
      - "package.json"
    deny:
      - ".env"
      - "*.pem"
      - "*.key"
      - "secrets/**"

hooks:
  enabled: true
  lifecycle: {}

knowledge:
  enabled: true

external:
  skills:
    enabled: false
`;
    fs.writeFileSync(this.globalConfigPath, defaultConfig, 'utf8');
  }
}

module.exports = { StorageManager, DEFAULT_GLOBAL_ROOT };
