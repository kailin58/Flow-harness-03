/**
 * output-formatter.js - 统一产出格式
 *
 * 文档要求(P3): 统一产出格式
 *   - 标准输出模板 (JSON/Markdown/HTML/Text)
 *   - 任务报告生成
 *   - 执行摘要格式化
 *   - 自定义模板引擎
 *   - 多格式导出
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

const OUTPUT_FORMAT = {
  JSON: 'json',
  MARKDOWN: 'markdown',
  HTML: 'html',
  TEXT: 'text',
  CSV: 'csv'
};

const REPORT_TYPE = {
  TASK_REPORT: 'task_report',
  EXECUTION_SUMMARY: 'execution_summary',
  ERROR_REPORT: 'error_report',
  METRICS_REPORT: 'metrics_report',
  AUDIT_REPORT: 'audit_report',
  CUSTOM: 'custom'
};

// ============================================================
// OutputFormatter
// ============================================================

class OutputFormatter {
  /**
   * @param {Object} options
   * @param {string} options.defaultFormat  - 默认输出格式
   * @param {string} options.outputDir      - 输出目录
   * @param {Object} options.templates      - 自定义模板
   * @param {Object} options.logger
   */
  constructor(options = {}) {
    this.defaultFormat = options.defaultFormat || OUTPUT_FORMAT.MARKDOWN;
    this.outputDir = options.outputDir || path.join(process.cwd(), '.flowharness', 'reports');
    this.logger = options.logger || createLogger({ name: 'output-formatter' });

    // 自定义模板
    this.templates = new Map();

    // 内置模板
    this._registerBuiltinTemplates();

    // 注册用户模板
    if (options.templates) {
      for (const [name, tmpl] of Object.entries(options.templates)) {
        this.templates.set(name, tmpl);
      }
    }
  }

  // ----------------------------------------------------------
  // 模板管理
  // ----------------------------------------------------------

  _registerBuiltinTemplates() {
    this.templates.set('task_report', {
      title: 'Task Report',
      sections: ['header', 'summary', 'details', 'timeline', 'footer']
    });
    this.templates.set('execution_summary', {
      title: 'Execution Summary',
      sections: ['header', 'overview', 'results', 'errors', 'metrics', 'footer']
    });
    this.templates.set('error_report', {
      title: 'Error Report',
      sections: ['header', 'errors', 'stack_traces', 'recommendations', 'footer']
    });
  }

  /**
   * 注册自定义模板
   */
  registerTemplate(name, template) {
    this.templates.set(name, template);
  }

  /**
   * 获取模板
   */
  getTemplate(name) {
    return this.templates.get(name) || null;
  }

  /**
   * 列出模板
   */
  listTemplates() {
    return [...this.templates.keys()];
  }

  // ----------------------------------------------------------
  // 格式化核心
  // ----------------------------------------------------------

  /**
   * 格式化数据
   * @param {Object} data       - 数据
   * @param {string} format     - 输出格式
   * @param {Object} options    - 格式选项
   * @returns {string} 格式化后的字符串
   */
  format(data, format, options = {}) {
    format = format || this.defaultFormat;

    switch (format) {
      case OUTPUT_FORMAT.JSON:
        return this._formatJSON(data, options);
      case OUTPUT_FORMAT.MARKDOWN:
        return this._formatMarkdown(data, options);
      case OUTPUT_FORMAT.HTML:
        return this._formatHTML(data, options);
      case OUTPUT_FORMAT.TEXT:
        return this._formatText(data, options);
      case OUTPUT_FORMAT.CSV:
        return this._formatCSV(data, options);
      default:
        return JSON.stringify(data, null, 2);
    }
  }

  _formatJSON(data, options = {}) {
    const indent = options.indent !== undefined ? options.indent : 2;
    return JSON.stringify(data, null, indent);
  }

  _formatMarkdown(data, options = {}) {
    const lines = [];
    const title = options.title || data.title || 'Report';

    lines.push(`# ${title}`);
    lines.push('');
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push('');

    // 递归渲染数据
    this._renderMarkdownObject(data, lines, 2);

    return lines.join('\n');
  }

  _renderMarkdownObject(obj, lines, depth) {
    const headingPrefix = '#'.repeat(Math.min(depth, 6));

    for (const [key, value] of Object.entries(obj)) {
      if (key === 'title') continue; // 已经用了

      const label = this._humanize(key);

      if (value === null || value === undefined) {
        lines.push(`**${label}:** —`);
      } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        lines.push(`**${label}:** ${value}`);
      } else if (Array.isArray(value)) {
        lines.push('');
        lines.push(`${headingPrefix} ${label}`);
        lines.push('');
        if (value.length === 0) {
          lines.push('*No items*');
        } else if (typeof value[0] === 'object') {
          // 表格
          const table = this._arrayToMarkdownTable(value);
          lines.push(table);
        } else {
          for (const item of value) {
            lines.push(`- ${item}`);
          }
        }
      } else if (typeof value === 'object') {
        lines.push('');
        lines.push(`${headingPrefix} ${label}`);
        lines.push('');
        this._renderMarkdownObject(value, lines, depth + 1);
      }
      lines.push('');
    }
  }

  _arrayToMarkdownTable(arr) {
    if (arr.length === 0) return '';

    const keys = Object.keys(arr[0]);
    const header = '| ' + keys.map(k => this._humanize(k)).join(' | ') + ' |';
    const separator = '| ' + keys.map(() => '---').join(' | ') + ' |';
    const rows = arr.map(item =>
      '| ' + keys.map(k => String(item[k] !== undefined ? item[k] : '')).join(' | ') + ' |'
    );

    return [header, separator, ...rows].join('\n');
  }

  _formatHTML(data, options = {}) {
    const title = options.title || data.title || 'Report';
    const lines = [];

    lines.push('<!DOCTYPE html>');
    lines.push('<html><head>');
    lines.push(`<title>${title}</title>`);
    lines.push('<style>');
    lines.push('body { font-family: -apple-system, sans-serif; max-width: 900px; margin: 0 auto; padding: 20px; }');
    lines.push('table { border-collapse: collapse; width: 100%; margin: 10px 0; }');
    lines.push('th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }');
    lines.push('th { background: #f5f5f5; }');
    lines.push('.metric { font-size: 1.2em; font-weight: bold; color: #333; }');
    lines.push('.error { color: #d32f2f; }');
    lines.push('.success { color: #388e3c; }');
    lines.push('</style>');
    lines.push('</head><body>');
    lines.push(`<h1>${title}</h1>`);
    lines.push(`<p><em>Generated: ${new Date().toISOString()}</em></p>`);

    this._renderHTMLObject(data, lines, 2);

    lines.push('</body></html>');
    return lines.join('\n');
  }

  _renderHTMLObject(obj, lines, depth) {
    const tag = `h${Math.min(depth, 6)}`;

    for (const [key, value] of Object.entries(obj)) {
      if (key === 'title') continue;
      const label = this._humanize(key);

      if (value === null || value === undefined) {
        lines.push(`<p><strong>${label}:</strong> —</p>`);
      } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        lines.push(`<p><strong>${label}:</strong> ${value}</p>`);
      } else if (Array.isArray(value)) {
        lines.push(`<${tag}>${label}</${tag}>`);
        if (value.length === 0) {
          lines.push('<p><em>No items</em></p>');
        } else if (typeof value[0] === 'object') {
          const keys = Object.keys(value[0]);
          lines.push('<table>');
          lines.push('<tr>' + keys.map(k => `<th>${this._humanize(k)}</th>`).join('') + '</tr>');
          for (const item of value) {
            lines.push('<tr>' + keys.map(k => `<td>${item[k] !== undefined ? item[k] : ''}</td>`).join('') + '</tr>');
          }
          lines.push('</table>');
        } else {
          lines.push('<ul>');
          for (const item of value) {
            lines.push(`<li>${item}</li>`);
          }
          lines.push('</ul>');
        }
      } else if (typeof value === 'object') {
        lines.push(`<${tag}>${label}</${tag}>`);
        this._renderHTMLObject(value, lines, depth + 1);
      }
    }
  }

  _formatText(data, options = {}) {
    const lines = [];
    const title = options.title || data.title || 'Report';
    const width = options.width || 60;

    lines.push('='.repeat(width));
    lines.push(title.toUpperCase());
    lines.push('='.repeat(width));
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push('-'.repeat(width));

    this._renderTextObject(data, lines, 0, width);

    lines.push('='.repeat(width));
    return lines.join('\n');
  }

  _renderTextObject(obj, lines, indent, width) {
    const pad = '  '.repeat(indent);

    for (const [key, value] of Object.entries(obj)) {
      if (key === 'title') continue;
      const label = this._humanize(key);

      if (value === null || value === undefined) {
        lines.push(`${pad}${label}: —`);
      } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        lines.push(`${pad}${label}: ${value}`);
      } else if (Array.isArray(value)) {
        lines.push(`${pad}${label}:`);
        if (value.length === 0) {
          lines.push(`${pad}  (empty)`);
        } else if (typeof value[0] === 'object') {
          for (let i = 0; i < value.length; i++) {
            lines.push(`${pad}  [${i + 1}]`);
            this._renderTextObject(value[i], lines, indent + 2, width);
          }
        } else {
          for (const item of value) {
            lines.push(`${pad}  - ${item}`);
          }
        }
      } else if (typeof value === 'object') {
        lines.push(`${pad}${label}:`);
        this._renderTextObject(value, lines, indent + 1, width);
      }
    }
  }

  _formatCSV(data, options = {}) {
    // 将数据平铺为行
    if (Array.isArray(data)) {
      if (data.length === 0) return '';
      const keys = Object.keys(data[0]);
      const header = keys.map(k => this._csvEscape(k)).join(',');
      const rows = data.map(item =>
        keys.map(k => this._csvEscape(String(item[k] !== undefined ? item[k] : ''))).join(',')
      );
      return [header, ...rows].join('\n');
    }

    // 对象转为 key,value 对
    const rows = ['key,value'];
    this._flattenToCSV(data, '', rows);
    return rows.join('\n');
  }

  _flattenToCSV(obj, prefix, rows) {
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (value === null || value === undefined) {
        rows.push(`${this._csvEscape(fullKey)},`);
      } else if (typeof value === 'object' && !Array.isArray(value)) {
        this._flattenToCSV(value, fullKey, rows);
      } else {
        rows.push(`${this._csvEscape(fullKey)},${this._csvEscape(String(value))}`);
      }
    }
  }

  _csvEscape(str) {
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  // ----------------------------------------------------------
  // 报告生成
  // ----------------------------------------------------------

  /**
   * 生成任务报告
   * @param {Object} taskData - 任务数据
   * @param {string} format   - 输出格式
   * @returns {Object} { content, format }
   */
  generateTaskReport(taskData, format) {
    format = format || this.defaultFormat;

    const report = {
      title: `Task Report: ${taskData.name || taskData.id || 'Unknown'}`,
      summary: {
        taskId: taskData.id,
        name: taskData.name,
        status: taskData.status,
        duration: taskData.duration,
        completedAt: taskData.completedAt || new Date().toISOString()
      },
      results: taskData.results || {},
      errors: taskData.errors || [],
      metrics: taskData.metrics || {}
    };

    return {
      content: this.format(report, format, { title: report.title }),
      format,
      type: REPORT_TYPE.TASK_REPORT
    };
  }

  /**
   * 生成执行摘要
   * @param {Object} executionData
   * @param {string} format
   */
  generateExecutionSummary(executionData, format) {
    format = format || this.defaultFormat;

    const summary = {
      title: 'Execution Summary',
      overview: {
        totalTasks: executionData.totalTasks || 0,
        successful: executionData.successful || 0,
        failed: executionData.failed || 0,
        skipped: executionData.skipped || 0,
        totalDuration: executionData.totalDuration || '0ms',
        startedAt: executionData.startedAt || '',
        completedAt: executionData.completedAt || ''
      },
      taskResults: executionData.tasks || [],
      errorSummary: executionData.errors || [],
      metrics: executionData.metrics || {}
    };

    return {
      content: this.format(summary, format, { title: summary.title }),
      format,
      type: REPORT_TYPE.EXECUTION_SUMMARY
    };
  }

  // ----------------------------------------------------------
  // 文件导出
  // ----------------------------------------------------------

  /**
   * 导出到文件
   * @param {string} content   - 内容
   * @param {string} filename  - 文件名
   * @param {string} format    - 格式 (用于扩展名)
   * @returns {string} 文件路径
   */
  exportToFile(content, filename, format) {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    const ext = this._getExtension(format || this.defaultFormat);
    const fullName = filename.endsWith(ext) ? filename : `${filename}${ext}`;
    const filePath = path.join(this.outputDir, fullName);

    fs.writeFileSync(filePath, content, 'utf8');
    this.logger.info({ path: filePath }, 'Report exported');

    return filePath;
  }

  /**
   * 多格式导出
   * @param {Object} data      - 数据
   * @param {string} basename  - 基础文件名
   * @param {string[]} formats - 格式列表
   * @returns {Object[]} 导出结果
   */
  exportMultiFormat(data, basename, formats, options = {}) {
    const results = [];

    for (const format of formats) {
      const content = this.format(data, format, options);
      const filePath = this.exportToFile(content, basename, format);
      results.push({ format, path: filePath, size: content.length });
    }

    return results;
  }

  _getExtension(format) {
    switch (format) {
      case OUTPUT_FORMAT.JSON: return '.json';
      case OUTPUT_FORMAT.MARKDOWN: return '.md';
      case OUTPUT_FORMAT.HTML: return '.html';
      case OUTPUT_FORMAT.TEXT: return '.txt';
      case OUTPUT_FORMAT.CSV: return '.csv';
      default: return '.txt';
    }
  }

  // ----------------------------------------------------------
  // 工具方法
  // ----------------------------------------------------------

  _humanize(str) {
    return str
      .replace(/([A-Z])/g, ' $1')
      .replace(/[_-]/g, ' ')
      .replace(/^\s/, '')
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }

  // ----------------------------------------------------------
  // 统计
  // ----------------------------------------------------------

  getStats() {
    return {
      defaultFormat: this.defaultFormat,
      outputDir: this.outputDir,
      templateCount: this.templates.size,
      templates: [...this.templates.keys()],
      supportedFormats: Object.values(OUTPUT_FORMAT)
    };
  }
}

// ============================================================
// 导出
// ============================================================

module.exports = {
  OutputFormatter,
  OUTPUT_FORMAT,
  REPORT_TYPE
};
