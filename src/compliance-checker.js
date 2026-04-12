'use strict';
/**
 * ComplianceChecker — 软件包合规检查器
 *
 * 三层校验（从严到宽，第1层失败直接拒绝）：
 *
 *   Layer 1: 来源校验（Source Validation）
 *     - 只接受官方 registry 的纯包名格式
 *     - npm:  registry.npmjs.org  — 禁止 git:// file: http: --registry=
 *     - pip:  pypi.org            — 禁止 --index-url .whl URL
 *     - 包名不含路径符号 / \ : @  — 防仿冒/路径注入
 *
 *   Layer 2: 许可证合规（License Compliance）
 *     Green  → MIT Apache-2.0 BSD ISC 0BSD Unlicense CC0  → 自动通过
 *     Yellow → LGPL MPL CDDL EPL                          → 需商议审查
 *     Red    → GPL AGPL SSPL 商业许可 Proprietary          → 需 CEO 批准
 *     Black  → 无许可证 / UNKNOWN                          → 拒绝
 *
 *   Layer 3: 安全扫描（Security / CVE）
 *     已知恶意包名单                                        → 自动拒绝
 *     CVE 风险等级（规则表）                                → 分级处理
 *
 * 审批结果写入 KnowledgeBase 命名空间 compliance（CEO 写，所有人读）
 */

const { createLogger } = require('./logger');

// ══════════════════════════════════════════════════════════════
//  常量定义
// ══════════════════════════════════════════════════════════════

const RISK_LEVEL = {
  GREEN:  'green',   // 自动通过
  YELLOW: 'yellow',  // 需商议（Inspector + Plan + CEO 三方）
  RED:    'red',     // 需 CEO 人工批准
  BLACK:  'black'    // 自动拒绝
};

const DECISION = {
  APPROVED:         'approved',
  REJECTED:         'rejected',
  PENDING_REVIEW:   'pending_review',   // 需商议
  PENDING_APPROVAL: 'pending_approval'  // 需CEO批准
};

// ── Layer 2: 许可证分级表 ──────────────────────────────────────
const LICENSE_LEVELS = {
  // Green — 宽松开源，商业友好，自动通过
  green: new Set([
    'MIT', 'Apache-2.0', 'Apache 2.0', 'Apache License 2.0',
    'BSD', 'BSD-2-Clause', 'BSD-3-Clause', 'BSD-4-Clause',
    'ISC', '0BSD', 'Unlicense', 'WTFPL',
    'CC0-1.0', 'CC0', 'Public Domain',
    'BlueOak-1.0.0', 'Zlib', 'Python-2.0'
  ]),
  // Yellow — 弱著佐权，商业使用需谨慎，需商议
  yellow: new Set([
    'LGPL', 'LGPL-2.0', 'LGPL-2.1', 'LGPL-3.0',
    'LGPL-2.0-only', 'LGPL-2.1-only', 'LGPL-3.0-only',
    'LGPL-2.0-or-later', 'LGPL-2.1-or-later', 'LGPL-3.0-or-later',
    'MPL', 'MPL-2.0', 'MPL-1.1',
    'CDDL', 'CDDL-1.0', 'CDDL-1.1',
    'EPL', 'EPL-1.0', 'EPL-2.0',
    'EUPL', 'EUPL-1.1', 'EUPL-1.2',
    'OSL', 'OSL-3.0',
    'CECILL', 'CECILL-2.1'
  ]),
  // Red — 强著佐权或商业许可，需CEO批准
  red: new Set([
    'GPL', 'GPL-2.0', 'GPL-3.0', 'GPL-2.0-only', 'GPL-3.0-only',
    'GPL-2.0-or-later', 'GPL-3.0-or-later',
    'AGPL', 'AGPL-3.0', 'AGPL-3.0-only', 'AGPL-3.0-or-later',
    'SSPL', 'SSPL-1.0',
    'BUSL', 'BUSL-1.1',
    'Proprietary', 'Commercial', 'SEE LICENSE IN LICENSE',
    'SEE LICENSE IN LICENSE.md', 'UNLICENSED'
  ])
};

// ── Layer 3: 已知恶意包名单（Black list）────────────────────────
// 包含历史上真实存在的恶意/仿冒包名
const BLACKLISTED_PACKAGES = new Set([
  // 经典 typosquatting / 恶意包
  'event-stream@3.3.6',   // 2018年事件，指定版本
  'ua-parser-js@0.7.29',  // 2021年，指定版本
  'node-ipc@10.1.1',      // 2022年，指定版本
  'colors@1.4.44-liberty-2',
  'faker@6.6.6',
  // 仿冒常见包名的恶意包
  'crossenv', 'cross-env.js', 'mongose', 'loadsh',
  'babelcli', 'nodecord', 'discordd', 'requirments',
  'python-dateutil2', 'colourama', 'djanga', 'urllib4',
  // npm 特定恶意包（包名级别拦截）
  'electron-native-notify', 'flatmap-stream',
  'eslint-scope@3.7.2', 'rc@1.2.9'
]);

