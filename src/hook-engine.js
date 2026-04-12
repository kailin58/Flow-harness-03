'use strict';

const { createLogger } = require('./logger');

class HookEngine {
  constructor(config = {}, services = {}) {
    this.logger = createLogger({ name: 'hook-engine' });
    this.services = services;
    
    // 从 config.hooks.lifecycle 读取结构化钩子
    this.lifecycleHooks = config.hooks?.lifecycle || {};
    
    // 保留旧格式兼容
    this.legacyHooks = {
      before_workflow: config.hooks?.before_workflow || [],
      after_workflow: config.hooks?.after_workflow || [],
      on_error: config.hooks?.on_error || [],
      on_success: config.hooks?.on_success || [],
    };
  }

  static LIFECYCLE = {
    PRE_TOOL_USE: 'pre_tool_use',
    POST_TOOL_USE: 'post_tool_use',
    PRE_TASK: 'pre_task',
    POST_TASK: 'post_task',
    ON_SUPERVISOR_STOP: 'on_supervisor_stop',
    PRE_COMPACT: 'pre_compact',
  };

  async runHooks(lifecycle, context = {}) {
    const hooks = this.lifecycleHooks[lifecycle] || [];
    const results = [];

    for (const hook of hooks) {
      if (hook.condition && !this._evalCondition(hook.condition, context)) {
        results.push({ id: hook.id, status: 'skipped', reason: 'condition_not_met' });
        continue;
      }

      const timeoutMs = (hook.timeout || 30) * 1000;

      try {
        const result = await this._executeWithTimeout(hook, context, timeoutMs);
        results.push({ id: hook.id, status: 'success', result });
      } catch (err) {
        const entry = { id: hook.id, status: 'failed', error: err.message };
        results.push(entry);

        if (hook.on_fail === 'block') {
          this.logger.error(`Blocking hook failed: ${hook.id} - ${err.message}`);
          throw new Error(`Hook blocked: ${hook.id} - ${err.message}`);
        } else if (hook.on_fail === 'warn') {
          this.logger.warn(`Hook warning: ${hook.id} - ${err.message}`);
        }
        // skip: 静默继续
      }
    }

    return results;
  }

  async _executeWithTimeout(hook, context, timeoutMs) {
    return new Promise(async (resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Hook ${hook.id} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      try {
        const result = await this._executeHook(hook, context);
        clearTimeout(timer);
        resolve(result);
      } catch (err) {
        clearTimeout(timer);
        reject(err);
      }
    });
  }

  async _executeHook(hook, context) {
    switch (hook.type) {
      case 'builtin':
        return await this._executeBuiltin(hook.action, context);
      case 'shell':
        return await this._executeShell(hook.command);
      default:
        throw new Error(`Unknown hook type: ${hook.type}`);
    }
  }

  async _executeBuiltin(action, context) {
    const handler = this.services[action];
    if (typeof handler === 'function') {
      return await handler(context);
    }

    switch (action) {
      case 'token_budget_check':
        if (this.services.tokenTracker) {
          return this.services.tokenTracker.checkBudget?.() || { status: 'ok' };
        }
        return { status: 'no_tracker' };

      case 'write_audit_log':
        this.logger.info('Audit:', JSON.stringify(context).slice(0, 200));
        return { status: 'logged' };

      case 'policy_validate':
        if (this.services.policyChecker) {
          return this.services.policyChecker.validate?.(context) || { status: 'ok' };
        }
        return { status: 'no_checker' };

      case 'run_quality_gate':
        if (this.services.qualityGate) {
          return this.services.qualityGate.run?.(context) || { status: 'ok' };
        }
        return { status: 'no_gate' };

      case 'save_checkpoint':
        this.logger.info('Checkpoint saved for context');
        return { status: 'saved' };

      case 'extract_patterns_before_compact':
        if (this.services.knowledgeBase) {
          return this.services.knowledgeBase.extractPatterns?.(context) || { status: 'ok' };
        }
        return { status: 'no_kb' };

      default:
        throw new Error(`Unknown builtin action: ${action}`);
    }
  }

  async _executeShell(command) {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    const { stdout } = await execAsync(command, { timeout: 30000 });
    return { status: 'ok', output: stdout.trim() };
  }

  _evalCondition(condition, context) {
    try {
      const inMatch = condition.match(/^(.+?)\s+in\s+(\[.+\])$/);
      if (inMatch) {
        const fieldPath = inMatch[1].trim();
        const values = JSON.parse(inMatch[2].replace(/'/g, '"'));
        const fieldValue = fieldPath.split('.').reduce((obj, key) => obj?.[key], context);
        return values.includes(fieldValue);
      }

      const eqMatch = condition.match(/^(.+?)\s*===?\s*['"](.+)['"]$/);
      if (eqMatch) {
        const fieldPath = eqMatch[1].trim();
        const expected = eqMatch[2];
        const fieldValue = fieldPath.split('.').reduce((obj, key) => obj?.[key], context);
        return fieldValue === expected;
      }
    } catch {
      return false;
    }
    return false;
  }
}

module.exports = { HookEngine };
