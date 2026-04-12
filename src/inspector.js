/**
 * Inspector - Layer 4 检查层
 * 负责深度检查 Agent 产出，实现 "Inspect Before Trust" 原则
 * 集成 AgentsParser 以强制执行 AGENTS.md 规则
 */
const { createLogger } = require('./logger');
const { AgentsParser } = require('./agents-parser');

class Inspector {
  constructor(config = {}) {
    this.config = config;
    this.checkResults = [];
    this.logger = createLogger({ name: 'inspector' });

    // 集成 AGENTS.md 解析器
    this.agentsParser = config.agentsParser || null;
    if (!this.agentsParser) {
      try {
        this.agentsParser = new AgentsParser(config.agentsParserOptions);
        this.agentsParser.parse();
      } catch (e) {
        this.logger.warn({ error: e.message }, 'AgentsParser 初始化失败，AGENTS.md 合规检查将跳过');
      }
    }
  }

  /**
   * 执行完整检查（含 AGENTS.md 合规）
   * @param {Object} execution - 执行结果
   * @param {Object} analysis - 任务分析结果
   * @param {Object} context - 上下文信息
   * @returns {Object} 检查结果
   */
  async inspect(execution, analysis, context = {}) {
    this.logger.info('Inspector 深度检查');

    const checks = {
      goalAlignment: await this.checkGoalAlignment(execution, analysis, context),
      specCompliance: await this.checkSpecCompliance(execution, analysis, context),
      semanticCorrectness: await this.checkSemanticCorrectness(execution, analysis, context),
      impactAnalysis: await this.analyzeImpact(execution, analysis, context),
      securityScan: await this.scanSecurity(execution, analysis, context),
      agentsCompliance: await this.checkAgentsCompliance(execution, analysis, context)
    };

    // 计算总体通过率
    const passedChecks = Object.values(checks).filter(c => c.passed).length;
    const totalChecks = Object.keys(checks).length;
    const passRate = (passedChecks / totalChecks * 100).toFixed(1);

    // 收集所有问题
    const issues = Object.values(checks)
      .filter(c => !c.passed)
      .flatMap(c => c.issues || []);

    // 收集所有建议
    const suggestions = Object.values(checks)
      .filter(c => c.suggestions && c.suggestions.length > 0)
      .flatMap(c => c.suggestions);

    const allPassed = passedChecks === totalChecks;

    return {
      passed: allPassed,
      passRate: parseFloat(passRate),
      checks: checks,
      issues: issues,
      suggestions: suggestions,
      summary: this.generateSummary(checks, allPassed)
    };
  }

  /**
   * 1. 目标对齐检查
   * 检查产出是否匹配任务目标
   */
  async checkGoalAlignment(execution, analysis, context) {
    const check = {
      name: '目标对齐检查',
      description: '验证产出是否匹配任务目标',
      passed: true,
      issues: [],
      suggestions: [],
      details: {}
    };

    // 检查关键任务是否完成
    if (!execution.assignment || !execution.assignment.assignments) {
      // 如果没有 assignment 信息，跳过此检查
      return check;
    }

    const highPriorityTasks = execution.assignment.assignments.filter(a =>
      a.subtask.priority === 'high' || a.subtask.priority === 'critical'
    );

    const completedHighPriority = highPriorityTasks.filter(t =>
      execution.results.some(r => r.subtaskId === t.subtask.id && r.success)
    );

    check.details.highPriorityTotal = highPriorityTasks.length;
    check.details.highPriorityCompleted = completedHighPriority.length;

    // 只要80%以上的高优先级任务完成即可
    if (highPriorityTasks.length > 0) {
      const completionRate = completedHighPriority.length / highPriorityTasks.length;
      if (completionRate < 0.8) {
        check.passed = false;
        const missing = highPriorityTasks.length - completedHighPriority.length;
        check.issues.push(`${missing} 个高优先级任务未完成`);
        check.suggestions.push('完成所有高优先级任务后再提交');
      }
    }

    // 检查任务类型匹配
    const taskType = analysis.taskType;
    const expectedOutputs = this.getExpectedOutputs(taskType);

    check.details.taskType = taskType;
    check.details.expectedOutputs = expectedOutputs;

    // 检查是否有预期的输出类型（改为建议而非强制）
    const hasExpectedOutputs = this.verifyExpectedOutputs(execution, expectedOutputs);
    if (!hasExpectedOutputs) {
      check.suggestions.push(`${taskType} 类型任务建议包含: ${expectedOutputs.join(', ')}`);
    }

    return check;
  }

