require("dotenv").config();
const pool = require("./db");

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(
    "CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created_at ON audit_logs (user_id, created_at DESC)"
  );
  await pool.query(
    "CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created_at ON audit_logs (action, created_at DESC)"
  );

  console.log("OK: audit_logs table + indexes ensured");
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error("Migration failed:", err);
    pool.end().finally(() => process.exit(1));
  });