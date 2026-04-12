/**
 * Error Pattern Recognizer - 错误模式识别器
 * 分析和分类执行错误，识别常见错误模式
 *
 * 核心功能：
 * 1. 错误分类：根据错误类型和特征进行分类
 * 2. 模式识别：识别重复出现的错误模式
 * 3. 根因分析：分析错误的根本原因
 * 4. 趋势分析：跟踪错误发生趋势
 * 5. 建议生成：为常见错误提供修复建议
 */
class ErrorPatternRecognizer {
  constructor(config = {}) {
    this.config = {
      enableLearning: config.enableLearning !== false,
      minOccurrences: config.minOccurrences || 3, // 最少出现次数才算模式
      patternWindow: config.patternWindow || 100, // 分析最近N次错误
      similarityThreshold: config.similarityThreshold || 0.7, // 相似度阈值
      ...config
    };

    // 错误历史
    this.errorHistory = [];

    // 识别的错误模式
    this.patterns = new Map(); // patternId -> pattern

    // 错误分类统计
    this.categoryStats = new Map(); // category -> count

    // 错误计数器
    this.errorCounter = 0;
  }

  /**
   * 记录错误
   * @param {Object} error - 错误信息
   * @returns {Object} 分析结果
   */
  recordError(error) {
    const errorId = this.generateErrorId();
    const timestamp = Date.now();

    // 分类错误
    const category = this.categorizeError(error);

    // 提取错误特征
    const features = this.extractFeatures(error);

    // 创建错误记录
    const errorRecord = {
      id: errorId,
      timestamp,
      category,
      features,
      message: error.message || error.error || 'Unknown error',
      stack: error.stack,
      agentId: error.agentId,
      taskAction: error.taskAction,
      context: error.context || {}
    };

    // 添加到历史
    this.errorHistory.push(errorRecord);

    // 更新分类统计
    this.updateCategoryStats(category);

    // 识别模式
    const pattern = this.recognizePattern(errorRecord);

    // 生成分析结果
    const analysis = {
      errorId,
      category,
      pattern: pattern ? {
        id: pattern.id,
        name: pattern.name,
        occurrences: pattern.occurrences,
        confidence: pattern.confidence
      } : null,
      rootCause: this.analyzeRootCause(errorRecord, pattern),
      suggestions: this.generateSuggestions(errorRecord, pattern),
      severity: this.assessSeverity(errorRecord, pattern)
    };

    return analysis;
  }

  /**
   * 分类错误
   * @param {Object} error - 错误信息
   * @returns {string} 错误类别
   */
  categorizeError(error) {
    const message = (error.message || error.error || '').toLowerCase();
    const stack = (error.stack || '').toLowerCase();

    // 超时错误
    if (message.includes('timeout') || message.includes('超时')) {
      return 'timeout';
    }

    // 文件系统错误
    if (message.includes('enoent') || message.includes('file not found') ||
        message.includes('文件不存在') || message.includes('no such file')) {
      return 'file_not_found';
    }

    if (message.includes('eacces') || message.includes('permission denied') ||
        message.includes('权限不足')) {
      return 'permission_denied';
    }

    // 网络错误
    if (message.includes('econnrefused') || message.includes('connection refused') ||
        message.includes('network') || message.includes('网络')) {
      return 'network_error';
    }

    // 语法错误
    if (message.includes('syntaxerror') || message.includes('unexpected token') ||
        message.includes('语法错误')) {
      return 'syntax_error';
    }

    // 类型错误
    if (message.includes('typeerror') || message.includes('is not a function') ||
        message.includes('类型错误')) {
      return 'type_error';
    }

    // 引用错误
    if (message.includes('referenceerror') || message.includes('is not defined') ||
        message.includes('引用错误')) {
      return 'reference_error';
    }

    // 资源不足
    if (message.includes('out of memory') || message.includes('内存不足') ||
        message.includes('enomem')) {
      return 'resource_exhausted';
    }

    // 配置错误
    if (message.includes('config') || message.includes('configuration') ||
        message.includes('配置')) {
      return 'configuration_error';
    }

    // 依赖错误
    if (message.includes('cannot find module') || message.includes('module not found') ||
        message.includes('模块未找到')) {
      return 'dependency_error';
    }

    // 未知错误
    return 'unknown';
  }

