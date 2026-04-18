# GenericAgent 调研与沟通记录

**日期**：2026-04-18  
**性质**：外部开源项目调研记录 / 沟通结论  
**范围**：仅用于 Flow Harness 架构参考、能力映射与治理边界讨论；不代表已接入运行时依赖。

---

## 一、调研背景

本次沟通目标：

1. 查看 GenericAgent 对 Flow Harness 是否有可借鉴价值。
2. 判断哪些能力可以直接吸收为我方机制。
3. 明确开源协议与合规边界。
4. 明确不得直接照搬的风险点。

调研过程中确认：

- 当前仓库内不存在 `meeting/20260418升级总结/GenericAgent.md`。
- `meeting/20260418升级总结/` 下未检索到 `GenericAgent` 相关本地文档。
- 外部公开包 `genericagent` 可在 PyPI 查询到。

---

## 二、来源与许可证

### 2.1 GenericAgent

外部公开信息显示：

- 包名：`genericagent`
- PyPI 地址：`https://pypi.org/project/genericagent/`
- GitHub 仓库：`https://github.com/lsdefine/GenericAgent.git`
- 当前调研版本：`1.0.7`
- 发布时间：2026-03-27
- 描述：minimal self-evolving autonomous agent framework
- 许可证：MIT License

### 2.2 与本项目许可证关系

Flow Harness 当前项目许可证为 MIT：

- `package.json` 中 `license = MIT`
- `README.md` 中许可证为 MIT
- `PROJECT_SUMMARY.md` 中许可证为 MIT License

结论：

```text
GenericAgent 与 Flow Harness 均为 MIT 许可证。
在保留原始版权声明与许可证文本的前提下，可以参考、修改、整合其思想和代码。
```

但建议：

