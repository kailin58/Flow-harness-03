# 主题三：Agent 协作保障

---

## 全局前置沟通规则（统一口径）

- 任何任务下发前，最少完成 `2` 轮目标沟通（目标、范围、完成标准三项对齐）。
- 任务理解必须配图（流程图/结构图/决策图至少一种）后再进入执行。
- 本规则当前作为流程与文档规范执行，系统侧“上线强制门禁”暂不启用。
- 治理模型统一采用“规则写死、参数可配、边界写死”：
  - 写死规则：流程门禁、接管链路、审计要求、发布与回滚约束。
  - 可配置参数：SLA、复评阈值、紧急策略、试点范围等运营参数。
  - 边界写死：仅允许边界内收紧，不允许突破平台红线；配置变更必须版本化发布并写审计。
- 接口原则：所有接口不做占位；设计可做全局通用与扩展增强，但接口定义本身必须可直接落地，不保留仅供后补的占位接口。
- 全局配置原则：凡可由配置承载的真实业务值，一律配置化管理，能配置就不写死。
- 落地口径：正文默认只固化字段名、规则、约束、示例值与生效顺序；真实实值通过 `platform -> company -> department -> user` 配置链注入并审计。

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

### 状态边界条件（超时 / 回退 / 死锁）

> **补充日期**：2026-04-14
> **性质**：补全缺口——在现有状态流转骨架基础上，为每个状态补齐边界条件参数

每个状态定义三个字段：

| 字段 | 含义 |
|------|------|
| `timeout_sec` | 该状态允许的最长停留时间（秒） |
| `on_timeout` | 超时后的处理动作：`retry` / `escalate` / `fail` |
| `rollback_to` | 可回退到的上一个状态（终态不可回退） |

**各状态配置：**

| 状态 | timeout_sec | on_timeout | rollback_to |
|------|-------------|------------|-------------|
| PENDING | 120 | fail | — |
| DELIBERATING | 300 | escalate | PENDING |
| PLANNING | 600 | retry（1次）| DELIBERATING |
| EXECUTING | 3600 | escalate | PLANNING |
| INSPECTING | 300 | retry（2次）| EXECUTING |
| REVIEWING | 600 | escalate | INSPECTING |
| DONE / FAILED | — | — | 终态，不可回退 |

**on_timeout 动作说明：**
```
retry     → 在当前状态内重试（按配置次数上限，超限后升级为 escalate）
escalate  → 触发 Human-in-the-Loop 流程（见下方）
fail      → 直接将任务标记为 FAILED，异步写 S3 审计记录（不阻塞状态转换本身）
```

---

### Human-in-the-Loop（escalate 的后续）

> **完整协议见**：[06_HumanInTheLoop对话判定协议.md](./06_HumanInTheLoop对话判定协议.md)
> **补充日期**：2026-04-14 | **性质**：缺口5补全，替换原骨架

`escalate` 不是简单报错，而是进入一个**可变轮次的对话判定流程**，意图清晰后再执行：

```
触发 escalate（5路来源）
  │  A. L4 on_timeout=escalate
  │  B. L8 打回次数 ≥ N（默认3次）
  │  C. L10 审批等待超时
  │  D. 工具调用风险等级=极高
  │  E. 系统置信度低于阈值
  │
  ├─ 1. 任务状态冻结
  ├─ 2. 构造 escalation 报文（5字段）→ 异步写 S3 审计库（后置记录，不阻塞步骤3）
  ├─ 3. 发送通知（P1 看板 → P2 Webhook → P3 邮件）
  └─ 4. 进入对话判定阶段（意图漏斗协议）
        ├─ 每轮提取意图 delta → 更新意图累加器（O(1) 上下文）
        ├─ 意图清晰 → 人工确认 → 执行
        ├─ 达到 max_rounds → FORCE_CONFIRMING（强制 Y/N）
        └─ 会话超时 → on_timeout_action 自动执行（最保守选项）

人工可以：覆盖 L8 决策 / 修改任务状态 / 终止任务 / 强制降级
人工不可以：绕过 S3 审计写入 / 直接修改 L11 进化结果
```

---

### 死锁检测规则

**判定条件（三个条件同时满足）：**
```
① 当前处于非终态（非 DONE / FAILED）
② 停留时间超过 timeout_sec × 3
③ 期间无任何状态日志写入（无活动迹象）
```

**触发后动作（强制执行，不可跳过）：**
```
死锁判定成立
  │
  ├─ 异步写 S3 审计记录（标记为 DEADLOCK 事件，fire-and-forget，不阻塞后续动作）
  └─ 发送 escalate 通知 → 进入 Human-in-the-Loop 流程
```

**设计原则**：死锁检测独立于正常 timeout 机制运行，两者互不干扰；
正常 timeout 处理业务级超时，死锁检测处理系统级卡死。

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
