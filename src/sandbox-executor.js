/**
 * sandbox-executor.js - 运行时沙箱执行器
 *
 * 文档要求(P2): 运行时沙箱执行
 *   - 在安全沙箱中执行代码/命令
 *   - 进程隔离与超时控制
 *   - 输出捕获与结果收集
 *   - 资源监控与限制检查
 *   - 与 sandbox-enhanced 安全策略集成
 *   - 执行审计日志
 *
 * @version 1.0.0
 * @date 2026-04-13
 */

const { spawn } = require('child_process');
const path = require('path');
const { createLogger } = require('./logger');

// ============================================================
// 常量
// ============================================================

const EXECUTION_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  TIMEOUT: 'timeout',
  KILLED: 'killed',
  BLOCKED: 'blocked'
};

const EXECUTION_TYPE = {
  COMMAND: 'command',
  SCRIPT: 'script',
  FUNCTION: 'function'
};

// 默认白名单命令 (安全命令)
const DEFAULT_ALLOWED_COMMANDS = [
  'node', 'npm', 'npx', 'git', 'echo', 'cat', 'ls', 'dir',
  'pwd', 'whoami', 'date', 'which', 'where', 'test', 'true', 'false'
];

// 默认黑名单命令 (危险命令)
const DEFAULT_BLOCKED_COMMANDS = [
  'rm', 'rmdir', 'del', 'format', 'shutdown', 'reboot',
  'mkfs', 'dd', 'fdisk', 'passwd', 'sudo', 'su',
  'curl', 'wget', 'ssh', 'scp', 'ftp',
  'kill', 'killall', 'pkill'
];

// ============================================================
// SandboxExecutor
// ============================================================

class SandboxExecutor {
  /**
   * @param {Object} options
   * @param {Object} options.sandboxEnhanced - SandboxEnhanced 实例 (可选, 用于安全策略)
   * @param {number} options.defaultTimeout  - 默认超时 (ms)
   * @param {number} options.maxConcurrent   - 最大并发执行数
   * @param {number} options.maxOutputSize   - 最大输出大小 (bytes)
   * @param {string[]} options.allowedCommands - 允许的命令
   * @param {string[]} options.blockedCommands - 禁止的命令
   * @param {boolean} options.dryRun         - 模拟执行模式
   * @param {Object} options.logger
   */
  constructor(options = {}) {
    this.sandboxEnhanced = options.sandboxEnhanced || null;
    this.defaultTimeout = options.defaultTimeout || 30000;
    this.maxConcurrent = options.maxConcurrent || 5;
    this.maxOutputSize = options.maxOutputSize || 1024 * 1024; // 1MB
    this.allowedCommands = options.allowedCommands || DEFAULT_ALLOWED_COMMANDS;
    this.blockedCommands = options.blockedCommands || DEFAULT_BLOCKED_COMMANDS;
    this.dryRun = options.dryRun || false;
    this.logger = options.logger || createLogger({ name: 'sandbox-executor' });

    // 执行记录
    this.executions = new Map();
    // 活跃进程
    this.activeProcesses = new Map();
    // 执行历史
    this.history = [];
    // 审计日志
    this.auditLog = [];

    // 统计
    this.stats = {
      totalExecutions: 0,
      successful: 0,
      failed: 0,
      timedOut: 0,
      blocked: 0,
      killed: 0
    };
  }

  // ----------------------------------------------------------
  // 命令安全检查
  // ----------------------------------------------------------

