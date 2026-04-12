'use strict';

const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const { createLogger } = require('./logger');

/**
 * 默认配置常量
 */
const DEFAULTS = {
  MAX_AUDIT_LOG_ENTRIES: 500  // 最大审计日志条目数
};

class FileOperator {
  constructor(options = {}) {
    this.logger = createLogger({ name: 'file-operator' });
    this.policyChecker = options.policyChecker || null;
    this.rootDir = options.rootDir || process.cwd();
    this.auditLog = [];
  }

  async read(filePath) {
    const resolvedPath = this._resolve(filePath);

    if (this.policyChecker) {
      const check = this.policyChecker.checkFileAccess
        ? this.policyChecker.checkFileAccess(resolvedPath)
        : this.policyChecker.checkFile?.(resolvedPath, 'read')
          || { allowed: true };

      if (check && !check.allowed) {
        this._audit('read', resolvedPath, false, check.reason || 'policy denied');
        throw new Error(`Policy denied read: ${filePath}`);
      }
    }

    try {
      const content = await fsp.readFile(resolvedPath, 'utf8');
      this._audit('read', resolvedPath, true);
      return content;
    } catch (err) {
      if (err.code === 'ENOENT') throw new Error(`File not found: ${filePath}`);
      throw err;
    }
  }

  async write(filePath, content) {
    const resolvedPath = this._resolve(filePath);

    if (this.policyChecker) {
      const check = this.policyChecker.checkFileAccess
        ? this.policyChecker.checkFileAccess(resolvedPath)
        : this.policyChecker.checkFile?.(resolvedPath, 'write')
          || { allowed: true };

      if (check && !check.allowed) {
        this._audit('write', resolvedPath, false, check.reason || 'policy denied');
        throw new Error(`Policy denied write: ${filePath}`);
      }
    }

    const dir = path.dirname(resolvedPath);
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(resolvedPath, content, 'utf8');
    this._audit('write', resolvedPath, true);
    return { written: resolvedPath, size: content.length };
  }

  async search(pattern, options = {}) {
    const baseDir = options.baseDir || this.rootDir;
    const ignore = options.ignore || ['node_modules/**', '.flowharness/knowledge/**', 'dist/**'];

    try {
      const { glob } = require('glob');
      const results = await glob(pattern, { cwd: baseDir, ignore });
      return results.map(f => path.join(baseDir, f));
    } catch (err) {
      this.logger.warn({ err, pattern }, 'file search failed');
      return [];
    }
  }

  async exists(filePath) {
    try {
      await fsp.access(this._resolve(filePath));
      return true;
    } catch {
      return false;
    }
  }

  getAuditLog() {
    return [...this.auditLog];
  }

  _resolve(filePath) {
    if (path.isAbsolute(filePath)) return filePath;
    return path.join(this.rootDir, filePath);
  }

  _audit(operation, filePath, success, reason) {
    this.auditLog.push({
      timestamp: new Date().toISOString(),
      operation,
      path: filePath,
      success,
      reason: reason || null
    });

    if (this.auditLog.length > DEFAULTS.MAX_AUDIT_LOG_ENTRIES) {
      this.auditLog = this.auditLog.slice(-DEFAULTS.MAX_AUDIT_LOG_ENTRIES);
    }
  }
}

module.exports = { FileOperator };
