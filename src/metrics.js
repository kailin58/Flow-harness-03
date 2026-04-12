const client = require("prom-client");

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpCounter = new client.Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status"],
  registers: [register]
});

const httpDuration = new client.Histogram({
  name: "http_request_duration_ms",
  help: "HTTP request duration in milliseconds",
  labelNames: ["method", "route", "status"],
  buckets: [50, 100, 250, 500, 1000, 2000, 5000],
  registers: [register]
});

module.exports = {
  register,
  httpCounter,
  httpDuration
};
