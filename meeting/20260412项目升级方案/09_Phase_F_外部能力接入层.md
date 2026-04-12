# Phase F：外部能力接入层

**制定日期**: 2026-04-12  
**定位**: 在不破坏 1 CEO + 4 总监固定架构的前提下，为 Flow Harness 增加可治理、可审计、可降级的外部 API 能力  
**目标**: 用最小风险方式引入外部能力，不把第三方 API 直接塞进核心链路  
**优先级**: 低于 Phase A/B/C/E，高于随意扩展第三方服务  

---

## 一、核心结论

最安全、最优的方案不是立即接入大量 API，而是：

1. **先规划，不直连**
2. **先治理，后接入**
3. **先低风险试点，后扩展**
4. **先挂在能力层，不进入核心调度层**

也就是说：

**`meeting/API集` 和 `meeting/API分析结果` 应作为“外部能力接入层”的资料来源，而不是当前核心实现的一部分。**

---

## 二、为什么这是最安全方案

当前项目已经具备：

- Supervisor 6 步闭环
- 技能系统
- 命令系统
- 钩子系统
- Inspector 检查层
- 权限模型

但当前项目尚未完整具备：

- 外部 API provider 注册表
- 网络白名单与细粒度放行
- API Key/Token 安全管理
- provider 健康检查
- API 调用限流与配额统计
- provider fallback 与熔断
- 外部能力专项审计

如果现在直接接入第三方 API，会引入额外风险：

1. **网络风险**
   当前 `.flowharness/config.yml` 默认 `network.enabled: false`。

2. **密钥风险**
   需要区分无认证、apiKey、OAuth、多租户密钥等不同模型。

3. **稳定性风险**
   第三方 API 不可控，服务中断会污染当前执行链路。

4. **架构风险**
   如果把 API 调用直接塞进 Supervisor 或核心步骤，会破坏 CEO 只做决策调度的边界。

5. **合规风险**
   高风险 API 很容易触碰 AGENTS.md 中支付、认证、API 契约等禁止项。

所以安全优先的做法必须是：

**把 API 接入做成“受治理的外部能力层”，而不是“项目里到处直接调接口”。**

---

## 三、Phase F 的设计原则

### F1. 不新增 Agent

严格保持：

- 1 个 CEO
- 4 个总监

外部 API 只能作为现有 Agent 的工具能力，不能变成新角色。

### F2. 能力注册，不直接硬编码

所有 provider 必须登记到统一注册表，而不是在业务逻辑里散落 URL。

### F3. 默认拒绝

任何外部能力默认不可用，必须满足以下条件才可启用：

- 在 provider registry 中登记
- 在网络白名单中放行
- 风险等级明确
- 检查规则明确
- 调用策略明确

### F4. 低风险优先

优先接入：

- 无认证
- 免费
- 文档清晰
- 不涉及用户敏感数据
- 失败可降级

### F5. 核心链路隔离

支付、认证、鉴权、API 契约修改等能力不进入当前外部能力试点范围。

---

## 四、推荐落位

建议新增目录：

```text
.flowharness/
  capabilities/
    registry.json
    providers/
      open-meteo.json
      coingecko.json
      rest-countries.json
      randomuser.json
      bored-api.json
  provider-health/
  provider-cache/
```

### 4.1 `registry.json`

用于统一声明能力，而不是直接声明 API 列表。

示例：

```json
{
  "version": "1.0",
  "capabilities": [
    {
      "id": "weather.lookup",
      "provider": "open-meteo",
      "owner_agent": "general",
      "auth": "none",
      "risk": "low",
      "network_required": true,
      "requires_approval": false,
      "enabled": false
    }
  ]
}
```

### 4.2 provider 文件

每个 provider 独立维护：

- base URL
- 认证方式
- 限流信息
- 可用性要求
- fallback
- 检查策略

---

## 五、Agent 层如何使用

### CEO / Supervisor

只做：

- 判断是否需要外部能力
- 判断风险等级
- 决定是否允许 General/Plan/Inspector 使用该能力

**CEO 不直接调用外部 API。**

### Plan Agent

负责：

- 选型
- 风险评估
- provider 比较
- fallback 建议

### General-Purpose Agent

负责：

- 实际调用已批准的 provider
- 执行缓存、重试、降级
- 输出结果给上层

### Inspector Agent

