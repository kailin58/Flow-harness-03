-- Core schema for production-ready baseline (MySQL 8+)

CREATE TABLE IF NOT EXISTS orders (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  order_id VARCHAR(64) NOT NULL,
  member_id BIGINT NOT NULL,
  status VARCHAR(32) NOT NULL,
  amount_payable DECIMAL(18,2) NOT NULL,
  points_redeemed INT NOT NULL DEFAULT 0,
  promoter_user_id BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_orders_order_id (order_id),
  KEY idx_orders_member_created (member_id, created_at DESC),
  KEY idx_orders_status_created (status, created_at DESC)
);

CREATE TABLE IF NOT EXISTS order_items (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  order_id VARCHAR(64) NOT NULL,
  sku_id BIGINT NOT NULL,
  qty INT NOT NULL,
  unit_price DECIMAL(18,2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_order_items_order_id (order_id),
  KEY idx_order_items_sku (sku_id),
  CONSTRAINT fk_order_items_order_id FOREIGN KEY (order_id) REFERENCES orders(order_id)
);

CREATE TABLE IF NOT EXISTS inventory_ledger (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  sku_id BIGINT NOT NULL,
  delta INT NOT NULL,
  ref_type VARCHAR(32) NOT NULL,
  ref_id VARCHAR(64) NOT NULL,
  version BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_inventory_ref (ref_type, ref_id, sku_id),
  KEY idx_inventory_sku_created (sku_id, created_at DESC)
);

CREATE TABLE IF NOT EXISTS idempotency_record (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  scope VARCHAR(64) NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  status VARCHAR(16) NOT NULL,
  response_body JSON NULL,
  trace_id VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  UNIQUE KEY uk_idempo_scope_key (scope, idempotency_key),
  KEY idx_idempo_expires (expires_at)
);

CREATE TABLE IF NOT EXISTS outbox_events (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  event_id VARCHAR(64) NOT NULL,
  aggregate_type VARCHAR(64) NOT NULL,
  aggregate_id VARCHAR(64) NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  payload JSON NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  retry_count INT NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_outbox_event_id (event_id),
  KEY idx_outbox_status_created (status, created_at),
  KEY idx_outbox_next_retry (status, next_retry_at)
);

CREATE TABLE IF NOT EXISTS points_ledger (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  member_id BIGINT NOT NULL,
  change_type VARCHAR(32) NOT NULL,
  change_amount INT NOT NULL,
  balance_after INT NOT NULL,
  ref_type VARCHAR(32) NOT NULL,
  ref_id VARCHAR(64) NOT NULL,
  trace_id VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_points_member_created (member_id, created_at DESC),
  KEY idx_points_ref (ref_type, ref_id)
);

CREATE TABLE IF NOT EXISTS commission_ledger (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  promoter_user_id BIGINT NOT NULL,
  order_id VARCHAR(64) NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  status VARCHAR(32) NOT NULL,
  trace_id VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_commission_promoter_created (promoter_user_id, created_at DESC),
  KEY idx_commission_order (order_id),
  KEY idx_commission_status_created (status, created_at DESC)
);
