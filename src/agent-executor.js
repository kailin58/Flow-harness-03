const fs = require('fs').promises;
const path = require('path');
const { glob } = require('glob');
const { exec } = require('child_process');
const { promisify } = require('util');
const TaskAnalyzer = require('./task-analyzer');
const TaskDecomposer = require('./task-decomposer');
const Inspector = require('./inspector');
const SandboxManager = require('./sandbox-manager');
const ExecutionMonitor = require('./execution-monitor');
const DeviationDetector = require('./deviation-detector');
const ErrorPatternRecognizer = require('./error-pattern-recognizer');
const AutoRetry = require('./auto-retry');
const SelfHealing = require('./self-healing');
const HealthCheck = require('./health-check');
const DiagnosticReporter = require('./diagnostic-reporter');
const PlatformDetector = require('./platform-detector');
const TaskSerializer = require('./task-serializer');
const IPCChannel = require('./ipc-channel');
const CrossPlatformDispatcher = require('./cross-platform-dispatcher');
const LeadershipManager = require('./leadership-manager');

const execAsync = promisify(exec);

/**
 * Agent Executor - Agent 执行器
 * 负责真实执行各个 Agent 的任务
 */
class AgentExecutor {
  constructor(agentRegistry, workingDir = process.cwd(), config = {}) {
    this.agentRegistry = agentRegistry;
    this.workingDir = workingDir;
    this.taskAnalyzer = new TaskAnalyzer();
    this.taskDecomposer = new TaskDecomposer();
    this.inspector = new Inspector();

    // 初始化沙箱管理器
    this.sandboxManager = new SandboxManager({
      sandboxDir: config.sandboxDir || '.flowharness/sandboxes',
      maxSandboxes: config.maxSandboxes || 5,
      autoCleanup: config.autoCleanup !== false,
      ...config.sandbox
    });

    // 初始化执行监控器
    this.executionMonitor = new ExecutionMonitor({
      defaultTimeout: config.defaultTimeout || 300000,
      maxTimeout: config.maxTimeout || 600000,
      enableLogging: config.enableLogging !== false,
      ...config.monitor
    });

    // 初始化偏差检测器
    this.deviationDetector = new DeviationDetector({
      enableLearning: config.enableLearning !== false,
      minSamples: config.minSamples || 5,
      deviationThreshold: config.deviationThreshold || 2.0,
      ...config.deviation
    });

    // 初始化错误模式识别器
    this.errorPatternRecognizer = new ErrorPatternRecognizer({
      enableLearning: config.enableLearning !== false,
      minOccurrences: config.minOccurrences || 3,
      patternWindow: config.patternWindow || 100,
      similarityThreshold: config.similarityThreshold || 0.7,
      ...config.errorPattern
    });

    // 初始化自动重试机制
    this.autoRetry = new AutoRetry({
      maxRetries: config.maxRetries || 3,
      backoffStrategy: config.backoffStrategy || 'exponential',
      baseDelay: config.retryBaseDelay || 1000,
      maxDelay: config.retryMaxDelay || 30000,
      jitter: config.retryJitter !== false,
      circuitBreakerThreshold: config.circuitBreakerThreshold || 10,
      circuitBreakerResetTime: config.circuitBreakerResetTime || 60000,
      categoryOverrides: config.retryOverrides || {},
      ...config.autoRetry
    });

    // 是否启用自动重试
    this.enableAutoRetry = config.enableAutoRetry !== false;

    // 初始化自愈引擎
    this.selfHealing = new SelfHealing({
      enabled: config.enableSelfHealing !== false,
      maxHealAttempts: config.maxHealAttempts || 3,
      healTimeout: config.healTimeout || 30000,
      enableLearning: config.enableLearning !== false,
      cooldownTime: config.healCooldownTime || 60000,
      ...config.selfHealing
    });

    // 是否启用自愈
    this.enableSelfHealing = config.enableSelfHealing !== false;

    // 初始化健康检查
    this.healthCheck = new HealthCheck({
      checkInterval: config.healthCheckInterval || 60000,
      autoStart: false,
      unhealthyThreshold: config.unhealthyThreshold || 3,
      degradedThreshold: config.degradedThreshold || 1,
      checkTimeout: config.healthCheckTimeout || 10000,
      onAlert: config.onHealthAlert || null,
      ...config.healthCheck
    });

    // 注册内置组件健康检查
    this._registerBuiltinHealthChecks();

    // 初始化诊断报告生成器
    this.diagnosticReporter = new DiagnosticReporter({
      defaultLevel: config.diagnosticLevel || 'standard',
      maxReports: config.maxDiagnosticReports || 50,
      sources: {
        healthCheck: this.healthCheck,
        executionMonitor: this.executionMonitor,
        errorPatternRecognizer: this.errorPatternRecognizer,
        autoRetry: this.autoRetry,
        selfHealing: this.selfHealing,
        deviationDetector: this.deviationDetector
      },
      ...config.diagnostic
    });

    // 沙箱配置
    this.useSandbox = config.useSandbox !== false; // 默认启用沙箱
    this.sandboxForWriteOps = config.sandboxForWriteOps !== false; // 写操作需要沙箱

    // 跨平台协作（可选）
    this.enableCrossPlatform = config.enableCrossPlatform || false;
    if (this.enableCrossPlatform) {
      this.platformDetector = new PlatformDetector({
        workingDir: this.workingDir,
        ...config.platformDetector
      });

      this.taskSerializer = new TaskSerializer(config.taskSerializer);

      this.ipcChannel = new IPCChannel({
        tasksDir: config.tasksDir || '.flowharness/tasks',
        workingDir: this.workingDir,
        serializer: this.taskSerializer,
        ...config.ipcChannel
      });
      this.ipcChannel.initialize();

      this.crossPlatformDispatcher = new CrossPlatformDispatcher(
        this.platformDetector,
        this.ipcChannel,
        config.crossPlatformDispatcher
      );

      this.leadershipManager = new LeadershipManager(
        this.platformDetector,
        this.ipcChannel,
        config.leadershipManager
      );
    }
  }