负责：

- 检查 provider 是否合规
- 检查是否超出风险等级
- 检查是否缺少 fallback / cache / timeout
- 检查是否越权调用

---

## 六、最安全的接入顺序

### Phase F0：仅规划，不接代码

当前阶段先完成：

1. 确认 provider registry 结构
2. 确认风险分级
3. 确认 Inspector 检查项
4. 确认网络策略扩展方式

这是最安全的一步，因为完全不触发运行时变化。

### Phase F1：只接 3-5 个低风险试点

推荐首批 provider：

1. `Open-Meteo`
2. `CoinGecko`
3. `REST Countries`
4. `RandomUser`
5. `Bored API`

原因：

- 无认证或低门槛
- 风险低
- 对业务无核心依赖
- 失败可降级

### Phase F2：补齐治理能力

在扩大 API 接入前，先补齐：

1. 网络白名单控制
2. provider health check
3. provider cache
4. timeout / retry / circuit breaker
5. API 调用审计日志
6. Inspector 外部能力检查规则

### Phase F3：才考虑中风险 provider

例如：

- NewsAPI
- Unsplash
- LibreTranslate

这些仍应作为可选扩展，而不是核心依赖。

### Phase F4：高风险 provider 暂缓

暂不建议进入当前项目：

- 支付类
- OAuth 用户授权平台
- 认证/鉴权类
- 会影响现有 API 契约的网关类能力

---

## 七、最小可执行方案

如果后续真的开始实现，最小可执行范围应限制为：

### 第一步

只新增静态注册表，不接真实网络调用：

- `.flowharness/capabilities/registry.json`
- `providers/*.json`

### 第二步

只在 `Plan Agent` 中支持“能力选型分析”，不执行调用。

### 第三步

只在 `General-Purpose Agent` 中开放 1 个 provider 调用器，并且仅限低风险 provider。

### 第四步

只在 `Inspector Agent` 中增加以下检查：

- provider 是否登记
- 是否在白名单
- 是否需要认证
- 是否具备 fallback
- 是否超出风险级别

---

## 八、建议的检查规则

Inspector 增加外部能力专项检查：

1. **Provider 注册检查**
   未登记 provider 禁止调用。

2. **网络策略检查**
   未在白名单中的域名禁止调用。

3. **认证模式检查**
   apiKey/OAuth provider 必须声明密钥来源和审批要求。

4. **风险等级检查**
   高风险 provider 不能在 automatic 模式下直接执行。

5. **可降级检查**
   没有 fallback 或缓存的 provider 不能成为核心路径依赖。

6. **审计检查**
   所有外部调用必须有日志记录。

---

## 九、命令与钩子扩展建议

### 建议新增命令

- `/capabilities`
- `/provider-status`
- `/api-health`
- `/api-budget`

### 建议新增钩子

- `pre_task`
  检查任务是否请求外部网络能力

- `post_task`
  记录 provider 调用结果、失败率、延迟

- `on_supervisor_stop`
  汇总本次外部能力调用统计

---

## 十、与现有升级主线的关系

Phase F 不应抢占当前主线优先级。

建议优先顺序仍然是：

1. Phase A 稳定基础
2. Phase B 技能系统
3. Phase C 钩子与命令系统
4. Phase D Token 管控
5. Phase E 真实执行
6. **Phase F 外部能力接入层**

原因：

只有在真实执行链路稳定后，外部能力接入才不会把问题复杂度成倍放大。

---

## 十一、最终建议

最安全最优的方案定版如下：

1. **现在不直接集成 `meeting/API集` 到项目代码**
2. **现在只把 `API分析结果` 吸收到升级规划**
3. **后续单独新增 `Phase F：外部能力接入层`**
4. **首批只允许低风险免费 provider 试点**
5. **所有 provider 必须通过 registry、白名单、检查层、审计层治理后才能启用**

---

## 十二、最终判断

**对当前项目来说，最安全最优的方案不是“把 API 接进来”，而是“先建立外部能力治理层，再小规模、低风险、可回退地试点接入”。**

这是唯一同时满足以下条件的方案：

- 不破坏 AGENTS.md 固定架构
- 不冲击当前主线升级任务
- 不引入不受控网络依赖
- 不把高风险第三方能力提前带入核心链路
- 为后续真实执行扩展留下清晰路径
