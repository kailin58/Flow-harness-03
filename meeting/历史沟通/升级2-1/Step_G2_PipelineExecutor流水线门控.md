# Step G2: PipelineExecutor 流水线门控

**所属阶段**: Phase G - 借鉴优化
**预计时间**: 2-3 小时
**依赖**: 无（完全独立模块）
**产出文件**: `src/pipeline-executor.js`, `test/test-pipeline-executor.js`

---

## 一、设计目标

借鉴 ai-website-cloner 的多阶段质量门控设计，实现可配置的流水线执行模式。

### 与现有 6 步闭环的关系

| 维度 | 6 步闭环 (现有) | 流水线模式 (新增) |
|------|----------------|------------------|
| **模式** | 串行闭环 | 流水线 + 阶段门控 |
| **门控** | 仅 Step 5 检查 | 每阶段都有门控 |
| **适用** | 通用任务 | 确定性高的任务 |
| **切换** | 默认 | 配置启用 |

---

## 二、实现边界

### 输入

```javascript
{
  stages: Array<{         // 流水线阶段定义
    name: string,
    description: string,
    gates: string[],      // 该阶段的门控检查点
    execute: Function      // 阶段执行函数
  }>,
  context: {              // 执行上下文
    task: string,
    stopOnGateFailure: boolean  // 门控失败是否停止
  }
}
```

### 输出

```javascript
{
  success: boolean,
  stages: Array<{        // 每个阶段的执行结果
    name: string,
    passed: boolean,
    gates: {              // 门控检查结果
      [gateName]: { passed: boolean, reason?: string }
    },
    output: any,
    duration: number
  }>,
  failedAt: string | null,  // 失败的阶段名称
  totalTime: number
}
```

### 不修改的文件

- `src/supervisor-agent.js` 的现有方法 - 保持不变
- `src/inspector.js` - 保持不变
- `src/quality-gate.js` - 保持不变

---

## 三、实现规范

### 文件结构

