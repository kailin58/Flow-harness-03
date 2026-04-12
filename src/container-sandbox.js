/**
 * container-sandbox.js - 容器化沙箱抽象层
 *
 * 文档要求(P2): 高级安全沙箱
 *   - Docker/VM/进程隔离模式
 *   - 可插拔后端架构
 *   - 进程隔离（内置实现，无外部依赖）
 *   - Docker/VM 接口定义（需外部运行时）
 *   - 沙箱生命周期管理 (create → start → exec → stop → destroy)
 *   - 资源限制传递
 *   - 文件挂载管理
 *
 * @version 1.0.0
 * @date 2026-04-13
 */

const { createLogger } = require('./logger');

// ============================================================
// 常量
// ============================================================

const ISOLATION_MODE = {
  PROCESS: 'process',
  DOCKER: 'docker',
  VM: 'vm',
  NONE: 'none'
};

const CONTAINER_STATUS = {
  CREATED: 'created',
  STARTING: 'starting',
  RUNNING: 'running',
  STOPPING: 'stopping',
  STOPPED: 'stopped',
  DESTROYED: 'destroyed',
  ERROR: 'error'
};

const MOUNT_TYPE = {
  BIND: 'bind',
  VOLUME: 'volume',
  TMPFS: 'tmpfs'
};

// ============================================================
// ContainerSandbox (抽象基类)
// ============================================================

class ContainerSandbox {
  /**
   * @param {Object} options
   * @param {string} options.mode            - 隔离模式
   * @param {string} options.name            - 沙箱名
   * @param {Object} options.resources       - 资源限制
   * @param {Object[]} options.mounts        - 文件挂载
   * @param {Object} options.env             - 环境变量
   * @param {string} options.workdir         - 工作目录
   * @param {Object} options.logger
   */
  constructor(options = {}) {
    this.mode = options.mode || ISOLATION_MODE.PROCESS;
    this.name = options.name || `sandbox_${Date.now()}`;
    this.resources = {
      cpuLimit: 1.0,           // CPU 核心数
      memoryLimitMB: 512,      // 内存限制 MB
      diskLimitMB: 1024,       // 磁盘限制 MB
      networkEnabled: true,    // 网络访问
      pidLimit: 100,           // 最大进程数
      timeoutMs: 60000,        // 超时
      ...(options.resources || {})
    };
    this.mounts = options.mounts || [];
    this.env = options.env || {};
    this.workdir = options.workdir || process.cwd();
    this.logger = options.logger || createLogger({ name: 'container-sandbox' });

    // 沙箱状态
    this.status = CONTAINER_STATUS.CREATED;
    this.containerId = null;
    this.startedAt = null;
    this.stoppedAt = null;

    // 执行记录
    this.execHistory = [];

    // 事件日志
    this.eventLog = [];

    // 统计
    this.stats = {
      executions: 0,
      successful: 0,
      failed: 0,
      totalDuration: 0
    };

    this._logEvent('sandbox_created', { mode: this.mode, name: this.name });
  }

  // ----------------------------------------------------------
  // 生命周期管理
  // ----------------------------------------------------------

