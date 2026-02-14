/**
 * Apply booking_key + payments table migrations.
 * Usage: node apply-stability-migrations.js
 */
const fs = require("fs");
const path = require("path");
const pool = require("./db");

async function run() {
  const files = [
    "migrations/2026_add_booking_key.sql",
    "migrations/2026_add_payments_table.sql",
  ];

  for (const file of files) {
    const filePath = path.join(__dirname, file);
    console.log(`\n📄 Applying ${file}...`);
    const sql = fs.readFileSync(filePath, "utf-8");
    try {
      await pool.query(sql);
      console.log(`  ✅ ${file} applied successfully`);
    } catch (err) {
      // Tolerate "already exists" errors
      if (err.code === "42701" || err.code === "42P07") {
        console.log(`  ⚠️  ${file} already applied (skipping)`);
      } else {
        console.error(`  ❌ ${file} failed:`, err.message);
      }
    }
  }

  console.log("\n🏁 Done.");
  await pool.end();
}

run();
