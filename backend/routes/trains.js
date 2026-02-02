const express = require("express");
const router = express.Router();
const pool = require("../db");
const { checkBookingEligibility, formatTime12Hour } = require("../utils/bookingEligibility");

// GET /api/trains?from=&to=&date=
router.get("/trains", async (req, res) => {
  const { from, to, date, source, destination } = req.query;

  try {
    let query = `
      SELECT 
        train_id,
        train_name,
        source,
        destination,
        scheduled_departure,
        scheduled_arrival,
        price,
        total_seats,
        runs_on,
        delay_minutes
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

    query += " ORDER BY scheduled_departure ASC";

    const result = await pool.query(query, params);
    
    // Add booking eligibility for each train if date is provided
    const trains = result.rows.map(train => {
      // Format times for display
      const departureTime = train.scheduled_departure || "08:00:00";
      const arrivalTime = train.scheduled_arrival || "12:00:00";
      
      // Calculate booking eligibility if travel date provided
      let bookingStatus = { allowed: true, reason: "Select a date to book", code: "NO_DATE" };
      
      if (date) {
        bookingStatus = checkBookingEligibility({
          travelDate: date,
          scheduledDeparture: departureTime
        });
      }
      
      return {
        train_id: train.train_id,
        train_name: train.train_name,
        source: train.source,
        destination: train.destination,
        // Keep original time format for compatibility
        departure_time: departureTime,
        arrival_time: arrivalTime,
        // Formatted for display
        departure_display: formatTime12Hour(departureTime),
        arrival_display: formatTime12Hour(arrivalTime),
        price: train.price,
        total_seats: train.total_seats,
        runs_on: train.runs_on || "DAILY",
        delay_minutes: train.delay_minutes || 0,
        // Booking eligibility
        booking: bookingStatus
      };
    });

    res.json(trains);
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

// GET /api/trains/:trainId/booking-status?date=YYYY-MM-DD
// Returns booking eligibility for a specific train and date
router.get("/trains/:trainId/booking-status", async (req, res) => {
  const { trainId } = req.params;
  const { date } = req.query;

  if (!date) {
    return res.status(400).json({ error: "date query parameter is required" });
  }

  try {
    const result = await pool.query(
      `SELECT train_id, train_name, scheduled_departure, scheduled_arrival
       FROM trains WHERE train_id = $1`,
      [trainId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Train not found" });
    }

    const train = result.rows[0];
    const departureTime = train.scheduled_departure || "08:00:00";
    
    const bookingStatus = checkBookingEligibility({
      travelDate: date,
      scheduledDeparture: departureTime
    });

    res.json({
      trainId: train.train_id,
      trainName: train.train_name,
      travelDate: date,
      departureTime: formatTime12Hour(departureTime),
      ...bookingStatus
    });
  } catch (err) {
    console.error("Error checking booking status:", err);
    res.status(500).json({ error: "Failed to check booking status" });
  }
});

module.exports = router;