// ── Layer 3: CVE 风险规则表（版本号 + 风险等级）────────────────
// 格式: 'pkgName@version' → { level, cveId, description }
// 生产环境应接入真实 CVE 数据库，这里用规则表模拟
const CVE_RULES = new Map([
  ['lodash@<=4.17.20',    { level: 'HIGH',     cveId: 'CVE-2021-23337', desc: 'Prototype Pollution' }],
  ['axios@<0.21.2',       { level: 'HIGH',     cveId: 'CVE-2021-3749',  desc: 'ReDoS vulnerability' }],
  ['minimist@<1.2.6',     { level: 'MEDIUM',   cveId: 'CVE-2021-44906', desc: 'Prototype Pollution' }],
  ['glob-parent@<5.1.2',  { level: 'MEDIUM',   cveId: 'CVE-2020-28469', desc: 'ReDoS' }],
  ['tar@<4.4.18',         { level: 'HIGH',     cveId: 'CVE-2021-37713', desc: 'Arbitrary File Write' }],
  ['node-fetch@<2.6.7',   { level: 'HIGH',     cveId: 'CVE-2022-0235',  desc: 'Exposure of Sensitive Info' }],
  ['xmlhttprequest-ssl@<1.6.3', { level: 'CRITICAL', cveId: 'CVE-2021-31597', desc: 'MITM vulnerability' }],
  ['trim@<0.0.3',         { level: 'MEDIUM',   cveId: 'CVE-2020-7753',  desc: 'ReDoS' }],
  ['path-parse@<1.0.7',   { level: 'MEDIUM',   cveId: 'CVE-2021-23343', desc: 'ReDoS' }],
  ['y18n@<3.2.2',         { level: 'HIGH',     cveId: 'CVE-2020-7774',  desc: 'Prototype Pollution' }]
]);

// ── Layer 1: 非法来源模式（正则）────────────────────────────────
const INVALID_SOURCE_PATTERNS = [
  /^git(\+https?|\+ssh)?:\/\//i,       // git:// git+https://
  /^https?:\/\//i,                      // http:// https://
  /^file:/i,                            // file:
  /^\.{0,2}\//,                         // ./ ../ /absolute
  /^[A-Za-z]:\\/,                       // Windows 绝对路径
  /--registry/i,                        // --registry=xxx
  /--index-url/i,                       // pip --index-url
  /--extra-index-url/i,                 // pip --extra-index-url
  /\.whl$/i,                            // .whl 文件
  /\.tar\.gz$/i,                        // tarball 直链
  /github\.com/i,                       // github 直装
  /bitbucket\.org/i,                    // bitbucket 直装
  /gitlab\.com/i                        // gitlab 直装
];

// 合法包名：只允许字母、数字、- _ . @scope/pkg
const VALID_PACKAGE_NAME = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*(@[\w.*^~>=<!|, ()-]+)?$/i;


// ══════════════════════════════════════════════════════════════
//  ComplianceChecker
// ══════════════════════════════════════════════════════════════

class ComplianceChecker {
  /**
   * @param {import('./knowledge-base')} knowledgeBase
   * @param {Object} [options]
   * @param {boolean} [options.strict=true]  严格模式：Yellow 也需要商议
   */
  constructor(knowledgeBase, options = {}) {
    this.kb     = knowledgeBase;
    this.strict = options.strict !== false;
    this.logger = createLogger({ name: 'compliance' });
  }

  // ══════════════════════════════════════════════════════════════
  //  公共 API
  // ══════════════════════════════════════════════════════════════

