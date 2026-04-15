# Step G3: KnowledgeBase Spec 扩展

**所属阶段**: Phase G - 借鉴优化
**预计时间**: 1-2 小时
**依赖**: 无（扩展现有模块）
**产出文件**: `src/knowledge-base.js` 扩展, `test/test-knowledge-spec.js`

---

## 一、设计目标

借鉴 ai-website-cloner 的组件 spec 文件设计，扩展 KnowledgeBase 支持结构化规范沉淀。

### 与现有 patterns 的区别

| 维度 | patterns.json (现有) | spec 文件 (新增) |
|------|---------------------|------------------|
| **格式** | JSON 内嵌 | 独立 spec 文件 |
| **内容** | 统计数据 | 详细规范定义 |
| **可读性** | 机器可读 | 人机双可读 |
| **复用性** | 低 | 高（有复用性评分） |

---

## 二、实现边界

### 输入

```javascript
// writeSpec 参数
{
  specName: string,      // Spec 名称
  spec: {                // Spec 内容
    inputs: Object,       // 输入定义
    outputs: Object,      // 输出定义
    dependencies: string[],  // 依赖列表
    examples: Object[],    // 示例
    acceptanceCriteria: string[]  // 验收标准
  },
  options: {              // 可选配置
    taskType: string,     // 任务类型
    successRate: number   // 成功率
  }
}
```

### 输出

```javascript
// writeSpec 返回
{
  path: string,           // Spec 文件路径
  name: string,           // Spec 名称
  reusability: number     // 可复用性评分 (0-1)
}

// readSpec 返回
{
  name: string,
  version: string,
  createdAt: string,
  spec: Object,
  metadata: {
    taskType: string,
    successRate: number,
    reusability: number
  }
}

// listSpecs 返回
[{
  name: string,
  taskType: string,
  reusability: number,
  createdAt: string
}]
```

### 不修改的文件

- `src/knowledge-base.js` 的现有方法 - 保持不变
- `.flowharness/knowledge/patterns.json` - 格式不变
- `.flowharness/knowledge/metrics.json` - 格式不变

---

## 三、实现规范

### 文件扩展: `src/knowledge-base.js`

