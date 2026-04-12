/**
 * memory-store.js - Flow Harness 四类记忆体系
 *
 * 文档要求：user / feedback / project / reference 四类记忆
 * 含生命周期管理、冲突处理、与6层架构交互规则
 *
 * @version 1.0.0
 * @date 2026-04-13
 */

const fs = require('fs');
const path = require('path');

// ============================================================
// 常量定义
// ============================================================

const MEMORY_TYPES = {
  USER: 'user',
  FEEDBACK: 'feedback',
  PROJECT: 'project',
  REFERENCE: 'reference'
};

// TTL 配置（毫秒）
const TTL_CONFIG = {
  [MEMORY_TYPES.USER]: 30 * 24 * 60 * 60 * 1000,        // 30天
  [MEMORY_TYPES.FEEDBACK]: 90 * 24 * 60 * 60 * 1000,    // 90天
  [MEMORY_TYPES.PROJECT]: null,                           // 永久
  [MEMORY_TYPES.REFERENCE]: 7 * 24 * 60 * 60 * 1000     // 7天（可刷新）
};

// 记忆条目最大数量（防止无限膨胀）
const MAX_ENTRIES = {
  [MEMORY_TYPES.USER]: 500,
  [MEMORY_TYPES.FEEDBACK]: 1000,
  [MEMORY_TYPES.PROJECT]: 200,
  [MEMORY_TYPES.REFERENCE]: 300
};

// ============================================================
// MemoryEntry - 单条记忆
// ============================================================

class MemoryEntry {
  constructor({ key, value, type, tags = [], source = 'system', priority = 'normal' }) {
    this.id = MemoryEntry.generateId();
    this.key = key;
    this.value = value;
    this.type = type;
    this.tags = tags;
    this.source = source;       // 来源: system / user / agent / feedback
    this.priority = priority;   // normal / high / critical
    this.createdAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
    this.accessedAt = new Date().toISOString();
    this.accessCount = 0;
    this.version = 1;
    this.expired = false;
  }

