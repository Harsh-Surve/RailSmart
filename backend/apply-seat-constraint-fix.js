require("dotenv").config();
const pool = require("./db");

async function main() {
  console.log("🔧 Fixing seat uniqueness constraints on tickets...");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1) Drop incorrect uniqueness constraints/indexes that block seats across all dates.
    await client.query(`DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'unique_seat_per_train'
      AND conrelid = 'tickets'::regclass
  ) THEN
    ALTER TABLE tickets DROP CONSTRAINT unique_seat_per_train;
  END IF;

  -- Some setups have a duplicate unique index without a constraint.
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'tickets'
      AND indexname = 'unique_train_seat'
  ) THEN
    EXECUTE 'DROP INDEX IF EXISTS public.unique_train_seat';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'tickets'
      AND indexname = 'unique_seat_per_train'
  ) THEN
    EXECUTE 'DROP INDEX IF EXISTS public.unique_seat_per_train';
  END IF;
END $$;`);

    // 2) Ensure correct uniqueness exists: per train + travel_date + seat.
    await client.query(`DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'unique_seat_per_train_date'
      AND conrelid = 'tickets'::regclass
  ) THEN
    ALTER TABLE tickets
      ADD CONSTRAINT unique_seat_per_train_date UNIQUE (train_id, travel_date, seat_no);
  END IF;
END $$;`);

    // 3) Clean up old CANCELLED tickets that still hold a seat_no.
    // This prevents cancelled rows from blocking the same seat on the same date.
    const cleanup = await client.query(
      `UPDATE tickets
       SET seat_no = NULL
       WHERE COALESCE(status, '') = 'CANCELLED'
         AND seat_no IS NOT NULL`
    );

    await client.query("COMMIT");
    console.log("✅ Seat constraint fix applied.");
    console.log(`🧹 Cleared seat_no for CANCELLED tickets: ${cleanup.rowCount}`);
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("❌ Failed to apply seat constraint fix:", e);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
