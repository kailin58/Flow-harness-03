/**
 * 任务拆解器
 * 负责 Supervisor Step 2: 将任务拆解为可执行的子任务
 */
class TaskDecomposer {
  constructor(options = {}) {
    this.knowledgeBase = options.knowledgeBase || null;
    this.decompositionStrategies = this.initializeStrategies();
  }

  /**
   * 拆解任务
   */
  decompose(analysis, context = {}) {
    let knowledgeHint = null;
    try {
      if (this.knowledgeBase && this.knowledgeBase.patterns) {
        const patterns = this.knowledgeBase.patterns;
        if (patterns.successful_patterns) {
          const matchedPattern = patterns.successful_patterns.find(
            p => p.pattern === `${analysis.taskType}:full_workflow`
          );
          if (matchedPattern) {
            knowledgeHint = {
              avgTime: matchedPattern.avg_time,
              reliability: matchedPattern.recommendation,
              sampleCount: matchedPattern.success_count
            };
          }
        }
      }
    } catch (e) {
      // 知识库查询失败不阻塞分解流程
    }

    const strategy = this.selectStrategy(analysis);
    const subtasks = strategy.decompose(analysis, context);

    if (knowledgeHint && knowledgeHint.avgTime > 5000) {
      const checkpointIndex = Math.floor(subtasks.length / 2);
      subtasks.splice(checkpointIndex, 0, {
        id: `checkpoint_${Date.now()}`,
        name: '中间检查点',
        description: `基于历史数据（平均耗时${Math.round(knowledgeHint.avgTime)}ms，${knowledgeHint.sampleCount}次样本），插入中间验证`,
        type: 'inspect',
        estimatedTime: 5,
        priority: 'medium'
      });
    }

    // 添加依赖关系
    const subtasksWithDeps = this.addDependencies(subtasks, analysis.taskType);

    // 添加约束条件
    const subtasksWithConstraints = this.addConstraints(subtasksWithDeps, analysis);

    return {
      analysis: analysis,
      strategy: strategy.name,
      subtasks: subtasksWithConstraints,
      totalSubtasks: subtasksWithConstraints.length,
      estimatedTotalTime: this.estimateTotalTime(subtasksWithConstraints),
      knowledgeHint: knowledgeHint
    };
  }

  /**
   * 选择拆解策略
   */
  selectStrategy(analysis) {
    const taskType = analysis.taskType;
    return this.decompositionStrategies[taskType] || this.decompositionStrategies['general'];
  }

  /**
   * 添加任务依赖关系
   * 采用阶段模型：同阶段任务可并行，后阶段依赖前阶段所有任务完成
   */
  addDependencies(subtasks, taskType) {
    // 阶段划分：0=探索/分析/研究, 1=规划/设计, 2=执行/实现, 3=测试/检查
    const PHASE_MAP = {
      explore: 0, analyze: 0, search: 0, research: 0, web_search: 0, doc_lookup: 0, api_reference: 0,
      plan: 1, design: 1, review: 1,
      code: 2, write: 2, implement: 2, execute: 2, refactor: 2,
      test: 3, inspect: 3, verify: 3
    };

    const getPhase = (task) => PHASE_MAP[task.type] ?? 2;

    // 按阶段分组
    const phaseGroups = {};
    subtasks.forEach(task => {
      const phase = getPhase(task);
      if (!phaseGroups[phase]) phaseGroups[phase] = [];
      phaseGroups[phase].push(task.id);
    });

    const sortedPhases = Object.keys(phaseGroups).map(Number).sort((a, b) => a - b);

    return subtasks.map(task => {
      const myPhase = getPhase(task);
      const myPhaseIdx = sortedPhases.indexOf(myPhase);
      const dependencies = [];

      // 依赖所有前置阶段的任务（而非链式依赖单个前驱）
      if (myPhaseIdx > 0) {
        const prevPhase = sortedPhases[myPhaseIdx - 1];
        dependencies.push(...(phaseGroups[prevPhase] || []));
      }

      return { ...task, dependencies };
    });
  }

  /**
   * 添加约束条件
   */
  addConstraints(subtasks, analysis) {
    return subtasks.map(task => {
      const constraints = {
        requiresAuth: false,
        maxRetries: 2,
        timeout: 300000, // 5分钟
        canRunInParallel: task.dependencies.length === 0
      };

      // 根据风险添加约束
      if (analysis.risks && analysis.risks.length > 0) {
        const highRisks = analysis.risks.filter(r => r.level === 'high');
        if (highRisks.length > 0) {
          constraints.requiresAuth = true;
          constraints.requiresReview = true;
        }
      }

      // 核心系统相关的任务需要授权
      if (task.type === 'modify_core' || task.involvesCore) {
        constraints.requiresAuth = true;
      }

      return {
        ...task,
        constraints: constraints
      };
    });
  }

