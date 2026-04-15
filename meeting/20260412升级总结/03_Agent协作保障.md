<!--
ARCHIVE meeting/20260412升级总结: 默认不读。现行 → ../20260414升级总结/ 与 ../../AGENTS.md。
调取：仅当有人显式写出本目录下具体文件路径时再打开。82cb5d5 后本目录不按活跃文档维护。
-->

> **已封存**：本文件为历史快照，日常不必阅读。现行口径 → `meeting/20260414升级总结/` 与 `AGENTS.md`。需要时请 **明确写出要打开的文件路径** 后再查阅。说明见 [`_封存说明.md`](./_封存说明.md)。

# 主题三：Agent 协作保障

---

## 多智能体协作的三大风险

```
风险1：信息不一致
  Agent A 和 Agent B 对同一任务理解不同
  → 各自做各自的，结果冲突

风险2：协调失效
  Agent 之间互相等待，或重复干同一件事
  → 死锁 / 重复浪费

风险3：质量无保障
  Agent 输出没人验证
  → 错误在链路里传播，越传越偏
```

---

## 六层保障机制

| 层级 | 机制 | 模块 | 状态 |
|---|---|---|---|
| 信息层 | 共享上下文 | KnowledgeBase | ✅ 已实现 |
| 决策层 | 商议强制共识 | DeliberationEngine | ✅ 已实现 |
| 通信层 | 强制规则链路 | CommRouter | ✅ 已实现 |
| 执行层 | 状态隔离防冲突 | **Task State Machine** | ❌ 缺失 |
| 质检层 | 阶段门禁 | Inspector Agent (L4-5) | ⚠️ 架构有，需完善 |
| 复盘层 | CEO整体验收 | ReviewLoop (L6) | ⚠️ 架构有，需完善 |

---

## Task State Machine（最缺的一环）

### 状态流转
```
PENDING
  → DELIBERATING   （商议中，多Agent达成共识）
  → PLANNING        （Plan Agent设计方案）
  → EXECUTING       （General Agent执行）
  → INSPECTING      （Inspector检查）
  → REVIEWING       （CEO复盘）
  → DONE ✅ / FAILED ❌
```

### 核心规则
```
1. Agent只能操作自己负责的状态阶段
   Plan Agent  → 只能操作 PLANNING 状态
   General     → 只能操作 EXECUTING 状态
   Inspector   → 只能操作 INSPECTING 状态

2. 状态转换需要 CEO 批准
   PLANNING → EXECUTING 需要 CEO 放行

3. 防并发冲突
   同一任务同一时刻只有一个 Agent 在操作

4. 状态可回滚
   Inspector 打回 → 回到 EXECUTING
   CEO 打回       → 回到 PLANNING
```

### 解决的问题
```
Plan Agent 在设计方案，General Agent 不能同时写代码  ← 并发冲突
Inspector 打回后，General 知道要重做哪部分            ← 状态清晰
死锁检测：某状态停留超过阈值，自动告警               ← 可观测
```

---

## Agent 看板

### 为什么必要
```
没有看板：
  多个 Agent 在跑，不知道谁在干什么
  出了问题不知道卡在哪里
  调试靠翻日志，效率极低
```

### 终端版（现在做）
```
[10:23:01] CEO           → 分配任务 → 数字VP
[10:23:02] 数字VP         → 转发 → Plan Agent
[10:23:02] Plan Agent    → [🔵 PLANNING] 开始规划...
[10:23:08] Research      → [🔵 EXECUTING] 搜索: "React最佳实践"
[10:23:18] Plan Agent    → [✅ DONE] 规划完成，方案已写入KB
[10:23:18] General       → [🔵 EXECUTING] 开始执行...
[10:23:45] Inspector     → [🔵 INSPECTING] 质检中...
[10:23:50] Inspector     → [❌ REJECT] 发现问题：缺少错误处理
[10:23:50] General       → [🔄 RETRY] 重新执行...
```

### Web版（后做）
```
左侧：Agent组织架构图（树形，实时状态颜色）
中间：每个Agent当前状态 + 正在执行的任务 + 耗时
右侧：任务流转时间线
底部：Token用量 / 成本实时统计

告警：
  ⚠️  Agent超时（>60s），是否需要介入？
  ❌  Inspector打回，General需要重做
  🔄  商议进行第N轮，尚未达成共识
  💰  成本超过预算告警
```

---

## Task State Machine + 看板的关系

```
Task State Machine   ←  管理任务状态（后台）
        ↓
    Agent 看板        ←  可视化展示状态（前台）
        ↓
  开发者 / 运营       ←  实时了解，及时介入
```

两者配套，State Machine是数据，看板是展示。
