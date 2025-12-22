const express = require("express");
const router = express.Router();
const pool = require("../db");

// GET /api/trains?from=&to=&date=
router.get("/trains", async (req, res) => {
  const { from, to, date, source, destination } = req.query;

  try {
    let query = `
      SELECT *
      FROM trains
      WHERE 1=1
    `;
    const params = [];

    // Support both 'from/to' and 'source/destination' params
    const fromParam = from || source;
    const toParam = to || destination;

    if (fromParam) {
      params.push(`%${fromParam}%`);
      query += ` AND LOWER(source) LIKE LOWER($${params.length})`;
    }

    if (toParam) {
      params.push(`%${toParam}%`);
      query += ` AND LOWER(destination) LIKE LOWER($${params.length})`;
    }

    if (date) {
      // date expected as 'YYYY-MM-DD'
      params.push(date);
      query += ` AND DATE(departure_time) = $${params.length}`;
    }

    query += " ORDER BY departure_time ASC";

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching trains with filters:", err);
    res.status(500).json({ error: "Failed to fetch trains" });
  }
});

// GET /api/trains/:trainId/booked-seats?date=YYYY-MM-DD
router.get("/trains/:trainId/booked-seats", async (req, res) => {
  const { trainId } = req.params;
  const { date } = req.query;

  if (!date) {
    return res.status(400).json({ error: "date query parameter is required" });
  }

  try {
    const result = await pool.query(
      `SELECT TRIM(seat_no) AS seat_no
       FROM tickets
       WHERE train_id = $1
         AND travel_date::date = $2::date
         AND seat_no IS NOT NULL
         AND COALESCE(status, 'CONFIRMED') <> 'CANCELLED'`,
      [trainId, date]
    );
    const seats = result.rows.map((r) => r.seat_no);
    res.json({ seats });
  } catch (err) {
    console.error("Error fetching booked seats:", err);
    res.status(500).json({ error: "Failed to fetch booked seats" });
  }
});

module.exports = router;
