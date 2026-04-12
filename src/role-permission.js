/**
 * role-permission.js - 角色权限模型
 *
 * 文档要求：三级权限模型，6种角色，授权矩阵，授权疲劳防护
 *
 * @version 1.0.0
 * @date 2026-04-13
 */

// ============================================================
// 角色定义
// ============================================================

const ROLES = {
  ADMIN: 'admin',
  TECH_LEAD: 'tech_lead',
  SECURITY_LEAD: 'security_lead',
  DBA: 'dba',
  DEVELOPER: 'developer',
  OBSERVER: 'observer'
};

// 角色层级（数字越大权限越高）
const ROLE_HIERARCHY = {
  [ROLES.OBSERVER]: 0,
  [ROLES.DEVELOPER]: 1,
  [ROLES.DBA]: 2,
  [ROLES.SECURITY_LEAD]: 3,
  [ROLES.TECH_LEAD]: 4,
  [ROLES.ADMIN]: 5
};

// ============================================================
// 权限级别
// ============================================================

const PERMISSION_LEVELS = {
  NONE: 'none',
  READ: 'read',
  WRITE: 'write',
  ADMIN: 'admin'
};

const PERMISSION_ORDER = {
  [PERMISSION_LEVELS.NONE]: 0,
  [PERMISSION_LEVELS.READ]: 1,
  [PERMISSION_LEVELS.WRITE]: 2,
  [PERMISSION_LEVELS.ADMIN]: 3
};

// ============================================================
// 操作类型（对应文档中的各种操作）
// ============================================================

const OPERATIONS = {
  // 文件操作
  FILE_READ: 'file:read',
  FILE_WRITE: 'file:write',
  FILE_DELETE: 'file:delete',

  // 命令操作
  CMD_READ: 'cmd:read',
  CMD_WRITE: 'cmd:write',
  CMD_DANGEROUS: 'cmd:dangerous',

  // 代码操作
  CODE_READ: 'code:read',
  CODE_MODIFY: 'code:modify',
  CODE_REVIEW: 'code:review',

  // 核心链路（高危）
  SCHEMA_MODIFY: 'schema:modify',
  PAYMENT_MODIFY: 'payment:modify',
  AUTH_MODIFY: 'auth:modify',
  API_CONTRACT_MODIFY: 'api_contract:modify',
  PRODUCTION_DATA_DELETE: 'production:delete',

  // 管理操作
  AGENT_DISPATCH: 'agent:dispatch',
  CONFIG_MODIFY: 'config:modify',
  POLICY_MODIFY: 'policy:modify',
  USER_MANAGE: 'user:manage',

  // 安全操作
  SECURITY_SCAN: 'security:scan',
  SECURITY_CONFIG: 'security:config',
  AUDIT_READ: 'audit:read',
  AUDIT_EXPORT: 'audit:export'
};

// ============================================================
// 授权矩阵 - 角色×操作 → 权限级别
// ============================================================

