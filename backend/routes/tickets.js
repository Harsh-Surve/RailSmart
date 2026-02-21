const express = require("express");
const router = express.Router();
const pool = require("../db");
const fs = require("fs");
const path = require("path");
const requireAdmin = require("../middleware/requireAdmin");
const { generateTicketPdf } = require("../utils/ticketPdf");
const { generateTicketPreviewPNGWithPuppeteer } = require("../utils/previewWithPuppeteer");
const { sendCancellationEmail } = require("../utils/emailService");
const { checkBookingEligibility } = require("../utils/bookingEligibility");
const { getTicketStatus } = require("../utils/ticketStatus");

const CACHE_DIR = path.join(__dirname, "..", "cache", "previews");

const adminEmails = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const isAdminEmail = (email) => {
  if (!email) return false;
  return adminEmails.includes(String(email).trim().toLowerCase());
};

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// Helper: Generate 15-digit PNR (train + date + random)
function generatePNR(trainId, travelDate) {
  const trainPart = String(trainId).replace(/\D/g, "").padStart(3, "0").slice(0, 3);
  const dateObj = new Date(travelDate);
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  const datePart = `${y}${m}${d}`;
  const randomPart = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
  return `${trainPart}${datePart}${randomPart}`;
}

// ── Expire stale intents ─────────────────────────────────────────
// Runs in-process whenever a booking is attempted.
// Releases seats held by intents older than 10 minutes that never got paid.
async function expireStaleIntents() {
  try {
    const result = await pool.query(
      `UPDATE booking_intents
       SET status = 'EXPIRED', updated_at = NOW()
       WHERE status = 'PAYMENT_PENDING'
         AND expires_at < NOW()
       RETURNING id`
    );
    if (result.rowCount > 0) {
      console.log(`[Intent] Expired ${result.rowCount} stale booking intents`);
    }
  } catch (e) {
    // Non-fatal — table might not exist yet
    if (e?.code !== "42P01") console.warn("[Intent] Expiry sweep error:", e?.message);
  }
}

async function getNextWaitlistPosition(client, trainId, travelDate) {
  const nextPositionResult = await client.query(
    `SELECT COALESCE(waitlist_position, 0)::int AS max_position
     FROM waitlist_entries
     WHERE train_id = $1
       AND travel_date = $2
       AND status = 'WAITLIST'
     ORDER BY waitlist_position DESC
     LIMIT 1
     FOR UPDATE`,
    [trainId, travelDate]
  );
  return Number(nextPositionResult.rows[0]?.max_position || 0) + 1;
}

