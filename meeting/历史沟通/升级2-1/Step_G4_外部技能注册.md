# Step G4: 外部技能注册

**所属阶段**: Phase G - 借鉴优化
**预计时间**: 0.5-1 小时
**依赖**: 无（仅配置）
**产出文件**: `.flowharness/skills/registry.json` 扩展, `src/cli.js` 扩展

---

## 一、设计目标

将 ai-website-cloner 的 `/clone-website` 技能注册为 Flow Harness 的外部技能，
不引入任何代码依赖，仅提供引导入口。

### 与现有技能的区别

| 维度 | 现有技能 | 外部技能 (新增) |
|------|----------|----------------|
| **位置** | 内置 `.flowharness/skills/` | 外部 GitHub 仓库 |
| **加载** | SkillLoader 加载 | 仅注册引用 |
| **执行** | Agent 执行 | 引导用户在外部执行 |

---

## 二、实现边界

### 输入

```javascript
// 外部技能定义
{
  id: 'clone-website',
  name: '网站克隆',
  description: '反向工程并克隆任意网站为 Next.js 代码',
  type: 'external',
  prerequisites: [
    'node >= 24',
    'claude-code or compatible AI agent'
  ],
  workflow: [
    { step: 'clone_template', action: 'git clone https://github.com/JCodesMore/ai-website-cloner-template.git <target-dir>' },
    { step: 'install_deps', action: 'cd <target-dir> && npm install' },
    { step: 'run_skill', action: 'claude --chrome' },
    { step: 'execute', action: '/clone-website <url>' }
  ],
  output: {
    type: 'nextjs_project',
    location: '<target-dir>/'
  }
}
```

### 输出

```javascript
// CLI 命令输出
{
  command: 'flowharness clone <url>',
  guidance: [
    '网站克隆功能需要 Claude Code 环境',
    '请按以下步骤操作:',
    '1. git clone https://github.com/JCodesMore/ai-website-cloner-template.git',
    '2. npm install',
    '3. claude --chrome',
    '4. /clone-website <url>'
  ]
}
```

### 不修改的文件

- `src/skill-loader.js` - 保持不变（仅扩展配置格式）
- `.flowharness/skills/explore/*.md` - 保持不变
- `.flowharness/skills/plan/*.md` - 保持不变
- `.flowharness/skills/general/*.md` - 保持不变
- `.flowharness/skills/inspector/*.md` - 保持不变

---

## 三、实现规范

### 配置扩展: `.flowharness/skills/registry.json`

```json
{
  "version": "1.0",
  "description": "Flow Harness 技能注册表",
  "skills": {
    "explore": [...],
    "plan": [...],
    "general": [...],
    "inspector": [...]
  },
  "external": [
    {
      "id": "clone-website",
      "name": "网站克隆",
      "description": "反向工程并克隆任意网站为 Next.js 代码",
      "type": "external",
      "prerequisites": [
        "node >= 24",
        "claude-code or compatible AI agent"
      ],
      "workflow": [
        {
          "step": "clone_template",
          "action": "git clone https://github.com/JCodesMore/ai-website-cloner-template.git",
          "description": "克隆网站克隆模板"
        },
        {
          "step": "install_deps",
          "action": "npm install",
          "description": "安装依赖"
        },
        {
          "step": "run_agent",
          "action": "claude --chrome",
          "description": "启动 Claude Code（带浏览器）"
        },
        {
          "step": "execute",
          "action": "/clone-website <url>",
          "description": "执行网站克隆技能"
        }
      ],
      "output": {
        "type": "nextjs_project",
        "description": "生成一个完整的 Next.js 项目"
      },
      "repository": "https://github.com/JCodesMore/ai-website-cloner-template",
      "license": "MIT"
    }
  ]
}
```

### CLI 扩展: `src/cli.js`

```javascript
// 在现有命令后添加

// 新增命令：网站克隆引导
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

// 新增命令：列出外部技能
program
  .command('external-skills')
  .description('List all registered external skills')
  .action(async () => {
    const fs = require('fs');
    const path = require('path');
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
```

---

## 四、测试用例

### 文件: `test/test-external-skills.js`

```javascript
const assert = require('assert');
const fs = require('fs');
const path = require('path');

// 测试 1: 配置格式正确
async function test_config_format() {
  const registryPath = path.join(process.cwd(), '.flowharness', 'skills', 'registry.json');
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  
  assert(Array.isArray(registry.external), 'external 应为数组');
  
  const cloneSkill = registry.external.find(s => s.id === 'clone-website');
  assert(cloneSkill, 'clone-website 技能应存在');
  assert(cloneSkill.type === 'external', '类型应为 external');
  assert(Array.isArray(cloneSkill.workflow), '应有 workflow');
  
  console.log('✓ test_config_format');
}

// 测试 2: CLI 命令存在
async function test_cli_command() {
  const cliPath = path.join(process.cwd(), 'src', 'cli.js');
  const cliContent = fs.readFileSync(cliPath, 'utf8');
  
  assert(cliContent.includes("command('clone'"), '应有 clone 命令');
  assert(cliContent.includes("command('external-skills')"), '应有 external-skills 命令');
  
  console.log('✓ test_cli_command');
}

// 测试 3: 技能元数据完整
async function test_skill_metadata() {
  const registryPath = path.join(process.cwd(), '.flowharness', 'skills', 'registry.json');
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  
  const skill = registry.external[0];
  
  assert(skill.id, '应有 id');
  assert(skill.name, '应有 name');
  assert(skill.description, '应有 description');
  assert(skill.prerequisites, '应有 prerequisites');
  assert(skill.workflow, '应有 workflow');
  assert(skill.repository, '应有 repository');
  
  console.log('✓ test_skill_metadata');
}

// 运行所有测试
async function runTests() {
  await test_config_format();
  await test_cli_command();
  await test_skill_metadata();
  console.log('\n✅ 外部技能注册测试通过');
}

runTests().catch(console.error);
```

---

## 五、集成点

### 在 SkillLoader 中支持外部技能

```javascript
// skill-loader.js 扩展（可选）

listExternalSkills() {
  const registry = this.loadRegistry();
  return registry.external || [];
}

getExternalSkill(skillId) {
  const external = this.listExternalSkills();
  return external.find(s => s.id === skillId);
}
```

---

## 六、配置项

### config.yml 扩展

```yaml
external:
  skills:
    - id: clone-website
      enabled: true
      # 可选：覆盖默认输出目录
      outputDir: ./cloned-sites
```

---

## 七、验收标准

| 检查项 | 验证方法 | 预期结果 |
|--------|----------|----------|
| 配置格式正确 | 检查 registry.json | external 数组存在 |
| CLI 命令存在 | 检查 cli.js | clone 命令存在 |
| 命令可执行 | `node src/cli.js clone --help` | 显示帮助 |
| 不影响现有测试 | `npm test` | 全部通过 |
| 向后兼容 | `flowharness skills` | 行为不变 |

---

## 八、回滚策略

```bash
# 恢复配置和 CLI
git checkout .flowharness/skills/registry.json
git checkout src/cli.js
git checkout .flowharness/config.yml
rm test/test-external-skills.js
```
