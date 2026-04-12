/**
 * 任务分配器
 * 负责 Supervisor Step 3: 为子任务选择合适的执行器
 */
class TaskDispatcher {
  constructor(agentRegistry) {
    this.agentRegistry = agentRegistry;
  }

  /**
   * 分配任务
   */
  assign(decomposition, context = {}) {
    const assignments = [];

    for (const subtask of decomposition.subtasks) {
      const executor = this.selectExecutor(subtask, context);

      assignments.push({
        subtask: subtask,
        executor: executor,
        status: 'pending',
        assignedAt: new Date().toISOString()
      });
    }

    return {
      decomposition: decomposition,
      assignments: assignments,
      totalAssignments: assignments.length,
      executionPlan: this.createExecutionPlan(assignments)
    };
  }

  /**
   * 选择执行器
   */
  selectExecutor(subtask, context) {
    // 使用 AgentRegistry 匹配最佳 Agent
    const agent = this.agentRegistry.matchBestAgent(subtask);

    if (!agent) {
      // 如果没有匹配的 Agent，使用默认的 General-Purpose Agent
      const defaultAgent = this.agentRegistry.get('general');
      return {
        name: defaultAgent.name,
        capabilities: defaultAgent.capabilities || [],
        mode: this.determineExecutionMode(subtask),
        config: this.getExecutorConfig(subtask)
      };
    }

    // 返回匹配的 Agent 信息
    const executor = {
      name: agent.name,
      capabilities: agent.capabilities || [],
      mode: this.determineExecutionMode(subtask),
      config: this.getExecutorConfig(subtask)
    };

    return executor;
  }

  /**
   * 确定执行模式
   */
  determineExecutionMode(subtask) {
    // 需要授权的任务使用交互模式
    if (subtask.constraints && subtask.constraints.requiresAuth) {
      return 'interactive';
    }

    // 高风险任务使用监督模式
    if (subtask.priority === 'critical' || subtask.involvesCore) {
      return 'supervised';
    }

    // 默认自动模式
    return 'automatic';
  }

  /**
   * 获取执行器配置
   */
  getExecutorConfig(subtask) {
    const config = {
      timeout: subtask.constraints?.timeout || 300000,
      maxRetries: subtask.constraints?.maxRetries || 2,
      requiresAuth: subtask.constraints?.requiresAuth || false,
      canRunInParallel: subtask.constraints?.canRunInParallel || false
    };

    return config;
  }

  /**
   * 创建执行计划
   */
  createExecutionPlan(assignments) {
    // 分析依赖关系，确定执行顺序
    const plan = {
      sequential: [],
      parallel: []
    };

    // 找出可以并行执行的任务
    const noDependencies = assignments.filter(a =>
      !a.subtask.dependencies || a.subtask.dependencies.length === 0
    );

    if (noDependencies.length > 1) {
      plan.parallel.push(noDependencies.map(a => a.subtask.id));
    }

    // 其他任务按顺序执行
    const sequential = assignments.filter(a =>
      a.subtask.dependencies && a.subtask.dependencies.length > 0
    );

    plan.sequential = sequential.map(a => a.subtask.id);

    return plan;
  }
}

module.exports = TaskDispatcher;
