/**
 * metrics-collector.js - Prometheus 格式指标收集
 *
 * 文档要求(P2): 可观测性增强
 *   - Counter / Gauge / Histogram / Summary 四种指标类型
 *   - Prometheus exposition format 输出
 *   - 自动收集：任务、错误、延迟、Token
 *   - 指标聚合与时间窗口
 *   - 自定义指标注册
 *   - HTTP endpoint 暴露 (/metrics)
 *
 * @version 1.0.0
 * @date 2026-04-13
 */

const { createLogger } = require('./logger');

// ============================================================
// 常量
// ============================================================

const METRIC_TYPE = {
  COUNTER: 'counter',
  GAUGE: 'gauge',
  HISTOGRAM: 'histogram',
  SUMMARY: 'summary'
};

// 默认 Histogram 桶
const DEFAULT_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60];

// 默认 Summary 分位数
const DEFAULT_QUANTILES = [0.5, 0.9, 0.95, 0.99];

// ============================================================
// MetricsCollector
// ============================================================

class MetricsCollector {
  /**
   * @param {Object} options
   * @param {string} options.prefix          - 指标名称前缀
   * @param {Object} options.defaultLabels   - 全局默认标签
   * @param {number} options.maxAge          - Summary 最大数据保留时间(ms)
   * @param {Object} options.logger
   */
  constructor(options = {}) {
    this.prefix = options.prefix || 'flowharness';
    this.defaultLabels = options.defaultLabels || {};
    this.maxAge = options.maxAge || 10 * 60 * 1000; // 10min
    this.logger = options.logger || createLogger({ name: 'metrics-collector' });

    // 已注册的指标
    this.metrics = new Map();

    // 注册内置指标
    this._registerBuiltins();
  }

  // ----------------------------------------------------------
  // 指标注册
  // ----------------------------------------------------------

  /**
   * 注册 Counter
   * @param {string} name - 指标名
   * @param {string} help - 说明
   * @param {string[]} labelNames - 标签名列表
   */
  registerCounter(name, help, labelNames = []) {
    const fullName = `${this.prefix}_${name}`;
    this.metrics.set(fullName, {
      type: METRIC_TYPE.COUNTER,
      name: fullName,
      help,
      labelNames,
      values: new Map() // labelKey → value
    });
    return fullName;
  }

  /**
   * 注册 Gauge
   */
  registerGauge(name, help, labelNames = []) {
    const fullName = `${this.prefix}_${name}`;
    this.metrics.set(fullName, {
      type: METRIC_TYPE.GAUGE,
      name: fullName,
      help,
      labelNames,
      values: new Map()
    });
    return fullName;
  }

  /**
   * 注册 Histogram
   * @param {number[]} buckets - 桶边界
   */
  registerHistogram(name, help, labelNames = [], buckets = DEFAULT_BUCKETS) {
    const fullName = `${this.prefix}_${name}`;
    this.metrics.set(fullName, {
      type: METRIC_TYPE.HISTOGRAM,
      name: fullName,
      help,
      labelNames,
      buckets: [...buckets].sort((a, b) => a - b),
      values: new Map() // labelKey → { buckets: [], sum, count }
    });
    return fullName;
  }

  /**
   * 注册 Summary
   * @param {number[]} quantiles - 分位数列表
   */
  registerSummary(name, help, labelNames = [], quantiles = DEFAULT_QUANTILES) {
    const fullName = `${this.prefix}_${name}`;
    this.metrics.set(fullName, {
      type: METRIC_TYPE.SUMMARY,
      name: fullName,
      help,
      labelNames,
      quantiles,
      values: new Map() // labelKey → { observations: [], sum, count }
    });
    return fullName;
  }

  // ----------------------------------------------------------
  // 指标操作
  // ----------------------------------------------------------

  /**
   * Counter 递增
   */
  inc(name, labels = {}, value = 1) {
    const metric = this.metrics.get(name);
    if (!metric || metric.type !== METRIC_TYPE.COUNTER) return;

    const key = this._labelKey(labels);
    const current = metric.values.get(key) || { labels, value: 0 };
    current.value += value;
    current.labels = labels;
    metric.values.set(key, current);
  }

  /**
   * Gauge 设置
   */
  set(name, labels = {}, value) {
    const metric = this.metrics.get(name);
    if (!metric || metric.type !== METRIC_TYPE.GAUGE) return;

    const key = this._labelKey(labels);
    metric.values.set(key, { labels, value });
  }