async function promoteNextWaitlistedUser({ trainId, travelDate, seatNo }) {
  if (!trainId || !travelDate || !seatNo) {
    return null;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query("SELECT train_id FROM trains WHERE train_id = $1 FOR UPDATE", [trainId]);

    const nextWaitlistResult = await client.query(
      `SELECT id, user_email, amount, waitlist_position
       FROM waitlist_entries
       WHERE train_id = $1
         AND travel_date = $2
         AND status = 'WAITLIST'
       ORDER BY waitlist_position ASC, created_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED`,
      [trainId, travelDate]
    );

    if (nextWaitlistResult.rowCount === 0) {
      await client.query("COMMIT");
      return null;
    }

    const nextWaitlist = nextWaitlistResult.rows[0];

    const seatTakenByTicket = await client.query(
      `SELECT 1
       FROM tickets
       WHERE train_id = $1
         AND travel_date = $2
         AND seat_no = $3
         AND COALESCE(status, 'CONFIRMED') NOT IN ('CANCELLED', 'REFUNDED', 'PAYMENT_FAILED', 'PAYMENT_PENDING')
       LIMIT 1`,
      [trainId, travelDate, seatNo]
    );

    const seatTakenByIntent = await client.query(
      `SELECT 1
       FROM booking_intents
       WHERE train_id = $1
         AND travel_date = $2
         AND seat_no = $3
         AND status IN ('PAYMENT_PENDING', 'CONFIRMED')
       LIMIT 1`,
      [trainId, travelDate, seatNo]
    );

    if (seatTakenByTicket.rowCount > 0 || seatTakenByIntent.rowCount > 0) {
      await client.query("ROLLBACK");
      return null;
    }

    const intentResult = await client.query(
      `INSERT INTO booking_intents (user_email, train_id, seat_no, travel_date, amount, status, expires_at)
       VALUES ($1, $2, $3, $4, $5, 'PAYMENT_PENDING', NOW() + INTERVAL '15 minutes')
       RETURNING id, user_email, train_id, seat_no, travel_date, amount, expires_at`,
      [nextWaitlist.user_email, trainId, seatNo, travelDate, nextWaitlist.amount]
    );

    const promotedIntent = intentResult.rows[0];

    await client.query(
      `UPDATE waitlist_entries
       SET status = 'PROMOTED',
           waitlist_position = NULL,
           promoted_intent_id = $2,
           promoted_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [nextWaitlist.id, promotedIntent.id]
    );

    await client.query(
      `UPDATE waitlist_entries
       SET waitlist_position = waitlist_position - 1,
           updated_at = NOW()
       WHERE train_id = $1
         AND travel_date = $2
         AND status = 'WAITLIST'
         AND waitlist_position > $3`,
      [trainId, travelDate, nextWaitlist.waitlist_position]
    );

    try {
      await client.query(
        `INSERT INTO notifications (user_email, type, message, related_train_id, travel_date)
         VALUES (
           $1,
           'WAITLIST_PROMOTED',
           'Your waitlist request has been promoted. Complete payment to confirm your ticket.',
           $2,
           $3
         )`,
        [nextWaitlist.user_email, trainId, travelDate]
      );
    } catch (notifyErr) {
      if (notifyErr?.code !== "42P01") {
        console.warn("[Waitlist] Notification insert failed:", notifyErr?.message);
      }
    }

    await client.query("COMMIT");

    console.log(
      `[Waitlist] Promoted ${nextWaitlist.user_email} for train ${trainId} on ${travelDate} into seat ${seatNo} via intent #${promotedIntent.id}`
    );

    return {
      waitlistEntryId: nextWaitlist.id,
      userEmail: nextWaitlist.user_email,
      newIntent: promotedIntent,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    console.warn("[Waitlist] Auto-promotion failed:", error?.message);
    return null;
  } finally {
    client.release();
  }
}

// Book a ticket — creates a BOOKING INTENT (seat lock), NOT the final ticket.
// The ticket is created atomically only after payment verification.
router.post("/book-ticket", async (req, res) => {
  const { email, trainId, travelDate, seatNo, price } = req.body;

  if (!email || !trainId || !travelDate || !seatNo || price == null) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    // Housekeeping: expire stale intents (releases their seats)
    await expireStaleIntents();

    // Fetch train's scheduled departure time for booking eligibility check
    const trainResult = await pool.query(
      "SELECT scheduled_departure FROM trains WHERE train_id = $1",
      [trainId]
    );
    
    if (trainResult.rows.length === 0) {
      return res.status(404).json({ error: "Train not found" });
    }

    const scheduledDeparture = trainResult.rows[0].scheduled_departure;
    
    // Check booking eligibility (security: don't rely only on frontend validation)
    const eligibility = checkBookingEligibility({
      travelDate,
      scheduledDeparture,
      now: new Date()
    });

    if (!eligibility.allowed) {
      return res.status(400).json({ 
        error: `Booking not allowed: ${eligibility.reason}`,
        code: "BOOKING_CLOSED"
      });
    }

    // ── Check if user already has an active intent for this seat ──
    const existingIntent = await pool.query(
      `SELECT bi.*, t.ticket_id AS confirmed_ticket_id, t.payment_status AS ticket_payment_status
       FROM booking_intents bi
       LEFT JOIN tickets t ON t.ticket_id = bi.ticket_id
       WHERE bi.user_email = $1
         AND bi.train_id   = $2
         AND bi.travel_date = $3
         AND bi.seat_no    = $4
         AND bi.status IN ('PAYMENT_PENDING', 'CONFIRMED')
       ORDER BY bi.created_at DESC
       LIMIT 1`,
      [email, trainId, travelDate, seatNo]
    );

    if (existingIntent.rows.length > 0) {
      const intent = existingIntent.rows[0];

      // If already confirmed (ticket created), return existing ticket
      if (intent.status === "CONFIRMED" && intent.ticket_id) {
        const ticketRes = await pool.query("SELECT * FROM tickets WHERE ticket_id = $1", [intent.ticket_id]);
        const ticket = ticketRes.rows[0];
        const isPaid = String(ticket?.payment_status || "").toUpperCase() === "PAID";
        return res.json({
          message: isPaid ? "Ticket already paid." : "Ticket exists — complete payment to confirm.",
          ticket,
          intentId: intent.id,
          status: "EXISTS",
          paymentRequired: !isPaid,
        });
      }

      // If still PAYMENT_PENDING — return the same intent (idempotent)
      return res.json({
        message: "Seat locked — complete payment to confirm.",
        intentId: intent.id,
        status: "INTENT_EXISTS",
        paymentRequired: true,
        amount: Number(intent.amount),
      });
    }

    // ── Check if seat is already locked by ANOTHER user / confirmed ticket ──
    // 1) Active intent by another user
    const otherIntent = await pool.query(
      `SELECT 1 FROM booking_intents
       WHERE train_id = $1 AND travel_date = $2 AND seat_no = $3
         AND status IN ('PAYMENT_PENDING', 'CONFIRMED')
         AND user_email <> $4`,
      [trainId, travelDate, seatNo, email]
    );
    if (otherIntent.rows.length > 0) {
      return res.status(409).json({ error: "Seat already booked" });
    }

    // 2) Existing confirmed ticket (legacy data or confirmed outside intent flow)
    const checkSeat = await pool.query(
      `SELECT 1 FROM tickets
       WHERE train_id = $1 AND travel_date = $2 AND seat_no = $3
         AND COALESCE(status, 'CONFIRMED') NOT IN ('CANCELLED', 'REFUNDED', 'PAYMENT_FAILED', 'PAYMENT_PENDING')`,
      [trainId, travelDate, seatNo]
    );
    if (checkSeat.rows.length > 0) {
      return res.status(409).json({ error: "Seat already booked" });
    }

    // ── Create booking intent (locks the seat for 10 min) ──
    const intentResult = await pool.query(
      `INSERT INTO booking_intents (user_email, train_id, seat_no, travel_date, amount, status, expires_at)
       VALUES ($1, $2, $3, $4, $5, 'PAYMENT_PENDING', NOW() + INTERVAL '10 minutes')
       RETURNING *`,
      [email, trainId, seatNo, travelDate, price]
    );

    const intent = intentResult.rows[0];
    console.log(`[Intent] Created #${intent.id} for ${email} seat ${seatNo}`);

    return res.json({
      message: "Seat locked — complete payment within 10 minutes.",
      intentId: intent.id,
      status: "CREATED",
      paymentRequired: true,
      amount: Number(intent.amount),
    });
  } catch (error) {
    // 23505 = unique_violation from the partial unique index
    if (error?.code === "23505") {
      return res.status(409).json({ error: "Seat already booked" });
    }

    const detail = error?.message || "Unknown error";
    console.error("Error creating booking intent:", {
      code: error?.code,
      message: error?.message,
      detail: error?.detail,
      constraint: error?.constraint,
    });

    return res.status(500).json({
      error: "Failed to book ticket",
      detail,
      code: error?.code || null,
    });
  }
});

