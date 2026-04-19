# Human-in-the-Loop 对话判定协议

**补充日期**：2026-04-14
**性质**：缺口5补全——定义人工介入的完整协议，含对话判定、上下文处理、执行触发
**前置文档**：[03_Agent协作保障.md](./03_Agent协作保障.md)（escalate 骨架）

---

> 📌 架构速查 → [2M+23L 完整层级（含子层）](./00_升级总结总览.md#2m--23l-架构速查v230-权威版)
> `layer_id` 永久稳定；`Lxx` 仅为显示编号。核心治理链路（不可绕过）：`security.permissions`(L6) / `security.policy`(L14) / `quality.gate`(L18) / `release.publish`(L22)

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

## 一、协议总览

### 为什么需要"对话判定"而不是直接给选项

简单的"给3个按钮让人工选"在以下场景失效：
```
场景A：人工看到任务状态后，需要追问"这个任务已经完成了多少？"
场景B：人工想要一个当前选项之外的处理方式
场景C：人工对触发原因有疑问，需要先理解再决定
场景D：多个系统同时 escalate，人工需要合并处理
```

因此，escalate 之后不是直接执行，而是进入一个**可变轮次的对话判定阶段**，直到意图清晰后再执行。

### 核心难题：无限轮次 × 上下文有限

朴素做法是把每轮原始对话堆进系统上下文：
```
Round 1：  200 tokens
Round 5：  1000 tokens
Round 20： 4000 tokens
Round N：  O(N) → 溢出
```

**解法：意图增量提取 + 结构化累加器**

每轮对话不保留原文，只提取结构化的"意图 delta"并更新一个累加器。
系统上下文永远是：**触发快照（固定）+ 意图累加器（有界）+ 最后1轮原文（固定）= O(1)**

---

## 二、触发条件（5路来源）

任一满足即触发，进入本协议：

| 触发源 | 条件 | 来源层 |
|--------|------|--------|
| A | `orchestration.collab`（L13）状态机 `on_timeout = escalate` | L13 orchestration.collab 协作编排层 |
| B | `quality.gate`（L18）质量门禁打回次数 ≥ N（N 可配置，默认 3） | L18 quality.gate 质量门禁层 |
| C | `release.publish`（L22）版本发布层审批等待超时 | L22 release.publish 版本发布层 |
| D | 工具调用风险等级 = **极高** | Tool Port / L14 security.policy 安全策略层 |
| E | 系统检测到置信度低于阈值（可配置，默认 0.4） | L16 quality.inspector Inspector 层 |

> **注**：触发条件 C 和 D 在原始 escalate 骨架设计时未覆盖（L22/Tool Port 为后续新增），本协议统一收口。

---

## 三、Escalation 标准报文（5字段）

触发时，由系统构造 escalation 报文，写入 **S3 审计库**，并作为对话的固定上下文锚点：

```json
{
  "escalation_id":     "ESC-20260414-0023",
  "context_snapshot":  "任务 T-889 在 EXECUTING 状态停留 3600s 超时，General Agent 执行第2轮重试失败。当前已完成子任务：[DB设计, API设计]，未完成：[前端实现, 测试]。触发源：orchestration.collab（L13）on_timeout=escalate",
  "decision_options": [
    {"id": 1, "label": "回退到 PLANNING，重新规划方案"},
    {"id": 2, "label": "强制继续执行（重置超时计时）"},
    {"id": 3, "label": "终止任务，标记 FAILED"},
    {"id": 4, "label": "降级模型重试（切换为更稳定模型）"}
  ],
  "timeout_sec":       1800,
  "on_timeout_action": "选项1（最保守：回退到 PLANNING）"
}
```

**字段说明：**

| 字段 | 要求 | 备注 |
|------|------|------|
| `escalation_id` | 全局唯一，格式：ESC-{日期}-{序列} | 用于追踪和审计 |
| `context_snapshot` | 来源：S1 上下文库读取后压缩；写入：S3 审计库 | 最长 500 tokens |
| `decision_options` | 最少 2 个，最多 5 个 | 系统预生成，人工可追加新选项 |
| `timeout_sec` | 人工响应总超时（默认 1800s = 30 分钟） | 超时触发 on_timeout_action |
| `on_timeout_action` | 默认：decision_options 中最保守的选项 | 必须是现有选项之一 |

---

## 四、对话判定阶段：意图漏斗协议

### 4.1 阶段状态机

```
ESCALATED
    │
    ▼
PRESENTING         ← 向人工展示 escalation 报文
    │
    ▼
CLARIFYING  ←──────────────────┐
    │                          │
    ├─ 提取本轮意图 delta        │
    ├─ 更新意图累加器            │
    ├─ 评估意图清晰度            │
    │   ├─ 不清晰 ───────────────┘  （最多 max_rounds 轮）
    │   └─ 清晰 ──────────────────→ CONFIRMING
    │
    ├─ 达到 max_rounds ────────→ FORCE_CONFIRMING
    │
CONFIRMING
    │  人工确认 → EXECUTING
    └─ 人工修正 → 回到 CLARIFYING（重置 round_count）
        （修正后再次达到 max_rounds → FORCE_CONFIRMING）

FORCE_CONFIRMING
    │  人工 Y → EXECUTING
    └─ 人工 N（给一次明确输入）→ EXECUTING
        无响应 → on_timeout_action → EXECUTING

EXECUTING          ← 执行确认的意图
    │
    ▼
CLOSED（写 S3 审计闭环记录）
```

### 4.2 意图累加器（Intent Accumulator）

这是解决长上下文问题的核心数据结构。

```json
{
  "round_count": 3,
  "action": {
    "type": "rollback",
    "target_state": "PLANNING",
    "clear": true
  },
  "constraints": [
    {"key": "preserve_s2_artifacts", "value": true, "clear": true},
    {"key": "use_model", "value": "claude-3-5-sonnet", "clear": true}
  ],
  "open_questions": [],
  "compressed_history": "Round 1：人工初始倾向终止任务。Round 2：查看 S2 制品库发现已完成 DB/API 设计后改为回退。Round 3：明确要求保留制品并切换模型重试。",
  "confidence": 0.95,
  "last_updated": "2026-04-14T10:23:45Z"
}
```

**字段说明：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `round_count` | int | 当前已进行轮次 |
| `action` | object | 当前最优意图动作，含 `clear` 标记 |
| `constraints` | array | 人工给出的附加约束，每项含 `clear` 标记 |
| `open_questions` | array | 系统还有疑问未解答（非空则意图不清晰） |
| `compressed_history` | string | 历史轮次的结构化摘要（最长 300 tokens） |
| `confidence` | float | 0.0 ~ 1.0，综合评估当前意图可信度 |

**累加器每轮写入 S3 审计库**（绑定 escalation_id）。断连后从 S3 恢复，不丢失历史。

### 4.3 每轮处理流程

```
本轮输入（人工消息）
  │
  ├─ Step 1：提取意图 delta
  │     ├─ action_update      （要做什么）
  │     ├─ constraint_update  （限制条件）
  │     ├─ question_answers   （解答了哪些 open_questions）
  │     └─ new_questions      （人工提出的新问题，系统需回答）
  │
  ├─ Step 2：更新累加器
  │     ├─ 合并 action_update → action
  │     ├─ 合并 constraint_update → constraints
  │     ├─ 移除已解答的 open_questions
  │     ├─ 添加系统侧 new_questions → open_questions
  │     └─ 将本轮原文摘要追加到 compressed_history
  │
  ├─ Step 3：评估意图清晰度（三维同时满足才算清晰）
  │     ├─ action.clear = true       （知道要做什么）
  │     ├─ all constraints.clear = true  （约束无歧义）
  │     └─ open_questions = []       （无未解答问题）
  │
  ├─ Step 4：清晰度判断分支
  │     ├─ 清晰 → 进入 CONFIRMING
  │     └─ 不清晰 → 系统生成下一轮引导问题，等待人工输入
  │
  └─ Step 5：持久化累加器到 S3（无论是否清晰）
```

### 4.4 上下文预算（每轮恒定）

```
每轮系统上下文 = 
  escalation_snapshot   ≈ 500 tokens  （固定，触发时生成一次）
+ intent_accumulator    ≈ 300 tokens  （有界，按 schema 结构约束）
+ last_exchange         ≈ 200 tokens  （仅最后1轮原文）
────────────────────────────────────────
总计                    ≈ 1000 tokens （O(1)，与轮次无关）
```

对比朴素方案（第20轮约需 4000 tokens，第50轮约需 10000 tokens），累加器方案**上下文消耗恒定，轮次无限可扩展**。

---

## 五、意图清晰度阈值与 max_rounds

| 参数 | 默认值 | 可配置 | 说明 |
|------|--------|--------|------|
| `confidence_threshold` | 0.8 | ✅ | 低于此值强制再询问 |
| `max_rounds` | 10 | ✅ | 超过后进入 FORCE_CONFIRMING |
| `per_round_timeout_sec` | 300 | ✅ | 单轮等待超时（5分钟），超时写 open_questions 并提示 |
| `session_timeout_sec` | 1800 | ✅ | 同 escalation_timeout_sec，总超时 |

**FORCE_CONFIRMING 机制：**
```
当 round_count >= max_rounds 时：

系统输出：
  "经过 [N] 轮对话，我理解您的意图是：
   动作：[action.type] → [action.target_state]
   约束：[constraints 列表]
   
   请确认：[Y] 执行  /  [N] 请用一句话重新描述您的意图"

人工回复 Y → 立即进入 EXECUTING
人工回复 N + 新描述 → 重置累加器，round_count=0，回到 CLARIFYING
无响应超时 → on_timeout_action 自动执行
```

---

## 六、响应渠道（按优先级）

| 优先级 | 渠道 | 触发条件 | 说明 |
|--------|------|----------|------|
| P1 | 终端看板（已规划）| 默认首选 | 实时显示 CLARIFYING 状态和累加器内容 |
| P2 | Webhook + 外部审批系统 | P1 无响应 > 5 分钟 | 推送到企业 OA / 钉钉 / Slack |
| P3 | 邮件 / 消息 | P2 无响应 > 15 分钟 | 兜底通知，附带 escalation 报文摘要 |

渠道降级不重置 session_timeout，只是扩大通知范围。

---

## 七、人工操作权边界

### 人工可以做的

| 操作 | 触发层 | 说明 |
|------|--------|------|
| 覆盖 quality.gate（L18）门禁决策 | L18 quality.gate 质量门禁层 | 强制放行或强制打回，绕过自动评分 |
| 修改任务状态 | L13 orchestration.collab 协作编排层 | 将任务强制推进到指定状态（需写 S3 审计） |
| 终止任务 | L13 orchestration.collab 协作编排层 | 强制 FAILED，写终态审计记录 |
| 强制降级 | L3 model.management 模型管理层 | 切换模型或降低并发，不中止任务 |
| 追加 decision_options | 本协议 | 当系统预生成选项不满足时，人工可提出新方案 |

### 人工不可以做的

| 禁止操作 | 原因 | 约束来源 |
|----------|------|----------|
| 绕过 S3 审计写入 | S3 永久保留是整个架构的信任基石；一旦可绕过，所有审计失效 | S3 设计约束（见 00_升级总结总览.md） |
| 直接修改 evolution.experiment（L23）进化结果 | 进化结果必须经 release.publish（L22）发布链路；人工直改等于架空 L22 门禁 | L23 设计约束 |
| 删除历史累加器记录 | 累加器快照写入 S3 后不可删除，只可归档 | S3 设计约束 |
| 跨企业或未授权跨子域操作 | 即使是平台管理员，也不得以 escalate 为由操作其他 **企业（`tenant_id`）** 或未授权 **部门/员工** 域内任务 | L6 security.permissions 权限设计约束 |

---

## 八、EXECUTING 阶段：确认后的执行路径

意图确认后，系统将结构化 action 翻译为具体的系统操作：

```
action.type = "rollback"
  → orchestration.collab（L13）状态机执行 rollback_to（目标状态）
  → 写 S3：操作类型=HUMAN_ROLLBACK，执行人=escalation_id，意图摘要=累加器 action 字段

action.type = "continue"
  → orchestration.collab（L13）重置 timeout 计时，任务恢复推进
  → 写 S3：操作类型=HUMAN_CONTINUE

action.type = "terminate"
  → 任务状态 = FAILED
  → 写 S3：终态记录，包含完整累加器快照

action.type = "downgrade"
  → model.management（L3）切换模型配置（从累加器 constraints 中读取目标模型）
  → 重新进入 EXECUTING 状态，重置超时

action.type = "custom"（人工追加的新选项）
  → 系统将 action 描述写入 S3，标记为 HUMAN_CUSTOM
  → 由看板通知负责人手动执行后，人工确认关闭 escalation
```

---

## 九、完整审计轨迹（S3 写入点）

| 时机 | 写入内容 | 不可跳过 |
|------|----------|----------|
| escalate 触发时 | escalation 报文（5字段） | ✅ |
| 每轮对话结束时 | 意图累加器快照（绑定 escalation_id + round） | ✅ |
| CONFIRMING 时 | 最终确认的意图（action + constraints 完整版） | ✅ |
| EXECUTING 完成时 | 执行结果 + 关联的 escalation_id | ✅ |
| on_timeout_action 触发时 | 自动执行记录（标记来源为 TIMEOUT） | ✅ |
| FORCE_CONFIRMING 触发时 | max_rounds 达到事件记录 | ✅ |

**原则**：审计写入不可因主流程失败而跳过；即使 EXECUTING 失败，EXECUTING 的失败本身也必须写 S3。

---

## 十、与现有架构的交叉引用

| 模块 | 关系 |
|------|------|
| L13 orchestration.collab 协作编排层 | 触发源 A；执行 rollback/continue/terminate 指令 |
| L18 quality.gate 质量门禁层 | 触发源 B；人工可覆盖 quality.gate（L18）决策 |
| L22 release.publish 版本发布层 | 触发源 C；custom action 可触发 release.publish（L22）手动发布流程 |
| L14 security.policy 安全策略层 + Tool Port | 触发源 D（极高风险工具调用） |
| L16 quality.inspector Inspector 层 | 触发源 E（低置信度检测） |
| S1 上下文库 | context_snapshot 的数据来源（读取后压缩） |
| S3 审计库 | 所有审计记录写入目标（永久保留） |
| S4 规则库 | max_rounds / confidence_threshold 等参数配置来源 |
| Agent 看板（P1） | 首选响应渠道，展示 CLARIFYING 状态和累加器内容 |
