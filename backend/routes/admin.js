const express = require("express");
const router = express.Router();

// ⚠️ Use the SAME pool import that you use in trains.js / tickets.js
const pool = require("../db"); 

// GET /api/admin/overview
router.get("/overview", async (req, res) => {
  try {
    // 1) Overall summary: bookings + revenue + today's revenue
    const summaryResult = await pool.query(
      `
      SELECT
        COUNT(*)::int AS total_bookings,
        COALESCE(SUM(price), 0)::numeric(10,2) AS total_revenue,
        COALESCE(
          SUM(
            CASE 
              WHEN travel_date = CURRENT_DATE THEN price 
              ELSE 0 
            END
          ), 0
        )::numeric(10,2) AS today_revenue
      FROM tickets;
      `
    );

    // 2) Most booked train
    const mostBookedResult = await pool.query(
      `
      SELECT 
        t.train_id,
        t.train_name,
        COUNT(*)::int AS bookings
      FROM tickets tk
      JOIN trains t ON t.train_id = tk.train_id
      GROUP BY t.train_id, t.train_name
      ORDER BY bookings DESC
      LIMIT 1;
      `
    );

    // 3) Top occupancy per train (based on total_seats)
    const occupancyResult = await pool.query(
      `
      SELECT
        t.train_id,
        t.train_name,
        t.source,
        t.destination,
        COUNT(tk.ticket_id)::int AS booked_seats,
        t.total_seats,
        ROUND(
          CASE 
            WHEN t.total_seats > 0 
              THEN (COUNT(tk.ticket_id)::numeric / t.total_seats) * 100
            ELSE 0
          END
        , 1) AS occupancy_percent
      FROM trains t
      LEFT JOIN tickets tk ON tk.train_id = t.train_id
      GROUP BY t.train_id, t.train_name, t.source, t.destination, t.total_seats
      ORDER BY occupancy_percent DESC
      LIMIT 5;
      `
    );

    // 4) Get revenue for the last 7 days (including today)
    const revenueResult = await pool.query(
      `
      SELECT
        travel_date::date AS date,
        SUM(price) AS revenue
      FROM tickets
      WHERE travel_date >= CURRENT_DATE - INTERVAL '6 days'
        AND travel_date <= CURRENT_DATE
      GROUP BY travel_date::date
      ORDER BY date;
      `
    );

    // Turn into a map: { '2025-12-02': 450.00, ... }
    const revenueMap = new Map();
    for (const row of revenueResult.rows) {
      revenueMap.set(row.date.toISOString().slice(0, 10), Number(row.revenue));
    }

    // Build a full 7-day array with zeros for missing days
    const revenueByDate = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      revenueByDate.push({
        date: key,              // '2025-12-08'
        revenue: revenueMap.get(key) || 0,
      });
    }

    const summary = summaryResult.rows[0] || {
      total_bookings: 0,
      total_revenue: 0,
      today_revenue: 0,
    };

    const mostBookedTrain = mostBookedResult.rows[0] || null;
    const topOccupancy = occupancyResult.rows;

    return res.json({
      summary,
      mostBookedTrain,
      topOccupancy,
      revenueByDate,
    });
  } catch (err) {
    console.error("❌ Admin overview error:", err);
    return res.status(500).json({ error: "Failed to load admin overview" });
  }
});

// GET /api/admin/bookings - Recent bookings list
router.get("/bookings", async (req, res) => {
  try {
    const bookingsResult = await pool.query(
      `
      SELECT 
        tk.ticket_id,
        tk.user_email,
        tk.pnr,
        t.train_name,
        t.source,
        t.destination,
        tk.travel_date,
        tk.seat_no,
        tk.price,
        tk.booking_date,
        tk.status
      FROM tickets tk
      JOIN trains t ON t.train_id = tk.train_id
      ORDER BY tk.booking_date DESC NULLS LAST, tk.ticket_id DESC
      LIMIT 100;
      `
    );

    return res.json(bookingsResult.rows);
  } catch (err) {
    console.error("❌ Admin bookings error:", err);
    return res.status(500).json({ error: "Failed to load bookings" });
  }
});

// Cancel a ticket (admin)
router.patch("/tickets/:id/cancel", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      "UPDATE tickets SET status = 'CANCELLED' WHERE ticket_id = $1 RETURNING *",
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    return res.json({ message: "Ticket cancelled successfully", ticket: result.rows[0] });
  } catch (err) {
    console.error("❌ Admin cancel ticket error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
