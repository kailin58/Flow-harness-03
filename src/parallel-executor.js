const fs = require('fs').promises;
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { createLogger } = require('./logger');

const execFileAsync = promisify(execFile);

class ParallelExecutor {
  constructor(config = {}) {
    this.maxParallel = config.maxParallel || config.maxWorkers || 4;
    this.mergeStrategy = config.mergeStrategy || 'auto';
    this.worktreeDir = config.worktreeDir || '.flowharness/worktrees';
    this.enabled = config.enabled !== false;
    this.logger = createLogger({ name: 'parallel-executor' });
  }

  async executeParallel(assignments, executor, context = {}) {
    if (!this.enabled) {
      return { success: false, error: 'ParallelExecutor disabled' };
    }

    const fallbackReason = this.shouldFallback(assignments, context);
    if (fallbackReason) {
      return this.runFallback(assignments, context, fallbackReason);
    }

    const worktrees = await this.createWorktrees(assignments, context);
    let cleaned = 0;
    let executionResult;

    try {
      const results = await this.executeInWorktrees(assignments, executor, worktrees, context);
      const mergeResult = await this.mergeResults(worktrees, results, context);

      executionResult = {
        success: results.every((result) => result.success) && mergeResult.success,
        results,
        mergeResult,
        worktrees: {
          created: worktrees.length,
          cleaned
        }
      };
    } finally {
      cleaned = await this.cleanupWorktrees(worktrees);
    }

    executionResult.worktrees.cleaned = cleaned;
    return executionResult;
  }

  shouldFallback(assignments, context = {}) {
    const items = Array.isArray(assignments) ? assignments : [];
    if (items.length <= 1) {
      return 'single_task';
    }

    const parallelGroups = Array.isArray(context.parallelGroups) ? context.parallelGroups : [];
    if (parallelGroups.length === 0) {
      return 'no_parallel_group';
    }

    return null;
  }

  async runFallback(assignments, context = {}, reason = 'fallback') {
    if (typeof context.fallback === 'function') {
      const fallbackResult = await context.fallback(reason, assignments);
      return {
        ...fallbackResult,
        fallback: true,
        fallbackReason: reason
      };
    }

    return {
      success: false,
      fallback: true,
      fallbackReason: reason,
      results: [],
      mergeResult: {
        success: true,
        mergedBranches: [],
        conflicts: []
      },
      worktrees: {
        created: 0,
        cleaned: 0
      }
    };
  }

  async createWorktrees(assignments, context = {}) {
    const repoDir = path.resolve(context.workingDir || process.cwd());
    const baseDir = path.resolve(repoDir, this.worktreeDir);
    await fs.mkdir(baseDir, { recursive: true });

    await this.runGit(['rev-parse', '--is-inside-work-tree'], repoDir);

    const worktrees = [];
    const limitedAssignments = assignments.slice(0, Math.min(assignments.length, this.maxParallel));

    for (let index = 0; index < limitedAssignments.length; index++) {
      const item = limitedAssignments[index];
      const taskId = item.subtask?.id || `task_${index + 1}`;
      const branch = this.buildBranchName(taskId, index);
      const worktreePath = path.join(baseDir, branch);

      await this.runGit(['worktree', 'add', '-b', branch, worktreePath], repoDir);

      worktrees.push({
        id: taskId,
        path: worktreePath,
        branch,
        repoDir
      });
    }

    return worktrees;
  }

  async executeInWorktrees(assignments, executor, worktrees, context = {}) {
    const runner = this.resolveExecutor(executor, context);
    const results = new Array(worktrees.length);
    let cursor = 0;
    const workerCount = Math.min(worktrees.length, this.maxParallel);

    const workers = Array.from({ length: workerCount }, async () => {
      while (cursor < worktrees.length) {
        const currentIndex = cursor++;
        const assignment = assignments[currentIndex];
        const worktree = worktrees[currentIndex];

        try {
          const output = await runner(assignment, {
            ...context,
            workingDir: worktree.path,
            worktree,
            parallelExecution: true
          });

          results[currentIndex] = {
            taskId: assignment.subtask?.id || worktree.id,
            success: output?.success !== false,
            output,
            branch: worktree.branch,
            worktreePath: worktree.path
          };
        } catch (error) {
          results[currentIndex] = {
            taskId: assignment.subtask?.id || worktree.id,
            success: false,
            error: error.message,
            branch: worktree.branch,
            worktreePath: worktree.path
          };
        }
      }
    });

    await Promise.all(workers);
    return results;
  }

  async mergeResults(worktrees, results, context = {}) {
    const repoDir = path.resolve(context.workingDir || process.cwd());
    const mergedBranches = [];
    const conflicts = [];

    if (this.mergeStrategy === 'abort' && results.some((result) => !result.success)) {
      return {
        success: false,
        mergedBranches,
        conflicts: results.filter((result) => !result.success).map((result) => result.taskId)
      };
    }

    for (const result of results) {
      if (!result.success) {
        continue;
      }

      try {
        await this.runGit(['merge', '--no-ff', '--no-edit', result.branch], repoDir);
        mergedBranches.push(result.branch);
      } catch (error) {
        const resolution = await this.resolveConflict(
          {
            branch: result.branch,
            taskId: result.taskId,
            error: error.message
          },
          this.mergeStrategy,
          repoDir
        );

        conflicts.push({
          branch: result.branch,
          taskId: result.taskId,
          resolved: resolution.resolved,
          strategy: resolution.strategy,
          error: error.message
        });
      }
    }

    return {
      success: conflicts.length === 0,
      mergedBranches,
      conflicts
    };
  }

  async cleanupWorktrees(worktrees) {
    let cleaned = 0;

    for (const worktree of worktrees) {
      try {
        await this.runGit(['worktree', 'remove', worktree.path, '--force'], worktree.repoDir || process.cwd());
      } catch (error) {
        this.logger.debug(`Failed to remove worktree ${worktree.path}: ${error.message}`);
      }

      try {
        await this.runGit(['branch', '-D', worktree.branch], worktree.repoDir || process.cwd());
      } catch (error) {
        this.logger.debug(`Failed to delete branch ${worktree.branch}: ${error.message}`);
      }

      cleaned++;
    }

    return cleaned;
  }

  async resolveConflict(conflict, strategy, repoDir = process.cwd()) {
    if (strategy === 'auto') {
      try {
        await this.runGit(['merge', '--abort'], repoDir);
      } catch (error) {
        this.logger.debug(`Failed to abort merge: ${error.message}`);
      }
    }

    return {
      resolved: false,
      strategy
    };
  }

  async runGit(args, cwd) {
    return execFileAsync('git', args, { cwd });
  }

  resolveExecutor(executor, context = {}) {
    if (typeof executor === 'function') {
      return executor;
    }

    if (executor && typeof executor.executeTask === 'function') {
      return (assignment, execContext) => executor.executeTask(assignment, execContext);
    }

    if (executor && typeof executor.execute === 'function') {
      return (assignment, execContext) => executor.execute(assignment, execContext);
    }

    if (typeof context.executeTask === 'function') {
      return context.executeTask;
    }

    throw new Error('No executable runner provided to ParallelExecutor');
  }

  buildBranchName(taskId, index) {
    const normalized = String(taskId)
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || `task-${index + 1}`;

    return `flowharness-${normalized}-${Date.now()}-${index}`;
  }
}

module.exports = ParallelExecutor;
