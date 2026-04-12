/**
 * unified-protocol.js - 统一通信协议
 *
 * 文档要求(P2): 统一协议
 *   - Agent Manifest 定义与注册
 *   - Adapter 模式 — 异构 Agent 协议统一
 *   - UCI (Unified Communication Interface) 标准消息
 *   - 消息路由与分发
 *   - 协议版本协商
 *
 * @version 1.0.0
 * @date 2026-04-13
 */

const { createLogger } = require('./logger');

// ============================================================
// 常量
// ============================================================

const MESSAGE_TYPE = {
  REQUEST: 'request',
  RESPONSE: 'response',
  EVENT: 'event',
  ERROR: 'error',
  HEARTBEAT: 'heartbeat',
  HANDSHAKE: 'handshake'
};

const PROTOCOL_VERSION = '1.0.0';

const ADAPTER_STATUS = {
  REGISTERED: 'registered',
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  ERROR: 'error'
};

// ============================================================
// UCI 消息结构
// ============================================================

/**
 * 创建标准 UCI 消息
 */
function createMessage(type, payload, options = {}) {
  return {
    id: options.id || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    version: PROTOCOL_VERSION,
    type,
    source: options.source || 'system',
    target: options.target || '*',
    timestamp: new Date().toISOString(),
    correlationId: options.correlationId || null,
    payload,
    metadata: options.metadata || {}
  };
}

/**
 * 验证 UCI 消息格式
 */
function validateMessage(msg) {
  const errors = [];
  if (!msg) { return { valid: false, errors: ['Message is null'] }; }
  if (!msg.id) errors.push('Missing id');
  if (!msg.type) errors.push('Missing type');
  if (!Object.values(MESSAGE_TYPE).includes(msg.type)) errors.push(`Invalid type: ${msg.type}`);
  if (!msg.source) errors.push('Missing source');
  if (!msg.payload && msg.payload !== null && msg.payload !== 0) errors.push('Missing payload');
  return { valid: errors.length === 0, errors };
}

// ============================================================
// AgentManifest
// ============================================================

class AgentManifest {
  /**
   * @param {Object} definition
   * @param {string} definition.id           - Agent 唯一标识
   * @param {string} definition.name         - Agent 显示名
   * @param {string} definition.version      - 版本
   * @param {string} definition.description  - 说明
   * @param {string[]} definition.capabilities - 能力列表
   * @param {Object} definition.protocol     - 协议配置
   * @param {Object} definition.resources    - 资源需求
   */
  constructor(definition = {}) {
    this.id = definition.id || `agent_${Date.now()}`;
    this.name = definition.name || 'unnamed';
    this.version = definition.version || '1.0.0';
    this.description = definition.description || '';
    this.capabilities = definition.capabilities || [];
    this.protocol = {
      version: PROTOCOL_VERSION,
      supportedTypes: definition.protocol?.supportedTypes || Object.values(MESSAGE_TYPE),
      encoding: definition.protocol?.encoding || 'json',
      maxPayloadSize: definition.protocol?.maxPayloadSize || 1024 * 1024,
      ...definition.protocol
    };
    this.resources = {
      maxConcurrent: definition.resources?.maxConcurrent || 10,
      timeoutMs: definition.resources?.timeoutMs || 30000,
      memoryLimitMB: definition.resources?.memoryLimitMB || 512,
      ...definition.resources
    };
    this.endpoints = definition.endpoints || {};
    this.metadata = definition.metadata || {};
    this.registeredAt = new Date().toISOString();
  }

  /**
   * 检查是否支持某能力
   */
  hasCapability(cap) {
    return this.capabilities.includes(cap);
  }

  /**
   * 序列化
   */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      version: this.version,
      description: this.description,
      capabilities: this.capabilities,
      protocol: this.protocol,
      resources: this.resources,
      endpoints: this.endpoints,
      metadata: this.metadata,
      registeredAt: this.registeredAt
    };
  }

  /**
   * 从 JSON 反序列化
   */
  static fromJSON(json) {
    return new AgentManifest(json);
  }
}

// ============================================================
// ProtocolAdapter
// ============================================================