const AUTHORIZATION_MATRIX = {
  // Admin: 全权
  [ROLES.ADMIN]: {
    [OPERATIONS.FILE_READ]: PERMISSION_LEVELS.ADMIN,
    [OPERATIONS.FILE_WRITE]: PERMISSION_LEVELS.ADMIN,
    [OPERATIONS.FILE_DELETE]: PERMISSION_LEVELS.ADMIN,
    [OPERATIONS.CMD_READ]: PERMISSION_LEVELS.ADMIN,
    [OPERATIONS.CMD_WRITE]: PERMISSION_LEVELS.ADMIN,
    [OPERATIONS.CMD_DANGEROUS]: PERMISSION_LEVELS.ADMIN,
    [OPERATIONS.CODE_READ]: PERMISSION_LEVELS.ADMIN,
    [OPERATIONS.CODE_MODIFY]: PERMISSION_LEVELS.ADMIN,
    [OPERATIONS.CODE_REVIEW]: PERMISSION_LEVELS.ADMIN,
    [OPERATIONS.SCHEMA_MODIFY]: PERMISSION_LEVELS.ADMIN,
    [OPERATIONS.PAYMENT_MODIFY]: PERMISSION_LEVELS.ADMIN,
    [OPERATIONS.AUTH_MODIFY]: PERMISSION_LEVELS.ADMIN,
    [OPERATIONS.API_CONTRACT_MODIFY]: PERMISSION_LEVELS.ADMIN,
    [OPERATIONS.PRODUCTION_DATA_DELETE]: PERMISSION_LEVELS.ADMIN,
    [OPERATIONS.AGENT_DISPATCH]: PERMISSION_LEVELS.ADMIN,
    [OPERATIONS.CONFIG_MODIFY]: PERMISSION_LEVELS.ADMIN,
    [OPERATIONS.POLICY_MODIFY]: PERMISSION_LEVELS.ADMIN,
    [OPERATIONS.USER_MANAGE]: PERMISSION_LEVELS.ADMIN,
    [OPERATIONS.SECURITY_SCAN]: PERMISSION_LEVELS.ADMIN,
    [OPERATIONS.SECURITY_CONFIG]: PERMISSION_LEVELS.ADMIN,
    [OPERATIONS.AUDIT_READ]: PERMISSION_LEVELS.ADMIN,
    [OPERATIONS.AUDIT_EXPORT]: PERMISSION_LEVELS.ADMIN
  },

  // TechLead: 技术决策权，但不能改安全配置和用户管理
  [ROLES.TECH_LEAD]: {
    [OPERATIONS.FILE_READ]: PERMISSION_LEVELS.ADMIN,
    [OPERATIONS.FILE_WRITE]: PERMISSION_LEVELS.WRITE,
    [OPERATIONS.FILE_DELETE]: PERMISSION_LEVELS.WRITE,
    [OPERATIONS.CMD_READ]: PERMISSION_LEVELS.ADMIN,
    [OPERATIONS.CMD_WRITE]: PERMISSION_LEVELS.WRITE,
    [OPERATIONS.CMD_DANGEROUS]: PERMISSION_LEVELS.READ,  // 只能查看，不能执行
    [OPERATIONS.CODE_READ]: PERMISSION_LEVELS.ADMIN,
    [OPERATIONS.CODE_MODIFY]: PERMISSION_LEVELS.WRITE,
    [OPERATIONS.CODE_REVIEW]: PERMISSION_LEVELS.ADMIN,
    [OPERATIONS.SCHEMA_MODIFY]: PERMISSION_LEVELS.WRITE,
    [OPERATIONS.PAYMENT_MODIFY]: PERMISSION_LEVELS.READ,
    [OPERATIONS.AUTH_MODIFY]: PERMISSION_LEVELS.READ,
    [OPERATIONS.API_CONTRACT_MODIFY]: PERMISSION_LEVELS.WRITE,
    [OPERATIONS.PRODUCTION_DATA_DELETE]: PERMISSION_LEVELS.NONE,
    [OPERATIONS.AGENT_DISPATCH]: PERMISSION_LEVELS.WRITE,
    [OPERATIONS.CONFIG_MODIFY]: PERMISSION_LEVELS.WRITE,
    [OPERATIONS.POLICY_MODIFY]: PERMISSION_LEVELS.READ,
    [OPERATIONS.USER_MANAGE]: PERMISSION_LEVELS.NONE,
    [OPERATIONS.SECURITY_SCAN]: PERMISSION_LEVELS.READ,
    [OPERATIONS.SECURITY_CONFIG]: PERMISSION_LEVELS.NONE,
    [OPERATIONS.AUDIT_READ]: PERMISSION_LEVELS.READ,
    [OPERATIONS.AUDIT_EXPORT]: PERMISSION_LEVELS.NONE
  },

  // SecurityLead: 安全相关全权，其他只读
  [ROLES.SECURITY_LEAD]: {
    [OPERATIONS.FILE_READ]: PERMISSION_LEVELS.READ,
    [OPERATIONS.FILE_WRITE]: PERMISSION_LEVELS.NONE,
    [OPERATIONS.FILE_DELETE]: PERMISSION_LEVELS.NONE,
    [OPERATIONS.CMD_READ]: PERMISSION_LEVELS.READ,
    [OPERATIONS.CMD_WRITE]: PERMISSION_LEVELS.NONE,
    [OPERATIONS.CMD_DANGEROUS]: PERMISSION_LEVELS.NONE,
    [OPERATIONS.CODE_READ]: PERMISSION_LEVELS.READ,
    [OPERATIONS.CODE_MODIFY]: PERMISSION_LEVELS.NONE,
    [OPERATIONS.CODE_REVIEW]: PERMISSION_LEVELS.READ,
    [OPERATIONS.SCHEMA_MODIFY]: PERMISSION_LEVELS.NONE,
    [OPERATIONS.PAYMENT_MODIFY]: PERMISSION_LEVELS.READ,
    [OPERATIONS.AUTH_MODIFY]: PERMISSION_LEVELS.ADMIN,
    [OPERATIONS.API_CONTRACT_MODIFY]: PERMISSION_LEVELS.READ,
    [OPERATIONS.PRODUCTION_DATA_DELETE]: PERMISSION_LEVELS.NONE,
    [OPERATIONS.AGENT_DISPATCH]: PERMISSION_LEVELS.NONE,
    [OPERATIONS.CONFIG_MODIFY]: PERMISSION_LEVELS.NONE,
    [OPERATIONS.POLICY_MODIFY]: PERMISSION_LEVELS.ADMIN,
    [OPERATIONS.USER_MANAGE]: PERMISSION_LEVELS.NONE,
    [OPERATIONS.SECURITY_SCAN]: PERMISSION_LEVELS.ADMIN,
    [OPERATIONS.SECURITY_CONFIG]: PERMISSION_LEVELS.ADMIN,
    [OPERATIONS.AUDIT_READ]: PERMISSION_LEVELS.ADMIN,
    [OPERATIONS.AUDIT_EXPORT]: PERMISSION_LEVELS.ADMIN
  },

  // DBA: 数据库相关权限，其他受限
  [ROLES.DBA]: {
    [OPERATIONS.FILE_READ]: PERMISSION_LEVELS.READ,
    [OPERATIONS.FILE_WRITE]: PERMISSION_LEVELS.NONE,
    [OPERATIONS.FILE_DELETE]: PERMISSION_LEVELS.NONE,
    [OPERATIONS.CMD_READ]: PERMISSION_LEVELS.READ,
    [OPERATIONS.CMD_WRITE]: PERMISSION_LEVELS.NONE,
    [OPERATIONS.CMD_DANGEROUS]: PERMISSION_LEVELS.NONE,
    [OPERATIONS.CODE_READ]: PERMISSION_LEVELS.READ,
    [OPERATIONS.CODE_MODIFY]: PERMISSION_LEVELS.NONE,
    [OPERATIONS.CODE_REVIEW]: PERMISSION_LEVELS.READ,
    [OPERATIONS.SCHEMA_MODIFY]: PERMISSION_LEVELS.ADMIN,
    [OPERATIONS.PAYMENT_MODIFY]: PERMISSION_LEVELS.NONE,
    [OPERATIONS.AUTH_MODIFY]: PERMISSION_LEVELS.NONE,
    [OPERATIONS.API_CONTRACT_MODIFY]: PERMISSION_LEVELS.NONE,
    [OPERATIONS.PRODUCTION_DATA_DELETE]: PERMISSION_LEVELS.WRITE,
    [OPERATIONS.AGENT_DISPATCH]: PERMISSION_LEVELS.NONE,
    [OPERATIONS.CONFIG_MODIFY]: PERMISSION_LEVELS.NONE,
    [OPERATIONS.POLICY_MODIFY]: PERMISSION_LEVELS.NONE,
    [OPERATIONS.USER_MANAGE]: PERMISSION_LEVELS.NONE,
    [OPERATIONS.SECURITY_SCAN]: PERMISSION_LEVELS.NONE,
    [OPERATIONS.SECURITY_CONFIG]: PERMISSION_LEVELS.NONE,
    [OPERATIONS.AUDIT_READ]: PERMISSION_LEVELS.READ,
    [OPERATIONS.AUDIT_EXPORT]: PERMISSION_LEVELS.NONE
  },

  // Developer: 标准开发权限
  [ROLES.DEVELOPER]: {
    [OPERATIONS.FILE_READ]: PERMISSION_LEVELS.READ,
    [OPERATIONS.FILE_WRITE]: PERMISSION_LEVELS.WRITE,
    [OPERATIONS.FILE_DELETE]: PERMISSION_LEVELS.NONE,
    [OPERATIONS.CMD_READ]: PERMISSION_LEVELS.READ,
    [OPERATIONS.CMD_WRITE]: PERMISSION_LEVELS.WRITE,
    [OPERATIONS.CMD_DANGEROUS]: PERMISSION_LEVELS.NONE,
    [OPERATIONS.CODE_READ]: PERMISSION_LEVELS.READ,
    [OPERATIONS.CODE_MODIFY]: PERMISSION_LEVELS.WRITE,
    [OPERATIONS.CODE_REVIEW]: PERMISSION_LEVELS.READ,
    [OPERATIONS.SCHEMA_MODIFY]: PERMISSION_LEVELS.NONE,
    [OPERATIONS.PAYMENT_MODIFY]: PERMISSION_LEVELS.NONE,
    [OPERATIONS.AUTH_MODIFY]: PERMISSION_LEVELS.NONE,
    [OPERATIONS.API_CONTRACT_MODIFY]: PERMISSION_LEVELS.NONE,
    [OPERATIONS.PRODUCTION_DATA_DELETE]: PERMISSION_LEVELS.NONE,
    [OPERATIONS.AGENT_DISPATCH]: PERMISSION_LEVELS.NONE,
    [OPERATIONS.CONFIG_MODIFY]: PERMISSION_LEVELS.NONE,
    [OPERATIONS.POLICY_MODIFY]: PERMISSION_LEVELS.NONE,
    [OPERATIONS.USER_MANAGE]: PERMISSION_LEVELS.NONE,
    [OPERATIONS.SECURITY_SCAN]: PERMISSION_LEVELS.NONE,
    [OPERATIONS.SECURITY_CONFIG]: PERMISSION_LEVELS.NONE,
    [OPERATIONS.AUDIT_READ]: PERMISSION_LEVELS.NONE,
    [OPERATIONS.AUDIT_EXPORT]: PERMISSION_LEVELS.NONE
  },

  // Observer: 只读
  [ROLES.OBSERVER]: {
    [OPERATIONS.FILE_READ]: PERMISSION_LEVELS.READ,
    [OPERATIONS.FILE_WRITE]: PERMISSION_LEVELS.NONE,
    [OPERATIONS.FILE_DELETE]: PERMISSION_LEVELS.NONE,
    [OPERATIONS.CMD_READ]: PERMISSION_LEVELS.READ,
    [OPERATIONS.CMD_WRITE]: PERMISSION_LEVELS.NONE,
    [OPERATIONS.CMD_DANGEROUS]: PERMISSION_LEVELS.NONE,
    [OPERATIONS.CODE_READ]: PERMISSION_LEVELS.READ,
    [OPERATIONS.CODE_MODIFY]: PERMISSION_LEVELS.NONE,
    [OPERATIONS.CODE_REVIEW]: PERMISSION_LEVELS.READ,
    [OPERATIONS.SCHEMA_MODIFY]: PERMISSION_LEVELS.NONE,
    [OPERATIONS.PAYMENT_MODIFY]: PERMISSION_LEVELS.NONE,
    [OPERATIONS.AUTH_MODIFY]: PERMISSION_LEVELS.NONE,
    [OPERATIONS.API_CONTRACT_MODIFY]: PERMISSION_LEVELS.NONE,
    [OPERATIONS.PRODUCTION_DATA_DELETE]: PERMISSION_LEVELS.NONE,
    [OPERATIONS.AGENT_DISPATCH]: PERMISSION_LEVELS.NONE,
    [OPERATIONS.CONFIG_MODIFY]: PERMISSION_LEVELS.NONE,
    [OPERATIONS.POLICY_MODIFY]: PERMISSION_LEVELS.NONE,
    [OPERATIONS.USER_MANAGE]: PERMISSION_LEVELS.NONE,
    [OPERATIONS.SECURITY_SCAN]: PERMISSION_LEVELS.NONE,
    [OPERATIONS.SECURITY_CONFIG]: PERMISSION_LEVELS.NONE,
    [OPERATIONS.AUDIT_READ]: PERMISSION_LEVELS.READ,
    [OPERATIONS.AUDIT_EXPORT]: PERMISSION_LEVELS.NONE
  }
};

