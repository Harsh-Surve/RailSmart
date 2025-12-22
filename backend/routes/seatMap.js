const express = require("express");
const router = express.Router();
const pool = require("../db");

// GET /api/booked-seats?trainId=..&travelDate=.. (or &date=..)
// Returns: { bookedSeats: string[] }
router.get("/booked-seats", async (req, res) => {
  const { trainId, travelDate, date } = req.query;
  const effectiveDate = travelDate || date;

  if (!trainId || !effectiveDate) {
    return res
      .status(400)
      .json({ error: "trainId and travelDate query parameters are required" });
  }

  try {
    const result = await pool.query(
      `SELECT TRIM(seat_no) AS seat_no
       FROM tickets
       WHERE train_id = $1
         AND travel_date::date = $2::date
         AND seat_no IS NOT NULL
         AND COALESCE(status, 'CONFIRMED') <> 'CANCELLED'`,
      [trainId, effectiveDate]
    );

    const bookedSeats = result.rows.map((r) => r.seat_no).filter(Boolean);
    return res.json({ bookedSeats });
  } catch (err) {
    console.error("Error fetching booked seats:", err);
    return res.status(500).json({ error: "Failed to fetch booked seats" });
  }
});

// GET /api/seat-map?trainId=..&date=..
router.get("/seat-map", async (req, res) => {
  const { trainId, date } = req.query;

  if (!trainId || !date) {
    return res
      .status(400)
      .json({ error: "trainId and date query parameters are required" });
  }

  try {
    const rows = ["A", "B", "C", "D"];
    const cols = Array.from({ length: 8 }, (_, i) => i + 1);

    const result = await pool.query(
      `SELECT TRIM(seat_no) AS seat_no
       FROM tickets
       WHERE train_id = $1
         AND travel_date::date = $2::date
         AND seat_no IS NOT NULL
         AND COALESCE(status, 'CONFIRMED') <> 'CANCELLED'`,
      [trainId, date]
    );
    const bookedSeats = result.rows.map((r) => r.seat_no);

    res.json({ layout: { rows, cols }, bookedSeats });
  } catch (err) {
    console.error("Error fetching seat map:", err);
    res.status(500).json({ error: "Error fetching seat map" });
  }
});

module.exports = router;
