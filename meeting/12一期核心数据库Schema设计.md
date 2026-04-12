# 12 一期核心数据库 Schema 设计

## 目的

将已冻结的端域边界、一期范围、接口合约转化为 MySQL 8.4 DDL，支撑 Wave 1（E4 权限底座 + E1 交易主链路）。

本文件冻结：

- 表结构、字段、类型、长度、索引
- 模块归属与命名规范
- 通用字段约定
- Outbox 事件表结构

不包含：

- 存储过程、触发器
- 分库分表策略
- 数据迁移脚本（后续 migration 文件为准）

## 通用约定

### 命名规范

| 对象 | 规范 | 示例 |
|------|------|------|
| 表名 | `{模块前缀}_{实体}` 小写下划线 | `iam_principal`, `trade_order` |
| 主键 | `id` | `id` |
| 外键列 | `{关联实体}_id` | `principal_id`, `module_id` |
| 布尔列 | `is_{形容词}` | `is_high_risk` |
| 时间列 | `{动词}_at` | `created_at`, `frozen_at` |
| 枚举列 | `{名词}_{维度}` | `account_status`, `order_status` |
| 索引 | `idx_{表名}_{列名}` | `idx_iam_principal_type_status` |
| 唯一索引 | `uk_{表名}_{列名}` | `uk_iam_module_code` |

### 通用字段（所有表必有）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | CHAR(36) | UUID v7，主键 |
| created_at | DATETIME(3) NOT NULL | 创建时间 |
| updated_at | DATETIME(3) NOT NULL | 最后更新时间 |
| created_by | CHAR(36) | 创建人 principal_id |
| updated_by | CHAR(36) | 最后更新人 principal_id |

### 软删除

需要软删除的表加 `deleted_at DATETIME(3) DEFAULT NULL`，查询默认过滤 `deleted_at IS NULL`。

### Outbox 约定

所有领域事件必须写入同一库的 `outbox_event` 表，与业务写入在**同一本地事务**内，由 CDC 投递 Kafka。

---

## 模块归属总览

| 模块前缀 | 模块名 | Spring Modulith 模块 |
|----------|--------|---------------------|
| iam | 权限与身份 | `iam-auth` + `iam-permission` |
| catalog | 商品 | `catalog` |
| inventory | 库存 | `inventory` |
| pricing | 价格 | `pricing` |
| trade | 交易 | `trade` |
| payment | 支付 | `payment` |

---

## 一、iam 模块（权限与身份）

### 1.1 iam_module — 模块注册

支撑接口：`POST /api/v1/iam/modules`