  /**
   * 检查命令是否允许执行
   * @param {string} command - 命令
   * @param {string} instanceId - 沙箱实例 ID (可选, 用于 sandboxEnhanced 检查)
   * @returns {Object} { allowed, reason }
   */
  checkCommand(command, instanceId) {
    if (!command || typeof command !== 'string' || command.trim() === '') {
      return { allowed: false, reason: '命令为空' };
    }

    const cmd = command.trim();
    const baseCmd = this._extractBaseCommand(cmd);

    // 检查黑名单
    if (this.blockedCommands.includes(baseCmd)) {
      return { allowed: false, reason: `命令 "${baseCmd}" 在黑名单中` };
    }

    // 检查白名单 (如果有白名单, 则只允许白名单命令)
    if (this.allowedCommands.length > 0 && !this.allowedCommands.includes(baseCmd)) {
      return { allowed: false, reason: `命令 "${baseCmd}" 不在白名单中` };
    }

    // 检查危险模式
    const dangerousPatterns = [
      /;\s*(rm|del|format|shutdown)/i,
      /\|\s*(rm|del|format)/i,
      />\s*\/dev\//i,
      /`[^`]*`/,           // 反引号执行
      /\$\([^)]*\)/,       // 子shell执行
      /&&\s*(rm|del|format|shutdown)/i
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(cmd)) {
        return { allowed: false, reason: `命令包含危险模式: ${pattern.source}` };
      }
    }

    // 如果有 sandboxEnhanced, 检查文件系统/网络策略
    if (this.sandboxEnhanced && instanceId) {
      // 检查命令中引用的文件路径
      const filePaths = this._extractFilePaths(cmd);
      for (const fp of filePaths) {
        const fileCheck = this.sandboxEnhanced.checkFileAccess(instanceId, fp, 'read');
        if (!fileCheck.allowed) {
          return { allowed: false, reason: `文件访问被拒: ${fp} — ${fileCheck.reason}` };
        }
      }
    }

    return { allowed: true, reason: null };
  }

  _extractBaseCommand(cmd) {
    // 提取基础命令 (去掉参数, 处理路径)
    const parts = cmd.split(/\s+/);
    const base = parts[0];
    // 去掉路径前缀
    return path.basename(base).replace(/\.(exe|cmd|bat|sh)$/i, '');
  }

  _extractFilePaths(cmd) {
    const paths = [];
    // 简单提取文件路径 (以 / 或 ./ 或 ../ 或盘符开头)
    const parts = cmd.split(/\s+/);
    for (const part of parts.slice(1)) {
      if (part.startsWith('/') || part.startsWith('./') || part.startsWith('../') ||
          /^[A-Z]:\\/i.test(part) || part.includes('/') || part.includes('\\')) {
        paths.push(part.replace(/["']/g, ''));
      }
    }
    return paths;
  }

  // ----------------------------------------------------------
  // 执行引擎
  // ----------------------------------------------------------

  /**
   * 在沙箱中执行命令
   * @param {string} command - 要执行的命令
   * @param {Object} options - 执行选项
   * @returns {Promise<Object>} 执行结果
   */
  async execute(command, options = {}) {
    const execId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    const timeout = options.timeout || this.defaultTimeout;
    const cwd = options.cwd || process.cwd();
    const env = { ...process.env, ...(options.env || {}) };
    const instanceId = options.instanceId || null;

    // 创建执行记录
    const execution = {
      id: execId,
      command,
      type: EXECUTION_TYPE.COMMAND,
      status: EXECUTION_STATUS.PENDING,
      cwd,
      timeout,
      instanceId,
      startedAt: null,
      completedAt: null,
      duration: 0,
      exitCode: null,
      stdout: '',
      stderr: '',
      error: null,
      killed: false,
      resourceUsage: null
    };

    this.executions.set(execId, execution);
    this.stats.totalExecutions++;

    // 安全检查
    const check = this.checkCommand(command, instanceId);
    if (!check.allowed) {
      execution.status = EXECUTION_STATUS.BLOCKED;
      execution.error = check.reason;
      execution.completedAt = new Date().toISOString();
      this.stats.blocked++;
      this._audit('command_blocked', execId, { command, reason: check.reason });
      this._addHistory(execution);
      return this._formatResult(execution);
    }

    // 并发检查
    if (this.activeProcesses.size >= this.maxConcurrent) {
      execution.status = EXECUTION_STATUS.BLOCKED;
      execution.error = `最大并发数已达上限 (${this.maxConcurrent})`;
      execution.completedAt = new Date().toISOString();
      this.stats.blocked++;
      this._audit('concurrent_limit', execId, { active: this.activeProcesses.size });
      this._addHistory(execution);
      return this._formatResult(execution);
    }

    // DryRun 模式
    if (this.dryRun) {
      execution.status = EXECUTION_STATUS.COMPLETED;
      execution.startedAt = new Date().toISOString();
      execution.completedAt = new Date().toISOString();
      execution.stdout = `[DRY RUN] Would execute: ${command}`;
      execution.exitCode = 0;
      this.stats.successful++;
      this._audit('dry_run', execId, { command });
      this._addHistory(execution);
      return this._formatResult(execution);
    }

    // 实际执行
    this._audit('execution_start', execId, { command, cwd, timeout });
    return this._executeCommand(execution, command, { cwd, env, timeout });
  }

  /**
   * 执行函数 (在当前进程中)
   * @param {Function} fn - 要执行的函数
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 执行结果
   */
  async executeFunction(fn, options = {}) {
    const execId = `exec_fn_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    const timeout = options.timeout || this.defaultTimeout;

    const execution = {
      id: execId,
      command: `[Function: ${fn.name || 'anonymous'}]`,
      type: EXECUTION_TYPE.FUNCTION,
      status: EXECUTION_STATUS.PENDING,
      timeout,
      instanceId: options.instanceId || null,
      startedAt: null,
      completedAt: null,
      duration: 0,
      exitCode: null,
      stdout: '',
      stderr: '',
      result: undefined,
      error: null,
      killed: false
    };

    this.executions.set(execId, execution);
    this.stats.totalExecutions++;

    execution.status = EXECUTION_STATUS.RUNNING;
    execution.startedAt = new Date().toISOString();

    try {
      // 使用 Promise.race 实现超时
      const resultPromise = Promise.resolve().then(() => fn());
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('TIMEOUT')), timeout);
      });

      const result = await Promise.race([resultPromise, timeoutPromise]);

      execution.status = EXECUTION_STATUS.COMPLETED;
      execution.result = result;
      execution.stdout = typeof result === 'string' ? result : JSON.stringify(result);
      execution.exitCode = 0;
      this.stats.successful++;

    } catch (error) {
      if (error.message === 'TIMEOUT') {
        execution.status = EXECUTION_STATUS.TIMEOUT;
        execution.error = `函数执行超时 (${timeout}ms)`;
        this.stats.timedOut++;
      } else {
        execution.status = EXECUTION_STATUS.FAILED;
        execution.error = error.message;
        execution.stderr = error.stack || error.message;
        this.stats.failed++;
      }
    }

    execution.completedAt = new Date().toISOString();
    execution.duration = new Date(execution.completedAt) - new Date(execution.startedAt);

    this._audit('function_executed', execId, {
      fn: fn.name || 'anonymous',
      status: execution.status,
      duration: execution.duration
    });
    this._addHistory(execution);

    return this._formatResult(execution);
  }

  async _executeCommand(execution, command, { cwd, env, timeout }) {
    return new Promise((resolve) => {
      execution.status = EXECUTION_STATUS.RUNNING;
      execution.startedAt = new Date().toISOString();

      const isWindows = process.platform === 'win32';
      const shell = isWindows ? 'cmd.exe' : '/bin/sh';
      const shellFlag = isWindows ? '/c' : '-c';

      let stdoutBuf = '';
      let stderrBuf = '';
      let outputExceeded = false;

      const child = spawn(shell, [shellFlag, command], {
        cwd,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
      });

      this.activeProcesses.set(execution.id, {
        pid: child.pid,
        process: child,
        startedAt: execution.startedAt
      });

      // 超时处理
      const timer = setTimeout(() => {
        execution.status = EXECUTION_STATUS.TIMEOUT;
        execution.killed = true;
        execution.error = `执行超时 (${timeout}ms)`;
        this.stats.timedOut++;
        try { child.kill('SIGKILL'); } catch (e) {}
        this._audit('execution_timeout', execution.id, { timeout, pid: child.pid });
      }, timeout);

      // 输出捕获
      child.stdout.on('data', (data) => {
        if (!outputExceeded) {
          stdoutBuf += data.toString();
          if (stdoutBuf.length > this.maxOutputSize) {
            stdoutBuf = stdoutBuf.substring(0, this.maxOutputSize) + '\n[OUTPUT TRUNCATED]';
            outputExceeded = true;
          }
        }
      });

      child.stderr.on('data', (data) => {
        if (!outputExceeded) {
          stderrBuf += data.toString();
          if (stderrBuf.length > this.maxOutputSize) {
            stderrBuf = stderrBuf.substring(0, this.maxOutputSize) + '\n[OUTPUT TRUNCATED]';
            outputExceeded = true;
          }
        }
      });

      child.on('close', (code, signal) => {
        clearTimeout(timer);
        this.activeProcesses.delete(execution.id);

        execution.stdout = stdoutBuf;
        execution.stderr = stderrBuf;
        execution.exitCode = code;
        execution.completedAt = new Date().toISOString();
        execution.duration = new Date(execution.completedAt) - new Date(execution.startedAt);

        // 获取资源使用
        try {
          execution.resourceUsage = child.resourceUsage ? child.resourceUsage() : null;
        } catch (e) {}

        if (execution.status === EXECUTION_STATUS.TIMEOUT) {
          // 已在超时处理中设置
        } else if (signal === 'SIGKILL' || signal === 'SIGTERM') {
          execution.status = EXECUTION_STATUS.KILLED;
          execution.killed = true;
          this.stats.killed++;
        } else if (code === 0) {
          execution.status = EXECUTION_STATUS.COMPLETED;
          this.stats.successful++;
        } else {
          execution.status = EXECUTION_STATUS.FAILED;
          execution.error = `进程退出码: ${code}`;
          this.stats.failed++;
        }

        this._audit('execution_complete', execution.id, {
          status: execution.status,
          exitCode: code,
          duration: execution.duration
        });
        this._addHistory(execution);

        resolve(this._formatResult(execution));
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        this.activeProcesses.delete(execution.id);

        execution.status = EXECUTION_STATUS.FAILED;
        execution.error = err.message;
        execution.stderr = err.stack || err.message;
        execution.completedAt = new Date().toISOString();
        execution.duration = new Date(execution.completedAt) - new Date(execution.startedAt);
        this.stats.failed++;

        this._audit('execution_error', execution.id, { error: err.message });
        this._addHistory(execution);

        resolve(this._formatResult(execution));
      });
    });
  }

  // ----------------------------------------------------------
  // 进程管理
  // ----------------------------------------------------------

  /**
   * 终止正在运行的执行
   * @param {string} execId - 执行 ID
   * @returns {boolean} 是否成功
   */
  kill(execId) {
    const proc = this.activeProcesses.get(execId);
    if (!proc) return false;

    try {
      proc.process.kill('SIGTERM');
      // 给 SIGTERM 500ms 时间
      setTimeout(() => {
        if (this.activeProcesses.has(execId)) {
          try { proc.process.kill('SIGKILL'); } catch (e) {}
        }
      }, 500);

      const execution = this.executions.get(execId);
      if (execution) {
        execution.status = EXECUTION_STATUS.KILLED;
        execution.killed = true;
      }

      this._audit('execution_killed', execId, { pid: proc.pid });
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * 终止所有运行中的执行
   * @returns {number} 终止的数量
   */
  killAll() {
    let killed = 0;
    for (const [execId] of this.activeProcesses) {
      if (this.kill(execId)) killed++;
    }
    return killed;
  }

  /**
   * 获取活跃执行列表
   */
  getActiveExecutions() {
    const active = [];
    for (const [execId, proc] of this.activeProcesses) {
      const execution = this.executions.get(execId);
      active.push({
        id: execId,
        command: execution?.command,
        pid: proc.pid,
        startedAt: proc.startedAt,
        runningMs: Date.now() - new Date(proc.startedAt).getTime()
      });
    }
    return active;
  }

  // ----------------------------------------------------------
  // 批量执行
  // ----------------------------------------------------------

  /**
   * 顺序执行多个命令
   * @param {string[]} commands - 命令列表
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 批量结果
   */
  async executeSequential(commands, options = {}) {
    const results = [];
    const stopOnError = options.stopOnError !== false;

    for (const command of commands) {
      const result = await this.execute(command, options);
      results.push(result);

      if (stopOnError && !result.success) {
        break;
      }
    }

    return {
      total: commands.length,
      executed: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    };
  }

  /**
   * 并行执行多个命令
   * @param {string[]} commands - 命令列表
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 批量结果
   */
  async executeParallel(commands, options = {}) {
    const maxParallel = options.maxParallel || this.maxConcurrent;
    const results = [];

    // 分批执行
    for (let i = 0; i < commands.length; i += maxParallel) {
      const batch = commands.slice(i, i + maxParallel);
      const batchResults = await Promise.all(
        batch.map(cmd => this.execute(cmd, options))
      );
      results.push(...batchResults);
    }

    return {
      total: commands.length,
      executed: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    };
  }

  // ----------------------------------------------------------
  // 查询接口
  // ----------------------------------------------------------

  /**
   * 获取执行结果
   */
  getExecution(execId) {
    const exec = this.executions.get(execId);
    return exec ? this._formatResult(exec) : null;
  }

  /**
   * 获取执行历史
   */
  getHistory(limit = 20, filters = {}) {
    let history = [...this.history];

    if (filters.status) {
      history = history.filter(h => h.status === filters.status);
    }
    if (filters.type) {
      history = history.filter(h => h.type === filters.type);
    }

    return history.slice(-limit);
  }

  /**
   * 获取审计日志
   */
  getAuditLog(limit = 50) {
    return this.auditLog.slice(-limit);
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ...this.stats,
      activeProcesses: this.activeProcesses.size,
      maxConcurrent: this.maxConcurrent,
      historySize: this.history.length,
      dryRun: this.dryRun,
      defaultTimeout: this.defaultTimeout,
      allowedCommands: this.allowedCommands.length,
      blockedCommands: this.blockedCommands.length
    };
  }

  // ----------------------------------------------------------
  // 内部方法
  // ----------------------------------------------------------

  _formatResult(execution) {
    return {
      id: execution.id,
      command: execution.command,
      type: execution.type,
      status: execution.status,
      success: execution.status === EXECUTION_STATUS.COMPLETED,
      exitCode: execution.exitCode,
      stdout: execution.stdout,
      stderr: execution.stderr,
      error: execution.error,
      duration: execution.duration,
      killed: execution.killed,
      result: execution.result,
      resourceUsage: execution.resourceUsage,
      startedAt: execution.startedAt,
      completedAt: execution.completedAt
    };
  }

  _addHistory(execution) {
    this.history.push({
      id: execution.id,
      command: execution.command,
      type: execution.type,
      status: execution.status,
      exitCode: execution.exitCode,
      duration: execution.duration,
      error: execution.error,
      completedAt: execution.completedAt
    });

    // 限制历史长度
    if (this.history.length > 500) {
      this.history = this.history.slice(-500);
    }
  }

  _audit(event, execId, data = {}) {
    this.auditLog.push({
      event,
      execId,
      timestamp: new Date().toISOString(),
      ...data
    });

    // 限制审计日志
    if (this.auditLog.length > 1000) {
      this.auditLog = this.auditLog.slice(-1000);
    }

    this.logger.info({ event, execId, ...data }, `Audit: ${event}`);
  }
}

// ============================================================
// 导出
// ============================================================

module.exports = {
  SandboxExecutor,
  EXECUTION_STATUS,
  EXECUTION_TYPE,
  DEFAULT_ALLOWED_COMMANDS,
  DEFAULT_BLOCKED_COMMANDS
};
