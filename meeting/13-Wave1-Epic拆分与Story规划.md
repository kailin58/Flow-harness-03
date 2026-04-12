# 13 Wave 1 Epic 拆分与 Story 规划

## 目的

将 Wave 1（Sprint 1~3）的 3 个 Epic 拆分为可执行、可验收的 Story，明确：

- Story ID 与名称
- 验收标准（Acceptance Criteria）
- 依赖关系
- 工时估算（Story Points）
- Sprint 分配建议

## Wave 1 概览

| Epic | 名称 | 目标 | Sprint |
|------|------|------|--------|
| E4 | 权限与审计底座 | 登录 + RBAC + 数据隔离 + 审计 | S1~S2 |
| E10 | 账号与权限中心治理台 | 员工账号管理 + 角色配置 + 审计查询 UI | S2~S3 |
| E1 | 交易主链路 | 浏览 → 加车 → 下单 → 支付 → 确认收货 | S2~S3 |

**关键里程碑**：Sprint 3 结束时，平台可登录、可配权限、可完成交易闭环。

---

## 一、E4 权限与审计底座

### Epic 目标

搭建统一身份、授权、审计基座，为所有业务模块提供鉴权与数据隔离能力。

### Story 列表

#### S1-001 工程骨架初始化

**名称**：Spring Modulith 项目骨架 + 模块边界

**Story Points**：3

**验收标准**：
- [ ] 创建 monorepo，包含 `iam-auth`、`iam-permission` 模块
- [ ] 集成 Spring Boot 3.5 + Spring Modulith
- [ ] 配置 MySQL 8.4 + Redis + Kafka 本地开发环境（docker-compose）
- [ ] 统一配置：日志格式（Pino JSON）、错误码规范、OpenAPI 契约
- [ ] CI/CD 流水线可运行（GitHub Actions / GitLab CI）

**依赖**：无

**产出**：
- 项目骨架代码
- `docker-compose.yml`
- CI 配置文件

---

#### S1-002 Keycloak 集成与 OIDC 配置

**名称**：Keycloak 部署 + OIDC Token 签发/校验

**Story Points**：5

**验收标准**：
- [ ] Keycloak 容器部署，配置 realm: `acmodus`
- [ ] 创建客户端：`admin-web`、`supplier-web`、`user-app`
- [ ] 实现 `iam-auth` 模块的 Token 校验 Filter
- [ ] 实现 `POST /api/v1/iam/auth/login`（代理 Keycloak 登录）
- [ ] 实现 `POST /api/v1/iam/auth/refresh`
- [ ] 单元测试覆盖 Token 校验逻辑

**依赖**：S1-001

**产出**：
- Keycloak realm 配置导出
- `iam-auth` 模块代码
- Token 校验 Filter

---

#### S1-003 数据库 Schema 迁移脚本（iam 部分）

**名称**：iam 模块 16 张表 DDL 迁移

**Story Points**：3

**验收标准**：
- [ ] 使用 Flyway 管理迁移脚本
- [ ] 创建 `V001__iam_core_tables.sql`，包含 16 张 iam 表
- [ ] 创建 `V002__iam_index.sql`，包含所有索引
- [ ] 本地 MySQL 可成功执行迁移
- [ ] 集成测试可自动建表

**依赖**：S1-001

**产出**：
- Flyway 迁移脚本
- Schema 文档自动生成

---

#### S1-004 模块注册接口

**名称**：`POST /api/v1/iam/modules` + 查询接口

**Story Points**：5

**验收标准**：
- [ ] 实现 `POST /api/v1/iam/modules`，支持资源、动作注册
- [ ] 实现 `GET /api/v1/iam/modules/{code}`
- [ ] 实现 `GET /api/v1/iam/modules` 分页查询
- [ ] 幂等校验：`module_code` 唯一
- [ ] 集成测试覆盖：注册 → 查询 → 重复注册报 409
- [ ] OpenAPI 文档生成