  /**
   * Gauge 递增
   */
  gaugeInc(name, labels = {}, value = 1) {
    const metric = this.metrics.get(name);
    if (!metric || metric.type !== METRIC_TYPE.GAUGE) return;

    const key = this._labelKey(labels);
    const current = metric.values.get(key) || { labels, value: 0 };
    current.value += value;
    current.labels = labels;
    metric.values.set(key, current);
  }

  /**
   * Gauge 递减
   */
  gaugeDec(name, labels = {}, value = 1) {
    this.gaugeInc(name, labels, -value);
  }

  /**
   * Histogram 观测
   */
  observe(name, labels = {}, value) {
    const metric = this.metrics.get(name);
    if (!metric) return;

    if (metric.type === METRIC_TYPE.HISTOGRAM) {
      this._observeHistogram(metric, labels, value);
    } else if (metric.type === METRIC_TYPE.SUMMARY) {
      this._observeSummary(metric, labels, value);
    }
  }

  _observeHistogram(metric, labels, value) {
    const key = this._labelKey(labels);
    let entry = metric.values.get(key);
    if (!entry) {
      entry = {
        labels,
        bucketCounts: new Array(metric.buckets.length + 1).fill(0), // +1 for +Inf
        sum: 0,
        count: 0
      };
      metric.values.set(key, entry);
    }

    entry.sum += value;
    entry.count++;

    for (let i = 0; i < metric.buckets.length; i++) {
      if (value <= metric.buckets[i]) {
        entry.bucketCounts[i]++;
      }
    }
    entry.bucketCounts[metric.buckets.length]++; // +Inf always increments
  }

  _observeSummary(metric, labels, value) {
    const key = this._labelKey(labels);
    let entry = metric.values.get(key);
    if (!entry) {
      entry = {
        labels,
        observations: [],
        sum: 0,
        count: 0
      };
      metric.values.set(key, entry);
    }

    const now = Date.now();
    entry.observations.push({ value, time: now });
    entry.sum += value;
    entry.count++;

    // 清理过期观测值
    const cutoff = now - this.maxAge;
    entry.observations = entry.observations.filter(o => o.time >= cutoff);
  }

  // ----------------------------------------------------------
  // 内置指标注册
  // ----------------------------------------------------------

  _registerBuiltins() {
    // 任务指标
    this.registerCounter('tasks_total', 'Total number of tasks processed', ['status', 'type']);
    this.registerHistogram('task_duration_seconds', 'Task execution duration in seconds', ['type'], DEFAULT_BUCKETS);
    this.registerGauge('tasks_active', 'Number of currently active tasks', ['type']);

    // 错误指标
    this.registerCounter('errors_total', 'Total number of errors', ['type', 'severity']);

    // Token 指标
    this.registerCounter('tokens_total', 'Total tokens consumed', ['model', 'direction']);
    this.registerCounter('token_cost_dollars', 'Total token cost in dollars', ['model']);

    // 模型指标
    this.registerHistogram('model_latency_seconds', 'Model response latency in seconds', ['model'], DEFAULT_BUCKETS);
    this.registerCounter('model_requests_total', 'Total model API requests', ['model', 'status']);

    // 系统指标
    this.registerGauge('memory_usage_bytes', 'Process memory usage in bytes', ['type']);
    this.registerGauge('uptime_seconds', 'Process uptime in seconds');
  }

  // ----------------------------------------------------------
  // 便捷方法
  // ----------------------------------------------------------

  /**
   * 记录任务完成
   */
  recordTask(type, status, durationMs) {
    const prefix = this.prefix;
    this.inc(`${prefix}_tasks_total`, { status, type });
    if (durationMs !== undefined) {
      this.observe(`${prefix}_task_duration_seconds`, { type }, durationMs / 1000);
    }
  }

  /**
   * 记录错误
   */
  recordError(type, severity = 'error') {
    this.inc(`${this.prefix}_errors_total`, { type, severity });
  }

  /**
   * 记录 Token 用量
   */
  recordTokens(model, inputTokens, outputTokens, cost = 0) {
    const prefix = this.prefix;
    this.inc(`${prefix}_tokens_total`, { model, direction: 'input' }, inputTokens);
    this.inc(`${prefix}_tokens_total`, { model, direction: 'output' }, outputTokens);
    if (cost > 0) {
      this.inc(`${prefix}_token_cost_dollars`, { model }, cost);
    }
  }