```javascript
// src/pipeline-executor.js

/**
 * 流水线阶段定义（借鉴 ai-website-cloner）
 */
const PIPELINE_STAGES = {
  RECONNAISSANCE: {
    name: 'reconnaissance',
    description: '侦察阶段 - 收集信息',
    gates: ['info_complete', 'resources_available']
  },
  FOUNDATION: {
    name: 'foundation',
    description: '基础阶段 - 建立基础',
    gates: ['build_pass', 'typecheck_pass']
  },
  BUILD: {
    name: 'build',
    description: '构建阶段 - 执行构建',
    gates: ['build_pass', 'tests_pass']
  },
  ASSEMBLY: {
    name: 'assembly',
    description: '组装阶段 - 合并验证',
    gates: ['merge_success', 'final_build_pass']
  }
};

/**
 * 门控检查器映射
 */
const GATE_CHECKERS = {
  'info_complete': async (output) => {
    return output && Object.keys(output).length > 0;
  },
  'resources_available': async (output) => {
    return true; // 默认通过
  },
  'build_pass': async (output) => {
    // 执行 npm run build
    const { execSync } = require('child_process');
    try {
      execSync('npm run build', { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  },
  'typecheck_pass': async (output) => {
    const { execSync } = require('child_process');
    try {
      execSync('npx tsc --noEmit', { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  },
  'tests_pass': async (output) => {
    const { execSync } = require('child_process');
    try {
      execSync('npm test', { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  },
  'merge_success': async (output) => {
    return output && output.merged === true;
  },
  'final_build_pass': async (output) => {
    return GATE_CHECKERS['build_pass'](output);
  }
};

/**
 * PipelineExecutor - 流水线执行器
 * 
 * 借鉴 ai-website-cloner 的多阶段流水线质量门控设计
 */
class PipelineExecutor {
  constructor(config = {}) {
    this.stages = config.stages || Object.values(PIPELINE_STAGES);
    this.stopOnGateFailure = config.stopOnGateFailure !== false;
    this.enableParallelBuild = config.enableParallelBuild !== false;
    
    // 引用外部组件（不创建新实例）
    this.agentExecutor = config.agentExecutor;
    this.knowledgeBase = config.knowledgeBase;
  }

  /**
   * 执行流水线
   * @param {Object} context - 执行上下文
   * @returns {Promise<Object>} 执行结果
   */
  async execute(context = {}) {
    const results = {
      stages: [],
      passed: true,
      failedAt: null,
      totalTime: 0
    };
    
    const startTime = Date.now();

    for (const stage of this.stages) {
      const stageResult = await this.executeStage(stage, context);
      results.stages.push(stageResult);
      results.totalTime += stageResult.duration;

      // 门控检查
      if (!stageResult.passed) {
        results.passed = false;
        results.failedAt = stage.name;
        
        if (this.stopOnGateFailure) {
          break;
        }
      }
    }

    return results;
  }

  /**
   * 执行单个阶段
   */
  async executeStage(stage, context) {
    const startTime = Date.now();
    const result = {
      name: stage.name,
      passed: false,
      gates: {},
      output: null,
      duration: 0
    };

    // 执行阶段任务
    try {
      result.output = await this.runStageTasks(stage, context);
    } catch (error) {
      result.error = error.message;
    }

    // 执行门控检查
    for (const gate of stage.gates) {
      result.gates[gate] = await this.checkGate(gate, result.output);
    }

    // 综合判断
    result.passed = Object.values(result.gates).every(g => g.passed);
    result.duration = Date.now() - startTime;

    return result;
  }

  /**
   * 检查门控
   */
  async checkGate(gateName, output) {
    const checker = GATE_CHECKERS[gateName];
    if (!checker) {
      return { passed: true, reason: 'Unknown gate, auto-pass' };
    }

    try {
      const passed = await checker(output);
      return { passed: !!passed, gate: gateName };
    } catch (error) {
      return { passed: false, gate: gateName, error: error.message };
    }
  }

  /**
   * 运行阶段任务（可被子类覆盖）
   */
  async runStageTasks(stage, context) {
    return {};
  }
}

module.exports = { PipelineExecutor, PIPELINE_STAGES, GATE_CHECKERS };
```

---

## 四、测试用例

### 文件: `test/test-pipeline-executor.js`

```javascript
const assert = require('assert');
const { PipelineExecutor, PIPELINE_STAGES, GATE_CHECKERS } = require('../src/pipeline-executor');

// 测试 1: 阶段定义
async function test_stages() {
  assert(PIPELINE_STAGES.RECONNAISSANCE, 'RECONNAISSANCE 阶段应存在');
  assert(PIPELINE_STAGES.FOUNDATION, 'FOUNDATION 阶段应存在');
  assert(PIPELINE_STAGES.BUILD, 'BUILD 阶段应存在');
  assert(PIPELINE_STAGES.ASSEMBLY, 'ASSEMBLY 阶段应存在');
  console.log('✓ test_stages');
}

// 测试 2: 门控检查器
async function test_gate_checkers() {
  const pipeline = new PipelineExecutor({});
  
  // info_complete 门控
  const result1 = await pipeline.checkGate('info_complete', { data: 'test' });
  assert(result1.passed === true, '有数据应通过');
  
  const result2 = await pipeline.checkGate('info_complete', null);
  assert(result2.passed === false, '无数据应失败');
  
  console.log('✓ test_gate_checkers');
}

// 测试 3: 阶段执行
async function test_stage_execution() {
  const pipeline = new PipelineExecutor({});
  const stage = PIPELINE_STAGES.RECONNAISSANCE;
  
  const result = await pipeline.executeStage(stage, { task: 'test' });
  assert(result.name === 'reconnaissance', '阶段名称应匹配');
  assert(typeof result.passed === 'boolean', '应有 passed 字段');
  assert(typeof result.duration === 'number', '应有 duration 字段');
  
  console.log('✓ test_stage_execution');
}

// 测试 4: 完整流水线
async function test_full_pipeline() {
  const pipeline = new PipelineExecutor({
    stopOnGateFailure: true
  });
  
  const result = await pipeline.execute({ task: 'test' });
  assert(Array.isArray(result.stages), '应有 stages 数组');
  assert(typeof result.passed === 'boolean', '应有 passed 字段');
  assert(typeof result.totalTime === 'number', '应有 totalTime 字段');
  
  console.log('✓ test_full_pipeline');
}

// 测试 5: 门控失败停止
async function test_stop_on_gate_failure() {
  // 自定义一个必定失败的阶段
  const failingStage = {
    name: 'failing_stage',
    gates: ['always_fail'],
    execute: () => ({})
  };
  
  // 注册失败门控
  const customCheckers = {
    'always_fail': async () => false
  };
  
  const pipeline = new PipelineExecutor({
    stages: [failingStage, { name: 'never_reached', gates: [] }],
    stopOnGateFailure: true
  });
  
  // 临时替换 checkGate
  const originalCheckGate = pipeline.checkGate.bind(pipeline);
  pipeline.checkGate = async (gate, output) => {
    if (customCheckers[gate]) {
      return { passed: customCheckers[gate](), gate };
    }
    return originalCheckGate(gate, output);
  };
  
  const result = await pipeline.execute({});
  assert(result.passed === false, '应失败');
  assert(result.failedAt === 'failing_stage', '应在 failing_stage 停止');
  assert(result.stages.length === 1, '应只执行了一个阶段');
  
  console.log('✓ test_stop_on_gate_failure');
}

// 运行所有测试
async function runTests() {
  await test_stages();
  await test_gate_checkers();
  await test_stage_execution();
  await test_full_pipeline();
  await test_stop_on_gate_failure();
  console.log('\n✅ PipelineExecutor 测试通过');
}

runTests().catch(console.error);
```