**依赖**：S1-003

**产出**：
- `iam-permission` 模块的 ModuleController
- 单元/集成测试

---

#### S1-005 身份主体查询接口

**名称**：`GET /api/v1/iam/principals/{id}` + `POST :resolve`

**Story Points**：5

**验收标准**：
- [ ] 实现 `GET /api/v1/iam/principals/{principal_id}`
- [ ] 实现 `POST /api/v1/iam/principals:resolve`（Token/ID 反查）
- [ ] 返回 `principal_type`、`account_status`、`bound_roles`
- [ ] Keycloak User ID 与 `iam_principal.user_id` 映射
- [ ] 集成测试：创建员工 → 查询主体 → 验证角色绑定

**依赖**：S1-002, S1-003

**产出**：
- PrincipalController
- PrincipalService（含 Keycloak 集成）

---

#### S1-006 统一鉴权接口

**名称**：`POST /api/v1/iam/authorizations:check` + `:batchCheck`

**Story Points**：8

**验收标准**：
- [ ] 实现单次鉴权 `POST /authorizations:check`
- [ ] 实现批量鉴权 `POST /authorizations:batchCheck`（上限 50 项）
- [ ] 返回 `allow`、`deny_reason`、`data_scope`、`field_scope`
- [ ] 支持数据范围维度：org、supplier、brand、store、channel
- [ ] 支持 `need_approval`、`need_second_verify` 标记
- [ ] 性能要求：单次鉴权 < 50ms（P99）
- [ ] 集成测试：配置角色 → 绑定主体 → 鉴权通过/拒绝

**依赖**：S1-004, S1-005

**产出**：
- AuthorizationController
- AuthorizationService（Casbin/OpenFGA 集成）

---

#### S1-007 数据范围查询接口

**名称**：`GET /api/v1/iam/principals/{id}/data-scopes`

**Story Points**：3

**验收标准**：
- [ ] 实现按 principal_id + module_code 查询数据范围
- [ ] 返回各维度的 `scope_type`（all/whitelist/none）和 ID 列表
- [ ] 支持缓存 5 分钟（Redis）
- [ ] 集成测试覆盖

**依赖**：S1-006

**产出**：
- DataScopeController
- DataScopeService

---

#### S1-008 统一审计写入接口

**名称**：`POST /api/v1/iam/audit-events` + `GET` 查询

**Story Points**：5

**验收标准**：
- [ ] 实现 `POST /api/v1/iam/audit-events`，返回 202 Accepted
- [ ] 写入 `iam_audit_event` 表 + `outbox_event` 表（同一事务）
- [ ] 实现 `GET /api/v1/iam/audit-events` 分页查询（从 OpenSearch 读取）
- [ ] 支持按 event_type、operator_id、target_id、时间范围过滤
- [ ] Snapshot 字段最大 10KB 校验
- [ ] 集成测试：写入 → 查询验证

**依赖**：S1-003, S1-004

**产出**：
- AuditEventController
- AuditEventService
- Outbox 写入切面

---

#### S1-009 生命周期事件投递

**名称**：Outbox → Kafka CDC 投递

**Story Points**：5

**验收标准**：
- [ ] 实现 CDC 监听 `outbox_event` 表
- [ ] 投递到对应 Kafka Topic：`iam.lifecycle.staff`、`iam.lifecycle.supplier` 等
- [ ] 投递成功后更新 `outbox_event.published_at`
- [ ] 支持重试：未投递事件每 5 分钟重扫
- [ ] 集成测试：创建员工 → 验证 `AccountStaffOnboarded` 事件投递

**依赖**：S1-008

**产出**：
- CDC 组件（Debezium / 自定义）
- Kafka Producer 配置

---

#### S1-010 预留接口桩

**名称**：字段范围、菜单装配、审批、安全策略 4 类预留接口

**Story Points**：2

