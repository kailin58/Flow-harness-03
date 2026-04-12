#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
const path = require('path');
const FlowHarness = require('./index');
const SupervisorAgent = require('./supervisor-agent');

const program = new Command();

program
  .name('flowharness')
  .description('Flow Harness - Configuration-driven workflow orchestration for AI agents')
  .version('0.1.0')
  .addHelpText('after', `
Examples:
  $ flowharness supervisor "修复登录Bug"
  $ flowharness supervisor "实现用户注册功能" --dry-run
  $ flowharness supervisor "编写文档" --verbose
  $ flowharness list
  $ flowharness stats
  $ flowharness optimize

Documentation:
  https://github.com/your-repo/flow-harness
`);

// 初始化命令
program
  .command('init')
  .description('Initialize Flow Harness in current directory (5-step onboarding)')
  .option('--force', 'Force reinitialize even if already configured')
  .action(async (options) => {
    try {
      const { ProjectOnboarding } = require('./project-onboarding');
      const onboarding = new ProjectOnboarding({ projectRoot: process.cwd() });

      console.log(chalk.blue('🚀 Flow Harness 项目接入 (5步自动化)\n'));

      // Step 1: 检测
      console.log(chalk.cyan('Step 1/5: 检测项目...'));
      const detection = await onboarding.step1_detect();
      console.log(`  技术栈: ${detection.techStacks.map(s => s.name).join(', ') || '未检测到'}`);
      console.log(`  项目类型: ${detection.projectType}`);
      console.log(`  版本控制: ${detection.vcs || '无'}`);

      if (detection.existingConfig && !options.force) {
        console.log(chalk.yellow('\n⚠️  已检测到 .flowharness/ 配置，使用 --force 覆盖'));
        process.exit(0);
      }

      // Step 2: 配置
      console.log(chalk.cyan('\nStep 2/5: 生成配置...'));
      const config = await onboarding.step2_configure(detection);
      console.log(`  配置文件: ${config.configPath}`);

      // Step 3: 安全
      console.log(chalk.cyan('\nStep 3/5: 安全策略...'));
      const security = await onboarding.step3_secure(detection);
      console.log(`  默认角色: ${security.securityConfig.defaultRole}`);
      console.log(`  关键路径: ${security.securityConfig.criticalPaths.length} 条规则`);

      // Step 4: 验证
      console.log(chalk.cyan('\nStep 4/5: 验证配置...'));
      const validation = await onboarding.step4_validate();
      validation.checks.forEach(c => {
        const icon = c.passed ? chalk.green('✓') : chalk.red('✗');
        console.log(`  ${icon} ${c.detail}`);
      });

      // Step 5: 启动
      console.log(chalk.cyan('\nStep 5/5: 激活...'));
      const activation = await onboarding.step5_activate();

      if (validation.allPassed) {
        console.log(chalk.green('\n✨ Flow Harness 初始化完成！'));
        console.log(chalk.gray(`   配置目录: ${activation.harnessDir}`));
        console.log(chalk.gray('   运行 flowharness supervisor "你的任务" 开始使用'));
      } else {
        console.log(chalk.yellow(`\n⚠️  初始化完成但有 ${validation.total - validation.passed} 项检查未通过`));
      }
    } catch (error) {
      console.error(chalk.red(`\n💥 初始化失败: ${error.message}`));
      process.exit(1);
    }
  });

// 运行工作流
program
  .command('run <workflow>')
  .description('Run a workflow')
  .option('-c, --config <path>', 'Config file path', '.flowharness/config.yml')
  .action(async (workflow, options) => {
    try {
      const harness = new FlowHarness(options.config);
      await harness.initialize();

      const result = await harness.runWorkflow(workflow);

      if (result.success) {
        console.log(chalk.green('\n✨ Workflow completed successfully!'));
        process.exit(0);
      } else {
        console.log(chalk.red(`\n❌ Workflow failed: ${result.error}`));
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red(`\n💥 Error: ${error.message}`));
      process.exit(1);
    }
  });

