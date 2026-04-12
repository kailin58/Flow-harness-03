/**
 * Agent Registry - Agent 注册表
 * 管理 1 CEO + 4 总监 + N 个子Agent
 */
class AgentRegistry {
  constructor() {
    // 核心 Agent 存储
    this.agents = new Map();

    // 能力索引（capability -> agentIds）
    this.capabilities = new Map();

    // 初始化标记
    this.initialized = false;
  }

  /**
   * 注册 Agent
   * @param {string} agentId - Agent ID
   * @param {Object} agentConfig - Agent 配置
   */
  register(agentId, agentConfig) {
    // 验证必需字段
    if (!agentConfig.name || !agentConfig.role) {
      throw new Error(`Agent ${agentId} 缺少必需字段: name, role`);
    }

    // 存储 Agent
    this.agents.set(agentId, {
      id: agentId,
      ...agentConfig,
      registeredAt: new Date().toISOString(),
      subAgents: []
    });

    // 索引能力
    if (agentConfig.capabilities) {
      agentConfig.capabilities.forEach(capability => {
        if (!this.capabilities.has(capability)) {
          this.capabilities.set(capability, []);
        }
        this.capabilities.get(capability).push(agentId);
      });
    }

    return true;
  }

  /**
   * 获取 Agent
   * @param {string} agentId - Agent ID
   */
  get(agentId) {
    return this.agents.get(agentId);
  }

  /**
   * 列出所有 Agent
   */
  list() {
    return Array.from(this.agents.values());
  }

  /**
   * 检查 Agent 是否存在
   */
  has(agentId) {
    return this.agents.has(agentId);
  }

  /**
   * 获取 Agent 数量
   */
  size() {
    return this.agents.size;
  }

  /**
   * 初始化 5 个核心 Agent（1 CEO + 4 总监）
   */
  initializeCoreAgents() {
    // CEO: Supervisor Agent
    this.register('supervisor', {
      name: 'Supervisor Agent',
      role: 'CEO',
      capabilities: ['analyze', 'dispatch', 'inspect', 'review', 'optimize'],
      description: '领导、调度器、决策者',
      responsibilities: ['判断', '指挥', '检查', '复盘', '优化']
    });

    // 总监1: Explore Agent
    this.register('explore', {
      name: 'Explore Agent',
      role: '总监1',
      capabilities: ['file_search', 'code_search', 'dependency_analysis', 'structure_analysis'],
      description: '探索总监、信息收集者',
      responsibilities: ['代码库探索', '文件搜索', '依赖分析', '上下文收集']
    });

    // 总监2: Plan Agent
    this.register('plan', {
      name: 'Plan Agent',
      role: '总监2',
      capabilities: ['architecture_design', 'tech_selection', 'risk_assessment', 'task_decomposition'],
      description: '规划总监、架构师',
      responsibilities: ['架构设计', '方案规划', '风险评估', '任务拆解']
    });

    // 总监3: General-Purpose Agent
    this.register('general', {
      name: 'General-Purpose Agent',
      role: '总监3',
      capabilities: ['code_writing', 'file_editing', 'command_execution', 'multi_step_tasks'],
      description: '执行总监、实施者',
      responsibilities: ['代码编写', '文件操作', '命令执行', '多步骤任务']
    });

    // 总监4: Inspector Agent
    this.register('inspector', {
      name: 'Inspector Agent',
      role: '总监4',
      capabilities: ['code_review', 'testing', 'security_scan', 'quality_check'],
      description: '质检总监、检查者',
      responsibilities: ['代码审查', '测试执行', '安全扫描', '质量检查']
    });

    this.initialized = true;
    return this.agents.size;
  }

  /**
   * 根据能力查找 Agent
   * @param {string} capability - 能力名称
   * @returns {Array} 具有该能力的 Agent 列表
   */
  findByCapability(capability) {
    const agentIds = this.capabilities.get(capability);
    if (!agentIds) {
      return [];
    }

    return agentIds.map(id => this.get(id)).filter(agent => agent !== undefined);
  }

  /**
   * 根据角色查找 Agent
   * @param {string} role - 角色名称
   * @returns {Object|null} Agent 对象
   */
  findByRole(role) {
    for (const agent of this.agents.values()) {
      if (agent.role === role) {
        return agent;
      }
    }
    return null;
  }

  /**
   * 列出所有能力
   * @returns {Array} 能力列表
   */
  listCapabilities() {
    return Array.from(this.capabilities.keys());
  }

  /**
   * 根据任务匹配最佳 Agent
   * @param {Object} task - 任务对象
   * @returns {Object|null} 最佳匹配的 Agent
   */
  matchBestAgent(task) {
    // 基于任务类型的映射
    const typeMap = {
      'explore': 'explore',
      'analyze': 'plan',
      'plan': 'plan',
      'code': 'general',
      'write': 'general',
      'execute': 'general',
      'test': 'inspector',
      'review': 'inspector'
    };

    // 根据任务类型查找
    if (task.type && typeMap[task.type]) {
      const agentId = typeMap[task.type];
      return this.get(agentId);
    }

    // 根据能力查找
    if (task.capability) {
      const agents = this.findByCapability(task.capability);
      if (agents.length > 0) {
        return agents[0]; // 返回第一个匹配的
      }
    }

    // 默认返回 General-Purpose Agent
    return this.get('general');
  }

  /**
   * 为任务选择合适的 Agent（兼容旧接口）
   * @param {Object} subtask - 子任务对象
   * @returns {Object} Agent 对象
   */
  selectExecutor(subtask) {
    return this.matchBestAgent(subtask);
  }

  /**
   * 注册子 Agent
   * @param {string} parentId - 父 Agent ID
   * @param {Object} subAgentConfig - 子 Agent 配置
   * @returns {boolean} 是否成功
   */
  registerSubAgent(parentId, subAgentConfig) {
    const parent = this.get(parentId);
    if (!parent) {
      throw new Error(`父 Agent 不存在: ${parentId}`);
    }

    if (!subAgentConfig.name || !subAgentConfig.capability) {
      throw new Error('子 Agent 缺少必需字段: name, capability');
    }

    // 添加到父 Agent 的子 Agent 列表
    parent.subAgents.push({
      ...subAgentConfig,
      registeredAt: new Date().toISOString()
    });

    return true;
  }

  /**
   * 列出子 Agent
   * @param {string} parentId - 父 Agent ID
   * @returns {Array} 子 Agent 列表
   */
  listSubAgents(parentId) {
    const parent = this.get(parentId);
    if (!parent) {
      return [];
    }
    return parent.subAgents || [];
  }

  /**
   * 查找子 Agent
   * @param {string} parentId - 父 Agent ID
   * @param {string} capability - 能力
   * @returns {Object|null} 子 Agent
   */
  findSubAgent(parentId, capability) {
    const subAgents = this.listSubAgents(parentId);
    return subAgents.find(sub => sub.capability === capability) || null;
  }
}

module.exports = AgentRegistry;
