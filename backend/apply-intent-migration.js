/**
 * Apply booking-intent migration.
 * Run: node apply-intent-migration.js
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const pool = require("./db");

async function run() {
  const sqlFile = path.join(__dirname, "migrations", "2026_add_booking_intents.sql");
  const sql = fs.readFileSync(sqlFile, "utf-8");
  
  console.log("🔧 Applying booking_intents migration...");
  await pool.query(sql);
  console.log("✅ booking_intents table created successfully.");

  // Verify
  const check = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'booking_intents' ORDER BY ordinal_position"
  );
  console.log("📋 Columns:", check.rows.map(r => r.column_name).join(", "));
  
  await pool.end();
  process.exit(0);
}

run().catch(err => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