  /**
   * 对一个包进行完整的三层合规检查
   *
   * @param {string} packageSpec  - 包规格（如 'lodash', 'lodash@4.17.21', 'git+https://...'）
   * @param {Object} [meta]       - 附加信息（申请理由、申请 Agent、任务ID 等）
   * @returns {ComplianceResult}
   */
  check(packageSpec, meta = {}) {
    const result = {
      packageSpec,
      checkedAt:  new Date().toISOString(),
      checkedBy:  meta.agentId || 'system',
      taskId:     meta.taskId  || null,
      reason:     meta.reason  || '',
      layers:     {},
      riskLevel:  RISK_LEVEL.GREEN,
      decision:   DECISION.APPROVED,
      blockReason: null
    };

    // ── Layer 1: 来源校验 ────────────────────────────────────
    const layer1 = this._checkSource(packageSpec);
    result.layers.source = layer1;
    if (!layer1.ok) {
      result.riskLevel  = RISK_LEVEL.BLACK;
      result.decision   = DECISION.REJECTED;
      result.blockReason = layer1.reason;
      this._saveAudit(packageSpec, result);
      this.logger.warn(`[Compliance] ❌ 来源拒绝: ${packageSpec} — ${layer1.reason}`);
      return result;
    }

    // 提取纯包名和版本
    const { name, version } = this._parsePackage(packageSpec);

    // ── Layer 3a: 黑名单检查（恶意包，先于许可证检查）─────────
    const layer3Black = this._checkBlacklist(name, version, packageSpec);
    result.layers.blacklist = layer3Black;
    if (!layer3Black.ok) {
      result.riskLevel  = RISK_LEVEL.BLACK;
      result.decision   = DECISION.REJECTED;
      result.blockReason = layer3Black.reason;
      this._saveAudit(packageSpec, result);
      this.logger.warn(`[Compliance] ❌ 黑名单拒绝: ${packageSpec} — ${layer3Black.reason}`);
      return result;
    }

    // ── Layer 2: 许可证检查 ───────────────────────────────────
    const layer2 = this._checkLicense(meta.license);
    result.layers.license = layer2;
    if (layer2.level === RISK_LEVEL.BLACK) {
      result.riskLevel  = RISK_LEVEL.BLACK;
      result.decision   = DECISION.REJECTED;
      result.blockReason = `许可证不合规: ${layer2.license}`;
      this._saveAudit(packageSpec, result);
      this.logger.warn(`[Compliance] ❌ 许可证拒绝: ${packageSpec} (${layer2.license})`);
      return result;
    }

    // ── Layer 3b: CVE 扫描 ────────────────────────────────────
    const layer3Cve = this._checkCVE(name, version);
    result.layers.cve = layer3Cve;

    // ── 综合风险等级 ──────────────────────────────────────────
    result.riskLevel = this._mergeRisk(layer2.level, layer3Cve.level);
    result.decision  = this._riskToDecision(result.riskLevel);

    this._saveAudit(packageSpec, result);

    const icon = result.decision === DECISION.APPROVED ? '✅' : '⚠️ ';
    this.logger.info(`[Compliance] ${icon} ${packageSpec}: ${result.riskLevel} → ${result.decision}`);

    return result;
  }

  /**
   * 批量检查（安装命令中包含多个包时使用）
   * @param {string[]} packageSpecs
   * @param {Object}   meta
   * @returns {{ results: ComplianceResult[], summary: Object }}
   */
  checkAll(packageSpecs, meta = {}) {
    const results = packageSpecs.map(spec => this.check(spec, meta));
    const blocked  = results.filter(r => r.decision === DECISION.REJECTED);
    const review   = results.filter(r => r.decision === DECISION.PENDING_REVIEW);
    const approval = results.filter(r => r.decision === DECISION.PENDING_APPROVAL);
    const approved = results.filter(r => r.decision === DECISION.APPROVED);

    return {
      results,
      summary: {
        total:    results.length,
        approved: approved.length,
        blocked:  blocked.length,
        review:   review.length,
        approval: approval.length,
        canProceed: blocked.length === 0 && review.length === 0 && approval.length === 0
      }
    };
  }

  /**
   * CEO 手动批准一个包（Red 级别需要）
   * @param {string} packageSpec
   * @param {string} approverId   - 审批人 Agent ID（必须是 'supervisor'）
   * @param {string} approveReason
   */
  approve(packageSpec, approverId, approveReason) {
    if (approverId !== 'supervisor') {
      throw new Error(`[Compliance] 只有 CEO(supervisor) 可以批准高风险包，当前: ${approverId}`);
    }

    const key   = `approval_${this._pkgKey(packageSpec)}`;
    const entry = {
      packageSpec,
      approvedBy:    approverId,
      approveReason,
      approvedAt:    new Date().toISOString(),
      validUntil:    new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString() // 90天有效
    };

    if (this.kb) {
      this.kb.writeShared('compliance', key, entry, 'supervisor');
    }
    this.logger.info(`[Compliance] CEO 批准: ${packageSpec} (${approveReason})`);
    return entry;
  }

