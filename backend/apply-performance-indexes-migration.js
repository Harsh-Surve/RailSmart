require("dotenv").config();
const fs = require("fs");
const path = require("path");
const pool = require("./db");

async function main() {
  const migrationPath = path.join(__dirname, "migrations", "2026_add_performance_indexes.sql");
  const sql = fs.readFileSync(migrationPath, "utf8");
  await pool.query(sql);
  console.log("OK: performance indexes ensured");
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error("Performance index migration failed:", err);
    pool.end().finally(() => process.exit(1));
  });