  /**
   * 执行 Agent 任务
   * @param {string} agentId - Agent ID
   * @param {Object} task - 任务对象
   * @param {Object} context - 执行上下文
   * @returns {Promise<Object>} 执行结果
   */
  async execute(agentId, task, context = {}) {
    const agent = this.agentRegistry.get(agentId);

    if (!agent) {
      throw new Error(`Agent 不存在: ${agentId}`);
    }

    // 如果启用自动重试且未在重试上下文中，包装执行
    if (this.enableAutoRetry && !context._retrying) {
      return this._executeWithRetry(agentId, task, context);
    }

    return this._executeSingle(agentId, task, context);
  }

  /**
   * 带重试的执行
   * @param {string} agentId - Agent ID
   * @param {Object} task - 任务对象
   * @param {Object} context - 执行上下文
   * @returns {Promise<Object>} 执行结果
   */
  async _executeWithRetry(agentId, task, context = {}) {
    // 先执行一次
    const firstResult = await this._executeSingle(agentId, task, context);

    // 如果成功或没有错误分析，直接返回
    if (firstResult.success || !firstResult.errorAnalysis) {
      return firstResult;
    }

    // 获取错误类别
    const errorCategory = firstResult.errorAnalysis.category;

    // 判断是否应该重试
    const retryDecision = this.autoRetry.shouldRetry(errorCategory, { attempt: 0 });

    if (!retryDecision.shouldRetry) {
      // 不需要重试，添加重试决策信息
      firstResult.retryInfo = {
        retried: false,
        reason: retryDecision.reason,
        category: errorCategory
      };
      return firstResult;
    }

    // 使用 AutoRetry 执行重试
    const retryResult = await this.autoRetry.executeWithRetry(
      async (attempt) => {
        const retryContext = { ...context, _retrying: true, _retryAttempt: attempt + 1 };
        const result = await this._executeSingle(agentId, task, retryContext);

        if (!result.success) {
          const error = new Error(result.error || 'Execution failed');
          error.result = result;
          throw error;
        }

        return result;
      },
      {
        category: errorCategory,
        onRetry: async (info) => {
          // 可以在这里添加重试日志
        },
        context: { agentId, taskAction: task.action }
      }
    );

    if (retryResult.success) {
      // 重试成功
      const finalResult = retryResult.result;
      finalResult.retryInfo = {
        retried: true,
        attempts: retryResult.attempts,
        category: errorCategory,
        recovered: true
      };
      return finalResult;
    } else {
      // 重试失败，返回最后一次结果（如果有），否则返回第一次结果
      const lastAttemptResult = retryResult.error?.result || firstResult;
      lastAttemptResult.retryInfo = {
        retried: true,
        attempts: retryResult.attempts,
        category: errorCategory,
        recovered: false,
        reason: retryResult.retryDecision?.reason || '所有重试均失败'
      };
      return lastAttemptResult;
    }
  }

