# 消息队列运行规范

## Topic 与分区键

- `order-events`：分区键 `order_id`，保证同单顺序。
- `commission-events`：分区键 `promoter_user_id`，平衡吞吐与顺序。
- `points-events`：分区键 `member_id`。

## 消费策略

- 最大重试次数：5 次。
- 重试间隔：指数退避 `1s, 2s, 4s, 8s, 16s`。
- 超限进入 DLQ，标记 `dead_reason`，禁止自动无限重试。

## 告警阈值

- consumer lag > 10,000 持续 5 分钟：P1。
- DLQ 每 10 分钟新增 > 100：P1。
- 单 topic 错误率 > 1% 持续 3 分钟：P1。

## 重放流程

1. SRE/业务值班确认根因。
2. 修复后选择时间窗口重放。
3. 对重放任务开启幂等校验与低速阈值。
4. 重放完成后出具对账结果。