  /**
   * 记录模型延迟
   */
  recordModelLatency(model, latencyMs, success = true) {
    const prefix = this.prefix;
    this.observe(`${prefix}_model_latency_seconds`, { model }, latencyMs / 1000);
    this.inc(`${prefix}_model_requests_total`, { model, status: success ? 'success' : 'error' });
  }

  /**
   * 更新系统指标
   */
  updateSystemMetrics() {
    const prefix = this.prefix;
    const mem = process.memoryUsage();
    this.set(`${prefix}_memory_usage_bytes`, { type: 'rss' }, mem.rss);
    this.set(`${prefix}_memory_usage_bytes`, { type: 'heapUsed' }, mem.heapUsed);
    this.set(`${prefix}_memory_usage_bytes`, { type: 'heapTotal' }, mem.heapTotal);
    this.set(`${prefix}_uptime_seconds`, {}, process.uptime());
  }

  // ----------------------------------------------------------
  // Prometheus Exposition Format 输出
  // ----------------------------------------------------------

  /**
   * 生成 Prometheus exposition format 文本
   * @returns {string}
   */
  toPrometheus() {
    const lines = [];

    for (const [, metric] of this.metrics) {
      // HELP 和 TYPE
      lines.push(`# HELP ${metric.name} ${metric.help}`);
      lines.push(`# TYPE ${metric.name} ${metric.type}`);

      switch (metric.type) {
        case METRIC_TYPE.COUNTER:
        case METRIC_TYPE.GAUGE:
          for (const [, entry] of metric.values) {
            const labelStr = this._formatLabels({ ...this.defaultLabels, ...entry.labels });
            lines.push(`${metric.name}${labelStr} ${entry.value}`);
          }
          // 如果没有值，输出默认 0
          if (metric.values.size === 0) {
            const labelStr = this._formatLabels(this.defaultLabels);
            lines.push(`${metric.name}${labelStr} 0`);
          }
          break;

        case METRIC_TYPE.HISTOGRAM:
          for (const [, entry] of metric.values) {
            const baseLabels = { ...this.defaultLabels, ...entry.labels };
            // 桶
            for (let i = 0; i < metric.buckets.length; i++) {
              const bucketLabels = { ...baseLabels, le: String(metric.buckets[i]) };
              lines.push(`${metric.name}_bucket${this._formatLabels(bucketLabels)} ${entry.bucketCounts[i]}`);
            }
            // +Inf
            const infLabels = { ...baseLabels, le: '+Inf' };
            lines.push(`${metric.name}_bucket${this._formatLabels(infLabels)} ${entry.bucketCounts[metric.buckets.length]}`);
            // sum & count
            const labelStr = this._formatLabels(baseLabels);
            lines.push(`${metric.name}_sum${labelStr} ${entry.sum}`);
            lines.push(`${metric.name}_count${labelStr} ${entry.count}`);
          }
          break;

        case METRIC_TYPE.SUMMARY:
          for (const [, entry] of metric.values) {
            const baseLabels = { ...this.defaultLabels, ...entry.labels };
            // 分位数
            const sorted = entry.observations.map(o => o.value).sort((a, b) => a - b);
            for (const q of metric.quantiles) {
              const idx = Math.ceil(sorted.length * q) - 1;
              const val = sorted.length > 0 ? sorted[Math.max(0, idx)] : 0;
              const qLabels = { ...baseLabels, quantile: String(q) };
              lines.push(`${metric.name}${this._formatLabels(qLabels)} ${val}`);
            }
            const labelStr = this._formatLabels(baseLabels);
            lines.push(`${metric.name}_sum${labelStr} ${entry.sum}`);
            lines.push(`${metric.name}_count${labelStr} ${entry.count}`);
          }
          break;
      }

      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * 格式化标签
   */
  _formatLabels(labels) {
    const entries = Object.entries(labels);
    if (entries.length === 0) return '';
    const parts = entries.map(([k, v]) => `${k}="${v}"`);
    return `{${parts.join(',')}}`;
  }

  _labelKey(labels) {
    const sorted = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b));
    return sorted.map(([k, v]) => `${k}=${v}`).join(',') || '__default__';
  }

  // ----------------------------------------------------------
  // 查询
  // ----------------------------------------------------------