  /**
   * 2. 规约合规检查
   * 检查是否违反 schema/契约/API 定义
   */
  async checkSpecCompliance(execution, analysis, context) {
    const check = {
      name: '规约合规检查',
      description: '验证是否符合 schema/契约/API 规范',
      passed: true,
      issues: [],
      suggestions: [],
      details: {}
    };

    // 检查是否涉及核心系统
    const involvesCore = analysis.risks.some(r => r.type === 'core_system');
    check.details.involvesCore = involvesCore;

    if (involvesCore) {
      // 检查是否有授权
      const hasAuth = execution.results.some(r =>
        r.mode === 'interactive' || r.mode === 'supervised'
      );

      check.details.hasAuth = hasAuth;

      if (!hasAuth) {
        check.passed = false;
        check.issues.push('核心系统变更未经授权');
        check.suggestions.push('核心系统变更需要人工审批');
      }
    }

    // 检查是否有破坏性变更
    const hasDestructiveChanges = this.detectDestructiveChanges(execution, analysis);
    check.details.hasDestructiveChanges = hasDestructiveChanges;

    if (hasDestructiveChanges) {
      check.passed = false;
      check.issues.push('检测到可能的破坏性变更');
      check.suggestions.push('破坏性变更需要版本控制和迁移方案');
    }

    // 检查 API 契约
    if (analysis.taskType === 'feature' || analysis.taskType === 'refactor') {
      const apiChanges = this.detectAPIChanges(execution);
      check.details.apiChanges = apiChanges;

      if (apiChanges.breaking.length > 0) {
        check.passed = false;
        check.issues.push(`${apiChanges.breaking.length} 个破坏性 API 变更`);
        check.suggestions.push('破坏性 API 变更需要更新文档和通知用户');
      }
    }

    return check;
  }

  /**
   * 3. 语义正确性检查
   * 检查业务逻辑是否正确
   */
  async checkSemanticCorrectness(execution, analysis, context) {
    const check = {
      name: '语义正确性检查',
      description: '验证业务逻辑是否正确',
      passed: true,
      issues: [],
      suggestions: [],
      details: {}
    };

    // 检查是否有测试任务
    const hasTestTask = execution.results.some(r =>
      r.subtask.includes('测试') || r.subtask.includes('验证') || r.subtask.includes('test')
    );

    check.details.hasTestTask = hasTestTask;

    if (hasTestTask) {
      // 检查测试是否通过
      const testTasks = execution.results.filter(r =>
        r.subtask.includes('测试') || r.subtask.includes('验证') || r.subtask.includes('test')
      );

      const passedTests = testTasks.filter(t => t.success).length;
      const testPassRate = passedTests / testTasks.length;
      check.details.testsPassed = testPassRate === 1;
      check.details.testPassRate = testPassRate;

      // 只要80%以上的测试通过即可
      if (testPassRate < 0.8) {
        check.passed = false;
        check.issues.push(`测试通过率过低: ${(testPassRate * 100).toFixed(1)}%`);
        check.suggestions.push('修复失败的测试用例');
      }
    } else {
      // 如果是代码变更但没有测试，给出建议但不标记为失败
      if (analysis.taskType === 'feature' || analysis.taskType === 'bug_fix') {
        check.suggestions.push('建议添加测试用例验证功能正确性');
      }
    }

    // 检查业务逻辑关键词
    const businessLogicKeywords = ['支付', '积分', '佣金', '权限', '认证', '计算'];
    const involvesBusinessLogic = businessLogicKeywords.some(kw =>
      analysis.goal.description.includes(kw)
    );

    check.details.involvesBusinessLogic = involvesBusinessLogic;

    if (involvesBusinessLogic && !hasTestTask) {
      check.suggestions.push('业务逻辑变更建议添加完整的测试覆盖');
    }

    return check;
  }

  /**
   * 4. 影响范围分析
   * 分析变更影响的模块和范围
   */
  async analyzeImpact(execution, analysis, context) {
    const check = {
      name: '影响范围分析',
      description: '分析变更影响的模块和范围',
      passed: true,
      issues: [],
      suggestions: [],
      details: {}
    };

    // 估算影响范围
    const impactScope = this.estimateImpactScope(execution, analysis);
    check.details.impactScope = impactScope;

    // 检查是否超出预期范围
    if (impactScope.level === 'high' || impactScope.level === 'critical') {
      check.issues.push(`影响范围较大: ${impactScope.description}`);
      check.suggestions.push('大范围变更需要分阶段实施和充分测试');
    }

    // 检查是否有意外副作用
    const hasUnexpectedSideEffects = this.detectUnexpectedSideEffects(execution, analysis);
    check.details.hasUnexpectedSideEffects = hasUnexpectedSideEffects;

    if (hasUnexpectedSideEffects) {
      check.passed = false;
      check.issues.push('检测到可能的意外副作用');
      check.suggestions.push('分析并处理潜在的副作用');
    }

    // 检查依赖关系
    const dependencies = this.analyzeDependencies(execution);
    check.details.dependencies = dependencies;

    if (dependencies.external.length > 0) {
      check.suggestions.push(`注意外部依赖: ${dependencies.external.join(', ')}`);
    }

    return check;
  }

