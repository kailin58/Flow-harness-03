# Query Baselines

## Core Query Patterns

1. Order detail by `order_id`
```sql
SELECT o.order_id, o.status, o.amount_payable, oi.sku_id, oi.qty, oi.unit_price
FROM orders o
JOIN order_items oi ON oi.order_id = o.order_id
WHERE o.order_id = ?;
```

2. Commission summary by `promoter_user_id`
```sql
SELECT promoter_user_id,
       SUM(CASE WHEN status='PENDING' THEN amount ELSE 0 END) AS pending_amount,
       SUM(CASE WHEN status='SETTLED' THEN amount ELSE 0 END) AS settled_amount,
       SUM(CASE WHEN status='REVERSED' THEN amount ELSE 0 END) AS reversed_amount
FROM commission_ledger
WHERE promoter_user_id = ?
GROUP BY promoter_user_id;
```

3. Points ledger keyset pagination
```sql
SELECT id, member_id, change_type, change_amount, balance_after, ref_type, ref_id, trace_id, created_at
FROM points_ledger
WHERE member_id = ?
  AND id < ?
ORDER BY id DESC
LIMIT ?;
```

## Explain Gate

- Every core query must have `EXPLAIN ANALYZE` evidence before release.
- Block release if `type = ALL` appears in online transactional paths.
- Slow query threshold: p95 >= 200ms triggers optimization.
