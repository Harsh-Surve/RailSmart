const express = require("express");
const router = express.Router();
const requireAdmin = require("../middleware/requireAdmin");
const logger = require("../utils/logger");
const { logAudit } = require("../utils/auditLogger");
const { getAuditLogs } = require("../controllers/auditController");

// ⚠️ Use the SAME pool import that you use in trains.js / tickets.js
const pool = require("../db"); 

router.use(requireAdmin);

// GET /api/admin/audit-logs
router.get("/audit-logs", getAuditLogs);

// GET /api/admin/overview
router.get("/overview", async (req, res) => {
  const params = [];

  try {
    // 1) Overall summary: bookings + revenue (from payments ledger) + today's revenue
    //    Revenue uses the payments table for accuracy; falls back to tickets if payments table doesn't exist yet.
    let summaryResult;
    try {
      summaryResult = await pool.query(
        `
        SELECT
          (SELECT COUNT(*)::int FROM tickets) AS total_bookings,
          COALESCE((
            SELECT SUM(p.amount)
            FROM payments p
            JOIN tickets t ON t.ticket_id = p.ticket_id
            WHERE p.status = 'SUCCESS'
          ), 0)::numeric(10,2) AS total_revenue,
          COALESCE((
            SELECT SUM(p.amount)
            FROM payments p
            JOIN tickets t ON t.ticket_id = p.ticket_id
            WHERE p.status = 'SUCCESS'
              AND t.travel_date = CURRENT_DATE
          ), 0)::numeric(10,2) AS today_revenue
        `,
        params
      );
    } catch (e) {
      // 42P01 = payments table doesn't exist yet — fall back to tickets-based revenue
      if (e?.code === '42P01') {
        summaryResult = await pool.query(
          `
          SELECT
            COUNT(*)::int AS total_bookings,
            COALESCE(SUM(CASE WHEN UPPER(COALESCE(payment_status,'')) = 'PAID' THEN price ELSE 0 END), 0)::numeric(10,2) AS total_revenue,
            COALESCE(SUM(CASE WHEN travel_date = CURRENT_DATE AND UPPER(COALESCE(payment_status,'')) = 'PAID' THEN price ELSE 0 END), 0)::numeric(10,2) AS today_revenue
          FROM tickets
          ;
          `,
          params
        );
      } else {
        throw e;
      }
    }

    // 2) Most booked train
    const mostBookedResult = await pool.query(
      `
      SELECT 
        t.train_id,
        t.train_name,
        COUNT(*)::int AS bookings
      FROM tickets tk
      JOIN trains t ON t.train_id = tk.train_id
      WHERE UPPER(COALESCE(tk.status,'CONFIRMED')) != 'CANCELLED'
      GROUP BY t.train_id, t.train_name
      ORDER BY bookings DESC
      LIMIT 1;
      `,
      params
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
        AND UPPER(COALESCE(tk.status,'CONFIRMED')) != 'CANCELLED'
      GROUP BY t.train_id, t.train_name, t.source, t.destination, t.total_seats
      ORDER BY occupancy_percent DESC
      LIMIT 5;
      `,
      params
    );

    // 4) Revenue by date from payments ledger (last 7 days)
    let revenueResult;
    try {
      revenueResult = await pool.query(
        `
        SELECT
          t.travel_date::date AS date,
          SUM(p.amount) AS revenue
        FROM payments p
        JOIN tickets t ON t.ticket_id = p.ticket_id
        WHERE p.status = 'SUCCESS'
          AND t.travel_date >= CURRENT_DATE - INTERVAL '6 days'
          AND t.travel_date <= CURRENT_DATE
        GROUP BY t.travel_date::date
        ORDER BY date;
        `,
        params
      );
    } catch (e) {
      if (e?.code === '42P01') {
        revenueResult = await pool.query(
          `
          SELECT
            travel_date::date AS date,
            SUM(price) AS revenue
          FROM tickets
          WHERE travel_date >= CURRENT_DATE - INTERVAL '6 days'
            AND travel_date <= CURRENT_DATE
            AND UPPER(COALESCE(payment_status, '')) = 'PAID'
          GROUP BY travel_date::date
          ORDER BY date;
          `,
          params
        );
      } else {
        throw e;
      }
    }

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

    // 5) Booking-intent stats (safe — ignores if table doesn't exist)
    let intentStats = { pending: 0, expired: 0, failed: 0 };
    try {
      const intentRes = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'PAYMENT_PENDING' AND expires_at > NOW()) AS pending,
          COUNT(*) FILTER (WHERE status = 'EXPIRED' OR (status = 'PAYMENT_PENDING' AND expires_at <= NOW())) AS expired,
          COUNT(*) FILTER (WHERE status = 'FAILED') AS failed
        FROM booking_intents
      `, params);
      intentStats = {
        pending: Number(intentRes.rows[0]?.pending || 0),
        expired: Number(intentRes.rows[0]?.expired || 0),
        failed: Number(intentRes.rows[0]?.failed || 0),
      };
    } catch (e) {
      // booking_intents table may not exist yet — just skip
      if (e?.code !== '42P01') console.warn('Intent stats query failed:', e.message);
    }

    return res.json({
      summary,
      mostBookedTrain,
      topOccupancy,
      revenueByDate,
      intentStats,
    });
  } catch (err) {
    logger.error("Admin overview error", { message: err?.message, stack: err?.stack });
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
      `,
      []
    );

    return res.json(bookingsResult.rows);
  } catch (err) {
    logger.error("Admin bookings error", { message: err?.message, stack: err?.stack });
    return res.status(500).json({ error: "Failed to load bookings" });
  }
});

// Cancel a ticket (admin only)
router.patch("/tickets/:id/cancel", requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      "UPDATE tickets SET status = 'CANCELLED' WHERE ticket_id = $1 RETURNING *",
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    await logAudit(req.user?.id, "ADMIN_CANCEL_TICKET", {
      ticketId: Number(id),
      adminEmail: req.user?.email || null,
      ip: req.ip,
    });

    logger.info("Admin cancelled ticket", {
      adminUserId: req.user?.id,
      ticketId: Number(id),
    });

    return res.json({ message: "Ticket cancelled successfully", ticket: result.rows[0] });
  } catch (err) {
    logger.error("Admin cancel ticket error", {
      message: err?.message,
      stack: err?.stack,
      ticketId: Number(id),
      adminUserId: req.user?.id,
    });
    return res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
