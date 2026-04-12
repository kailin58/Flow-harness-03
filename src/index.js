const ConfigLoader = require('./config-loader');
const WorkflowEngine = require('./workflow-engine');
const KnowledgeBase = require('./knowledge-base');
const PolicyChecker = require('./policy-checker');
const { MemoryStore, MEMORY_TYPES } = require('./memory-store');
const { createLogger, createComponentLoggers } = require('./logger');
const { TokenTracker } = require('./token-tracker');

class FlowHarness {
  constructor(configPath) {
    this.configLoader = new ConfigLoader(configPath);
    this.config = null;
    this.workflowEngine = null;
    this.knowledgeBase = null;
    this.policyChecker = null;
    this.memoryStore = null;
    this.tokenTracker = null;
    this.logger = createLogger({ name: 'flow-harness' });
    this.loggers = createComponentLoggers(this.logger);
  }

  async initialize() {
    this.logger.info('Initializing Flow Harness...');

    // 加载配置
    this.config = this.configLoader.load();
    this.logger.info('Config loaded');

    // 初始化知识库
    this.knowledgeBase = new KnowledgeBase();
    this.knowledgeBase.load();
    this.logger.info('Knowledge base loaded');

    // 初始化四类记忆系统
    this.memoryStore = new MemoryStore();
    this.memoryStore.load();
    this.logger.info('Memory store loaded (4 types: user/feedback/project/reference)');

    // 初始化策略检查器
    this.policyChecker = new PolicyChecker(this.config.policies);
    this.logger.info('Policy checker initialized');

    // 初始化 Token 成本控制
    this.tokenTracker = new TokenTracker(this.config.tokenBudgets || {});
    this.logger.info('Token tracker initialized');

    // 初始化工作流引擎
    this.workflowEngine = new WorkflowEngine(this.config, this.knowledgeBase);
    this.logger.info('Workflow engine initialized');

    this.logger.info('Flow Harness initialization complete');
  }

  async runWorkflow(workflowName, context = {}) {
    if (!this.workflowEngine) {
      throw new Error('Flow Harness not initialized. Call initialize() first.');
    }

    const result = await this.workflowEngine.runWorkflow(workflowName, context);
    return result;
  }

  listWorkflows() {
    if (!this.config) {
      throw new Error('Flow Harness not initialized. Call initialize() first.');
    }

    return this.config.workflows.map(w => ({
      name: w.name,
      description: w.description,
      enabled: w.enabled,
      steps: w.steps.length
    }));
  }

  getOptimizations() {
    if (!this.knowledgeBase) {
      throw new Error('Flow Harness not initialized. Call initialize() first.');
    }

    return this.knowledgeBase.getOptimizations();
  }

  getStatistics() {
    if (!this.knowledgeBase) {
      throw new Error('Flow Harness not initialized. Call initialize() first.');
    }

    return this.knowledgeBase.patterns.statistics;
  }

  checkFileAccess(filePath) {
    if (!this.policyChecker) {
      throw new Error('Flow Harness not initialized. Call initialize() first.');
    }

    return this.policyChecker.checkFileAccess(filePath);
  }

  checkCommand(command) {
    if (!this.policyChecker) {
      throw new Error('Flow Harness not initialized. Call initialize() first.');
    }

    return this.policyChecker.checkCommand(command);
  }

  // ---- 记忆系统接口 ----

  getMemoryStore() {
    if (!this.memoryStore) {
      throw new Error('Flow Harness not initialized. Call initialize() first.');
    }
    return this.memoryStore;
  }

  getMemoryStats() {
    if (!this.memoryStore) {
      throw new Error('Flow Harness not initialized. Call initialize() first.');
    }
    return this.memoryStore.getStats();
  }

  // ---- Token 成本控制接口 ----

  getTokenTracker() {
    if (!this.tokenTracker) {
      throw new Error('Flow Harness not initialized. Call initialize() first.');
    }
    return this.tokenTracker;
  }

  getTokenStats() {
    if (!this.tokenTracker) {
      throw new Error('Flow Harness not initialized. Call initialize() first.');
    }
    return this.tokenTracker.getStats();
  }
}

module.exports = FlowHarness;
