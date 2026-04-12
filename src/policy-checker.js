const fs = require('fs');
const path = require('path');
const { RolePermission, OPERATIONS, PERMISSION_LEVELS } = require('./role-permission');

class PolicyChecker {
  constructor(policies) {
    this.policies = policies;
    this.rolePermission = new RolePermission();
    this.currentRole = null; // 当前操作者角色
  }

  /**
   * 设置当前操作者的角色
   * @param {string} role - admin/tech_lead/security_lead/dba/developer/observer
   */
  setRole(role) {
    this.currentRole = role;
  }

  checkFileAccess(filePath, role = null) {
    const activeRole = role || this.currentRole;

    // 先检查角色权限
    if (activeRole) {
      const permCheck = this.rolePermission.checkPermission(
        activeRole,
        OPERATIONS.FILE_READ,
        PERMISSION_LEVELS.READ
      );
      if (!permCheck.allowed) {
        return {
          allowed: false,
          reason: permCheck.reason
        };
      }
    }
    const filePolicy = this.policies.file_access;

    if (!filePolicy) {
      return { allowed: true };
    }

    const normalizedPath = filePath.replace(/\\/g, '/');

    // 检查黑名单
    if (filePolicy.deny) {
      for (const pattern of filePolicy.deny) {
        if (this.matchPattern(normalizedPath, pattern)) {
          return {
            allowed: false,
            reason: `File access denied by policy: ${pattern}`
          };
        }
      }
    }

    // 如果是白名单模式，检查是否在白名单中
    if (filePolicy.mode === 'whitelist' && filePolicy.allow) {
      let inWhitelist = false;
      for (const pattern of filePolicy.allow) {
        if (this.matchPattern(normalizedPath, pattern)) {
          inWhitelist = true;
          break;
        }
      }

      if (!inWhitelist) {
        return {
          allowed: false,
          reason: 'File not in whitelist'
        };
      }
    }

    return { allowed: true };
  }

  checkCommand(command, role = null) {
    const activeRole = role || this.currentRole;

    // 先检查角色权限
    if (activeRole) {
      const permCheck = this.rolePermission.checkPermission(
        activeRole,
        OPERATIONS.CMD_WRITE,
        PERMISSION_LEVELS.WRITE
      );
      if (!permCheck.allowed) {
        return {
          allowed: false,
          reason: permCheck.reason
        };
      }
    }

    const cmdPolicy = this.policies.commands;

    if (!cmdPolicy) {
      return { allowed: true };
    }

    // 检查危险模式
    if (cmdPolicy.dangerous_patterns) {
      for (const pattern of cmdPolicy.dangerous_patterns) {
        const regex = new RegExp(pattern);
        if (regex.test(command)) {
          return {
            allowed: false,
            reason: `Command matches dangerous pattern: ${pattern}`
          };
        }
      }
    }

    // 检查黑名单
    if (cmdPolicy.deny) {
      for (const deniedCmd of cmdPolicy.deny) {
        if (command.includes(deniedCmd)) {
          return {
            allowed: false,
            reason: `Command contains denied string: ${deniedCmd}`
          };
        }
      }
    }

    // 如果是白名单模式，检查命令是否在白名单中
    if (cmdPolicy.mode === 'whitelist' && cmdPolicy.allow) {
      const cmdName = command.trim().split(/\s+/)[0];

      if (!cmdPolicy.allow.includes(cmdName)) {
        return {
          allowed: false,
          reason: `Command not in whitelist: ${cmdName}`
        };
      }
    }

    return { allowed: true };
  }

  checkNetworkAccess(url) {
    const networkPolicy = this.policies.network;

    if (!networkPolicy || !networkPolicy.enabled) {
      return {
        allowed: false,
        reason: 'Network access is disabled'
      };
    }

    // 检查黑名单
    if (networkPolicy.blacklist) {
      for (const pattern of networkPolicy.blacklist) {
        if (this.matchPattern(url, pattern)) {
          return {
            allowed: false,
            reason: `URL matches blacklist pattern: ${pattern}`
          };
        }
      }
    }

    // 检查白名单
    if (networkPolicy.whitelist) {
      let inWhitelist = false;
      for (const pattern of networkPolicy.whitelist) {
        if (this.matchPattern(url, pattern)) {
          inWhitelist = true;
          break;
        }
      }

      if (!inWhitelist) {
        return {
          allowed: false,
          reason: 'URL not in whitelist'
        };
      }
    }

    return { allowed: true };
  }

  checkResourceLimits(usage) {
    const limits = this.policies.resources;

    if (!limits) {
      return { allowed: true };
    }

    const violations = [];

    if (limits.max_execution_time && usage.execution_time > limits.max_execution_time) {
      violations.push(`Execution time exceeded: ${usage.execution_time}s > ${limits.max_execution_time}s`);
    }

    if (limits.max_memory && usage.memory > limits.max_memory) {
      violations.push(`Memory exceeded: ${usage.memory}MB > ${limits.max_memory}MB`);
    }

    if (limits.max_file_size && usage.file_size > limits.max_file_size) {
      violations.push(`File size exceeded: ${usage.file_size}MB > ${limits.max_file_size}MB`);
    }

    if (limits.max_files_created && usage.files_created > limits.max_files_created) {
      violations.push(`Files created exceeded: ${usage.files_created} > ${limits.max_files_created}`);
    }

    if (violations.length > 0) {
      return {
        allowed: false,
        reason: violations.join('; ')
      };
    }

    return { allowed: true };
  }

  matchPattern(str, pattern) {
    // 简单的通配符匹配
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*');

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(str);
  }

  // ---- 角色权限快捷方法 ----

  /**
   * 检查角色是否有某操作的权限
   */
  checkRolePermission(role, operation, requiredLevel) {
    return this.rolePermission.checkPermission(role, operation, requiredLevel);
  }

  /**
   * 检查是否需要审批
   */
  checkApproval(role, operation) {
    return this.rolePermission.checkApproval(role, operation);
  }

  /**
   * 获取角色权限审计日志
   */
  getPermissionAuditLog(limit) {
    return this.rolePermission.getAuditLog(limit);
  }
}

module.exports = PolicyChecker;
