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
  .description('Initialize Flow Harness global storage (zero-footprint mode)')
  .option('--force', 'Force reinitialize even if already configured')
  .option('-p, --project-root <path>', 'Business project root directory (default: cwd)')
  .action(async (options) => {
    try {
      const { StorageManager } = require('./storage-manager');
      const fs = require('fs');
      const path = require('path');

      const storage = new StorageManager({ projectRoot: options.projectRoot });

      console.log(chalk.blue('🚀 Flow Harness 初始化 (零足迹模式)\n'));
      console.log(chalk.gray(`   业务项目: ${storage.projectRoot}`));
      console.log(chalk.gray(`   框架数据: ${storage.globalRoot}\n`));

      // Step 1: 创建全局目录结构（不在业务项目内）
      console.log(chalk.cyan('Step 1: 创建全局存储目录...'));
      storage.ensureDirs();
      console.log(chalk.green(`  ✓ ${storage.globalRoot}`));
      console.log(chalk.green(`  ✓ ${storage.projectDataDir}`));

      // Step 2: 初始化全局配置
      console.log(chalk.cyan('\nStep 2: 配置文件...'));
      if (!fs.existsSync(storage.globalConfigPath) || options.force) {
        storage._bootstrapGlobalConfig();
        console.log(chalk.green(`  ✓ 全局配置已创建: ${storage.globalConfigPath}`));
      } else {
        console.log(chalk.gray(`  - 已存在: ${storage.globalConfigPath}`));
      }

      // Step 3: 迁移旧版项目内配置（如有）
      console.log(chalk.cyan('\nStep 3: 检查旧版配置迁移...'));
      const legacyDir = path.join(storage.projectRoot, '.flowharness');
      if (fs.existsSync(legacyDir)) {
        console.log(chalk.yellow(`  ⚠️  检测到旧版 .flowharness/ 目录: ${legacyDir}`));

        // 迁移 knowledge 数据
        const legacyKnowledge = path.join(legacyDir, 'knowledge');
        if (fs.existsSync(legacyKnowledge)) {
          const files = fs.readdirSync(legacyKnowledge);
          for (const f of files) {
            const src = path.join(legacyKnowledge, f);
            const dst = path.join(storage.knowledgeDir, f);
            if (!fs.existsSync(dst) || options.force) {
              fs.copyFileSync(src, dst);
              console.log(chalk.green(`  ✓ 迁移: ${f} → ${storage.knowledgeDir}`));
            }
          }
        }

        // 迁移 skills
        const legacySkills = path.join(legacyDir, 'skills');
        if (fs.existsSync(legacySkills)) {
          const skillFiles = fs.readdirSync(legacySkills);
          for (const f of skillFiles) {
            const src = path.join(legacySkills, f);
            const dst = path.join(storage.globalSkillsDir, f);
            if (!fs.existsSync(dst) || options.force) {
              fs.copyFileSync(src, dst);
              console.log(chalk.green(`  ✓ 迁移技能: ${f} → ${storage.globalSkillsDir}`));
            }
          }
        }

        console.log(chalk.yellow(`\n  提示: 迁移完成后可手动删除 ${legacyDir}`));
        console.log(chalk.yellow(`        建议将 .flowharness/ 添加到 .gitignore`));

        // Step 4: 自动添加 .gitignore 条目
        const gitignorePath = path.join(storage.projectRoot, '.gitignore');
        if (fs.existsSync(gitignorePath)) {
          const content = fs.readFileSync(gitignorePath, 'utf8');
          if (!content.includes('.flowharness/')) {
            fs.appendFileSync(gitignorePath, '\n# Flow Harness 框架数据（已迁移至 ~/.flowharness/）\n.flowharness/\n');
            console.log(chalk.green(`  ✓ 已将 .flowharness/ 添加到 .gitignore`));
          } else {
            console.log(chalk.gray(`  - .flowharness/ 已在 .gitignore 中`));
          }
        }
      } else {
        console.log(chalk.green('  ✓ 无旧版数据，业务项目保持零足迹'));
      }

      // 完成
      console.log(chalk.green('\n✨ 初始化完成！'));
      console.log(chalk.bold('\n存储布局:'));
      console.log(chalk.gray(`  全局配置:   ${storage.globalConfigPath}`));
      console.log(chalk.gray(`  知识库:     ${storage.knowledgeDir}`));
      console.log(chalk.gray(`  技能库:     ${storage.globalSkillsDir}`));
      console.log(chalk.gray(`  项目数据:   ${storage.projectDataDir}`));
      console.log(chalk.bold('\n下一步:'));
      console.log(chalk.cyan(`  flowharness supervisor "你的任务"`));
      console.log(chalk.cyan(`  flowharness supervisor "你的任务" --project-root /path/to/project\n`));
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
      } else {
        console.log(chalk.red(`❌ File access denied: ${filePath}`));
        console.log(chalk.gray(`   Reason: ${result.reason}`));
        process.exitCode = 1;
      }
    } catch (error) {
      console.error(chalk.red(`\n💥 Error: ${error.message}`));
      process.exitCode = 1;
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
      } else {
        console.log(chalk.red(`❌ Command denied: ${command}`));
        console.log(chalk.gray(`   Reason: ${result.reason}`));
        process.exitCode = 1;
      }
    } catch (error) {
      console.error(chalk.red(`\n💥 Error: ${error.message}`));
      process.exitCode = 1;
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

// 技能列表命令
program
  .command('skills')
  .description('列出所有已注册的技能')
  .option('--agent <role>', '按 Agent 角色过滤 (explore/plan/general/inspector)')
  .action(async (options) => {
    try {
      const { SkillLoader } = require('./skill-loader');
      const loader = new SkillLoader({ rootDir: process.cwd() });
      await loader.loadRegistry();

      const skills = loader.listSkills(options.agent);

      if (skills.length === 0) {
        console.log(chalk.yellow('未找到技能。请检查 .flowharness/skills/registry.json'));
        return;
      }

      console.log(chalk.blue(`\n📚 Flow Harness 技能列表 (${skills.length} 个)\n`));

      let currentAgent = '';
      for (const skill of skills) {
        const agent = skill.agent || options.agent || skill.owner_agent || '';
        if (agent !== currentAgent) {
          currentAgent = agent;
          console.log(chalk.cyan(`  [${agent.toUpperCase()}]`));
        }
        const status = skill.status === 'active' ? chalk.green('●') : chalk.gray('○');
        console.log(`    ${status} ${skill.id} - ${skill.name || skill.id}`);
      }
      console.log('');
    } catch (err) {
      console.error(chalk.red('加载技能失败:'), err.message);
      process.exit(1);
    }
  });

// Supervisor 命令
program
  .command('supervisor <task>')
  .description('Execute task using Supervisor Agent (6-step workflow)')
  .option('-c, --config <path>', 'Config file path (default: auto-resolved via StorageManager)')
  .option('-p, --project-root <path>', 'Business project root directory (default: cwd)')
  .option('-v, --verbose', 'Verbose output with detailed logs')
  .option('--dry-run', 'Preview execution plan without actually running')
  .option('--json', 'Output results in JSON format')
  .option('--no-retry', 'Disable automatic retry on failure')
  .option('--max-retries <number>', 'Maximum retry attempts (default: 2)', '2')
  .action(async (task, options) => {
    try {
      const supervisor = new SupervisorAgent(options.config || null, {
        projectRoot: options.projectRoot
      });

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

// Token 预算报告命令
program
  .command('budget')
  .description('Show token budget report with compression savings')
  .option('-c, --config <path>', 'Config file path', '.flowharness/config.yml')
  .action(async (options) => {
    try {
      const { TokenCompressor } = require('./token-compressor');
      const compressor = new TokenCompressor();
      const report = compressor.getBudgetReport();

      console.log(chalk.blue('\n== Flow Harness Token 预算报告 ==\n'));

      console.log(chalk.cyan(`今日 (${report.daily.date}):`));
      console.log(`  已用: ${report.daily.used.toLocaleString()} tokens`);
      console.log(`  压缩节省: ${report.daily.saved.toLocaleString()} tokens`);

      if (Object.keys(report.daily.by_type).length > 0) {
        console.log(chalk.cyan('\n按任务类型:'));
        const sorted = Object.entries(report.daily.by_type).sort((a, b) => b[1] - a[1]);
        for (const [type, count] of sorted) {
          const pct = report.daily.used > 0 ? ((count / report.daily.used) * 100).toFixed(0) : 0;
          const bar = '█'.repeat(Math.ceil(pct / 10)) + '░'.repeat(10 - Math.ceil(pct / 10));
          console.log(`  ${type.padEnd(15)} ${bar}  ${count.toLocaleString()}  (${pct}%)`);
        }
      }

      console.log(chalk.cyan(`\n本月 (${report.monthly.month}):`));
      console.log(`  已用: ${report.monthly.used.toLocaleString()} / ${report.monthly.budget.toLocaleString()} tokens (${report.monthly.utilization})`);
      console.log('');
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

// ============ 斜杠命令系统 ============
program
  .command('cmd <slash_command> [args...]')
  .description('执行预定义斜杠命令 (如 /plan, /build, /review 等)')
  .addHelpText('after', `
示例:
  $ flowharness cmd /plan 用户认证功能
  $ flowharness cmd /build 实现注册接口
  $ flowharness cmd /fix 登录Bug
  $ flowharness cmd /review src/index.js
  $ flowharness cmd /status
`)
  .action(async (slashCmd, args) => {
    try {
      const fs = require('fs');
      const cmdRegistryPath = path.join(process.cwd(), '.flowharness', 'commands', 'registry.json');
      
      if (!fs.existsSync(cmdRegistryPath)) {
        console.error(chalk.red('命令注册表不存在: .flowharness/commands/registry.json'));
        console.log(chalk.gray('运行 flowharness init 初始化'));
        process.exit(1);
      }
      
      const cmdRegistry = JSON.parse(fs.readFileSync(cmdRegistryPath, 'utf8'));
      
      const cmdKey = slashCmd.startsWith('/') ? slashCmd : `/${slashCmd}`;
      const cmdDef = cmdRegistry.commands[cmdKey];
      
      if (!cmdDef) {
        console.error(chalk.red(`未知命令: ${cmdKey}`));
        console.log(chalk.cyan('\n可用命令:'));
        for (const [key, def] of Object.entries(cmdRegistry.commands)) {
          console.log(`  ${chalk.green(key.padEnd(15))} ${def.description}`);
        }
        process.exit(1);
      }
      
      const argsStr = args.join(' ');
      
      if (cmdDef.type === 'management') {
        await handleManagementCommand(cmdDef.action, argsStr);
        return;
      }
      
      if (cmdDef.type === 'workflow') {
        console.log(chalk.blue(`\n🚀 执行命令: ${cmdKey} ${argsStr}\n`));
        
        const configPath = path.join(process.cwd(), '.flowharness', 'config.yml');
        const supervisor = new SupervisorAgent(configPath);
        
        const taskDesc = `${cmdDef.description}: ${argsStr}`;
        const isDryRun = (cmdDef.flags || []).includes('--dry-run');
        
        if (isDryRun) {
          const analysis = await supervisor.step1_analyze(taskDesc, {});
          const decomposition = await supervisor.step2_decompose(analysis);
          console.log(chalk.cyan('📋 执行计划 (预览):'));
          console.log(`  类型: ${analysis.type}`);
          console.log(`  子任务: ${decomposition.subtasks?.length || 0} 个`);
          if (decomposition.subtasks) {
            decomposition.subtasks.forEach((st, i) => {
              console.log(`  ${i + 1}. ${st.name}`);
            });
          }
        } else {
          const result = await supervisor.handleTask(taskDesc, {});
          console.log(result.success ? chalk.green('✅ 完成') : chalk.red('❌ 失败'));
        }
        return;
      }
      
      if (cmdDef.type === 'inspector') {
        console.log(chalk.blue(`\n🔍 执行检查: ${cmdKey} ${argsStr}\n`));
        
        const configPath = path.join(process.cwd(), '.flowharness', 'config.yml');
        const supervisor = new SupervisorAgent(configPath);
        
        const taskDesc = `代码检查 - ${cmdDef.description}: ${argsStr}`;
        const result = await supervisor.handleTask(taskDesc, {
          forceAgent: 'inspector',
          skills: cmdDef.skills
        });
        console.log(result.success ? chalk.green('✅ 检查通过') : chalk.yellow('⚠️ 发现问题'));
        return;
      }
      
    } catch (err) {
      console.error(chalk.red(`命令执行失败: ${err.message}`));
      process.exit(1);
    }
  });

async function handleManagementCommand(action, args) {
  const fs = require('fs');
  
  switch (action) {
    case 'show_status': {
      console.log(chalk.blue('\n📊 Flow Harness 系统状态\n'));
      const patternsPath = path.join(process.cwd(), '.flowharness', 'knowledge', 'patterns.json');
      if (fs.existsSync(patternsPath)) {
        const patterns = JSON.parse(fs.readFileSync(patternsPath, 'utf8'));
        console.log(`  总运行: ${patterns.statistics?.total_runs || 0} 次`);
        console.log(`  成功: ${patterns.statistics?.successful_runs || 0}`);
        console.log(`  失败: ${patterns.statistics?.failed_runs || 0}`);
        const rate = patterns.statistics?.total_runs
          ? ((patterns.statistics.successful_runs / patterns.statistics.total_runs) * 100).toFixed(1)
          : 0;
        console.log(`  成功率: ${rate}%`);
      }
      console.log('');
      break;
    }
    
    case 'show_budget': {
      console.log(chalk.blue('\n💰 Token 预算（Phase D 实现后完善）\n'));
      console.log(chalk.gray('  尚未配置 Token 追踪'));
      console.log('');
      break;
    }
    
    case 'list_skills': {
      const { SkillLoader } = require('./skill-loader');
      const loader = new SkillLoader({ rootDir: process.cwd() });
      await loader.loadRegistry();
      const skills = loader.listSkills();
      console.log(chalk.blue(`\n📚 技能列表 (${skills.length} 个)\n`));
      for (const s of skills) {
        console.log(`  ${chalk.green('●')} [${(s.agent || '').padEnd(10)}] ${s.id}`);
      }
      console.log('');
      break;
    }
    
    case 'show_history': {
      console.log(chalk.blue('\n📜 最近执行历史\n'));
      const patternsPath = path.join(process.cwd(), '.flowharness', 'knowledge', 'patterns.json');
      if (fs.existsSync(patternsPath)) {
        const patterns = JSON.parse(fs.readFileSync(patternsPath, 'utf8'));
        const allPatterns = [
          ...(patterns.successful_patterns || []),
          ...(patterns.failure_patterns || [])
        ].sort((a, b) => new Date(b.learned_at) - new Date(a.learned_at)).slice(0, 10);
        
        for (const p of allPatterns) {
          const icon = p.success_rate ? chalk.green('✓') : chalk.red('✗');
          console.log(`  ${icon} ${p.pattern} (${p.success_count || p.failure_count || 0} runs)`);
        }
      }
      console.log('');
      break;
    }
    
    default:
      console.log(chalk.yellow(`未知管理命令: ${action}`));
  }
}

// ============================================================
// 外部技能命令 (Step G4)
// ============================================================

// 网站克隆引导命令
program
  .command('clone <url>')
  .description('Clone a website using ai-website-cloner template (requires Claude Code)')
  .option('-o, --output <dir>', 'Output directory', './cloned-site')
  .option('--dry-run', 'Show instructions without executing', false)
  .action(async (url, options) => {
    const outputDir = options.output;

    console.log(chalk.blue('\n🌐 网站克隆功能\n'));
    console.log(chalk.gray('此功能需要 Claude Code 或兼容的 AI 编码环境。\n'));

    if (options.dryRun) {
      console.log(chalk.cyan('📋 执行步骤预览:\n'));
      console.log(`  1. git clone https://github.com/JCodesMore/ai-website-cloner-template.git ${outputDir}`);
      console.log(`  2. cd ${outputDir} && npm install`);
      console.log(`  3. claude --chrome`);
      console.log(`  4. /clone-website ${url}\n`);
      console.log(chalk.gray('移除 --dry-run 参数以显示详细指南。\n'));
      return;
    }

    console.log(chalk.cyan('📋 请按以下步骤操作:\n'));
    console.log(chalk.white(`1. 克隆模板:`));
    console.log(chalk.gray(`   git clone https://github.com/JCodesMore/ai-website-cloner-template.git ${outputDir}`));
    console.log(chalk.white(`\n2. 安装依赖:`));
    console.log(chalk.gray(`   cd ${outputDir} && npm install`));
    console.log(chalk.white(`\n3. 启动 Claude Code:`));
    console.log(chalk.gray(`   claude --chrome`));
    console.log(chalk.white(`\n4. 执行克隆:`));
    console.log(chalk.gray(`   /clone-website ${url}`));
    console.log(chalk.green(`\n✨ 完成后，克隆的网站将生成在 ${outputDir}/\n`));

    console.log(chalk.yellow('💡 提示:'));
    console.log(chalk.gray('   - 需要安装 Claude Code CLI (npm install -g @anthropic-ai/claude-code)'));
    console.log(chalk.gray('   - 需要 Chrome 浏览器'));
    console.log(chalk.gray('   - 支持 Claude Code, Cursor, Windsurf 等 AI 编码环境\n'));
  });

// 列出外部技能命令
program
  .command('external-skills')
  .description('List all registered external skills')
  .action(async () => {
    const fs = require('fs');
    const registryPath = path.join(process.cwd(), '.flowharness', 'skills', 'registry.json');

    if (!fs.existsSync(registryPath)) {
      console.log(chalk.yellow('技能注册表不存在'));
      return;
    }

    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const external = registry.external || [];

    if (external.length === 0) {
      console.log(chalk.gray('没有注册的外部技能'));
      return;
    }

    console.log(chalk.blue('\n📦 外部技能列表:\n'));

    for (const skill of external) {
      console.log(chalk.cyan(`  ${skill.id}`) + chalk.gray(` - ${skill.description}`));
      console.log(chalk.gray(`    仓库: ${skill.repository}`));
      console.log(chalk.gray(`    前置: ${skill.prerequisites.join(', ')}`));
      console.log('');
    }
  });

// ============================================================
// CI/CD 集成命令 (P1)
// ============================================================

const ciCmd = program
  .command('ci')
  .description('CI/CD 集成工具');

ciCmd
  .command('generate')
  .description('生成 CI/CD 配置文件')
  .option('-p, --platform <platform>', 'CI 平台 (github/gitlab/jenkins)', 'github')
  .option('-o, --output <dir>', '输出目录', '.github/workflows')
  .action(async (options) => {
    try {
      const { CICDIntegration } = require('./ci-cd-integration');
      const ci = new CICDIntegration({
        projectDir: process.cwd(),
        outputDir: options.output,
        platform: options.platform
      });

      console.log(chalk.blue('\n🔧 生成 CI/CD 配置...\n'));

      const result = ci.generateWorkflow();

      console.log(chalk.green(`✅ 生成成功!`));
      console.log(chalk.gray(`   平台: ${options.platform}`));
      console.log(chalk.gray(`   输出目录: ${options.output}`));
      result.files.forEach(f => {
        console.log(chalk.gray(`   - ${f}`));
      });
    } catch (error) {
      console.error(chalk.red(`\n💥 生成失败: ${error.message}`));
      process.exit(1);
    }
  });

ciCmd
  .command('check')
  .description('检查 CI/CD 配置是否完整')
  .action(async () => {
    try {
      const { CICDIntegration } = require('./ci-cd-integration');
      const ci = new CICDIntegration({ projectDir: process.cwd() });

      console.log(chalk.blue('\n🔍 检查 CI/CD 配置...\n'));

      const result = ci.checkConfiguration();

      if (result.valid) {
        console.log(chalk.green('✅ CI/CD 配置完整'));
      } else {
        console.log(chalk.yellow('⚠️ CI/CD 配置不完整'));
        result.issues.forEach(issue => {
          console.log(chalk.gray(`   - ${issue}`));
        });
      }
    } catch (error) {
      console.error(chalk.red(`\n💥 检查失败: ${error.message}`));
      process.exit(1);
    }
  });

// ============================================================
// Metrics 命令 (P1)
// ============================================================

program
  .command('metrics')
  .description('查看系统指标统计')
  .option('-f, --format <format>', '输出格式 (text/json/prometheus)', 'text')
  .option('-o, --output <file>', '输出到文件')
  .action(async (options) => {
    try {
      const { MetricsCollector } = require('./metrics-collector');
      const collector = new MetricsCollector({ prefix: 'flowharness' });

      console.log(chalk.blue('\n📊 Flow Harness 指标统计\n'));

      // 收集系统指标
      const metrics = collector.collectSystemMetrics();

      if (options.format === 'prometheus') {
        const prometheus = collector.exportPrometheus();
        if (options.output) {
          fs.writeFileSync(options.output, prometheus);
          console.log(chalk.green(`✅ 已输出到 ${options.output}`));
        } else {
          console.log(prometheus);
        }
      } else if (options.format === 'json') {
        const json = JSON.stringify(metrics, null, 2);
        if (options.output) {
          fs.writeFileSync(options.output, json);
          console.log(chalk.green(`✅ 已输出到 ${options.output}`));
        } else {
          console.log(json);
        }
      } else {
        // text 格式
        console.log(chalk.cyan('任务统计:'));
        console.log(`  总任务数: ${metrics.tasks?.total || 0}`);
        console.log(`  成功: ${metrics.tasks?.success || 0}`);
        console.log(`  失败: ${metrics.tasks?.failed || 0}`);
        console.log('');
        console.log(chalk.cyan('执行统计:'));
        console.log(`  平均耗时: ${metrics.execution?.avgDuration || 0}ms`);
        console.log(`  最大耗时: ${metrics.execution?.maxDuration || 0}ms`);
        console.log('');
        console.log(chalk.cyan('Token 统计:'));
        console.log(`  今日使用: ${metrics.tokens?.today || 0}`);
        console.log(`  本月使用: ${metrics.tokens?.month || 0}`);
      }
    } catch (error) {
      console.error(chalk.red(`\n💥 获取指标失败: ${error.message}`));
      process.exit(1);
    }
  });

// ============================================================
// Checkpoint 命令 (P1)
// ============================================================

program
  .command('checkpoint')
  .description('检查点管理');

const checkpointCmd = program
  .command('checkpoint')
  .description('检查点管理');

checkpointCmd
  .command('list')
  .description('列出所有检查点')
  .action(async () => {
    try {
      const { CheckpointManager } = require('./checkpoint-manager');
      const cm = new CheckpointManager({});

      console.log(chalk.blue('\n📍 检查点列表:\n'));

      const checkpoints = cm.list();

      if (checkpoints.length === 0) {
        console.log(chalk.gray('  无检查点'));
        return;
      }

      for (const cp of checkpoints) {
        const age = Math.round((Date.now() - new Date(cp.createdAt).getTime()) / 60000);
        console.log(chalk.cyan(`  ${cp.id}`) + chalk.gray(` (${age}分钟前, 状态: ${cp.status})`));
      }
    } catch (error) {
      console.error(chalk.red(`\n💥 获取检查点失败: ${error.message}`));
      process.exit(1);
    }
  });

checkpointCmd
  .command('restore <id>')
  .description('恢复到指定检查点')
  .action(async (id) => {
    try {
      const { CheckpointManager } = require('./checkpoint-manager');
      const cm = new CheckpointManager({});

      console.log(chalk.blue(`\n🔄 恢复检查点: ${id}\n`));

      const result = await cm.restore(id);

      if (result.success) {
        console.log(chalk.green('✅ 恢复成功'));
        console.log(chalk.gray(`   恢复路径: ${result.restoredFiles?.length || 0} 个文件`));
      } else {
        console.log(chalk.red(`❌ 恢复失败: ${result.error}`));
      }
    } catch (error) {
      console.error(chalk.red(`\n💥 恢复失败: ${error.message}`));
      process.exit(1);
    }
  });

program.parse();