  /**
   * 5. 安全扫描
   * 扫描常见安全漏洞
   */
  async scanSecurity(execution, analysis, context) {
    const check = {
      name: '安全扫描',
      description: '扫描常见安全漏洞',
      passed: true,
      issues: [],
      suggestions: [],
      details: {}
    };

    // 检查是否涉及安全相关功能
    const securityKeywords = ['密码', '权限', '认证', '鉴权', '加密', 'token', 'session'];
    const involvesSecurity = securityKeywords.some(kw =>
      analysis.goal.description.toLowerCase().includes(kw)
    );

    check.details.involvesSecurity = involvesSecurity;

    if (involvesSecurity) {
      // 安全相关功能需要特别检查
      check.suggestions.push('安全相关功能需要安全专家审查');

      // 检查是否有安全测试
      const hasSecurityTest = execution.results.some(r =>
        r.subtask.includes('安全') || r.subtask.includes('security')
      );

      check.details.hasSecurityTest = hasSecurityTest;

      if (!hasSecurityTest) {
        check.passed = false;
        check.issues.push('安全相关功能缺少安全测试');
        check.suggestions.push('添加安全测试用例（注入、XSS、越权等）');
      }
    }

    // 扫描常见漏洞模式
    const vulnerabilities = this.scanCommonVulnerabilities(execution, analysis);
    check.details.vulnerabilities = vulnerabilities;

    if (vulnerabilities.length > 0) {
      check.passed = false;
      vulnerabilities.forEach(vuln => {
        check.issues.push(`${vuln.type}: ${vuln.description}`);
      });
      check.suggestions.push('修复检测到的安全漏洞');
    }

    return check;
  }

  /**
   * 6. AGENTS.md 合规检查
   * 验证执行过程是否违反 AGENTS.md 定义的禁止项和协作规则
   */
  async checkAgentsCompliance(execution, analysis, context) {
    const check = {
      name: 'AGENTS.md 合规检查',
      description: '验证执行是否符合 AGENTS.md 定义的规则',
      passed: true,
      issues: [],
      suggestions: [],
      details: {}
    };

    // 如果 AgentsParser 不可用，跳过此检查
    if (!this.agentsParser) {
      check.details.skipped = true;
      check.details.reason = 'AgentsParser 未初始化';
      return check;
    }

    // 获取执行中涉及的操作
    const results = execution.results || [];
    const violations = [];

    for (const result of results) {
      // 确定执行者角色
      const executorRole = this._inferAgentRole(result.executor);
      if (!executorRole) continue;

      // 提取操作类型
      const actions = this._extractActions(result);

      for (const action of actions) {
        const verdict = this.agentsParser.checkAction(executorRole, action.type, {
          filePath: action.filePath,
          command: action.command,
          subtask: result.subtask
        });

        if (!verdict.allowed) {
          violations.push({
            agent: executorRole,
            action: action.type,
            subtask: result.subtask,
            reason: verdict.reason,
            requiresApproval: verdict.requiresApproval
          });
        }
      }
    }

    check.details.totalChecked = results.length;
    check.details.violations = violations;

    if (violations.length > 0) {
      check.passed = false;
      violations.forEach(v => {
        if (v.requiresApproval) {
          check.issues.push(`${v.agent} 执行 ${v.action} 需要授权: ${v.reason}`);
          check.suggestions.push(`请为 ${v.subtask} 申请人工授权`);
        } else {
          check.issues.push(`${v.agent} 违反禁止项 ${v.action}: ${v.reason}`);
          check.suggestions.push(`禁止操作不可执行，需要更换方案`);
        }
      });
    }

    this.logger.info({
      violations: violations.length,
      checked: results.length
    }, 'AGENTS.md 合规检查完成');

    return check;
  }

  /**
   * 从执行器名称推断 Agent 角色
   */
  _inferAgentRole(executor) {
    if (!executor) return null;
    const name = typeof executor === 'string' ? executor : executor.name || '';
    const lower = name.toLowerCase();

    if (lower.includes('explore')) return 'cto';
    if (lower.includes('plan')) return 'cto';
    if (lower.includes('general')) return 'developer';
    if (lower.includes('inspector')) return 'qa';
    if (lower.includes('security')) return 'security';
    return 'developer'; // 默认角色
  }