class ProtocolAdapter {
  /**
   * @param {string} id           - Adapter ID
   * @param {Object} options
   * @param {Function} options.serialize    - 序列化函数 (msg) => raw
   * @param {Function} options.deserialize  - 反序列化函数 (raw) => msg
   * @param {Function} options.transform    - 消息转换函数 (msg) => msg
   */
  constructor(id, options = {}) {
    this.id = id;
    this.status = ADAPTER_STATUS.REGISTERED;
    this.serialize = options.serialize || JSON.stringify;
    this.deserialize = options.deserialize || JSON.parse;
    this.transform = options.transform || (msg => msg);
    this.stats = { messagesIn: 0, messagesOut: 0, errors: 0 };
    this.createdAt = new Date().toISOString();
  }

  /**
   * 入站消息 — 外部协议 → UCI
   */
  inbound(rawMessage) {
    try {
      const parsed = typeof rawMessage === 'string' ? this.deserialize(rawMessage) : rawMessage;
      const uciMessage = this.transform(parsed);
      this.stats.messagesIn++;
      return { success: true, message: uciMessage };
    } catch (error) {
      this.stats.errors++;
      return { success: false, error: error.message };
    }
  }

  /**
   * 出站消息 — UCI → 外部协议
   */
  outbound(uciMessage) {
    try {
      const transformed = this.transform(uciMessage);
      const raw = this.serialize(transformed);
      this.stats.messagesOut++;
      return { success: true, raw };
    } catch (error) {
      this.stats.errors++;
      return { success: false, error: error.message };
    }
  }
}

// ============================================================
// UnifiedProtocol（协议管理器）
// ============================================================

class UnifiedProtocol {
  /**
   * @param {Object} options
   * @param {Object} options.logger
   */
  constructor(options = {}) {
    this.logger = options.logger || createLogger({ name: 'unified-protocol' });

    // 注册的 Manifest
    this.manifests = new Map();
    // 注册的 Adapter
    this.adapters = new Map();
    // 消息处理器
    this.handlers = new Map();
    // 消息队列
    this.messageQueue = [];
    // 消息历史
    this.messageHistory = [];
    // 路由表: target → handler
    this.routes = new Map();
    // 中间件
    this.middlewares = [];
  }

  // ----------------------------------------------------------
  // Manifest 管理
  // ----------------------------------------------------------

  /**
   * 注册 Agent Manifest
   */
  registerManifest(manifest) {
    if (!(manifest instanceof AgentManifest)) {
      manifest = new AgentManifest(manifest);
    }
    this.manifests.set(manifest.id, manifest);
    this.logger.info({ agentId: manifest.id, name: manifest.name }, 'Manifest registered');
    return manifest;
  }

  /**
   * 获取 Manifest
   */
  getManifest(agentId) {
    return this.manifests.get(agentId) || null;
  }

  /**
   * 列出所有 Manifest
   */
  listManifests() {
    return [...this.manifests.values()].map(m => m.toJSON());
  }

  /**
   * 注销 Manifest
   */
  unregisterManifest(agentId) {
    return this.manifests.delete(agentId);
  }

  /**
   * 按能力查找 Agent
   */
  findByCapability(capability) {
    const results = [];
    for (const [, manifest] of this.manifests) {
      if (manifest.hasCapability(capability)) {
        results.push(manifest.toJSON());
      }
    }
    return results;
  }

  // ----------------------------------------------------------
  // Adapter 管理
  // ----------------------------------------------------------

  /**
   * 注册 Adapter
   */
  registerAdapter(id, options = {}) {
    const adapter = new ProtocolAdapter(id, options);
    this.adapters.set(id, adapter);
    this.logger.info({ adapterId: id }, 'Adapter registered');
    return adapter;
  }

  /**
   * 获取 Adapter
   */
  getAdapter(id) {
    return this.adapters.get(id) || null;
  }

  /**
   * 列出 Adapter
   */
  listAdapters() {
    const list = [];
    for (const [id, adapter] of this.adapters) {
      list.push({
        id,
        status: adapter.status,
        stats: { ...adapter.stats },
        createdAt: adapter.createdAt
      });
    }
    return list;
  }

  // ----------------------------------------------------------
  // 消息路由
  // ----------------------------------------------------------

  /**
   * 注册消息处理器
   * @param {string} target    - 目标标识 (agent ID 或 pattern)
   * @param {Function} handler - 处理函数 (message) => response
   */
  registerHandler(target, handler) {
    this.handlers.set(target, handler);
    this.routes.set(target, handler);
  }

  /**
   * 添加中间件
   * @param {Function} middleware - (message, next) => message
   */
  use(middleware) {
    this.middlewares.push(middleware);
  }