  /**
   * 单次执行 Agent 任务（不含重试逻辑）
   * @param {string} agentId - Agent ID
   * @param {Object} task - 任务对象
   * @param {Object} context - 执行上下文
   * @returns {Promise<Object>} 执行结果
   */
  async _executeSingle(agentId, task, context = {}) {
    const agent = this.agentRegistry.get(agentId);

    if (!agent) {
      throw new Error(`Agent 不存在: ${agentId}`);
    }

    // 开始执行监控
    const execution = this.executionMonitor.startExecution({
      agentId: agentId,
      taskAction: task.action,
      timeout: context.timeout || task.timeout,
      metadata: {
        task: task,
        context: context
      }
    });

    // 判断是否需要沙箱
    const needsSandbox = this.shouldUseSandbox(agentId, task, context);
    let sandbox = null;

    try {
      // 创建沙箱（如果需要）
      if (needsSandbox && this.useSandbox) {
        sandbox = await this.sandboxManager.createSandbox({
          agentId: agentId,
          taskAction: task.action,
          useWorktree: context.useWorktree !== false
        });

        // 将沙箱信息添加到上下文
        context.sandbox = sandbox;
        context.workingDir = sandbox.path;
      }

      // 添加执行ID到上下文
      context.executionId = execution.executionId;

      // 根据 Agent 类型分发执行
      let result;
      switch (agentId) {
        case 'explore':
          result = await this.executeExploreAgent(task, context);
          break;

        case 'plan':
          result = await this.executePlanAgent(task, context);
          break;

        case 'general':
          result = await this.executeGeneralAgent(task, context);
          break;

        case 'inspector':
          result = await this.executeInspectorAgent(task, context);
          break;

        case 'supervisor':
          result = await this.executeSupervisorAgent(task, context);
          break;

        default:
          throw new Error(`未实现的 Agent 类型: ${agentId}`);
      }

      // 检查是否超时
      if (this.executionMonitor.isTimedOut(execution.executionId)) {
        throw new Error(`执行超时: ${execution.executionId}`);
      }

      // 添加沙箱信息到结果
      if (sandbox) {
        result.sandbox = {
          id: sandbox.id,
          path: sandbox.path,
          used: true
        };
      }

      // 结束执行监控
      const stats = this.executionMonitor.endExecution(execution.executionId, {
        success: result.success,
        result: result
      });

      // 记录执行数据到偏差检测器
      const executionData = this.executionMonitor.getExecution(execution.executionId);
      if (executionData) {
        this.deviationDetector.recordExecution(executionData);

        // 检测偏差
        const deviation = this.deviationDetector.detectDeviation(executionData);

        // 添加偏差信息到结果
        if (deviation.hasDeviation) {
          result.deviation = {
            detected: true,
            deviations: deviation.deviations,
            severity: deviation.deviations.some(d => d.severity === 'high') ? 'high' :
                     deviation.deviations.some(d => d.severity === 'medium') ? 'medium' : 'low'
          };
        }
      }

      // 添加执行统计到结果
      result.execution = {
        id: execution.executionId,
        duration: stats.duration,
        timedOut: stats.timedOut
      };

      // 如果执行结果为失败，记录到错误模式识别器
      if (!result.success && result.error) {
        const errorAnalysis = this.errorPatternRecognizer.recordError({
          message: result.error.message || result.error,
          stack: result.error.stack,
          agentId: agentId,
          taskAction: task.action,
          context: context
        });
        result.errorAnalysis = errorAnalysis;

        // 尝试自愈
        if (this.enableSelfHealing) {
          const healResult = await this.selfHealing.attemptHeal(
            {
              category: errorAnalysis.category,
              message: result.error.message || result.error,
              features: errorAnalysis.rootCause ? { filePath: errorAnalysis.rootCause.filePath } : {},
              filePath: errorAnalysis.rootCause ? errorAnalysis.rootCause.filePath : null
            },
            { workingDir: this.workingDir, timeout: context.timeout }
          );
          result.healResult = healResult;
        }
      }

      return result;

    } catch (error) {
      // 结束执行监控（失败）
      const stats = this.executionMonitor.endExecution(execution.executionId, {
        success: false,
        error: error.message
      });

      // 记录失败执行到偏差检测器
      const executionData = this.executionMonitor.getExecution(execution.executionId);
      if (executionData) {
        this.deviationDetector.recordExecution(executionData);
      }

      // 记录错误到错误模式识别器
      const errorAnalysis = this.errorPatternRecognizer.recordError({
        message: error.message,
        stack: error.stack,
        agentId: agentId,
        taskAction: task.action,
        context: context
      });

      // 将错误分析添加到错误对象
      error.analysis = errorAnalysis;

      throw error;

    } finally {
      // 清理沙箱（如果创建了）
      if (sandbox && this.sandboxManager.config.autoCleanup) {
        try {
          await this.sandboxManager.destroySandbox(sandbox.id);
        } catch (error) {
          console.warn(`清理沙箱失败 ${sandbox.id}:`, error.message);
        }
      }
    }
  }

