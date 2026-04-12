/**
 * agents-parser.js - AGENTS.md 运行时解析器
 *
 * 文档要求：解析 AGENTS.md 中的角色定义、禁止项、协作规则，
 * 运行时强制执行，确保任何 Agent 操作都符合架构约束。
 *
 * @version 1.0.0
 * @date 2026-04-13
 */

const fs = require('fs');
const path = require('path');

// ============================================================
// 常量
// ============================================================

const AGENT_ROLES = {
  CEO: 'supervisor',
  DIRECTOR_EXPLORE: 'explore',
  DIRECTOR_PLAN: 'plan',
  DIRECTOR_GENERAL: 'general',
  DIRECTOR_INSPECTOR: 'inspector'
};

// ============================================================
// AgentsParser - 解析 AGENTS.md 并生成运行时规则
// ============================================================

class AgentsParser {
  /**
   * @param {string} agentsMdPath - AGENTS.md 文件路径
   */
  constructor(agentsMdPath = null) {
    this.agentsMdPath = agentsMdPath;
    this.rawContent = '';
    this.parsed = false;

    // 解析结果
    this.roles = {};           // 角色定义
    this.prohibitions = {      // 禁止项
      global: [],              // 全局禁止（所有Agent）
      byRole: {}               // 按角色的禁止项
    };
    this.collaborationRules = []; // 协作规则
    this.capabilities = {};    // 各角色能力
    this.exceptions = [];      // 例外规则（需要人工授权的）
  }

  // ----------------------------------------------------------
  // 核心：解析 AGENTS.md
  // ----------------------------------------------------------

  /**
   * 加载并解析 AGENTS.md
   * @param {string} [filePath] - 可选路径覆盖
   * @returns {AgentsParser} this（链式调用）
   */
  parse(filePath = null) {
    const targetPath = filePath || this.agentsMdPath || this._findAgentsMd();

    if (!targetPath || !fs.existsSync(targetPath)) {
      console.warn('[AgentsParser] AGENTS.md 未找到，使用内置默认规则');
      this._loadDefaults();
      this.parsed = true;
      return this;
    }

    this.agentsMdPath = targetPath;
    this.rawContent = fs.readFileSync(targetPath, 'utf8');

    // 分段解析
    this._parseRoles();
    this._parseProhibitions();
    this._parseCollaborationRules();
    this._parseCapabilities();
    this._parseExceptions();

    this.parsed = true;
    return this;
  }

  // ----------------------------------------------------------
  // 运行时强制执行
  // ----------------------------------------------------------

  /**
   * 校验某个 Agent 是否允许执行某操作
   * @param {string} agentRole  - Agent 角色 (supervisor/explore/plan/general/inspector)
   * @param {string} action     - 动作 (write_code/modify_file/run_command/dispatch/modify_schema/...)
   * @param {Object} context    - 附加上下文 { filePath, command, targetAgent }
   * @returns {{ allowed: boolean, reason: string|null, requiresApproval: boolean }}
   */
  checkAction(agentRole, action, context = {}) {
    if (!this.parsed) {
      this.parse();
    }

    // 1. 全局禁止项检查
    for (const prohibition of this.prohibitions.global) {
      if (this._matchProhibition(prohibition, action, context)) {
        // 检查是否有例外
        const exception = this._findException(prohibition, action, context);
        if (exception) {
          return {
            allowed: false,
            reason: `${prohibition.description} (需要人工授权: ${exception.condition})`,
            requiresApproval: true
          };
        }
        return {
          allowed: false,
          reason: `全局禁止: ${prohibition.description}`,
          requiresApproval: false
        };
      }
    }

    // 2. 角色特定禁止项检查
    const roleProhibitions = this.prohibitions.byRole[agentRole] || [];
    for (const prohibition of roleProhibitions) {
      if (this._matchProhibition(prohibition, action, context)) {
        return {
          allowed: false,
          reason: `角色 ${agentRole} 禁止: ${prohibition.description}`,
          requiresApproval: false
        };
      }
    }

    // 3. 协作规则检查
    for (const rule of this.collaborationRules) {
      const violation = this._checkCollaborationRule(rule, agentRole, action, context);
      if (violation) {
        return {
          allowed: false,
          reason: `协作规则违反: ${violation}`,
          requiresApproval: false
        };
      }
    }

    // 4. 能力检查（Agent 是否有执行此操作的能力声明）
    const roleCapabilities = this.capabilities[agentRole] || [];
    if (roleCapabilities.length > 0 && !this._hasCapability(agentRole, action)) {
      return {
        allowed: false,
        reason: `角色 ${agentRole} 未声明能力: ${action}`,
        requiresApproval: false
      };
    }

    return { allowed: true, reason: null, requiresApproval: false };
  }