  /**
   * 获取指标值
   */
  getValue(name, labels = {}) {
    const metric = this.metrics.get(name);
    if (!metric) return null;

    const key = this._labelKey(labels);
    const entry = metric.values.get(key);
    if (!entry) return null;

    if (metric.type === METRIC_TYPE.COUNTER || metric.type === METRIC_TYPE.GAUGE) {
      return entry.value;
    }
    if (metric.type === METRIC_TYPE.HISTOGRAM || metric.type === METRIC_TYPE.SUMMARY) {
      return { sum: entry.sum, count: entry.count };
    }
    return null;
  }

  /**
   * 列出所有指标名
   */
  listMetrics() {
    const list = [];
    for (const [name, metric] of this.metrics) {
      list.push({
        name,
        type: metric.type,
        help: metric.help,
        labelNames: metric.labelNames,
        dataPoints: metric.values.size
      });
    }
    return list;
  }

  /**
   * 获取统计
   */
  getStats() {
    const byType = { counter: 0, gauge: 0, histogram: 0, summary: 0 };
    let totalDataPoints = 0;

    for (const [, metric] of this.metrics) {
      byType[metric.type]++;
      totalDataPoints += metric.values.size;
    }

    return {
      totalMetrics: this.metrics.size,
      byType,
      totalDataPoints,
      prefix: this.prefix
    };
  }

  /**
   * 重置所有指标
   */
  reset() {
    for (const [, metric] of this.metrics) {
      metric.values.clear();
    }
  }

  /**
   * 删除指标
   */
  unregister(name) {
    return this.metrics.delete(name);
  }

  // ----------------------------------------------------------
  // HTTP Endpoint
  // ----------------------------------------------------------

  /**
   * 启动 HTTP metrics 服务端点
   * @param {Object} options
   * @param {number} options.port - 监听端口 (默认 9090)
   * @param {string} options.host - 绑定地址 (默认 127.0.0.1)
   * @param {string} options.path - metrics 路径 (默认 /metrics)
   * @returns {Promise<http.Server>}
   */
  async startHTTPEndpoint(options = {}) {
    const http = require('http');
    const port = options.port || 9090;
    const host = options.host || '127.0.0.1';
    const metricsPath = options.path || '/metrics';

    if (this._httpServer) {
      this.logger.warn('HTTP endpoint already running');
      return this._httpServer;
    }

    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, `http://${req.headers.host}`);

      // Metrics endpoint
      if (url.pathname === metricsPath && req.method === 'GET') {
        try {
          // 更新系统指标
          this.updateSystemMetrics();

          const output = this.toPrometheus();
          res.writeHead(200, {
            'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
            'Cache-Control': 'no-cache'
          });
          res.end(output);
        } catch (error) {
          this.logger.error({ error: error.message }, 'Failed to generate metrics');
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Internal Server Error');
        }
        return;
      }

      // Health check endpoint
      if (url.pathname === '/health' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
        return;
      }

      // Stats endpoint (JSON format)
      if (url.pathname === '/stats' && req.method === 'GET') {
        try {
          const stats = this.getStats();
          const metricsList = this.listMetrics();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ stats, metrics: metricsList }, null, 2));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Internal Server Error');
        }
        return;
      }

      // 404 for other paths
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    });

    return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => {
        server.removeListener('error', reject);
        this._httpServer = server;
        this.logger.info({ port, host, metricsPath }, 'Metrics HTTP endpoint started');
        resolve(server);
      });
    });
  }

  /**
   * 停止 HTTP metrics 服务
   * @returns {Promise<void>}
   */
  async stopHTTPEndpoint() {
    if (!this._httpServer) {
      return;
    }

    return new Promise((resolve, reject) => {
      this._httpServer.close((error) => {
        if (error) {
          reject(error);
        } else {
          this._httpServer = null;
          this.logger.info('Metrics HTTP endpoint stopped');
          resolve();
        }
      });
    });
  }

  /**
   * 检查 HTTP endpoint 是否运行
   * @returns {boolean}
   */
  isHTTPEndpointRunning() {
    return this._httpServer !== null && this._httpServer.listening;
  }

  /**
   * 获取 HTTP endpoint 地址
   * @returns {Object|null} { address, port }
   */
  getHTTPEndpointAddress() {
    if (!this._httpServer || !this._httpServer.listening) {
      return null;
    }
    const addr = this._httpServer.address();
    return {
      address: addr.address,
      port: addr.port
    };
  }
}

// ============================================================
// 导出
// ============================================================

module.exports = {
  MetricsCollector,
  METRIC_TYPE,
  DEFAULT_BUCKETS,
  DEFAULT_QUANTILES
};