  /**
   * 发送消息
   * @param {Object} message - UCI 消息
   * @returns {Object} 路由结果
   */
  send(message) {
    // 验证
    const validation = validateMessage(message);
    if (!validation.valid) {
      return { success: false, error: `Invalid message: ${validation.errors.join(', ')}` };
    }

    // 执行中间件
    let processed = message;
    for (const mw of this.middlewares) {
      processed = mw(processed);
      if (!processed) {
        return { success: false, error: 'Message rejected by middleware' };
      }
    }

    // 记录历史
    this.messageHistory.push({
      id: processed.id,
      type: processed.type,
      source: processed.source,
      target: processed.target,
      timestamp: processed.timestamp
    });
    if (this.messageHistory.length > 1000) {
      this.messageHistory = this.messageHistory.slice(-500);
    }

    // 路由
    const target = processed.target;

    // 精确匹配
    if (this.handlers.has(target)) {
      try {
        const result = this.handlers.get(target)(processed);
        return { success: true, result, routed: true, target };
      } catch (error) {
        return { success: false, error: error.message, target };
      }
    }

    // 广播
    if (target === '*') {
      const results = [];
      for (const [handlerId, handler] of this.handlers) {
        try {
          results.push({ target: handlerId, result: handler(processed) });
        } catch (error) {
          results.push({ target: handlerId, error: error.message });
        }
      }
      return { success: true, broadcast: true, results };
    }

    // 队列（无匹配处理器时）
    this.messageQueue.push(processed);
    return { success: true, queued: true, queueSize: this.messageQueue.length };
  }

  /**
   * 发送请求并等待响应
   */
  request(target, payload, options = {}) {
    const msg = createMessage(MESSAGE_TYPE.REQUEST, payload, {
      source: options.source || 'system',
      target,
      metadata: options.metadata
    });

    return this.send(msg);
  }

  /**
   * 发送事件（无需响应）
   */
  emit(eventName, data, options = {}) {
    const msg = createMessage(MESSAGE_TYPE.EVENT, { event: eventName, data }, {
      source: options.source || 'system',
      target: options.target || '*',
      metadata: options.metadata
    });

    return this.send(msg);
  }

  // ----------------------------------------------------------
  // 消息队列
  // ----------------------------------------------------------

  /**
   * 消费队列消息
   */
  drainQueue(handler) {
    const messages = [...this.messageQueue];
    this.messageQueue = [];
    const results = [];

    for (const msg of messages) {
      try {
        results.push({ id: msg.id, result: handler(msg) });
      } catch (error) {
        results.push({ id: msg.id, error: error.message });
      }
    }

    return results;
  }

  /**
   * 获取队列大小
   */
  getQueueSize() {
    return this.messageQueue.length;
  }

  // ----------------------------------------------------------
  // 协议协商
  // ----------------------------------------------------------

  /**
   * 协议版本协商
   */
  negotiateVersion(requestedVersion) {
    const supported = PROTOCOL_VERSION;
    const [reqMajor] = requestedVersion.split('.').map(Number);
    const [supMajor] = supported.split('.').map(Number);

    if (reqMajor === supMajor) {
      return { compatible: true, version: supported };
    }
    return { compatible: false, supportedVersion: supported, requestedVersion };
  }

  /**
   * 握手
   */
  handshake(agentId, options = {}) {
    const manifest = this.manifests.get(agentId);
    if (!manifest) {
      return { success: false, error: 'Agent not registered' };
    }

    const versionCheck = this.negotiateVersion(options.version || PROTOCOL_VERSION);
    if (!versionCheck.compatible) {
      return { success: false, error: 'Protocol version incompatible', details: versionCheck };
    }

    return {
      success: true,
      agentId,
      protocolVersion: PROTOCOL_VERSION,
      capabilities: manifest.capabilities,
      sessionId: `session_${Date.now()}`
    };
  }

  // ----------------------------------------------------------
  // 统计
  // ----------------------------------------------------------

  getStats() {
    return {
      registeredManifests: this.manifests.size,
      registeredAdapters: this.adapters.size,
      registeredHandlers: this.handlers.size,
      middlewareCount: this.middlewares.length,
      queueSize: this.messageQueue.length,
      messageHistorySize: this.messageHistory.length,
      protocolVersion: PROTOCOL_VERSION
    };
  }
}

// ============================================================
// 导出
// ============================================================

module.exports = {
  UnifiedProtocol,
  AgentManifest,
  ProtocolAdapter,
  MESSAGE_TYPE,
  PROTOCOL_VERSION,
  ADAPTER_STATUS,
  createMessage,
  validateMessage
};