**验收标准**：
- [ ] `GET /api/v1/iam/principals/{id}/field-scopes` 返回固定 `visible_fields: ["*"]`
- [ ] `GET /api/v1/iam/principals/{id}/menus` 返回空结构
- [ ] `POST /api/v1/iam/approval-requests` 返回 501
- [ ] `GET /api/v1/iam/security-policies` 返回默认策略
- [ ] OpenAPI 文档标记为 `deprecated: false, x-phase: reserved`

**依赖**：S1-003

**产出**：
- 4 个预留 Controller 端点

---

### E4 汇总

| Story ID | 名称 | SP | Sprint | 依赖 |
|----------|------|-----|--------|------|
| S1-001 | 工程骨架初始化 | 3 | S1 | - |
| S1-002 | Keycloak 集成 | 5 | S1 | S1-001 |
| S1-003 | 数据库迁移（iam） | 3 | S1 | S1-001 |
| S1-004 | 模块注册接口 | 5 | S1 | S1-003 |
| S1-005 | 身份主体查询 | 5 | S1 | S1-002, S1-003 |
| S1-006 | 统一鉴权接口 | 8 | S2 | S1-004, S1-005 |
| S1-007 | 数据范围查询 | 3 | S2 | S1-006 |
| S1-008 | 统一审计写入 | 5 | S2 | S1-003, S1-004 |
| S1-009 | 生命周期事件投递 | 5 | S2 | S1-008 |
| S1-010 | 预留接口桩 | 2 | S2 | S1-003 |

**E4 总 Story Points**：44 SP

**M1 里程碑**：Sprint 2 结束时，RBAC + 审计 + 数据隔离全部通过。

---

## 二、E10 账号与权限中心治理台

### Epic 目标

在 E4 底座之上，提供员工账号管理、组织岗位、角色配置、审计查询的管理界面。

### Story 列表

#### S2-001 员工账号管理页面

**名称**：员工列表 + 创建 + 编辑 + 冻结

**Story Points**：8

**验收标准**：
- [ ] 员工列表页：分页、按姓名/工号/状态筛选
- [ ] 创建员工：填写姓名、工号、邮箱、手机、组织、岗位
- [ ] 自动创建 `iam_principal` + `iam_staff` + Keycloak 用户
- [ ] 编辑员工：修改基本信息、调整组织/岗位
- [ ] 冻结/解冻员工：更新 `account_status`、发送生命周期事件
- [ ] 表单校验：工号唯一、邮箱格式、手机格式

**依赖**：S1-005, S1-009

**产出**：
- 前端页面（Vue 3 + Element Plus）
- 后端 API：`GET/POST/PUT /api/v1/admin/staff`

---

#### S2-002 组织与岗位管理页面

**名称**：组织树 + 岗位配置

**Story Points**：5

**验收标准**：
- [ ] 组织树展示：支持展开/折叠、拖拽调整层级（可选）
- [ ] 创建/编辑/删除组织
- [ ] 岗位列表：按组织筛选
- [ ] 创建/编辑岗位：关联组织、设置默认角色
- [ ] 删除岗位时校验是否有员工绑定

**依赖**：S1-003

**产出**：
- 前端页面
- 后端 API：`GET/POST/PUT/DELETE /api/v1/admin/orgs`、`/positions`

---

#### S2-003 角色权限配置页面

**名称**：角色管理 + 资源动作绑定

**Story Points**：8

**验收标准**：
- [ ] 角色列表：按模块筛选、支持全局角色
- [ ] 创建/编辑角色：名称、描述、归属模块
- [ ] 权限配置树：勾选资源 + 动作（`order:view`, `order:export`）
- [ ] 保存后实时生效（清除权限缓存）
- [ ] 系统角色不可编辑/删除

**依赖**：S1-004, S1-006

**产出**：
- 前端页面
- 后端 API：`GET/POST/PUT/DELETE /api/v1/admin/roles`

---