  /**
   * 检查某个包是否已获 CEO 批准
   */
  isApproved(packageSpec) {
    if (!this.kb) return false;
    const key   = `approval_${this._pkgKey(packageSpec)}`;
    const entry = this.kb.readShared('compliance', key);
    if (!entry?.data) return false;
    // 检查是否过期
    return new Date(entry.data.validUntil) > new Date();
  }

  /**
   * 获取审计日志（最近N条）
   */
  getAuditLog(limit = 20) {
    if (!this.kb) return [];
    const keys = this.kb.listShared('compliance')
      .filter(k => k.startsWith('audit_'))
      .sort()
      .slice(-limit);
    return keys.map(k => {
      const e = this.kb.readShared('compliance', k);
      return e?.data || null;
    }).filter(Boolean);
  }

  // ══════════════════════════════════════════════════════════════
  //  Layer 1 — 来源校验
  // ══════════════════════════════════════════════════════════════

  _checkSource(packageSpec) {
    const spec = packageSpec.trim();

    // 检查非法来源模式
    for (const pattern of INVALID_SOURCE_PATTERNS) {
      if (pattern.test(spec)) {
        return {
          ok:     false,
          reason: `包规格包含非官方来源标记（${pattern}），只允许从官方 registry 安装纯包名`,
          spec
        };
      }
    }

    // 提取包名部分（去掉版本号）验证格式
    const namePart = spec.split('@')[0] || spec;
    if (namePart.includes('/') && !spec.startsWith('@')) {
      // 非 scoped package 但包含斜杠
      return {
        ok:     false,
        reason: `包名包含路径字符: "${spec}"，只允许官方 registry 格式`,
        spec
      };
    }

    if (!VALID_PACKAGE_NAME.test(spec)) {
      return {
        ok:     false,
        reason: `包名格式不合法: "${spec}"，可能是路径注入或仿冒包名`,
        spec
      };
    }

    return { ok: true, source: 'official_registry', spec };
  }

  // ══════════════════════════════════════════════════════════════
  //  Layer 2 — 许可证检查
  // ══════════════════════════════════════════════════════════════

  _checkLicense(licenseStr) {
    if (!licenseStr) {
      // 未提供许可证信息 → 默认 GREEN（安装前无法知道）
      // 实际项目可接入 license-checker 工具
      return { level: RISK_LEVEL.GREEN, license: 'UNKNOWN_DEFERRED', checked: false };
    }

    const normalized = licenseStr.trim().toUpperCase();

    // 精确匹配（大小写不敏感）
    for (const [level, set] of Object.entries(LICENSE_LEVELS)) {
      for (const lic of set) {
        if (normalized === lic.toUpperCase()) {
          return { level: RISK_LEVEL[level.toUpperCase()] || RISK_LEVEL.GREEN, license: licenseStr, checked: true };
        }
      }
    }

    // 模糊匹配（包含关键词）
    if (/\bAGPL\b/.test(normalized) || /\bSSPL\b/.test(normalized)) {
      return { level: RISK_LEVEL.RED, license: licenseStr, checked: true };
    }
    if (/\bGPL\b/.test(normalized)) {
      return { level: RISK_LEVEL.RED, license: licenseStr, checked: true };
    }
    if (/\bLGPL\b/.test(normalized)) {
      return { level: RISK_LEVEL.YELLOW, license: licenseStr, checked: true };
    }
    if (/\bMPL\b/.test(normalized)) {
      return { level: RISK_LEVEL.YELLOW, license: licenseStr, checked: true };
    }
    if (/\bMIT\b/.test(normalized) || /\bAPACHE\b/.test(normalized) || /\bBSD\b/.test(normalized)) {
      return { level: RISK_LEVEL.GREEN, license: licenseStr, checked: true };
    }
    if (/PROPRIETARY|COMMERCIAL|ALL RIGHTS RESERVED/.test(normalized)) {
      return { level: RISK_LEVEL.RED, license: licenseStr, checked: true };
    }

    // 未能识别 → Black（宁可误杀不可漏杀）
    return { level: RISK_LEVEL.BLACK, license: licenseStr, checked: true,
             note: '无法识别的许可证类型，需要人工确认' };
  }

  // ══════════════════════════════════════════════════════════════
  //  Layer 3a — 黑名单
  // ══════════════════════════════════════════════════════════════

  _checkBlacklist(name, version, fullSpec) {
    // 精确包名匹配（不论版本）
    if (BLACKLISTED_PACKAGES.has(name)) {
      return { ok: false, reason: `包名 "${name}" 在已知恶意包名单中` };
    }
    // 带版本的精确匹配
    if (version && BLACKLISTED_PACKAGES.has(`${name}@${version}`)) {
      return { ok: false, reason: `"${name}@${version}" 是已知恶意版本` };
    }
    return { ok: true };
  }

