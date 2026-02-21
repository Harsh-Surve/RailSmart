const logger = require("../utils/logger");
const { recordRequestMetric } = require("../utils/requestMetrics");

function requestTimer(req, res, next) {
  const isTestRuntime = Boolean(process.env.JEST_WORKER_ID);
  const startHrTime = process.hrtime.bigint();

  res.on("finish", () => {
    const elapsedNs = process.hrtime.bigint() - startHrTime;
    const durationMs = Number(elapsedNs) / 1_000_000;
    const roundedDurationMs = Number(durationMs.toFixed(2));

    const metricPayload = {
      method: req.method,
      route: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: roundedDurationMs,
      timestamp: Date.now(),
    };

    recordRequestMetric(metricPayload);

    if (!isTestRuntime) {
      logger.info("Request completed", metricPayload);
    }
  });

  next();
}

module.exports = { requestTimer };