```javascript
// 在文件末尾添加（不修改现有方法）

/**
 * 扩展：Spec 文件支持
 * 借鉴 ai-website-cloner 的组件 spec 设计
 */

/**
 * 写入 Spec 文件
 * @param {string} specName - Spec 名称
 * @param {Object} spec - Spec 内容
 * @param {Object} options - 可选配置
 * @returns {Object} Spec 文件路径和可复用性评分
 */
writeSpec(specName, spec, options = {}) {
  const specDir = path.join(this.knowledgePath, 'specs');
  
  // 确保目录存在
  if (!fs.existsSync(specDir)) {
    fs.mkdirSync(specDir, { recursive: true });
  }

  const specPath = path.join(specDir, `${specName}.json`);
  
  // 计算可复用性评分
  const reusability = this.calculateReusability(spec);
  
  const specData = {
    name: specName,
    version: '1.0',
    createdAt: new Date().toISOString(),
    spec: spec,
    metadata: {
      taskType: options.taskType || 'unknown',
      successRate: options.successRate || null,
      reusability: reusability
    }
  };

  fs.writeFileSync(specPath, JSON.stringify(specData, null, 2), 'utf8');
  
  return {
    path: specPath,
    name: specName,
    reusability: reusability
  };
}

/**
 * 读取 Spec 文件
 * @param {string} specName - Spec 名称
 * @returns {Object|null} Spec 内容
 */
readSpec(specName) {
  const specPath = path.join(this.knowledgePath, 'specs', `${specName}.json`);
  
  if (!fs.existsSync(specPath)) {
    return null;
  }
  
  return JSON.parse(fs.readFileSync(specPath, 'utf8'));
}

/**
 * 列出所有 Spec
 * @returns {Array} Spec 列表
 */
listSpecs() {
  const specDir = path.join(this.knowledgePath, 'specs');
  
  if (!fs.existsSync(specDir)) {
    return [];
  }
  
  return fs.readdirSync(specDir)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const spec = JSON.parse(fs.readFileSync(path.join(specDir, f), 'utf8'));
      return {
        name: spec.name,
        taskType: spec.metadata?.taskType,
        reusability: spec.metadata?.reusability,
        createdAt: spec.createdAt
      };
    });
}

/**
 * 删除 Spec 文件
 * @param {string} specName - Spec 名称
 * @returns {boolean} 是否成功删除
 */
deleteSpec(specName) {
  const specPath = path.join(this.knowledgePath, 'specs', `${specName}.json`);
  
  if (fs.existsSync(specPath)) {
    fs.unlinkSync(specPath);
    return true;
  }
  
  return false;
}

/**
 * 计算可复用性评分
 * @param {Object} spec - Spec 内容
 * @returns {number} 0-1 的可复用性评分
 */
calculateReusability(spec) {
  let score = 0;
  
  // 有明确的输入输出定义 +0.3
  if (spec.inputs && Object.keys(spec.inputs).length > 0) score += 0.15;
  if (spec.outputs && Object.keys(spec.outputs).length > 0) score += 0.15;
  
  // 有依赖说明 +0.2
  if (spec.dependencies && spec.dependencies.length > 0) score += 0.2;
  
  // 有示例 +0.2
  if (spec.examples && spec.examples.length > 0) score += 0.2;
  
  // 有验收标准 +0.3
  if (spec.acceptanceCriteria && spec.acceptanceCriteria.length > 0) score += 0.3;
  
  return Math.min(1, Math.round(score * 100) / 100);
}

/**
 * 导出 Spec 数据（扩展现有 exportData）
 * @param {Object} options - 导出选项
 * @returns {Object} 导出数据
 */
exportSpecs(options = {}) {
  const specs = this.listSpecs();
  const minReusability = options.minReusability || 0.5;
  
  return specs
    .filter(s => s.reusability >= minReusability)
    .map(s => this.readSpec(s.name));
}
```

---

## 四、测试用例

### 文件: `test/test-knowledge-spec.js`

