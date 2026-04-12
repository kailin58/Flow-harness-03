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

    const resolved = agent || this.agentRegistry.get('general');

    return {
      agentId: resolved.id,
      name: resolved.name,
      capabilities: resolved.capabilities || [],
      mode: this.determineExecutionMode(subtask),
      config: this.getExecutorConfig(subtask)
    };
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
   * 输出：phases 数组，每个 phase 内的任务可并行，phase 之间串行
   */
  createExecutionPlan(assignments) {
    // subtask.type → phase（与 task-decomposer 保持一致）
    const PHASE_MAP = {
      explore: 0, analyze: 0, search: 0, research: 0, web_search: 0, doc_lookup: 0,
      plan: 1, design: 1,
      code: 2, write: 2, implement: 2, execute: 2, refactor: 2,
      test: 3, review: 3, inspect: 3, verify: 3
    };

    const getPhase = (subtask) => PHASE_MAP[subtask.type] ?? 2;

    // 按阶段分组（preserving insertion order for same phase）
    const phaseMap = new Map();
    for (const a of assignments) {
      const ph = getPhase(a.subtask);
      if (!phaseMap.has(ph)) phaseMap.set(ph, []);
      phaseMap.get(ph).push(a.subtask.id);
    }

    const sortedPhaseKeys = [...phaseMap.keys()].sort((a, b) => a - b);

    // phases: 有序阶段列表，每阶段内任务可并行
    const phases = sortedPhaseKeys.map(ph => ({
      phase: ph,
      tasks: phaseMap.get(ph)
    }));

    // 向后兼容：保留 sequential / parallel 的原始语义
    // parallel: 没有依赖的任务，当数量 > 1 时可组成并行组
    const noDeps = assignments.filter(a =>
      !a.subtask.dependencies || a.subtask.dependencies.length === 0
    );
    const parallel = noDeps.length > 1 ? [noDeps.map(a => a.subtask.id)] : [];

    // sequential: 有依赖的任务，按顺序执行
    const sequential = assignments
      .filter(a => a.subtask.dependencies && a.subtask.dependencies.length > 0)
      .map(a => a.subtask.id);

    return { phases, parallel, sequential };
  }

  /**
   * 用匹配的技能上下文丰富任务对象
   * @param {Object} task - 任务对象
   * @param {string} agentRole - Agent 角色 (explore/plan/general/inspector)
   * @param {Object} skillLoader - SkillLoader 实例
   * @returns {Object} 增强后的任务对象
   */
  async enrichTaskWithSkills(task, agentRole, skillLoader) {
    if (!skillLoader) {
      return task;
    }

    try {
      const matchedSkills = await skillLoader.matchSkills(
        agentRole,
        task.description || task.name || ''
      );

      if (matchedSkills.length > 0) {
        task.skillContext = matchedSkills.map((skill) => ({
          id: skill.id,
          name: skill.name,
          guidance: skill.content
        }));
      }
    } catch (error) {
      // 技能匹配失败不阻塞主流程
    }

    return task;
  }
}

module.exports = TaskDispatcher;
