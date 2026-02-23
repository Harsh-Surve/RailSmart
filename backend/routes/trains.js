const express = require("express");
const router = express.Router();
const pool = require("../db");
const { checkBookingEligibility, formatTime12Hour } = require("../utils/bookingEligibility");
const { recommendTrains } = require("../ai/RecommendationEngine");

// GET /api/trains?from=&to=&date=
router.get("/trains", async (req, res) => {
  const { from, to, date, source, destination } = req.query;

  try {
    let query = `
      SELECT
        tr.train_id,
        tr.train_name,
        tr.source,
        tr.destination,
        tr.scheduled_departure,
        tr.scheduled_arrival,
        tr.price,
        tr.total_seats,
        tr.runs_on,
        tr.delay_minutes,
        0::int AS confirmed_count,
        0::int AS locked_count
      FROM trains tr
      WHERE 1=1
    `;
    const params = [];

    // Support both 'from/to' and 'source/destination' params
    const fromParam = from || source;
    const toParam = to || destination;
    const fromIndex = fromParam ? params.length + 1 : null;

    if (fromParam) {
      params.push(`%${fromParam}%`);
      query += ` AND LOWER(tr.source) LIKE LOWER($${params.length})`;
    }

    const toIndex = toParam ? params.length + 1 : null;

    if (toParam) {
      params.push(`%${toParam}%`);
      query += ` AND LOWER(tr.destination) LIKE LOWER($${params.length})`;
    }

    if (date) {
      params.push(date);
      const dateParam = params.length;
      query = `
        SELECT
          tr.train_id,
          tr.train_name,
          tr.source,
          tr.destination,
          tr.scheduled_departure,
          tr.scheduled_arrival,
          tr.price,
          tr.total_seats,
          tr.runs_on,
          tr.delay_minutes,
          COALESCE(confirmed.confirmed_count, 0)::int AS confirmed_count,
          COALESCE(locked.locked_count, 0)::int AS locked_count
        FROM trains tr
        LEFT JOIN (
          SELECT train_id, COUNT(*)::int AS confirmed_count
          FROM tickets
          WHERE travel_date::date = $${dateParam}::date
            AND seat_no IS NOT NULL
            AND COALESCE(status, 'CONFIRMED') NOT IN ('CANCELLED', 'REFUNDED', 'PAYMENT_FAILED', 'PAYMENT_PENDING')
          GROUP BY train_id
        ) confirmed ON confirmed.train_id = tr.train_id
        LEFT JOIN (
          SELECT train_id, COUNT(*)::int AS locked_count
          FROM booking_intents
          WHERE travel_date::date = $${dateParam}::date
            AND status = 'PAYMENT_PENDING'
            AND expires_at > NOW()
          GROUP BY train_id
        ) locked ON locked.train_id = tr.train_id
        WHERE 1=1
      `;

      if (fromIndex) {
        query += ` AND LOWER(tr.source) LIKE LOWER($${fromIndex})`;
      }

      if (toIndex) {
        query += ` AND LOWER(tr.destination) LIKE LOWER($${toIndex})`;
      }
    }

    query += " ORDER BY tr.scheduled_departure ASC";

    const result = await pool.query(query, params);
    const enrichedRows = result.rows.map((train) => {
      const totalSeats = Number(train.total_seats || 0);
      const confirmedCount = Number(train.confirmed_count || 0);
      const lockedCount = Number(train.locked_count || 0);
      const availableSeats = Math.max(totalSeats - confirmedCount - lockedCount, 0);

      return {
        ...train,
        total_seats: totalSeats,
        confirmed_count: confirmedCount,
        locked_count: lockedCount,
        available_seats: availableSeats,
        departure_time: train.scheduled_departure || "08:00:00",
        arrival_time: train.scheduled_arrival || "12:00:00",
      };
    });

    const rankedRows = recommendTrains(enrichedRows);
    
    // Add booking eligibility for each train if date is provided
    const trains = rankedRows.map((train, index) => {
      // Format times for display
      const departureTime = train.departure_time || "08:00:00";
      const arrivalTime = train.arrival_time || "12:00:00";
      
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
        confirmed_count: train.confirmed_count || 0,
        locked_count: train.locked_count || 0,
        available_seats: train.available_seats,
        travel_duration_minutes: train.travel_duration_minutes,
        ai_score: train.ai_score,
        ai_reason: train.ai_reason || [],
        ai_rank: index + 1,
        recommendation: index === 0 ? "AI_RECOMMENDED" : null,
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