#### S2-004 数据权限配置页面

**名称**：角色数据范围配置

**Story Points**：5

**验收标准**：
- [ ] 在角色详情页增加"数据权限"Tab
- [ ] 配置各维度范围：org、supplier、brand、store、channel
- [ ] 支持"全部可见"、"指定列表"、"不可见"三种类型
- [ ] 保存后实时生效（清除数据范围缓存）

**依赖**：S1-007

**产出**：
- 前端组件
- 后端 API：`POST /api/v1/admin/roles/{id}/data-scopes`

---

#### S2-005 审计日志查询页面

**名称**：审计日志列表 + 详情

**Story Points**：5

**验收标准**：
- [ ] 审计日志列表：分页、按事件类型/模块/操作人/时间范围筛选
- [ ] 详情弹窗：展示 before_snapshot / after_snapshot 对比
- [ ] 支持按 trace_id 查询完整链路
- [ ] 导出功能：导出当前筛选结果（调用审计写入接口记录导出动作）

**依赖**：S1-008

**产出**：
- 前端页面
- 复用 `GET /api/v1/iam/audit-events`

---

#### S2-006 供应商主账号开通页面

**名称**：供应商账号开通 + 冻结

**Story Points**：5

**验收标准**：
- [ ] 供应商账号列表：分页、按名称/状态筛选
- [ ] 开通供应商主账号：填写名称、联系人、手机、邮箱
- [ ] 自动创建 `iam_principal` + `iam_supplier_account` + Keycloak 用户
- [ ] 冻结/解冻供应商主账号：发送生命周期事件
- [ ] 关联 `supplier_id`（供应商主体，后续 E3 创建）

**依赖**：S1-005, S1-009

**产出**：
- 前端页面
- 后端 API：`GET/POST/PUT /api/v1/admin/supplier-accounts`

---

### E10 汇总

| Story ID | 名称 | SP | Sprint | 依赖 |
|----------|------|-----|--------|------|
| S2-001 | 员工账号管理页面 | 8 | S2 | S1-005, S1-009 |
| S2-002 | 组织与岗位管理页面 | 5 | S2 | S1-003 |
| S2-003 | 角色权限配置页面 | 8 | S2~S3 | S1-004, S1-006 |
| S2-004 | 数据权限配置页面 | 5 | S3 | S1-007 |
| S2-005 | 审计日志查询页面 | 5 | S3 | S1-008 |
| S2-006 | 供应商主账号开通页面 | 5 | S3 | S1-005, S1-009 |

**E10 总 Story Points**：36 SP

---

## 三、E1 交易主链路

### Epic 目标

实现 C 端用户"浏览 → 搜索 → 详情 → 加车 → 下单 → 支付 → 确认收货"完整闭环。

### Story 列表

#### S3-001 数据库 Schema 迁移脚本（trade 部分）

**名称**：catalog + inventory + pricing + trade + payment 模块 DDL

**Story Points**：5

**验收标准**：
- [ ] 创建 `V003__catalog_tables.sql`
- [ ] 创建 `V004__inventory_tables.sql`
- [ ] 创建 `V005__pricing_tables.sql`
- [ ] 创建 `V006__trade_tables.sql`
- [ ] 创建 `V007__payment_tables.sql`
- [ ] 创建 `V008__outbox_event_table.sql`
- [ ] 所有表有索引、外键约束（可选）

**依赖**：S1-003

**产出**：
- Flyway 迁移脚本

---

#### S3-002 商品模块基础 API

**名称**：品牌、类目、SPU、SKU CRUD

**Story Points**：8

**验收标准**：
- [ ] `GET /api/v1/catalog/brands` 品牌列表
- [ ] `GET /api/v1/catalog/categories` 类目树
- [ ] `GET /api/v1/catalog/spu/{id}` SPU 详情
- [ ] `GET /api/v1/catalog/sku/{id}` SKU 详情
- [ ] `GET /api/v1/catalog/spu` 商品搜索：按类目、品牌、关键词、价格区间
- [ ] 集成 Keycloak Token 校验（可选，公开接口可无鉴权）
- [ ] OpenAPI 文档生成

