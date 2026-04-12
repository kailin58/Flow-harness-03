const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createApp } = require("../../src/app");
const { startWorker } = require("../../src/worker");

test("order create -> payment callback -> commission and points visible", async (t) => {
  const app = createApp({
    rateLimitPerMinute: 10000
  });
  const server = http.createServer(app);
  const stopWorker = startWorker({ info() {} });
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => {
    stopWorker();
    server.close();
  });

  const port = server.address().port;
  const headers = {
    "Content-Type": "application/json",
    Authorization: "Bearer test-token",
    "Idempotency-Key": `test-${Date.now()}`
  };

  const createRes = await fetch(`http://127.0.0.1:${port}/api/v1/app/orders`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      address_id: 10086,
      items: [{ sku_id: 20001, qty: 1 }],
      points_to_use: 50
    })
  });
  assert.equal(createRes.status, 200);
  const created = await createRes.json();
  assert.ok(created.order_id);

  const callbackRes = await fetch(`http://127.0.0.1:${port}/api/v1/app/payments/callback`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer test-token" },
    body: JSON.stringify({ payment_order_id: created.payment_order_id, payment_status: "SUCCESS" })
  });
  assert.equal(callbackRes.status, 200);

  await new Promise((resolve) => setTimeout(resolve, 700));

  const orderRes = await fetch(`http://127.0.0.1:${port}/api/v1/app/orders/${created.order_id}`, {
    headers: { Authorization: "Bearer test-token" }
  });
  const order = await orderRes.json();
  assert.equal(order.status, "PAID");

  const pointsRes = await fetch(`http://127.0.0.1:${port}/api/v1/app/member/points/ledger`, {
    headers: { Authorization: "Bearer test-token" }
  });
  const points = await pointsRes.json();
  assert.ok(points.total >= 1);
});