  /**
   * 判断是否需要使用沙箱
   * @param {string} agentId - Agent ID
   * @param {Object} task - 任务对象
   * @param {Object} context - 执行上下文
   * @returns {boolean} 是否需要沙箱
   */
  shouldUseSandbox(agentId, task, context) {
    // 如果上下文明确指定，优先使用
    if (context.useSandbox !== undefined) {
      return context.useSandbox;
    }

    // 写操作需要沙箱
    if (this.sandboxForWriteOps) {
      const writeActions = ['edit_file', 'create_file', 'run_command'];
      if (writeActions.includes(task.action)) {
        return true;
      }
    }

    // General Agent 默认使用沙箱
    if (agentId === 'general') {
      return true;
    }

    // 其他情况不使用沙箱
    return false;
  }

  /**
   * 执行 Explore Agent
   */
  async executeExploreAgent(task, context) {
    this.validateTask(task);

    switch (task.action) {
      case 'file_search':
        return await this.exploreFileSearch(task, context);

      case 'code_search':
        return await this.exploreCodeSearch(task, context);

      case 'read_file':
        return await this.exploreReadFile(task, context);

      default:
        throw new Error(`Explore Agent 不支持的操作: ${task.action}`);
    }
  }

  /**
   * Explore Agent - 文件搜索
   */
  async exploreFileSearch(task, context) {
    const pattern = task.pattern || '**/*.js';
    const options = {
      cwd: task.cwd || this.workingDir,
      ignore: task.ignore || ['node_modules/**', '.git/**', 'dist/**', 'build/**'],
      nodir: true,
      absolute: false
    };

    try {
      const files = await glob(pattern, options);

      return this.formatResult('explore', task, {
        action: 'file_search',
        pattern: pattern,
        files: files,
        count: files.length,
        cwd: options.cwd
      });
    } catch (error) {
      return this.formatResult('explore', task, null, error);
    }
  }