**依赖**：S3-001, S1-002

**产出**：
- CatalogController
- CatalogService

---

#### S3-003 库存模块基础 API

**名称**：库存查询 + 下单锁库存

**Story Points**：5

**验收标准**：
- [ ] `GET /api/v1/inventory/stock?sku_ids=xxx` 批量查询库存
- [ ] `POST /api/v1/inventory/stock/lock` 锁定库存（幂等，Idempotency-Key）
- [ ] `POST /api/v1/inventory/stock/unlock` 解锁库存
- [ ] 锁库存事务：`available_qty` 减少、`locked_qty`增加、写 `stock_journal`
- [ ] 并发安全：乐观锁/悲观锁防止超卖
- [ ] 集成测试：高并发锁库存不超卖

**依赖**：S3-001

**产出**：
- InventoryController
- InventoryService

---

#### S3-004 价格模块基础 API

**名称**：价格查询 + 快照生成

**Story Points**：3

**验收标准**：
- [ ] `GET /api/v1/pricing/sku-prices?sku_ids=xxx` 批量查询价格
- [ ] `POST /api/v1/pricing/snapshots` 生成价格快照（订单创建时调用）
- [ ] 快照写入 `pricing_price_snapshot`，关联 order_id
- [ ] 同一 order_id + sku_id 唯一

**依赖**：S3-001

**产出**：
- PricingController
- PricingService

---

#### S3-005 购物车模块

**名称**：购物车增删改查

**Story Points**：5

**验收标准**：
- [ ] `GET /api/v1/trade/cart` 获取当前用户购物车
- [ ] `POST /api/v1/trade/cart/items` 添加商品到购物车
- [ ] `PUT /api/v1/trade/cart/items/{id}` 修改数量
- [ ] `DELETE /api/v1/trade/cart/items/{id}` 删除商品
- [ ] `POST /api/v1/trade/cart/items/check` 勾选/取消勾选
- [ ] 购物车校验：库存充足、价格有效、商品未下架
- [ ] Token 校验：必须登录

**依赖**：S3-002, S3-003, S3-004, S1-002

**产出**：
- CartController
- CartService

---

#### S3-006 订单创建

**名称**：下单 → 锁库存 → 生成价格快照 → 创建订单

**Story Points**：8

**验收标准**：
- [ ] `POST /api/v1/trade/orders` 创建订单
- [ ] 入参：收货地址、商品列表（sku_id + quantity）、优惠券（可选）、积分（可选）
- [ ] 校验：库存充足、价格有效、收货地址完整
- [ ] 事务内：锁库存 → 生成价格快照 → 写 `trade_order` + `trade_order_item` → 写 `outbox_event`
- [ ] 返回 `order_no`、`pay_amount`
- [ ] 订单状态：`created`，30 分钟未支付自动取消（延迟队列）
- [ ] 幂等：Idempotency-Key 防重复下单
- [ ] 集成测试：完整下单流程

**依赖**：S3-003, S3-004, S3-005, S1-006

**产出**：
- OrderController
- OrderService
- OrderCreatedEvent

---

#### S3-007 支付模块

**名称**：支付单创建 → 支付回调 → 订单状态更新

**Story Points**：8

**验收标准**：
- [ ] `POST /api/v1/payment/payments` 创建支付单
- [ ] 入参：order_id、pay_channel（wechat_pay/alipay）
- [ ] 调用第三方支付 API（沙箱环境），返回支付参数
- [ ] `POST /api/v1/payment/callback` 支付回调
- [ ] 验签 → 更新 `payment_payment` 状态 → 更新 `trade_order` 状态 → 写 `outbox_event`
- [ ] 发送 `OrderPaid` 事件（后续 E5/E6 消费）
- [ ] 幂等：同一支付单只处理一次回调
- [ ] 集成测试：Mock 支付回调，验证订单状态流转

