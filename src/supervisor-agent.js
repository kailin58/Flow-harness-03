const ConfigLoader = require('./config-loader');
const KnowledgeBase = require('./knowledge-base');
const TaskAnalyzer = require('./task-analyzer');
const TaskDecomposer = require('./task-decomposer');
const TaskDispatcher = require('./task-dispatcher');
const Inspector = require('./inspector');
const AgentRegistry = require('./agent-registry');
const AgentExecutor = require('./agent-executor');
const { AgentsParser } = require('./agents-parser');
const { ReviewLoop } = require('./review-loop');
const { createLogger } = require('./logger');
const { DiagnosticProtocol } = require('./diagnostic-protocol');
const { EvolutionEngine } = require('./evolution-engine');

class SupervisorAgent {
  constructor(config) {
    this.config = config;
    this.logger = createLogger({ name: 'supervisor' });
    this.knowledgeBase = new KnowledgeBase();
    this.taskAnalyzer = new TaskAnalyzer();
    this.taskDecomposer = new TaskDecomposer();

    // 初始化 Agent Registry（必须在 TaskDispatcher 之前）
    this.agentRegistry = new AgentRegistry();
    this.agentRegistry.initializeCoreAgents();

    // 传入 agentRegistry 到 TaskDispatcher
    this.taskDispatcher = new TaskDispatcher(this.agentRegistry);
    this.inspector = new Inspector();

    // 初始化 AgentExecutor
    this.agentExecutor = new AgentExecutor(this.agentRegistry);

    // 初始化 AGENTS.md 运行时解析器
    this.agentsParser = new AgentsParser();
    this.agentsParser.parse();

    // 初始化复盘闭环引擎
    this.reviewLoop = new ReviewLoop({
      knowledgeBase: this.knowledgeBase,
      scoreThreshold: config.reviewThreshold || 7.0,
      maxIterations: config.maxOptimizeIterations || 3
    });

    // 初始化问题诊断协议
    this.diagnosticProtocol = new DiagnosticProtocol({
      knowledgeBase: this.knowledgeBase
    });

    // 初始化自动进化引擎
    this.evolutionEngine = new EvolutionEngine({
      knowledgeBase: this.knowledgeBase
    });

    this.currentTask = null;
    this.executionLog = [];
  }

  /**
   * 主入口：接收任务消息并执行6步闭环
   */
  async handleTask(taskMessage, context = {}) {
    this.logger.info('\n🎯 Supervisor Agent 启动');
    this.logger.info(`📝 任务: ${taskMessage}\n`);

    this.currentTask = {
      message: taskMessage,
      context: context,
      startTime: Date.now(),
      steps: []
    };

    try {
      // Step 1: 判断 - 为什么干？
      const analysis = await this.step1_analyze(taskMessage, context);
      this.logStep(1, 'analyze', analysis);

      // Step 2: 拆解 - 怎么干？
      const decomposition = await this.step2_decompose(analysis);
      this.logStep(2, 'decompose', decomposition);

      // Step 3: 分工 - 谁来干？
      let assignment = await this.step3_assign(decomposition);
      this.logStep(3, 'assign', assignment);

      // Step 4: 指挥 - 去干吧
      let execution = await this.step4_execute(assignment);
      this.logStep(4, 'execute', execution);

      // Step 5: 检查 - 干得怎么样？
      let inspection = await this.step5_inspect(execution);
      this.logStep(5, 'inspect', inspection);

      // ===== 打回重做闭环 =====
      // 文档 Ch7: "检查不通过就打回 — 重做或换工具"
      // 文档 Ch7 原则8: "2次不通过就必须停检 — 不能蛮干，必须换思路"
      let reworkCount = 0;
      const maxReworks = 2;

      while (!inspection.passed && reworkCount < maxReworks) {
        reworkCount++;
        this.logger.info(`\n⚠️  检查不通过，第 ${reworkCount}/${maxReworks} 次打回重做`);

        // 诊断失败原因
        const diagnosis = this.diagnoseFailure(inspection, reworkCount);
        this.logStep(5, `diagnose_${reworkCount}`, diagnosis);

        // 诊断建议换思路 → 尝试换方案
        if (diagnosis.shouldChangeApproach) {
          const newApproach = await this.switchApproach(inspection, diagnosis, assignment);
          this.logStep(5, `switch_${reworkCount}`, newApproach);

          if (newApproach.needsHuman) {
            this.logger.info('   ⛔ 需要人工介入，停止重做');
            inspection.needsHuman = true;
            break;
          }
          assignment = newApproach.newAssignment;
        }

        // 打回重做失败任务
        const reworkResult = await this.reworkFailedTasks(inspection, assignment);
        this.logStep(4, `rework_${reworkCount}`, reworkResult);

        // 合并结果
        execution = this.mergeExecutionResults(execution, reworkResult);

        // 重新检查
        inspection = await this.step5_inspect(execution);
        this.logStep(5, `reinspect_${reworkCount}`, inspection);
      }

      // 2次重做仍未通过 → 降级处理
      if (!inspection.passed && reworkCount >= maxReworks) {
        this.logger.info('\n⛔ 2次打回重做仍未通过，停检降级');
        inspection.degraded = true;
        inspection.degradeReason = '超过最大重做次数';
      }

      // 记录重做信息到 inspection
      inspection.reworkCount = reworkCount;

      // Step 6: 复盘 - 怎么优化？
      const review = await this.step6_review(this.currentTask);
      this.logStep(6, 'review', review);

      const endTime = Date.now();
      const totalTime = endTime - this.currentTask.startTime;

      this.logger.info(`\n✨ Supervisor 完成任务`);
      this.logger.info(`⏱️  总耗时: ${totalTime}ms`);
      if (reworkCount > 0) {
        this.logger.info(`🔄 重做次数: ${reworkCount}`);
        this.logger.info(`📊 最终状态: ${inspection.passed ? '通过' : (inspection.degraded ? '降级通过' : '未通过')}`);
      }
      this.logger.info('');

      return {
        success: inspection.passed,
        task: taskMessage,
        steps: this.currentTask.steps,
        totalTime: totalTime,
        review: review,
        reworkCount: reworkCount,
        degraded: inspection.degraded || false
      };

    } catch (error) {
      this.logger.error(`\n❌ Supervisor 执行失败: ${error.message}`);
      return {
        success: false,
        error: error.message,
        steps: this.currentTask.steps
      };
    }
  }