// 列出工作流
program
  .command('list')
  .description('List all available workflows')
  .option('-c, --config <path>', 'Config file path', '.flowharness/config.yml')
  .action(async (options) => {
    try {
      const harness = new FlowHarness(options.config);
      await harness.initialize();

      const workflows = harness.listWorkflows();

      console.log(chalk.blue('\n📋 Available workflows:\n'));

      workflows.forEach(w => {
        const status = w.enabled ? chalk.green('✓') : chalk.red('✗');
        console.log(`${status} ${chalk.bold(w.name)} - ${w.description}`);
        console.log(`  ${chalk.gray(`${w.steps} steps`)}`);
      });

      console.log('');
    } catch (error) {
      console.error(chalk.red(`\n💥 Error: ${error.message}`));
      process.exit(1);
    }
  });

// 查看统计
program
  .command('stats')
  .description('Show execution statistics')
  .option('-c, --config <path>', 'Config file path', '.flowharness/config.yml')
  .action(async (options) => {
    try {
      const harness = new FlowHarness(options.config);
      await harness.initialize();

      const stats = harness.getStatistics();

      console.log(chalk.blue('\n📊 Execution Statistics:\n'));
      console.log(`Total runs:       ${stats.total_runs}`);
      console.log(`Successful runs:  ${chalk.green(stats.successful_runs)}`);
      console.log(`Failed runs:      ${chalk.red(stats.failed_runs)}`);

      if (stats.total_runs > 0) {
        const successRate = (stats.successful_runs / stats.total_runs * 100).toFixed(1);
        console.log(`Success rate:     ${successRate}%`);
        console.log(`Avg exec time:    ${stats.avg_execution_time.toFixed(0)}ms`);
      }

      console.log('');
    } catch (error) {
      console.error(chalk.red(`\n💥 Error: ${error.message}`));
      process.exit(1);
    }
  });

// 查看优化建议
program
  .command('optimize')
  .description('Show optimization suggestions based on learned patterns')
  .option('-c, --config <path>', 'Config file path', '.flowharness/config.yml')
  .action(async (options) => {
    try {
      const harness = new FlowHarness(options.config);
      await harness.initialize();

      const optimizations = harness.getOptimizations();

      console.log(chalk.blue('\n💡 Optimization Suggestions:\n'));

      if (optimizations.length === 0) {
        console.log(chalk.gray('No optimizations available yet. Run more workflows to gather data.'));
      } else {
        optimizations.forEach((opt, i) => {
          console.log(`${i + 1}. ${chalk.bold(opt.type.toUpperCase())}: ${opt.pattern}`);
          console.log(`   Reason: ${opt.reason}`);
          console.log(`   Confidence: ${(opt.confidence * 100).toFixed(1)}%`);
          if (opt.errors) {
            console.log(`   Errors: ${opt.errors.join(', ')}`);
          }
          console.log('');
        });
      }
    } catch (error) {
      console.error(chalk.red(`\n💥 Error: ${error.message}`));
      process.exit(1);
    }
  });

// 检查文件访问权限
program
  .command('check-file <path>')
  .description('Check if file access is allowed by policies')
  .option('-c, --config <path>', 'Config file path', '.flowharness/config.yml')
  .action(async (filePath, options) => {
    try {
      const harness = new FlowHarness(options.config);
      await harness.initialize();

      const result = harness.checkFileAccess(filePath);

      if (result.allowed) {
        console.log(chalk.green(`✅ File access allowed: ${filePath}`));
        process.exit(0);
      } else {
        console.log(chalk.red(`❌ File access denied: ${filePath}`));
        console.log(chalk.gray(`   Reason: ${result.reason}`));
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red(`\n💥 Error: ${error.message}`));
      process.exit(1);
    }
  });

// 检查命令权限
program
  .command('check-cmd <command>')
  .description('Check if command is allowed by policies')
  .option('-c, --config <path>', 'Config file path', '.flowharness/config.yml')
  .action(async (command, options) => {
    try {
      const harness = new FlowHarness(options.config);
      await harness.initialize();

      const result = harness.checkCommand(command);

      if (result.allowed) {
        console.log(chalk.green(`✅ Command allowed: ${command}`));
        process.exit(0);
      } else {
        console.log(chalk.red(`❌ Command denied: ${command}`));
        console.log(chalk.gray(`   Reason: ${result.reason}`));
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red(`\n💥 Error: ${error.message}`));
      process.exit(1);
    }
  });

