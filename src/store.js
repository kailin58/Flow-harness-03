const { randomUUID } = require("node:crypto");

const state = {
  orders: new Map(),
  idempotency: new Map(),
  inventory: new Map([[20001, 1000]]),
  commissions: new Map([[90001, { pending: 1234.56, settled: 987.65, reversed: 12.34 }]]),
  pointsLedger: new Map([[80001, []]]),
  outboxEvents: []
};

function getIdempotent(scope, key) {
  return state.idempotency.get(`${scope}:${key}`);
}

function setIdempotent(scope, key, value) {
  state.idempotency.set(`${scope}:${key}`, value);
}

function createOrder(payload) {
  for (const item of payload.items) {
    const available = state.inventory.get(item.sku_id) || 0;
    if (available < item.qty) {
      const err = new Error(`Insufficient inventory for sku ${item.sku_id}`);
      err.code = "INV-409-INSUFFICIENT";
      throw err;
    }
  }
  for (const item of payload.items) {
    const available = state.inventory.get(item.sku_id) || 0;
    state.inventory.set(item.sku_id, available - item.qty);
  }

  const orderId = `O${Date.now()}`;
  const paymentOrderId = `P${Date.now()}`;
  const order = {
    order_id: orderId,
    payment_order_id: paymentOrderId,
    amount_payable: 199.0,
    price_snapshot_id: randomUUID(),
    status: "CREATED",
    member_id: 80001,
    points_redeemed: payload.points_to_use || 0,
    items: payload.items.map((it) => ({ ...it, unit_price: 99.5 }))
  };
  state.orders.set(orderId, order);
  appendOutbox("OrderCreated", order.order_id, {
    order_id: order.order_id,
    payment_order_id: order.payment_order_id,
    member_id: order.member_id
  });
  return order;
}

function getOrder(orderId) {
  return state.orders.get(orderId);
}

function getCommissionSummary(promoterUserId = 90001) {
  const row = state.commissions.get(promoterUserId) || { pending: 0, settled: 0, reversed: 0 };
  return {
    promoter_user_id: promoterUserId,
    pending_amount: row.pending,
    settled_amount: row.settled,
    reversed_amount: row.reversed
  };
}

function getPointsLedger(memberId = 80001, page = 1, size = 20) {
  const rows = state.pointsLedger.get(memberId) || [];
  const start = (page - 1) * size;
  return {
    page,
    size,
    total: rows.length,
    records: rows.slice(start, start + size)
  };
}

function appendOutbox(eventType, aggregateId, payload) {
  state.outboxEvents.push({
    event_id: randomUUID(),
    event_type: eventType,
    aggregate_id: aggregateId,
    payload,
    created_at: Date.now(),
    status: "PENDING"
  });
}

function consumeOutbox(limit = 50) {
  const batch = [];
  for (const evt of state.outboxEvents) {
    if (evt.status !== "PENDING") continue;
    evt.status = "CONSUMED";
    batch.push(evt);
    if (batch.length >= limit) break;
  }
  return batch;
}

function markOrderPaid(paymentOrderId) {
  const order = Array.from(state.orders.values()).find((o) => o.payment_order_id === paymentOrderId);
  if (!order) return null;
  order.status = "PAID";
  appendOutbox("OrderPaid", order.order_id, {
    order_id: order.order_id,
    member_id: order.member_id,
    points_redeemed: order.points_redeemed
  });
  return order;
}

function applyOrderPaidSideEffects(order) {
  const promoter = state.commissions.get(90001) || { pending: 0, settled: 0, reversed: 0 };
  promoter.pending += Number((order.amount_payable * 0.05).toFixed(2));
  state.commissions.set(90001, promoter);

  const ledger = state.pointsLedger.get(order.member_id) || [];
  const prev = ledger.length > 0 ? ledger[ledger.length - 1].balance_after : 0;
  const earn = Math.floor(order.amount_payable);
  ledger.push({
    member_id: order.member_id,
    change_type: "CONSUMPTION_EARN",
    change_amount: earn,
    balance_after: prev + earn,
    ref_type: "ORDER_PAY",
    ref_id: order.order_id,
    trace_id: `trc_${randomUUID()}`
  });
  state.pointsLedger.set(order.member_id, ledger);
}

module.exports = {
  getIdempotent,
  setIdempotent,
  createOrder,
  getOrder,
  getCommissionSummary,
  getPointsLedger,
  markOrderPaid,
  consumeOutbox,
  applyOrderPaidSideEffects
};