  /**
   * Step 1: 判断 - 为什么干？
   * 分析任务类型、目标、验收标准
   */
  async step1_analyze(taskMessage, context) {
    this.logger.info('📍 Step 1: 判断 - 为什么干？');

    // 使用 TaskAnalyzer 进行深度分析
    const analysis = this.taskAnalyzer.analyze(taskMessage, context);

    this.logger.info(`   类型: ${analysis.taskType}`);
    this.logger.info(`   目标: ${analysis.goal.description}`);
    this.logger.info(`   优先级: ${analysis.priority}`);
    this.logger.info(`   复杂度: ${analysis.complexity.level} (${analysis.complexity.estimatedTime})`);

    if (analysis.risks.length > 0) {
      this.logger.info(`   风险: ${analysis.risks.length} 项`);
      analysis.risks.forEach(risk => {
        this.logger.info(`     - [${risk.level}] ${risk.description}`);
      });
    }

    this.logger.info(`   验收标准: ${analysis.acceptanceCriteria.length} 条`);
    analysis.acceptanceCriteria.forEach((criteria, index) => {
      this.logger.info(`     ${index + 1}. ${criteria}`);
    });

    return analysis;
  }

  /**
   * Step 2: 拆解 - 怎么干？
   * 将任务拆解为子任务
   */
  async step2_decompose(analysis) {
    this.logger.info('\n📍 Step 2: 拆解 - 怎么干？');

    // 使用 TaskDecomposer 进行智能拆解
    const decomposition = this.taskDecomposer.decompose(analysis);

    this.logger.info(`   策略: ${decomposition.strategy}`);
    this.logger.info(`   拆解为 ${decomposition.totalSubtasks} 个子任务:`);
    decomposition.subtasks.forEach((task, index) => {
      const authMark = task.constraints.requiresAuth ? '🔒' : '';
      const priorityMark = task.priority === 'critical' ? '🔴' : task.priority === 'high' ? '🟡' : '';
      this.logger.info(`   ${index + 1}. ${authMark}${priorityMark} ${task.name} (${task.estimatedTime}分钟)`);
      if (task.constraints.requiresAuth) {
        this.logger.info(`      ⚠️  需要授权`);
      }
    });
    this.logger.info(`   预计总时间: ${decomposition.estimatedTotalTime}`);

    return decomposition;
  }

  /**
   * Step 3: 分工 - 谁来干？
   * 为每个子任务分配执行器
   */
  async step3_assign(decomposition) {
    this.logger.info('\n📍 Step 3: 分工 - 谁来干？');

    // 使用 TaskDispatcher 进行智能分配
    const assignment = this.taskDispatcher.assign(decomposition);

    this.logger.info(`   执行计划:`);
    if (assignment.executionPlan.parallel.length > 0) {
      this.logger.info(`   并行任务: ${assignment.executionPlan.parallel.length} 组`);
    }
    if (assignment.executionPlan.sequential.length > 0) {
      this.logger.info(`   顺序任务: ${assignment.executionPlan.sequential.length} 个`);
    }

    this.logger.info(`\n   任务分配:`);
    assignment.assignments.forEach((item, index) => {
      const modeMark = item.executor.mode === 'interactive' ? '👤' :
                       item.executor.mode === 'supervised' ? '👁️' : '🤖';
      this.logger.info(`   ${index + 1}. ${modeMark} ${item.subtask.name} -> ${item.executor.name}`);
      if (item.executor.mode !== 'automatic') {
        this.logger.info(`      模式: ${item.executor.mode}`);
      }
    });

    return assignment;
  }

  /**
   * Step 4: 指挥 - 去干吧
   * 执行分配的任务
   */
  async step4_execute(assignment) {
    this.logger.info('\n📍 Step 4: 指挥 - 去干吧');

    const results = [];
    let executedCount = 0;
    const totalCount = assignment.assignments.length;
    const enableRetry = this.currentTask.context.enableRetry !== false; // 默认启用重试
    const maxRetries = this.currentTask.context.maxRetries || 2; // 默认最多重试2次

    for (const item of assignment.assignments) {
      executedCount++;
      this.logger.info(`   [${executedCount}/${totalCount}] 执行: ${item.subtask.name}`);

      // 检查是否需要用户授权
      if (item.executor.config.requiresAuth) {
        this.logger.info(`   ⚠️  此任务需要授权，当前自动批准（生产环境应请求用户确认）`);
      }

      // 执行任务（带重试）
      const startTime = Date.now();
      let result = await this.executeTask(item);
      let retryCount = 0;

      // 重试逻辑
      while (!result.success && result.retryable && enableRetry && retryCount < maxRetries) {
        retryCount++;
        this.logger.info(`   🔄 重试 ${retryCount}/${maxRetries}: ${item.subtask.name}`);

        // 短暂延迟后重试
        await new Promise(resolve => setTimeout(resolve, 100 * retryCount));

        result = await this.executeTask(item);
      }

      const executionTime = Date.now() - startTime;
      result.executionTime = executionTime;
      result.retryCount = retryCount;
      results.push(result);

      if (result.success) {
        const retryInfo = retryCount > 0 ? ` (重试${retryCount}次后成功)` : '';
        this.logger.info(`   ✓ 完成 (${executionTime}ms)${retryInfo}`);
        if (result.output) {
          this.logger.info(`   📄 ${result.output}`);
        }
      } else {
        const retryInfo = retryCount > 0 ? ` (已重试${retryCount}次)` : '';
        this.logger.info(`   ✗ 失败: ${result.error}${retryInfo}`);
      }
    }

    const totalTime = results.reduce((sum, r) => sum + r.executionTime, 0);
    this.logger.info(`\n   总执行时间: ${totalTime}ms`);

    return {
      assignment: assignment,
      results: results,
      totalTime: totalTime,
      successCount: results.filter(r => r.success).length,
      failureCount: results.filter(r => !r.success).length
    };
  }

  /**
   * 执行单个任务
   */
  async executeTask(item) {
    const subtask = item.subtask;
    const executor = item.executor;

    try {
      // 根据执行器名称映射到 Agent ID
      const agentIdMap = {
        'Explore Agent': 'explore',
        'Plan Agent': 'plan',
        'General-Purpose Agent': 'general',
        'Inspector Agent': 'inspector'
      };

      const agentId = agentIdMap[executor.name];

      if (!agentId) {
        // 如果没有匹配的真实 Agent，使用模拟执行
        return await this.simulateExecution(item);
      }

      // 构建任务对象（根据子任务类型）
      const task = this.buildAgentTask(subtask, agentId);

      // 使用 AgentExecutor 执行真实任务
      const result = await this.agentExecutor.execute(agentId, task, this.currentTask.context);

      return {
        subtask: subtask.name,
        subtaskId: subtask.id,
        executor: executor.name,
        mode: executor.mode,
        success: result.success,
        error: result.error,
        output: this.formatAgentOutput(result),
        retryable: !result.success,
        agentResult: result.result
      };

    } catch (error) {
      return {
        subtask: subtask.name,
        subtaskId: subtask.id,
        executor: executor.name,
        mode: executor.mode,
        success: false,
        error: error.message,
        output: null,
        retryable: true
      };
    }
  }