// Join waitlist when train is fully booked (all seats occupied or locked)
router.post("/waitlist/join", async (req, res) => {
  const { email, trainId, travelDate, price } = req.body || {};

  if (!email || !trainId || !travelDate) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const client = await pool.connect();
  try {
    await expireStaleIntents();
    await client.query("BEGIN");

    const trainResult = await client.query(
      `SELECT train_id, total_seats, price, scheduled_departure
       FROM trains
       WHERE train_id = $1
       FOR UPDATE`,
      [trainId]
    );

    if (trainResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Train not found" });
    }

    const train = trainResult.rows[0];
    const eligibility = checkBookingEligibility({
      travelDate,
      scheduledDeparture: train.scheduled_departure,
      now: new Date(),
    });

    if (!eligibility.allowed) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: `Waitlist not allowed: ${eligibility.reason}`,
        code: "BOOKING_CLOSED",
      });
    }

    const existingWaitlist = await client.query(
      `SELECT *
       FROM waitlist_entries
       WHERE user_email = $1
         AND train_id = $2
         AND travel_date = $3
         AND status = 'WAITLIST'
       LIMIT 1`,
      [email, trainId, travelDate]
    );

    if (existingWaitlist.rowCount > 0) {
      await client.query("COMMIT");
      return res.json({
        message: "Already in waitlist for this train/date",
        status: "WAITLIST_EXISTS",
        entry: existingWaitlist.rows[0],
      });
    }

    const confirmedSeatsResult = await client.query(
      `SELECT COUNT(*)::int AS confirmed_count
       FROM tickets
       WHERE train_id = $1
         AND travel_date = $2
         AND seat_no IS NOT NULL
         AND COALESCE(status, 'CONFIRMED') NOT IN ('CANCELLED', 'REFUNDED', 'PAYMENT_FAILED', 'PAYMENT_PENDING')`,
      [trainId, travelDate]
    );

    const lockedSeatsResult = await client.query(
      `SELECT COUNT(*)::int AS locked_count
       FROM booking_intents
       WHERE train_id = $1
         AND travel_date = $2
         AND status = 'PAYMENT_PENDING'
         AND expires_at > NOW()`,
      [trainId, travelDate]
    );

    const confirmedCount = Number(confirmedSeatsResult.rows[0]?.confirmed_count || 0);
    const lockedCount = Number(lockedSeatsResult.rows[0]?.locked_count || 0);
    const totalSeats = Number(train.total_seats || 0);

    if (confirmedCount + lockedCount < totalSeats) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "Seats are currently available. Please book directly.",
        code: "SEATS_AVAILABLE",
      });
    }

    const nextPosition = await getNextWaitlistPosition(client, trainId, travelDate);
    const amount = Number(price ?? train.price ?? 0);

    const insertResult = await client.query(
      `INSERT INTO waitlist_entries (user_email, train_id, travel_date, amount, status, waitlist_position)
       VALUES ($1, $2, $3, $4, 'WAITLIST', $5)
       RETURNING *`,
      [email, trainId, travelDate, amount, nextPosition]
    );

    await client.query("COMMIT");

    return res.status(201).json({
      message: "Added to waitlist successfully",
      status: "WAITLISTED",
      entry: insertResult.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error?.code === "42P01") {
      return res.status(500).json({
        error: "Waitlist table not found. Run waitlist migration.",
        hint: "node apply-waitlist-migration.js",
      });
    }
    if (error?.code === "23505") {
      return res.status(409).json({ error: "You are already in waitlist for this train/date" });
    }

    console.error("Error joining waitlist:", error);
    return res.status(500).json({ error: "Failed to join waitlist" });
  } finally {
    client.release();
  }
});

// Get waitlist entries for a user
router.get("/my-waitlist", async (req, res) => {
  const email = String(req.query?.email || req.headers["x-user-email"] || "").trim().toLowerCase();

  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  try {
    const result = await pool.query(
      `SELECT w.*, tr.train_name, tr.source, tr.destination, tr.scheduled_departure, tr.scheduled_arrival
       FROM waitlist_entries w
       JOIN trains tr ON tr.train_id = w.train_id
       WHERE w.user_email = $1
         AND w.status IN ('WAITLIST', 'PROMOTED')
       ORDER BY w.travel_date ASC, w.waitlist_position ASC NULLS LAST, w.created_at DESC`,
      [email]
    );

    return res.json(result.rows);
  } catch (error) {
    if (error?.code === "42P01") {
      return res.json([]);
    }
    console.error("Error fetching waitlist entries:", error);
    return res.status(500).json({ error: "Failed to fetch waitlist entries" });
  }
});

