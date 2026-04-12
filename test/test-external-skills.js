const assert = require('assert');
const fs = require('fs');
const path = require('path');

// 测试 1: 配置格式正确
async function test_config_format() {
  const registryPath = path.join(process.cwd(), '.flowharness', 'skills', 'registry.json');
  assert(fs.existsSync(registryPath), 'registry.json 应存在');

  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));

  assert(Array.isArray(registry.external), 'external 应为数组');
  assert(registry.external.length > 0, 'external 数组不应为空');

  const cloneSkill = registry.external.find(s => s.id === 'clone-website');
  assert(cloneSkill, 'clone-website 技能应存在');
  assert(cloneSkill.type === 'external', '类型应为 external');
  assert(Array.isArray(cloneSkill.workflow), '应有 workflow 数组');
  assert(cloneSkill.workflow.length > 0, 'workflow 不应为空');

  console.log('✓ test_config_format');
}

// 测试 2: CLI 命令存在
async function test_cli_command() {
  const cliPath = path.join(process.cwd(), 'src', 'cli.js');
  assert(fs.existsSync(cliPath), 'cli.js 应存在');

  const cliContent = fs.readFileSync(cliPath, 'utf8');
  assert(cliContent.includes("command('clone"), '应有 clone 命令');
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
  assert(Array.isArray(skill.prerequisites), '应有 prerequisites 数组');
  assert(Array.isArray(skill.workflow), '应有 workflow 数组');
  assert(skill.repository, '应有 repository');

  console.log('✓ test_skill_metadata');
}

// 测试 4: workflow 步骤完整
async function test_workflow_steps() {
  const registryPath = path.join(process.cwd(), '.flowharness', 'skills', 'registry.json');
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const skill = registry.external.find(s => s.id === 'clone-website');

  const stepNames = skill.workflow.map(w => w.step);
  assert(stepNames.includes('clone_template'), '应有 clone_template 步骤');
  assert(stepNames.includes('install_deps'), '应有 install_deps 步骤');
  assert(stepNames.includes('run_agent'), '应有 run_agent 步骤');
  assert(stepNames.includes('execute'), '应有 execute 步骤');

  for (const step of skill.workflow) {
    assert(step.step, '每个步骤应有 step 名称');
    assert(step.action, '每个步骤应有 action');
    assert(step.description, '每个步骤应有 description');
  }

  console.log('✓ test_workflow_steps');
}

// 测试 5: 向后兼容 - 内置技能未受影响
async function test_builtin_skills_intact() {
  const registryPath = path.join(process.cwd(), '.flowharness', 'skills', 'registry.json');
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));

  assert(registry.skills, '内置技能 skills 字段应存在');
  assert(registry.skills.explore, 'explore 技能应存在');
  assert(registry.skills.plan, 'plan 技能应存在');
  assert(registry.skills.general, 'general 技能应存在');
  assert(registry.skills.inspector, 'inspector 技能应存在');

  console.log('✓ test_builtin_skills_intact');
}

// 运行所有测试
async function runTests() {
  await test_config_format();
  await test_cli_command();
  await test_skill_metadata();
  await test_workflow_steps();
  await test_builtin_skills_intact();
  console.log('\n✅ 外部技能注册测试通过');
}

runTests().catch(err => {
  console.error('❌ 测试失败:', err.message);
  process.exit(1);
});