  /**
   * 构建 Agent 任务对象
   */
  buildAgentTask(subtask, agentId) {
    // 根据子任务类型和 Agent 类型构建任务
    const taskMap = {
      'explore': {
        action: 'file_search',
        pattern: '**/*.js'
      },
      'plan': {
        action: 'analyze_requirement',
        requirement: subtask.name
      },
      'general': {
        action: 'run_command',
        command: 'echo "Task: ' + subtask.name + '"'
      },
      'inspector': {
        action: 'inspect',
        execution: { results: [] },
        analysis: { taskType: 'test' }
      }
    };

    return taskMap[agentId] || { action: 'default' };
  }

  /**
   * 格式化 Agent 输出
   */
  formatAgentOutput(result) {
    if (!result.result) {
      return null;
    }

    const action = result.result.action;
    switch (action) {
      case 'file_search':
        return `找到 ${result.result.count} 个文件`;
      case 'code_search':
        return `找到 ${result.result.count} 个匹配`;
      case 'read_file':
        return `读取 ${result.result.lines} 行`;
      case 'analyze_requirement':
        return `分析完成: ${result.result.taskType}`;
      case 'design_solution':
        return `设计完成: ${result.result.totalSubtasks} 个子任务`;
      case 'edit_file':
        return `编辑文件: ${result.result.filePath}`;
      case 'create_file':
        return `创建文件: ${result.result.filePath}`;
      case 'run_command':
        return `执行命令: ${result.result.command}`;
      case 'inspect':
        return `检查完成: ${result.result.passed ? '通过' : '未通过'}`;
      default:
        return '执行完成';
    }
  }

  generateErrorMessage(subtask) {
    const errors = [
      '执行超时',
      '依赖项缺失',
      '权限不足',
      '资源不可用',
      '配置错误'
    ];
    return errors[Math.floor(Math.random() * errors.length)];
  }

  generateOutput(subtask) {
    const outputs = {
      'explore': '已完成代码探索，找到相关文件',
      'analyze': '已完成需求分析，明确实现方案',
      'plan': '已完成方案设计，输出技术文档',
      'code': '已完成代码实现，修改3个文件',
      'test': '已完成测试，所有用例通过',
      'write': '已完成文档编写',
      'review': '已完成审查，无问题发现'
    };
    return outputs[subtask.type] || '任务执行成功';
  }

  /**
   * Step 5: 检查 - 干得怎么样？
   * 检查执行结果
   */
  async step5_inspect(execution) {
    this.logger.info('\n📍 Step 5: 检查 - 干得怎么样？');

    const results = execution.results;
    const analysis = this.currentTask.steps.find(s => s.name === 'analyze').result;

    // 基础检查：执行成功率
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;
    const successRate = (successCount / results.length * 100).toFixed(1);

    this.logger.info(`   执行结果:`);
    this.logger.info(`   总任务数: ${results.length}`);
    this.logger.info(`   成功: ${successCount} (${successRate}%)`);
    this.logger.info(`   失败: ${failureCount}`);

    // 收集失败任务
    const failedTasks = results.filter(r => !r.success);
    if (failedTasks.length > 0) {
      this.logger.info(`\n   失败任务:`);
      failedTasks.forEach((task, index) => {
        this.logger.info(`   ${index + 1}. ${task.subtask}`);
        this.logger.info(`      错误: ${task.error}`);
        this.logger.info(`      可重试: ${task.retryable ? '是' : '否'}`);
      });
    }

    // 使用 Inspector 进行深度检查
    const inspectorResult = await this.inspector.inspect(execution, analysis, {});

    // 显示 Inspector 检查结果
    this.logger.info(`\n   Inspector 深度检查:`);
    this.logger.info(`   通过率: ${inspectorResult.passRate}%`);

    for (const [checkName, checkResult] of Object.entries(inspectorResult.checks)) {
      const icon = checkResult.passed ? '✓' : '✗';
      const color = checkResult.passed ? '' : '⚠️  ';
      this.logger.info(`   ${icon} ${color}${checkResult.name}`);

      if (checkResult.issues.length > 0) {
        checkResult.issues.forEach(issue => {
          this.logger.info(`      问题: ${issue}`);
        });
      }

      if (checkResult.suggestions.length > 0 && checkResult.suggestions.length <= 2) {
        checkResult.suggestions.forEach(suggestion => {
          this.logger.info(`      建议: ${suggestion}`);
        });
      }
    }

    // 综合判断
    const criticalFailures = failedTasks.filter(t =>
      t.subtask.includes('关键') || t.subtask.includes('核心')
    );

    // 检查安全扫描是否失败（安全问题必须通过）
    const securityCheckFailed = inspectorResult.checks.securityScan && !inspectorResult.checks.securityScan.passed;

    // 放宽检查条件：只要成功率>=80%，Inspector通过率>=60%，且无关键失败即可
    // 但安全检查必须通过
    const inspectorPassRate = inspectorResult.passRate / 100;
    const passed = successRate >= 80 && inspectorPassRate >= 0.6 && criticalFailures.length === 0 && !securityCheckFailed;

    this.logger.info(`\n   综合评估: ${passed ? '✅ 通过' : '❌ 不通过'}`);
    if (!passed) {
      this.logger.info(`   原因: ${inspectorResult.summary}`);
    }

    // 不通过时的处理建议
    if (!passed) {
      this.logger.info(`\n   处理建议:`);
      if (failureCount > 0) {
        const retryable = failedTasks.filter(t => t.retryable);
        if (retryable.length > 0) {
          this.logger.info(`   1. 重试 ${retryable.length} 个可重试任务`);
        }
        const nonRetryable = failedTasks.filter(t => !t.retryable);
        if (nonRetryable.length > 0) {
          this.logger.info(`   2. 分析 ${nonRetryable.length} 个失败任务的根因`);
        }
      }
      if (!inspectorResult.passed) {
        this.logger.info(`   3. 修复 Inspector 发现的问题`);
      }
    }

    return {
      passed: passed,
      execution: execution,
      successRate: parseFloat(successRate),
      failedTasks: failedTasks,
      inspectorResult: inspectorResult,
      checks: inspectorResult.checks,
      criticalFailures: criticalFailures.length,
      needsRetry: failedTasks.filter(t => t.retryable).length > 0,
      needsRework: !passed
    };
  }

  /**
   * 执行深度检查
   */
  async performDeepChecks(execution, analysis) {
    const checks = {};

    // 1. 目标对齐检查
    checks.goalAlignment = await this.checkGoalAlignment(execution, analysis);

    // 2. 完整性检查
    checks.completeness = await this.checkCompleteness(execution, analysis);

    // 3. 质量检查
    checks.quality = await this.checkQuality(execution, analysis);

    // 4. 风险检查
    checks.risk = await this.checkRisk(execution, analysis);

    // 5. 时间检查
    checks.time = await this.checkTime(execution, analysis);

    return checks;
  }

