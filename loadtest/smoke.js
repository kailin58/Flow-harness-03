import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: 20,
  duration: "2m",
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500", "p(99)<800"]
  }
};

const BASE = __ENV.BASE_URL || "http://localhost:3000";
const TOKEN = __ENV.TOKEN || "test-token";

export default function () {
  const payload = JSON.stringify({
    address_id: 10086,
    items: [{ sku_id: 20001, qty: 1 }],
    points_to_use: 100
  });

  const res = http.post(`${BASE}/api/v1/app/orders`, payload, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
      "Idempotency-Key": `k6-${__VU}-${__ITER}`
    }
  });

  check(res, {
    "status is 200": (r) => r.status === 200,
    "trace id exists": (r) => !!r.headers["X-Trace-Id"] || !!r.headers["x-trace-id"]
  });

  sleep(0.2);
}