  /**
   * 提取错误特征
   * @param {Object} error - 错误信息
   * @returns {Object} 错误特征
   */
  extractFeatures(error) {
    const message = error.message || error.error || '';
    const stack = error.stack || '';

    return {
      // 消息特征
      messageLength: message.length,
      messageWords: message.split(/\s+/).length,
      hasStackTrace: !!stack,

      // 上下文特征
      agentId: error.agentId,
      taskAction: error.taskAction,

      // 错误码特征
      errorCode: this.extractErrorCode(message),

      // 文件路径特征
      filePath: this.extractFilePath(message, stack),

      // 行号特征
      lineNumber: this.extractLineNumber(stack)
    };
  }

  /**
   * 提取错误码
   * @param {string} message - 错误消息
   * @returns {string|null} 错误码
   */
  extractErrorCode(message) {
    const match = message.match(/\b(E[A-Z]+)\b/);
    return match ? match[1] : null;
  }

  /**
   * 提取文件路径
   * @param {string} message - 错误消息
   * @param {string} stack - 堆栈信息
   * @returns {string|null} 文件路径
   */
  extractFilePath(message, stack) {
    // 从消息中提取
    let match = message.match(/['"]([^'"]+\.(js|ts|json|md))['"]/) ||
                message.match(/\b([a-zA-Z0-9_\-./\\]+\.(js|ts|json|md))\b/);
    if (match) return match[1];

    // 从堆栈中提取
    match = stack.match(/at\s+.*?\(([^)]+):(\d+):(\d+)\)/);
    if (match) return match[1];