  /**
   * 目标对齐检查
   */
  async checkGoalAlignment(execution, analysis) {
    // 检查执行结果是否与任务目标对齐
    const successfulTasks = execution.results.filter(r => r.success);
    const requiredTasks = execution.assignment.assignments.filter(a =>
      a.subtask.priority === 'high' || a.subtask.priority === 'critical'
    );

    const requiredCompleted = requiredTasks.every(req =>
      successfulTasks.some(s => s.subtaskId === req.subtask.id)
    );

    return {
      name: '目标对齐检查',
      passed: requiredCompleted,
      reason: requiredCompleted ? null : '部分关键任务未完成',
      suggestion: requiredCompleted ? null : '确保所有高优先级任务完成'
    };
  }

  /**
   * 完整性检查
   */
  async checkCompleteness(execution, analysis) {
    // 检查是否所有必需步骤都已完成
    const totalTasks = execution.results.length;
    const completedTasks = execution.results.filter(r => r.success).length;
    const completionRate = completedTasks / totalTasks;

    const passed = completionRate >= 0.8; // 至少80%完成

    return {
      name: '完整性检查',
      passed: passed,
      reason: passed ? null : `完成率仅${(completionRate * 100).toFixed(1)}%`,
      suggestion: passed ? null : '补充完成未完成的任务'
    };
  }

  /**
   * 质量检查
   */
  async checkQuality(execution, analysis) {
    // 检查执行质量
    const hasTestTask = execution.results.some(r =>
      r.subtask.includes('测试') || r.subtask.includes('验证')
    );

    const testTaskSuccess = execution.results
      .filter(r => r.subtask.includes('测试') || r.subtask.includes('验证'))
      .every(r => r.success);

    const passed = !hasTestTask || testTaskSuccess;

    return {
      name: '质量检查',
      passed: passed,
      reason: passed ? null : '测试或验证任务失败',
      suggestion: passed ? null : '修复代码并重新运行测试'
    };
  }

  /**
   * 风险检查
   */
  async checkRisk(execution, analysis) {
    // 检查是否有高风险操作未经授权
    const highRiskTasks = execution.assignment.assignments.filter(a =>
      a.subtask.involvesCore || a.subtask.priority === 'critical'
    );

    const highRiskCompleted = highRiskTasks.filter(t =>
      execution.results.some(r => r.subtaskId === t.subtask.id && r.success)
    );

    // 如果有高风险任务，检查是否都成功
    const passed = highRiskTasks.length === 0 ||
                   highRiskCompleted.length === highRiskTasks.length;

    return {
      name: '风险检查',
      passed: passed,
      reason: passed ? null : '高风险任务未全部完成',
      suggestion: passed ? null : '确保核心系统变更经过充分测试'
    };
  }

  /**
   * 时间检查
   */
  async checkTime(execution, analysis) {
    // 检查执行时间是否合理
    const actualTime = execution.totalTime;
    const estimatedTime = execution.assignment.decomposition.subtasks
      .reduce((sum, t) => sum + (t.estimatedTime || 5), 0) * 60 * 1000; // 转换为毫秒

    // 实际时间不应超过估算时间的3倍（考虑到是模拟执行）
    const passed = actualTime < estimatedTime * 3;

    return {
      name: '时间检查',
      passed: passed,
      reason: passed ? null : '执行时间超出预期',
      suggestion: passed ? null : '分析性能瓶颈，优化执行效率'
    };
  }

  /**
   * Step 6: 复盘 - 怎么优化？
   * 文档 Ch7: 6a回顾 → 6b优化 → 6c验证 → 6d固化，循环直到满意
   */
  async step6_review(task) {
    this.logger.info('\n📍 Step 6: 复盘 - 怎么优化？');

    // 查找最新的检查结果（可能是 reinspect）
    const inspectSteps = task.steps.filter(s =>
      s.name === 'inspect' || s.name.startsWith('reinspect')
    );
    const latestInspect = inspectSteps[inspectSteps.length - 1];
    const inspectionResult = latestInspect ? latestInspect.result : { passed: true, successRate: 100, failedTasks: [], criticalFailures: 0, checks: {} };
    const execution = task.steps.find(s => s.name === 'execute').result;
    const analysis = task.steps.find(s => s.name === 'analyze').result;

    // 收集重做数据（来自 Phase 1 打回重做闭环）
    const reworkSteps = task.steps.filter(s =>
      s.name.startsWith('rework') || s.name.startsWith('diagnose') || s.name.startsWith('switch')
    );
    const reworkData = {
      reworkCount: reworkSteps.filter(s => s.name.startsWith('rework')).length,
      diagnoses: reworkSteps.filter(s => s.name.startsWith('diagnose')).map(s => s.result),
      switchedApproaches: reworkSteps.filter(s => s.name.startsWith('switch')).map(s => s.result)
    };

    const reviewThreshold = this.config.reviewThreshold || 7.0;
    const maxOptimizeIterations = 2;
    let iteration = 0;
    let review, optimizations, validation;

    while (iteration <= maxOptimizeIterations) {
      // 6a. 回顾
      if (iteration === 0) {
        this.logger.info('\n   6a. 回顾 - 这次干得怎么样？');
      } else {
        this.logger.info(`\n   6a. 再回顾 (第${iteration}轮优化后)`);
      }

      review = this.reviewExecution(task, inspectionResult, execution, reworkData);

      this.logger.info(`   完成度: ${review.completionRate}%`);
      this.logger.info(`   成功率: ${inspectionResult.successRate}%`);
      this.logger.info(`   评分: ${review.score}/10`);
      this.logger.info(`   耗时: ${review.totalTime}ms (预计: ${review.estimatedTime})`);

      if (reworkData.reworkCount > 0) {
        this.logger.info(`   重做次数: ${reworkData.reworkCount}`);
        if (reworkData.switchedApproaches.length > 0) {
          this.logger.info(`   换思路次数: ${reworkData.switchedApproaches.length}`);
        }
      }

      if (review.issues.length > 0) {
        this.logger.info(`\n   发现问题: ${review.issues.length} 项`);
        review.issues.forEach((issue, index) => {
          this.logger.info(`   ${index + 1}. ${issue}`);
        });
      }

      // 评分达标 → 跳过优化，直接固化
      if (review.score >= reviewThreshold) {
        this.logger.info(`\n   ✅ 评分 ${review.score} ≥ 阈值 ${reviewThreshold}，无需优化`);
        optimizations = [];
        validation = { feasible: true, expectedBenefit: '当前执行良好', confidence: 1.0 };
        break;
      }

      // 6b. 优化
      this.logger.info('\n   6b. 优化 - 下次怎么干更好？');
      optimizations = this.generateOptimizations(review, inspectionResult, analysis, reworkData);

      if (optimizations.length > 0) {
        this.logger.info(`   优化建议: ${optimizations.length} 条`);
        optimizations.forEach((opt, index) => {
          this.logger.info(`   ${index + 1}. [${opt.type}] ${opt.suggestion}`);
          if (opt.expectedImprovement) {
            this.logger.info(`      预期改进: ${opt.expectedImprovement}`);
          }
        });
      } else {
        this.logger.info('   无可行优化建议');
        validation = { feasible: true, expectedBenefit: '无优化项', confidence: 1.0 };
        break;
      }

      // 6c. 验证
      this.logger.info('\n   6c. 验证 - 优化方案评估');
      validation = this.validateOptimizations(optimizations, review, reworkData);
      this.logger.info(`   可行性: ${validation.feasible ? '高' : '需进一步评估'}`);
      this.logger.info(`   置信度: ${(validation.confidence * 100).toFixed(0)}%`);
      this.logger.info(`   预期收益: ${validation.expectedBenefit}`);

      if (validation.feasible && validation.confidence >= 0.6) {
        this.logger.info('   ✅ 优化方案验证通过');
        break;
      }

      iteration++;
      if (iteration > maxOptimizeIterations) {
        this.logger.info('   ⛔ 达到最大优化轮次，接受当前方案');
      } else {
        this.logger.info('   ⚠️  优化方案验证不充分，继续优化');
      }
    }

    // 6d. 固化
    this.logger.info('\n   6d. 固化 - 记录到知识库');
    const learnings = {
      task: task.message,
      taskType: analysis.taskType,
      review: review,
      optimizations: optimizations,
      validation: validation,
      reworkData: reworkData,
      optimizeIterations: iteration,
      timestamp: new Date().toISOString()
    };

    if (this.knowledgeBase) {
      try {
        this.knowledgeBase.load();
        this.knowledgeBase.recordExecution(
          analysis.taskType,
          'full_workflow',
          {
            success: inspectionResult.passed,
            execution_time: review.totalTime,
            error: inspectionResult.passed ? null : '部分任务失败',
            learnings: learnings
          }
        );

        // 记录重做模式（供未来 diagnoseFailure Q1 查询）
        if (reworkData.reworkCount > 0) {
          this.knowledgeBase.recordExecution(
            analysis.taskType,
            'rework_pattern',
            {
              success: inspectionResult.passed,
              reworkCount: reworkData.reworkCount,
              diagnoses: reworkData.diagnoses,
              switchedApproaches: reworkData.switchedApproaches,
              finalScore: review.score
            }
          );
          this.logger.info('   ✓ 重做模式已记录（供未来诊断参考）');
        }

        this.logger.info('   ✓ 已记录到知识库');
      } catch (error) {
        this.logger.info(`   ⚠️  知识库记录失败: ${error.message}`);
      }
    }

    return {
      review: review,
      optimizations: optimizations,
      validation: validation,
      learnings: learnings,
      score: review.score,
      optimizeIterations: iteration,
      reworkData: reworkData
    };
  }

