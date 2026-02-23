const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const compression = require("compression");
const helmet = require("helmet");
const morgan = require("morgan");
const { rateLimit } = require("express-rate-limit");
const pool = require("../db");
const logger = require("../utils/logger");
const { errorHandler } = require("../middleware/errorHandler");
const { requestTimer } = require("../middleware/requestTimer");

function parseIntEnv(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sanitizeValue(value) {
  if (typeof value === "string") {
    return value.replace(/[\u0000-\u001F\u007F]/g, "").trim();
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }

  if (value && typeof value === "object") {
    const output = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      output[key] = sanitizeValue(nestedValue);
    }
    return output;
  }

  return value;
}

function requestSanitizer(req, _res, next) {
  if (req.body && typeof req.body === "object") {
    req.body = sanitizeValue(req.body);
  }

  if (req.query && typeof req.query === "object") {
    req.query = sanitizeValue(req.query);
  }

  next();
}

function createApp(io) {
  const safeIo = io || { emit: () => {}, on: () => {} };
  const isTestRuntime = Boolean(process.env.JEST_WORKER_ID);
  const frontendOrigins = String(process.env.FRONTEND_URL || "http://localhost:5173")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const globalWindowMs = parseIntEnv(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000);
  const globalMaxRequests = parseIntEnv(process.env.RATE_LIMIT_MAX, 500);
  const authWindowMs = parseIntEnv(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 10 * 60 * 1000);
  const authMaxRequests = parseIntEnv(process.env.AUTH_RATE_LIMIT_MAX, 20);

  const globalLimiter = rateLimit({
    windowMs: globalWindowMs,
    max: globalMaxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many requests. Please try again later.",
    skip: () => isTestRuntime,
  });

  const authLimiter = rateLimit({
    windowMs: authWindowMs,
    max: authMaxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many login attempts. Try again later.",
    skip: () => isTestRuntime,
  });

  const app = express();
  if (process.env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
  }

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
    })
  );
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) {
          return callback(null, true);
        }

        if (frontendOrigins.includes(origin)) {
          return callback(null, true);
        }

        return callback(new Error("CORS origin denied"));
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    })
  );
  app.use(compression());
  app.use(globalLimiter);
  app.use(cookieParser());
  app.use(express.json());
  app.use(requestSanitizer);
  app.use(
    morgan(process.env.NODE_ENV === "production" ? "combined" : "dev", {
      skip: () => isTestRuntime,
      stream: {
        write: (message) => {
          logger.info("HTTP request", { request: message.trim() });
        },
      },
    })
  );
  app.use(requestTimer);

  app.get("/", (req, res) => {
    res.json({ message: "RailSmart API is running ✅" });
  });

  app.get("/db-check", async (req, res) => {
    try {
      const result = await pool.query("SELECT NOW()");
      res.json({ status: "ok", time: result.rows[0].now });
    } catch (err) {
      logger.error("DB check error", { message: err?.message, stack: err?.stack });
      res.status(500).json({ status: "error", message: "DB connection failed" });
    }
  });

  app.use("/api", require("../routes/trains"));
  app.use("/api", require("../routes/tickets"));
  app.use("/api", require("../routes/healthRoutes"));
  app.use("/api/assistant", require("../routes/assistant"));
  if (!isTestRuntime) {
    app.use(["/api/login", "/api/google-login"], authLimiter);
    app.use("/api", require("../routes/auth"));
    app.use("/api", require("../routes/seatMap"));
    app.use("/api/otp", require("../routes/otp"));
    app.use("/api/payment", require("../routes/payment"));
    app.use("/api/payments", require("../routes/payment"));
    app.use("/api", require("../routes/liveTracking"));
    app.use("/api/railradar", require("../routes/railradar")(safeIo));
    app.use("/api/stations", require("../routes/stations"));
    app.use("/api/chatbot", require("../routes/chatbot"));
    app.use("/api/admin/analytics", require("../routes/analyticsRoutes"));
    app.use("/api/admin", require("../routes/admin"));
  }

  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