```sql
CREATE TABLE iam_module (
  id              CHAR(36)      NOT NULL,
  module_code     VARCHAR(64)   NOT NULL,
  module_name     VARCHAR(128)  NOT NULL,
  module_type     VARCHAR(32)   NOT NULL COMMENT 'admin_module|supplier_module|internal_workbench',
  entry_scope     VARCHAR(32)   NOT NULL COMMENT 'platform_admin|supplier_portal|cs_workbench|fulfillment|user_app',
  owner_domain    VARCHAR(64)   NOT NULL,
  is_high_risk    TINYINT(1)    NOT NULL DEFAULT 0,
  resource_version INT          NOT NULL DEFAULT 1,
  registration_status VARCHAR(16) NOT NULL DEFAULT 'active' COMMENT 'active|deprecated',
  created_at      DATETIME(3)   NOT NULL,
  updated_at      DATETIME(3)   NOT NULL,
  created_by      CHAR(36)      DEFAULT NULL,
  updated_by      CHAR(36)      DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_iam_module_code (module_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 1.2 iam_module_identity_type — 模块支持的身份类型

```sql
CREATE TABLE iam_module_identity_type (
  id              CHAR(36)      NOT NULL,
  module_id       CHAR(36)      NOT NULL,
  identity_type   VARCHAR(32)   NOT NULL COMMENT 'staff|supplier_user|member|system',
  created_at      DATETIME(3)   NOT NULL,
  PRIMARY KEY (id),
  KEY idx_iam_mit_module (module_id),
  UNIQUE KEY uk_iam_mit_module_type (module_id, identity_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 1.3 iam_resource — 模块资源

```sql
CREATE TABLE iam_resource (
  id              CHAR(36)      NOT NULL,
  module_id       CHAR(36)      NOT NULL,
  resource_code   VARCHAR(128)  NOT NULL,
  resource_name   VARCHAR(128)  NOT NULL,
  created_at      DATETIME(3)   NOT NULL,
  updated_at      DATETIME(3)   NOT NULL,
  PRIMARY KEY (id),
  KEY idx_iam_res_module (module_id),
  UNIQUE KEY uk_iam_res_module_code (module_id, resource_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 1.4 iam_action — 资源动作

```sql
CREATE TABLE iam_action (
  id              CHAR(36)      NOT NULL,
  resource_id     CHAR(36)      NOT NULL,
  action_code     VARCHAR(64)   NOT NULL COMMENT 'view|create|update|delete|export|approve',
  action_name     VARCHAR(128)  NOT NULL,
  is_approval_required TINYINT(1) NOT NULL DEFAULT 0,
  is_high_risk    TINYINT(1)    NOT NULL DEFAULT 0,
  created_at      DATETIME(3)   NOT NULL,
  updated_at      DATETIME(3)   NOT NULL,
  PRIMARY KEY (id),
  KEY idx_iam_act_resource (resource_id),
  UNIQUE KEY uk_iam_act_res_code (resource_id, action_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 1.5 iam_principal — 统一身份主体

支撑接口：`GET /api/v1/iam/principals/{id}`

```sql
CREATE TABLE iam_principal (
  id              CHAR(36)      NOT NULL COMMENT '即 principal_id',
  principal_type  VARCHAR(32)   NOT NULL COMMENT 'staff|supplier_user|member|system',
  user_id         CHAR(36)      DEFAULT NULL COMMENT 'Keycloak 主体 ID',
  account_status  VARCHAR(16)   NOT NULL DEFAULT 'active' COMMENT 'active|frozen|disabled|pending',
  identity_types  JSON          NOT NULL COMMENT '["staff"] 具备的身份类型列表',
  last_login_at   DATETIME(3)   DEFAULT NULL,
  last_login_ip   VARCHAR(45)   DEFAULT NULL,
  created_at      DATETIME(3)   NOT NULL,
  updated_at      DATETIME(3)   NOT NULL,
  created_by      CHAR(36)      DEFAULT NULL,
  updated_by      CHAR(36)      DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_iam_prl_type_status (principal_type, account_status),
  KEY idx_iam_prl_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 1.6 iam_staff — 员工账号

```sql
CREATE TABLE iam_staff (
  id              CHAR(36)      NOT NULL COMMENT '即 staff_id',
  principal_id    CHAR(36)      NOT NULL,
  employee_no     VARCHAR(64)   NOT NULL COMMENT '工号',
  name            VARCHAR(128)  NOT NULL,
  email           VARCHAR(256)  DEFAULT NULL,
  phone           VARCHAR(32)   DEFAULT NULL,
  org_id          CHAR(36)      DEFAULT NULL,
  position_id     CHAR(36)      DEFAULT NULL,
  employment_status VARCHAR(16) NOT NULL DEFAULT 'active' COMMENT 'active|offboarded|transferred',
  onboarded_at    DATETIME(3)   DEFAULT NULL,
  offboarded_at   DATETIME(3)   DEFAULT NULL,
  frozen_reason   VARCHAR(512)  DEFAULT NULL,
  frozen_at       DATETIME(3)   DEFAULT NULL,
  created_at      DATETIME(3)   NOT NULL,
  updated_at      DATETIME(3)   NOT NULL,
  created_by      CHAR(36)      DEFAULT NULL,
  updated_by      CHAR(36)      DEFAULT NULL,
  deleted_at      DATETIME(3)   DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_iam_staff_emp_no (employee_no),
  KEY idx_iam_staff_principal (principal_id),
  KEY idx_iam_staff_org (org_id),
  KEY idx_iam_staff_status (employment_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 1.7 iam_supplier_account — 供应商账号（主账号 + 子账号统一表）

```sql
CREATE TABLE iam_supplier_account (
  id              CHAR(36)      NOT NULL COMMENT '即 supplier_user_id',
  principal_id    CHAR(36)      NOT NULL,
  supplier_id     CHAR(36)      NOT NULL COMMENT '关联供应商主体 ID',
  account_type    VARCHAR(16)   NOT NULL COMMENT 'main|sub',
  name            VARCHAR(128)  NOT NULL,
  phone           VARCHAR(32)   DEFAULT NULL,
  email           VARCHAR(256)  DEFAULT NULL,
  account_status  VARCHAR(16)   NOT NULL DEFAULT 'active' COMMENT 'active|frozen|disabled',
  disabled_reason VARCHAR(512)  DEFAULT NULL,
  created_at      DATETIME(3)   NOT NULL,
  updated_at      DATETIME(3)   NOT NULL,
  created_by      CHAR(36)      DEFAULT NULL,
  updated_by      CHAR(36)      DEFAULT NULL,
  deleted_at      DATETIME(3)   DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_iam_sa_principal (principal_id),
  KEY idx_iam_sa_supplier (supplier_id),
  KEY idx_iam_sa_supplier_type (supplier_id, account_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 1.8 iam_org — 组织

```sql
CREATE TABLE iam_org (
  id              CHAR(36)      NOT NULL,
  org_code        VARCHAR(64)   NOT NULL,
  org_name        VARCHAR(128)  NOT NULL,
  parent_id       CHAR(36)      DEFAULT NULL,
  org_level       SMALLINT      NOT NULL DEFAULT 1 COMMENT '1=公司 2=部门 3=组',
  sort_order      INT           NOT NULL DEFAULT 0,
  org_status      VARCHAR(16)   NOT NULL DEFAULT 'active' COMMENT 'active|disabled',
  created_at      DATETIME(3)   NOT NULL,
  updated_at      DATETIME(3)   NOT NULL,
  created_by      CHAR(36)      DEFAULT NULL,
  updated_by      CHAR(36)      DEFAULT NULL,
  deleted_at      DATETIME(3)   DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_iam_org_code (org_code),
  KEY idx_iam_org_parent (parent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 1.9 iam_position — 岗位

```sql
CREATE TABLE iam_position (
  id              CHAR(36)      NOT NULL,
  position_code   VARCHAR(64)   NOT NULL,
  position_name   VARCHAR(128)  NOT NULL,
  org_id          CHAR(36)      NOT NULL,
  default_role_ids JSON         DEFAULT NULL COMMENT '默认角色 ID 列表',
  sort_order      INT           NOT NULL DEFAULT 0,
  position_status VARCHAR(16)   NOT NULL DEFAULT 'active' COMMENT 'active|disabled',
  created_at      DATETIME(3)   NOT NULL,
  updated_at      DATETIME(3)   NOT NULL,
  created_by      CHAR(36)      DEFAULT NULL,
  updated_by      CHAR(36)      DEFAULT NULL,
  deleted_at      DATETIME(3)   DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_iam_pos_code (position_code),
  KEY idx_iam_pos_org (org_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 1.10 iam_role — 角色

```sql
CREATE TABLE iam_role (
  id              CHAR(36)      NOT NULL,
  role_code       VARCHAR(64)   NOT NULL,
  role_name       VARCHAR(128)  NOT NULL,
  role_type       VARCHAR(16)   NOT NULL DEFAULT 'custom' COMMENT 'system|template|custom',
  module_id       CHAR(36)      DEFAULT NULL COMMENT '归属模块，null=全局角色',
  description     VARCHAR(512)  DEFAULT NULL,
  role_status     VARCHAR(16)   NOT NULL DEFAULT 'active' COMMENT 'active|disabled',
  created_at      DATETIME(3)   NOT NULL,
  updated_at      DATETIME(3)   NOT NULL,
  created_by      CHAR(36)      DEFAULT NULL,
  updated_by      CHAR(36)      DEFAULT NULL,
  deleted_at      DATETIME(3)   DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_iam_role_code (role_code),
  KEY idx_iam_role_module (module_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 1.11 iam_role_action — 角色-动作绑定

```sql
CREATE TABLE iam_role_action (
  id              CHAR(36)      NOT NULL,
  role_id         CHAR(36)      NOT NULL,
  action_id       CHAR(36)      NOT NULL,
  created_at      DATETIME(3)   NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_iam_ra_role_action (role_id, action_id),
  KEY idx_iam_ra_role (role_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 1.12 iam_principal_role — 主体-角色绑定

```sql
CREATE TABLE iam_principal_role (
  id              CHAR(36)      NOT NULL,
  principal_id    CHAR(36)      NOT NULL,
  role_id         CHAR(36)      NOT NULL,
  scope_type      VARCHAR(16)   NOT NULL DEFAULT 'org' COMMENT 'org|supplier|brand|store|channel|department',
  scope_ids       JSON          NOT NULL COMMENT '白名单 ID 列表，["*"]=全部',
  effective_from  DATETIME(3)   DEFAULT NULL,
  effective_to    DATETIME(3)   DEFAULT NULL COMMENT 'null=永久',
  binding_status  VARCHAR(16)   NOT NULL DEFAULT 'active' COMMENT 'active|revoked',
  created_at      DATETIME(3)   NOT NULL,
  updated_at      DATETIME(3)   NOT NULL,
  created_by      CHAR(36)      DEFAULT NULL,
  updated_by      CHAR(36)      DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_iam_pr_principal (principal_id),
  KEY idx_iam_pr_role (role_id),
  KEY idx_iam_pr_principal_status (principal_id, binding_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 1.13 iam_data_scope — 数据范围规则

支撑接口：`GET /api/v1/iam/principals/{id}/data-scopes`

```sql
CREATE TABLE iam_data_scope (
  id              CHAR(36)      NOT NULL,
  principal_role_id CHAR(36)    NOT NULL COMMENT '关联 iam_principal_role.id',
  scope_dimension VARCHAR(32)   NOT NULL COMMENT 'org|supplier|brand|store|channel|department',
  scope_type      VARCHAR(16)   NOT NULL COMMENT 'all|whitelist|none',
  scope_ids       JSON          DEFAULT NULL COMMENT '白名单时存 ID 列表',
  created_at      DATETIME(3)   NOT NULL,
  updated_at      DATETIME(3)   NOT NULL,
  PRIMARY KEY (id),
  KEY idx_iam_ds_principal_role (principal_role_id),
  UNIQUE KEY uk_iam_ds_pr_dim (principal_role_id, scope_dimension)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 1.14 iam_field_scope — 字段范围规则

支撑接口：`GET /api/v1/iam/principals/{id}/field-scopes`（一期预留）

```sql
CREATE TABLE iam_field_scope (
  id              CHAR(36)      NOT NULL,
  principal_role_id CHAR(36)    NOT NULL COMMENT '关联 iam_principal_role.id',
  module_id       CHAR(36)      NOT NULL,
  field_code      VARCHAR(128)  NOT NULL COMMENT 'cost_price|customer_phone|settlement_amount|...',
  access_level    VARCHAR(16)   NOT NULL COMMENT 'visible|masked|hidden',
  exportable      TINYINT(1)    NOT NULL DEFAULT 0,
  created_at      DATETIME(3)   NOT NULL,
  updated_at      DATETIME(3)   NOT NULL,
  PRIMARY KEY (id),
  KEY idx_iam_fs_principal_role (principal_role_id),
  KEY idx_iam_fs_module (module_id),
  UNIQUE KEY uk_iam_fs_pr_module_field (principal_role_id, module_id, field_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 1.15 iam_security_policy — 安全策略

```sql
CREATE TABLE iam_security_policy (
  id              CHAR(36)      NOT NULL,
  identity_type   VARCHAR(32)   NOT NULL COMMENT 'staff|supplier_user',
  policy_type     VARCHAR(32)   NOT NULL COMMENT 'password|second_verify|device_trust|login_alert|ip_whitelist',
  policy_config   JSON          NOT NULL COMMENT '策略配置，结构由 policy_type 决定',
  is_enabled      TINYINT(1)    NOT NULL DEFAULT 1,
  effective_from  DATETIME(3)   DEFAULT NULL,
  effective_to    DATETIME(3)   DEFAULT NULL,
  created_at      DATETIME(3)   NOT NULL,
  updated_at      DATETIME(3)   NOT NULL,
  created_by      CHAR(36)      DEFAULT NULL,
  updated_by      CHAR(36)      DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_iam_sp_type_identity (identity_type, policy_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 1.16 iam_audit_event — 审计日志

支撑接口：`POST /api/v1/iam/audit-events`（由 Outbox CDC 写入 OpenSearch，此表为 MySQL 落地备份）

```sql
CREATE TABLE iam_audit_event (
  id              CHAR(36)      NOT NULL,
  event_type      VARCHAR(32)   NOT NULL COMMENT 'login|logout|export|config_change|batch_operation|approval|high_risk_action|data_access|permission_change',
  module_code     VARCHAR(64)   NOT NULL,
  resource        VARCHAR(128)  NOT NULL,
  action          VARCHAR(64)   NOT NULL,
  operator_id     CHAR(36)      NOT NULL,
  target_id       VARCHAR(128)  NOT NULL,
  target_type     VARCHAR(64)   DEFAULT NULL,
  result          VARCHAR(16)   NOT NULL COMMENT 'success|failure|denied',
  before_snapshot JSON          DEFAULT NULL,
  after_snapshot  JSON          DEFAULT NULL,
  trace_id        CHAR(32)      NOT NULL,
  ip              VARCHAR(45)   DEFAULT NULL,
  device_id       VARCHAR(128)  DEFAULT NULL,
  user_agent      VARCHAR(512)  DEFAULT NULL,
  remark          VARCHAR(1024) DEFAULT NULL,
  occurred_at     DATETIME(3)   NOT NULL,
  created_at      DATETIME(3)   NOT NULL,
  PRIMARY KEY (id),
  KEY idx_iam_ae_type_time (event_type, occurred_at),
  KEY idx_iam_ae_module_time (module_code, occurred_at),
  KEY idx_iam_ae_operator (operator_id, occurred_at),
  KEY idx_iam_ae_target (target_id, occurred_at),
  KEY idx_iam_ae_trace (trace_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## 二、catalog 模块（商品）

### 2.1 catalog_brand — 品牌

```sql
CREATE TABLE catalog_brand (
  id              CHAR(36)      NOT NULL,
  brand_code      VARCHAR(64)   NOT NULL,
  brand_name      VARCHAR(128)  NOT NULL,
  brand_name_en   VARCHAR(128)  DEFAULT NULL,
  logo_url        VARCHAR(512)  DEFAULT NULL,
  brand_status    VARCHAR(16)   NOT NULL DEFAULT 'active' COMMENT 'active|disabled',
  created_at      DATETIME(3)   NOT NULL,
  updated_at      DATETIME(3)   NOT NULL,
  created_by      CHAR(36)      DEFAULT NULL,
  updated_by      CHAR(36)      DEFAULT NULL,
  deleted_at      DATETIME(3)   DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_cat_brand_code (brand_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 2.2 catalog_category — 类目

```sql
CREATE TABLE catalog_category (
  id              CHAR(36)      NOT NULL,
  category_code   VARCHAR(64)   NOT NULL,
  category_name   VARCHAR(128)  NOT NULL,
  parent_id       CHAR(36)      DEFAULT NULL,
  category_level  SMALLINT      NOT NULL DEFAULT 1 COMMENT '1|2|3',
  sort_order      INT           NOT NULL DEFAULT 0,
  icon_url        VARCHAR(512)  DEFAULT NULL,
  category_status VARCHAR(16)   NOT NULL DEFAULT 'active' COMMENT 'active|disabled',
  created_at      DATETIME(3)   NOT NULL,
  updated_at      DATETIME(3)   NOT NULL,
  created_by      CHAR(36)      DEFAULT NULL,
  updated_by      CHAR(36)      DEFAULT NULL,
  deleted_at      DATETIME(3)   DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_cat_cat_code (category_code),
  KEY idx_cat_cat_parent (parent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 2.3 catalog_spu — 标准商品单元

```sql
CREATE TABLE catalog_spu (
  id              CHAR(36)      NOT NULL,
  spu_code        VARCHAR(64)   NOT NULL,
  spu_name        VARCHAR(256)  NOT NULL,
  brand_id        CHAR(36)      DEFAULT NULL,
  category_id     CHAR(36)      NOT NULL,
  supplier_id     CHAR(36)      NOT NULL COMMENT '归属供应商',
  main_image      VARCHAR(512)  DEFAULT NULL,
  images          JSON          DEFAULT NULL COMMENT '图片 URL 列表',
  description     TEXT          DEFAULT NULL COMMENT '商品详情（富文本）',
  spu_status      VARCHAR(16)   NOT NULL DEFAULT 'draft' COMMENT 'draft|pending_review|approved|rejected|disabled',
  audit_remark    VARCHAR(512)  DEFAULT NULL,
  attribute_defs  JSON          DEFAULT NULL COMMENT '规格定义 [{"name":"颜色","values":["黑","白"]}]',
  created_at      DATETIME(3)   NOT NULL,
  updated_at      DATETIME(3)   NOT NULL,
  created_by      CHAR(36)      DEFAULT NULL,
  updated_by      CHAR(36)      DEFAULT NULL,
  deleted_at      DATETIME(3)   DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_cat_spu_code (spu_code),
  KEY idx_cat_spu_supplier (supplier_id),
  KEY idx_cat_spu_category (category_id),
  KEY idx_cat_spu_status (spu_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 2.4 catalog_sku — 库存单元

```sql
CREATE TABLE catalog_sku (
  id              CHAR(36)      NOT NULL,
  sku_code        VARCHAR(64)   NOT NULL,
  spu_id          CHAR(36)      NOT NULL,
  sku_name        VARCHAR(256)  NOT NULL,
  attributes      JSON          NOT NULL COMMENT '规格值 {"颜色":"黑","尺码":"M"}',
  main_image      VARCHAR(512)  DEFAULT NULL,
  barcode         VARCHAR(64)   DEFAULT NULL,
  weight_gram     INT           DEFAULT NULL COMMENT '重量（克）',
  sku_status      VARCHAR(16)   NOT NULL DEFAULT 'draft' COMMENT 'draft|active|disabled',
  created_at      DATETIME(3)   NOT NULL,
  updated_at      DATETIME(3)   NOT NULL,
  created_by      CHAR(36)      DEFAULT NULL,
  updated_by      CHAR(36)      DEFAULT NULL,
  deleted_at      DATETIME(3)   DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_cat_sku_code (sku_code),
  KEY idx_cat_sku_spu (spu_id),
  KEY idx_cat_sku_status (sku_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## 三、inventory 模块（库存）

### 3.1 inventory_stock — 库存

```sql
CREATE TABLE inventory_stock (
  id              CHAR(36)      NOT NULL,
  sku_id          CHAR(36)      NOT NULL,
  supplier_id     CHAR(36)      NOT NULL,
  available_qty   INT           NOT NULL DEFAULT 0 COMMENT '可用库存',
  locked_qty      INT           NOT NULL DEFAULT 0 COMMENT '锁定库存（下单未支付）',
  safety_qty      INT           NOT NULL DEFAULT 0 COMMENT '安全库存阈值',
  total_qty       INT           NOT NULL DEFAULT 0 COMMENT '总库存 = available + locked',
  stock_status    VARCHAR(16)   NOT NULL DEFAULT 'normal' COMMENT 'normal|low_stock|out_of_stock',
  created_at      DATETIME(3)   NOT NULL,
  updated_at      DATETIME(3)   NOT NULL,
  created_by      CHAR(36)      DEFAULT NULL,
  updated_by      CHAR(36)      DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_inv_stock_sku_supplier (sku_id, supplier_id),
  KEY idx_inv_stock_supplier (supplier_id),
  KEY idx_inv_stock_status (stock_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 3.2 inventory_stock_journal — 库存流水

```sql
CREATE TABLE inventory_stock_journal (
  id              CHAR(36)      NOT NULL,
  sku_id          CHAR(36)      NOT NULL,
  supplier_id     CHAR(36)      NOT NULL,
  change_type     VARCHAR(32)   NOT NULL COMMENT 'inbound|outbound|lock|unlock|adjust',
  change_qty      INT           NOT NULL COMMENT '正数=增加，负数=减少',
  before_qty      INT           NOT NULL,
  after_qty       INT           NOT NULL,
  biz_type        VARCHAR(32)   NOT NULL COMMENT 'order|refund|adjustment|supplier_import',
  biz_id          VARCHAR(128)  NOT NULL COMMENT '关联业务 ID（订单号等）',
  trace_id        CHAR(32)      NOT NULL,
  remark          VARCHAR(512)  DEFAULT NULL,
  occurred_at     DATETIME(3)   NOT NULL,
  created_at      DATETIME(3)   NOT NULL,
  PRIMARY KEY (id),
  KEY idx_inv_sj_sku_time (sku_id, occurred_at),
  KEY idx_inv_sj_supplier_time (supplier_id, occurred_at),
  KEY idx_inv_sj_biz (biz_type, biz_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## 四、pricing 模块（价格）

### 4.1 pricing_sku_price — SKU 价格

```sql
CREATE TABLE pricing_sku_price (
  id              CHAR(36)      NOT NULL,
  sku_id          CHAR(36)      NOT NULL,
  supplier_id     CHAR(36)      NOT NULL,
  cost_price      DECIMAL(12,2) NOT NULL COMMENT '成本价（供应商）',
  selling_price   DECIMAL(12,2) NOT NULL COMMENT '销售价',
  original_price  DECIMAL(12,2) DEFAULT NULL COMMENT '划线价',
  commission_rate DECIMAL(5,4)  DEFAULT NULL COMMENT '一级佣金比例',
  points_rate     DECIMAL(5,4)  DEFAULT NULL COMMENT '积分抵现比例',
  price_status    VARCHAR(16)   NOT NULL DEFAULT 'active' COMMENT 'active|disabled',
  effective_from  DATETIME(3)   DEFAULT NULL,
  effective_to    DATETIME(3)   DEFAULT NULL,
  created_at      DATETIME(3)   NOT NULL,
  updated_at      DATETIME(3)   NOT NULL,
  created_by      CHAR(36)      DEFAULT NULL,
  updated_by      CHAR(36)      DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_pricing_sku_supplier (sku_id, supplier_id),
  KEY idx_pricing_sp_supplier (supplier_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 4.2 pricing_price_snapshot — 价格快照

用途：E5（分销）与 E6（积分）必须共用同一快照源，防止分摊冲突。

```sql
CREATE TABLE pricing_price_snapshot (
  id              CHAR(36)      NOT NULL,
  order_id        CHAR(36)      NOT NULL COMMENT '关联订单',
  sku_id          CHAR(36)      NOT NULL,
  supplier_id     CHAR(36)      NOT NULL,
  cost_price      DECIMAL(12,2) NOT NULL,
  selling_price   DECIMAL(12,2) NOT NULL,
  commission_rate DECIMAL(5,4)  DEFAULT NULL,
  points_rate     DECIMAL(5,4)  DEFAULT NULL,
  snapshot_source VARCHAR(16)   NOT NULL DEFAULT 'order_create' COMMENT 'order_create|manual',
  created_at      DATETIME(3)   NOT NULL,
  PRIMARY KEY (id),
  KEY idx_pps_order (order_id),
  KEY idx_pps_sku (sku_id),
  UNIQUE KEY uk_pps_order_sku (order_id, sku_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## 五、trade 模块（交易）

### 5.1 trade_cart — 购物车

```sql
CREATE TABLE trade_cart (
  id              CHAR(36)      NOT NULL,
  member_id       CHAR(36)      NOT NULL COMMENT '会员 principal_id',
  created_at      DATETIME(3)   NOT NULL,
  updated_at      DATETIME(3)   NOT NULL,
  PRIMARY KEY (id),
  KEY idx_trade_cart_member (member_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 5.2 trade_cart_item — 购物车明细

```sql
CREATE TABLE trade_cart_item (
  id              CHAR(36)      NOT NULL,
  cart_id         CHAR(36)      NOT NULL,
  sku_id          CHAR(36)      NOT NULL,
  supplier_id     CHAR(36)      NOT NULL,
  quantity        INT           NOT NULL DEFAULT 1,
  checked         TINYINT(1)    NOT NULL DEFAULT 1,
  created_at      DATETIME(3)   NOT NULL,
  updated_at      DATETIME(3)   NOT NULL,
  PRIMARY KEY (id),
  KEY idx_trade_ci_cart (cart_id),
  UNIQUE KEY uk_trade_ci_cart_sku (cart_id, sku_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 5.3 trade_order — 订单

```sql
CREATE TABLE trade_order (
  id              CHAR(36)      NOT NULL,
  order_no        VARCHAR(32)   NOT NULL COMMENT '业务订单号，如 ORD20260409143000001',
  member_id       CHAR(36)      NOT NULL COMMENT '会员 principal_id',
  order_type      VARCHAR(16)   NOT NULL DEFAULT 'normal' COMMENT 'normal|points_exchange|distribution',
  order_status    VARCHAR(16)   NOT NULL DEFAULT 'created' COMMENT 'created|paid|shipped|delivered|completed|cancelled|refunding|closed',
  total_amount    DECIMAL(12,2) NOT NULL COMMENT '商品总金额',
  discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT '优惠金额',
  freight_amount  DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT '运费',
  pay_amount      DECIMAL(12,2) NOT NULL COMMENT '实付金额 = total - discount + freight',
  points_amount   DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT '积分抵扣金额',
  points_used     INT           NOT NULL DEFAULT 0 COMMENT '使用积分数',
  consignee_name  VARCHAR(128)  NOT NULL COMMENT '收货人',
  consignee_phone VARCHAR(32)   NOT NULL,
  consignee_address VARCHAR(512) NOT NULL COMMENT '完整收货地址',
  province        VARCHAR(64)   DEFAULT NULL,
  city            VARCHAR(64)   DEFAULT NULL,
  district        VARCHAR(64)   DEFAULT NULL,
  remark          VARCHAR(512)  DEFAULT NULL COMMENT '买家备注',
  paid_at         DATETIME(3)   DEFAULT NULL,
  shipped_at      DATETIME(3)   DEFAULT NULL,
  delivered_at    DATETIME(3)   DEFAULT NULL,
  completed_at    DATETIME(3)   DEFAULT NULL,
  cancelled_at    DATETIME(3)   DEFAULT NULL,
  cancel_reason   VARCHAR(256)  DEFAULT NULL,
  trace_id        CHAR(32)      NOT NULL COMMENT '创建时的 trace_id',
  created_at      DATETIME(3)   NOT NULL,
  updated_at      DATETIME(3)   NOT NULL,
  created_by      CHAR(36)      DEFAULT NULL,
  updated_by      CHAR(36)      DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_trade_order_no (order_no),
  KEY idx_trade_order_member (member_id, created_at),
  KEY idx_trade_order_status (order_status, created_at),
  KEY idx_trade_order_paid (paid_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 5.4 trade_order_item — 订单明细

```sql
CREATE TABLE trade_order_item (
  id              CHAR(36)      NOT NULL,
  order_id        CHAR(36)      NOT NULL,
  sku_id          CHAR(36)      NOT NULL,
  spu_id          CHAR(36)      NOT NULL,
  supplier_id     CHAR(36)      NOT NULL,
  sku_name        VARCHAR(256)  NOT NULL,
  sku_image       VARCHAR(512)  DEFAULT NULL,
  attributes      JSON          NOT NULL COMMENT '规格快照',
  quantity        INT           NOT NULL,
  selling_price   DECIMAL(12,2) NOT NULL COMMENT '下单时销售价',
  cost_price      DECIMAL(12,2) NOT NULL COMMENT '下单时成本价',
  total_amount    DECIMAL(12,2) NOT NULL COMMENT 'selling_price * quantity',
  commission_rate DECIMAL(5,4)  DEFAULT NULL COMMENT '下单时佣金比例（来自快照）',
  points_rate     DECIMAL(5,4)  DEFAULT NULL COMMENT '下单时积分比例（来自快照）',
  item_status     VARCHAR(16)   NOT NULL DEFAULT 'normal' COMMENT 'normal|refunding|refunded',
  created_at      DATETIME(3)   NOT NULL,
  updated_at      DATETIME(3)   NOT NULL,
  PRIMARY KEY (id),
  KEY idx_trade_oi_order (order_id),
  KEY idx_trade_oi_supplier (supplier_id),
  KEY idx_trade_oi_sku (sku_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## 六、payment 模块（支付）

### 6.1 payment_payment — 支付记录

```sql
CREATE TABLE payment_payment (
  id              CHAR(36)      NOT NULL,
  payment_no      VARCHAR(32)   NOT NULL COMMENT '支付单号',
  order_id        CHAR(36)      NOT NULL,
  member_id       CHAR(36)      NOT NULL,
  pay_amount      DECIMAL(12,2) NOT NULL COMMENT '实付金额',
  pay_channel     VARCHAR(32)   NOT NULL COMMENT 'wechat_pay|alipay|points',
  pay_status      VARCHAR(16)   NOT NULL DEFAULT 'pending' COMMENT 'pending|paid|failed|refunding|refunded|closed',
  third_party_no  VARCHAR(128)  DEFAULT NULL COMMENT '第三方支付流水号',
  paid_at         DATETIME(3)   DEFAULT NULL,
  expired_at      DATETIME(3)   DEFAULT NULL COMMENT '支付过期时间',
  callback_raw    JSON          DEFAULT NULL COMMENT '支付回调原始报文',
  callback_at     DATETIME(3)   DEFAULT NULL,
  trace_id        CHAR(32)      NOT NULL,
  created_at      DATETIME(3)   NOT NULL,
  updated_at      DATETIME(3)   NOT NULL,
  created_by      CHAR(36)      DEFAULT NULL,
  updated_by      CHAR(36)      DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_pay_payment_no (payment_no),
  KEY idx_pay_payment_order (order_id),
  KEY idx_pay_payment_member (member_id, created_at),
  KEY idx_pay_payment_status (pay_status, created_at),
  KEY idx_pay_payment_third_party (third_party_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## 七、outbox_event — 统一 Outbox 事件表

所有模块共用，与业务写入在同一本地事务内。

```sql
CREATE TABLE outbox_event (
  id              CHAR(36)      NOT NULL,
  aggregate_type  VARCHAR(64)   NOT NULL COMMENT '聚合根类型，如 Order, Payment, Principal',
  aggregate_id    CHAR(36)      NOT NULL COMMENT '聚合根 ID',
  event_type      VARCHAR(128)  NOT NULL COMMENT '事件名，如 OrderPaid, AccountStaffFrozen',
  payload         JSON          NOT NULL COMMENT '事件负载',
  trace_id        CHAR(32)      NOT NULL,
  created_at      DATETIME(3)   NOT NULL,
  published_at    DATETIME(3)   DEFAULT NULL COMMENT 'CDC 投递成功后标记',
  PRIMARY KEY (id),
  KEY idx_outbox_aggregate (aggregate_type, aggregate_id),
  KEY idx_outbox_created (created_at),
  KEY idx_outbox_unpublished (published_at, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 一期必须投递的事件

| aggregate_type | event_type | 说明 | Topic |
|----------------|-----------|------|-------|
| Principal | AccountStaffOnboarded | 员工入职 | iam.lifecycle.staff |
| Principal | AccountStaffOffboarded | 员工离职 | iam.lifecycle.staff |
| Principal | AccountStaffTransferred | 员工转岗 | iam.lifecycle.staff |
| Principal | AccountStaffFrozen | 员工冻结 | iam.lifecycle.staff |
| Principal | AccountStaffUnfrozen | 员工解冻 | iam.lifecycle.staff |
| Principal | AccountSupplierMainEnabled | 供应商主账号启用 | iam.lifecycle.supplier |
| Principal | AccountSupplierMainDisabled | 供应商主账号停用 | iam.lifecycle.supplier |
| Principal | AccountSupplierSubChanged | 供应商子账号变更 | iam.lifecycle.supplier |
| Principal | AccountRoleChanged | 角色变更 | iam.lifecycle.role |
| Principal | AccountScopeChanged | 数据范围变更 | iam.lifecycle.scope |
| Order | OrderCreated | 订单创建 | trade.event |
| Order | OrderPaid | 订单支付 | trade.event |
| Order | OrderShipped | 订单发货 | trade.event |
| Order | OrderDelivered | 订单确认收货 | trade.event |
| Order | OrderCancelled | 订单取消 | trade.event |
| Payment | PaymentSucceeded | 支付成功 | payment.event |
| Payment | PaymentFailed | 支付失败 | payment.event |
| Payment | PaymentRefunded | 支付退款 | payment.event |

---

## 索引策略补充

### 高频查询索引（按模块）

**iam 模块**
- 鉴权热路径：`iam_principal.id` + `iam_principal_role.principal_id` + `iam_role_action.role_id`
- 审计查询：`iam_audit_event.event_type + occurred_at`、`operator_id + occurred_at`

**trade 模块**
- 会员订单列表：`trade_order.member_id + created_at`
- 订单状态流转：`trade_order.order_status + created_at`
- 供应商订单：`trade_order_item.supplier_id`（覆盖索引）

**inventory 模块**
- 下单锁库存：`inventory_stock.sku_id + supplier_id`（唯一索引）
- 库存流水：`inventory_stock_journal.sku_id + occurred_at`

### 暂不加的索引

- 不在 JSON 列上建索引（MySQL 8.4 的函数索引按需后续加）
- 不建联合索引超过 4 列
- 不预留未确认查询模式的索引

---

## 与前序文档关系

- 接口合约冻结：`meeting/11账号与权限中心接口合约冻结.md`
- 技术选型：`meeting/9技术选型与工程底座.md`
- 一期范围冻结：`meeting/7一期范围冻结.md`
- 一期优先级：`meeting/8一期优先级排序.md`
- 端域边界：`meeting/6端域边界.md`
- 术语口径：`meeting/10术语与口径统一表.md`
