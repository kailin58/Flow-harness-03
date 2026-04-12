/**
 * 任务分析器
 * 负责 Supervisor Step 1: 判断任务类型、目标、验收标准
 */
class TaskAnalyzer {
  constructor() {
    this.taskPatterns = this.initializePatterns();
  }

  /**
   * 分析任务消息
   */
  analyze(taskMessage, context = {}) {
    const taskType = this.classifyTask(taskMessage);
    const goal = this.extractGoal(taskMessage, taskType);
    const acceptanceCriteria = this.defineAcceptanceCriteria(taskMessage, taskType);
    const priority = this.estimatePriority(taskMessage, context);
    const complexity = this.estimateComplexity(taskMessage, taskType);
    const risks = this.identifyRisks(taskMessage, taskType);

    return {
      taskType: taskType,
      goal: goal,
      acceptanceCriteria: acceptanceCriteria,
      priority: priority,
      complexity: complexity,
      risks: risks,
      metadata: {
        originalMessage: taskMessage,
        analyzedAt: new Date().toISOString()
      }
    };
  }

  /**
   * 任务分类
   */
  classifyTask(taskMessage) {
    const message = taskMessage.toLowerCase();

    // 按优先级匹配（从具体到一般）
    for (const [type, patterns] of Object.entries(this.taskPatterns)) {
      for (const pattern of patterns) {
        if (message.includes(pattern)) {
          return type;
        }
      }
    }

    return 'general';
  }

  /**
   * 提取任务目标
   */
  extractGoal(taskMessage, taskType) {
    // 移除常见的动词前缀，提取核心目标
    const cleanedMessage = taskMessage
      .replace(/^(请|帮我|需要|想要|要|实现|添加|修复|重构|优化|创建|编写)/i, '')
      .trim();

    return {
      description: cleanedMessage,
      type: taskType,
      measurable: this.isGoalMeasurable(taskMessage)
    };
  }

  /**
   * 定义验收标准
   */
  defineAcceptanceCriteria(taskMessage, taskType) {
    const criteria = [];

    // 基础标准（所有任务）
    criteria.push('任务完成且无错误');

    // 根据任务类型添加特定标准
    switch (taskType) {
      case 'bug_fix':
        criteria.push('Bug已修复且不再复现');
        criteria.push('相关测试通过');
        criteria.push('未引入新的Bug');
        break;

      case 'feature':
        criteria.push('功能按需求实现');
        criteria.push('代码通过测试');
        criteria.push('文档已更新');
        break;

      case 'refactor':
        criteria.push('代码结构改善');
        criteria.push('功能保持不变');
        criteria.push('测试全部通过');
        break;

      case 'documentation':
        criteria.push('文档内容完整');
        criteria.push('格式规范');
        criteria.push('示例清晰');
        break;

      case 'testing':
        criteria.push('测试覆盖关键路径');
        criteria.push('测试用例通过');
        break;

      case 'security':
        criteria.push('安全漏洞已修复');
        criteria.push('安全扫描通过');
        criteria.push('无敏感信息泄露');
        break;
    }

    // 检查是否涉及核心模块
    if (this.involvesCoreSystems(taskMessage)) {
      criteria.push('核心模块变更已授权');
      criteria.push('影响范围已评估');
    }

    return criteria;
  }

  /**
   * 估算优先级
   */
  estimatePriority(taskMessage, context) {
    const message = taskMessage.toLowerCase();

    // 紧急关键词
    const urgentKeywords = ['紧急', '立即', '马上', '尽快', 'urgent', 'asap', '线上', '生产'];
    if (urgentKeywords.some(kw => message.includes(kw))) {
      return 'urgent';
    }

    // 高优先级关键词
    const highKeywords = ['重要', '关键', '核心', '阻塞', 'critical', 'blocker'];
    if (highKeywords.some(kw => message.includes(kw))) {
      return 'high';
    }

    // 低优先级关键词
    const lowKeywords = ['优化', '改进', '建议', '可选', 'nice to have'];
    if (lowKeywords.some(kw => message.includes(kw))) {
      return 'low';
    }

    return 'normal';
  }