---

## 五、集成点

### supervisor-agent.js 扩展（不修改现有方法）

```javascript
// 在 constructor 中添加
this.executionMode = config.executionMode || 'closed_loop';

// 新增方法（不修改 handleTask）
async handleTask_v2(taskMessage, context = {}) {
  if (this.executionMode === 'pipeline') {
    return this.handleTask_pipeline(taskMessage, context);
  }
  // 默认使用原有 6 步闭环
  return this.handleTask(taskMessage, context);
}

// 新增方法
async handleTask_pipeline(taskMessage, context = {}) {
  this.logger.info('\n🎯 Supervisor Agent 启动 (Pipeline 模式)');
  this.logger.info(`📝 任务: ${taskMessage}\n`);

  const { PipelineExecutor } = require('./pipeline-executor');
  
  const pipeline = new PipelineExecutor({
    agentExecutor: this.agentExecutor,
    knowledgeBase: this.knowledgeBase,
    stopOnGateFailure: this.config.stopOnGateFailure !== false
  });

  const result = await pipeline.execute({
    task: taskMessage,
    ...context
  });

  return {
    success: result.passed,
    mode: 'pipeline',
    stages: result.stages,
    failedAt: result.failedAt,
    totalTime: result.totalTime
  };
}
```

---

## 六、配置项

### config.yml 扩展

```yaml
execution:
  # 执行模式: closed_loop (默认) | pipeline
  mode: closed_loop
  
  pipeline:
    stopOnGateFailure: true
    stages:
      - reconnaissance
      - foundation
      - build
      - assembly
```

---

## 七、验收标准

| 检查项 | 验证方法 | 预期结果 |
|--------|----------|----------|
| 模块独立加载 | `node -e "require('./src/pipeline-executor')"` | 无报错 |
| 测试全部通过 | `node test/test-pipeline-executor.js` | 全部 ✓ |
| 不影响现有测试 | `npm test` | 全部通过（不退化） |
| 新增测试 | `node test/test-pipeline-executor.js` | 5个测试通过 |
| 配置兼容 | 启动 CLI | 无报错 |

---

## 八、回滚策略

```bash
# 删除新增文件即可
rm src/pipeline-executor.js
rm test/test-pipeline-executor.js
git checkout src/supervisor-agent.js
git checkout .flowharness/config.yml
```