// Leave waitlist entry (or admin cancel)
router.patch("/waitlist/:id/cancel", async (req, res) => {
  const entryId = Number(req.params.id);
  const email = String(req.headers["x-user-email"] || req.body?.email || "").trim().toLowerCase();

  if (!entryId || Number.isNaN(entryId)) {
    return res.status(400).json({ error: "Valid waitlist entry id is required" });
  }
  if (!email) {
    return res.status(400).json({ error: "User email required" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const isAdmin = isAdminEmail(email);
    const whereClause = isAdmin ? "id = $1" : "id = $1 AND user_email = $2";
    const params = isAdmin ? [entryId] : [entryId, email];

    const entryResult = await client.query(
      `SELECT * FROM waitlist_entries WHERE ${whereClause} FOR UPDATE`,
      params
    );

    if (entryResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Waitlist entry not found" });
    }

    const entry = entryResult.rows[0];
    if (entry.status !== "WAITLIST") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Only active waitlist entries can be cancelled" });
    }

    await client.query(
      `UPDATE waitlist_entries
       SET status = 'CANCELLED',
           waitlist_position = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [entry.id]
    );

    await client.query(
      `UPDATE waitlist_entries
       SET waitlist_position = waitlist_position - 1,
           updated_at = NOW()
       WHERE train_id = $1
         AND travel_date = $2
         AND status = 'WAITLIST'
         AND waitlist_position > $3`,
      [entry.train_id, entry.travel_date, entry.waitlist_position]
    );

    await client.query("COMMIT");
    return res.json({ message: "Waitlist entry cancelled successfully" });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error cancelling waitlist entry:", error);
    return res.status(500).json({ error: "Failed to cancel waitlist entry" });
  } finally {
    client.release();
  }
});

router.get("/user/notifications/unread-count", async (req, res) => {
  const email = String(req.query?.email || req.headers["x-user-email"] || "").trim().toLowerCase();

  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  try {
    const result = await pool.query(
      `SELECT COUNT(*)::int AS unread_count
       FROM notifications
       WHERE user_email = $1
         AND is_read = FALSE`,
      [email]
    );

    return res.json({ unreadCount: Number(result.rows[0]?.unread_count || 0) });
  } catch (error) {
    if (error?.code === "42P01") {
      return res.json({ unreadCount: 0 });
    }
    console.error("Error fetching unread notification count:", error);
    return res.status(500).json({ error: "Failed to fetch unread notification count" });
  }
});

router.get("/user/notifications", async (req, res) => {
  const email = String(req.query?.email || req.headers["x-user-email"] || "").trim().toLowerCase();
  const limit = Math.min(Number(req.query?.limit || 20), 100);

  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  try {
    const result = await pool.query(
      `SELECT id, type, message, related_train_id, travel_date, is_read, created_at
       FROM notifications
       WHERE user_email = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [email, limit]
    );

    return res.json(result.rows);
  } catch (error) {
    if (error?.code === "42P01") {
      return res.json([]);
    }
    console.error("Error fetching notifications:", error);
    return res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

router.patch("/user/notifications/mark-read", async (req, res) => {
  const email = String(req.body?.email || req.query?.email || req.headers["x-user-email"] || "")
    .trim()
    .toLowerCase();

  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  try {
    const result = await pool.query(
      `UPDATE notifications
       SET is_read = TRUE,
           updated_at = NOW()
       WHERE user_email = $1
         AND is_read = FALSE
       RETURNING id`,
      [email]
    );

    return res.json({ updated: result.rowCount || 0 });
  } catch (error) {
    if (error?.code === "42P01") {
      return res.json({ updated: 0 });
    }
    console.error("Error marking notifications as read:", error);
    return res.status(500).json({ error: "Failed to mark notifications as read" });
  }
});

// Notification badge count for navbar
// Count includes:
// 1) Upcoming journeys (today/future, active statuses)
// 2) Refund-pending tickets (cancelled but still marked paid)
// 3) Payment issues (failed/pending)
// 4) Active unpaid booking intents (if booking_intents table exists)
router.get("/user/notifications-count", async (req, res) => {
  const email = String(req.query?.email || req.headers["x-user-email"] || "").trim().toLowerCase();

  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  try {
    const countsRes = await pool.query(
      `SELECT
        COUNT(*) FILTER (
          WHERE travel_date >= CURRENT_DATE
            AND UPPER(COALESCE(status, 'CONFIRMED')) IN ('CONFIRMED', 'UPCOMING', 'RUNNING', 'PAYMENT_PENDING')
        )::int AS upcoming_count,
        COUNT(*) FILTER (
          WHERE (UPPER(COALESCE(status, '')) = 'CANCELLED' AND UPPER(COALESCE(payment_status, '')) = 'PAID')
             OR UPPER(COALESCE(status, '')) = 'PAYMENT_FAILED'
             OR UPPER(COALESCE(payment_status, '')) = 'FAILED'
             OR UPPER(COALESCE(payment_status, '')) = 'PENDING'
        )::int AS attention_count
      FROM tickets
      WHERE user_email = $1`,
      [email]
    );

    let activeIntentCount = 0;
    try {
      const intentRes = await pool.query(
        `SELECT COUNT(*)::int AS active_intent_count
         FROM booking_intents
         WHERE user_email = $1
           AND status = 'PAYMENT_PENDING'
           AND expires_at > NOW()`,
        [email]
      );
      activeIntentCount = Number(intentRes.rows[0]?.active_intent_count || 0);
    } catch (intentErr) {
      if (intentErr?.code !== "42P01") {
        console.warn("[Notifications] booking_intents count failed:", intentErr?.message);
      }
    }

    const upcomingCount = Number(countsRes.rows[0]?.upcoming_count || 0);
    const attentionCount = Number(countsRes.rows[0]?.attention_count || 0);
    let waitlistCount = 0;
    try {
      const waitlistRes = await pool.query(
        `SELECT COUNT(*)::int AS waitlist_count
         FROM waitlist_entries
         WHERE user_email = $1
           AND status = 'WAITLIST'`,
        [email]
      );
      waitlistCount = Number(waitlistRes.rows[0]?.waitlist_count || 0);
    } catch (waitlistErr) {
      if (waitlistErr?.code !== "42P01") {
        console.warn("[Notifications] waitlist count failed:", waitlistErr?.message);
      }
    }

    let unreadNotifications = 0;
    try {
      const notifRes = await pool.query(
        `SELECT COUNT(*)::int AS unread_count
         FROM notifications
         WHERE user_email = $1
           AND is_read = FALSE`,
        [email]
      );
      unreadNotifications = Number(notifRes.rows[0]?.unread_count || 0);
    } catch (notifErr) {
      if (notifErr?.code !== "42P01") {
        console.warn("[Notifications] unread notifications count failed:", notifErr?.message);
      }
    }

    const count = upcomingCount + attentionCount + activeIntentCount + waitlistCount;

    return res.json({
      count,
      breakdown: {
        upcoming: upcomingCount,
        attention: attentionCount,
        activeIntents: activeIntentCount,
        waitlist: waitlistCount,
        unreadNotifications,
      },
    });
  } catch (error) {
    console.error("Error fetching notifications count:", error);
    return res.status(500).json({ error: "Failed to fetch notifications count" });
  }
});

// Get user's tickets by email
router.get("/my-tickets", async (req, res) => {
  const { email } = req.query;

  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  try {
    const result = await pool.query(
      `SELECT t.*, 
              tr.train_name, 
              tr.source, 
              tr.destination, 
              tr.departure_time, 
              tr.arrival_time,
              tr.scheduled_departure,
              tr.scheduled_arrival,
              tr.delay_minutes
       FROM tickets t
       JOIN trains tr ON t.train_id = tr.train_id
       WHERE t.user_email = $1
       ORDER BY t.booking_date DESC`,
      [email]
    );

    // Compute status for each ticket (Backend is Single Source of Truth)
    const now = new Date();
    const enrichedTickets = result.rows.map(ticket => {
      const upperStatus = (ticket.status || "").toUpperCase();

      // Terminal statuses — no date-based computation needed
      if (upperStatus === "CANCELLED") {
        return {
          ...ticket,
          computed_status: "CANCELLED",
          can_track: false,
          can_cancel: false,
          can_download: false,
          status_message: "This ticket has been cancelled.",
          is_delayed: false,
          delay_minutes: 0
        };
      }
      if (upperStatus === "REFUNDED") {
        return {
          ...ticket,
          computed_status: "REFUNDED",
          can_track: false,
          can_cancel: false,
          can_download: false,
          status_message: "This ticket has been cancelled and refunded.",
          is_delayed: false,
          delay_minutes: 0
        };
      }
      if (upperStatus === "PAYMENT_FAILED") {
        return {
          ...ticket,
          computed_status: "PAYMENT_FAILED",
          can_track: false,
          can_cancel: true,
          can_download: false,
          status_message: "Payment failed. You can retry payment or cancel this ticket.",
          is_delayed: false,
          delay_minutes: 0
        };
      }

      // Compute status using the utility (includes delay handling)
      const statusInfo = getTicketStatus({
        travelDate: ticket.travel_date,
        departureTime: ticket.scheduled_departure || ticket.departure_time || "00:00:00",
        arrivalTime: ticket.scheduled_arrival || ticket.arrival_time || "23:59:59",
        delayMinutes: ticket.delay_minutes || 0,
        now
      });

      return {
        ...ticket,
        computed_status: statusInfo.status,
        can_track: statusInfo.canTrack,
        can_cancel: statusInfo.canCancel,
        can_download: statusInfo.canDownload,
        status_message: statusInfo.message,
        is_delayed: statusInfo.isDelayed,
        delay_minutes: statusInfo.delayMinutes
      };
    });

    res.json(enrichedTickets);
  } catch (error) {
    console.error("Error fetching tickets:", error);
    res.status(500).json({ error: "Failed to fetch tickets" });
  }
});

// Legacy endpoint - Get tickets by user ID
router.get("/tickets/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    const result = await pool.query(
      `SELECT t.*, 
              tr.train_name, 
              tr.source, 
              tr.destination, 
              tr.departure_time, 
              tr.arrival_time,
              tr.scheduled_departure,
              tr.scheduled_arrival,
              tr.delay_minutes
       FROM tickets t
       JOIN trains tr ON t.train_id = tr.train_id
       WHERE t.user_email = $1
       ORDER BY t.booking_date DESC`,
      [userId]
    );

    // Compute status for each ticket (Backend is Single Source of Truth)
    const now = new Date();
    const enrichedTickets = result.rows.map(ticket => {
      const upperStatus = (ticket.status || "").toUpperCase();
      if (upperStatus === "CANCELLED") {
        return {
          ...ticket,
          computed_status: "CANCELLED",
          can_track: false,
          can_cancel: false,
          can_download: false,
          status_message: "This ticket has been cancelled.",
          is_delayed: false,
          delay_minutes: 0
        };
      }
      if (upperStatus === "REFUNDED") {
        return {
          ...ticket,
          computed_status: "REFUNDED",
          can_track: false,
          can_cancel: false,
          can_download: false,
          status_message: "This ticket has been cancelled and refunded.",
          is_delayed: false,
          delay_minutes: 0
        };
      }
      if (upperStatus === "PAYMENT_FAILED") {
        return {
          ...ticket,
          computed_status: "PAYMENT_FAILED",
          can_track: false,
          can_cancel: true,
          can_download: false,
          status_message: "Payment failed. You can retry payment or cancel this ticket.",
          is_delayed: false,
          delay_minutes: 0
        };
      }

      const statusInfo = getTicketStatus({
        travelDate: ticket.travel_date,
        departureTime: ticket.scheduled_departure || ticket.departure_time || "00:00:00",
        arrivalTime: ticket.scheduled_arrival || ticket.arrival_time || "23:59:59",
        delayMinutes: ticket.delay_minutes || 0,
        now
      });

      return {
        ...ticket,
        computed_status: statusInfo.status,
        can_track: statusInfo.canTrack,
        can_cancel: statusInfo.canCancel,
        can_download: statusInfo.canDownload,
        status_message: statusInfo.message,
        is_delayed: statusInfo.isDelayed,
        delay_minutes: statusInfo.delayMinutes
      };
    });

    res.json(enrichedTickets);
  } catch (error) {
    console.error("Error fetching tickets:", error);
    res.status(500).json({ error: "Failed to fetch tickets" });
  }
});

// Delete/cancel a ticket (DEPRECATED - use PATCH /tickets/:ticketId/cancel instead)
// This endpoint is kept for backward compatibility but now validates status
router.delete("/tickets/:ticketId", async (req, res) => {
  const { ticketId } = req.params;

  try {
    // Fetch ticket with train schedule for status validation
    const ticketResult = await pool.query(
      `SELECT t.ticket_id, t.travel_date, t.status,
              tr.scheduled_departure, tr.scheduled_arrival
       FROM tickets t
       JOIN trains tr ON tr.train_id = t.train_id
       WHERE t.ticket_id = $1`,
      [ticketId]
    );

    if (ticketResult.rowCount === 0) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    const ticket = ticketResult.rows[0];

    // Check if already cancelled
    if ((ticket.status || "").toUpperCase() === "CANCELLED") {
      return res.status(400).json({ error: "Ticket is already cancelled" });
    }

    // Check ticket status - only allow cancellation for UPCOMING tickets
    const ticketStatusInfo = getTicketStatus({
      travelDate: ticket.travel_date,
      departureTime: ticket.scheduled_departure || "00:00:00",
      arrivalTime: ticket.scheduled_arrival || "23:59:59",
      now: new Date()
    });

    if (!ticketStatusInfo.canCancel) {
      let reason = "Cancellation not allowed.";
      if (ticketStatusInfo.status === "RUNNING") {
        reason = "Cannot cancel. Train is currently running.";
      } else if (ticketStatusInfo.status === "COMPLETED") {
        reason = "Cannot cancel. Journey already completed.";
      }
      return res.status(400).json({ 
        error: reason,
        code: "CANCELLATION_NOT_ALLOWED",
        status: ticketStatusInfo.status
      });
    }

    // Soft delete - update status instead of hard delete (preserves history)
    const result = await pool.query(
      `UPDATE tickets 
       SET status = 'CANCELLED', seat_no = NULL 
       WHERE ticket_id = $1 
       RETURNING *`,
      [ticketId]
    );

    res.json({ message: "Ticket cancelled successfully", ticket: result.rows[0] });
  } catch (error) {
    console.error("Error cancelling ticket:", error);
    res.status(500).json({ error: "Failed to cancel ticket" });
  }
});

// User cancel (status update) - verifies ownership by user_email
router.patch("/tickets/:ticketId/cancel", async (req, res) => {
  const { ticketId } = req.params;
  const userEmail = req.headers["x-user-email"] || req.body?.email;

  if (!userEmail) {
    return res.status(400).json({ error: "User email required" });
  }

  try {
    const isAdmin = isAdminEmail(userEmail);

    // Pre-fetch details for validation and email (seat_no will be nulled by cancellation).
    const detailsResult = isAdmin
      ? await pool.query(
          `SELECT t.ticket_id, t.user_email, t.train_id, t.travel_date, t.seat_no, t.price, t.pnr, t.status,
                  tr.train_name, tr.source, tr.destination, tr.scheduled_departure, tr.scheduled_arrival
           FROM tickets t
           JOIN trains tr ON tr.train_id = t.train_id
           WHERE t.ticket_id = $1`,
          [ticketId]
        )
      : await pool.query(
          `SELECT t.ticket_id, t.user_email, t.train_id, t.travel_date, t.seat_no, t.price, t.pnr, t.status,
                  tr.train_name, tr.source, tr.destination, tr.scheduled_departure, tr.scheduled_arrival
           FROM tickets t
           JOIN trains tr ON tr.train_id = t.train_id
           WHERE t.ticket_id = $1 AND t.user_email = $2`,
          [ticketId, userEmail]
        );

    if (detailsResult.rowCount === 0) {
      return res.status(404).json({ error: "Ticket not found or not owned by user" });
    }

    const emailDetails = detailsResult.rows[0];
    
    // Check if already cancelled
    if (emailDetails.status === "CANCELLED") {
      return res.status(400).json({ error: "Ticket is already cancelled" });
    }

    // Check ticket status - only allow cancellation for UPCOMING tickets
    const ticketStatusInfo = getTicketStatus({
      travelDate: emailDetails.travel_date,
      departureTime: emailDetails.scheduled_departure || "00:00:00",
      arrivalTime: emailDetails.scheduled_arrival || "23:59:59",
      now: new Date()
    });

    // Only UPCOMING tickets can be cancelled (unless admin override)
    if (!isAdmin && !ticketStatusInfo.canCancel) {
      let reason = "Cancellation not allowed.";
      if (ticketStatusInfo.status === "RUNNING") {
        reason = "Cannot cancel. Train is currently running.";
      } else if (ticketStatusInfo.status === "COMPLETED") {
        reason = "Cannot cancel. Journey already completed.";
      }
      return res.status(400).json({ 
        error: reason,
        code: "CANCELLATION_NOT_ALLOWED",
        status: ticketStatusInfo.status
      });
    }

    const result = await pool.query(
      `UPDATE tickets
       SET status = 'CANCELLED',
           seat_no = NULL
       WHERE ticket_id = $1
         AND status IS DISTINCT FROM 'CANCELLED'
       RETURNING *`,
      [ticketId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Ticket not found or already cancelled" });
    }

    let waitlistPromotion = null;
    if (String(emailDetails?.status || "").toUpperCase() !== "CANCELLED" && emailDetails?.seat_no) {
      waitlistPromotion = await promoteNextWaitlistedUser({
        trainId: emailDetails.train_id,
        travelDate: emailDetails.travel_date,
        seatNo: emailDetails.seat_no,
      });
    }

    // ── Refund processing ──────────────────────────────────────────
    let refundResult = { processed: false };
    try {
      // Check if ticket was paid via payments ledger
      const paymentRow = await pool.query(
        `SELECT * FROM payments WHERE ticket_id = $1 AND status = 'SUCCESS' ORDER BY created_at DESC LIMIT 1`,
        [ticketId]
      );

      if (paymentRow.rowCount > 0) {
        const payment = paymentRow.rows[0];
        const razorpayPaymentId = payment.razorpay_payment_id;

        // Attempt Razorpay refund if real payment (not simulated)
        if (razorpayPaymentId && !razorpayPaymentId.startsWith('SIMULATED')) {
          try {
            const Razorpay = require('razorpay');
            const keyId = process.env.RAZORPAY_KEY_ID;
            const keySecret = process.env.RAZORPAY_KEY_SECRET;
            if (keyId && keySecret) {
              const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });
              await rzp.payments.refund(razorpayPaymentId, {
                amount: Math.round(Number(payment.amount) * 100),
              });
              refundResult = { processed: true, mode: 'razorpay' };
            }
          } catch (rzpErr) {
            console.warn('[Refund] Razorpay refund failed:', rzpErr?.message);
            // Still mark as refunded in our ledger (manual reconciliation)
            refundResult = { processed: true, mode: 'manual', error: rzpErr?.message };
          }
        } else {
          // Simulated payment — just mark as refunded
          refundResult = { processed: true, mode: 'simulated' };
        }

        // Update payments ledger
        await pool.query(
          `UPDATE payments SET status = 'REFUNDED' WHERE ticket_id = $1 AND status = 'SUCCESS'`,
          [ticketId]
        );

        // Update ticket status to REFUNDED
        await pool.query(
          `UPDATE tickets SET status = 'REFUNDED', payment_status = 'REFUNDED' WHERE ticket_id = $1`,
          [ticketId]
        );
        // Update the returned ticket object
        result.rows[0].status = 'REFUNDED';
        result.rows[0].payment_status = 'REFUNDED';
      }
    } catch (refundErr) {
      // Non-fatal: refund failure should not break cancellation
      console.warn('[Refund] Refund processing error:', refundErr?.message);
    }

    // Send cancellation email after successful DB update (non-blocking).
    if (emailDetails?.user_email) {
      try {
        sendCancellationEmail({
          to: emailDetails.user_email,
          details: emailDetails,
        }).catch((e) => {
          console.warn("[Email] Cancellation email failed:", e?.message || e);
        });
      } catch (e) {
        console.warn("[Email] Cancellation email failed:", e?.message || e);
      }
    }

    return res.json({
      message: refundResult.processed
        ? "Ticket cancelled & refund initiated successfully"
        : "Ticket cancelled successfully",
      ticket: result.rows[0],
      refund: refundResult,
      waitlistPromotion,
    });
  } catch (error) {
    console.error("Error cancelling ticket:", error);
    res.status(500).json({ error: "Failed to cancel ticket" });
  }
});