  /**
   * 启动沙箱
   * @returns {Promise<Object>} 启动结果
   */
  async start() {
    if (this.status === CONTAINER_STATUS.RUNNING) {
      return { success: false, error: '沙箱已在运行' };
    }
    if (this.status === CONTAINER_STATUS.DESTROYED) {
      return { success: false, error: '沙箱已销毁' };
    }

    this.status = CONTAINER_STATUS.STARTING;
    this._logEvent('sandbox_starting', { mode: this.mode });

    try {
      const result = await this._doStart();
      this.status = CONTAINER_STATUS.RUNNING;
      this.startedAt = new Date().toISOString();
      this.containerId = result.containerId || `${this.mode}_${Date.now()}`;

      this._logEvent('sandbox_started', { containerId: this.containerId });
      return { success: true, containerId: this.containerId };
    } catch (error) {
      this.status = CONTAINER_STATUS.ERROR;
      this._logEvent('sandbox_start_error', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * 停止沙箱
   */
  async stop() {
    if (this.status !== CONTAINER_STATUS.RUNNING) {
      return { success: false, error: '沙箱未在运行' };
    }

    this.status = CONTAINER_STATUS.STOPPING;
    this._logEvent('sandbox_stopping', {});

    try {
      await this._doStop();
      this.status = CONTAINER_STATUS.STOPPED;
      this.stoppedAt = new Date().toISOString();

      this._logEvent('sandbox_stopped', {});
      return { success: true };
    } catch (error) {
      this.status = CONTAINER_STATUS.ERROR;
      return { success: false, error: error.message };
    }
  }

  /**
   * 销毁沙箱
   */
  async destroy() {
    if (this.status === CONTAINER_STATUS.RUNNING) {
      await this.stop();
    }
    if (this.status === CONTAINER_STATUS.DESTROYED) {
      return { success: false, error: '沙箱已销毁' };
    }

    try {
      await this._doDestroy();
      this.status = CONTAINER_STATUS.DESTROYED;
      this._logEvent('sandbox_destroyed', {});
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 重启沙箱
   */
  async restart() {
    const stopResult = await this.stop();
    if (!stopResult.success && this.status !== CONTAINER_STATUS.STOPPED) {
      return { success: false, error: `停止失败: ${stopResult.error}` };
    }
    return this.start();
  }

  // ----------------------------------------------------------
  // 命令执行
  // ----------------------------------------------------------

  /**
   * 在沙箱中执行命令
   * @param {string} command - 命令
   * @param {Object} options - 执行选项
   * @returns {Promise<Object>} 执行结果
   */
  async exec(command, options = {}) {
    if (this.status !== CONTAINER_STATUS.RUNNING) {
      return { success: false, error: '沙箱未在运行' };
    }

    if (!command || typeof command !== 'string') {
      return { success: false, error: '命令不能为空' };
    }

    const timeout = options.timeout || this.resources.timeoutMs;
    const env = { ...this.env, ...(options.env || {}) };
    const cwd = options.cwd || this.workdir;

    const startTime = Date.now();
    this.stats.executions++;

    try {
      const result = await this._doExec(command, { timeout, env, cwd });

      const duration = Date.now() - startTime;
      this.stats.totalDuration += duration;

      const record = {
        command,
        success: result.exitCode === 0,
        exitCode: result.exitCode,
        stdout: result.stdout || '',
        stderr: result.stderr || '',
        duration,
        executedAt: new Date().toISOString()
      };

      if (record.success) {
        this.stats.successful++;
      } else {
        this.stats.failed++;
      }

      this.execHistory.push(record);
      if (this.execHistory.length > 200) {
        this.execHistory = this.execHistory.slice(-200);
      }

      this._logEvent('command_executed', {
        command: command.substring(0, 100),
        exitCode: result.exitCode,
        duration
      });

      return {
        success: record.success,
        exitCode: result.exitCode,
        stdout: result.stdout || '',
        stderr: result.stderr || '',
        duration
      };

    } catch (error) {
      this.stats.failed++;
      const duration = Date.now() - startTime;
      this.stats.totalDuration += duration;

      this._logEvent('command_error', { command: command.substring(0, 100), error: error.message });

      return {
        success: false,
        exitCode: -1,
        stdout: '',
        stderr: error.message,
        duration,
        error: error.message
      };
    }
  }

  // ----------------------------------------------------------
  // 文件挂载管理
  // ----------------------------------------------------------

  /**
   * 添加挂载
   * @param {Object} mount - 挂载配置
   * @returns {Object} 结果
   */
  addMount(mount) {
    if (this.status === CONTAINER_STATUS.RUNNING) {
      return { success: false, error: '运行中不能添加挂载' };
    }

    if (!mount.source || !mount.target) {
      return { success: false, error: '挂载需要 source 和 target' };
    }

    const mountConfig = {
      type: mount.type || MOUNT_TYPE.BIND,
      source: mount.source,
      target: mount.target,
      readOnly: mount.readOnly || false
    };

    this.mounts.push(mountConfig);
    this._logEvent('mount_added', { source: mount.source, target: mount.target });
    return { success: true, mount: mountConfig };
  }

  /**
   * 移除挂载
   */
  removeMount(target) {
    if (this.status === CONTAINER_STATUS.RUNNING) {
      return { success: false, error: '运行中不能移除挂载' };
    }

    const idx = this.mounts.findIndex(m => m.target === target);
    if (idx === -1) return { success: false, error: '挂载不存在' };

    this.mounts.splice(idx, 1);
    return { success: true };
  }

  /**
   * 获取挂载列表
   */
  getMounts() {
    return [...this.mounts];
  }

  // ----------------------------------------------------------
  // 资源管理
  // ----------------------------------------------------------

  /**
   * 更新资源限制
   */
  updateResources(updates) {
    const validKeys = ['cpuLimit', 'memoryLimitMB', 'diskLimitMB', 'networkEnabled', 'pidLimit', 'timeoutMs'];
    let updated = 0;
    for (const [key, value] of Object.entries(updates)) {
      if (validKeys.includes(key)) {
        this.resources[key] = value;
        updated++;
      }
    }
    this._logEvent('resources_updated', { updated, changes: updates });
    return { success: true, updated };
  }

  /**
   * 获取资源限制
   */
  getResources() {
    return { ...this.resources };
  }

  // ----------------------------------------------------------
  // 查询接口
  // ----------------------------------------------------------

  /**
   * 获取沙箱信息
   */
  getInfo() {
    return {
      name: this.name,
      mode: this.mode,
      status: this.status,
      containerId: this.containerId,
      resources: { ...this.resources },
      mounts: this.mounts.length,
      startedAt: this.startedAt,
      stoppedAt: this.stoppedAt,
      uptime: this.startedAt && this.status === CONTAINER_STATUS.RUNNING
        ? Date.now() - new Date(this.startedAt).getTime()
        : 0
    };
  }

  /**
   * 获取执行历史
   */
  getExecHistory(limit = 20) {
    return this.execHistory.slice(-limit);
  }

  /**
   * 获取统计
   */
  getStats() {
    return {
      ...this.stats,
      mode: this.mode,
      status: this.status,
      avgDuration: this.stats.executions > 0
        ? Math.round(this.stats.totalDuration / this.stats.executions)
        : 0,
      successRate: this.stats.executions > 0
        ? Math.round(this.stats.successful / this.stats.executions * 100) / 100
        : 0
    };
  }

  /**
   * 获取事件日志
   */
  getEventLog(limit = 50) {
    return this.eventLog.slice(-limit);
  }

  // ----------------------------------------------------------
  // 后端方法 (由子类或模式分发实现)
  // ----------------------------------------------------------

  async _doStart() {
    switch (this.mode) {
      case ISOLATION_MODE.PROCESS:
        return this._processStart();
      case ISOLATION_MODE.DOCKER:
        return this._dockerStart();
      case ISOLATION_MODE.VM:
        return this._vmStart();
      case ISOLATION_MODE.NONE:
        return { containerId: `none_${Date.now()}` };
      default:
        throw new Error(`不支持的隔离模式: ${this.mode}`);
    }
  }

  async _doStop() {
    switch (this.mode) {
      case ISOLATION_MODE.PROCESS:
        return this._processStop();
      case ISOLATION_MODE.DOCKER:
        return this._dockerStop();
      case ISOLATION_MODE.VM:
        return this._vmStop();
      case ISOLATION_MODE.NONE:
        return {};
      default:
        throw new Error(`不支持的隔离模式: ${this.mode}`);
    }
  }

  async _doDestroy() {
    switch (this.mode) {
      case ISOLATION_MODE.PROCESS:
        return this._processDestroy();
      case ISOLATION_MODE.DOCKER:
        return this._dockerDestroy();
      case ISOLATION_MODE.VM:
        return this._vmDestroy();
      case ISOLATION_MODE.NONE:
        return {};
      default:
        throw new Error(`不支持的隔离模式: ${this.mode}`);
    }
  }

  async _doExec(command, options) {
    switch (this.mode) {
      case ISOLATION_MODE.PROCESS:
        return this._processExec(command, options);
      case ISOLATION_MODE.DOCKER:
        return this._dockerExec(command, options);
      case ISOLATION_MODE.VM:
        return this._vmExec(command, options);
      case ISOLATION_MODE.NONE:
        return this._processExec(command, options);
      default:
        throw new Error(`不支持的隔离模式: ${this.mode}`);
    }
  }

  // ----------------------------------------------------------
  // Process 后端 (内置实现)
  // ----------------------------------------------------------

  async _processStart() {
    // 进程隔离模式：无需特殊启动，使用 child_process.spawn
    return { containerId: `process_${process.pid}_${Date.now()}` };
  }

  async _processStop() {
    // 进程模式：标记停止即可
    return {};
  }

  async _processDestroy() {
    // 清理
    this.execHistory = [];
    return {};
  }

  async _processExec(command, options) {
    const { spawn } = require('child_process');
    const { timeout, env, cwd } = options;

    return new Promise((resolve) => {
      const isWindows = process.platform === 'win32';
      const shell = isWindows ? 'cmd.exe' : '/bin/sh';
      const shellFlag = isWindows ? '/c' : '-c';

      let stdout = '';
      let stderr = '';

      const child = spawn(shell, [shellFlag, command], {
        cwd,
        env: { ...process.env, ...env },
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
      });

      const timer = setTimeout(() => {
        try { child.kill('SIGKILL'); } catch (e) {}
        resolve({ exitCode: -1, stdout, stderr: stderr + '\nTimeout exceeded' });
      }, timeout);

      child.stdout.on('data', (data) => { stdout += data.toString(); });
      child.stderr.on('data', (data) => { stderr += data.toString(); });

      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ exitCode: code || 0, stdout, stderr });
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        resolve({ exitCode: -1, stdout, stderr: err.message });
      });
    });
  }

  // ----------------------------------------------------------
  // Docker 后端 (实际实现 — 通过 Docker CLI)
  // ----------------------------------------------------------

  /**
   * 检测 Docker 是否可用
   * @returns {Promise<boolean>}
   */
  async _detectDocker() {
    const { execFile } = require('child_process');
    return new Promise((resolve) => {
      execFile('docker', ['version', '--format', '{{.Server.Version}}'], {
        timeout: 5000, windowsHide: true
      }, (err, stdout) => {
        if (err) {
          this.logger.warn('Docker not available: ' + (err.message || 'unknown'));
          resolve(false);
        } else {
          this._dockerVersion = (stdout || '').trim();
          this.logger.info({ version: this._dockerVersion }, 'Docker detected');
          resolve(true);
        }
      });
    });
  }

  async _dockerStart() {
    const { execFile } = require('child_process');

    // 检测 Docker
    const available = await this._detectDocker();
    if (!available) {
      throw new Error('Docker runtime not available. Install Docker and ensure the daemon is running.');
    }

    const containerName = `fh_${this.name}_${Date.now()}`;
    const image = this.env.DOCKER_IMAGE || 'node:18-alpine';

    // 构建 docker run 参数
    const args = ['run', '-d', '--name', containerName];

    // 资源限制
    if (this.resources.cpuLimit) {
      args.push('--cpus', String(this.resources.cpuLimit));
    }
    if (this.resources.memoryLimitMB) {
      args.push('--memory', `${this.resources.memoryLimitMB}m`);
    }
    if (this.resources.pidLimit) {
      args.push('--pids-limit', String(this.resources.pidLimit));
    }
    if (!this.resources.networkEnabled) {
      args.push('--network', 'none');
    }

    // 挂载
    for (const mount of this.mounts) {
      const ro = mount.readOnly ? ':ro' : '';
      if (mount.type === MOUNT_TYPE.TMPFS) {
        args.push('--tmpfs', mount.target);
      } else {
        args.push('-v', `${mount.source}:${mount.target}${ro}`);
      }
    }

    // 环境变量
    for (const [key, value] of Object.entries(this.env)) {
      if (key === 'DOCKER_IMAGE') continue;
      args.push('-e', `${key}=${value}`);
    }

    // 工作目录
    args.push('-w', this.workdir);

    // 保持容器运行 (tail -f /dev/null 或 sleep infinity)
    args.push(image, 'tail', '-f', '/dev/null');

    this.logger.info({ image, containerName }, 'Docker: starting container');

    return new Promise((resolve, reject) => {
      execFile('docker', args, {
        timeout: 30000, windowsHide: true
      }, (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`Docker start failed: ${stderr || err.message}`));
        } else {
          this._dockerContainerName = containerName;
          const containerId = (stdout || '').trim().substring(0, 12);
          this.logger.info({ containerId, containerName }, 'Docker container started');
          resolve({ containerId });
        }
      });
    });
  }

  async _dockerStop() {
    const { execFile } = require('child_process');
    const target = this._dockerContainerName || this.containerId;
    if (!target) return {};

    this.logger.info({ container: target }, 'Docker: stopping container');

    return new Promise((resolve, reject) => {
      execFile('docker', ['stop', '-t', '10', target], {
        timeout: 20000, windowsHide: true
      }, (err, stdout, stderr) => {
        if (err) {
          // 容器可能已经停止
          this.logger.warn({ error: stderr || err.message }, 'Docker stop warning');
          resolve({});
        } else {
          resolve({});
        }
      });
    });
  }

  async _dockerDestroy() {
    const { execFile } = require('child_process');
    const target = this._dockerContainerName || this.containerId;
    if (!target) return {};

    this.logger.info({ container: target }, 'Docker: removing container');

    return new Promise((resolve, reject) => {
      execFile('docker', ['rm', '-f', target], {
        timeout: 15000, windowsHide: true
      }, (err, stdout, stderr) => {
        if (err) {
          this.logger.warn({ error: stderr || err.message }, 'Docker rm warning');
        }
        this._dockerContainerName = null;
        this.execHistory = [];
        resolve({});
      });
    });
  }

  async _dockerExec(command, options) {
    const { execFile } = require('child_process');
    const target = this._dockerContainerName || this.containerId;
    if (!target) {
      return { exitCode: -1, stdout: '', stderr: 'No container running' };
    }

    const { timeout, env, cwd } = options;
    const args = ['exec'];

    // 环境变量
    if (env) {
      for (const [key, value] of Object.entries(env)) {
        args.push('-e', `${key}=${value}`);
      }
    }

    // 工作目录
    if (cwd) {
      args.push('-w', cwd);
    }

    args.push(target, '/bin/sh', '-c', command);

    this.logger.info({ command, container: target }, 'Docker: exec');

    return new Promise((resolve) => {
      const child = execFile('docker', args, {
        timeout: timeout || this.resources.timeoutMs,
        maxBuffer: 10 * 1024 * 1024,
        windowsHide: true
      }, (err, stdout, stderr) => {
        if (err) {
          resolve({
            exitCode: err.code || -1,
            stdout: stdout || '',
            stderr: stderr || err.message
          });
        } else {
          resolve({
            exitCode: 0,
            stdout: stdout || '',
            stderr: stderr || ''
          });
        }
      });
    });
  }

  // ----------------------------------------------------------
  // VM 后端 (增强进程隔离实现)
  //   无需 VM 管理程序 — 使用隔离临时目录 + 限制环境 + 子进程
  //   对外接口与 Docker 一致，适合无 Docker 场景的安全沙箱
  // ----------------------------------------------------------

  async _vmStart() {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');

    // 创建隔离根目录
    const vmRoot = path.join(os.tmpdir(), `fh_vm_${this.name}_${Date.now()}`);
    fs.mkdirSync(vmRoot, { recursive: true });

    // 创建子目录结构
    const dirs = ['workspace', 'tmp', 'home', 'logs'];
    for (const dir of dirs) {
      fs.mkdirSync(path.join(vmRoot, dir), { recursive: true });
    }

    this._vmRoot = vmRoot;
    this._vmWorkspace = path.join(vmRoot, 'workspace');

    // 处理挂载 — 将文件复制到隔离目录
    for (const mount of this.mounts) {
      // 确保 mount.source 是有效的字符串路径
      const sourcePath = mount.source;
      if (mount.type !== MOUNT_TYPE.TMPFS && sourcePath && typeof sourcePath === 'string' && fs.existsSync(sourcePath)) {
        const destDir = path.join(vmRoot, 'workspace', path.basename(mount.target));
        try {
          fs.cpSync(sourcePath, destDir, { recursive: true });
        } catch (e) {
          this.logger.warn({ source: sourcePath, error: e.message }, 'VM mount copy warning');
        }
      }
    }

    const containerId = `vm_${process.pid}_${Date.now()}`;
    this.logger.info({ vmRoot, containerId }, 'VM backend: started (enhanced process isolation)');

    return { containerId };
  }

  async _vmStop() {
    // 标记停止
    this.logger.info({ vmRoot: this._vmRoot }, 'VM backend: stopped');
    return {};
  }

  async _vmDestroy() {
    const fs = require('fs');

    // 清理隔离目录
    if (this._vmRoot) {
      try {
        fs.rmSync(this._vmRoot, { recursive: true, force: true });
        this.logger.info({ vmRoot: this._vmRoot }, 'VM backend: destroyed');
      } catch (e) {
        this.logger.warn({ error: e.message }, 'VM cleanup warning');
      }
      this._vmRoot = null;
      this._vmWorkspace = null;
    }
    this.execHistory = [];
    return {};
  }

  async _vmExec(command, options) {
    const { spawn } = require('child_process');
    const { timeout, env, cwd } = options;

    // 在隔离环境中执行 — 受限环境变量 + 隔离工作目录
    const vmCwd = cwd || this._vmWorkspace || this.workdir;

    // 构建受限环境 — 只暴露最少的系统环境变量
    const isWin = process.platform === 'win32';
    const safeEnv = {
      PATH: process.env.PATH,
      HOME: this._vmRoot ? require('path').join(this._vmRoot, 'home') : process.env.HOME,
      TMPDIR: this._vmRoot ? require('path').join(this._vmRoot, 'tmp') : require('os').tmpdir(),
      LANG: process.env.LANG || 'en_US.UTF-8',
      NODE_ENV: 'sandbox',
      FH_SANDBOX: 'vm',
      // Windows 需要这些变量来定位系统组件
      ...(isWin ? {
        SYSTEMROOT: process.env.SYSTEMROOT,
        COMSPEC: process.env.COMSPEC,
        WINDIR: process.env.WINDIR,
        APPDATA: process.env.APPDATA,
        USERPROFILE: process.env.USERPROFILE,
        TEMP: this._vmRoot ? require('path').join(this._vmRoot, 'tmp') : process.env.TEMP,
        TMP: this._vmRoot ? require('path').join(this._vmRoot, 'tmp') : process.env.TMP,
      } : {}),
      ...(env || {})
    };

    return new Promise((resolve) => {
      const isWindows = process.platform === 'win32';
      const shell = isWindows ? 'cmd.exe' : '/bin/sh';
      const shellFlag = isWindows ? '/c' : '-c';

      let stdout = '';
      let stderr = '';

      const child = spawn(shell, [shellFlag, command], {
        cwd: vmCwd,
        env: safeEnv,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
      });

      const timer = setTimeout(() => {
        try { child.kill('SIGKILL'); } catch (e) {}
        resolve({ exitCode: -1, stdout, stderr: 'Execution timed out' });
      }, timeout || this.resources.timeoutMs);

      child.stdout.on('data', (d) => { stdout += d.toString(); });
      child.stderr.on('data', (d) => { stderr += d.toString(); });

      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ exitCode: code || 0, stdout, stderr });
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        resolve({ exitCode: -1, stdout, stderr: err.message });
      });
    });
  }

  // ----------------------------------------------------------
  // 内部方法
  // ----------------------------------------------------------

  _logEvent(event, data = {}) {
    this.eventLog.push({
      event,
      timestamp: new Date().toISOString(),
      ...data
    });
    if (this.eventLog.length > 500) {
      this.eventLog = this.eventLog.slice(-500);
    }
  }
}

// ============================================================
// 工厂方法
// ============================================================

/**
 * 创建沙箱实例 (工厂方法)
 * @param {string} mode - 隔离模式
 * @param {Object} options - 配置选项
 * @returns {ContainerSandbox}
 */
function createSandbox(mode, options = {}) {
  return new ContainerSandbox({ ...options, mode: mode || ISOLATION_MODE.PROCESS });
}

// ============================================================
// 导出
// ============================================================

module.exports = {
  ContainerSandbox,
  createSandbox,
  ISOLATION_MODE,
  CONTAINER_STATUS,
  MOUNT_TYPE
};
