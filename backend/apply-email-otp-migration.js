require("dotenv").config();
const pool = require("./db");

async function main() {
  // Create base table if missing
  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_otps (
      id SERIAL PRIMARY KEY,
      email VARCHAR NOT NULL,
      ticket_id INTEGER NOT NULL,
      otp VARCHAR(6) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMP NOT NULL,
      verified BOOLEAN NOT NULL DEFAULT FALSE,
      attempts INTEGER NOT NULL DEFAULT 0
    )
  `);

  // Ensure columns exist if table was created by an older migration
  await pool.query("ALTER TABLE email_otps ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW()");
  await pool.query("ALTER TABLE email_otps ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0");

  // Indexes for lookups + rate limiting
  await pool.query(
    "CREATE INDEX IF NOT EXISTS idx_email_otps_lookup ON email_otps (email, ticket_id, verified, expires_at)"
  );
  await pool.query(
    "CREATE INDEX IF NOT EXISTS idx_email_otps_email_created_at ON email_otps (email, created_at DESC)"
  );

  console.log("OK: email_otps table + columns + indexes ensured");
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error("Migration failed:", err);
    pool.end().finally(() => process.exit(1));
  });
