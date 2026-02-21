const { Pool } = require("pg");

function parseIntEnv(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const isTestRuntime = process.env.NODE_ENV === "test";
const fallbackConnectionString = "postgres://postgres:2004@localhost:5432/railsmart";

const connectionString = isTestRuntime
  ? process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || fallbackConnectionString
  : process.env.DATABASE_URL || "";

const basePoolConfig = {
  max: parseIntEnv(process.env.DB_POOL_MAX, 20),
  idleTimeoutMillis: parseIntEnv(process.env.DB_IDLE_TIMEOUT_MS, 30000),
  connectionTimeoutMillis: parseIntEnv(process.env.DB_CONNECTION_TIMEOUT_MS, 2000),
  ssl: false,
};

const poolConfig = connectionString
  ? {
      ...basePoolConfig,
      connectionString,
    }
  : {
      ...basePoolConfig,
      host: process.env.DB_HOST || "localhost",
      user: process.env.DB_USER || "postgres",
      password: process.env.DB_PASSWORD || "2004",
      database: process.env.DB_NAME || "railsmart",
      port: parseIntEnv(process.env.DB_PORT, 5432),
    };

const pool = new Pool(poolConfig);

// Test connection on startup
pool.on('error', (err) => {
  console.error('❌ Unexpected database error:', err);
});

module.exports = pool;