// ============================================================
// RolePermission - 角色权限检查器
// ============================================================

class RolePermission {
  constructor() {
    this.matrix = { ...AUTHORIZATION_MATRIX };
    this.approvalCache = new Map();   // 授权疲劳防护缓存
    this.approvalCacheTTL = 5 * 60 * 1000;  // 5分钟内同类操作不重复询问
    this.auditLog = [];               // 权限检查审计日志
  }

  // ----------------------------------------------------------
  // 核心权限检查
  // ----------------------------------------------------------

  /**
   * 检查角色是否有执行操作的权限
   * @param {string} role      - 角色 (admin/tech_lead/developer/...)
   * @param {string} operation - 操作 (file:read/code:modify/schema:modify/...)
   * @param {string} requiredLevel - 所需权限级别 (read/write/admin)
   * @returns {{ allowed: boolean, grantedLevel: string, reason: string|null }}
   */
  checkPermission(role, operation, requiredLevel = PERMISSION_LEVELS.READ) {
    // 验证角色
    if (!this.matrix[role]) {
      this._audit(role, operation, false, '未知角色');
      return {
        allowed: false,
        grantedLevel: PERMISSION_LEVELS.NONE,
        reason: `未知角色: ${role}`
      };
    }

    // 获取授权矩阵中的权限
    const rolePermissions = this.matrix[role];
    const grantedLevel = rolePermissions[operation] || PERMISSION_LEVELS.NONE;

    // 比较权限级别
    const grantedOrder = PERMISSION_ORDER[grantedLevel] || 0;
    const requiredOrder = PERMISSION_ORDER[requiredLevel] || 0;

    const allowed = grantedOrder >= requiredOrder;
    const reason = allowed
      ? null
      : `角色 ${role} 对操作 ${operation} 的权限为 ${grantedLevel}，不满足所需的 ${requiredLevel}`;

    this._audit(role, operation, allowed, reason);

    return { allowed, grantedLevel, reason };
  }