**依赖**：S3-006, S1-002

**产出**：
- PaymentController
- PaymentService
- WechatPayClient / AlipayClient（沙箱）

---

#### S3-008 订单列表与详情

**名称**：订单查询 API

**Story Points**：3

**验收标准**：
- [ ] `GET /api/v1/trade/orders` 订单列表（分页、按状态筛选）
- [ ] `GET /api/v1/trade/orders/{id}` 订单详情
- [ ] 数据隔离：只能查看自己的订单（member_id 匹配）
- [ ] 集成鉴权：调用 `POST /authorizations:check` 校验

**依赖**：S3-006, S1-006

**产出**：
- 复用 OrderController
- 增加查询方法

---

#### S3-009 订单状态流转

**名称**：发货 → 确认收货 → 取消

**Story Points**：5

**验收标准**：
- [ ] `POST /api/v1/trade/orders/{id}/ship` 发货（供应商/平台后台调用）
- [ ] `POST /api/v1/trade/orders/{id}/confirm` 确认收货（用户调用）
- [ ] `POST /api/v1/trade/orders/{id}/cancel` 取消订单（用户/系统调用）
- [ ] 取消时释放库存、退款（如已支付）
- [ ] 状态流转：`paid` → `shipped` → `delivered` → `completed`
- [ ] 发送 `OrderShipped`、`OrderDelivered`、`OrderCancelled` 事件
- [ ] 集成测试：完整状态流转

**依赖**：S3-007, S1-006

**产出**：
- OrderService 状态流转方法
- 事件发布

---

#### S3-010 订单超时自动取消

**名称**：延迟队列取消未支付订单

**Story Points**：3

**验收标准**：
- [ ] 订单创建后 30 分钟未支付自动取消
- [ ] 使用 Kafka 延迟消息 或 定时任务扫描
- [ ] 取消时释放库存
- [ ] 发送 `OrderCancelled` 事件
- [ ] 可配置超时时间

**依赖**：S3-006

**产出**：
- OrderCancelJob / Kafka Delay Consumer

---

#### S3-011 用户端商品详情页（前端）

**名称**：商品详情 H5 页面

**Story Points**：5

**验收标准**：
- [ ] 商品详情页：图片轮播、规格选择、价格展示、库存展示
- [ ] 商品详情页底部主操作区常驻显示，稳定承载加入购物车与立即购买两个主动作
- [ ] SEO：Nuxt 3 SSR 渲染
- [ ] 响应式：H5 + 小程序适配

**依赖**：S3-002, S3-003, S3-004

**产出**：
- 前端页面（Nuxt 3）

---

#### S3-012 用户端购物车与结算页（前端）

**名称**：购物车 + 结算确认页

**Story Points**：5

**验收标准**：
- [ ] 购物车页：商品列表、数量修改、勾选、总价计算
- [ ] 结算确认页：收货地址选择/新增、支付方式选择、优惠券选择（预留位）、积分抵扣（预留位）
- [ ] 结算页底部提交订单栏常驻显示，稳定承载应付金额与提交订单主动作

**依赖**：S3-005, S3-006

**产出**：
- 前端页面（Nuxt 3）

---

#### S3-013 用户端订单列表与详情页（前端）

**名称**：订单列表 + 订单详情 + 支付

**Story Points**：5

**验收标准**：
- [ ] 订单列表页：按状态 Tab、下拉刷新、上拉加载
- [ ] 订单详情页：商品信息、物流信息（预留位）、操作按钮
- [ ] 支付页：微信/支付宝支付调起（沙箱）
- [ ] 确认收货按钮

**依赖**：S3-008, S3-009

**产出**：
- 前端页面（Nuxt 3）

---

### E1 汇总

