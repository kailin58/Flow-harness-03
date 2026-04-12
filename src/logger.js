/**
 * logger.js - 结构化日志模块
 *
 * 文档要求：替换 console.log 为结构化日志（Pino JSON 格式）
 * 本模块提供 Pino 兼容的 API，内置轻量实现（无外部依赖）
 * 如需生产级性能，可安装 pino 并设置 USE_PINO=true
 *
 * @version 1.0.0
 * @date 2026-04-13
 */

// ============================================================
// 日志级别
// ============================================================

const LOG_LEVELS = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60
};

const LEVEL_NAMES = Object.fromEntries(
  Object.entries(LOG_LEVELS).map(([name, num]) => [num, name])
);

// 控制台颜色（开发环境 pretty print）
const LEVEL_COLORS = {
  trace: '\x1b[90m',   // 灰色
  debug: '\x1b[36m',   // 青色
  info: '\x1b[32m',    // 绿色
  warn: '\x1b[33m',    // 黄色
  error: '\x1b[31m',   // 红色
  fatal: '\x1b[35m'    // 紫色
};

const RESET_COLOR = '\x1b[0m';

// ============================================================
// Logger - 结构化日志器
// ============================================================

class Logger {
  /**
   * @param {Object} options
   * @param {string} options.name       - 日志器名称（通常是组件名）
   * @param {string} options.level      - 最小日志级别 (trace/debug/info/warn/error/fatal)
   * @param {boolean} options.pretty    - 是否启用 pretty print（默认开发环境自动）
   * @param {string} options.traceId    - 追踪 ID
   * @param {string} options.spanId     - Span ID
   * @param {Object} options.bindings   - 固定附加字段
   * @param {WritableStream} options.destination - 输出目标（默认 stdout）
   */
  constructor(options = {}) {
    this.name = options.name || 'flow-harness';
    this.levelName = options.level || process.env.LOG_LEVEL || 'info';
    this.levelValue = LOG_LEVELS[this.levelName] || LOG_LEVELS.info;
    this.pretty = options.pretty !== undefined
      ? options.pretty
      : process.env.NODE_ENV !== 'production';
    this.traceId = options.traceId || null;
    this.spanId = options.spanId || null;
    this.bindings = options.bindings || {};
    this.destination = options.destination || process.stdout;

    // 性能：批量写入缓冲（生产模式）
    this._buffer = [];
    this._bufferSize = 0;
    this._maxBufferSize = options.bufferSize || 4096;
    this._flushInterval = null;

    if (!this.pretty) {
      // 生产模式：每秒刷新一次缓冲
      this._flushInterval = setInterval(() => this._flush(), 1000);
      if (this._flushInterval.unref) {
        this._flushInterval.unref(); // 不阻止进程退出
      }
    }
  }

  // ----------------------------------------------------------
  // 日志方法
  // ----------------------------------------------------------

  trace(msgOrObj, ...args) { this._log('trace', msgOrObj, args); }
  debug(msgOrObj, ...args) { this._log('debug', msgOrObj, args); }
  info(msgOrObj, ...args)  { this._log('info', msgOrObj, args); }
  warn(msgOrObj, ...args)  { this._log('warn', msgOrObj, args); }
  error(msgOrObj, ...args) { this._log('error', msgOrObj, args); }
  fatal(msgOrObj, ...args) { this._log('fatal', msgOrObj, args); }

  // ----------------------------------------------------------
  // Child Logger（子组件日志器）
  // ----------------------------------------------------------

  /**
   * 创建子日志器，继承父级配置并添加额外绑定
   * @param {Object} bindings - 子日志器附加字段
   * @returns {Logger}
   */
  child(bindings = {}) {
    return new Logger({
      name: this.name,
      level: this.levelName,
      pretty: this.pretty,
      traceId: this.traceId,
      spanId: this.spanId,
      bindings: { ...this.bindings, ...bindings },
      destination: this.destination
    });
  }

  // ----------------------------------------------------------
  // Trace / Span 管理
  // ----------------------------------------------------------

  /**
   * 设置追踪上下文
   */
  setTrace(traceId, spanId = null) {
    this.traceId = traceId;
    this.spanId = spanId;
  }

