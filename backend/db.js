const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgres://postgres:2004@localhost:5432/railsmart",
  // Explicit config to avoid Windows username issues
  ssl: false,
});

// Test connection on startup
pool.on('error', (err) => {
  console.error('❌ Unexpected database error:', err);
});

module.exports = pool;