  static generateId() {
    return `mem_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  touch() {
    this.accessedAt = new Date().toISOString();
    this.accessCount++;
  }

  update(newValue, source = 'system') {
    this.value = newValue;
    this.updatedAt = new Date().toISOString();
    this.source = source;
    this.version++;
  }

  isExpired() {
    const ttl = TTL_CONFIG[this.type];
    if (ttl === null) return false; // 永久
    const age = Date.now() - new Date(this.createdAt).getTime();
    return age > ttl;
  }

  toJSON() {
    return {
      id: this.id,
      key: this.key,
      value: this.value,
      type: this.type,
      tags: this.tags,
      source: this.source,
      priority: this.priority,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      accessedAt: this.accessedAt,
      accessCount: this.accessCount,
      version: this.version,
      expired: this.expired
    };
  }

  static fromJSON(json) {
    const entry = new MemoryEntry({
      key: json.key,
      value: json.value,
      type: json.type,
      tags: json.tags,
      source: json.source,
      priority: json.priority
    });
    entry.id = json.id;
    entry.createdAt = json.createdAt;
    entry.updatedAt = json.updatedAt;
    entry.accessedAt = json.accessedAt;
    entry.accessCount = json.accessCount;
    entry.version = json.version;
    entry.expired = json.expired;
    return entry;
  }
}

// ============================================================
// MemoryStore - 四类记忆统一管理
// ============================================================

class MemoryStore {
  /**
   * @param {string} basePath - 记忆存储根目录，默认 .flowharness/memory
   */
  constructor(basePath = '.flowharness/memory') {
    this.basePath = basePath;
    this.memories = {
      [MEMORY_TYPES.USER]: new Map(),
      [MEMORY_TYPES.FEEDBACK]: new Map(),
      [MEMORY_TYPES.PROJECT]: new Map(),
      [MEMORY_TYPES.REFERENCE]: new Map()
    };
    this.changeLog = [];   // 变更日志
    this.loaded = false;
  }

  // ----------------------------------------------------------
  // 初始化与持久化
  // ----------------------------------------------------------

  /**
   * 加载所有记忆类型
   */
  load() {
    this._ensureDir(this.basePath);

    for (const type of Object.values(MEMORY_TYPES)) {
      const filePath = this._getFilePath(type);
      if (fs.existsSync(filePath)) {
        try {
          const raw = fs.readFileSync(filePath, 'utf8');
          const data = JSON.parse(raw);
          const map = this.memories[type];
          for (const entry of data.entries) {
            const mem = MemoryEntry.fromJSON(entry);
            map.set(mem.key, mem);
          }
        } catch (err) {
          console.error(`[MemoryStore] 加载 ${type} 记忆失败: ${err.message}`);
          // 不抛出，使用空记忆
        }
      }
    }

    // 首次加载后执行过期清理
    this.expireAll();
    this.loaded = true;
  }

  /**
   * 保存指定类型或全部记忆
   */
  save(type = null) {
    this._ensureDir(this.basePath);

    const typesToSave = type ? [type] : Object.values(MEMORY_TYPES);

    for (const t of typesToSave) {
      const map = this.memories[t];
      const entries = Array.from(map.values())
        .filter(e => !e.expired)
        .map(e => e.toJSON());

      const data = {
        type: t,
        version: '1.0',
        entryCount: entries.length,
        lastSaved: new Date().toISOString(),
        entries
      };

      fs.writeFileSync(
        this._getFilePath(t),
        JSON.stringify(data, null, 2),
        'utf8'
      );
    }

    // 同时更新 MEMORY.md 索引
    this.generateMemoryIndex();
  }

  // ----------------------------------------------------------
  // 核心 CRUD 接口
  // ----------------------------------------------------------

  /**
   * 存储一条记忆
   * @param {string} type    - 记忆类型 (user/feedback/project/reference)
   * @param {string} key     - 唯一键
   * @param {*}      value   - 值（任意可序列化数据）
   * @param {Object} options - { tags, source, priority }
   * @returns {MemoryEntry}
   */
  store(type, key, value, options = {}) {
    this._validateType(type);
    const map = this.memories[type];

    // 冲突处理：如果 key 已存在
    if (map.has(key)) {
      return this._handleConflict(type, key, value, options);
    }

    // 容量检查：超出限制时淘汰最旧/最少访问的
    if (map.size >= MAX_ENTRIES[type]) {
      this._evict(type);
    }

    const entry = new MemoryEntry({
      key,
      value,
      type,
      tags: options.tags || [],
      source: options.source || 'system',
      priority: options.priority || 'normal'
    });

    map.set(key, entry);
    this._logChange('store', type, key);
    return entry;
  }

  /**
   * 检索一条记忆
   * @param {string} type - 记忆类型
   * @param {string} key  - 唯一键
   * @returns {*|null} 值，或 null
   */
  retrieve(type, key) {
    this._validateType(type);
    const map = this.memories[type];
    const entry = map.get(key);

    if (!entry) return null;

    // 检查过期
    if (entry.isExpired()) {
      entry.expired = true;
      map.delete(key);
      return null;
    }

    entry.touch();
    return entry.value;
  }

  /**
   * 获取完整的 MemoryEntry（含元数据）
   */
  getEntry(type, key) {
    this._validateType(type);
    const entry = this.memories[type].get(key);
    if (!entry || entry.isExpired()) return null;
    entry.touch();
    return entry;
  }

  /**
   * 搜索记忆
   * @param {string}   type    - 记忆类型（null 则全类型搜索）
   * @param {Object}   query   - { keyword, tags, source, minPriority }
   * @returns {MemoryEntry[]}
   */
  search(type, query = {}) {
    const typesToSearch = type ? [type] : Object.values(MEMORY_TYPES);
    const results = [];

    for (const t of typesToSearch) {
      this._validateType(t);
      for (const entry of this.memories[t].values()) {
        if (entry.isExpired()) continue;
        if (this._matchQuery(entry, query)) {
          entry.touch();
          results.push(entry);
        }
      }
    }

    // 按相关性排序：priority > accessCount > updatedAt
    results.sort((a, b) => {
      const priorityOrder = { critical: 3, high: 2, normal: 1 };
      const pa = priorityOrder[a.priority] || 0;
      const pb = priorityOrder[b.priority] || 0;
      if (pa !== pb) return pb - pa;
      if (a.accessCount !== b.accessCount) return b.accessCount - a.accessCount;
      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });

    return results;
  }

  /**
   * 删除一条记忆
   */
  remove(type, key) {
    this._validateType(type);
    const deleted = this.memories[type].delete(key);
    if (deleted) this._logChange('remove', type, key);
    return deleted;
  }

  /**
   * 更新一条记忆的值
   */
  update(type, key, newValue, source = 'system') {
    this._validateType(type);
    const entry = this.memories[type].get(key);
    if (!entry) return null;
    entry.update(newValue, source);
    this._logChange('update', type, key);
    return entry;
  }

  // ----------------------------------------------------------
  // 生命周期管理
  // ----------------------------------------------------------

  /**
   * 清理所有过期记忆
   * @returns {number} 清理的条数
   */
  expireAll() {
    let count = 0;
    for (const type of Object.values(MEMORY_TYPES)) {
      const map = this.memories[type];
      for (const [key, entry] of map) {
        if (entry.isExpired()) {
          entry.expired = true;
          map.delete(key);
          count++;
        }
      }
    }
    if (count > 0) {
      this._logChange('expire', 'all', `${count} entries`);
    }
    return count;
  }

  /**
   * 刷新 reference 类型记忆的 TTL（重置创建时间）
   */
  refreshReference(key) {
    const entry = this.memories[MEMORY_TYPES.REFERENCE].get(key);
    if (entry) {
      entry.createdAt = new Date().toISOString();
      this._logChange('refresh', MEMORY_TYPES.REFERENCE, key);
      return true;
    }
    return false;
  }

  // ----------------------------------------------------------
  // 统计与导出
  // ----------------------------------------------------------

  /**
   * 获取各类型记忆的统计信息
   */
  getStats() {
    const stats = {};
    for (const type of Object.values(MEMORY_TYPES)) {
      const map = this.memories[type];
      const entries = Array.from(map.values()).filter(e => !e.isExpired());
      stats[type] = {
        count: entries.length,
        maxCapacity: MAX_ENTRIES[type],
        ttl: TTL_CONFIG[type] ? `${TTL_CONFIG[type] / (24 * 60 * 60 * 1000)}天` : '永久',
        oldestEntry: entries.length > 0
          ? entries.reduce((a, b) => new Date(a.createdAt) < new Date(b.createdAt) ? a : b).createdAt
          : null,
        newestEntry: entries.length > 0
          ? entries.reduce((a, b) => new Date(a.createdAt) > new Date(b.createdAt) ? a : b).createdAt
          : null,
        totalAccessCount: entries.reduce((sum, e) => sum + e.accessCount, 0)
      };
    }
    return stats;
  }

  /**
   * 导出全部记忆为 JSON
   */
  export() {
    const exported = {};
    for (const type of Object.values(MEMORY_TYPES)) {
      exported[type] = Array.from(this.memories[type].values())
        .filter(e => !e.isExpired())
        .map(e => e.toJSON());
    }
    return {
      exportedAt: new Date().toISOString(),
      version: '1.0',
      memories: exported
    };
  }

  /**
   * 从 JSON 导入记忆（合并模式）
   */
  import(data) {
    if (!data || !data.memories) {
      throw new Error('Invalid import data format');
    }
    let importCount = 0;
    for (const type of Object.values(MEMORY_TYPES)) {
      if (data.memories[type]) {
        for (const entryData of data.memories[type]) {
          const existing = this.memories[type].get(entryData.key);
          if (!existing || new Date(entryData.updatedAt) > new Date(existing.updatedAt)) {
            const entry = MemoryEntry.fromJSON(entryData);
            this.memories[type].set(entry.key, entry);
            importCount++;
          }
        }
      }
    }
    this._logChange('import', 'all', `${importCount} entries`);
    return importCount;
  }

  // ----------------------------------------------------------
  // MEMORY.md 索引自动生成
  // ----------------------------------------------------------

  /**
   * 生成 .flowharness/MEMORY.md 索引文件
   */
  generateMemoryIndex() {
    const indexPath = path.join(path.dirname(this.basePath), 'MEMORY.md');
    const stats = this.getStats();
    const now = new Date().toISOString();

    let md = `# Flow Harness Memory Index\n\n`;
    md += `> 自动生成于 ${now}，请勿手动编辑\n\n`;

    // 总览
    const totalCount = Object.values(stats).reduce((sum, s) => sum + s.count, 0);
    md += `## 总览\n\n`;
    md += `- 总记忆条数: **${totalCount}**\n`;
    md += `- 记忆类型: 4 类 (user / feedback / project / reference)\n\n`;

    // 各类型详情
    md += `## 各类型统计\n\n`;
    md += `| 类型 | 条数 | 容量上限 | TTL | 最早条目 | 最新条目 |\n`;
    md += `|------|------|----------|-----|----------|----------|\n`;

    for (const type of Object.values(MEMORY_TYPES)) {
      const s = stats[type];
      const oldest = s.oldestEntry ? s.oldestEntry.substring(0, 10) : '-';
      const newest = s.newestEntry ? s.newestEntry.substring(0, 10) : '-';
      md += `| ${type} | ${s.count} | ${s.maxCapacity} | ${s.ttl} | ${oldest} | ${newest} |\n`;
    }

    // 各类型 key 列表（最多显示 20 个）
    md += `\n## 记忆键索引\n\n`;
    for (const type of Object.values(MEMORY_TYPES)) {
      const map = this.memories[type];
      const keys = Array.from(map.keys()).slice(0, 20);
      md += `### ${type}\n\n`;
      if (keys.length === 0) {
        md += `_（空）_\n\n`;
      } else {
        for (const key of keys) {
          const entry = map.get(key);
          md += `- \`${key}\` — v${entry.version}, 访问${entry.accessCount}次, 更新于 ${entry.updatedAt.substring(0, 10)}\n`;
        }
        if (map.size > 20) {
          md += `- _...及其他 ${map.size - 20} 条_\n`;
        }
        md += `\n`;
      }
    }

    // 变更日志（最近 10 条）
    md += `## 最近变更\n\n`;
    const recentChanges = this.changeLog.slice(-10);
    if (recentChanges.length === 0) {
      md += `_（暂无变更记录）_\n`;
    } else {
      for (const change of recentChanges) {
        md += `- [${change.timestamp}] ${change.action} ${change.type}/${change.key}\n`;
      }
    }

    md += `\n---\n*Generated by Flow Harness MemoryStore v1.0*\n`;

    this._ensureDir(path.dirname(indexPath));
    fs.writeFileSync(indexPath, md, 'utf8');
  }