  /**
   * 创建新 Span
   */
  startSpan(spanName) {
    const spanId = `span_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    this.info({ span: spanName, spanId, event: 'span_start' }, `Span started: ${spanName}`);
    return {
      id: spanId,
      name: spanName,
      startTime: Date.now(),
      end: () => {
        const duration = Date.now() - Date.now();
        this.info(
          { span: spanName, spanId, event: 'span_end', durationMs: Date.now() - this._getSpanStart(spanId) },
          `Span ended: ${spanName}`
        );
      },
      _startTime: Date.now()
    };
  }

  // ----------------------------------------------------------
  // 设置与控制
  // ----------------------------------------------------------

  /**
   * 动态调整日志级别
   */
  setLevel(level) {
    if (LOG_LEVELS[level] !== undefined) {
      this.levelName = level;
      this.levelValue = LOG_LEVELS[level];
    }
  }

  /**
   * 检查某级别是否启用
   */
  isLevelEnabled(level) {
    return (LOG_LEVELS[level] || 0) >= this.levelValue;
  }

  /**
   * 刷新缓冲并关闭
   */
  close() {
    this._flush();
    if (this._flushInterval) {
      clearInterval(this._flushInterval);
      this._flushInterval = null;
    }
  }

  // ----------------------------------------------------------
  // 内部方法
  // ----------------------------------------------------------

  _log(level, msgOrObj, args) {
    const levelValue = LOG_LEVELS[level];
    if (levelValue < this.levelValue) return;

    // 构建日志对象
    let msg = '';
    let extra = {};

    if (typeof msgOrObj === 'string') {
      msg = msgOrObj;
    } else if (typeof msgOrObj === 'object' && msgOrObj !== null) {
      extra = msgOrObj;
      msg = args.length > 0 ? args[0] : '';
      args = args.slice(1);
    }

    // 格式化字符串参数（类似 util.format）
    if (args.length > 0 && typeof msg === 'string') {
      let i = 0;
      msg = msg.replace(/%[sdjo%]/g, (match) => {
        if (match === '%%') return '%';
        if (i >= args.length) return match;
        const arg = args[i++];
        switch (match) {
          case '%s': return String(arg);
          case '%d': return Number(arg);
          case '%j': return JSON.stringify(arg);
          case '%o': return JSON.stringify(arg);
          default: return match;
        }
      });
    }

    const logEntry = {
      level: levelValue,
      time: Date.now(),
      name: this.name,
      msg,
      ...this.bindings,
      ...extra
    };

    // 添加追踪信息
    if (this.traceId) logEntry.traceId = this.traceId;
    if (this.spanId) logEntry.spanId = this.spanId;

    // 输出
    if (this.pretty) {
      this._prettyPrint(level, logEntry);
    } else {
      this._jsonPrint(logEntry);
    }
  }

  _prettyPrint(level, entry) {
    const color = LEVEL_COLORS[level] || '';
    const time = new Date(entry.time).toISOString().substring(11, 23);
    const component = entry.component ? `[${entry.component}]` : `[${entry.name}]`;

    // 提取额外字段
    const extraFields = { ...entry };
    delete extraFields.level;
    delete extraFields.time;
    delete extraFields.name;
    delete extraFields.msg;
    delete extraFields.component;

    let extraStr = '';
    const keys = Object.keys(extraFields);
    if (keys.length > 0) {
      const simplified = {};
      for (const k of keys) {
        if (extraFields[k] !== undefined && extraFields[k] !== null) {
          simplified[k] = extraFields[k];
        }
      }
      if (Object.keys(simplified).length > 0) {
        extraStr = ` ${JSON.stringify(simplified)}`;
      }
    }

    const output = `${color}${time} ${level.toUpperCase().padEnd(5)}${RESET_COLOR} ${component} ${entry.msg}${extraStr}\n`;
    this.destination.write(output);
  }

  _jsonPrint(entry) {
    const line = JSON.stringify(entry) + '\n';

    if (this._maxBufferSize > 0) {
      this._buffer.push(line);
      this._bufferSize += line.length;

      if (this._bufferSize >= this._maxBufferSize) {
        this._flush();
      }
    } else {
      this.destination.write(line);
    }
  }

  _flush() {
    if (this._buffer.length === 0) return;
    const output = this._buffer.join('');
    this._buffer = [];
    this._bufferSize = 0;
    this.destination.write(output);
  }

  _getSpanStart(spanId) {
    // 简单实现，从 spanId 中提取时间戳
    const parts = spanId.split('_');
    return parts.length >= 2 ? parseInt(parts[1]) : Date.now();
  }
}

// ============================================================
// 工厂方法 - 创建预配置的日志器
// ============================================================

/**
 * 创建默认日志器
 */
function createLogger(options = {}) {
  return new Logger(options);
}

/**
 * 为各组件创建子日志器的工厂
 */
function createComponentLoggers(parentLogger = null) {
  const root = parentLogger || createLogger({ name: 'flow-harness' });

  return {
    root,
    supervisor: root.child({ component: 'supervisor' }),
    taskAnalyzer: root.child({ component: 'task-analyzer' }),
    taskDecomposer: root.child({ component: 'task-decomposer' }),
    taskDispatcher: root.child({ component: 'task-dispatcher' }),
    agentExecutor: root.child({ component: 'agent-executor' }),
    inspector: root.child({ component: 'inspector' }),
    policyChecker: root.child({ component: 'policy-checker' }),
    memoryStore: root.child({ component: 'memory-store' }),
    knowledgeBase: root.child({ component: 'knowledge-base' }),
    executionMonitor: root.child({ component: 'execution-monitor' }),
    deviationDetector: root.child({ component: 'deviation-detector' }),
    qualityGate: root.child({ component: 'quality-gate' }),
    autoRetry: root.child({ component: 'auto-retry' }),
    healthCheck: root.child({ component: 'health-check' }),
    agentsParser: root.child({ component: 'agents-parser' }),
    rolePermission: root.child({ component: 'role-permission' })
  };
}

// ============================================================
// 导出
// ============================================================

module.exports = {
  Logger,
  createLogger,
  createComponentLoggers,
  LOG_LEVELS,
  LEVEL_NAMES
};
