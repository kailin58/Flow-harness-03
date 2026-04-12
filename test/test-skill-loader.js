const assert = require('assert');
const { SkillLoader } = require('../src/skill-loader');

function testSkillLoader() {
  console.log('🧪 测试 SkillLoader...\n');

  let passed = 0;
  let failed = 0;

  function check(condition, msg) {
    if (condition) {
      passed++;
      console.log(`  ✅ ${msg}`);
    } else {
      failed++;
      console.log(`  ❌ ${msg}`);
    }
  }

  try {
    console.log('\nTest 1: 基本实例化');
    const loader = new SkillLoader();
    check(Boolean(loader.rootDir), '默认 rootDir 已设置');
    check(loader._loaded === false, '初始未加载');

    console.log('\nTest 2: 加载 registry');
    const registryLoader = new SkillLoader({ rootDir: process.cwd() });
    const registry = registryLoader.loadRegistry();
    check(Boolean(registry), 'registry 已返回');
    check(registry.version === '1.0', 'registry 版本正确');

    console.log('\nTest 3: 匹配 explore 技能');
    const exploreLoader = new SkillLoader({ rootDir: process.cwd() });
    const exploreSkills = exploreLoader.matchSkills('explore', '搜索代码找到相关文件');
    check(exploreSkills.length > 0, '命中至少一个技能');
    check(exploreSkills[0].id === 'code-search', '命中 code-search');

    console.log('\nTest 4: 匹配 inspector 技能');
    const inspectorLoader = new SkillLoader({ rootDir: process.cwd() });
    const inspectorSkills = inspectorLoader.matchSkills('inspector', '进行安全审查');
    const inspectorIds = inspectorSkills.map((skill) => skill.id);
    check(inspectorSkills.length > 0, '命中 inspector 技能');
    check(inspectorIds.includes('security-review'), '包含 security-review');

    console.log('\nTest 5: 未匹配描述');
    const unmatchedLoader = new SkillLoader({ rootDir: process.cwd() });
    const unmatchedSkills = unmatchedLoader.matchSkills('explore', '吃晚饭');
    check(unmatchedSkills.length === 0, '未匹配时返回空数组');

    console.log('\nTest 6: 无效 agentRole');
    const invalidRoleLoader = new SkillLoader({ rootDir: process.cwd() });
    const invalidRoleSkills = invalidRoleLoader.matchSkills('nonexistent', '搜索代码');
    check(invalidRoleSkills.length === 0, '无效角色返回空数组');

    console.log('\nTest 7: 列出全部技能');
    const listLoader = new SkillLoader({ rootDir: process.cwd() });
    const allSkills = listLoader.listSkills();
    check(allSkills.length >= 12, '全部技能数量至少为 12');

    console.log('\nTest 8: 按角色列出技能');
    const roleLoader = new SkillLoader({ rootDir: process.cwd() });
    const inspectorOnly = roleLoader.listSkills('inspector');
    check(inspectorOnly.length === 3, 'inspector 技能数为 3');

    assert.strictEqual(failed, 0);
  } catch (error) {
    failed++;
    console.log(`\n❌ 测试异常: ${error.message}`);
    console.log(error.stack);
  }

  console.log('\n========================================');
  console.log(`测试结果: ${passed} 通过, ${failed} 失败`);
  if (failed === 0) {
    console.log('✅ 所有 SkillLoader 测试通过！');
  } else {
    console.log('❌ 有测试失败');
    process.exitCode = 1;
  }
}

testSkillLoader();
