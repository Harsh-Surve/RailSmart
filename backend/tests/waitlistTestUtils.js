const pool = require("../db");
const { createApp } = require("../src/app");

const app = createApp({ emit: () => {}, on: () => {} });
const TEST_DATE = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

let testTrainId = null;
let originalTotalSeats = null;

function bookingKey(email, seatNo) {
  return `${email}_${testTrainId}_${TEST_DATE}_${seatNo}`;
}

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS waitlist_entries (
      id SERIAL PRIMARY KEY,
      user_email VARCHAR(255) NOT NULL,
      train_id INTEGER NOT NULL REFERENCES trains(train_id),
      travel_date DATE NOT NULL,
      amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'WAITLIST',
      waitlist_position INTEGER,
      promoted_intent_id INTEGER REFERENCES booking_intents(id),
      promoted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_email VARCHAR(255) NOT NULL,
      type VARCHAR(30) NOT NULL DEFAULT 'GENERAL',
      message TEXT NOT NULL,
      related_train_id INTEGER REFERENCES trains(train_id),
      travel_date DATE,
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function initTestTrain() {
  const trainRes = await pool.query(
    `SELECT train_id, total_seats
     FROM trains
     ORDER BY train_id ASC
     LIMIT 1`
  );

  if (trainRes.rowCount === 0) {
    throw new Error("No trains available in database for test setup");
  }

  testTrainId = Number(trainRes.rows[0].train_id);
  originalTotalSeats = Number(trainRes.rows[0].total_seats || 0);

  await pool.query(
    `UPDATE trains
     SET total_seats = 5
     WHERE train_id = $1`,
    [testTrainId]
  );
}

async function restoreTrain() {
  if (testTrainId != null && originalTotalSeats != null) {
    await pool.query(
      `UPDATE trains
       SET total_seats = $2
       WHERE train_id = $1`,
      [testTrainId, originalTotalSeats]
    );
  }
}

async function cleanupTestData() {
  if (testTrainId == null) return;

  await pool.query(
    `DELETE FROM notifications
     WHERE related_train_id = $1
        OR user_email LIKE 'waittest-%@example.com'
        OR user_email LIKE 'wl-promoted-%@example.com'
        OR user_email LIKE 'seatrace-%@example.com'`,
    [testTrainId]
  );

  await pool.query(
    "DELETE FROM waitlist_entries WHERE train_id = $1 AND travel_date = $2",
    [testTrainId, TEST_DATE]
  );

  await pool.query(
    "DELETE FROM booking_intents WHERE train_id = $1 AND travel_date = $2",
    [testTrainId, TEST_DATE]
  );

  await pool.query(
    "DELETE FROM tickets WHERE train_id = $1 AND travel_date = $2",
    [testTrainId, TEST_DATE]
  );
}

async function seedConfirmedTickets(count = 5) {
  const inserts = [];
  for (let i = 1; i <= count; i += 1) {
    const email = `confirmed-${i}@example.com`;
    const seatNo = `S${i}`;
    inserts.push(
      pool.query(
        `INSERT INTO tickets (user_email, train_id, travel_date, seat_no, price, pnr, booking_key, booking_date, status, payment_status)
         VALUES ($1, $2, $3, $4, 100, $5, $6, NOW(), 'CONFIRMED', 'PAID')`,
        [email, testTrainId, TEST_DATE, seatNo, `PNRTEST${i}`, bookingKey(email, seatNo)]
      )
    );
  }
  await Promise.all(inserts);
}

module.exports = {
  app,
  pool,
  TEST_DATE,
  getTestTrainId: () => testTrainId,
  ensureSchema,
  initTestTrain,
  restoreTrain,
  cleanupTestData,
  seedConfirmedTickets,
};