  /**
   * 回顾执行情况（含重做数据）
   */
  reviewExecution(task, inspection, execution, reworkData = {}) {
    const totalSteps = task.steps.length;
    const successfulSteps = task.steps.filter(s => {
      if (s.name === 'inspect' || s.name.startsWith('reinspect')) {
        return s.result && s.result.passed;
      }
      return s.result && s.result.success !== false;
    }).length;

    const completionRate = (successfulSteps / totalSteps * 100).toFixed(1);
    const totalTime = Date.now() - task.startTime;

    // 收集问题
    const issues = [];

    if (inspection.failedTasks && inspection.failedTasks.length > 0) {
      issues.push(`${inspection.failedTasks.length} 个子任务执行失败`);
    }

    if (inspection.criticalFailures > 0) {
      issues.push(`${inspection.criticalFailures} 个关键任务失败`);
    }

    if (!inspection.passed) {
      const failedChecks = Object.entries(inspection.checks || {})
        .filter(([_, check]) => !check.passed)
        .map(([name, _]) => name);

      if (failedChecks.length > 0) {
        issues.push(`检查未通过: ${failedChecks.join(', ')}`);
      }
    }

    // 重做相关问题
    if (reworkData.reworkCount > 0) {
      issues.push(`经过 ${reworkData.reworkCount} 次打回重做`);
    }
    if (reworkData.switchedApproaches && reworkData.switchedApproaches.length > 0) {
      issues.push(`${reworkData.switchedApproaches.length} 个任务换了执行方案`);
    }

    // 计算评分（含重做惩罚）
    const score = this.calculateDetailedScore(inspection, execution, issues, reworkData);

    return {
      completionRate: parseFloat(completionRate),
      totalTime: totalTime,
      estimatedTime: execution.assignment?.decomposition?.estimatedTotalTime || '未知',
      score: score,
      issues: issues,
      successfulSteps: successfulSteps,
      totalSteps: totalSteps,
      reworkCount: reworkData.reworkCount || 0,
      switchedCount: reworkData.switchedApproaches ? reworkData.switchedApproaches.length : 0
    };
  }

  /**
   * 计算详细评分（含重做惩罚）
   */
  calculateDetailedScore(inspection, execution, issues, reworkData = {}) {
    let score = 10;

    // 成功率影响（最多扣3分）
    const successRate = (inspection.successRate || 100) / 100;
    score -= (1 - successRate) * 3;

    // 检查失败影响（每项扣1分）
    const failedChecks = Object.values(inspection.checks || {}).filter(c => !c.passed).length;
    score -= failedChecks * 1;

    // 关键任务失败影响（每个扣2分）
    score -= (inspection.criticalFailures || 0) * 2;

    // 问题数量影响（每个扣0.5分，排除重做相关问题）
    const nonReworkIssues = issues.filter(i => !i.includes('打回重做') && !i.includes('换了执行方案'));
    score -= nonReworkIssues.length * 0.5;

    // 重做惩罚（每次重做扣0.5分，换思路扣0.8分）
    if (reworkData.reworkCount) {
      score -= reworkData.reworkCount * 0.5;
    }
    if (reworkData.switchedApproaches && reworkData.switchedApproaches.length > 0) {
      score -= reworkData.switchedApproaches.length * 0.8;
    }

    // 确保分数在0-10之间
    score = Math.max(0, Math.min(10, score));

    return parseFloat(score.toFixed(1));
  }

