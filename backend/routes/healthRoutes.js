const express = require("express");
const pool = require("../db");
const logger = require("../utils/logger");
const { getRequestMetricsSnapshot } = require("../utils/requestMetrics");

const router = express.Router();

function getMemoryUsageSnapshot() {
  const memory = process.memoryUsage();
  return {
    rss: memory.rss,
    heapTotal: memory.heapTotal,
    heapUsed: memory.heapUsed,
    external: memory.external,
    arrayBuffers: memory.arrayBuffers,
  };
}

router.get("/health", async (_req, res) => {
  const uptimeSeconds = Number(process.uptime().toFixed(2));
  const memoryUsage = getMemoryUsageSnapshot();

  try {
    await pool.query("SELECT 1");

    return res.status(200).json({
      status: "OK",
      checks: {
        server: "up",
        database: "connected",
      },
      uptimeSeconds,
      timestamp: Date.now(),
      environment: process.env.NODE_ENV || "development",
      memoryUsage,
    });
  } catch (err) {
    logger.error("Health check failed", {
      message: err?.message,
      stack: err?.stack,
    });

    return res.status(500).json({
      status: "ERROR",
      checks: {
        server: "up",
        database: "disconnected",
      },
      uptimeSeconds,
      timestamp: Date.now(),
      environment: process.env.NODE_ENV || "development",
      memoryUsage,
      error: err?.message || "Health check failed",
    });
  }
});

router.get("/metrics", async (_req, res) => {
  const uptimeSeconds = Number(process.uptime().toFixed(2));
  const memoryUsage = getMemoryUsageSnapshot();
  const cpuUsage = process.cpuUsage();
  const requestMetrics = getRequestMetricsSnapshot();

  let dbStatus = "connected";
  try {
    await pool.query("SELECT 1");
  } catch (err) {
    dbStatus = "disconnected";
  }

  return res.status(200).json({
    status: dbStatus === "connected" ? "OK" : "DEGRADED",
    timestamp: Date.now(),
    uptime: uptimeSeconds,
    uptimeSeconds,
    dbStatus,
    memory: {
      rss: memoryUsage.rss,
      heapTotal: memoryUsage.heapTotal,
      heapUsed: memoryUsage.heapUsed,
    },
    memoryUsage,
    cpu: cpuUsage,
    cpuUsage,
    requestMetrics,
  });
});

module.exports = router;