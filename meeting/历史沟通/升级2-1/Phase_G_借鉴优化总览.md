# Phase G: ai-website-cloner 模式借鉴优化总览

**制定日期**: 2026-04-12
**前置条件**: Phase A-F 全部完成
**目标**: 在零破坏前提下，借鉴 ai-website-cloner 的优秀设计模式
**预计时间**: 3-4 天

---

## 核心原则

1. **零破坏**: 所有新功能增量添加，不修改现有逻辑
2. **配置开关**: 所有新功能默认禁用，需要显式启用
3. **可回滚**: 删除新增文件即可完全恢复
4. **可降级**: 新功能失败自动降级到原有逻辑

---

## 借鉴内容来源

| 借鉴点 | ai-website-cloner 设计 | Flow Harness 应用 |
|--------|------------------------|------------------|
| **并行执行** | Worktree 并行构建 | ParallelExecutor |
| **流水线门控** | 5阶段质量门控 | PipelineExecutor |
| **Spec 沉淀** | 组件 spec 文件 | KnowledgeBase 扩展 |
| **外部技能** | `/clone-website` 技能 | 外部技能注册 |

---

## 升级步骤拆解

| Step | 名称 | 核心产出 | 独立性 | 预计时间 |
|------|------|----------|--------|----------|
| **G1** | ParallelExecutor 并行执行 | `src/parallel-executor.js` | ✅ 完全独立 | 4h |
| **G2** | PipelineExecutor 流水线门控 | `src/pipeline-executor.js` | ✅ 完全独立 | 4h |
| **G3** | KnowledgeBase Spec 扩展 | `knowledge-base.js` 扩展 | ⚠️ 扩展现有文件 | 2h |
| **G4** | 外部技能注册 | `registry.json` 配置 | ✅ 完全独立 | 1h |

---

## 并行执行矩阵

```
┌─────────────────────────────────────────────────────────────┐
│                    Phase G 并行执行                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌─────────────────┐     ┌─────────────────┐              │
│   │    Step G1      │     │    Step G2      │  ← Wave 1    │
│   │ ParallelExecutor│     │ PipelineExecutor│    (并行)    │
│   │    (端 A)       │     │    (端 B)       │              │
│   └─────────────────┘     └─────────────────┘              │
│                                                             │
│   ┌─────────────────┐     ┌─────────────────┐              │
│   │    Step G3      │     │    Step G4      │  ← Wave 2    │
│   │ Spec 扩展       │     │ 外部技能注册    │    (并行)    │
│   │    (端 A)       │     │    (端 B)       │              │
│   └─────────────────┘     └─────────────────┘              │
│                                                             │
└─────────────────────────────────────────────────────────────┘

Wave 1 完成后 → 集成测试
Wave 2 完成后 → 全量回归测试
```

---

## 文件变更清单

### 新增文件（3个）

| 文件 | 行数估算 | Step |
|------|----------|------|
| `src/parallel-executor.js` | ~150行 | G1 |
| `src/pipeline-executor.js` | ~200行 | G2 |
| `test/test-parallel-executor.js` | ~100行 | G1 |
| `test/test-pipeline-executor.js` | ~100行 | G2 |
| `test/test-knowledge-spec.js` | ~80行 | G3 |

### 修改文件（4个）

| 文件 | 修改类型 | Step |
|------|----------|------|
| `src/knowledge-base.js` | 扩展方法 | G3 |
| `src/supervisor-agent.js` | 扩展方法 | G1, G2 |
| `src/cli.js` | 扩展命令 | G4 |
| `.flowharness/config.yml` | 扩展配置 | G1, G2, G3 |

---

## 配置开关设计

```yaml
# .flowharness/config.yml 新增配置

# 并行执行配置
execution:
  mode: closed_loop  # closed_loop | pipeline
  parallel:
    enabled: false    # 默认禁用
    maxWorkers: 4
    mergeStrategy: auto  # auto | manual | abort

# Spec 文件配置
knowledge:
  specs:
    enabled: false    # 默认禁用
    outputDir: .flowharness/knowledge/specs
    maxAge: 30  # 天

# 外部技能配置
external:
  skills:
    - id: clone-website
      enabled: false
```

---

## 验收标准

| 检查项 | 验证方法 | 预期结果 |
|--------|----------|----------|
| 零破坏 | `npm test` | 全部通过（62个测试） |
| 新增测试 | `npm test` | 65个测试全部通过 |
| 配置兼容 | 启动 CLI | 无报错 |
| 向后兼容 | 原有命令 | 行为不变 |
| 降级机制 | 触发失败 | 自动回退 |

---

## 风险控制

### 回滚策略

```bash
# 完全回滚
rm src/parallel-executor.js
rm src/pipeline-executor.js
rm test/test-parallel-executor.js
rm test/test-pipeline-executor.js
rm test/test-knowledge-spec.js
git checkout src/knowledge-base.js
git checkout src/supervisor-agent.js
git checkout src/cli.js
git checkout .flowharness/config.yml
```

### 降级机制

每个新功能都有降级逻辑：
- ParallelExecutor 失败 → 回退到 step4_execute
- PipelineExecutor 失败 → 回退到 handleTask
- Spec 写入失败 → 仅记录日志，不阻塞主流程

---

## 后续步骤

Phase G 完成后：
1. ✅ Flow Harness 具备可选的并行执行能力
2. ✅ Flow Harness 具备可选的流水线模式
3. ✅ KnowledgeBase 支持 Spec 文件沉淀
4. ✅ 用户可选择使用 ai-website-cloner 作为外部技能
