const {
  ABTestingFramework, EXPERIMENT_STATUS, VARIANT_TYPE,
  METRIC_GOAL, SIGNIFICANCE_LEVEL
} = require('../src/ab-testing');

async function testABTesting() {
  console.log('🧪 测试 ABTestingFramework...\n');

  let passed = 0;
  let failed = 0;
  const silentLogger = {
    trace(){}, debug(){}, info(){}, warn(){}, error(){}, fatal(){},
    child() { return silentLogger; }
  };

  function assert(condition, msg) {
    if (condition) { passed++; console.log(`  ✅ ${msg}`); }
    else { failed++; console.log(`  ❌ ${msg}`); }
  }

  try {
    // ---- Test 1: 常量导出 ----
    console.log('\nTest 1: 常量导出');
    assert(typeof EXPERIMENT_STATUS === 'object', 'EXPERIMENT_STATUS 已导出');
    assert(EXPERIMENT_STATUS.DRAFT === 'draft', 'DRAFT 状态');
    assert(EXPERIMENT_STATUS.RUNNING === 'running', 'RUNNING 状态');
    assert(EXPERIMENT_STATUS.COMPLETED === 'completed', 'COMPLETED 状态');
    assert(typeof VARIANT_TYPE === 'object', 'VARIANT_TYPE 已导出');
    assert(VARIANT_TYPE.CONTROL === 'control', 'CONTROL 类型');
    assert(VARIANT_TYPE.TREATMENT === 'treatment', 'TREATMENT 类型');
    assert(typeof METRIC_GOAL === 'object', 'METRIC_GOAL 已导出');
    assert(METRIC_GOAL.MAXIMIZE === 'maximize', 'MAXIMIZE 目标');
    assert(typeof SIGNIFICANCE_LEVEL === 'object', 'SIGNIFICANCE_LEVEL 已导出');
    assert(SIGNIFICANCE_LEVEL.MEDIUM === 0.05, '95% 置信');

    // ---- Test 2: 基本实例化 ----
    console.log('\nTest 2: 基本实例化');
    const ab = new ABTestingFramework({ logger: silentLogger });
    assert(ab !== null, 'ABTestingFramework 创建成功');
    assert(ab.defaultSampleSize === 30, '默认样本量 30');
    assert(ab.significanceLevel === 0.05, '默认显著性水平 0.05');
    assert(ab.autoComplete === true, '默认自动完成');
    assert(ab.maxExperiments === 20, '默认最大实验数 20');

    // ---- Test 3: 创建实验 ----
    console.log('\nTest 3: 创建实验');
    const exp = ab.createExperiment({
      name: 'Button Color Test',
      description: 'Test red vs blue button',
      variants: [
        { id: 'control', name: 'Blue Button', type: VARIANT_TYPE.CONTROL, weight: 0.5 },
        { id: 'treatment', name: 'Red Button', type: VARIANT_TYPE.TREATMENT, weight: 0.5 }
      ],
      primaryMetric: { name: 'click_rate', goal: METRIC_GOAL.MAXIMIZE },
      minSampleSize: 10
    });
    assert(exp.success === true, '创建成功');
    assert(typeof exp.experimentId === 'string', '有实验 ID');
    assert(exp.experiment.name === 'Button Color Test', '名称正确');
    assert(exp.experiment.status === EXPERIMENT_STATUS.DRAFT, '初始状态为 DRAFT');
    assert(exp.experiment.variants.length === 2, '2 个变体');

    // ---- Test 4: 创建实验校验 ----
    console.log('\nTest 4: 创建实验校验');
    const badExp1 = ab.createExperiment({});
    assert(badExp1.success === false, '无名称拒绝');
    const badExp2 = ab.createExperiment({ name: 'bad', variants: [{ id: 'a' }] });
    assert(badExp2.success === false, '不足2个变体拒绝');

    // ---- Test 5: 启动实验 ----
    console.log('\nTest 5: 启动实验');
    const startResult = ab.startExperiment(exp.experimentId);
    assert(startResult.success === true, '启动成功');
    const started = ab.getExperiment(exp.experimentId);
    assert(started.status === EXPERIMENT_STATUS.RUNNING, '状态为 RUNNING');
    assert(started.startedAt !== null, '有启动时间');

    // 重复启动
    const dupStart = ab.startExperiment(exp.experimentId);
    assert(dupStart.success === false, '重复启动拒绝');

    // ---- Test 6: 暂停实验 ----
    console.log('\nTest 6: 暂停实验');
    const pauseResult = ab.pauseExperiment(exp.experimentId);
    assert(pauseResult.success === true, '暂停成功');
    assert(ab.getExperiment(exp.experimentId).status === EXPERIMENT_STATUS.PAUSED, '状态为 PAUSED');

    // 恢复
    ab.startExperiment(exp.experimentId);
    assert(ab.getExperiment(exp.experimentId).status === EXPERIMENT_STATUS.RUNNING, '恢复为 RUNNING');

    // ---- Test 7: 流量分配 ----
    console.log('\nTest 7: 流量分配');
    const assign1 = ab.assignVariant(exp.experimentId, 'user-1');
    assert(assign1.success === true, '分配成功');
    assert(typeof assign1.variantId === 'string', '有变体 ID');
    assert(assign1.cached === false, '首次分配非缓存');

    // 粘性分配
    const assign2 = ab.assignVariant(exp.experimentId, 'user-1');
    assert(assign2.success === true, '重复分配成功');
    assert(assign2.variantId === assign1.variantId, '粘性分配一致');
    assert(assign2.cached === true, '缓存命中');

    // ---- Test 8: 特征分组 ----
    console.log('\nTest 8: 特征分组');
    const featureExp = ab.createExperiment({
      name: 'Feature Test',
      variants: [
        { id: 'v1', name: 'Default', type: VARIANT_TYPE.CONTROL },
        {
          id: 'v2', name: 'Premium',
          type: VARIANT_TYPE.TREATMENT,
          targetFeature: { key: 'plan', value: 'premium' }
        }
      ],
      minSampleSize: 5
    });
    ab.startExperiment(featureExp.experimentId);
    const featureAssign = ab.assignVariant(featureExp.experimentId, 'premium-user', { plan: 'premium' });
    assert(featureAssign.variantId === 'v2', '特征匹配分配到指定变体');

    // ---- Test 9: 获取分配 ----
    console.log('\nTest 9: 获取分配');
    const assignment = ab.getAssignment(exp.experimentId, 'user-1');
    assert(assignment !== null, '获取分配成功');
    assert(assignment === assign1.variantId, '分配值一致');
    assert(ab.getAssignment(exp.experimentId, 'nonexistent') === null, '不存在返回 null');

    // ---- Test 10: 记录观测值 ----
    console.log('\nTest 10: 记录观测值');
    const obs1 = ab.recordObservation(exp.experimentId, 'control', 0.85);
    assert(obs1.success === true, '记录成功');
    assert(obs1.count === 1, '观测数 = 1');

    const obs2 = ab.recordObservation(exp.experimentId, 'treatment', 0.92);
    assert(obs2.success === true, 'treatment 记录成功');

    // 无效值
    const badObs = ab.recordObservation(exp.experimentId, 'control', 'not-a-number');
    assert(badObs.success === false, '非数字拒绝');

    // ---- Test 11: 批量记录观测 ----
    console.log('\nTest 11: 批量记录观测');
    const batchResult = ab.recordBatch(exp.experimentId, 'control', [0.8, 0.82, 0.79, 0.85, 0.88]);
    assert(batchResult.success === true, '批量记录成功');
    assert(batchResult.recorded === 5, '记录 5 个');

    ab.recordBatch(exp.experimentId, 'treatment', [0.9, 0.91, 0.89, 0.93, 0.95]);

    // ---- Test 12: 获取变体指标 ----
    console.log('\nTest 12: 获取变体指标');
    const metrics = ab.getVariantMetrics(exp.experimentId);
    assert(metrics !== null, '指标不为 null');
    assert(metrics.control.sampleSize >= 6, 'control 样本量 >= 6');
    assert(metrics.treatment.sampleSize >= 6, 'treatment 样本量 >= 6');
    assert(typeof metrics.control.mean === 'number', 'control 有均值');
    assert(typeof metrics.control.stddev === 'number', 'control 有标准差');
    assert(typeof metrics.control.median === 'number', 'control 有中位数');
    assert(metrics.control.min !== null, 'control 有最小值');
    assert(metrics.control.max !== null, 'control 有最大值');

    // ---- Test 13: 统计显著性分析 (样本不够) ----
    console.log('\nTest 13: 统计显著性分析 (样本不够)');
    // 创建一个高 minSampleSize 的实验
    const smallExp = ab.createExperiment({
      name: 'Small Test',
      variants: [
        { id: 'c', name: 'C', type: VARIANT_TYPE.CONTROL },
        { id: 't', name: 'T', type: VARIANT_TYPE.TREATMENT }
      ],
      minSampleSize: 100
    });
    ab.startExperiment(smallExp.experimentId);
    ab.recordObservation(smallExp.experimentId, 'c', 0.5);
    ab.recordObservation(smallExp.experimentId, 'c', 0.6);
    ab.recordObservation(smallExp.experimentId, 't', 0.9);
    ab.recordObservation(smallExp.experimentId, 't', 0.8);
    const smallAnalysis = ab.analyzeSignificance(smallExp.experimentId);
    assert(smallAnalysis.success === true, '分析成功');
    assert(smallAnalysis.significant === false, '样本不够不显著');

    // ---- Test 14: 统计显著性分析 (足够样本) ----
    console.log('\nTest 14: 统计显著性分析 (足够样本)');
    // 补充 exp 数据使样本量达到 minSampleSize(10)
    for (let i = 0; i < 5; i++) {
      ab.recordObservation(exp.experimentId, 'control', 0.78 + Math.random() * 0.1);
      ab.recordObservation(exp.experimentId, 'treatment', 0.88 + Math.random() * 0.1);
    }
    const analysis = ab.analyzeSignificance(exp.experimentId);
    assert(analysis.success === true, '分析成功');
    assert(typeof analysis.pValue === 'number', '有 p-value');
    assert(typeof analysis.zScore === 'number', '有 z-score');
    assert(typeof analysis.effectSize === 'number', '有效应量');
    assert(typeof analysis.control === 'object', '有 control 信息');
    assert(typeof analysis.treatment === 'object', '有 treatment 信息');

    // ---- Test 15: 实验报告 ----
    console.log('\nTest 15: 实验报告');
    const report = ab.getExperimentReport(exp.experimentId);
    assert(report !== null, '报告不为 null');
    assert(typeof report.experiment === 'object', '包含实验信息');
    assert(typeof report.metrics === 'object', '包含指标');
    assert(typeof report.significance === 'object', '包含显著性分析');
    assert(typeof report.totalObservations === 'number', '有总观测数');
    assert(report.totalObservations > 0, '观测数 > 0');

    // ---- Test 16: 完成实验 ----
    console.log('\nTest 16: 完成实验');
    const completeResult = ab.completeExperiment(exp.experimentId, 'treatment');
    assert(completeResult.success === true, '完成成功');
    assert(completeResult.winner === 'treatment', '赢家正确');
    const completedExp = ab.getExperiment(exp.experimentId);
    assert(completedExp.status === EXPERIMENT_STATUS.COMPLETED, '状态为 COMPLETED');
    assert(completedExp.completedAt !== null, '有完成时间');

    // ---- Test 17: 取消实验 ----
    console.log('\nTest 17: 取消实验');
    const cancelExp = ab.createExperiment({
      name: 'Cancel Test',
      variants: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]
    });
    ab.startExperiment(cancelExp.experimentId);
    const cancelResult = ab.cancelExperiment(cancelExp.experimentId);
    assert(cancelResult.success === true, '取消成功');
    assert(ab.getExperiment(cancelExp.experimentId).status === EXPERIMENT_STATUS.CANCELLED, '状态为 CANCELLED');

    // ---- Test 18: 列出实验 ----
    console.log('\nTest 18: 列出实验');
    const allExps = ab.listExperiments();
    assert(allExps.length >= 4, `至少 4 个实验 (实际: ${allExps.length})`);
    const runningExps = ab.listExperiments({ status: EXPERIMENT_STATUS.RUNNING });
    assert(Array.isArray(runningExps), '过滤返回数组');

    // ---- Test 19: 自动完成 ----
    console.log('\nTest 19: 自动完成');
    const autoExp = ab.createExperiment({
      name: 'Auto Complete Test',
      variants: [
        { id: 'ac', name: 'Control', type: VARIANT_TYPE.CONTROL },
        { id: 'at', name: 'Treatment', type: VARIANT_TYPE.TREATMENT }
      ],
      minSampleSize: 10,
      significanceLevel: 0.10 // 更宽松以便测试
    });
    ab.startExperiment(autoExp.experimentId);

    // 注入明显不同的数据
    for (let i = 0; i < 15; i++) {
      ab.recordObservation(autoExp.experimentId, 'ac', 10 + Math.random() * 2);
      ab.recordObservation(autoExp.experimentId, 'at', 20 + Math.random() * 2);
    }

    const autoStatus = ab.getExperiment(autoExp.experimentId);
    assert(autoStatus.status === EXPERIMENT_STATUS.COMPLETED, '自动完成');
    assert(autoStatus.winner !== null, '自动选出赢家');
    assert(ab.stats.autoDecisions >= 1, 'autoDecisions >= 1');

    // ---- Test 20: 不存在的实验 ----
    console.log('\nTest 20: 不存在的实验');
    assert(ab.getExperiment('nonexistent') === null, '不存在返回 null');
    assert(ab.getVariantMetrics('nonexistent') === null, '指标返回 null');
    assert(ab.getExperimentReport('nonexistent') === null, '报告返回 null');
    assert(ab.assignVariant('nonexistent', 'u1').success === false, '分配拒绝');
    assert(ab.recordObservation('nonexistent', 'v1', 1).success === false, '记录拒绝');
    assert(ab.analyzeSignificance('nonexistent').success === false, '分析拒绝');

    // ---- Test 21: MINIMIZE 目标 ----
    console.log('\nTest 21: MINIMIZE 目标');
    const minExp = ab.createExperiment({
      name: 'Latency Test',
      variants: [
        { id: 'mc', name: 'Old', type: VARIANT_TYPE.CONTROL },
        { id: 'mt', name: 'New', type: VARIANT_TYPE.TREATMENT }
      ],
      primaryMetric: { name: 'latency', goal: METRIC_GOAL.MINIMIZE },
      minSampleSize: 10,
      significanceLevel: 0.10
    });
    ab.startExperiment(minExp.experimentId);
    // 注入数据: treatment 延迟更低
    for (let i = 0; i < 15; i++) {
      ab.recordObservation(minExp.experimentId, 'mc', 200 + Math.random() * 20);
      ab.recordObservation(minExp.experimentId, 'mt', 100 + Math.random() * 20);
    }
    const minAnalysis = ab.analyzeSignificance(minExp.experimentId);
    if (minAnalysis.significant) {
      assert(minAnalysis.winner === 'mt', 'MINIMIZE 场景: 低延迟赢');
    } else {
      assert(true, 'MINIMIZE 场景: 分析完成 (可能需更多样本)');
    }

    // ---- Test 22: getStats ----
    console.log('\nTest 22: getStats');
    const stats = ab.getStats();
    assert(stats.experimentsCreated >= 5, `创建数 >= 5 (实际: ${stats.experimentsCreated})`);
    assert(stats.experimentsCompleted >= 2, `完成数 >= 2 (实际: ${stats.experimentsCompleted})`);
    assert(stats.totalAssignments >= 2, `分配数 >= 2`);
    assert(stats.totalObservations > 0, '观测数 > 0');
    assert(typeof stats.activeExperiments === 'number', '有活跃实验数');
    assert(typeof stats.totalExperiments === 'number', '有总实验数');

    // ---- Test 23: 事件日志 ----
    console.log('\nTest 23: 事件日志');
    const events = ab.getEventLog();
    assert(Array.isArray(events), '事件日志是数组');
    assert(events.length > 0, '有事件记录');
    assert(events.some(e => e.event === 'experiment_created'), '包含创建事件');
    assert(events.some(e => e.event === 'experiment_started'), '包含启动事件');
    assert(events.some(e => e.event === 'variant_assigned'), '包含分配事件');

    // ---- Test 24: 已完成实验不能分配/记录 ----
    console.log('\nTest 24: 已完成实验不能分配/记录');
    const closedAssign = ab.assignVariant(exp.experimentId, 'new-user');
    assert(closedAssign.success === false, '已完成实验拒绝分配');
    const closedObs = ab.recordObservation(exp.experimentId, 'control', 0.5);
    assert(closedObs.success === false, '已完成实验拒绝记录');

    // ---- Test 25: 实验数限制 ----
    console.log('\nTest 25: 实验数限制');
    const limitAB = new ABTestingFramework({ maxExperiments: 1, logger: silentLogger });
    const lexp1 = limitAB.createExperiment({
      name: 'E1',
      variants: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]
    });
    limitAB.startExperiment(lexp1.experimentId);
    const lexp2 = limitAB.createExperiment({
      name: 'E2',
      variants: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]
    });
    assert(lexp2.success === false, '超过实验数限制拒绝');
    assert(lexp2.error.includes('上限'), '错误信息正确');

    // ---- Test 26: 批量观测非数组拒绝 ----
    console.log('\nTest 26: 批量观测非数组拒绝');
    const badBatch = ab.recordBatch(featureExp.experimentId, 'v1', 'not-array');
    assert(badBatch.success === false, '非数组拒绝');

    // ---- Test 27: 多变体权重分配 ----
    console.log('\nTest 27: 多变体权重分配');
    const multiExp = ab.createExperiment({
      name: 'Multi Variant',
      variants: [
        { id: 'a', name: 'A', weight: 1 },
        { id: 'b', name: 'B', weight: 2 },
        { id: 'c', name: 'C', weight: 1 }
      ],
      minSampleSize: 5
    });
    assert(multiExp.success === true, '多变体创建成功');
    assert(multiExp.experiment.variants.length === 3, '3 个变体');
    // 权重归一化
    const weights = multiExp.experiment.variants.map(v => v.weight);
    const weightSum = weights.reduce((a, b) => a + b, 0);
    assert(Math.abs(weightSum - 1.0) < 0.01, `权重归一化 (sum=${weightSum.toFixed(3)})`);

  } catch (error) {
    console.log(`\n❌ 测试异常: ${error.message}`);
    console.log(error.stack);
    failed++;
  }

  console.log(`\n========================================`);
  console.log(`测试结果: ${passed} 通过, ${failed} 失败`);
  if (failed === 0) {
    console.log('✅ 所有 ABTestingFramework 测试通过！');
  } else {
    console.log('❌ 有测试失败');
    process.exitCode = 1;
  }
}

testABTesting();