// 列出所有 Agent
program
  .command('agents')
  .description('List all registered agents')
  .option('--json', 'Output in JSON format')
  .action(async (options) => {
    try {
      const AgentRegistry = require('./agent-registry');
      const registry = new AgentRegistry();
      registry.initializeCoreAgents();

      if (options.json) {
        console.log(JSON.stringify(registry.list(), null, 2));
        process.exit(0);
      }

      console.log(chalk.blue('\n🤖 Registered Agents:\n'));

      const agents = registry.list();
      agents.forEach((agent, index) => {
        const roleIcon = agent.role === 'CEO' ? '👑' : '📋';
        console.log(`${roleIcon} ${chalk.bold(agent.name)} ${chalk.gray(`(${agent.role})`)}`);
        console.log(`   ${chalk.gray(agent.description)}`);
        console.log(`   ${chalk.cyan('Capabilities:')} ${agent.capabilities.join(', ')}`);
        console.log(`   ${chalk.cyan('Responsibilities:')} ${agent.responsibilities.join(', ')}`);

        // 显示子 Agent（如果有）
        if (agent.subAgents && agent.subAgents.length > 0) {
          console.log(`   ${chalk.yellow('Sub-agents:')} ${agent.subAgents.length}`);
        }

        if (index < agents.length - 1) {
          console.log('');
        }
      });

      console.log(chalk.gray(`\n📊 Total: ${registry.size()} core agents`));
      console.log(chalk.gray(`📋 Capabilities: ${registry.listCapabilities().length}\n`));

    } catch (error) {
      console.error(chalk.red(`\n💥 Error: ${error.message}`));
      process.exit(1);
    }
  });

// Supervisor 命令
program
  .command('supervisor <task>')
  .description('Execute task using Supervisor Agent (6-step workflow)')
  .option('-c, --config <path>', 'Config file path', '.flowharness/config.yml')
  .option('-v, --verbose', 'Verbose output with detailed logs')
  .option('--dry-run', 'Preview execution plan without actually running')
  .option('--json', 'Output results in JSON format')
  .option('--no-retry', 'Disable automatic retry on failure')
  .option('--max-retries <number>', 'Maximum retry attempts (default: 2)', '2')
  .action(async (task, options) => {
    try {
      const supervisor = new SupervisorAgent(options.config);

      // Dry-run 模式：只显示执行计划
      if (options.dryRun) {
        console.log(chalk.blue('🔍 Dry-run 模式 - 预览执行计划\n'));

        // 只执行分析和拆解
        const analysis = supervisor.taskAnalyzer.analyze(task, { verbose: options.verbose });
        const decomposition = supervisor.taskDecomposer.decompose(analysis);
        const assignment = supervisor.taskDispatcher.assign(decomposition);

        console.log(chalk.bold('任务分析:'));
        console.log(`  类型: ${analysis.taskType}`);
        console.log(`  优先级: ${analysis.priority}`);
        console.log(`  复杂度: ${analysis.complexity.level}`);
        console.log(`  预计时间: ${analysis.complexity.estimatedTime}`);

        if (analysis.risks.length > 0) {
          console.log(`\n  风险 (${analysis.risks.length}):`);
          analysis.risks.forEach(risk => {
            console.log(`    - [${risk.level}] ${risk.description}`);
          });
        }

        console.log(chalk.bold('\n执行计划:'));
        console.log(`  总任务数: ${assignment.assignments.length}`);
        console.log(`  预计总时间: ${decomposition.estimatedTotalTime}`);

        console.log(chalk.bold('\n子任务列表:'));
        assignment.assignments.forEach((item, index) => {
          const authMark = item.executor.config.requiresAuth ? '🔒 ' : '';
          const modeMark = item.executor.mode === 'interactive' ? '👤' :
                          item.executor.mode === 'supervised' ? '👁️' : '🤖';
          console.log(`  ${index + 1}. ${authMark}${modeMark} ${item.subtask.name}`);
          console.log(`     执行器: ${item.executor.name}`);
          console.log(`     预计: ${item.subtask.estimatedTime}分钟`);
        });

        console.log(chalk.yellow('\n💡 这是预览模式，未实际执行任务'));
        console.log(chalk.gray('   移除 --dry-run 参数以实际执行\n'));
        process.exit(0);
      }

      // 正常执行模式
      const result = await supervisor.handleTask(task, {
        verbose: options.verbose,
        enableRetry: options.retry !== false, // --no-retry 会设置 retry 为 false
        maxRetries: parseInt(options.maxRetries, 10)
      });

      // JSON 输出
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        process.exit(result.success ? 0 : 1);
      }

      // 普通输出
      if (result.success) {
        console.log(chalk.green('\n✅ 任务执行成功'));
        console.log(chalk.gray(`   评分: ${result.review.score}/10`));
        process.exit(0);
      } else {
        console.log(chalk.red('\n❌ 任务执行失败'));
        if (result.error) {
          console.log(chalk.gray(`   错误: ${result.error}`));
        }
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red(`\n💥 Error: ${error.message}`));
      if (options.verbose) {
        console.error(chalk.gray(error.stack));
      }
      process.exit(1);
    }
  });