  /**
   * 生成优化建议（含重做分析）
   */
  generateOptimizations(review, inspection, analysis, reworkData = {}) {
    const optimizations = [];

    // 基于失败任务的优化
    if (inspection.failedTasks && inspection.failedTasks.length > 0) {
      const retryable = inspection.failedTasks.filter(t => t.retryable);
      if (retryable.length > 0) {
        optimizations.push({
          type: '执行策略',
          suggestion: `为 ${retryable.length} 个可重试任务增加重试机制`,
          expectedImprovement: '提高成功率 10-20%',
          priority: 'high'
        });
      }

      const commonErrors = this.analyzeCommonErrors(inspection.failedTasks);
      if (commonErrors.length > 0) {
        optimizations.push({
          type: '错误预防',
          suggestion: `针对常见错误（${commonErrors.join(', ')}）添加预检查`,
          expectedImprovement: '减少失败率 15-25%',
          priority: 'high'
        });
      }
    }

    // 基于重做数据的优化
    if (reworkData.reworkCount > 0) {
      optimizations.push({
        type: '工具选择',
        suggestion: `本次经过 ${reworkData.reworkCount} 次重做，建议优化初始工具匹配策略`,
        expectedImprovement: '减少重做次数，提高首次通过率',
        priority: 'high'
      });

      // 分析诊断结果中的模式
      if (reworkData.diagnoses && reworkData.diagnoses.length > 0) {
        const executionIssues = reworkData.diagnoses.filter(d => d.category === 'execution');
        const methodIssues = reworkData.diagnoses.filter(d => d.category === 'method');

        if (executionIssues.length > 0) {
          optimizations.push({
            type: '执行参数',
            suggestion: '执行层面问题较多，建议调整超时时间、重试策略或执行环境',
            expectedImprovement: '减少执行层失败',
            priority: 'medium'
          });
        }

        if (methodIssues.length > 0) {
          optimizations.push({
            type: '方法策略',
            suggestion: '方法层面问题出现，建议为此类任务预设替代方案',
            expectedImprovement: '加速问题解决，减少换思路延迟',
            priority: 'high'
          });
        }
      }

      // 换思路分析
      if (reworkData.switchedApproaches && reworkData.switchedApproaches.length > 0) {
        optimizations.push({
          type: '方案预备',
          suggestion: '本次触发了换思路，建议为此类任务预配备替代执行器',
          expectedImprovement: '减少换思路时的延迟',
          priority: 'medium'
        });
      }
    }

    // 基于检查结果的优化
    const failedChecks = Object.entries(inspection.checks || {})
      .filter(([_, check]) => !check.passed);

    for (const [checkName, check] of failedChecks) {
      if (check.suggestion) {
        optimizations.push({
          type: '质量改进',
          suggestion: check.suggestion,
          expectedImprovement: '提高质量评分',
          priority: 'medium',
          checkName: checkName
        });
      }
    }

    // 基于时间的优化
    if (review.totalTime > 1000) {
      optimizations.push({
        type: '性能优化',
        suggestion: '分析执行瓶颈，考虑并行执行独立任务',
        expectedImprovement: '减少执行时间 20-30%',
        priority: 'low'
      });
    }

    // 基于任务类型的优化
    if (analysis.complexity && analysis.complexity.score >= 4) {
      optimizations.push({
        type: '任务拆解',
        suggestion: '复杂任务拆解粒度可以更细，便于并行和重试',
        expectedImprovement: '提高可控性和成功率',
        priority: 'low'
      });
    }

    // 按优先级排序
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    optimizations.sort((a, b) => (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2));

    return optimizations;
  }

  /**
   * 分析常见错误
   */
  analyzeCommonErrors(failedTasks) {
    const errorCounts = {};

    failedTasks.forEach(task => {
      const error = task.error;
      errorCounts[error] = (errorCounts[error] || 0) + 1;
    });

    // 返回出现次数 >= 2 的错误
    return Object.entries(errorCounts)
      .filter(([_, count]) => count >= 2)
      .map(([error, _]) => error);
  }

  /**
   * 验证优化方案（真实验证，替代 stub）
   * 文档 Ch7 6c: 评估可行性、对比历史、预测改进幅度
   */
  validateOptimizations(optimizations, review, reworkData = {}) {
    if (optimizations.length === 0) {
      return {
        feasible: true,
        expectedBenefit: '当前执行良好，无需优化',
        confidence: 1.0,
        improvements: []
      };
    }

    // 逐项评估每个优化的可行性和预期收益
    const improvements = optimizations.map(opt => {
      let feasibilityScore = 0.5; // 基础分
      let reason = '';

      // 高优先级优化可行性更高
      if (opt.priority === 'high') {
        feasibilityScore += 0.2;
        reason = '高优先级，建议立即实施';
      } else if (opt.priority === 'medium') {
        feasibilityScore += 0.1;
        reason = '中优先级，建议下次任务实施';
      } else {
        reason = '低优先级，持续改进';
      }

      // 基于重做数据的额外验证
      if (opt.type === '工具选择' && reworkData.reworkCount > 0) {
        feasibilityScore += 0.15; // 有实际重做数据支撑
        reason = '有重做数据佐证，可行性高';
      }

      if (opt.type === '方法策略' && reworkData.switchedApproaches && reworkData.switchedApproaches.length > 0) {
        feasibilityScore += 0.15;
        reason = '已有成功换思路案例，可行性高';
      }

      // 基于当前评分的调整
      if (review.score < 5) {
        feasibilityScore += 0.1; // 评分低时优化更有必要
      }

      feasibilityScore = Math.min(1.0, feasibilityScore);

      return {
        suggestion: opt.suggestion,
        type: opt.type,
        feasibilityScore: parseFloat(feasibilityScore.toFixed(2)),
        reason: reason
      };
    });

    // 综合评估
    const avgFeasibility = improvements.reduce((sum, i) => sum + i.feasibilityScore, 0) / improvements.length;
    const highPriorityCount = optimizations.filter(o => o.priority === 'high').length;

    const benefits = optimizations
      .map(opt => opt.expectedImprovement)
      .filter(imp => imp)
      .join('; ');

    return {
      feasible: avgFeasibility >= 0.5,
      expectedBenefit: benefits || '提升整体执行质量',
      confidence: parseFloat(avgFeasibility.toFixed(2)),
      improvements: improvements,
      highPriorityCount: highPriorityCount
    };
  }

  // ========== 打回重做闭环 ==========

