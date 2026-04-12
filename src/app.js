const express = require("express");
const helmet = require("helmet");
const { z } = require("zod");
const { randomUUID } = require("node:crypto");
const pino = require("pino");
const pinoHttp = require("pino-http");
const { httpCounter, httpDuration, register } = require("./metrics");
const {
  getIdempotent,
  setIdempotent,
  createOrder,
  getOrder,
  getCommissionSummary,
  getPointsLedger,
  markOrderPaid
} = require("./store");

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

const createOrderSchema = z.object({
  address_id: z.number().int().positive(),
  items: z.array(z.object({ sku_id: z.number().int().positive(), qty: z.number().int().positive() })).min(1),
  points_to_use: z.number().int().min(0).optional()
});

function createApp(config) {
  const app = express();
  const rateBucket = new Map();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(express.json({ limit: "512kb" }));
  app.use((req, res, next) => {
    req.traceId = req.headers["x-trace-id"] || `trc_${randomUUID()}`;
    res.setHeader("x-trace-id", req.traceId);
    next();
  });
  app.use((req, res, next) => {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith("Bearer ")) {
      return res.status(401).json({ code: "AUTH-401-UNAUTHORIZED", message: "Bearer token required", trace_id: req.traceId });
    }
    next();
  });
  app.use((req, res, next) => {
    const nowMin = Math.floor(Date.now() / 60000);
    const clientKey = `${req.ip}:${nowMin}`;
    const count = (rateBucket.get(clientKey) || 0) + 1;
    rateBucket.set(clientKey, count);
    if (count > config.rateLimitPerMinute) {
      res.setHeader("Retry-After", "60");
      return res.status(429).json({ code: "REQ-429-TOO_MANY_REQUESTS", message: "Too many requests", trace_id: req.traceId });
    }
    next();
  });
  app.use(
    pinoHttp({
      logger,
      customProps: (req) => ({ trace_id: req.traceId })
    })
  );
  app.use((req, res, next) => {
    const started = process.hrtime.bigint();
    res.on("finish", () => {
      const elapsedMs = Number(process.hrtime.bigint() - started) / 1000000;
      const route = req.route?.path || req.path;
      const status = String(res.statusCode);
      httpCounter.inc({ method: req.method, route, status }, 1);
      httpDuration.observe({ method: req.method, route, status }, elapsedMs);
    });
    next();
  });

  app.get("/health/liveness", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/health/readiness", (_req, res) => {
    res.json({ status: "ready" });
  });

  app.get("/metrics", async (_req, res) => {
    res.set("Content-Type", register.contentType);
    res.end(await register.metrics());
  });

  app.post("/api/v1/app/orders", (req, res) => {
    const idempotencyKey = req.headers["idempotency-key"];
    if (!idempotencyKey || typeof idempotencyKey !== "string") {
      return res.status(400).json({ code: "REQ-400-MISSING_IDEMPOTENCY", message: "Idempotency-Key required", trace_id: req.traceId });
    }

    const parsed = createOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(422).json({
        code: "REQ-422-VALIDATION_ERROR",
        message: "Invalid request body",
        trace_id: req.traceId,
        details: parsed.error.flatten()
      });
    }

    const existing = getIdempotent("create-order", idempotencyKey);
    if (existing) {
      res.setHeader("Idempotency-Replayed", "true");
      return res.json(existing);
    }

    let result;
    try {
      result = createOrder(parsed.data);
    } catch (err) {
      if (err.code === "INV-409-INSUFFICIENT") {
        return res.status(409).json({ code: err.code, message: err.message, trace_id: req.traceId });
      }
      throw err;
    }
    setIdempotent("create-order", idempotencyKey, result);
    return res.status(200).json(result);
  });

  app.post("/api/v1/app/payments/callback", (req, res) => {
    const body = z
      .object({
        payment_order_id: z.string().min(1),
        payment_status: z.enum(["SUCCESS", "FAILED"])
      })
      .safeParse(req.body);
    if (!body.success) {
      return res.status(422).json({ code: "REQ-422-VALIDATION_ERROR", message: "Invalid callback body", trace_id: req.traceId });
    }
    if (body.data.payment_status !== "SUCCESS") {
      return res.status(200).json({ accepted: true, ignored: true });
    }
    const order = markOrderPaid(body.data.payment_order_id);
    if (!order) {
      return res.status(404).json({ code: "PAY-404-ORDER_NOT_FOUND", message: "Payment order not found", trace_id: req.traceId });
    }
    return res.status(200).json({ accepted: true, order_id: order.order_id, status: order.status });
  });

  app.get("/api/v1/app/orders/:orderId", (req, res) => {
    const order = getOrder(req.params.orderId);
    if (!order) {
      return res.status(404).json({ code: "ORDER-404-NOT_FOUND", message: "Order not found", trace_id: req.traceId });
    }
    return res.json(order);
  });

  app.get("/api/v1/app/promoter/commissions/summary", (_req, res) => {
    return res.json(getCommissionSummary());
  });

  app.get("/api/v1/app/member/points/ledger", (req, res) => {
    const page = Number(req.query.page || 1);
    const size = Number(req.query.size || 20);
    return res.json(getPointsLedger(80001, page, size));
  });

  app.use((err, req, res, _next) => {
    req.log.error({ err }, "unexpected_error");
    res.status(500).json({ code: "SYS-500-INTERNAL", message: "Internal error", trace_id: req.traceId });
  });

  return app;
}

module.exports = { createApp };