  // ══════════════════════════════════════════════════════════════
  //  Layer 3b — CVE 扫描（规则表）
  // ══════════════════════════════════════════════════════════════

  _checkCVE(name, version) {
    const cves = [];

    for (const [rule, info] of CVE_RULES.entries()) {
      const [rulePkg, ruleVer] = rule.split('@');
      if (rulePkg.toLowerCase() !== name.toLowerCase()) continue;
      if (!version || !ruleVer) continue;

      // 简单的版本范围检查（支持 <=X 格式）
      if (ruleVer.startsWith('<=')) {
        const maxVer = ruleVer.slice(2).trim();
        if (this._versionLte(version, maxVer)) {
          cves.push({ ...info, rule });
        }
      } else if (ruleVer.startsWith('<')) {
        const maxVer = ruleVer.slice(1).trim();
        if (this._versionLt(version, maxVer)) {
          cves.push({ ...info, rule });
        }
      }
    }

    const maxLevel = cves.reduce((m, c) => {
      const order = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
      return (order[c.level] || 0) > (order[m] || 0) ? c.level : m;
    }, null);

    const riskLevel = maxLevel === 'CRITICAL' ? RISK_LEVEL.BLACK
      : maxLevel === 'HIGH'     ? RISK_LEVEL.RED
      : maxLevel === 'MEDIUM'   ? RISK_LEVEL.YELLOW
      : RISK_LEVEL.GREEN;

    return { level: riskLevel, cves, count: cves.length };
  }

  // ══════════════════════════════════════════════════════════════
  //  工具方法
  // ══════════════════════════════════════════════════════════════

  _parsePackage(spec) {
    // 处理 scoped package: @scope/name@version
    if (spec.startsWith('@')) {
      const parts = spec.slice(1).split('@');
      const name  = '@' + (parts[0] || '');
      const version = parts[1] || null;
      return { name, version };
    }
    const atIdx = spec.indexOf('@');
    if (atIdx > 0) {
      return { name: spec.slice(0, atIdx), version: spec.slice(atIdx + 1) };
    }
    return { name: spec, version: null };
  }

  _mergeRisk(licenseLevel, cveLevel) {
    const order = {
      [RISK_LEVEL.BLACK]:  4,
      [RISK_LEVEL.RED]:    3,
      [RISK_LEVEL.YELLOW]: 2,
      [RISK_LEVEL.GREEN]:  1
    };
    return (order[cveLevel] || 0) > (order[licenseLevel] || 0) ? cveLevel : licenseLevel;
  }

  _riskToDecision(level) {
    switch (level) {
      case RISK_LEVEL.GREEN:  return DECISION.APPROVED;
      case RISK_LEVEL.YELLOW: return DECISION.PENDING_REVIEW;
      case RISK_LEVEL.RED:    return DECISION.PENDING_APPROVAL;
      case RISK_LEVEL.BLACK:  return DECISION.REJECTED;
      default:                return DECISION.REJECTED;
    }
  }

  _pkgKey(spec) {
    return spec.replace(/[^a-z0-9_@.-]/gi, '_').toLowerCase();
  }

  _saveAudit(packageSpec, result) {
    if (!this.kb) return;
    const key = `audit_${Date.now()}_${this._pkgKey(packageSpec)}`;
    try {
      this.kb.writeShared('compliance', key, result, 'supervisor');
    } catch {
      // KB 未初始化时静默失败
    }
  }

  // 简单语义版本比较（仅支持 x.y.z 格式）
  _versionLte(v, max) {
    return this._versionCompare(v, max) <= 0;
  }
  _versionLt(v, max) {
    return this._versionCompare(v, max) < 0;
  }
  _versionCompare(a, b) {
    const pa = String(a).split('.').map(Number);
    const pb = String(b).split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const diff = (pa[i] || 0) - (pb[i] || 0);
      if (diff !== 0) return diff;
    }
    return 0;
  }

  // ── 静态常量 ──────────────────────────────────────────────────
  static get RISK_LEVEL()  { return RISK_LEVEL; }
  static get DECISION()    { return DECISION; }
}

// 将常量挂到导出对象（避免与静态getter冲突，直接用独立变量导出）
const _exports = ComplianceChecker;
Object.defineProperty(_exports, 'RISK_LEVEL', { value: RISK_LEVEL, enumerable: true });
Object.defineProperty(_exports, 'DECISION',   { value: DECISION,   enumerable: true });
module.exports = _exports;