// Cancel ticket (update status) - for admin dashboard
router.post("/tickets/:ticketId/cancel", requireAdmin, async (req, res) => {
  const { ticketId } = req.params;

  try {
    // Pre-fetch details for email (seat_no will be nulled by cancellation).
    const detailsResult = await pool.query(
      `SELECT t.ticket_id, t.user_email, t.train_id, t.travel_date, t.seat_no, t.price, t.pnr,
              tr.train_name, tr.source, tr.destination
       FROM tickets t
       JOIN trains tr ON tr.train_id = t.train_id
       WHERE t.ticket_id = $1`,
      [ticketId]
    );
    const emailDetails = detailsResult.rowCount > 0 ? detailsResult.rows[0] : null;

    const result = await pool.query(
      `UPDATE tickets
       SET status = 'CANCELLED',
           seat_no = NULL
       WHERE ticket_id = $1
         AND status IS DISTINCT FROM 'CANCELLED'
       RETURNING *`,
      [ticketId]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: "Ticket not found or already cancelled" });
    }

    let waitlistPromotion = null;
    if (emailDetails?.seat_no) {
      waitlistPromotion = await promoteNextWaitlistedUser({
        trainId: emailDetails.train_id,
        travelDate: emailDetails.travel_date,
        seatNo: emailDetails.seat_no,
      });
    }

    // Send cancellation email after successful DB update (non-blocking).
    if (emailDetails?.user_email) {
      try {
        sendCancellationEmail({
          to: emailDetails.user_email,
          details: emailDetails,
        }).catch((e) => {
          console.warn("[Email] Cancellation email failed (admin):", e?.message || e);
        });
      } catch (e) {
        console.warn("[Email] Cancellation email failed (admin):", e?.message || e);
      }
    }

    res.json({ message: "Ticket cancelled successfully", ticket: result.rows[0], waitlistPromotion });
  } catch (error) {
    console.error("Error cancelling ticket:", error);
    res.status(500).json({ error: "Failed to cancel ticket" });
  }
});