    return null;
  }

  /**
   * 提取行号
   * @param {string} stack - 堆栈信息
   * @returns {number|null} 行号
   */
  extractLineNumber(stack) {
    const match = stack.match(/:(\d+):\d+\)?$/m);
    return match ? parseInt(match[1], 10) : null;
  }

  /**
   * 识别错误模式
   * @param {Object} errorRecord - 错误记录
   * @returns {Object|null} 匹配的模式
   */
  recognizePattern(errorRecord) {
    if (!this.config.enableLearning) {
      return null;
    }

    // 查找相似的历史错误
    const recentErrors = this.errorHistory.slice(-this.config.patternWindow);
    const similarErrors = recentErrors.filter(e =>
      this.calculateSimilarity(errorRecord, e) >= this.config.similarityThreshold
    );

    if (similarErrors.length < this.config.minOccurrences) {
      return null;
    }

    // 查找或创建模式
    const patternKey = this.generatePatternKey(errorRecord);
    let pattern = this.patterns.get(patternKey);

    if (!pattern) {
      pattern = {
        id: this.generatePatternId(),
        name: this.generatePatternName(errorRecord),
        category: errorRecord.category,
        features: errorRecord.features,
        occurrences: 0,
        firstSeen: errorRecord.timestamp,
        lastSeen: errorRecord.timestamp,
        examples: []
      };
      this.patterns.set(patternKey, pattern);
    }

    // 更新模式
    pattern.occurrences++;
    pattern.lastSeen = errorRecord.timestamp;
    pattern.examples.push({
      errorId: errorRecord.id,
      timestamp: errorRecord.timestamp,
      message: errorRecord.message
    });

    // 保留最近的示例
    if (pattern.examples.length > 10) {
      pattern.examples = pattern.examples.slice(-10);
    }

    // 计算置信度
    pattern.confidence = Math.min(
      pattern.occurrences / this.config.minOccurrences,
      1.0
    );

    return pattern;
  }

  /**
   * 计算错误相似度
   * @param {Object} error1 - 错误1
   * @param {Object} error2 - 错误2
   * @returns {number} 相似度 (0-1)
   */
  calculateSimilarity(error1, error2) {
    let score = 0;
    let weights = 0;

    // 类别相同 (权重: 0.3)
    if (error1.category === error2.category) {
      score += 0.3;
    }
    weights += 0.3;

    // Agent 相同 (权重: 0.2)
    if (error1.features.agentId === error2.features.agentId) {
      score += 0.2;
    }
    weights += 0.2;

    // 任务动作相同 (权重: 0.2)
    if (error1.features.taskAction === error2.features.taskAction) {
      score += 0.2;
    }
    weights += 0.2;

    // 错误码相同 (权重: 0.15)
    if (error1.features.errorCode && error1.features.errorCode === error2.features.errorCode) {
      score += 0.15;
    }
    weights += 0.15;

    // 消息相似度 (权重: 0.15)
    const messageSimilarity = this.calculateMessageSimilarity(error1.message, error2.message);
    score += messageSimilarity * 0.15;
    weights += 0.15;

    return score / weights;
  }

  /**
   * 计算消息相似度
   * @param {string} msg1 - 消息1
   * @param {string} msg2 - 消息2
   * @returns {number} 相似度 (0-1)
   */
  calculateMessageSimilarity(msg1, msg2) {
    const words1 = new Set(msg1.toLowerCase().split(/\s+/));
    const words2 = new Set(msg2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * 生成模式键
   * @param {Object} errorRecord - 错误记录
   * @returns {string} 模式键
   */
  generatePatternKey(errorRecord) {
    return `${errorRecord.category}:${errorRecord.features.agentId}:${errorRecord.features.taskAction}`;
  }

  /**
   * 生成模式名称
   * @param {Object} errorRecord - 错误记录
   * @returns {string} 模式名称
   */
  generatePatternName(errorRecord) {
    const category = errorRecord.category.replace(/_/g, ' ');
    const agent = errorRecord.features.agentId || 'unknown';
    const action = errorRecord.features.taskAction || 'unknown';

    return `${category} in ${agent}/${action}`;
  }

  /**
   * 分析根因
   * @param {Object} errorRecord - 错误记录
   * @param {Object|null} pattern - 匹配的模式
   * @returns {Object} 根因分析
   */
  analyzeRootCause(errorRecord, pattern) {
    const rootCause = {
      category: errorRecord.category,
      description: '',
      possibleCauses: []
    };

    switch (errorRecord.category) {
      case 'timeout':
        rootCause.description = '执行超时';
        rootCause.possibleCauses = [
          '任务执行时间过长',
          '网络延迟',
          '资源不足',
          '死锁或无限循环'
        ];
        break;

      case 'file_not_found':
        rootCause.description = '文件不存在';
        rootCause.possibleCauses = [
          '文件路径错误',
          '文件已被删除',
          '权限不足无法访问',
          '相对路径解析错误'
        ];
        break;

      case 'permission_denied':
        rootCause.description = '权限不足';
        rootCause.possibleCauses = [
          '文件或目录权限设置不正确',
          '用户权限不足',
          '文件被其他进程锁定'
        ];
        break;

      case 'network_error':
        rootCause.description = '网络错误';
        rootCause.possibleCauses = [
          '网络连接中断',
          '服务器不可达',
          '防火墙阻止',
          'DNS 解析失败'
        ];
        break;

      case 'syntax_error':
        rootCause.description = '语法错误';
        rootCause.possibleCauses = [
          '代码语法不正确',
          '缺少必要的符号',
          '使用了不支持的语法特性'
        ];
        break;

      case 'type_error':
        rootCause.description = '类型错误';
        rootCause.possibleCauses = [
          '变量类型不匹配',
          '调用了非函数对象',
          '访问了 undefined 或 null 的属性'
        ];
        break;

      case 'reference_error':
        rootCause.description = '引用错误';
        rootCause.possibleCauses = [
          '变量未定义',
          '作用域错误',
          '拼写错误'
        ];
        break;

      case 'resource_exhausted':
        rootCause.description = '资源耗尽';
        rootCause.possibleCauses = [
          '内存不足',
          '磁盘空间不足',
          '文件描述符耗尽'
        ];
        break;

      case 'configuration_error':
        rootCause.description = '配置错误';
        rootCause.possibleCauses = [
          '配置文件格式错误',
          '缺少必要的配置项',
          '配置值不合法'
        ];
        break;

      case 'dependency_error':
        rootCause.description = '依赖错误';
        rootCause.possibleCauses = [
          '模块未安装',
          '模块版本不兼容',
          '模块路径错误'
        ];
        break;

      default:
        rootCause.description = '未知错误';
        rootCause.possibleCauses = ['需要进一步分析'];
    }

    // 如果有模式，添加模式相关信息
    if (pattern) {
      rootCause.pattern = {
        id: pattern.id,
        name: pattern.name,
        occurrences: pattern.occurrences,
        note: `此错误已出现 ${pattern.occurrences} 次`
      };
    }

    return rootCause;
  }

  /**
   * 生成修复建议
   * @param {Object} errorRecord - 错误记录
   * @param {Object|null} pattern - 匹配的模式
   * @returns {Array} 修复建议列表
   */
  generateSuggestions(errorRecord, pattern) {
    const suggestions = [];

    switch (errorRecord.category) {
      case 'timeout':
        suggestions.push({
          action: 'increase_timeout',
          description: '增加超时时间',
          priority: 'medium'
        });
        suggestions.push({
          action: 'optimize_task',
          description: '优化任务执行逻辑',
          priority: 'high'
        });
        break;

      case 'file_not_found':
        suggestions.push({
          action: 'check_path',
          description: '检查文件路径是否正确',
          priority: 'high',
          details: errorRecord.features.filePath ? `检查路径: ${errorRecord.features.filePath}` : null
        });
        suggestions.push({
          action: 'create_file',
          description: '创建缺失的文件',
          priority: 'medium'
        });
        break;

      case 'permission_denied':
        suggestions.push({
          action: 'check_permissions',
          description: '检查文件权限',
          priority: 'high'
        });
        suggestions.push({
          action: 'run_as_admin',
          description: '使用管理员权限运行',
          priority: 'medium'
        });
        break;

      case 'network_error':
        suggestions.push({
          action: 'check_network',
          description: '检查网络连接',
          priority: 'high'
        });
        suggestions.push({
          action: 'retry',
          description: '重试操作',
          priority: 'medium'
        });
        break;

      case 'syntax_error':
        suggestions.push({
          action: 'fix_syntax',
          description: '修复语法错误',
          priority: 'high',
          details: errorRecord.features.lineNumber ? `检查第 ${errorRecord.features.lineNumber} 行` : null
        });
        break;

      case 'type_error':
      case 'reference_error':
        suggestions.push({
          action: 'check_code',
          description: '检查代码逻辑',
          priority: 'high'
        });
        suggestions.push({
          action: 'add_validation',
          description: '添加类型检查和验证',
          priority: 'medium'
        });
        break;

      case 'resource_exhausted':
        suggestions.push({
          action: 'free_resources',
          description: '释放资源',
          priority: 'high'
        });
        suggestions.push({
          action: 'increase_limits',
          description: '增加资源限制',
          priority: 'medium'
        });
        break;

      case 'configuration_error':
        suggestions.push({
          action: 'check_config',
          description: '检查配置文件',
          priority: 'high'
        });
        suggestions.push({
          action: 'use_defaults',
          description: '使用默认配置',
          priority: 'low'
        });
        break;

      case 'dependency_error':
        suggestions.push({
          action: 'install_dependencies',
          description: '安装缺失的依赖',
          priority: 'high'
        });
        suggestions.push({
          action: 'check_versions',
          description: '检查依赖版本兼容性',
          priority: 'medium'
        });
        break;

      default:
        suggestions.push({
          action: 'investigate',
          description: '需要进一步调查',
          priority: 'high'
        });
    }

    // 如果是重复模式，添加特殊建议
    if (pattern && pattern.occurrences >= 5) {
      suggestions.unshift({
        action: 'investigate_pattern',
        description: `此错误已重复出现 ${pattern.occurrences} 次，建议深入调查根本原因`,
        priority: 'critical'
      });
    }

    return suggestions;
  }

  /**
   * 评估严重程度
   * @param {Object} errorRecord - 错误记录
   * @param {Object|null} pattern - 匹配的模式
   * @returns {string} 严重程度
   */
  assessSeverity(errorRecord, pattern) {
    // 基础严重程度
    let severity = 'medium';

    // 根据类别调整
    const criticalCategories = ['resource_exhausted', 'permission_denied'];
    const highCategories = ['syntax_error', 'type_error', 'reference_error', 'dependency_error'];
    const mediumCategories = ['timeout', 'network_error', 'file_not_found'];

    if (criticalCategories.includes(errorRecord.category)) {
      severity = 'critical';
    } else if (highCategories.includes(errorRecord.category)) {
      severity = 'high';
    } else if (mediumCategories.includes(errorRecord.category)) {
      severity = 'medium';
    } else {
      severity = 'low';
    }

    // 如果是重复模式，提升严重程度
    if (pattern && pattern.occurrences >= 5) {
      if (severity === 'low') severity = 'medium';
      else if (severity === 'medium') severity = 'high';
      else if (severity === 'high') severity = 'critical';
    }

    return severity;
  }

  /**
   * 获取错误统计
   * @returns {Object} 统计信息
   */
  getStats() {
    const total = this.errorHistory.length;
    const patterns = this.patterns.size;

    // 按类别统计
    const byCategory = {};
    for (const [category, count] of this.categoryStats.entries()) {
      byCategory[category] = {
        count,
        percentage: total > 0 ? ((count / total) * 100).toFixed(1) : 0
      };
    }

    // 最常见的错误类别
    const topCategories = Array.from(this.categoryStats.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([category, count]) => ({ category, count }));

    // 最活跃的模式
    const topPatterns = Array.from(this.patterns.values())
      .sort((a, b) => b.occurrences - a.occurrences)
      .slice(0, 5)
      .map(p => ({
        id: p.id,
        name: p.name,
        occurrences: p.occurrences,
        confidence: p.confidence
      }));

    return {
      totalErrors: total,
      totalPatterns: patterns,
      byCategory,
      topCategories,
      topPatterns
    };
  }

  /**
   * 获取错误历史
   * @param {Object} filter - 过滤条件
   * @returns {Array} 错误历史
   */
  getErrorHistory(filter = {}) {
    let history = [...this.errorHistory];

    // 按类别过滤
    if (filter.category) {
      history = history.filter(e => e.category === filter.category);
    }

    // 按 Agent 过滤
    if (filter.agentId) {
      history = history.filter(e => e.features.agentId === filter.agentId);
    }

    // 按时间范围过滤
    if (filter.since) {
      history = history.filter(e => e.timestamp >= filter.since);
    }

    // 限制数量
    if (filter.limit) {
      history = history.slice(-filter.limit);
    }

    return history;
  }

  /**
   * 获取模式列表
   * @param {Object} filter - 过滤条件
   * @returns {Array} 模式列表
   */
  getPatterns(filter = {}) {
    let patterns = Array.from(this.patterns.values());

    // 按类别过滤
    if (filter.category) {
      patterns = patterns.filter(p => p.category === filter.category);
    }

    // 按最小出现次数过滤
    if (filter.minOccurrences) {
      patterns = patterns.filter(p => p.occurrences >= filter.minOccurrences);
    }

    // 排序
    if (filter.sortBy === 'occurrences') {
      patterns.sort((a, b) => b.occurrences - a.occurrences);
    } else if (filter.sortBy === 'recent') {
      patterns.sort((a, b) => b.lastSeen - a.lastSeen);
    }

    return patterns;
  }

  /**
   * 更新分类统计
   * @param {string} category - 错误类别
   */
  updateCategoryStats(category) {
    const count = this.categoryStats.get(category) || 0;
    this.categoryStats.set(category, count + 1);
  }

  /**
   * 生成错误ID
   * @returns {string} 错误ID
   */
  generateErrorId() {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 生成模式ID
   * @returns {string} 模式ID
   */
  generatePatternId() {
    return `pattern_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 清理历史记录
   * @param {number} keepLast - 保留最近N条记录
   * @returns {number} 清理的记录数
   */
  clearHistory(keepLast = 1000) {
    const before = this.errorHistory.length;

    if (keepLast > 0 && this.errorHistory.length > keepLast) {
      this.errorHistory = this.errorHistory.slice(-keepLast);
    } else if (keepLast === 0) {
      this.errorHistory = [];
    }

    return before - this.errorHistory.length;
  }
}

module.exports = ErrorPatternRecognizer;