  /**
   * 估算总时间
   */
  estimateTotalTime(subtasks) {
    // 简单累加（实际应考虑并行）
    const totalMinutes = subtasks.reduce((sum, task) => {
      return sum + (task.estimatedTime || 5);
    }, 0);

    if (totalMinutes < 60) {
      return `${totalMinutes}分钟`;
    } else {
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      return minutes > 0 ? `${hours}小时${minutes}分钟` : `${hours}小时`;
    }
  }

  /**
   * 初始化拆解策略
   */
  initializeStrategies() {
    return {
      'bug_fix': {
        name: 'Bug修复策略',
        decompose: (analysis, context) => {
          return [
            {
              id: 'bug_1',
              name: '复现Bug',
              description: '确认Bug存在并能稳定复现',
              type: 'explore',
              estimatedTime: 10,
              priority: 'high'
            },
            {
              id: 'bug_2',
              name: '定位Bug位置',
              description: '通过日志、调试等方式定位Bug代码位置',
              type: 'explore',
              estimatedTime: 15,
              priority: 'high'
            },
            {
              id: 'bug_3',
              name: '分析根因',
              description: '分析Bug产生的根本原因',
              type: 'analyze',
              estimatedTime: 20,
              priority: 'high'
            },
            {
              id: 'bug_4',
              name: '设计修复方案',
              description: '设计修复方案，考虑副作用',
              type: 'plan',
              estimatedTime: 15,
              priority: 'high'
            },
            {
              id: 'bug_5',
              name: '修复代码',
              description: '实施修复方案',
              type: 'code',
              estimatedTime: 20,
              priority: 'high'
            },
            {
              id: 'bug_6',
              name: '测试验证',
              description: '验证Bug已修复且未引入新问题',
              type: 'test',
              estimatedTime: 15,
              priority: 'high'
            }
          ];
        }
      },

      'feature': {
        name: '功能开发策略',
        decompose: (analysis, context) => {
          return [
            {
              id: 'feat_1',
              name: '需求分析',
              description: '理解功能需求和验收标准',
              type: 'analyze',
              estimatedTime: 15,
              priority: 'high'
            },
            {
              id: 'feat_2',
              name: '技术方案设计',
              description: '设计技术实现方案',
              type: 'plan',
              estimatedTime: 30,
              priority: 'high'
            },
            {
              id: 'feat_3',
              name: '接口定义',
              description: '定义API接口或模块接口',
              type: 'plan',
              estimatedTime: 15,
              priority: 'medium'
            },
            {
              id: 'feat_4',
              name: '核心逻辑实现',
              description: '实现核心业务逻辑',
              type: 'code',
              estimatedTime: 60,
              priority: 'high'
            },
            {
              id: 'feat_5',
              name: '编写测试',
              description: '编写单元测试和集成测试',
              type: 'test',
              estimatedTime: 30,
              priority: 'medium'
            },
            {
              id: 'feat_6',
              name: '文档更新',
              description: '更新相关文档',
              type: 'write',
              estimatedTime: 15,
              priority: 'low'
            }
          ];
        }
      },

      'refactor': {
        name: '重构策略',
        decompose: (analysis, context) => {
          return [
            {
              id: 'refactor_1',
              name: '分析现有代码',
              description: '理解当前代码结构和问题',
              type: 'explore',
              estimatedTime: 20,
              priority: 'high'
            },
            {
              id: 'refactor_2',
              name: '识别重构目标',
              description: '明确重构要解决的问题',
              type: 'analyze',
              estimatedTime: 15,
              priority: 'high'
            },
            {
              id: 'refactor_3',
              name: '设计重构方案',
              description: '设计新的代码结构',
              type: 'plan',
              estimatedTime: 30,
              priority: 'high'
            },
            {
              id: 'refactor_4',
              name: '准备测试',
              description: '确保有足够的测试覆盖',
              type: 'test',
              estimatedTime: 20,
              priority: 'high'
            },
            {
              id: 'refactor_5',
              name: '执行重构',
              description: '逐步重构代码',
              type: 'code',
              estimatedTime: 60,
              priority: 'high'
            },
            {
              id: 'refactor_6',
              name: '验证功能不变',
              description: '运行测试确保功能未改变',
              type: 'test',
              estimatedTime: 15,
              priority: 'high'
            }
          ];
        }
      },

      'documentation': {
        name: '文档编写策略',
        decompose: (analysis, context) => {
          return [
            {
              id: 'doc_1',
              name: '收集信息',
              description: '收集需要文档化的信息',
              type: 'explore',
              estimatedTime: 15,
              priority: 'high'
            },
            {
              id: 'doc_2',
              name: '组织结构',
              description: '设计文档结构和大纲',
              type: 'plan',
              estimatedTime: 10,
              priority: 'medium'
            },
            {
              id: 'doc_3',
              name: '编写内容',
              description: '编写文档内容',
              type: 'write',
              estimatedTime: 30,
              priority: 'high'
            },
            {
              id: 'doc_4',
              name: '添加示例',
              description: '添加代码示例和用法说明',
              type: 'write',
              estimatedTime: 15,
              priority: 'medium'
            },
            {
              id: 'doc_5',
              name: '审查校对',
              description: '检查文档准确性和完整性',
              type: 'review',
              estimatedTime: 10,
              priority: 'low'
            }
          ];
        }
      },

      'testing': {
        name: '测试策略',
        decompose: (analysis, context) => {
          return [
            {
              id: 'test_1',
              name: '分析测试需求',
              description: '确定需要测试的功能点',
              type: 'analyze',
              estimatedTime: 10,
              priority: 'high'
            },
            {
              id: 'test_2',
              name: '设计测试用例',
              description: '设计测试用例和场景',
              type: 'plan',
              estimatedTime: 20,
              priority: 'high'
            },
            {
              id: 'test_3',
              name: '编写测试代码',
              description: '实现测试用例',
              type: 'code',
              estimatedTime: 30,
              priority: 'high'
            },
            {
              id: 'test_4',
              name: '运行测试',
              description: '执行测试并收集结果',
              type: 'test',
              estimatedTime: 10,
              priority: 'high'
            }
          ];
        }
      },

      'security': {
        name: '安全修复策略',
        decompose: (analysis, context) => {
          return [
            {
              id: 'sec_1',
              name: '评估安全风险',
              description: '评估安全问题的严重程度',
              type: 'analyze',
              estimatedTime: 15,
              priority: 'critical',
              involvesCore: true
            },
            {
              id: 'sec_2',
              name: '设计修复方案',
              description: '设计安全修复方案',
              type: 'plan',
              estimatedTime: 20,
              priority: 'critical',
              involvesCore: true
            },
            {
              id: 'sec_3',
              name: '实施修复',
              description: '实施安全修复',
              type: 'code',
              estimatedTime: 30,
              priority: 'critical',
              involvesCore: true
            },
            {
              id: 'sec_4',
              name: '安全测试',
              description: '进行安全测试验证',
              type: 'test',
              estimatedTime: 20,
              priority: 'critical'
            },
            {
              id: 'sec_5',
              name: '安全审查',
              description: '安全专家审查',
              type: 'review',
              estimatedTime: 15,
              priority: 'critical',
              requiresAuth: true
            }
          ];
        }
      },

      'research': {
        name: '研究调研策略',
        decompose: (analysis, context) => {
          return [
            {
              id: 'research_1',
              name: '理解研究目标',
              description: '明确需要查找的信息和研究范围',
              type: 'analyze',
              estimatedTime: 5,
              priority: 'high'
            },
            {
              id: 'research_2',
              name: '网络搜索',
              description: '通过搜索引擎查找相关资料',
              type: 'research',
              estimatedTime: 10,
              priority: 'high'
            },
            {
              id: 'research_3',
              name: '文档查询',
              description: '查询官方文档和技术参考',
              type: 'doc_lookup',
              estimatedTime: 15,
              priority: 'high'
            },
            {
              id: 'research_4',
              name: '整理信息',
              description: '整理收集到的信息并提取关键点',
              type: 'analyze',
              estimatedTime: 10,
              priority: 'medium'
            },
            {
              id: 'research_5',
              name: '输出调研报告',
              description: '输出研究结果和建议',
              type: 'write',
              estimatedTime: 15,
              priority: 'medium'
            }
          ];
        }
      },

      'general': {
        name: '通用策略',
        decompose: (analysis, context) => {
          return [
            {
              id: 'gen_1',
              name: '分析任务',
              description: '理解任务要求',
              type: 'analyze',
              estimatedTime: 10,
              priority: 'high'
            },
            {
              id: 'gen_2',
              name: '制定计划',
              description: '制定执行计划',
              type: 'plan',
              estimatedTime: 15,
              priority: 'high'
            },
            {
              id: 'gen_3',
              name: '执行任务',
              description: '执行具体工作',
              type: 'execute',
              estimatedTime: 30,
              priority: 'high'
            },
            {
              id: 'gen_4',
              name: '验证结果',
              description: '验证任务完成质量',
              type: 'test',
              estimatedTime: 10,
              priority: 'medium'
            }
          ];
        }
      }
    };
  }
}

module.exports = TaskDecomposer;
