# 一致性与幂等机制

## 事务边界

- 同步事务：下单、库存锁定、幂等记录写入、outbox 事件写入在同一本地事务中完成。
- 异步事务：支付回调、积分发放、佣金结算通过 outbox + consumer 最终一致。

## 幂等模型

- 请求幂等键：`scope + Idempotency-Key` 唯一约束。
- 状态流转：`PROCESSING -> SUCCEEDED/FAILED`。
- 重放策略：若命中 `SUCCEEDED` 则返回历史响应并带 `Idempotency-Replayed: true`。

## 重试与补偿

- 重试采用指数退避：`1s -> 2s -> 4s -> 8s -> 16s`，最大 5 次。
- 超限消息进入 DLQ，必须人工确认后重放。
- 退款冲正遵循先冻结后冲减，再做追偿补单。