// ============================================================
// 角色权限管理命令
// ============================================================

const roleCmd = program
  .command('role')
  .description('Manage roles and permissions');

// role list — 列出所有角色
roleCmd
  .command('list')
  .description('List all available roles')
  .action(async () => {
    try {
      const { RolePermission, ROLES, OPERATIONS } = require('./role-permission');
      const rp = new RolePermission();

      console.log(chalk.blue('\n👥 Available Roles:\n'));

      for (const [key, role] of Object.entries(ROLES)) {
        const icon = role === 'admin' ? '👑' :
                     role === 'tech_lead' ? '🔧' :
                     role === 'security_lead' ? '🛡️' :
                     role === 'dba' ? '🗄️' :
                     role === 'developer' ? '💻' : '👁️';
        console.log(`${icon} ${chalk.bold(role.toUpperCase())} ${chalk.gray(`(${key})`)}`);

        // 显示该角色的权限概要
        const sample = [OPERATIONS.FILE_READ, OPERATIONS.FILE_WRITE, OPERATIONS.COMMAND_EXEC, OPERATIONS.CODE_MODIFY];
        const perms = sample.map(op => {
          const result = rp.checkPermission(role, op);
          return result.allowed ? chalk.green(`${op}✓`) : chalk.red(`${op}✗`);
        }).join(' | ');
        console.log(`  ${perms}`);
        console.log('');
      }

      console.log(chalk.gray(`共 ${Object.keys(ROLES).length} 个角色\n`));
    } catch (error) {
      console.error(chalk.red(`\n💥 Error: ${error.message}`));
      process.exit(1);
    }
  });

// role get — 查看当前角色
roleCmd
  .command('get')
  .description('Get current active role')
  .option('-c, --config <path>', 'Config file path', '.flowharness/config.yml')
  .action(async (options) => {
    try {
      const fs = require('fs');
      const path = require('path');
      const securityPath = path.join(path.dirname(options.config), 'security.json');

      if (fs.existsSync(securityPath)) {
        const secData = JSON.parse(fs.readFileSync(securityPath, 'utf8'));
        const role = secData.activeRole || secData.defaultRole || 'developer';
        console.log(chalk.blue(`\n🎭 Current role: ${chalk.bold(role.toUpperCase())}\n`));
      } else {
        console.log(chalk.yellow('\n⚠️  No security config found. Default role: DEVELOPER'));
        console.log(chalk.gray('   Run "flowharness init" to set up security config\n'));
      }
    } catch (error) {
      console.error(chalk.red(`\n💥 Error: ${error.message}`));
      process.exit(1);
    }
  });

