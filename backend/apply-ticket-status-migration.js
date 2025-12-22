require("dotenv").config();
const pool = require("./db");

async function main() {
  await pool.query(
    "ALTER TABLE tickets ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'CONFIRMED'"
  );
  await pool.query("UPDATE tickets SET status = 'CONFIRMED' WHERE status IS NULL");
  console.log("OK: tickets.status ensured");
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error("Migration failed:", err);
    pool.end().finally(() => process.exit(1));
  });
