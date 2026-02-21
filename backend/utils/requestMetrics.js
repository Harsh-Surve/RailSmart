const requestMetricsState = {
  startedAt: Date.now(),
  totalRequests: 0,
  totalDurationMs: 0,
  minDurationMs: Number.POSITIVE_INFINITY,
  maxDurationMs: 0,
  statusCodeBuckets: {
    "2xx": 0,
    "3xx": 0,
    "4xx": 0,
    "5xx": 0,
  },
  recentRequests: [],
};

const RECENT_REQUEST_LIMIT = 100;

function normalizeStatusCodeBucket(statusCode) {
  if (statusCode >= 500) return "5xx";
  if (statusCode >= 400) return "4xx";
  if (statusCode >= 300) return "3xx";
  return "2xx";
}

function recordRequestMetric({ method, route, statusCode, durationMs, timestamp }) {
  const safeDuration = Math.max(0, Number(durationMs || 0));
  const safeStatusCode = Number(statusCode || 0);

  requestMetricsState.totalRequests += 1;
  requestMetricsState.totalDurationMs += safeDuration;
  requestMetricsState.minDurationMs = Math.min(requestMetricsState.minDurationMs, safeDuration);
  requestMetricsState.maxDurationMs = Math.max(requestMetricsState.maxDurationMs, safeDuration);

  const bucket = normalizeStatusCodeBucket(safeStatusCode);
  requestMetricsState.statusCodeBuckets[bucket] += 1;

  requestMetricsState.recentRequests.push({
    method,
    route,
    statusCode: safeStatusCode,
    durationMs: safeDuration,
    timestamp,
  });

  if (requestMetricsState.recentRequests.length > RECENT_REQUEST_LIMIT) {
    requestMetricsState.recentRequests.shift();
  }
}

function getRequestMetricsSnapshot() {
  const totalRequests = requestMetricsState.totalRequests;
  const avgDurationMs = totalRequests > 0
    ? Number((requestMetricsState.totalDurationMs / totalRequests).toFixed(2))
    : 0;

  const minDurationMs = Number.isFinite(requestMetricsState.minDurationMs)
    ? requestMetricsState.minDurationMs
    : 0;

  return {
    startedAt: requestMetricsState.startedAt,
    totalRequests,
    avgDurationMs,
    minDurationMs,
    maxDurationMs: requestMetricsState.maxDurationMs,
    statusCodeBuckets: { ...requestMetricsState.statusCodeBuckets },
    recentRequests: [...requestMetricsState.recentRequests],
  };
}

module.exports = {
  recordRequestMetric,
  getRequestMetricsSnapshot,
};