  /**
   * 检查是否需要审批（高危操作）
   * @param {string} role
   * @param {string} operation
   * @returns {{ needsApproval: boolean, approver: string|null, reason: string|null }}
   */
  checkApproval(role, operation) {
    // 核心链路操作始终需要审批（除 Admin 外）
    const criticalOps = [
      OPERATIONS.SCHEMA_MODIFY,
      OPERATIONS.PAYMENT_MODIFY,
      OPERATIONS.AUTH_MODIFY,
      OPERATIONS.API_CONTRACT_MODIFY,
      OPERATIONS.PRODUCTION_DATA_DELETE
    ];

    if (criticalOps.includes(operation)) {
      if (role === ROLES.ADMIN) {
        return { needsApproval: false, approver: null, reason: null };
      }

      // 检查授权疲劳防护缓存
      const cacheKey = `${role}:${operation}`;
      if (this._checkApprovalCache(cacheKey)) {
        return {
          needsApproval: false,
          approver: null,
          reason: '已在授权有效期内（防疲劳）'
        };
      }

      // 确定需要哪个角色审批
      const approver = this._getApprover(operation);
      return {
        needsApproval: true,
        approver,
        reason: `操作 ${operation} 属于核心链路，需要 ${approver} 审批`
      };
    }

    return { needsApproval: false, approver: null, reason: null };
  }