  // ----------------------------------------------------------
  // 与 6 层架构的交互接口
  // ----------------------------------------------------------

  /**
   * Layer 1 (任务编排) 交互：根据项目记忆提供上下文
   */
  getTaskContext(taskType) {
    const projectMem = this.search(MEMORY_TYPES.PROJECT, { tags: [taskType] });
    const refMem = this.search(MEMORY_TYPES.REFERENCE, { tags: [taskType] });
    return {
      projectContext: projectMem.map(e => ({ key: e.key, value: e.value })),
      referenceContext: refMem.map(e => ({ key: e.key, value: e.value }))
    };
  }

  /**
   * Layer 2 (安全策略) 交互：获取用户权限相关记忆
   */
  getUserPermissionContext(userId) {
    return this.retrieve(MEMORY_TYPES.USER, `permission_${userId}`);
  }

  /**
   * Layer 3 (执行监控) 交互：记录执行反馈
   */
  recordExecutionFeedback(taskId, feedback) {
    this.store(MEMORY_TYPES.FEEDBACK, `exec_${taskId}`, feedback, {
      tags: ['execution', 'auto'],
      source: 'agent'
    });
  }

  /**
   * Layer 6 (反馈闭环) 交互：获取历史反馈用于优化
   */
  getOptimizationContext(category) {
    return this.search(MEMORY_TYPES.FEEDBACK, {
      tags: [category, 'optimization']
    });
  }