// Generate PDF ticket
router.get("/tickets/:ticketId/pdf", async (req, res) => {
  const { ticketId } = req.params;

  try {
    console.log(">>> PDF Route - Fetching ticket:", ticketId);
    const result = await pool.query(
      `SELECT t.*, tr.train_name, tr.source, tr.destination, tr.departure_time, tr.arrival_time
       FROM tickets t
       JOIN trains tr ON t.train_id = tr.train_id
       WHERE t.ticket_id = $1`,
      [ticketId]
    );

    if (result.rows.length === 0) {
      console.log(">>> PDF Route - Ticket not found:", ticketId);
      return res.status(404).json({ error: "Ticket not found" });
    }

    const ticket = result.rows[0];
    console.log(">>> PDF Route - Generating PDF for ticket:", ticket.ticket_id);

    // Block PDF until payment is completed (backward compatible if column missing/null)
    const payStatusRaw = ticket.payment_status;
    if (payStatusRaw != null) {
      const payStatus = String(payStatusRaw).toUpperCase();
      if (payStatus !== "PAID") {
        return res.status(403).json({
          error: "Payment pending. Complete payment to download PDF.",
          payment_status: payStatus,
        });
      }
    }
    
    // Generate PDF into buffer (new signature: ticket first, stream second)
    const pdfBuffer = await generateTicketPdf(ticket, null);
    
    // Validate buffer
    if (!Buffer.isBuffer(pdfBuffer) || pdfBuffer.length < 100) {
      console.error(">>> PDF Route - Invalid buffer returned:", pdfBuffer ? pdfBuffer.length : 'null');
      return res.status(500).send("PDF generation failed (invalid buffer). Check server logs.");
    }
    
    console.log(">>> PDF Route - Sending buffer, size:", pdfBuffer.length);
    
    // Set headers BEFORE sending buffer
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename=ticket-RS-${ticket.ticket_id}.pdf`);
    res.setHeader("Content-Length", pdfBuffer.length);
    // Prevent browser caching of PDF
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Surrogate-Control", "no-store");
    
    // Send complete buffer
    res.send(pdfBuffer);
    console.log(">>> PDF Route - Response sent successfully");
    
  } catch (error) {
    console.error(">>> PDF Route - Error:", error.stack || error);
    if (!res.headersSent) {
      res.status(500).send("Failed to generate PDF: " + error.message);
    }
  }
});

// Handle OPTIONS preflight for CORS
router.options("/tickets/:ticketId/preview.png", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "http://localhost:5173");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
  res.status(204).send();
});

// Generate PNG preview of ticket (uses Puppeteer with disk caching)
router.get("/tickets/:ticketId/preview.png", async (req, res) => {
  const { ticketId } = req.params;

  try {
    console.log(">>> PNG Preview Route - Fetching ticket:", ticketId);
    
    // Set CORS headers early (must specify origin when using credentials)
    res.setHeader("Access-Control-Allow-Origin", "http://localhost:5173");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
    
    const result = await pool.query(
      `SELECT t.*, tr.train_name, tr.source, tr.destination, tr.departure_time, tr.arrival_time
       FROM tickets t
       JOIN trains tr ON t.train_id = tr.train_id
       WHERE t.ticket_id = $1`,
      [ticketId]
    );

    if (result.rows.length === 0) {
      console.log(">>> PNG Preview Route - Ticket not found:", ticketId);
      return res.status(404).json({ error: "Ticket not found" });
    }

    const ticket = result.rows[0];
    const force = req.query.force === "1" || req.query.force === "true";
    const scale = Math.max(1, Number(req.query.scale) || 1);
    const cacheFile = path.join(CACHE_DIR, `${ticketId}${scale > 1 ? `@${scale}x` : ""}.png`);

    // Check if cached version exists
    if (!force && fs.existsSync(cacheFile)) {
      console.log(">>> PNG Preview Route - Serving cached file:", cacheFile);
      const stats = fs.statSync(cacheFile);
      console.log(">>> PNG Preview Route - File size:", stats.size, "bytes");
      
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Content-Length", stats.size);
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      return res.sendFile(cacheFile);
    }

    console.log(">>> PNG Preview Route - Generating PNG preview for ticket:", ticket.ticket_id);
    
    // Generate PNG preview using Puppeteer
    const pngBuffer = await generateTicketPreviewPNGWithPuppeteer(ticket, {
      viewport: { width: 1200 * scale, height: 1600 * scale },
      waitFor: 350
    });
    
    // Validate PNG buffer
    if (!Buffer.isBuffer(pngBuffer) || pngBuffer.length === 0) {
      console.error(">>> PNG Preview Route - Invalid PNG buffer returned");
      throw new Error("Invalid PNG buffer generated");
    }
    
    console.log(">>> PNG Preview Route - PNG buffer size:", pngBuffer.length, "bytes");
    console.log(">>> PNG Preview Route - First 4 bytes (PNG signature):", pngBuffer.slice(0, 4).toString('hex'));
    
    // Save to cache atomically (write to .tmp then rename)
    const tmpFile = cacheFile + ".tmp";
    await fs.promises.writeFile(tmpFile, pngBuffer);
    await fs.promises.rename(tmpFile, cacheFile);
    
    console.log(">>> PNG Preview Route - Cached to:", cacheFile);
    console.log(">>> PNG Preview Route - Sending PNG file via sendFile");
    
    // Set headers for PNG image
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Content-Length", pngBuffer.length);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.sendFile(cacheFile);
    
  } catch (error) {
    console.error(">>> PNG Preview Route - Error:", error.stack || error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to generate PNG preview: " + error.message });
    }
  }
});

module.exports = router;