// role set — 设置当前角色
roleCmd
  .command('set <role>')
  .description('Set active role (admin/tech_lead/security_lead/dba/developer/observer)')
  .option('-c, --config <path>', 'Config file path', '.flowharness/config.yml')
  .action(async (role, options) => {
    try {
      const { ROLES } = require('./role-permission');
      const fs = require('fs');
      const path = require('path');

      // 验证角色
      const validRoles = Object.values(ROLES);
      if (!validRoles.includes(role.toLowerCase())) {
        console.log(chalk.red(`\n❌ Invalid role: ${role}`));
        console.log(chalk.gray(`   Valid roles: ${validRoles.join(', ')}\n`));
        process.exit(1);
      }

      const securityPath = path.join(path.dirname(options.config), 'security.json');
      let secData = { defaultRole: 'developer', roles: validRoles };

      if (fs.existsSync(securityPath)) {
        secData = JSON.parse(fs.readFileSync(securityPath, 'utf8'));
      }

      secData.activeRole = role.toLowerCase();
      secData.roleChangedAt = new Date().toISOString();

      // 确保目录存在
      const dir = path.dirname(securityPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(securityPath, JSON.stringify(secData, null, 2), 'utf8');

      console.log(chalk.green(`\n✅ Role set to: ${chalk.bold(role.toUpperCase())}`));
      console.log(chalk.gray(`   Saved to: ${securityPath}\n`));
    } catch (error) {
      console.error(chalk.red(`\n💥 Error: ${error.message}`));
      process.exit(1);
    }
  });

// role check — 检查指定操作的权限
roleCmd
  .command('check <operation>')
  .description('Check permission for an operation (e.g. file_read, command_exec, code_modify)')
  .option('-r, --role <role>', 'Role to check (default: current active role)')
  .option('-c, --config <path>', 'Config file path', '.flowharness/config.yml')
  .action(async (operation, options) => {
    try {
      const { RolePermission, ROLES, OPERATIONS } = require('./role-permission');
      const fs = require('fs');
      const path = require('path');

      const rp = new RolePermission();

      // 确定角色
      let role = options.role;
      if (!role) {
        const securityPath = path.join(path.dirname(options.config), 'security.json');
        if (fs.existsSync(securityPath)) {
          const secData = JSON.parse(fs.readFileSync(securityPath, 'utf8'));
          role = secData.activeRole || secData.defaultRole || 'developer';
        } else {
          role = 'developer';
        }
      }

      // 验证操作
      const validOps = Object.values(OPERATIONS);
      if (!validOps.includes(operation)) {
        console.log(chalk.red(`\n❌ Unknown operation: ${operation}`));
        console.log(chalk.gray(`   Valid operations: ${validOps.join(', ')}\n`));
        process.exit(1);
      }

      const result = rp.checkPermission(role, operation);

      if (result.allowed) {
        console.log(chalk.green(`\n✅ ${role.toUpperCase()} CAN ${operation}`));
        console.log(chalk.gray(`   Permission level: ${result.grantedLevel}\n`));
      } else {
        console.log(chalk.red(`\n❌ ${role.toUpperCase()} CANNOT ${operation}`));
        console.log(chalk.gray(`   Reason: ${result.reason}\n`));
      }
    } catch (error) {
      console.error(chalk.red(`\n💥 Error: ${error.message}`));
      process.exit(1);
    }
  });

// role audit — 查看权限审计日志
roleCmd
  .command('audit')
  .description('Show permission audit log')
  .option('-n, --limit <number>', 'Number of entries to show', '20')
  .action(async (options) => {
    try {
      const { RolePermission } = require('./role-permission');
      const rp = new RolePermission();
      const log = rp.getAuditLog();
      const limit = parseInt(options.limit, 10);
      const entries = log.slice(-limit);

      console.log(chalk.blue(`\n📋 Permission Audit Log (last ${entries.length}):\n`));

      if (entries.length === 0) {
        console.log(chalk.gray('  No audit entries yet.\n'));
      } else {
        entries.forEach(entry => {
          const icon = entry.allowed ? chalk.green('✓') : chalk.red('✗');
          console.log(`  ${icon} ${chalk.gray(entry.timestamp)} ${entry.role} → ${entry.operation} (${entry.grantedLevel || 'denied'})`);
        });
        console.log('');
      }
    } catch (error) {
      console.error(chalk.red(`\n💥 Error: ${error.message}`));
      process.exit(1);
    }
  });

// Token 成本查看命令
program
  .command('token-stats')
  .description('Show token usage and cost statistics')
  .option('-c, --config <path>', 'Config file path', '.flowharness/config.yml')
  .action(async (options) => {
    try {
      const harness = new FlowHarness(options.config);
      await harness.initialize();

      const stats = harness.getTokenStats();

      console.log(chalk.blue('\n💰 Token Usage Statistics:\n'));

      if (!stats) {
        console.log(chalk.gray('  Token tracking not initialized.\n'));
        process.exit(0);
      }

      const scopes = ['task', 'session', 'daily', 'monthly'];
      for (const scope of scopes) {
        const s = stats[scope];
        if (s) {
          console.log(chalk.bold(`  ${scope.toUpperCase()}:`));
          console.log(`    Calls: ${s.calls || 0}`);
          console.log(`    Tokens: ${(s.totalTokens || 0).toLocaleString()}`);
          console.log(`    Cost: $${(s.totalCost || 0).toFixed(4)}`);
          if (s.budget) console.log(`    Budget: $${s.budget.toFixed(2)}`);
          console.log('');
        }
      }
    } catch (error) {
      console.error(chalk.red(`\n💥 Error: ${error.message}`));
      process.exit(1);
    }
  });

// 文档生成命令
program
  .command('docs')
  .description('Generate API documentation from source code')
  .option('-o, --output <path>', 'Output directory', '.flowharness/docs')
  .option('-s, --src <path>', 'Source directory', 'src')
  .action(async (options) => {
    try {
      const { DocGenerator } = require('./doc-generator');
      const generator = new DocGenerator({
        srcDir: path.resolve(options.src),
        outputDir: path.resolve(options.output)
      });

      console.log(chalk.blue('\n📄 Generating documentation...\n'));

      const result = generator.generate();

      console.log(chalk.green(`  Modules parsed: ${result.modules.length}`));
      console.log(chalk.green(`  Files generated: ${result.outputFiles.length}`));

      result.outputFiles.forEach(f => {
        console.log(chalk.gray(`    → ${path.relative(process.cwd(), f)}`));
      });

      if (result.errors.length > 0) {
        console.log(chalk.yellow(`\n  Errors: ${result.errors.length}`));
        result.errors.forEach(e => console.log(chalk.gray(`    ⚠️  ${e.file}: ${e.error}`)));
      }

      console.log(chalk.green('\n✨ Documentation generated!\n'));
    } catch (error) {
      console.error(chalk.red(`\n💥 Error: ${error.message}`));
      process.exit(1);
    }
  });

// ============================================================
// 经验回流命令 (方案C: 混合模式)
// ============================================================

// 导出经验数据
program
  .command('export <output>')
  .description('Export accumulated knowledge and strategies to a portable file')
  .option('-c, --config <path>', 'Config file path', '.flowharness/config.yml')
  .option('-t, --type <type>', 'Export type: all, knowledge, strategies, memory', 'all')
  .option('--project-id <id>', 'Project identifier for the export', '')
  .option('--min-confidence <n>', 'Minimum confidence threshold (0-1)', '0.7')
  .action(async (output, options) => {
    try {
      const fs = require('fs');
      const KnowledgeBase = require('./knowledge-base');
      const { MemoryStore } = require('./memory-store');

      const projectId = options.projectId || path.basename(process.cwd());
      const minConfidence = parseFloat(options.minConfidence);
      const exportType = options.type;

      const pack = {
        version: '1.0',
        format: 'flowharness-export',
        projectId,
        exportedAt: new Date().toISOString(),
        types: []
      };

      // 导出知识库
      if (exportType === 'all' || exportType === 'knowledge') {
        const kb = new KnowledgeBase();
        kb.load();
        pack.knowledge = kb.exportData({ projectId, minConfidence });
        pack.types.push('knowledge');
        const pCount = (pack.knowledge.patterns.successful_patterns || []).length
          + (pack.knowledge.patterns.failure_patterns || []).length;
        console.log(chalk.cyan(`  Knowledge: ${pCount} patterns, ${kb.patterns.statistics.total_runs} runs`));
      }

      // 导出策略
      if (exportType === 'all' || exportType === 'strategies') {
        try {
          const { EvolutionEngine } = require('./evolution-engine');
          const engine = new EvolutionEngine();
          pack.strategies = engine.exportStrategies(projectId);
          pack.types.push('strategies');
          console.log(chalk.cyan(`  Strategies: ${(pack.strategies.strategies || []).length} exported`));
        } catch (e) {
          console.log(chalk.gray(`  Strategies: skipped (${e.message})`));
        }
      }

      // 导出记忆
      if (exportType === 'all' || exportType === 'memory') {
        const mem = new MemoryStore();
        mem.load();
        pack.memory = mem.export();
        pack.types.push('memory');
        const mCount = Object.values(pack.memory.memories || {})
          .reduce((sum, arr) => sum + arr.length, 0);
        console.log(chalk.cyan(`  Memory: ${mCount} entries`));
      }

      fs.writeFileSync(output, JSON.stringify(pack, null, 2), 'utf8');
      console.log(chalk.green(`\n✨ Exported to ${output}`));
      console.log(chalk.gray(`   Types: ${pack.types.join(', ')}`));
      console.log(chalk.gray(`   Project: ${projectId}\n`));

    } catch (error) {
      console.error(chalk.red(`\n💥 Export failed: ${error.message}`));
      process.exit(1);
    }
  });

// 导入经验数据
program
  .command('import <input>')
  .description('Import knowledge and strategies from an export file')
  .option('-c, --config <path>', 'Config file path', '.flowharness/config.yml')
  .option('-t, --type <type>', 'Import type: all, knowledge, strategies, memory', 'all')
  .option('--dry-run', 'Preview what would be imported without applying')
  .action(async (input, options) => {
    try {
      const fs = require('fs');

      if (!fs.existsSync(input)) {
        console.error(chalk.red(`File not found: ${input}`));
        process.exit(1);
      }

      const pack = JSON.parse(fs.readFileSync(input, 'utf8'));

      if (!pack.format || pack.format !== 'flowharness-export') {
        console.error(chalk.red('Invalid export file format'));
        process.exit(1);
      }

      console.log(chalk.blue(`\n📦 Import from: ${input}`));
      console.log(chalk.gray(`   Source: ${pack.projectId} (${pack.exportedAt})`));
      console.log(chalk.gray(`   Types: ${(pack.types || []).join(', ')}\n`));

      const importType = options.type;

      // 导入知识库
      if ((importType === 'all' || importType === 'knowledge') && pack.knowledge) {
        const KnowledgeBase = require('./knowledge-base');
        const kb = new KnowledgeBase();
        kb.load();

        if (options.dryRun) {
          const sp = (pack.knowledge.patterns.successful_patterns || []).length;
          const fp = (pack.knowledge.patterns.failure_patterns || []).length;
          console.log(chalk.yellow(`  [DRY RUN] Knowledge: would merge ${sp} success + ${fp} failure patterns`));
        } else {
          const result = kb.mergeData(pack.knowledge);
          if (result.success) {
            console.log(chalk.green(`  Knowledge: ${result.merged} merged, ${result.updated} updated, ${result.skipped} skipped`));
          } else {
            console.log(chalk.red(`  Knowledge: ${result.error}`));
          }
        }
      }

      // 导入策略
      if ((importType === 'all' || importType === 'strategies') && pack.strategies) {
        try {
          const { EvolutionEngine } = require('./evolution-engine');
          const engine = new EvolutionEngine();

          if (options.dryRun) {
            const compat = engine.checkCompatibility(pack.strategies, {});
            console.log(chalk.yellow(`  [DRY RUN] Strategies: ${(pack.strategies.strategies || []).length} strategies, compatibility: ${compat.score || 'N/A'}`));
          } else {
            const result = engine.importStrategies(pack.strategies);
            console.log(chalk.green(`  Strategies: ${result.imported} imported, ${result.skipped} skipped`));
          }
        } catch (e) {
          console.log(chalk.gray(`  Strategies: skipped (${e.message})`));
        }
      }

      // 导入记忆
      if ((importType === 'all' || importType === 'memory') && pack.memory) {
        const { MemoryStore } = require('./memory-store');
        const mem = new MemoryStore();
        mem.load();

        if (options.dryRun) {
          const mCount = Object.values(pack.memory.memories || {})
            .reduce((sum, arr) => sum + arr.length, 0);
          console.log(chalk.yellow(`  [DRY RUN] Memory: would import ${mCount} entries`));
        } else {
          const count = mem.import(pack.memory);
          console.log(chalk.green(`  Memory: ${count} entries imported`));
        }
      }

      if (options.dryRun) {
        console.log(chalk.yellow('\n⚠️  Dry run — no changes applied. Remove --dry-run to import.\n'));
      } else {
        console.log(chalk.green('\n✨ Import complete!\n'));
      }

    } catch (error) {
      console.error(chalk.red(`\n💥 Import failed: ${error.message}`));
      process.exit(1);
    }
  });

program.parse();