  /**
   * 估算复杂度
   */
  estimateComplexity(taskMessage, taskType) {
    let score = 0;

    // 基于任务类型的基础分数
    const typeComplexity = {
      'bug_fix': 2,
      'feature': 3,
      'refactor': 3,
      'documentation': 1,
      'testing': 2,
      'security': 4,
      'general': 2
    };
    score += typeComplexity[taskType] || 2;

    // 基于关键词的复杂度调整
    const message = taskMessage.toLowerCase();

    const complexKeywords = ['架构', '重构', '迁移', '集成', '分布式', '并发', '性能'];
    complexKeywords.forEach(kw => {
      if (message.includes(kw)) score += 1;
    });

    const simpleKeywords = ['简单', '小', '快速', 'simple', 'quick'];
    simpleKeywords.forEach(kw => {
      if (message.includes(kw)) score -= 1;
    });

    // 归一化到 1-5
    score = Math.max(1, Math.min(5, score));

    const levels = ['trivial', 'simple', 'moderate', 'complex', 'very_complex'];
    return {
      level: levels[score - 1],
      score: score,
      estimatedTime: this.estimateTime(score)
    };
  }

  /**
   * 识别风险
   */
  identifyRisks(taskMessage, taskType) {
    const risks = [];
    const message = taskMessage.toLowerCase();

    // 核心系统风险
    if (this.involvesCoreSystems(message)) {
      risks.push({
        type: 'core_system',
        level: 'high',
        description: '涉及核心系统，需要额外审查'
      });
    }

    // 数据风险
    const dataKeywords = ['数据库', 'schema', '迁移', 'migration', '删除数据'];
    if (dataKeywords.some(kw => message.includes(kw))) {
      risks.push({
        type: 'data',
        level: 'high',
        description: '涉及数据变更，需要备份和回滚方案'
      });
    }

    // 安全风险
    const securityKeywords = ['权限', '认证', '鉴权', '加密', '密码', 'token'];
    if (securityKeywords.some(kw => message.includes(kw))) {
      risks.push({
        type: 'security',
        level: 'high',
        description: '涉及安全相关功能，需要安全审查'
      });
    }

    // 性能风险
    const performanceKeywords = ['性能', '优化', '慢', '卡顿', '并发'];
    if (performanceKeywords.some(kw => message.includes(kw))) {
      risks.push({
        type: 'performance',
        level: 'medium',
        description: '涉及性能相关，需要性能测试'
      });
    }

    // 兼容性风险
    const compatKeywords = ['升级', '迁移', '重构', '替换'];
    if (compatKeywords.some(kw => message.includes(kw))) {
      risks.push({
        type: 'compatibility',
        level: 'medium',
        description: '可能影响兼容性，需要充分测试'
      });
    }

    return risks;
  }

  // ========== 辅助方法 ==========

  initializePatterns() {
    return {
      'bug_fix': ['bug', '修复', '错误', '问题', 'fix', 'issue', '不工作', '失败'],
      'feature': ['功能', '实现', '添加', '新增', 'feature', 'add', '开发'],
      'refactor': ['重构', '优化', '改进', 'refactor', 'improve', '重写'],
      'documentation': ['文档', '说明', '注释', 'doc', 'readme', '文档'],
      'testing': ['测试', 'test', '单元测试', '集成测试'],
      'security': ['安全', '漏洞', '权限', 'security', 'vulnerability', '加密'],
      'performance': ['性能', '优化', '加速', 'performance', 'optimize'],
      'deployment': ['部署', '发布', '上线', 'deploy', 'release']
    };
  }

  isGoalMeasurable(taskMessage) {
    // 检查是否包含可量化的指标
    const measurablePatterns = [
      /\d+%/,  // 百分比
      /\d+ms/,  // 毫秒
      /\d+s/,   // 秒
      /覆盖率/,
      /通过率/,
      /成功率/
    ];

    return measurablePatterns.some(pattern => pattern.test(taskMessage));
  }

  involvesCoreSystems(message) {
    const coreKeywords = [
      'schema', '数据库', 'database',
      '支付', 'payment',
      '认证', '鉴权', 'auth',
      '契约', 'contract', 'api契约'
    ];

    return coreKeywords.some(kw => message.includes(kw));
  }

  estimateTime(complexityScore) {
    const timeMap = {
      1: '< 1小时',
      2: '1-3小时',
      3: '3-8小时',
      4: '1-2天',
      5: '> 2天'
    };

    return timeMap[complexityScore] || '未知';
  }
}

module.exports = TaskAnalyzer;