  /**
   * 记录审批通过（用于授权疲劳防护）
   */
  grantApproval(role, operation, approvedBy) {
    const cacheKey = `${role}:${operation}`;
    this.approvalCache.set(cacheKey, {
      approvedBy,
      approvedAt: Date.now(),
      expiresAt: Date.now() + this.approvalCacheTTL
    });
    this._audit(role, operation, true, `已由 ${approvedBy} 审批通过`);
  }

  // ----------------------------------------------------------
  // 角色管理
  // ----------------------------------------------------------

  /**
   * 获取角色的所有权限
   */
  getRolePermissions(role) {
    return this.matrix[role] || {};
  }

  /**
   * 获取可以执行某操作的所有角色
   */
  getRolesForOperation(operation, minLevel = PERMISSION_LEVELS.READ) {
    const roles = [];
    const minOrder = PERMISSION_ORDER[minLevel] || 0;

    for (const [role, permissions] of Object.entries(this.matrix)) {
      const level = permissions[operation] || PERMISSION_LEVELS.NONE;
      if ((PERMISSION_ORDER[level] || 0) >= minOrder) {
        roles.push({ role, level });
      }
    }

    return roles.sort((a, b) =>
      (PERMISSION_ORDER[b.level] || 0) - (PERMISSION_ORDER[a.level] || 0)
    );
  }