  /**
   * Explore Agent - 代码搜索
   */
  async exploreCodeSearch(task, context) {
    const pattern = task.pattern;
    if (!pattern) {
      throw new Error('代码搜索需要指定 pattern');
    }

    const filePattern = task.filePattern || '**/*.{js,ts,jsx,tsx,json,md}';
    const options = {
      cwd: task.cwd || this.workingDir,
      ignore: task.ignore || ['node_modules/**', '.git/**', 'dist/**', 'build/**'],
      nodir: true,
      absolute: false
    };

    try {
      // 先找到所有文件
      const files = await glob(filePattern, options);

      // 在每个文件中搜索
      const matches = [];
      const regex = new RegExp(pattern, task.flags || 'gi');

      for (const file of files) {
        const filePath = path.join(options.cwd, file);
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const lines = content.split('\n');

          lines.forEach((line, index) => {
            if (regex.test(line)) {
              matches.push({
                file: file,
                line: index + 1,
                content: line.trim(),
                match: line.match(regex)?.[0]
              });
            }
            // 重置 regex lastIndex
            regex.lastIndex = 0;
          });
        } catch (error) {
          // 跳过无法读取的文件
          continue;
        }
      }

      return this.formatResult('explore', task, {
        action: 'code_search',
        pattern: pattern,
        filePattern: filePattern,
        matches: matches,
        count: matches.length,
        filesSearched: files.length
      });
    } catch (error) {
      return this.formatResult('explore', task, null, error);
    }
  }

  /**
   * Explore Agent - 文件读取
   */
  async exploreReadFile(task, context) {
    const filePath = task.filePath;
    if (!filePath) {
      throw new Error('文件读取需要指定 filePath');
    }

    const fullPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.workingDir, filePath);

    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      const lines = content.split('\n');

      // 支持行范围读取
      let selectedLines = lines;
      if (task.startLine || task.endLine) {
        const start = (task.startLine || 1) - 1;
        const end = task.endLine || lines.length;
        selectedLines = lines.slice(start, end);
      }

      return this.formatResult('explore', task, {
        action: 'read_file',
        filePath: filePath,
        fullPath: fullPath,
        content: selectedLines.join('\n'),
        lines: selectedLines.length,
        totalLines: lines.length,
        encoding: 'utf-8'
      });
    } catch (error) {
      return this.formatResult('explore', task, null, error);
    }
  }

  /**
   * 执行 Plan Agent
   */
  async executePlanAgent(task, context) {
    this.validateTask(task);

    switch (task.action) {
      case 'analyze_requirement':
        return await this.planAnalyzeRequirement(task, context);

      case 'design_solution':
        return await this.planDesignSolution(task, context);

      default:
        throw new Error(`Plan Agent 不支持的操作: ${task.action}`);
    }
  }

  /**
   * Plan Agent - 需求分析
   */
  async planAnalyzeRequirement(task, context) {
    const requirement = task.requirement;
    if (!requirement) {
      throw new Error('需求分析需要指定 requirement');
    }

    try {
      // 使用 TaskAnalyzer 进行分析
      const analysis = this.taskAnalyzer.analyze(requirement, context);

      return this.formatResult('plan', task, {
        action: 'analyze_requirement',
        requirement: requirement,
        analysis: analysis,
        taskType: analysis.taskType,
        goal: analysis.goal,
        acceptanceCriteria: analysis.acceptanceCriteria,
        constraints: analysis.constraints,
        risks: analysis.risks,
        priority: analysis.priority,
        complexity: analysis.complexity
      });
    } catch (error) {
      return this.formatResult('plan', task, null, error);
    }
  }

  /**
   * Plan Agent - 方案设计
   */
  async planDesignSolution(task, context) {
    const analysis = task.analysis;
    if (!analysis) {
      throw new Error('方案设计需要指定 analysis（需求分析结果）');
    }

    try {
      // 使用 TaskDecomposer 进行任务拆解
      const decomposition = this.taskDecomposer.decompose(analysis);

      return this.formatResult('plan', task, {
        action: 'design_solution',
        analysis: analysis,
        decomposition: decomposition,
        subtasks: decomposition.subtasks,
        totalSubtasks: decomposition.subtasks.length,
        estimatedTotalTime: decomposition.estimatedTotalTime,
        dependencies: decomposition.dependencies
      });
    } catch (error) {
      return this.formatResult('plan', task, null, error);
    }
  }

  /**
   * 执行 General-Purpose Agent
   */
  async executeGeneralAgent(task, context) {
    this.validateTask(task);

    switch (task.action) {
      case 'edit_file':
        return await this.generalEditFile(task, context);

      case 'create_file':
        return await this.generalCreateFile(task, context);

      case 'run_command':
        return await this.generalRunCommand(task, context);

      default:
        throw new Error(`General-Purpose Agent 不支持的操作: ${task.action}`);
    }
  }

  /**
   * General Agent - 文件编辑
   */
  async generalEditFile(task, context) {
    const filePath = task.filePath;
    const oldString = task.oldString;
    const newString = task.newString;

    if (!filePath || oldString === undefined || newString === undefined) {
      throw new Error('文件编辑需要指定 filePath, oldString, newString');
    }

    // 使用沙箱路径（如果有）
    const workingDir = context.workingDir || this.workingDir;
    const fullPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(workingDir, filePath);

    try {
      // 读取文件
      const content = await fs.readFile(fullPath, 'utf-8');

      // 检查 oldString 是否存在
      if (!content.includes(oldString)) {
        throw new Error(`文件中未找到要替换的内容: ${oldString.substring(0, 50)}...`);
      }

      // 替换内容
      const newContent = task.replaceAll
        ? content.split(oldString).join(newString)
        : content.replace(oldString, newString);

      // 写回文件
      await fs.writeFile(fullPath, newContent, 'utf-8');

      return this.formatResult('general', task, {
        action: 'edit_file',
        filePath: filePath,
        fullPath: fullPath,
        success: true,
        replaceAll: task.replaceAll || false,
        oldLength: content.length,
        newLength: newContent.length,
        usedSandbox: !!context.sandbox
      });
    } catch (error) {
      return this.formatResult('general', task, null, error);
    }
  }

  /**
   * General Agent - 文件创建
   */
  async generalCreateFile(task, context) {
    const filePath = task.filePath;
    const content = task.content;

    if (!filePath || content === undefined) {
      throw new Error('文件创建需要指定 filePath, content');
    }

    // 使用沙箱路径（如果有）
    const workingDir = context.workingDir || this.workingDir;
    const fullPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(workingDir, filePath);

    try {
      // 检查文件是否已存在
      try {
        await fs.access(fullPath);
        if (!task.overwrite) {
          throw new Error(`文件已存在: ${filePath}。使用 overwrite: true 覆盖`);
        }
      } catch (error) {
        // 文件不存在，可以创建
      }

      // 确保目录存在
      const dir = path.dirname(fullPath);
      await fs.mkdir(dir, { recursive: true });

      // 写入文件
      await fs.writeFile(fullPath, content, 'utf-8');

      return this.formatResult('general', task, {
        action: 'create_file',
        filePath: filePath,
        fullPath: fullPath,
        success: true,
        size: content.length,
        overwritten: task.overwrite || false,
        usedSandbox: !!context.sandbox
      });
    } catch (error) {
      return this.formatResult('general', task, null, error);
    }
  }

  /**
   * General Agent - 命令执行
   */
  async generalRunCommand(task, context) {
    const command = task.command;

    if (!command) {
      throw new Error('命令执行需要指定 command');
    }

    // 使用沙箱路径（如果有）
    const workingDir = context.workingDir || this.workingDir;
    const options = {
      cwd: task.cwd || workingDir,
      timeout: task.timeout || 30000, // 默认30秒超时
      maxBuffer: task.maxBuffer || 1024 * 1024 // 默认1MB缓冲
    };

    try {
      const { stdout, stderr } = await execAsync(command, options);

      return this.formatResult('general', task, {
        action: 'run_command',
        command: command,
        success: true,
        stdout: stdout,
        stderr: stderr,
        cwd: options.cwd,
        usedSandbox: !!context.sandbox
      });
    } catch (error) {
      // 命令执行失败，但仍返回输出
      return this.formatResult('general', task, {
        action: 'run_command',
        command: command,
        success: false,
        stdout: error.stdout || '',
        stderr: error.stderr || '',
        exitCode: error.code,
        cwd: options.cwd,
        usedSandbox: !!context.sandbox
      }, error);
    }
  }

  /**
   * 执行 Inspector Agent
   */
  async executeInspectorAgent(task, context) {
    this.validateTask(task);

    switch (task.action) {
      case 'inspect':
        return await this.inspectorInspect(task, context);

      default:
        throw new Error(`Inspector Agent 不支持的操作: ${task.action}`);
    }
  }

  /**
   * Inspector Agent - 执行检查
   */
  async inspectorInspect(task, context) {
    const execution = task.execution;
    const analysis = task.analysis;

    if (!execution || !analysis) {
      throw new Error('检查需要指定 execution 和 analysis');
    }

    try {
      // 使用现有的 Inspector 类执行检查
      const inspectionResult = await this.inspector.inspect(
        execution,
        analysis,
        context
      );

      return this.formatResult('inspector', task, {
        action: 'inspect',
        inspection: inspectionResult,
        passed: inspectionResult.passed,
        checks: inspectionResult.checks,
        issues: inspectionResult.issues,
        recommendations: inspectionResult.recommendations
      });
    } catch (error) {
      return this.formatResult('inspector', task, null, error);
    }
  }

  /**
   * 执行 Supervisor Agent
   */
  async executeSupervisorAgent(task, context) {
    // Supervisor 不需要被执行，它是调度者
    throw new Error('Supervisor Agent 不能被执行');
  }

  /**
   * 验证任务参数
   */
  validateTask(task) {
    if (!task) {
      throw new Error('任务对象不能为空');
    }

    if (!task.action) {
      throw new Error('任务必须指定 action');
    }

    return true;
  }

  /**
   * 格式化执行结果
   */
  formatResult(agentId, task, result, error = null) {
    return {
      agentId: agentId,
      task: task,
      success: !error,
      result: result,
      error: error ? error.message : null,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 清理所有沙箱
   * @returns {Promise<number>} 清理的沙箱数量
   */
  async cleanup() {
    return await this.sandboxManager.cleanupAll();
  }

  /**
   * 获取沙箱统计信息
   * @returns {Object} 统计信息
   */
  getSandboxStats() {
    return this.sandboxManager.getStats();
  }

  /**
   * 获取执行监控统计信息
   * @returns {Object} 统计信息
   */
  getExecutionStats() {
    return this.executionMonitor.getStats();
  }

  /**
   * 获取执行历史
   * @param {Object} filter - 过滤条件
   * @returns {Array} 执行历史
   */
  getExecutionHistory(filter = {}) {
    return this.executionMonitor.getHistory(filter);
  }

  /**
   * 列出活跃执行
   * @returns {Array} 活跃执行列表
   */
  listActiveExecutions() {
    return this.executionMonitor.listActiveExecutions();
  }

  /**
   * 获取偏差检测统计信息
   * @returns {Object} 统计信息
   */
  getDeviationStats() {
    return this.deviationDetector.getStats();
  }

  /**
   * 获取偏差检测历史
   * @param {Object} filter - 过滤条件
   * @returns {Array} 检测历史
   */
  getDeviationHistory(filter = {}) {
    return this.deviationDetector.getDetectionHistory(filter);
  }

  /**
   * 获取告警列表
   * @param {Object} filter - 过滤条件
   * @returns {Array} 告警列表
   */
  getAlerts(filter = {}) {
    return this.deviationDetector.getAlerts(filter);
  }

  /**
   * 确认告警
   * @param {string} alertId - 告警ID
   * @returns {boolean} 是否成功
   */
  acknowledgeAlert(alertId) {
    return this.deviationDetector.acknowledgeAlert(alertId);
  }

  /**
   * 获取基线信息
   * @param {string} agentId - Agent ID
   * @param {string} taskAction - 任务动作
   * @returns {Object|null} 基线信息
   */
  getBaseline(agentId, taskAction) {
    return this.deviationDetector.getBaseline(agentId, taskAction);
  }

  /**
   * 列出所有基线
   * @returns {Array} 基线列表
   */
  listBaselines() {
    return this.deviationDetector.listBaselines();
  }

  /**
   * 获取错误统计
   * @returns {Object} 错误统计
   */
  getErrorStats() {
    return this.errorPatternRecognizer.getStats();
  }

  /**
   * 获取错误历史
   * @param {Object} filter - 过滤条件
   * @returns {Array} 错误历史
   */
  getErrorHistory(filter = {}) {
    return this.errorPatternRecognizer.getErrorHistory(filter);
  }

  /**
   * 获取错误模式列表
   * @param {Object} filter - 过滤条件
   * @returns {Array} 模式列表
   */
  getErrorPatterns(filter = {}) {
    return this.errorPatternRecognizer.getPatterns(filter);
  }

  /**
   * 获取重试统计
   * @returns {Object} 重试统计
   */
  getRetryStats() {
    return this.autoRetry.getStats();
  }

  /**
   * 获取重试历史
   * @param {Object} filter - 过滤条件
   * @returns {Array} 重试历史
   */
  getRetryHistory(filter = {}) {
    return this.autoRetry.getRetryHistory(filter);
  }

  /**
   * 重置断路器
   */
  resetCircuitBreaker() {
    this.autoRetry.resetCircuitBreaker();
  }

  /**
   * 获取自愈统计
   * @returns {Object} 自愈统计
   */
  getHealStats() {
    return this.selfHealing.getStats();
  }

  /**
   * 获取自愈历史
   * @param {Object} filter - 过滤条件
   * @returns {Array} 自愈历史
   */
  getHealHistory(filter = {}) {
    return this.selfHealing.getHealHistory(filter);
  }

  /**
   * 获取自愈策略列表
   * @param {string} category - 可选，指定类别
   * @returns {Array} 策略列表
   */
  getHealStrategies(category) {
    return this.selfHealing.getStrategies(category);
  }

  /**
   * 注册自定义自愈策略
   * @param {string} category - 错误类别
   * @param {Object} strategy - 策略对象
   */
  registerHealStrategy(category, strategy) {
    this.selfHealing.registerStrategy(category, strategy);
  }

  /**
   * 注册内置组件健康检查
   */
  _registerBuiltinHealthChecks() {
    // 沙箱管理器
    this.healthCheck.register('sandboxManager', {
      name: '沙箱管理器',
      critical: false,
      check: () => {
        const stats = this.sandboxManager.getStats();
        return {
          healthy: stats.activeSandboxes < (this.sandboxManager.config.maxSandboxes || 5),
          activeSandboxes: stats.activeSandboxes,
          totalCreated: stats.totalCreated
        };
      }
    });

    // 执行监控器
    this.healthCheck.register('executionMonitor', {
      name: '执行监控器',
      critical: true,
      check: () => {
        const stats = this.executionMonitor.getStats();
        const activeCount = this.executionMonitor.listActiveExecutions().length;
        return {
          healthy: activeCount < 50,
          totalExecutions: stats.totalExecutions,
          activeExecutions: activeCount
        };
      }
    });

    // 错误模式识别器
    this.healthCheck.register('errorPatternRecognizer', {
      name: '错误模式识别器',
      critical: false,
      check: () => {
        const stats = this.errorPatternRecognizer.getStats();
        return {
          healthy: true,
          totalErrors: stats.totalErrors,
          totalPatterns: stats.totalPatterns
        };
      }
    });

    // 自动重试
    this.healthCheck.register('autoRetry', {
      name: '自动重试',
      critical: false,
      check: () => {
        const stats = this.autoRetry.getStats();
        const cbState = stats.circuitBreaker?.state || 'closed';
        return {
          healthy: cbState !== 'open',
          circuitBreakerState: cbState,
          totalRetries: stats.totalRetries
        };
      }
    });

    // 自愈引擎
    this.healthCheck.register('selfHealing', {
      name: '自愈引擎',
      critical: false,
      check: () => {
        const stats = this.selfHealing.getStats();
        return {
          healthy: true,
          totalHeals: stats.totalHeals,
          healRate: stats.healRate,
          totalStrategies: stats.totalStrategies
        };
      }
    });
  }

  /**
   * 获取健康检查统计
   * @returns {Object}
   */
  getHealthStats() {
    return this.healthCheck.getStats();
  }

  /**
   * 执行健康检查
   * @returns {Promise<Object>}
   */
  async checkHealth() {
    return await this.healthCheck.checkAll();
  }

  /**
   * 获取健康检查历史
   * @param {Object} filter
   * @returns {Array}
   */
  getHealthHistory(filter = {}) {
    return this.healthCheck.getHistory(filter);
  }

  /**
   * 列出健康检查组件
   * @returns {Array}
   */
  listHealthComponents() {
    return this.healthCheck.listComponents();
  }

  /**
   * 注册自定义健康检查
   * @param {string} componentId
   * @param {Object} options
   */
  registerHealthCheck(componentId, options) {
    this.healthCheck.register(componentId, options);
  }

  // ========== 诊断报告 ==========

  /**
   * 生成诊断报告
   * @param {Object} options - { level: 'summary'|'standard'|'detailed', since, filter }
   * @returns {Object} 诊断报告
   */
  generateDiagnosticReport(options = {}) {
    return this.diagnosticReporter.generate(options);
  }

  /**
   * 获取诊断报告历史
   * @param {Object} filter
   * @returns {Array}
   */
  getDiagnosticHistory(filter = {}) {
    return this.diagnosticReporter.getReportHistory(filter);
  }

  /**
   * 格式化诊断报告为文本
   * @param {Object} report
   * @returns {string}
   */
  formatDiagnosticReport(report) {
    return this.diagnosticReporter.formatAsText(report);
  }

  /**
   * 注册自定义诊断段
   * @param {string} sectionId
   * @param {Object} options
   */
  registerDiagnosticSection(sectionId, options) {
    this.diagnosticReporter.registerSection(sectionId, options);
  }

  // ========== 跨平台协作方法 ==========

  /**
   * 获取平台信息
   * @returns {Object|null}
   */
  getPlatformInfo() {
    if (!this.enableCrossPlatform) return null;
    return this.platformDetector.detect();
  }

  /**
   * 获取跨平台分发统计
   * @returns {Object|null}
   */
  getCrossPlatformStats() {
    if (!this.enableCrossPlatform) return null;
    return this.crossPlatformDispatcher.getStats();
  }

  /**
   * 获取跨平台分发历史
   * @param {Object} filter
   * @returns {Array}
   */
  getCrossPlatformHistory(filter = {}) {
    if (!this.enableCrossPlatform) return [];
    return this.crossPlatformDispatcher.getHistory(filter);
  }

  /**
   * 获取领导权统计
   * @returns {Object|null}
   */
  getLeadershipStats() {
    if (!this.enableCrossPlatform) return null;
    return this.leadershipManager.getStats();
  }

  /**
   * 获取当前领导者
   * @returns {Object|null}
   */
  async getCurrentLeader() {
    if (!this.enableCrossPlatform) return null;
    return this.leadershipManager.getCurrentLeader();
  }

  /**
   * 获取 IPC 通道统计
   * @returns {Object|null}
   */
  getIPCStats() {
    if (!this.enableCrossPlatform) return null;
    return this.ipcChannel.getStats();
  }
}

module.exports = AgentExecutor;
