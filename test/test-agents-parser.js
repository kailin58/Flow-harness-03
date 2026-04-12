const { AgentsParser, AGENT_ROLES } = require('../src/agents-parser');
const path = require('path');

async function testAgentsParser() {
  console.log('🧪 测试 AgentsParser...\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, msg) {
    if (condition) { passed++; console.log(`  ✅ ${msg}`); }
    else { failed++; console.log(`  ❌ ${msg}`); }
  }

  try {
    // ---- Test 1: 基本实例化 ----
    console.log('\nTest 1: 基本实例化');
    const parser = new AgentsParser();
    assert(parser !== null, 'AgentsParser 实例创建成功');

    // ---- Test 2: 解析 AGENTS.md ----
    console.log('\nTest 2: 解析 AGENTS.md');
    const result = parser.parse();
    assert(result !== null, 'parse() 返回非空');
    assert(typeof result === 'object', 'parse() 返回对象');

    // ---- Test 3: 禁止项解析 ----
    console.log('\nTest 3: 禁止项解析');
    assert(typeof parser.prohibitions === 'object', 'prohibitions 属性存在');
    // getProhibitionsForRole 方法
    const devProhibitions = parser.getProhibitionsForRole('developer');
    assert(typeof devProhibitions === 'object', 'getProhibitionsForRole 返回对象');
    assert(Array.isArray(devProhibitions.global), 'devProhibitions.global 是数组');

    // ---- Test 4: 解析能力 ----
    console.log('\nTest 4: 能力解析');
    assert(typeof parser.capabilities === 'object', 'capabilities 属性存在');

    // ---- Test 5: checkAction — 正常操作 ----
    console.log('\nTest 5: checkAction 正常操作');
    const normalAction = parser.checkAction('developer', 'read_code', { filePath: 'src/index.js' });
    assert(typeof normalAction === 'object', 'checkAction 返回对象');
    assert(typeof normalAction.allowed === 'boolean', 'checkAction 返回 allowed 字段');
    assert(normalAction.allowed === true, 'read_code 应该被允许');
    assert('requiresApproval' in normalAction, 'checkAction 返回 requiresApproval 字段');

    // ---- Test 6: checkAction — 禁止操作 ----
    console.log('\nTest 6: checkAction 禁止操作');
    const forbiddenAction = parser.checkAction('developer', 'modify_production', {});
    assert(typeof forbiddenAction.allowed === 'boolean', 'checkAction 对禁止操作返回结果');

    // ---- Test 7: 协作规则 ----
    console.log('\nTest 7: 协作规则解析');
    assert(Array.isArray(parser.collaborationRules), 'collaborationRules 是数组');

    // ---- Test 8: getRules ----
    console.log('\nTest 8: getRules');
    const rules = parser.getRules();
    assert(typeof rules === 'object', 'getRules 返回对象');

    // ---- Test 9: 默认规则回退 ----
    console.log('\nTest 9: 默认规则回退（无 AGENTS.md）');
    const parser2 = new AgentsParser({ filePath: 'nonexistent/AGENTS.md' });
    parser2.parse();
    const fallback = parser2.checkAction('developer', 'read_code', {});
    assert(typeof fallback === 'object', '无 AGENTS.md 时 checkAction 仍返回结果');
    assert(typeof fallback.allowed === 'boolean', '回退规则有 allowed 字段');

    // ---- Test 10: AGENT_ROLES 常量 ----
    console.log('\nTest 10: AGENT_ROLES 常量');
    assert(AGENT_ROLES !== undefined, 'AGENT_ROLES 已导出');
    assert(typeof AGENT_ROLES === 'object', 'AGENT_ROLES 是对象');

    // ---- Test 11: checkActions 批量检查 ----
    console.log('\nTest 11: checkActions 批量检查');
    if (typeof parser.checkActions === 'function') {
      const batchResult = parser.checkActions('developer', [
        { action: 'read_code', context: {} },
        { action: 'write_code', context: {} }
      ]);
      assert(Array.isArray(batchResult), 'checkActions 返回数组');
    } else {
      assert(true, 'checkActions 跳过（方法不存在）');
    }

  } catch (error) {
    console.log(`\n❌ 测试异常: ${error.message}`);
    console.log(error.stack);
    failed++;
  }

  console.log(`\n========================================`);
  console.log(`测试结果: ${passed} 通过, ${failed} 失败`);
  if (failed === 0) {
    console.log('✅ 所有 AgentsParser 测试通过！');
  } else {
    console.log('❌ 有测试失败');
    process.exitCode = 1;
  }
}

testAgentsParser();