  /**
   * 批量校验一组操作
   * @param {string} agentRole
   * @param {Array<{action: string, context: Object}>} actions
   * @returns {Array<{action: string, result: Object}>}
   */
  checkActions(agentRole, actions) {
    return actions.map(({ action, context }) => ({
      action,
      result: this.checkAction(agentRole, action, context)
    }));
  }

  /**
   * 获取某角色的所有禁止项（用于预检）
   */
  getProhibitionsForRole(agentRole) {
    return {
      global: this.prohibitions.global,
      roleSpecific: this.prohibitions.byRole[agentRole] || []
    };
  }

  /**
   * 获取解析后的完整规则集
   */
  getRules() {
    return {
      roles: this.roles,
      prohibitions: this.prohibitions,
      collaborationRules: this.collaborationRules,
      capabilities: this.capabilities,
      exceptions: this.exceptions
    };
  }

  // ----------------------------------------------------------
  // 内部解析方法
  // ----------------------------------------------------------

  /**
   * 解析角色定义
   */
  _parseRoles() {
    const rolePatterns = [
      { pattern: /###\s+CEO[:\s]+(.+)/i, role: 'supervisor', title: 'CEO' },
      { pattern: /###\s+总监1[:\s]+(.+)/i, role: 'explore', title: '总监1' },
      { pattern: /###\s+总监2[:\s]+(.+)/i, role: 'plan', title: '总监2' },
      { pattern: /###\s+总监3[:\s]+(.+)/i, role: 'general', title: '总监3' },
      { pattern: /###\s+总监4[:\s]+(.+)/i, role: 'inspector', title: '总监4' }
    ];

    for (const rp of rolePatterns) {
      const match = this.rawContent.match(rp.pattern);
      if (match) {
        this.roles[rp.role] = {
          title: rp.title,
          name: match[1].trim(),
          description: this._extractSection(match.index, '###')
        };
      }
    }

    // 如果没有解析到角色，使用默认
    if (Object.keys(this.roles).length === 0) {
      this._loadDefaultRoles();
    }
  }

  /**
   * 解析禁止项（❌ 标记的行）
   */
  _parseProhibitions() {
    const lines = this.rawContent.split('\n');
    let currentSection = '';
    let currentRole = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // 检测章节
      if (line.startsWith('### ')) {
        if (line.includes('CEO') || line.includes('Supervisor')) {
          currentRole = 'supervisor';
        } else if (line.includes('总监1') || line.includes('Explore')) {
          currentRole = 'explore';
        } else if (line.includes('总监2') || line.includes('Plan')) {
          currentRole = 'plan';
        } else if (line.includes('总监3') || line.includes('General')) {
          currentRole = 'general';
        } else if (line.includes('总监4') || line.includes('Inspector')) {
          currentRole = 'inspector';
        }
      }

      if (line.startsWith('## ')) {
        currentSection = line;
        // "所有 Agent 禁止" 段落 → 全局
        if (line.includes('所有') && line.includes('禁止')) {
          currentRole = '__global__';
        }
      }

      // 提取 ❌ 开头的禁止项
      if (line.startsWith('- ❌') || line.startsWith('❌')) {
        const description = line.replace(/^-?\s*❌\s*/, '').trim();
        const prohibition = this._classifyProhibition(description);

        if (currentRole === '__global__' || currentSection.includes('所有')) {
          this.prohibitions.global.push(prohibition);
        } else if (currentRole) {
          if (!this.prohibitions.byRole[currentRole]) {
            this.prohibitions.byRole[currentRole] = [];
          }
          this.prohibitions.byRole[currentRole].push(prohibition);
        }
      }
    }

    // 如果没有解析到任何禁止项，加载默认
    if (this.prohibitions.global.length === 0 && Object.keys(this.prohibitions.byRole).length === 0) {
      this._loadDefaultProhibitions();
    }
  }

  /**
   * 解析协作规则
   */
  _parseCollaborationRules() {
    const rulePatterns = [
      { pattern: /CEO\s*统一调度/i, rule: { type: 'dispatch_authority', description: 'CEO 统一调度：所有任务由 CEO 分配' } },
      { pattern: /总监独立执行/i, rule: { type: 'independent_execution', description: '总监独立执行：各总监独立完成分配的任务' } },
      { pattern: /禁止越级/i, rule: { type: 'no_skip_level', description: '禁止越级：总监不能直接调用其他总监' } },
      { pattern: /结果上报/i, rule: { type: 'report_to_ceo', description: '结果上报：所有结果返回给 CEO' } },
      { pattern: /CEO\s*决策/i, rule: { type: 'ceo_decision', description: 'CEO 决策：由 CEO 决定下一步行动' } }
    ];

    for (const rp of rulePatterns) {
      if (rp.pattern.test(this.rawContent)) {
        this.collaborationRules.push(rp.rule);
      }
    }

    // 默认规则（如果一条都没匹配到）
    if (this.collaborationRules.length === 0) {
      this._loadDefaultCollaborationRules();
    }
  }

  /**
   * 解析各角色能力
   */
  _parseCapabilities() {
    const lines = this.rawContent.split('\n');
    let currentRole = null;
    let inCapabilities = false;

    for (const line of lines) {
      const trimmed = line.trim();

      // 检测角色
      if (trimmed.startsWith('### ')) {
        if (trimmed.includes('CEO') || trimmed.includes('Supervisor')) currentRole = 'supervisor';
        else if (trimmed.includes('总监1') || trimmed.includes('Explore')) currentRole = 'explore';
        else if (trimmed.includes('总监2') || trimmed.includes('Plan')) currentRole = 'plan';
        else if (trimmed.includes('总监3') || trimmed.includes('General')) currentRole = 'general';
        else if (trimmed.includes('总监4') || trimmed.includes('Inspector')) currentRole = 'inspector';
        else currentRole = null;
      }

      // 检测能力段落
      if (trimmed.includes('能力要求') || trimmed.includes('能力')) {
        inCapabilities = true;
      }

      // 提取 ✅ 标记的能力
      if (currentRole && inCapabilities && (trimmed.startsWith('- ✅') || trimmed.startsWith('✅'))) {
        const capability = trimmed.replace(/^-?\s*✅\s*/, '').trim();
        if (!this.capabilities[currentRole]) {
          this.capabilities[currentRole] = [];
        }
        this.capabilities[currentRole].push(capability);
      }

      // 下一个段落
      if (trimmed.startsWith('**') && !trimmed.includes('能力')) {
        inCapabilities = false;
      }
    }
  }

  /**
   * 解析例外规则
   */
  _parseExceptions() {
    const exceptionPattern = /\*\*例外\*\*[:\s：]*(.*)/g;
    let match;
    while ((match = exceptionPattern.exec(this.rawContent)) !== null) {
      this.exceptions.push({
        description: match[1].trim(),
        condition: 'interactive_mode',
        requiresApproval: true
      });
    }

    // 扫描 "需要人工授权" 或 "interactive 模式" 相关内容
    if (this.rawContent.includes('人工授权') || this.rawContent.includes('interactive')) {
      if (this.exceptions.length === 0) {
        this.exceptions.push({
          description: '核心操作需要人工授权（interactive 模式）',
          condition: 'interactive_mode',
          requiresApproval: true
        });
      }
    }
  }

  // ----------------------------------------------------------
  // 匹配与检查
  // ----------------------------------------------------------

  /**
   * 将禁止描述分类为可匹配的规则
   */
  _classifyProhibition(description) {
    const actionMap = [
      { keywords: ['写代码', '不写代码', 'write code'], actions: ['write_code'] },
      { keywords: ['改文件', '不改文件', '修改文件', 'modify file'], actions: ['modify_file'] },
      { keywords: ['跑命令', '不跑命令', '执行命令', 'run command'], actions: ['run_command'] },
      { keywords: ['具体实施', '不做具体实施'], actions: ['implement'] },
      { keywords: ['schema', '数据库结构'], actions: ['modify_schema'] },
      { keywords: ['支付', '支付相关'], actions: ['modify_payment'] },
      { keywords: ['认证', '鉴权', '认证/鉴权'], actions: ['modify_auth'] },
      { keywords: ['API 契约', 'API契约'], actions: ['modify_api_contract'] },
      { keywords: ['删除生产数据', '生产数据'], actions: ['delete_production_data'] }
    ];

    const matchedActions = [];
    for (const mapping of actionMap) {
      for (const kw of mapping.keywords) {
        if (description.includes(kw)) {
          matchedActions.push(...mapping.actions);
          break;
        }
      }
    }

    return {
      description,
      actions: matchedActions.length > 0 ? matchedActions : ['unknown'],
      raw: description
    };
  }

  /**
   * 检查禁止项是否匹配当前操作
   */
  _matchProhibition(prohibition, action, context) {
    // 精确匹配 action
    if (prohibition.actions.includes(action)) {
      return true;
    }

    // 只读命令例外（"不跑命令（只读除外）"）
    if (prohibition.actions.includes('run_command') && action === 'run_command') {
      if (prohibition.description.includes('只读除外') && context.readOnly) {
        return false;
      }
      return true;
    }

    return false;
  }

  /**
   * 检查协作规则
   */
  _checkCollaborationRule(rule, agentRole, action, context) {
    switch (rule.type) {
      case 'no_skip_level':
        // 总监不能直接调用其他总监
        if (agentRole !== 'supervisor' && action === 'dispatch' && context.targetAgent) {
          const targetRole = context.targetAgent;
          if (targetRole !== 'supervisor' && targetRole !== agentRole) {
            return `总监 ${agentRole} 不能直接调度总监 ${targetRole}，必须通过 CEO`;
          }
        }
        break;

      case 'dispatch_authority':
        // 只有 CEO 能调度
        if (action === 'dispatch' && agentRole !== 'supervisor') {
          return `只有 CEO (supervisor) 能调度 Agent，${agentRole} 无调度权限`;
        }
        break;

      case 'report_to_ceo':
        // 结果必须返回给 CEO
        if (action === 'report' && context.reportTo && context.reportTo !== 'supervisor') {
          return `结果必须上报给 CEO，不能直接报告给 ${context.reportTo}`;
        }
        break;
    }

    return null;
  }

  /**
   * 检查是否有例外
   */
  _findException(prohibition, action, context) {
    for (const exception of this.exceptions) {
      // 当前的例外都需要 interactive 模式
      if (exception.requiresApproval) {
        return exception;
      }
    }
    return null;
  }

  /**
   * 检查角色是否有某能力
   */
  _hasCapability(agentRole, action) {
    const caps = this.capabilities[agentRole] || [];
    // 用关键词模糊匹配
    const actionKeywords = action.replace(/_/g, ' ').toLowerCase().split(' ');
    return caps.some(cap => {
      const capLower = cap.toLowerCase();
      return actionKeywords.some(kw => capLower.includes(kw));
    });
  }

  // ----------------------------------------------------------
  // 辅助方法
  // ----------------------------------------------------------

  _findAgentsMd() {
    // 在当前目录和上级目录寻找 AGENTS.md
    const candidates = [
      path.join(process.cwd(), 'AGENTS.md'),
      path.join(process.cwd(), '..', 'AGENTS.md'),
      path.join(__dirname, '..', 'AGENTS.md')
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    return null;
  }

  _extractSection(startIndex, nextHeaderLevel) {
    const rest = this.rawContent.substring(startIndex);
    const nextHeader = rest.indexOf(`\n${nextHeaderLevel} `, 10);
    if (nextHeader === -1) return rest;
    return rest.substring(0, nextHeader).trim();
  }

  // ----------------------------------------------------------
  // 默认规则（AGENTS.md 不存在时的 fallback）
  // ----------------------------------------------------------

  _loadDefaults() {
    this._loadDefaultRoles();
    this._loadDefaultProhibitions();
    this._loadDefaultCollaborationRules();
  }

  _loadDefaultRoles() {
    this.roles = {
      supervisor: { title: 'CEO', name: 'Supervisor Agent', description: '领导、调度器、决策者' },
      explore: { title: '总监1', name: 'Explore Agent', description: '探索总监、信息收集者' },
      plan: { title: '总监2', name: 'Plan Agent', description: '规划总监、架构师' },
      general: { title: '总监3', name: 'General-Purpose Agent', description: '执行总监、实施者' },
      inspector: { title: '总监4', name: 'Inspector Agent', description: '质检总监、检查者' }
    };
  }

  _loadDefaultProhibitions() {
    // CEO 禁止项
    this.prohibitions.byRole.supervisor = [
      { description: '不写代码', actions: ['write_code'] },
      { description: '不改文件', actions: ['modify_file'] },
      { description: '不跑命令（只读除外）', actions: ['run_command'] },
      { description: '不做具体实施', actions: ['implement'] }
    ];

    // 全局禁止项
    this.prohibitions.global = [
      { description: '不能修改 schema（数据库结构）', actions: ['modify_schema'] },
      { description: '不能修改支付相关代码', actions: ['modify_payment'] },
      { description: '不能修改认证/鉴权逻辑', actions: ['modify_auth'] },
      { description: '不能修改 API 契约', actions: ['modify_api_contract'] },
      { description: '不能删除生产数据', actions: ['delete_production_data'] }
    ];
  }

  _loadDefaultCollaborationRules() {
    this.collaborationRules = [
      { type: 'dispatch_authority', description: 'CEO 统一调度：所有任务由 CEO 分配' },
      { type: 'independent_execution', description: '总监独立执行：各总监独立完成分配的任务' },
      { type: 'no_skip_level', description: '禁止越级：总监不能直接调用其他总监' },
      { type: 'report_to_ceo', description: '结果上报：所有结果返回给 CEO' },
      { type: 'ceo_decision', description: 'CEO 决策：由 CEO 决定下一步行动' }
    ];
  }
}

// ============================================================
// 导出
// ============================================================

module.exports = { AgentsParser, AGENT_ROLES };