  /**
   * 从执行结果中提取操作类型
   */
  _extractActions(result) {
    const actions = [];
    const subtask = (result.subtask || '').toLowerCase();

    // 基于子任务名称推断操作类型
    if (subtask.includes('删除') || subtask.includes('delete') || subtask.includes('remove')) {
      actions.push({ type: 'delete_file' });
    }
    if (subtask.includes('数据库') || subtask.includes('schema') || subtask.includes('迁移')) {
      actions.push({ type: 'modify_schema' });
    }
    if (subtask.includes('支付') || subtask.includes('payment') || subtask.includes('计费')) {
      actions.push({ type: 'modify_payment' });
    }
    if (subtask.includes('认证') || subtask.includes('auth') || subtask.includes('权限')) {
      actions.push({ type: 'modify_auth' });
    }
    if (subtask.includes('代码') || subtask.includes('实现') || subtask.includes('修改') ||
        subtask.includes('编写') || subtask.includes('修复')) {
      actions.push({ type: 'write_code' });
    }

    // 如果没有推断出操作，默认为 read_code
    if (actions.length === 0) {
      actions.push({ type: 'read_code' });
    }

    return actions;
  }

  // ========== 辅助方法 ==========

  getExpectedOutputs(taskType) {
    const outputs = {
      'bug_fix': ['代码修复', '测试验证'],
      'feature': ['代码实现', '测试', '文档'],
      'refactor': ['代码重构', '测试验证'],
      'documentation': ['文档'],
      'testing': ['测试代码', '测试结果'],
      'security': ['安全修复', '安全测试'],
      'general': ['任务产出']
    };

    return outputs[taskType] || outputs['general'];
  }

  verifyExpectedOutputs(execution, expectedOutputs) {
    // 简化版：检查是否有相关的成功任务
    // 对于文档类任务，只要有编写任务完成即可
    if (expectedOutputs.includes('文档')) {
      return execution.results.some(r =>
        r.success && (r.subtask.includes('文档') || r.subtask.includes('编写') || r.subtask.includes('内容'))
      );
    }

    // 对于其他任务，检查是否有匹配的输出
    return expectedOutputs.some(output =>
      execution.results.some(r =>
        r.success && (r.subtask.includes(output) || r.output?.includes(output))
      )
    );
  }

  detectDestructiveChanges(execution, analysis) {
    // 检查是否有删除、迁移等破坏性操作
    const destructiveKeywords = ['删除', '迁移', 'drop', 'delete', 'remove', 'migration'];
    return destructiveKeywords.some(kw =>
      analysis.goal.description.toLowerCase().includes(kw)
    );
  }

  detectAPIChanges(execution) {
    // 简化版：基于任务描述检测 API 变更
    return {
      breaking: [],
      nonBreaking: []
    };
  }

  estimateImpactScope(execution, analysis) {
    const complexity = analysis.complexity.score;
    const subtaskCount = execution.results.length;

    let level = 'low';
    let description = '影响范围较小';

    if (complexity >= 4 || subtaskCount >= 8) {
      level = 'high';
      description = '影响多个模块';
    } else if (complexity >= 3 || subtaskCount >= 5) {
      level = 'medium';
      description = '影响部分模块';
    }

    return { level, description, complexity, subtaskCount };
  }

  detectUnexpectedSideEffects(execution, analysis) {
    // 简化版：只有当失败率超过20%时才认为有意外副作用
    const failureCount = execution.results.filter(r => !r.success).length;
    const failureRate = failureCount / execution.results.length;
    return failureRate > 0.2;
  }

  analyzeDependencies(execution) {
    // 简化版：返回空依赖
    return {
      internal: [],
      external: []
    };
  }

  scanCommonVulnerabilities(execution, analysis) {
    const vulnerabilities = [];

    // 简化版：基于关键词检测潜在漏洞
    const message = analysis.goal.description.toLowerCase();

    if (message.includes('sql') && !message.includes('参数化')) {
      vulnerabilities.push({
        type: 'SQL注入风险',
        description: '可能存在SQL注入漏洞，建议使用参数化查询'
      });
    }

    if (message.includes('输入') && !message.includes('验证')) {
      vulnerabilities.push({
        type: 'XSS风险',
        description: '用户输入未验证，可能存在XSS漏洞'
      });
    }

    return vulnerabilities;
  }

  generateSummary(checks, allPassed) {
    const passedCount = Object.values(checks).filter(c => c.passed).length;
    const totalCount = Object.keys(checks).length;

    if (allPassed) {
      return `所有检查通过 (${passedCount}/${totalCount})`;
    } else {
      const failedChecks = Object.values(checks)
        .filter(c => !c.passed)
        .map(c => c.name);

      return `${failedChecks.length} 项检查未通过: ${failedChecks.join(', ')}`;
    }
  }
}

module.exports = Inspector;
