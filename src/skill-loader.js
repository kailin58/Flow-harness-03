const fs = require('fs');
const path = require('path');
const { createLogger } = require('./logger');

class SkillLoader {
  /**
   * @param {Object} options
   * @param {string} [options.rootDir]          - 业务项目根（用于解析技能文件相对路径）
   * @param {string} [options.globalSkillsDir]  - 全局技能目录（来自 StorageManager）
   * @param {string} [options.projectSkillsDir] - 项目私有技能目录（来自 StorageManager，可覆盖全局）
   *
   * 优先级（低→高）: 全局技能 → 项目私有技能
   * 若两层都无注册表，则使用内置空默认值
   */
  constructor(options = {}) {
    this.rootDir = options.rootDir || process.cwd();

    // 零足迹模式：由 StorageManager 提供路径
    this.globalSkillsDir  = options.globalSkillsDir  || null;
    this.projectSkillsDir = options.projectSkillsDir || null;

    // 向后兼容：旧版从项目目录内加载
    this.legacySkillsDir = path.join(this.rootDir, '.flowharness', 'skills');

    this.registry = null;
    this._loaded  = false;
    this.logger   = createLogger({ name: 'skill-loader' });
  }

  loadRegistry() {
    // 按优先级收集所有注册表路径（全局 → 项目私有 → 旧版）
    const candidates = [
      this.globalSkillsDir  ? path.join(this.globalSkillsDir,  'registry.json') : null,
      this.projectSkillsDir ? path.join(this.projectSkillsDir, 'registry.json') : null,
      path.join(this.legacySkillsDir, 'registry.json')
    ].filter(Boolean);

    // 去重（避免 globalSkillsDir === legacySkillsDir 时重复加载）
    const seen = new Set();
    const unique = candidates.filter(p => {
      if (seen.has(p)) return false;
      seen.add(p);
      return true;
    });

    // 合并：后加载的注册表中同名技能覆盖先加载的（项目私有 > 全局）
    let merged = this.getDefaultRegistry();
    let loadedAny = false;

    for (const registryPath of unique) {
      if (!fs.existsSync(registryPath)) continue;
      try {
        const raw = fs.readFileSync(registryPath, 'utf8');
        const reg = JSON.parse(raw);
        merged = this._mergeRegistries(merged, reg);
        loadedAny = true;
      } catch (error) {
        this.logger.warn({ registryPath, err: error.message }, 'Failed to parse skills registry, skipping');
      }
    }

    if (!loadedAny) {
      this.logger.warn({ candidates: unique }, 'No skills registry found, using empty default');
    }

    this.registry = merged;
    this._loaded  = true;
    return this.registry;
  }

  /** 合并两个注册表：base + overlay，overlay 中同 id 的技能覆盖 base */
  _mergeRegistries(base, overlay) {
    if (!overlay || !overlay.skills) return base;
    const result = {
      version: overlay.version || base.version,
      skills:  {}
    };

    // 先复制 base
    for (const [role, skills] of Object.entries(base.skills || {})) {
      result.skills[role] = [...(skills || [])];
    }

    // overlay 覆盖/追加
    for (const [role, skills] of Object.entries(overlay.skills || {})) {
      if (!result.skills[role]) {
        result.skills[role] = [...(skills || [])];
      } else {
        for (const skill of (skills || [])) {
          const idx = result.skills[role].findIndex(s => s.id === skill.id);
          if (idx >= 0) {
            result.skills[role][idx] = skill; // 覆盖同 id 技能
          } else {
            result.skills[role].push(skill);  // 追加新技能
          }
        }
      }
    }

    return result;
  }

  matchSkills(agentRole, taskDescription) {
    const registry = this._ensureRegistryLoaded();
    const agentSkills = registry.skills[agentRole] || [];
    const matched = [];
    const descLower = String(taskDescription || '').toLowerCase();

    for (const skill of agentSkills) {
      if (skill.status !== 'active') {
        continue;
      }

      const triggered = Array.isArray(skill.triggers) && skill.triggers.some((trigger) =>
        descLower.includes(String(trigger).toLowerCase())
      );

      if (triggered) {
        matched.push({
          id: skill.id,
          name: skill.name,
          path: skill.path,
          content: this._loadSkillContent(skill.path)
        });
      }
    }

    return matched;
  }

  listSkills(agentRole) {
    const registry = this._ensureRegistryLoaded();

    if (agentRole) {
      return registry.skills[agentRole] || [];
    }

    const allSkills = [];
    for (const [role, skills] of Object.entries(registry.skills)) {
      for (const skill of skills) {
        allSkills.push({ ...skill, agent: role });
      }
    }

    return allSkills;
  }

  getDefaultRegistry() {
    return {
      version: '1.0',
      skills: {}
    };
  }

  _ensureRegistryLoaded() {
    if (!this._loaded || !this.registry) {
      return this.loadRegistry();
    }

    return this.registry;
  }

  _loadSkillContent(skillPath) {
    const fullPath = path.isAbsolute(skillPath)
      ? skillPath
      : path.join(this.rootDir, skillPath);

    if (!fs.existsSync(fullPath)) {
      return null;
    }

    try {
      return fs.readFileSync(fullPath, 'utf8');
    } catch (error) {
      return null;
    }
  }
}

module.exports = { SkillLoader };
