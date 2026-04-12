const TaskAnalyzer = require('../src/task-analyzer');

function testTaskAnalyzer() {
  console.log('🧪 测试 TaskAnalyzer...\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, msg) {
    if (condition) { passed++; console.log(`  ✅ ${msg}`); }
    else { failed++; console.log(`  ❌ ${msg}`); }
  }

  try {
    // ---- Test 1: 基本实例化 ----
    console.log('\nTest 1: 基本实例化');
    const analyzer = new TaskAnalyzer();
    assert(analyzer !== null, 'TaskAnalyzer 创建成功');
    assert(typeof analyzer.taskPatterns === 'object', '任务模式已初始化');
    assert(Object.keys(analyzer.taskPatterns).length === 9, '9 种任务类型（含 research）');

    // ---- Test 2: Bug修复分类 ----
    console.log('\nTest 2: Bug修复分类');
    assert(analyzer.classifyTask('修复登录bug') === 'bug_fix', '"修复登录bug" → bug_fix');
    assert(analyzer.classifyTask('fix the login issue') === 'bug_fix', '"fix the login issue" → bug_fix');
    assert(analyzer.classifyTask('这个错误需要处理') === 'bug_fix', '"这个错误需要处理" → bug_fix');
    assert(analyzer.classifyTask('页面不工作了') === 'bug_fix', '"页面不工作了" → bug_fix');

    // ---- Test 3: 功能开发分类 ----
    console.log('\nTest 3: 功能开发分类');
    assert(analyzer.classifyTask('添加用户注册功能') === 'feature', '"添加用户注册功能" → feature');
    assert(analyzer.classifyTask('实现支付接口') === 'feature', '"实现支付接口" → feature');
    assert(analyzer.classifyTask('add a new feature') === 'feature', '"add a new feature" → feature');

    // ---- Test 4: 重构分类 ----
    console.log('\nTest 4: 重构分类');
    assert(analyzer.classifyTask('重构用户模块') === 'refactor', '"重构用户模块" → refactor');
    assert(analyzer.classifyTask('refactor the database layer') === 'refactor', '"refactor..." → refactor');

    // ---- Test 5: 文档分类 ----
    console.log('\nTest 5: 文档分类');
    assert(analyzer.classifyTask('编写API文档') === 'documentation', '"编写API文档" → documentation');
    assert(analyzer.classifyTask('update readme') === 'documentation', '"update readme" → documentation');

    // ---- Test 6: 测试分类 ----
    console.log('\nTest 6: 测试分类');
    assert(analyzer.classifyTask('编写单元测试') === 'testing', '"编写单元测试" → testing');
    assert(analyzer.classifyTask('run test suite') === 'testing', '"run test suite" → testing');

    // ---- Test 7: 安全分类 ----
    console.log('\nTest 7: 安全分类');
    assert(analyzer.classifyTask('存在安全漏洞') === 'security', '"存在安全漏洞" → security');
    assert(analyzer.classifyTask('check for vulnerability') === 'security', '"check for vulnerability" → security');

    // ---- Test 8: 性能分类 ----
    console.log('\nTest 8: 性能分类');
    assert(analyzer.classifyTask('优化查询性能') === 'refactor', '"优化查询性能" → refactor (优化先匹配)');

    // ---- Test 9: 部署分类 ----
    console.log('\nTest 9: 部署分类');
    assert(analyzer.classifyTask('部署到生产环境') === 'deployment', '"部署到生产环境" → deployment');
    assert(analyzer.classifyTask('release v2.0') === 'deployment', '"release v2.0" → deployment');

    // ---- Test 10: 通用分类 (无匹配) ----
    console.log('\nTest 10: 通用分类');
    assert(analyzer.classifyTask('一些随机任务') === 'general', '无匹配 → general');

    // ---- Test 11: analyze 完整分析 ----
    console.log('\nTest 11: 完整分析');
    const result = analyzer.analyze('修复登录页面的bug');
    assert(result.taskType === 'bug_fix', '类型正确');
    assert(typeof result.goal === 'object', '有目标');
    assert(result.goal.description.length > 0, '目标有描述');
    assert(Array.isArray(result.acceptanceCriteria), '有验收标准');
    assert(result.acceptanceCriteria.length >= 1, '至少 1 条标准');
    assert(typeof result.priority === 'string', '有优先级');
    assert(typeof result.complexity === 'object', '有复杂度');
    assert(Array.isArray(result.risks), '有风险列表');
    assert(typeof result.metadata === 'object', '有元数据');
    assert(result.metadata.originalMessage === '修复登录页面的bug', '原始消息保留');

    // ---- Test 12: 目标提取 ----
    console.log('\nTest 12: 目标提取');
    const goal1 = analyzer.extractGoal('请添加搜索功能', 'feature');
    assert(goal1.description === '添加搜索功能', '移除了 "请" 前缀');
    assert(goal1.type === 'feature', '类型正确');
    assert(goal1.measurable === false, '无量化指标');

    const goal2 = analyzer.extractGoal('优化性能到95%通过率', 'performance');
    assert(goal2.measurable === true, '有量化指标 (95%)');

    const goal3 = analyzer.extractGoal('减少延迟到200ms', 'performance');
    assert(goal3.measurable === true, '有量化指标 (200ms)');

    // ---- Test 13: 验收标准 (bug_fix) ----
    console.log('\nTest 13: 验收标准 (bug_fix)');
    const criteria1 = analyzer.defineAcceptanceCriteria('fix bug', 'bug_fix');
    assert(criteria1.includes('任务完成且无错误'), '包含基础标准');
    assert(criteria1.includes('Bug已修复且不再复现'), '包含 Bug 修复标准');
    assert(criteria1.includes('相关测试通过'), '包含测试标准');
    assert(criteria1.includes('未引入新的Bug'), '包含回归标准');

    // ---- Test 14: 验收标准 (feature) ----
    console.log('\nTest 14: 验收标准 (feature)');
    const criteria2 = analyzer.defineAcceptanceCriteria('add feature', 'feature');
    assert(criteria2.includes('功能按需求实现'), '包含功能标准');
    assert(criteria2.includes('代码通过测试'), '包含测试标准');
    assert(criteria2.includes('文档已更新'), '包含文档标准');

    // ---- Test 15: 验收标准 (security) ----
    console.log('\nTest 15: 验收标准 (security)');
    const criteria3 = analyzer.defineAcceptanceCriteria('fix security', 'security');
    assert(criteria3.includes('安全漏洞已修复'), '包含安全标准');
    assert(criteria3.includes('安全扫描通过'), '包含扫描标准');
    assert(criteria3.includes('无敏感信息泄露'), '包含泄露标准');

    // ---- Test 16: 验收标准 (核心系统) ----
    console.log('\nTest 16: 验收标准 (核心系统)');
    const criteria4 = analyzer.defineAcceptanceCriteria('修改数据库schema', 'feature');
    assert(criteria4.includes('核心模块变更已授权'), '核心系统需授权');
    assert(criteria4.includes('影响范围已评估'), '需评估影响');

    // ---- Test 17: 优先级估算 ----
    console.log('\nTest 17: 优先级估算');
    assert(analyzer.estimatePriority('紧急修复线上问题') === 'urgent', '紧急 → urgent');
    assert(analyzer.estimatePriority('urgent fix needed asap') === 'urgent', 'ASAP → urgent');
    assert(analyzer.estimatePriority('重要的核心功能') === 'high', '重要 → high');
    assert(analyzer.estimatePriority('critical blocker') === 'high', 'critical → high');
    assert(analyzer.estimatePriority('可选的优化建议') === 'low', '可选 → low');
    assert(analyzer.estimatePriority('nice to have feature') === 'low', 'nice to have → low');
    assert(analyzer.estimatePriority('普通任务') === 'normal', '普通 → normal');

    // ---- Test 18: 复杂度估算 ----
    console.log('\nTest 18: 复杂度估算');
    const c1 = analyzer.estimateComplexity('简单修改文档', 'documentation');
    assert(c1.score >= 1, '文档+简单 → 低分');
    assert(typeof c1.level === 'string', '有等级');
    assert(typeof c1.estimatedTime === 'string', '有时间估算');

    const c2 = analyzer.estimateComplexity('重构分布式架构', 'refactor');
    assert(c2.score >= 4, '重构+分布式+架构 → 高分');
    assert(c2.level === 'complex' || c2.level === 'very_complex', '复杂度高');

    const c3 = analyzer.estimateComplexity('修复安全漏洞', 'security');
    assert(c3.score >= 3, '安全任务基础分高');

    // ---- Test 19: 风险识别 ----
    console.log('\nTest 19: 风险识别');
    const r1 = analyzer.identifyRisks('修改数据库schema和迁移', 'feature');
    assert(r1.length >= 2, '数据库+迁移 → 至少 2 个风险');
    assert(r1.some(r => r.type === 'data'), '包含数据风险');
    assert(r1.some(r => r.type === 'core_system'), '包含核心系统风险');

    const r2 = analyzer.identifyRisks('修改认证加密模块', 'security');
    assert(r2.some(r => r.type === 'security'), '包含安全风险');

    const r3 = analyzer.identifyRisks('优化性能解决并发问题', 'performance');
    assert(r3.some(r => r.type === 'performance'), '包含性能风险');

    const r4 = analyzer.identifyRisks('升级框架版本', 'refactor');
    assert(r4.some(r => r.type === 'compatibility'), '包含兼容性风险');

    const r5 = analyzer.identifyRisks('一个普通的小任务', 'general');
    assert(r5.length === 0, '无特殊关键词 → 无风险');

    // ---- Test 20: isGoalMeasurable ----
    console.log('\nTest 20: isGoalMeasurable');
    assert(analyzer.isGoalMeasurable('提高覆盖率到80%') === true, '80% → 可量化');
    assert(analyzer.isGoalMeasurable('延迟降到100ms') === true, '100ms → 可量化');
    assert(analyzer.isGoalMeasurable('提升通过率') === true, '通过率 → 可量化');
    assert(analyzer.isGoalMeasurable('随便改改') === false, '无指标 → 不可量化');

    // ---- Test 21: involvesCoreSystems ----
    console.log('\nTest 21: involvesCoreSystems');
    assert(analyzer.involvesCoreSystems('修改database') === true, 'database → 核心');
    assert(analyzer.involvesCoreSystems('支付模块payment') === true, 'payment → 核心');
    assert(analyzer.involvesCoreSystems('认证接口') === true, '认证 → 核心');
    assert(analyzer.involvesCoreSystems('api契约变更') === true, 'api契约 → 核心');
    assert(analyzer.involvesCoreSystems('普通页面') === false, '普通 → 非核心');

    // ---- Test 22: estimateTime ----
    console.log('\nTest 22: estimateTime');
    assert(analyzer.estimateTime(1) === '< 1小时', 'score 1 → < 1小时');
    assert(analyzer.estimateTime(3) === '3-8小时', 'score 3 → 3-8小时');
    assert(analyzer.estimateTime(5) === '> 2天', 'score 5 → > 2天');

    // ---- Test 23: 验收标准 (refactor/testing/documentation) ----
    console.log('\nTest 23: 其他类型验收标准');
    const crRefactor = analyzer.defineAcceptanceCriteria('refactor code', 'refactor');
    assert(crRefactor.includes('代码结构改善'), 'refactor 包含结构改善');
    assert(crRefactor.includes('功能保持不变'), 'refactor 包含功能不变');

    const crTesting = analyzer.defineAcceptanceCriteria('add tests', 'testing');
    assert(crTesting.includes('测试覆盖关键路径'), 'testing 包含覆盖标准');

    const crDoc = analyzer.defineAcceptanceCriteria('write docs', 'documentation');
    assert(crDoc.includes('文档内容完整'), 'documentation 包含完整标准');
    assert(crDoc.includes('示例清晰'), 'documentation 包含示例标准');

    // ---- Test 24: analyze with context ----
    console.log('\nTest 24: 带上下文的分析');
    const ctxResult = analyzer.analyze('紧急修复数据库schema的安全漏洞', { project: 'test' });
    assert(ctxResult.taskType === 'security' || ctxResult.taskType === 'bug_fix', '安全/修复类型');
    assert(ctxResult.priority === 'urgent', '紧急优先');
    assert(ctxResult.risks.length >= 2, '多个风险');
    assert(ctxResult.acceptanceCriteria.length >= 3, '多条验收标准');

  } catch (error) {
    console.log(`\n❌ 测试异常: ${error.message}`);
    console.log(error.stack);
    failed++;
  }

  console.log(`\n========================================`);
  console.log(`测试结果: ${passed} 通过, ${failed} 失败`);
  if (failed === 0) {
    console.log('✅ 所有 TaskAnalyzer 测试通过！');
  } else {
    console.log('❌ 有测试失败');
    process.exitCode = 1;
  }
}

testTaskAnalyzer();