1. 不直接把 GenericAgent 作为内核运行时依赖。
2. 如引用代码片段，应保留来源、许可证与修改说明。
3. 第三方来源已记录到 [`../THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md)。

---

## 三、对 Flow Harness 有帮助的部分

### 3.1 原子工具模型

GenericAgent 的价值之一是把执行能力收敛成少量原子工具，例如：

- `code_run`
- `file_read`
- `file_write`
- `file_patch`
- `web_scan`
- `web_execute_js`
- `ask_user`

对 Flow Harness 的借鉴价值：

1. 可作为 `Tool Capability Profile` 的初始工具分类参考。
2. 可映射到 `Tool Port` 与 `L1.1 工具数据源接入子层`。
3. 可作为子 Agent / 副 Deep Agent 执行层的最小工具集参考。

建议映射：

| GenericAgent 工具 | Flow Harness 建议归属 | 风险口径 |
|---|---|---|
| `file_read` | Tool Port / 文件读工具 | 低到中，按路径白名单 |
| `file_write` | Tool Port / 文件写工具 | 中到高，必须审计 |
| `file_patch` | Tool Port / 补丁工具 | 中到高，必须可回滚 |
| `code_run` | 沙箱执行工具 | 高，默认受限 |
| `web_scan` | 网页识别 / 搜索工具 | 中，结果需重进治理链 |
| `web_execute_js` | 浏览器自动化 / RPA | 高，需域名白名单 |
| `ask_user` | HITL 人工确认 | 治理节点，不是普通工具 |

---

### 3.2 Skill 自进化机制

GenericAgent 的核心思想之一是：

```text
任务执行路径 -> 总结经验 -> 沉淀为 Skill -> 后续复用
```

这与 Flow Harness 的以下设计高度契合：

- 经验沉淀引擎
- 自优化治理体系
- Skill Registry
- 复盘闭环
- L16 进化实验层

可直接吸收的思想：

1. 将成功任务路径结构化为可复用 Skill。
2. 将失败路径沉淀为反例、测试样例或风险规则。
3. 将 Skill 与触发条件、输入输出、依赖、风险等级绑定。
4. 将 Skill 复用纳入任务编排层的能力匹配。

必须增加的 Flow Harness 治理约束：

1. Skill 不得自动进入平台级生效。
2. Skill 必须区分 `platform / company / department / user` 四级作用域。
3. 用户级 Skill 不得污染公司级或平台级 Skill。
4. 高风险 Skill 必须通过 L12 质量门禁与 L15 发布链。
5. Skill 变更必须可审计、可回滚。

---

### 3.3 Bot / 通讯入口经验

GenericAgent 支持多种 Bot 或通讯前端的思路，对 Flow Harness 的第三方通讯接入有参考价值。

可借鉴点：

1. 将企业微信、飞书、钉钉、Telegram 等作为统一消息入口。
2. 将消息入口转成标准任务。
3. 将用户确认、审批、补充信息映射为 HITL 节点。
4. 将发送结果、回执、失败原因写入状态与审计。

Flow Harness 中的正确落位：

- `Protocol Port`
- `Tool Port`
- `VP11 External`
- `17_第三方通讯软件接入规范.md`

必须坚持：

1. 默认优先官方 API / Webhook。
2. 桌面镜像/RPA 只作为受控备选方案。
3. 外部通讯只做单向发送与回执回传。
4. 不允许外部通讯组件主动读取内部数据。
5. 高风险消息必须先通过审批门禁。

---

### 3.4 浏览器 / 桌面自动化经验

GenericAgent 的浏览器、网页执行和真实环境操作能力，对 Flow Harness 有参考价值。

可借鉴方向：

1. 网页扫描与结构识别。
2. 浏览器执行 JS。
3. 真实网页登录态下的任务执行。
4. 桌面软件自动化。
5. 操作轨迹与截图证据。

Flow Harness 中的正确落位：

- 电脑操作与软件使用能力引擎
- 网页识别能力引擎
- RPA / 自动化平台 Adapter
- 执行监控层
- 审计证据链

必须增加的约束：

1. 只能在授权域名、授权软件、授权账号下执行。
2. 禁止读取本地非授权文件、凭据、浏览器密码。
3. 发布、支付、删除、批量操作等高风险动作必须人工确认。
4. 操作过程必须有日志、截图或等价证据。
5. 失败不得无限重试，必须降级或转人工。

---

### 3.5 分层记忆与任务经验

GenericAgent 的记忆与技能树思想可映射为：

| GenericAgent 概念 | Flow Harness 映射 |
|---|---|
| 元规则 / 系统规则 | `AGENTS.md` / S4 规则库 / topology |
| 全局事实 | KnowledgeBase / 项目记忆 / 外部系统注册 |
| 任务经验 | 经验沉淀 / 复盘闭环 / Benchmark 样例 |
| Skill | Skill Registry / 能力包 |
| 自我进化 | L16 进化实验层 |

建议：

1. 只吸收“结构化记忆”思想。
2. 不允许低层 Agent 直接修改平台级规则。
3. 所有记忆写入必须带 `trace_id / agent_id / task_id / scope_level`。
4. 经验升级为规则或 Skill 前必须经过门禁。

---

## 四、不能直接照搬的部分

### 4.1 不能直接引入自由执行模式

GenericAgent 的 `code_run` 等能力如果不加限制，会形成高风险执行面。

Flow Harness 禁止：

1. 任意脚本执行。
2. 任意依赖安装。
3. 任意网络访问。
4. 任意文件读写。
5. 任意数据库或对象存储读取。

必须经由：

```text
Tool Port -> L4 权限 -> L8 安全策略 -> L12 质量门禁 -> L15 发布 / 审批 -> S3 审计
```

---

### 4.2 不能让外部 Agent 读取内部系统

Flow Harness 已写死外部接入隔离规则。

外部 Agent / 外部模型 / MCP / 第三方服务只能接收：

- 受控摘要
- 受控引用
- 脱敏副本
- 明确授权的任务载荷

禁止外部组件：

1. 读取我方仓库。
2. 枚举我方文件。
3. 直连数据库。
4. 遍历对象存储。
5. 读取 `S1-S4`。
6. 读取配置、凭据、Prompt、本地目录。

---

### 4.3 不能把外部完成当作内部通过

外部 Agent 返回 `completed` 只代表外部侧完成。

Flow Harness 内部仍必须重新进入：

- L4 权限
- L8 安全策略
- L10 Inspector
- L12 质量门禁
- L15 发布
- S3 审计

结论：

```text
外部 completed != 内部 SETTLED
外部 result != 生产结论
外部验证 != 内部门禁通过
```

---

### 4.4 不能让 Skill 自进化直接污染生产

GenericAgent 的自进化 Skill 思想有价值，但在 Flow Harness 中必须受控。

禁止：

1. Skill 自动升级为平台级规则。
2. Skill 自动跨租户共享。
3. Skill 自动修改治理链。
4. Skill 失败后无版本回滚。
5. Skill 使用未声明依赖或未授权工具。

正确流程：

```text
候选 Skill
  -> 沙箱验证
  -> 样例回放
  -> 风险评级
  -> L12 质量门禁
  -> L15 发布
  -> S3 审计
  -> 灰度启用
  -> 可回滚
```

---

## 五、建议定位

本次沟通建议将 GenericAgent 定位为：

```text
MIT 开源参考项目。
短期只作为思想与机制参考，不作为 Flow Harness 内核运行时依赖。
```

推荐口径：

```text
GenericAgent 可纳入 Flow Harness 外部能力参考池。
本项目不直接引入其运行时作为内核依赖，只抽象其原子工具、Bot 入口、自进化 Skill 与浏览器执行经验。
所有借鉴能力必须重封装为 Flow Harness 的 Tool Capability / Skill Registry / A2A Adapter，
并经过权限、安全、质量、发布与审计治理链。
```

---

## 六、与 Flow Harness 的架构映射

| GenericAgent 可借鉴点 | Flow Harness 落位 |
|---|---|
| 原子工具 | Tool Port / Tool Capability Profile |
| Bot 入口 | Protocol Port / 第三方通讯 Adapter |
| 自进化 Skill | Skill Registry / L16 进化实验层 |
| 执行路径复用 | 经验沉淀引擎 / 复盘闭环 |
| 浏览器执行 | 网页识别能力引擎 / RPA Adapter |
| 桌面自动化 | 电脑操作与软件使用能力引擎 |
| 任务状态 | Execution State / Layer Message Envelope |
| 外部 Agent 协作 | VP11 / A2A Adapter |

---

## 七、下一步建议

### 7.1 文档侧

建议后续补充：

1. `GenericAgent 能力映射表`
2. `Tool Capability Profile 初版`
3. `Skill Registry 字段规范`

### 7.2 工程侧

建议优先做低风险抽象，不直接接入外部运行时：

1. 定义 7 类原子工具的内部 schema。
2. 给每类工具标注风险等级、作用域、审批要求、审计要求。
3. 把 `ask_user` 映射到 HITL 标准节点。
4. 把 `web_scan / web_execute_js` 映射到网页识别与受控浏览器执行。
5. 把 Skill 自进化拆成“候选、验证、发布、回滚”四阶段。

### 7.3 治理侧

必须同步定义：

1. 外部 Agent 不可信边界。
2. 外部结果回流门禁。
3. Skill 四级作用域隔离。
4. S3 异步审计与失败缓冲。
5. 高风险工具人工审批。

---

## 八、本次沟通结论

最终结论：

```text
GenericAgent 对 Flow Harness 有参考价值。
最值得吸收的是：原子工具、自进化 Skill、Bot 入口、浏览器/桌面自动化、结构化记忆。
许可证为 MIT，可参考和改造。
但不能直接接入为内核依赖，不能绕过 Flow Harness 的组织层级、治理链、外部隔离与审计规则。
```

建议执行策略：

```text
先参考，后抽象，再封装，最后按治理链发布。
```
