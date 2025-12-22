require("dotenv").config();
const pool = require("./db");

async function main() {
  await pool.query(
    "ALTER TABLE tickets ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'PENDING'"
  );
  await pool.query(
    "ALTER TABLE tickets ADD COLUMN IF NOT EXISTS payment_id VARCHAR(100)"
  );
  await pool.query(
    "ALTER TABLE tickets ADD COLUMN IF NOT EXISTS payment_order_id VARCHAR(100)"
  );

  // Backfill old rows to avoid breaking existing PDF/preview flows.
  await pool.query("UPDATE tickets SET payment_status = 'PAID' WHERE payment_status IS NULL");

  console.log("OK: tickets.payment_* columns ensured");
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error("Migration failed:", err);
    pool.end().finally(() => process.exit(1));
  });