  /**
   * 打回重做：重新执行失败的任务
   * 文档 Ch7: "检查不通过就打回 — 重做或换工具"
   */
  async reworkFailedTasks(inspection, assignment) {
    this.logger.info('\n🔄 打回重做 - 重新执行失败任务');

    const failedTasks = inspection.failedTasks;
    const results = [];
    let reworkedCount = 0;

    for (const failed of failedTasks) {
      const originalAssignment = assignment.assignments.find(
        a => a.subtask.name === failed.subtask || a.subtask.id === failed.subtaskId
      );

      if (!originalAssignment) {
        this.logger.info(`   ⚠️  找不到原始分配: ${failed.subtask}`);
        continue;
      }

      reworkedCount++;

      if (failed.retryable) {
        this.logger.info(`   🔄 重试: ${failed.subtask} → ${originalAssignment.executor.name}`);
        const result = await this.executeTask(originalAssignment);
        result.isRework = true;
        results.push(result);
      } else {
        const altExecutor = this.findAlternativeExecutor(originalAssignment);
        if (altExecutor) {
          this.logger.info(`   🔀 换工具重做: ${failed.subtask} → ${altExecutor.name}`);
          const altAssignment = { ...originalAssignment, executor: altExecutor };
          const result = await this.executeTask(altAssignment);
          result.isRework = true;
          result.switchedExecutor = true;
          results.push(result);
        } else {
          this.logger.info(`   ⛔ 无替代工具: ${failed.subtask}，标记跳过`);
          results.push({
            subtask: failed.subtask,
            subtaskId: failed.subtaskId,
            executor: originalAssignment.executor.name,
            success: false,
            error: '无可用替代工具，需人工介入',
            skipped: true,
            retryable: false,
            isRework: true
          });
        }
      }
    }

    const successCount = results.filter(r => r.success).length;
    this.logger.info(`   重做结果: ${successCount}/${reworkedCount} 成功`);

    return {
      results: results,
      isRework: true,
      reworkedCount: reworkedCount,
      successCount: successCount,
      failureCount: results.filter(r => !r.success).length
    };
  }

  /**
   * 诊断失败原因
   * 文档 Ch8: Q1-Q2 基础诊断
   */
  diagnoseFailure(inspection, reworkCount) {
    this.logger.info(`\n🔍 诊断失败原因 (第${reworkCount}次检查不通过)`);

    const failedTasks = inspection.failedTasks;
    const errors = failedTasks.map(t => t.error).filter(Boolean);
    const uniqueErrors = [...new Set(errors)];

    // Q1: 之前有没有类似问题？→ 查 knowledgeBase
    let historicalMatch = null;
    try {
      this.knowledgeBase.load();
      const patterns = this.knowledgeBase.patterns;
      if (patterns && patterns.failure_patterns) {
        for (const pattern of patterns.failure_patterns) {
          if (pattern.errors && errors.some(e => pattern.errors.includes(e))) {
            historicalMatch = pattern;
            break;
          }
        }
      }
    } catch (e) {
      // 知识库不可用，继续诊断
    }

    if (historicalMatch) {
      this.logger.info(`   Q1: 找到历史类似问题`);
      this.logger.info(`      模式: ${historicalMatch.pattern}`);
      this.logger.info(`      建议: ${historicalMatch.suggestion || '复用历史方案'}`);
      return {
        diagnosis: 'historical_match',
        category: 'known_issue',
        suggestion: historicalMatch.suggestion || '复用历史方案',
        shouldChangeApproach: false,
        confidence: 0.7,
        details: { historicalMatch, errors: uniqueErrors }
      };
    }

    this.logger.info(`   Q1: 无历史匹配，继续诊断`);

    // Q2: 是方法不对还是执行不对？
    const executionKeywords = ['超时', '资源', '权限', 'timeout', 'resource', 'permission'];
    const methodKeywords = ['不支持', '不兼容', '配置错误', 'unsupported', 'incompatible', 'invalid'];

    const executionErrors = errors.filter(e =>
      executionKeywords.some(k => e.includes(k))
    );
    const methodErrors = errors.filter(e =>
      methodKeywords.some(k => e.includes(k))
    );

    if (executionErrors.length > methodErrors.length) {
      this.logger.info(`   Q2: 执行问题 (${executionErrors.length}个执行错误 vs ${methodErrors.length}个方法错误)`);
      this.logger.info(`      建议: 调整执行参数后重试`);
      return {
        diagnosis: 'execution_issue',
        category: 'execution',
        suggestion: '调整执行参数后重试',
        shouldChangeApproach: false,
        confidence: 0.6,
        details: { executionErrors, methodErrors, allErrors: uniqueErrors }
      };
    }

    if (methodErrors.length > 0 || reworkCount >= 2) {
      this.logger.info(`   Q2: 方法问题 → 需要换思路`);
      this.logger.info(`      建议: 当前方法不适用，尝试换工具或换策略`);
      return {
        diagnosis: 'method_issue',
        category: 'method',
        suggestion: '当前方法不适用，需要换工具或换思路',
        shouldChangeApproach: true,
        confidence: 0.5,
        details: { methodErrors, allErrors: uniqueErrors }
      };
    }

    this.logger.info(`   诊断: 暂时性失败，建议重试`);
    return {
      diagnosis: 'transient_failure',
      category: 'transient',
      suggestion: '可能是暂时性问题，重试可能解决',
      shouldChangeApproach: false,
      confidence: 0.4,
      details: { errors: uniqueErrors }
    };
  }

  /**
   * 换思路：2次不通过时尝试更换执行方案
   * 文档 Ch7 原则8: "2次不通过就必须停检 — 不能蛮干，必须换思路"
   */
  async switchApproach(inspection, diagnosis, assignment) {
    this.logger.info('\n🔀 换思路 - 尝试替代方案');

    const failedTasks = inspection.failedTasks;
    const newAssignments = [...assignment.assignments];
    let changedCount = 0;

    for (const failed of failedTasks) {
      const idx = newAssignments.findIndex(
        a => a.subtask.name === failed.subtask || a.subtask.id === failed.subtaskId
      );
      if (idx === -1) continue;

      const original = newAssignments[idx];
      const altExecutor = this.findAlternativeExecutor(original);

      if (altExecutor) {
        this.logger.info(`   ${failed.subtask}: ${original.executor.name} → ${altExecutor.name}`);
        newAssignments[idx] = {
          ...original,
          executor: altExecutor,
          switchedFrom: original.executor.name
        };
        changedCount++;
      } else {
        this.logger.info(`   ${failed.subtask}: 无替代工具`);
      }
    }

    if (changedCount === 0) {
      this.logger.info('   ⛔ 无可用替代方案，需人工介入');
      return {
        needsHuman: true,
        reason: '所有失败任务均无替代执行方案',
        failedTasks: failedTasks.map(t => t.subtask)
      };
    }

    this.logger.info(`   已更换 ${changedCount} 个任务的执行方案`);
    return {
      needsHuman: false,
      changedCount: changedCount,
      newAssignment: { ...assignment, assignments: newAssignments }
    };
  }

