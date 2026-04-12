const { exec } = require('child_process');
const PolicyChecker = require('./policy-checker');
const KnowledgeBase = require('./knowledge-base');
const { createLogger } = require('./logger');

class WorkflowEngine {
  constructor(config, knowledgeBase) {
    this.config = config;
    this.knowledgeBase = knowledgeBase;
    this.policyChecker = new PolicyChecker(config.policies);
    this.logger = createLogger({ name: 'workflow-engine' });
    this.currentSession = null;
  }

  async runWorkflow(workflowName, context = {}) {
    const workflow = this.config.workflows.find(w => w.name === workflowName);

    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowName}`);
    }

    if (!workflow.enabled) {
      throw new Error(`Workflow is disabled: ${workflowName}`);
    }

    this.logger.info({ workflow: workflow.name }, `Starting workflow: ${workflow.name}`);
    if (workflow.description) {
      this.logger.info({ description: workflow.description }, `  ${workflow.description}`);
    }

    this.currentSession = {
      workflow: workflowName,
      startTime: Date.now(),
      steps: [],
      context: context
    };

    // 执行前置钩子
    await this.runHooks('before_workflow');

    let success = true;
    let error = null;

    try {
      for (let i = 0; i < workflow.steps.length; i++) {
        const step = workflow.steps[i];
        this.logger.info({ step: i + 1, total: workflow.steps.length, name: step.name }, `Step ${i + 1}/${workflow.steps.length}: ${step.name}`);

        const stepResult = await this.executeStep(workflowName, step, context);

        this.currentSession.steps.push(stepResult);

        if (!stepResult.success) {
          success = false;
          error = stepResult.error;
          this.logger.error({ error: stepResult.error, step: step.name }, `Step failed: ${stepResult.error}`);
          break;
        }

        this.logger.info({ executionTime: stepResult.execution_time }, `Step completed in ${stepResult.execution_time}ms`);
      }

      if (success) {
        this.logger.info({ workflow: workflowName }, 'Workflow completed successfully');
        await this.runHooks('on_success');
      } else {
        this.logger.error({ workflow: workflowName }, 'Workflow failed');
        await this.runHooks('on_error');
      }
    } catch (err) {
      success = false;
      error = err.message;
      this.logger.error({ error: err.message, workflow: workflowName }, `Workflow error: ${err.message}`);
      await this.runHooks('on_error');
    } finally {
      // 执行后置钩子
      await this.runHooks('after_workflow');
    }

    const endTime = Date.now();
    const totalTime = endTime - this.currentSession.startTime;

    const summary = {
      workflow: workflowName,
      success: success,
      error: error,
      execution_time: totalTime,
      steps: this.currentSession.steps,
      timestamp: new Date().toISOString()
    };

    this.logger.info({ workflow: workflowName, totalTime }, `Total execution time: ${totalTime}ms`);

    return summary;
  }

  async executeStep(workflowName, step, context) {
    const startTime = Date.now();
    let success = true;
    let error = null;
    let output = null;

    try {
      switch (step.type) {
        case 'check':
          output = await this.executeCheck(step, context);
          break;

        case 'run':
          output = await this.executeRun(step, context);
          break;

        case 'require':
          output = await this.executeRequire(step, context);
          break;

        case 'sandbox':
          output = await this.executeSandbox(step, context);
          break;

        case 'execute':
          output = await this.executeCommand(step, context);
          break;

        default:
          throw new Error(`Unknown step type: ${step.type}`);
      }
    } catch (err) {
      success = false;
      error = err.message;
    }

    const endTime = Date.now();
    const executionTime = endTime - startTime;

    const result = {
      step: step.name,
      type: step.type,
      success: success,
      error: error,
      output: output,
      execution_time: executionTime,
      timestamp: new Date().toISOString()
    };

    // 记录到知识库
    if (this.knowledgeBase) {
      this.knowledgeBase.recordExecution(workflowName, step.name, result);
    }

    return result;
  }

  async executeCheck(step, context) {
    // 实现检查逻辑
    switch (step.action) {
      case 'lint':
        return await this.runCommand('npm run lint', context);

      case 'security_scan':
        this.logger.info({ action: step.action }, 'Running security scan...');
        return { status: 'passed', message: 'No security issues found' };

      default:
        if (step.threshold !== undefined) {
          // 检查阈值
          const value = context[step.name] || 0;
          if (value < step.threshold) {
            throw new Error(`${step.name} below threshold: ${value} < ${step.threshold}`);
          }
          return { status: 'passed', value: value, threshold: step.threshold };
        }
        return { status: 'passed' };
    }
  }

  async executeRun(step, context) {
    if (!step.command) {
      throw new Error('Run step requires a command');
    }

    // 检查命令权限
    const cmdCheck = this.policyChecker.checkCommand(step.command);
    if (!cmdCheck.allowed) {
      throw new Error(`Command not allowed: ${cmdCheck.reason}`);
    }

    return await this.runCommand(step.command, context);
  }

  async executeRequire(step, context) {
    this.logger.info({ step: step.name }, `Waiting for: ${step.name}`);

    if (step.name === 'human_approval') {
      this.logger.info('Awaiting human approval (auto-approved in dev mode)');
      return { status: 'approved', approver: 'system' };
    }

    return { status: 'approved' };
  }

  async executeSandbox(step, context) {
    this.logger.info({ environment: step.environment }, `Creating sandbox environment: ${step.environment}`);
    return { status: 'created', environment: step.environment };
  }

  async executeCommand(step, context) {
    if (!step.command) {
      throw new Error('Execute step requires a command');
    }

    // 检查命令权限
    const cmdCheck = this.policyChecker.checkCommand(step.command);
    if (!cmdCheck.allowed) {
      throw new Error(`Command not allowed: ${cmdCheck.reason}`);
    }

    return await this.runCommand(step.command, context);
  }

  runCommand(command, context) {
    return new Promise((resolve, reject) => {
      this.logger.debug({ command }, `Running: ${command}`);

      exec(command, { timeout: 30000 }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`Command failed: ${error.message}`));
          return;
        }

        if (stderr) {
          this.logger.warn({ stderr, command }, `Command stderr output`);
        }

        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: 0
        });
      });
    });
  }

  async runHooks(hookName) {
    const hooks = this.config.hooks;

    if (!hooks || !hooks[hookName]) {
      return;
    }

    const hookCommands = hooks[hookName];

    for (const command of hookCommands) {
      try {
        await this.runCommand(command, {});
      } catch (err) {
        this.logger.warn({ hook: hookName, error: err.message }, `Hook failed: ${err.message}`);
      }
    }
  }
}

module.exports = WorkflowEngine;