  // ----------------------------------------------------------
  // 私有方法
  // ----------------------------------------------------------

  _validateType(type) {
    if (!Object.values(MEMORY_TYPES).includes(type)) {
      throw new Error(`Invalid memory type: ${type}. Must be one of: ${Object.values(MEMORY_TYPES).join(', ')}`);
    }
  }

  _getFilePath(type) {
    return path.join(this.basePath, `${type}.json`);
  }

  _ensureDir(dir) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * 冲突处理：时间戳优先 + 显式覆盖
   */
  _handleConflict(type, key, newValue, options) {
    const existing = this.memories[type].get(key);

    // 策略：新值覆盖旧值，保留历史版本号
    existing.update(newValue, options.source || 'system');

    // 合并 tags
    if (options.tags) {
      const tagSet = new Set([...existing.tags, ...options.tags]);
      existing.tags = Array.from(tagSet);
    }

    // 升级 priority（只升不降）
    const priorityOrder = { normal: 1, high: 2, critical: 3 };
    if (options.priority && priorityOrder[options.priority] > priorityOrder[existing.priority]) {
      existing.priority = options.priority;
    }

    this._logChange('conflict_resolve', type, key);
    return existing;
  }

  /**
   * 淘汰策略：删除最旧且访问最少的条目
   */
  _evict(type) {
    const map = this.memories[type];
    const entries = Array.from(map.entries());

    // 按 priority（升序）、accessCount（升序）、createdAt（升序）排序
    entries.sort((a, b) => {
      const pa = { normal: 1, high: 2, critical: 3 }[a[1].priority] || 0;
      const pb = { normal: 1, high: 2, critical: 3 }[b[1].priority] || 0;
      if (pa !== pb) return pa - pb;
      if (a[1].accessCount !== b[1].accessCount) return a[1].accessCount - b[1].accessCount;
      return new Date(a[1].createdAt) - new Date(b[1].createdAt);
    });

    // 删除优先级最低的那条
    if (entries.length > 0) {
      const [evictKey] = entries[0];
      map.delete(evictKey);
      this._logChange('evict', type, evictKey);
    }
  }

