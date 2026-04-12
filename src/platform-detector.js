/**
 * Platform Detector - 平台检测器
 * 检测当前环境中可用的 AI 编码平台
 *
 * 支持平台：
 * - claude-code: Claude Code CLI / IDE 扩展
 * - cursor: Cursor IDE
 * - codex: OpenAI Codex CLI
 * - generic: 通用回退平台
 */
const fs = require('fs');
const path = require('path');

// 平台定义
const PLATFORM_DEFINITIONS = {
  'claude-code': {
    name: 'Claude Code',
    markers: ['.claude', 'CLAUDE.md'],
    capabilities: ['code_editing', 'terminal', 'file_search', 'code_search', 'multi_step', 'reasoning'],
    configPaths: ['.claude/settings.json']
  },
  'cursor': {
    name: 'Cursor',
    markers: ['.cursor', '.cursorules', '.cursorrules'],
    capabilities: ['code_editing', 'file_search', 'refactoring', 'ui_development', 'inline_edit'],
    configPaths: ['.cursor/settings.json']
  },
  'codex': {
    name: 'Codex CLI',
    markers: ['.codex', 'codex.md', 'CODEX.md'],
    capabilities: ['code_editing', 'terminal', 'autonomous_execution', 'testing', 'sandbox'],
    configPaths: ['.codex/config.json']
  }
};

class PlatformDetector {
  constructor(config = {}) {
    this.config = {
      workingDir: config.workingDir || process.cwd(),
      customPlatforms: config.customPlatforms || {},
      ...config
    };

    // 合并自定义平台定义
    this.platformDefs = { ...PLATFORM_DEFINITIONS, ...this.config.customPlatforms };

    // 检测缓存
    this._cache = null;
    this._cacheTime = 0;
    this._cacheTTL = config.cacheTTL || 30000; // 30秒缓存

    // 统计
    this._stats = {
      totalDetections: 0,
      lastDetection: null
    };
  }

  /**
   * 完整检测：返回当前平台和所有可用平台
   * @returns {Object} { current, platforms }
   */
  detect() {
    const now = Date.now();
    if (this._cache && (now - this._cacheTime) < this._cacheTTL) {
      return this._cache;
    }

    const platforms = this.detectAvailablePlatforms();
    const current = this._detectCurrent(platforms);

    const result = {
      current,
      platforms,
      detectedAt: now
    };

    this._cache = result;
    this._cacheTime = now;
    this._stats.totalDetections++;
    this._stats.lastDetection = now;

    return result;
  }

  /**
   * 检测当前运行的平台
   * @returns {string} 平台ID
   */
  detectCurrentPlatform() {
    return this.detect().current;
  }

  /**
   * 检测所有可用平台
   * @returns {Array} 平台信息列表
   */
  detectAvailablePlatforms() {
    const platforms = [];
    const now = Date.now();

    for (const [id, def] of Object.entries(this.platformDefs)) {
      const available = this._checkMarkers(def.markers);
      const configPath = this._findConfigPath(def.configPaths);

      platforms.push({
        id,
        name: def.name,
        available,
        capabilities: [...def.capabilities],
        configPath,
        detectedAt: now
      });
    }

    // 始终添加 generic 平台
    if (!platforms.some(p => p.id === 'generic')) {
      platforms.push({
        id: 'generic',
        name: 'Generic Platform',
        available: true,
        capabilities: ['code_editing', 'file_search'],
        configPath: null,
        detectedAt: now
      });
    }

    return platforms;
  }

  /**
   * 检查指定平台是否可用
   * @param {string} platformId
   * @returns {boolean}
   */
  isAvailable(platformId) {
    if (platformId === 'generic') return true;
    const def = this.platformDefs[platformId];
    if (!def) return false;
    return this._checkMarkers(def.markers);
  }

  /**
   * 获取平台详细信息
   * @param {string} platformId
   * @returns {Object|null}
   */
  getPlatformInfo(platformId) {
    if (platformId === 'generic') {
      return {
        id: 'generic',
        name: 'Generic Platform',
        available: true,
        capabilities: ['code_editing', 'file_search'],
        configPath: null
      };
    }

    const def = this.platformDefs[platformId];
    if (!def) return null;

    return {
      id: platformId,
      name: def.name,
      available: this._checkMarkers(def.markers),
      capabilities: [...def.capabilities],
      configPath: this._findConfigPath(def.configPaths)
    };
  }

  /**
   * 注册自定义平台
   * @param {string} platformId
   * @param {Object} definition
   */
  registerPlatform(platformId, definition) {
    if (!platformId || typeof platformId !== 'string') {
      throw new Error('platformId 必须为非空字符串');
    }
    if (!definition.markers || !Array.isArray(definition.markers)) {
      throw new Error('必须提供 markers 数组');
    }
    this.platformDefs[platformId] = {
      name: definition.name || platformId,
      markers: definition.markers,
      capabilities: definition.capabilities || [],
      configPaths: definition.configPaths || []
    };
    this._cache = null; // 清除缓存
  }

  /**
   * 获取统计信息
   * @returns {Object}
   */
  getStats() {
    const detection = this.detect();
    const available = detection.platforms.filter(p => p.available);
    return {
      totalPlatforms: detection.platforms.length,
      availablePlatforms: available.length,
      currentPlatform: detection.current,
      platformIds: detection.platforms.map(p => p.id),
      availableIds: available.map(p => p.id),
      totalDetections: this._stats.totalDetections,
      lastDetection: this._stats.lastDetection
    };
  }

  // ========== 内部方法 ==========

  /**
   * 检测当前平台（优先级：有标记的平台 > generic）
   */
  _detectCurrent(platforms) {
    // 按优先级检测：claude-code > cursor > codex
    const priority = ['claude-code', 'cursor', 'codex'];
    for (const id of priority) {
      const p = platforms.find(pl => pl.id === id && pl.available);
      if (p) return id;
    }
    return 'generic';
  }

  /**
   * 检查文件系统标记是否存在
   */
  _checkMarkers(markers) {
    for (const marker of markers) {
      const fullPath = path.join(this.config.workingDir, marker);
      try {
        fs.accessSync(fullPath);
        return true;
      } catch {
        // 标记不存在，继续检查下一个
      }
    }
    return false;
  }

  /**
   * 查找配置文件路径
   */
  _findConfigPath(configPaths) {
    if (!configPaths) return null;
    for (const cp of configPaths) {
      const fullPath = path.join(this.config.workingDir, cp);
      try {
        fs.accessSync(fullPath);
        return fullPath;
      } catch {
        // 继续
      }
    }
    return null;
  }
}

module.exports = PlatformDetector;
