/**
 * PipelineExecutor - 流水线执行器
 *
 * 借鉴 ai-website-cloner 的多阶段流水线质量门控设计
 */

const path = require('path');

// 动态计算项目根目录，避免硬编码相对路径
const PROJECT_ROOT = path.resolve(__dirname, '..');

/**
 * 预定义流水线阶段（借鉴 ai-website-cloner）
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
 * 注意: build/typecheck/tests 门控仅在有对应 npm 脚本时执行，否则自动通过
 */
const GATE_CHECKERS = {
  'info_complete': async (output) => {
    return output != null && Object.keys(output).length > 0;
  },
  'resources_available': async (_output) => {
    return true;
  },
  'build_pass': async (_output) => {
    const { execSync } = require('child_process');
    try {
      const pkgPath = path.join(PROJECT_ROOT, 'package.json');
      const pkg = require(pkgPath);
      if (!pkg.scripts || !pkg.scripts.build) return true;
      execSync('npm run build', { stdio: 'pipe', cwd: PROJECT_ROOT });
      return true;
    } catch {
      return false;
    }
  },
  'typecheck_pass': async (_output) => {
    const { execSync } = require('child_process');
    const fs = require('fs');
    const tsconfigPath = path.join(PROJECT_ROOT, 'tsconfig.json');
    if (!fs.existsSync(tsconfigPath)) {
      // 非 TS 项目，无需类型检查
      return true;
    }
    try {
      execSync('npx tsc --noEmit', { stdio: 'pipe', timeout: 10000, cwd: PROJECT_ROOT });
      return true;
    } catch {
      // tsconfig 存在但 tsc 失败，视为门控不通过
      return false;
    }
  },
  'tests_pass': async (_output) => {
    const { execSync } = require('child_process');
    try {
      const pkgPath = path.join(PROJECT_ROOT, 'package.json');
      const pkg = require(pkgPath);
      if (!pkg.scripts || !pkg.scripts.test) return true;
      execSync('npm test', { stdio: 'pipe', timeout: 60000, cwd: PROJECT_ROOT });
      return true;
    } catch {
      return false;
    }
  },
  'merge_success': async (output) => {
    return output != null && output.merged === true;
  },
  'final_build_pass': async (output) => {
    return GATE_CHECKERS['build_pass'](output);
  }
};

class PipelineExecutor {
  constructor(config = {}) {
    this.stages = config.stages || Object.values(PIPELINE_STAGES);
    this.stopOnGateFailure = config.stopOnGateFailure !== false;
    this.enableParallelBuild = config.enableParallelBuild !== false;

    // 引用外部组件（不创建新实例）
    this.agentExecutor = config.agentExecutor || null;
    this.knowledgeBase = config.knowledgeBase || null;
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

    for (const stage of this.stages) {
      const stageResult = await this.executeStage(stage, context);
      results.stages.push(stageResult);
      results.totalTime += stageResult.duration;

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
   * @param {Object} stage - 阶段定义
   * @param {Object} context - 执行上下文
   * @returns {Promise<Object>} 阶段执行结果
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

    try {
      result.output = await this.runStageTasks(stage, context);
    } catch (error) {
      result.error = error.message;
    }

    const gates = stage.gates || [];
    for (const gate of gates) {
      result.gates[gate] = await this.checkGate(gate, result.output);
    }

    result.passed = Object.values(result.gates).every(g => g.passed);
    result.duration = Date.now() - startTime;

    return result;
  }

  /**
   * 检查门控
   * @param {string} gateName - 门控名称
   * @param {*} output - 阶段输出
   * @returns {Promise<Object>} 门控检查结果
   */
  async checkGate(gateName, output) {
    const checker = GATE_CHECKERS[gateName];
    if (!checker) {
      return { passed: true, gate: gateName, reason: 'Unknown gate, auto-pass' };
    }

    try {
      const passed = await checker(output);
      return { passed: !!passed, gate: gateName };
    } catch (error) {
      return { passed: false, gate: gateName, error: error.message };
    }
  }

  /**
   * 运行阶段任务（可被子类覆盖扩展）
   * @param {Object} stage - 阶段定义
   * @param {Object} context - 执行上下文
   * @returns {Promise<Object>} 阶段产出
   */
  async runStageTasks(stage, context) {
    // 基础实现返回空对象
    // 子类或调用方可通过 stage.execute 注入自定义逻辑
    if (typeof stage.execute === 'function') {
      return stage.execute(context);
    }
    return {};
  }
}

module.exports = { PipelineExecutor, PIPELINE_STAGES, GATE_CHECKERS };