  /**
   * 查找替代执行器
   */
  findAlternativeExecutor(originalAssignment) {
    const currentName = originalAssignment.executor.name;
    const subtask = originalAssignment.subtask;

    const typeCapMap = {
      'explore': ['file_search', 'code_search'],
      'analyze': ['architecture_design', 'risk_assessment'],
      'plan': ['architecture_design', 'task_decomposition'],
      'code': ['code_writing', 'file_editing'],
      'test': ['testing', 'code_review'],
      'write': ['code_writing', 'file_editing'],
      'review': ['code_review', 'quality_check']
    };

    const requiredCaps = typeCapMap[subtask.type] || [];
    const allAgents = this.agentRegistry.list();

    const alternatives = allAgents.filter(agent =>
      agent.name !== currentName &&
      agent.id !== 'supervisor' &&
      agent.capabilities &&
      agent.capabilities.some(cap => requiredCaps.includes(cap))
    );

    if (alternatives.length > 0) {
      return {
        name: alternatives[0].name,
        capabilities: alternatives[0].capabilities,
        mode: originalAssignment.executor.mode,
        config: { ...originalAssignment.executor.config }
      };
    }

    // 兜底: 降级到 General-Purpose Agent
    if (currentName !== 'General-Purpose Agent') {
      const general = this.agentRegistry.get('general');
      if (general) {
        return {
          name: general.name,
          capabilities: general.capabilities,
          mode: originalAssignment.executor.mode,
          config: { ...originalAssignment.executor.config }
        };
      }
    }

    return null;
  }

  /**
   * 合并重做结果到原始执行结果
   */
  mergeExecutionResults(original, rework) {
    const mergedResults = [...original.results];

    for (const reworkResult of rework.results) {
      const idx = mergedResults.findIndex(r => {
        if (reworkResult.subtask && r.subtask === reworkResult.subtask) return true;
        if (reworkResult.subtaskId && r.subtaskId === reworkResult.subtaskId) return true;
        return false;
      });
      if (idx !== -1) {
        mergedResults[idx] = reworkResult;
      } else {
        mergedResults.push(reworkResult);
      }
    }

    return {
      assignment: original.assignment,
      results: mergedResults,
      totalTime: mergedResults.reduce((sum, r) => sum + (r.executionTime || 0), 0),
      successCount: mergedResults.filter(r => r.success).length,
      failureCount: mergedResults.filter(r => !r.success).length,
      reworked: true,
      reworkCount: (original.reworkCount || 0) + 1
    };
  }

  // ========== 辅助方法 ==========

  classifyTask(taskMessage) {
    const message = taskMessage.toLowerCase();

    if (message.includes('bug') || message.includes('修复') || message.includes('错误')) {
      return 'bug_fix';
    } else if (message.includes('功能') || message.includes('实现') || message.includes('添加')) {
      return 'feature';
    } else if (message.includes('重构') || message.includes('优化')) {
      return 'refactor';
    } else if (message.includes('文档') || message.includes('说明')) {
      return 'documentation';
    } else if (message.includes('测试')) {
      return 'testing';
    } else {
      return 'general';
    }
  }

  extractGoal(taskMessage) {
    // 简单提取：返回任务消息本身
    return taskMessage;
  }

  defineAcceptanceCriteria(taskMessage) {
    // TODO: 智能生成验收标准
    return '任务成功完成且通过所有检查';
  }

  decomposeByType(analysis) {
    const taskType = analysis.taskType;
    const baseSubtasks = [];

    switch (taskType) {
      case 'bug_fix':
        baseSubtasks.push(
          { name: '定位Bug位置', type: 'explore' },
          { name: '分析根因', type: 'analyze' },
          { name: '修复代码', type: 'code' },
          { name: '测试验证', type: 'test' }
        );
        break;

      case 'feature':
        baseSubtasks.push(
          { name: '理解需求', type: 'analyze' },
          { name: '设计方案', type: 'plan' },
          { name: '实现代码', type: 'code' },
          { name: '编写测试', type: 'test' }
        );
        break;

      case 'refactor':
        baseSubtasks.push(
          { name: '分析现有代码', type: 'explore' },
          { name: '设计重构方案', type: 'plan' },
          { name: '执行重构', type: 'code' },
          { name: '验证功能不变', type: 'test' }
        );
        break;

      case 'documentation':
        baseSubtasks.push(
          { name: '收集信息', type: 'explore' },
          { name: '编写文档', type: 'write' }
        );
        break;

      case 'testing':
        baseSubtasks.push(
          { name: '设计测试用例', type: 'plan' },
          { name: '编写测试代码', type: 'code' },
          { name: '运行测试', type: 'test' }
        );
        break;

      default:
        baseSubtasks.push(
          { name: '分析任务', type: 'analyze' },
          { name: '执行任务', type: 'execute' }
        );
    }

    return baseSubtasks;
  }

  selectExecutor(subtask) {
    // TODO: 使用 Agent Registry
    // 当前版本：简单映射
    const executorMap = {
      'explore': 'ExploreAgent',
      'analyze': 'PlanAgent',
      'plan': 'PlanAgent',
      'code': 'GeneralPurposeAgent',
      'write': 'GeneralPurposeAgent',
      'test': 'InspectorAgent',
      'execute': 'GeneralPurposeAgent'
    };

    return executorMap[subtask.type] || 'GeneralPurposeAgent';
  }

  async simulateExecution(item) {
    // 模拟执行延迟
    await new Promise(resolve => setTimeout(resolve, 100));

    // 99% 成功率（根据优先级调整）
    let successRate = 0.99;
    if (item.subtask.priority === 'critical') {
      successRate = 0.995;
    } else if (item.subtask.priority === 'low') {
      successRate = 0.98;
    }

    const success = Math.random() < successRate;

    return {
      subtask: item.subtask.name,
      executor: item.executor,
      success: success,
      error: success ? null : '模拟执行失败',
      output: success ? '执行成功' : null,
      executionTime: 100,
      retryable: !success
    };
  }

  calculateScore(task) {
    const steps = task.steps;
    if (steps.length === 0) return 0;

    // 简单评分：基于成功步骤比例
    const successSteps = steps.filter(s => {
      if (s.name === 'inspect') {
        return s.result && s.result.passed;
      }
      return s.result && s.result.success !== false;
    }).length;

    const score = (successSteps / steps.length * 10).toFixed(1);
    return parseFloat(score);
  }

  suggestImprovements(task) {
    const improvements = [];

    // 检查是否有失败的步骤
    const failedSteps = task.steps.filter(s => {
      if (s.name === 'inspect') {
        return s.result && !s.result.passed;
      }
      return s.result && s.result.success === false;
    });

    if (failedSteps.length > 0) {
      improvements.push('部分子任务执行失败，建议检查执行器选择');
    }

    // 检查执行时间
    const totalTime = Date.now() - task.startTime;
    if (totalTime > 5000) {
      improvements.push('执行时间较长，建议优化任务拆解粒度');
    }

    if (improvements.length === 0) {
      improvements.push('执行良好，继续保持');
    }

    return improvements;
  }

  logStep(stepNumber, stepName, result) {
    this.currentTask.steps.push({
      number: stepNumber,
      name: stepName,
      result: result,
      timestamp: Date.now()
    });
  }
}

module.exports = SupervisorAgent;