  /**
   * 检查角色层级：roleA 是否 >= roleB
   */
  isHigherOrEqual(roleA, roleB) {
    return (ROLE_HIERARCHY[roleA] || 0) >= (ROLE_HIERARCHY[roleB] || 0);
  }

  /**
   * 获取角色层级
   */
  getRoleLevel(role) {
    return ROLE_HIERARCHY[role] || 0;
  }

  // ----------------------------------------------------------
  // 审计日志
  // ----------------------------------------------------------

  /**
   * 获取审计日志（最近 N 条）
   */
  getAuditLog(limit = 50) {
    return this.auditLog.slice(-limit);
  }

  /**
   * 清理审计日志
   */
  clearAuditLog() {
    this.auditLog = [];
  }

  // ----------------------------------------------------------
  // 与 PolicyChecker 集成
  // ----------------------------------------------------------

  /**
   * 生成与 PolicyChecker 兼容的策略对象
   * @param {string} role - 当前操作角色
   * @returns {Object} PolicyChecker 可用的策略配置
   */
  toPolicyConfig(role) {
    const perms = this.getRolePermissions(role);

    // 文件访问策略
    const fileAccess = {
      mode: 'whitelist',
      allow: [],
      deny: []
    };

    // 如果有文件写权限，允许所有（由具体路径策略进一步限制）
    if (PERMISSION_ORDER[perms[OPERATIONS.FILE_WRITE]] >= PERMISSION_ORDER[PERMISSION_LEVELS.WRITE]) {
      fileAccess.mode = 'blacklist';  // 黑名单模式，默认允许
    }
    // 如果没有文件删除权限，拒绝删除操作的路径
    if (PERMISSION_ORDER[perms[OPERATIONS.FILE_DELETE]] < PERMISSION_ORDER[PERMISSION_LEVELS.WRITE]) {
      fileAccess.deny.push('**');  // 标记不允许删除
    }

    // 命令策略
    const commands = {
      mode: 'whitelist',
      allow: [],
      deny: [],
      dangerous_patterns: []
    };

    if (PERMISSION_ORDER[perms[OPERATIONS.CMD_WRITE]] >= PERMISSION_ORDER[PERMISSION_LEVELS.WRITE]) {
      commands.mode = 'blacklist';
    }
    if (PERMISSION_ORDER[perms[OPERATIONS.CMD_DANGEROUS]] < PERMISSION_ORDER[PERMISSION_LEVELS.WRITE]) {
      commands.dangerous_patterns.push(
        'rm\\s+-rf',
        'drop\\s+database',
        'truncate\\s+table',
        'git\\s+push.*--force',
        'chmod\\s+777'
      );
    }

    return {
      file_access: fileAccess,
      commands,
      resources: {}
    };
  }

  // ----------------------------------------------------------
  // 私有方法
  // ----------------------------------------------------------

  _getApprover(operation) {
    const approverMap = {
      [OPERATIONS.SCHEMA_MODIFY]: ROLES.DBA,
      [OPERATIONS.PAYMENT_MODIFY]: ROLES.ADMIN,
      [OPERATIONS.AUTH_MODIFY]: ROLES.SECURITY_LEAD,
      [OPERATIONS.API_CONTRACT_MODIFY]: ROLES.TECH_LEAD,
      [OPERATIONS.PRODUCTION_DATA_DELETE]: ROLES.ADMIN
    };
    return approverMap[operation] || ROLES.ADMIN;
  }

  _checkApprovalCache(cacheKey) {
    const cached = this.approvalCache.get(cacheKey);
    if (!cached) return false;
    if (Date.now() > cached.expiresAt) {
      this.approvalCache.delete(cacheKey);
      return false;
    }
    return true;
  }

  _audit(role, operation, allowed, reason) {
    this.auditLog.push({
      timestamp: new Date().toISOString(),
      role,
      operation,
      allowed,
      reason: reason || null
    });
    // 保留最近 500 条
    if (this.auditLog.length > 500) {
      this.auditLog = this.auditLog.slice(-500);
    }
  }
}

// ============================================================
// 导出
// ============================================================

module.exports = {
  RolePermission,
  ROLES,
  ROLE_HIERARCHY,
  PERMISSION_LEVELS,
  PERMISSION_ORDER,
  OPERATIONS,
  AUTHORIZATION_MATRIX
};
