require("dotenv").config();
const fs = require("fs");
const path = require("path");
const pool = require("./db");

async function main() {
  const migrationPath = path.join(__dirname, "migrations", "2026_add_waitlist_entries.sql");
  const sql = fs.readFileSync(migrationPath, "utf8");

  await pool.query(sql);
  console.log("OK: waitlist_entries table and indexes ensured");
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error("Waitlist migration failed:", err);
    pool.end().finally(() => process.exit(1));
  });