```javascript
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const KnowledgeBase = require('../src/knowledge-base');

// 测试 1: 方法存在
async function test_methods_exist() {
  const kb = new KnowledgeBase();
  kb.load();
  
  assert(typeof kb.writeSpec === 'function', 'writeSpec 应存在');
  assert(typeof kb.readSpec === 'function', 'readSpec 应存在');
  assert(typeof kb.listSpecs === 'function', 'listSpecs 应存在');
  assert(typeof kb.deleteSpec === 'function', 'deleteSpec 应存在');
  assert(typeof kb.calculateReusability === 'function', 'calculateReusability 应存在');
  
  console.log('✓ test_methods_exist');
}

// 测试 2: 写入 Spec
async function test_write_spec() {
  const kb = new KnowledgeBase('.flowharness/knowledge');
  kb.load();
  
  const result = kb.writeSpec('test-spec', {
    inputs: { url: 'string' },
    outputs: { html: 'string' },
    dependencies: ['axios'],
    examples: [{ input: { url: 'http://example.com' }, output: { html: '<html>...' } }],
    acceptanceCriteria: ['返回有效的 HTML']
  });
  
  assert(result.path, '应返回路径');
  assert(result.name === 'test-spec', '名称应匹配');
  assert(typeof result.reusability === 'number', '应有可复用性评分');
  
  // 清理
  kb.deleteSpec('test-spec');
  console.log('✓ test_write_spec');
}

// 测试 3: 读取 Spec
async function test_read_spec() {
  const kb = new KnowledgeBase('.flowharness/knowledge');
  
  // 先写入
  kb.writeSpec('test-read', { inputs: { a: 'string' } });
  
  // 再读取
  const spec = kb.readSpec('test-read');
  assert(spec !== null, '应能读取');
  assert(spec.name === 'test-read', '名称应匹配');
  assert(spec.spec.inputs.a === 'string', '内容应正确');
  
  // 清理
  kb.deleteSpec('test-read');
  console.log('✓ test_read_spec');
}

// 测试 4: 列出 Specs
async function test_list_specs() {
  const kb = new KnowledgeBase('.flowharness/knowledge');
  
  // 写入多个
  kb.writeSpec('spec-1', { inputs: {} });
  kb.writeSpec('spec-2', { inputs: {}, outputs: {} });
  
  const list = kb.listSpecs();
  assert(Array.isArray(list), '应返回数组');
  assert(list.length >= 2, '应至少有 2 个 spec');
  
  // 清理
  kb.deleteSpec('spec-1');
  kb.deleteSpec('spec-2');
  console.log('✓ test_list_specs');
}

// 测试 5: 可复用性计算
async function test_reusability() {
  const kb = new KnowledgeBase();
  
  // 完整 spec
  const fullSpec = {
    inputs: { a: 'string' },
    outputs: { b: 'string' },
    dependencies: ['lodash'],
    examples: [{ input: { a: 'x' }, output: { b: 'y' } }],
    acceptanceCriteria: ['正确转换']
  };
  const fullScore = kb.calculateReusability(fullSpec);
  assert(fullScore === 1.0, '完整 spec 应得 1.0 分');
  
  // 空 spec
  const emptyScore = kb.calculateReusability({});
  assert(emptyScore === 0, '空 spec 应得 0 分');
  
  // 部分 spec
  const partialScore = kb.calculateReusability({ inputs: { a: 'string' } });
  assert(partialScore === 0.15, '仅有 inputs 应得 0.15 分');
  
  console.log('✓ test_reusability');
}

// 测试 6: 向后兼容
async function test_backward_compatibility() {
  const kb = new KnowledgeBase('.flowharness/knowledge');
  
  // 验证原有方法仍然可用
  assert(typeof kb.load === 'function', 'load 应可用');
  assert(typeof kb.save === 'function', 'save 应可用');
  assert(typeof kb.recordExecution === 'function', 'recordExecution 应可用');
  assert(typeof kb.exportData === 'function', 'exportData 应可用');
  assert(typeof kb.mergeData === 'function', 'mergeData 应可用');
  assert(typeof kb.getOptimizations === 'function', 'getOptimizations 应可用');
  
  console.log('✓ test_backward_compatibility');
}

// 运行所有测试
async function runTests() {
  await test_methods_exist();
  await test_write_spec();
  await test_read_spec();
  await test_list_specs();
  await test_reusability();
  await test_backward_compatibility();
  console.log('\n✅ KnowledgeBase Spec 扩展测试通过');
}

runTests().catch(console.error);
```

---

## 五、集成点

### 在 reviewLoop 中使用

```javascript
// step6_review 中可选写入 Spec
if (this.knowledgeBase.writeSpec && review.score >= 8) {
  const specResult = this.knowledgeBase.writeSpec(
    `task-${analysis.taskType}-${Date.now()}`,
    {
      inputs: { task: 'string' },
      outputs: { result: 'object' },
      dependencies: [],
      acceptanceCriteria: analysis.acceptanceCriteria
    },
    { taskType: analysis.taskType, successRate: inspection.successRate }
  );
}
```

---

## 六、配置项

### config.yml 扩展

```yaml
knowledge:
  specs:
    enabled: false           # 默认禁用
    outputDir: .flowharness/knowledge/specs
    autoCleanup: true        # 自动清理低质量 spec
    maxAge: 30              # 保留天数
    minReusability: 0.5     # 最低可复用性阈值
```

---

## 七、验收标准

| 检查项 | 验证方法 | 预期结果 |
|--------|----------|----------|
| 方法存在 | 检查 prototype | 6个新方法存在 |
| 测试全部通过 | `node test/test-knowledge-spec.js` | 全部 ✓ |
| 不影响现有测试 | `npm test` | 全部通过（不退化） |
| 向后兼容 | 原有方法调用 | 行为不变 |
| 配置兼容 | 启动 CLI | 无报错 |

---

## 八、回滚策略

```bash
# 恢复 knowledge-base.js
git checkout src/knowledge-base.js
rm test/test-knowledge-spec.js
rm -rf .flowharness/knowledge/specs
git checkout .flowharness/config.yml
```
