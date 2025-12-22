require("dotenv").config();
const pool = require("./db");

async function main() {
  const trainId = Number(process.argv[2] || 1);
  const date = String(process.argv[3] || "2025-12-20");
  const seat = String(process.argv[4] || "A1");

  const constraints = await pool.query(
    `SELECT conname, pg_get_constraintdef(oid) AS def
     FROM pg_constraint
     WHERE conrelid = 'tickets'::regclass
     ORDER BY conname`
  );

  const indexes = await pool.query(
    `SELECT indexname, indexdef
     FROM pg_indexes
     WHERE tablename = 'tickets'
     ORDER BY indexname`
  );

  const types = await pool.query(
    `SELECT column_name, data_type
     FROM information_schema.columns
     WHERE table_name = 'tickets'
       AND column_name IN ('ticket_id','user_email','train_id','seat_no','travel_date','status','payment_status')
     ORDER BY column_name`
  );

  const anyForDate = await pool.query(
    `SELECT ticket_id, user_email, train_id, seat_no, travel_date, status, payment_status
     FROM tickets
     WHERE train_id = $1
       AND travel_date::date = $2::date
     ORDER BY ticket_id DESC`,
    [trainId, date]
  );

  const exact = await pool.query(
    `SELECT ticket_id, user_email, train_id, seat_no, travel_date, status, payment_status
     FROM tickets
     WHERE train_id = $1
       AND TRIM(seat_no) = $2
       AND travel_date::date = $3::date
     ORDER BY ticket_id DESC`,
    [trainId, seat, date]
  );

  const near = await pool.query(
    `SELECT ticket_id, user_email, train_id, seat_no, travel_date::date AS travel_date, status, payment_status
     FROM tickets
     WHERE train_id = $1
       AND TRIM(seat_no) = $2
     ORDER BY ticket_id DESC
     LIMIT 20`,
    [trainId, seat]
  );

  console.log("tickets column types:", types.rows);
  console.log("\nconstraints:", constraints.rows);
  console.log("\nindexes:", indexes.rows);
  console.log(`\nAll tickets for train ${trainId} on ${date}:`, anyForDate.rows);
  console.log(`\nExact seat match for train ${trainId}, seat ${seat} on ${date}:`, exact.rows);
  console.log(`\nRecent tickets for train ${trainId}, seat ${seat} (any date):`, near.rows);
}

main()
  .catch((e) => {
    console.error("debug-ticket-conflict error:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await pool.end();
    } catch {
      // ignore
    }
  });