  /**
   * 搜索匹配
   */
  _matchQuery(entry, query) {
    // 关键词搜索（匹配 key 或 value 的字符串表示）
    if (query.keyword) {
      const kw = query.keyword.toLowerCase();
      const keyMatch = entry.key.toLowerCase().includes(kw);
      const valueStr = typeof entry.value === 'string'
        ? entry.value
        : JSON.stringify(entry.value);
      const valueMatch = valueStr.toLowerCase().includes(kw);
      if (!keyMatch && !valueMatch) return false;
    }

    // 标签搜索
    if (query.tags && query.tags.length > 0) {
      const hasTag = query.tags.some(t => entry.tags.includes(t));
      if (!hasTag) return false;
    }

    // 来源搜索
    if (query.source && entry.source !== query.source) {
      return false;
    }

    // 优先级过滤
    if (query.minPriority) {
      const order = { normal: 1, high: 2, critical: 3 };
      if ((order[entry.priority] || 0) < (order[query.minPriority] || 0)) {
        return false;
      }
    }

    return true;
  }

  _logChange(action, type, key) {
    this.changeLog.push({
      action,
      type,
      key,
      timestamp: new Date().toISOString()
    });
    // 保留最近 100 条变更
    if (this.changeLog.length > 100) {
      this.changeLog = this.changeLog.slice(-100);
    }
  }
}

// ============================================================
// 导出
// ============================================================

module.exports = { MemoryStore, MemoryEntry, MEMORY_TYPES, TTL_CONFIG, MAX_ENTRIES };
