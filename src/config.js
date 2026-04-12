const requiredEnv = ["NODE_ENV", "PORT"];

function loadConfig() {
  const missing = requiredEnv.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required env: ${missing.join(", ")}`);
  }

  return {
    env: process.env.NODE_ENV,
    port: Number(process.env.PORT),
    shutdownGraceMs: Number(process.env.SHUTDOWN_GRACE_MS || 15000),
    requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS || 2000),
    rateLimitPerMinute: Number(process.env.RATE_LIMIT_PER_MINUTE || 300)
  };
}

module.exports = { loadConfig };