| Story ID | 名称 | SP | Sprint | 依赖 |
|----------|------|-----|--------|------|
| S3-001 | 数据库迁移（trade） | 5 | S2 | S1-003 |
| S3-002 | 商品模块基础 API | 8 | S2 | S3-001, S1-002 |
| S3-003 | 库存模块基础 API | 5 | S2 | S3-001 |
| S3-004 | 价格模块基础 API | 3 | S2 | S3-001 |
| S3-005 | 购物车模块 | 5 | S2~S3 | S3-002~S3-004, S1-002 |
| S3-006 | 订单创建 | 8 | S3 | S3-003~S3-005, S1-006 |
| S3-007 | 支付模块 | 8 | S3 | S3-006, S1-002 |
| S3-008 | 订单列表与详情 | 3 | S3 | S3-006, S1-006 |
| S3-009 | 订单状态流转 | 5 | S3 | S3-007, S1-006 |
| S3-010 | 订单超时自动取消 | 3 | S3 | S3-006 |
| S3-011 | 商品详情页（前端） | 5 | S2~S3 | S3-002~S3-004 |
| S3-012 | 购物车与结算页（前端） | 5 | S3 | S3-005, S3-006 |
| S3-013 | 订单列表与详情页（前端） | 5 | S3 | S3-008, S3-009 |

**E1 总 Story Points**：69 SP

---

## Wave 1 总汇总

### Sprint 分配

| Sprint | Epic | Story 数 | Story Points |
|--------|------|----------|--------------|
| S1 | E4 | 5 | 21 SP |
| S2 | E4 + E10 + E1 | 11 | 44 SP |
| S3 | E10 + E1 | 13 | 84 SP |

**Wave 1 总计**：29 Story，149 SP

### 依赖关系图

```
S1-001 工程骨架
├── S1-002 Keycloak 集成
├── S1-003 数据库迁移(iam)
│   ├── S1-004 模块注册接口
│   │   └── S1-006 统一鉴权接口
│   │       ├── S1-007 数据范围查询
│   │       └── S3-006 订单创建
│   └── S1-010 预留接口桩
├── S1-005 身份主体查询
│   ├── S2-001 员工账号管理页面
│   └── S2-006 供应商主账号开通页面
└── S3-001 数据库迁移(trade)
    ├── S3-002 商品模块 API
    ├── S3-003 库存模块 API
    ├── S3-004 价格模块 API
    └── ...（交易链路）

S1-008 统一审计写入
├── S1-009 生命周期事件投递
│   ├── S2-001 员工账号管理页面
│   └── S2-006 供应商主账号开通页面
└── S2-005 审计日志查询页面
```

### 关键里程碑验收

| 里程碑 | Sprint | 验收标志 |
|--------|--------|----------|
| M1 底座可用 | S2 | E4 RBAC + 审计 + 数据隔离全部通过 |
| M2 交易闭环 | S3 | E1 "浏览→支付→确认收货"端到端跑通 |

---

## 资源建议

### 团队配置（建议）

| 角色 | 人数 | 职责 |
|------|------|------|
| 后端 Lead | 1 | E4 核心接口、架构决策、Code Review |
| 后端开发 | 2~3 | E4/E10/E1 业务实现 |
| 前端开发 | 2 | 管理后台 + 用户端页面 |
| QA | 1 | 集成测试、E2E 测试 |
| DevOps | 0.5 | CI/CD、环境搭建 |

### Sprint 节奏

- Sprint 周期：2 周
- Daily Standup：每日 15 分钟
- Sprint Review：每个 Sprint 结束演示
- Retro：每个 Sprint 结束复盘

---

## 与前序文档关系

- 接口合约：`meeting/11账号与权限中心接口合约冻结.md`
- Schema 设计：`meeting/12一期核心数据库Schema设计.md`
- 一期优先级：`meeting/8一期优先级排序.md`
- 技术选型：`meeting/9技术选型与工程底座.md`
