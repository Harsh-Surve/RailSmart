const express = require("express");
const crypto = require("crypto");
const Razorpay = require("razorpay");
const pool = require("../db");
const { sendBookingEmail } = require("../utils/emailService");
const { checkBookingEligibility } = require("../utils/bookingEligibility");

const router = express.Router();

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

/**
 * Validate a booking intent before allowing payment.
 * Checks: intent exists, not expired, train hasn't departed.
 */
async function validateIntentForPayment(intentId) {
  const result = await pool.query(
    `SELECT bi.*, tr.scheduled_departure
     FROM booking_intents bi
     JOIN trains tr ON tr.train_id = bi.train_id
     WHERE bi.id = $1`,
    [intentId]
  );

  if (result.rowCount === 0) {
    return { ok: false, status: 404, error: "Booking intent not found" };
  }

  const intent = result.rows[0];
  const intentStatus = (intent.status || "").toUpperCase();

  if (intentStatus === "CONFIRMED" && intent.ticket_id) {
    // Already confirmed — check if ticket is paid
    const ticketRes = await pool.query(
      "SELECT payment_status FROM tickets WHERE ticket_id = $1",
      [intent.ticket_id]
    );
    const isPaid = String(ticketRes.rows[0]?.payment_status || "").toUpperCase() === "PAID";
    if (isPaid) {
      return { ok: false, status: 400, error: "Ticket is already paid", code: "ALREADY_PAID" };
    }
    // Ticket exists but not paid — allow payment
    return { ok: true, intent };
  }

  if (intentStatus === "EXPIRED" || intentStatus === "FAILED") {
    return { ok: false, status: 400, error: "Booking intent has expired. Please book again." };
  }

  if (intentStatus !== "PAYMENT_PENDING") {
    return { ok: false, status: 400, error: `Invalid intent status: ${intentStatus}` };
  }

  // Check if expired by time
  if (new Date(intent.expires_at) < new Date()) {
    await pool.query("UPDATE booking_intents SET status = 'EXPIRED', updated_at = NOW() WHERE id = $1", [intentId]);
    return { ok: false, status: 400, error: "Booking intent has expired. Please book again." };
  }

  // Check booking eligibility (train must not have departed)
  let travelDateStr = intent.travel_date;
  if (travelDateStr instanceof Date) {
    travelDateStr = travelDateStr.toISOString().slice(0, 10);
  } else if (typeof travelDateStr === "string" && travelDateStr.length > 10) {
    travelDateStr = travelDateStr.slice(0, 10);
  }

  const eligibility = checkBookingEligibility({
    travelDate: travelDateStr,
    scheduledDeparture: intent.scheduled_departure || "00:00:00",
    now: new Date(),
  });

  if (!eligibility.allowed) {
    return {
      ok: false,
      status: 400,
      error: `Payment not allowed: ${eligibility.reason}`,
      code: "BOOKING_CLOSED",
    };
  }

  return { ok: true, intent };
}

/**
 * Create a confirmed ticket from a booking intent (atomic).
 * Called after payment verification succeeds.
 */
async function createTicketFromIntent(intentId, paymentId, paymentOrderId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Lock the intent row
    const intentRes = await client.query(
      "SELECT * FROM booking_intents WHERE id = $1 FOR UPDATE",
      [intentId]
    );
    if (intentRes.rowCount === 0) {
      throw new Error("Intent not found");
    }
    const intent = intentRes.rows[0];

    // If ticket already created (idempotent), just return it
    if (intent.ticket_id) {
      const existing = await client.query("SELECT * FROM tickets WHERE ticket_id = $1", [intent.ticket_id]);
      // Ensure it's marked paid
      if (existing.rowCount > 0 && String(existing.rows[0].payment_status || "").toUpperCase() !== "PAID") {
        await client.query(
          `UPDATE tickets SET payment_status = 'PAID', payment_id = $2, payment_order_id = $3, status = 'CONFIRMED'
           WHERE ticket_id = $1`,
          [intent.ticket_id, paymentId, paymentOrderId]
        );
      }
      await client.query("COMMIT");
      const ticket = await pool.query("SELECT * FROM tickets WHERE ticket_id = $1", [intent.ticket_id]);
      return ticket.rows[0];
    }

    // Generate PNR and booking key
    const pnr = generatePNR(intent.train_id, intent.travel_date);
    const bookingKey = `${intent.user_email}_${intent.train_id}_${intent.travel_date}_${intent.seat_no}`;

    // Create the CONFIRMED ticket
    const ticketRes = await client.query(
      `INSERT INTO tickets (user_email, train_id, travel_date, seat_no, price, pnr, booking_key, booking_date, status, payment_status, payment_id, payment_order_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), 'CONFIRMED', 'PAID', $8, $9)
       RETURNING *`,
      [intent.user_email, intent.train_id, intent.travel_date, intent.seat_no, intent.amount, pnr, bookingKey, paymentId, paymentOrderId]
    );
    const ticket = ticketRes.rows[0];

    // Update intent → CONFIRMED with ticket reference
    await client.query(
      "UPDATE booking_intents SET status = 'CONFIRMED', ticket_id = $2, updated_at = NOW() WHERE id = $1",
      [intentId, ticket.ticket_id]
    );

    // Record in payments ledger
    try {
      await client.query(
        `INSERT INTO payments (ticket_id, razorpay_payment_id, razorpay_order_id, amount, status, created_at)
         VALUES ($1, $2, $3, $4, 'SUCCESS', NOW())
         ON CONFLICT DO NOTHING`,
        [ticket.ticket_id, paymentId, paymentOrderId, ticket.price]
      );
    } catch (ledgerErr) {
      console.warn("[Payments] Ledger write failed:", ledgerErr?.message);
    }

    await client.query("COMMIT");
    console.log(`[Intent] #${intentId} → Ticket #${ticket.ticket_id} created (CONFIRMED+PAID)`);
    return ticket;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

const shouldRequirePaymentOtp = () => {
  return String(process.env.REQUIRE_PAYMENT_OTP || "false").toLowerCase() === "true";
};

const getRazorpayClient = () => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) return null;

  return new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });
};

router.get("/key", (req, res) => {
  // Safe to expose Key ID (public), never expose secret.
  res.json({ keyId: process.env.RAZORPAY_KEY_ID || null });
});

// Simulated payment for demo mode (no Razorpay keys required).
// Now works with intent IDs — creates ticket atomically on success.
router.post("/simulate", async (req, res) => {
  const { intentId, ticketId: legacyTicketId } = req.body || {};
  const resolvedIntentId = intentId;

  // Support legacy ticketId for backward compat (find intent by ticket)
  if (!resolvedIntentId && legacyTicketId) {
    // Legacy path: create ticket directly (backward compat for old MyTickets retry)
    try {
      const ticketResult = await pool.query(
        "SELECT ticket_id, status, payment_status, price FROM tickets WHERE ticket_id = $1",
        [legacyTicketId]
      );
      if (ticketResult.rowCount === 0) return res.status(404).json({ error: "Ticket not found" });
      const ticket = ticketResult.rows[0];
      if (String(ticket.payment_status || "").toUpperCase() === "PAID") {
        return res.status(400).json({ error: "Ticket is already paid", code: "ALREADY_PAID" });
      }
      const generatedPaymentId = `SIMULATED_PAY_${Date.now()}`;
      const updateResult = await pool.query(
        `UPDATE tickets SET payment_status = 'PAID', payment_id = $2, payment_order_id = COALESCE(payment_order_id, 'SIMULATED_ORDER'), status = 'CONFIRMED' WHERE ticket_id = $1 RETURNING *`,
        [legacyTicketId, generatedPaymentId]
      );
      try {
        await pool.query(
          `INSERT INTO payments (ticket_id, razorpay_payment_id, razorpay_order_id, amount, status) VALUES ($1, $2, 'SIMULATED_ORDER', $3, 'SUCCESS') ON CONFLICT DO NOTHING`,
          [legacyTicketId, generatedPaymentId, ticket.price || 0]
        );
      } catch { /* ignore */ }
      return res.json({ success: true, simulated: true, ticket: updateResult.rows[0] });
    } catch (error) {
      console.error("Simulated payment (legacy) error:", error);
      return res.status(500).json({ success: false, error: "Simulated payment failed" });
    }
  }

  if (!resolvedIntentId) {
    return res.status(400).json({ error: "intentId is required" });
  }

  const allow = String(process.env.ALLOW_SIMULATED_PAYMENTS || "true").toLowerCase() !== "false";
  if (!allow) {
    return res.status(403).json({ error: "Simulated payments are disabled on server" });
  }

  try {
    // Validate intent
    const validation = await validateIntentForPayment(resolvedIntentId);
    if (!validation.ok) {
      return res.status(validation.status).json({ error: validation.error, code: validation.code });
    }

    const generatedPaymentId = `SIMULATED_PAY_${Date.now()}`;

    // Atomically create ticket from intent
    const ticket = await createTicketFromIntent(resolvedIntentId, generatedPaymentId, "SIMULATED_ORDER");

    // Send booking email (non-blocking)
    try {
      const detailsRes = await pool.query(
        `SELECT t.ticket_id, t.user_email, t.train_id, t.travel_date, t.seat_no, t.price, t.pnr,
                tr.train_name, tr.source, tr.destination
         FROM tickets t JOIN trains tr ON tr.train_id = t.train_id
         WHERE t.ticket_id = $1`,
        [ticket.ticket_id]
      );
      if (detailsRes.rowCount > 0) {
        sendBookingEmail({ to: detailsRes.rows[0].user_email, details: detailsRes.rows[0] })
          .catch((e) => console.warn("[Email] Booking email failed (simulate):", e?.message));
      }
    } catch (e) {
      console.warn("[Email] Booking email failed (simulate):", e?.message);
    }

    return res.json({ success: true, simulated: true, ticket });
  } catch (error) {
    console.error("Simulated payment error:", error);
    return res.status(500).json({ success: false, error: "Simulated payment failed" });
  }
});

// Create Razorpay order for a booking intent.
// Idempotent: if intent already has an order_id, returns the existing one.
// Also handles legacy tickets (pre-intent system) directly.
router.post("/create-order", async (req, res) => {
  const { intentId, ticketId: legacyTicketId } = req.body || {};
  const resolvedIntentId = intentId;

  if (!resolvedIntentId && !legacyTicketId) {
    return res.status(400).json({ error: "intentId or ticketId is required" });
  }

  const razorpay = getRazorpayClient();
  if (!razorpay) {
    return res.status(400).json({
      error: "Razorpay is not configured on server",
      hint: "Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in backend .env",
      code: "RAZORPAY_NOT_CONFIGURED",
    });
  }

  try {
    // If legacy ticketId was passed (backward compat), find intent or handle directly
    let intentIdToUse = resolvedIntentId;
    let legacyTicket = null;

    if (!intentIdToUse && legacyTicketId) {
      // Check if there's an intent for this ticket
      const intentRes = await pool.query(
        "SELECT id FROM booking_intents WHERE ticket_id = $1 AND status IN ('PAYMENT_PENDING', 'CONFIRMED') LIMIT 1",
        [legacyTicketId]
      );
      if (intentRes.rowCount > 0) {
        intentIdToUse = intentRes.rows[0].id;
      } else {
        // No intent found — handle as pure legacy ticket
        const ticketRes = await pool.query(
          `SELECT t.ticket_id, t.price, t.payment_status, t.payment_order_id, t.travel_date, tr.scheduled_departure
           FROM tickets t
           JOIN trains tr ON tr.train_id = t.train_id
           WHERE t.ticket_id = $1`,
          [legacyTicketId]
        );
        if (ticketRes.rowCount === 0) {
          return res.status(404).json({ error: "Ticket not found" });
        }
        legacyTicket = ticketRes.rows[0];

        // Already paid?
        if (String(legacyTicket.payment_status || "").toUpperCase() === "PAID") {
          return res.status(400).json({ error: "Ticket is already paid", code: "ALREADY_PAID" });
        }

        // Check if booking window is still open
        const eligibility = checkBookingEligibility({
          travelDate: legacyTicket.travel_date,
          scheduledDeparture: legacyTicket.scheduled_departure || "00:00:00",
          now: new Date(),
        });
        if (!eligibility.allowed) {
          return res.status(400).json({ error: `Booking closed: ${eligibility.reason}`, code: "BOOKING_CLOSED" });
        }
      }
    }

    // ── LEGACY TICKET PATH (no intent) ──
    if (legacyTicket) {
      // Reuse existing order if present
      if (legacyTicket.payment_order_id && !legacyTicket.payment_order_id.startsWith("SIMULATED")) {
        return res.json({
          orderId: legacyTicket.payment_order_id,
          amount: Math.round(Number(legacyTicket.price) * 100),
          currency: "INR",
          receipt: `ticket_${legacyTicketId}`,
          ticketId: legacyTicketId,
        });
      }

      const amount = Number(legacyTicket.price);
      if (!amount || amount <= 0) {
        return res.status(400).json({ error: "Invalid payment amount", code: "INVALID_AMOUNT" });
      }
      const amountPaise = Math.round(amount * 100);

      const order = await razorpay.orders.create({
        amount: amountPaise,
        currency: "INR",
        receipt: `ticket_${legacyTicketId}`,
      });

      // Store order ID on ticket
      await pool.query(
        "UPDATE tickets SET payment_order_id = $2 WHERE ticket_id = $1",
        [legacyTicketId, order.id]
      );

      return res.json({
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        receipt: order.receipt,
        ticketId: legacyTicketId,
      });
    }

    // ── INTENT PATH ──
    // Validate intent
    const validation = await validateIntentForPayment(intentIdToUse);
    if (!validation.ok) {
      return res.status(validation.status).json({ error: validation.error, code: validation.code });
    }

    const intent = validation.intent;

    // Idempotent: if intent already has a Razorpay order, return it
    if (intent.razorpay_order_id) {
      return res.json({
        orderId: intent.razorpay_order_id,
        amount: Math.round(Number(intent.amount) * 100),
        currency: "INR",
        receipt: `intent_${intent.id}`,
        intentId: intent.id,
      });
    }

    const amount = Number(intent.amount);
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Invalid payment amount", code: "INVALID_AMOUNT" });
    }
    const amountPaise = Math.round(amount * 100);

    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt: `intent_${intent.id}`,
    });

    // Store order ID on intent
    await pool.query(
      "UPDATE booking_intents SET razorpay_order_id = $2, updated_at = NOW() WHERE id = $1",
      [intent.id, order.id]
    );

    return res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      receipt: order.receipt,
      intentId: intent.id,
    });
  } catch (error) {
    console.error("Error creating Razorpay order:", error);
    const statusCode = Number(error?.statusCode) || 500;
    const description = error?.error?.description;
    const code = error?.error?.code;
    const message = description || code;
    return res.status(statusCode).json({
      error: message ? `Razorpay error: ${message}` : "Failed to create payment order",
      code: "RAZORPAY_API_ERROR",
      hint: "RAZORPAY API call failed — keys may be invalid or expired",
    });
  }
});

// Verify payment signature and create ticket atomically.
// Also handles legacy tickets directly (pre-intent system).
router.post("/verify", async (req, res) => {
  const {
    intentId,
    ticketId: legacyTicketId,
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
  } = req.body || {};

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  if (!intentId && !legacyTicketId) {
    return res.status(400).json({ error: "intentId or ticketId is required" });
  }

  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) {
    return res.status(500).json({ error: "Razorpay secret not configured" });
  }

  try {
    // Verify signature first
    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      // Mark intent/ticket as FAILED
      if (intentId) {
        await pool.query("UPDATE booking_intents SET status = 'FAILED', updated_at = NOW() WHERE id = $1", [intentId]);
      } else if (legacyTicketId) {
        await pool.query("UPDATE tickets SET payment_status = 'FAILED', status = 'PAYMENT_FAILED' WHERE ticket_id = $1", [legacyTicketId]);
      }
      return res.status(400).json({ success: false, error: "Invalid payment signature" });
    }

    // Check if this is a pure legacy ticket (no intent)
    const resolvedIntentId = intentId || (await findIntentByTicket(legacyTicketId));

    if (!resolvedIntentId && legacyTicketId) {
      // Pure legacy ticket — update directly (no intent involved)
      const result = await pool.query(
        `UPDATE tickets
         SET payment_status = 'PAID', payment_id = $2, payment_order_id = $3, status = 'CONFIRMED'
         WHERE ticket_id = $1
         RETURNING *`,
        [legacyTicketId, razorpay_payment_id, razorpay_order_id]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      const ticket = result.rows[0];

      // Record in payments ledger
      try {
        await pool.query(
          `INSERT INTO payments (ticket_id, razorpay_payment_id, razorpay_order_id, amount, status)
           VALUES ($1, $2, $3, $4, 'SUCCESS')
           ON CONFLICT DO NOTHING`,
          [legacyTicketId, razorpay_payment_id, razorpay_order_id, ticket.price]
        );
      } catch { /* ignore */ }

      // Send booking email
      try {
        const detailsRes = await pool.query(
          `SELECT t.ticket_id, t.user_email, t.train_id, t.travel_date, t.seat_no, t.price, t.pnr,
                  tr.train_name, tr.source, tr.destination
           FROM tickets t JOIN trains tr ON tr.train_id = t.train_id
           WHERE t.ticket_id = $1`,
          [legacyTicketId]
        );
        if (detailsRes.rowCount > 0) {
          sendBookingEmail({ to: detailsRes.rows[0].user_email, details: detailsRes.rows[0] })
            .catch((e) => console.warn("[Email] Booking email failed (verify-legacy):", e?.message));
        }
      } catch (e) {
        console.warn("[Email] Booking email failed (verify-legacy):", e?.message);
      }

      return res.json({ success: true, ticket });
    }

    if (!resolvedIntentId) {
      return res.status(400).json({ error: "No booking intent found" });
    }

    // Atomically create ticket from intent
    const ticket = await createTicketFromIntent(resolvedIntentId, razorpay_payment_id, razorpay_order_id);

    // Send booking email (non-blocking)
    try {
      const detailsRes = await pool.query(
        `SELECT t.ticket_id, t.user_email, t.train_id, t.travel_date, t.seat_no, t.price, t.pnr,
                tr.train_name, tr.source, tr.destination
         FROM tickets t JOIN trains tr ON tr.train_id = t.train_id
         WHERE t.ticket_id = $1`,
        [ticket.ticket_id]
      );
      if (detailsRes.rowCount > 0) {
        sendBookingEmail({ to: detailsRes.rows[0].user_email, details: detailsRes.rows[0] })
          .catch((e) => console.warn("[Email] Booking email failed (verify):", e?.message));
      }
    } catch (e) {
      console.warn("[Email] Booking email failed (verify):", e?.message);
    }

    return res.json({ success: true, ticket });
  } catch (error) {
    console.error("Payment verification error:", error);
    return res.status(500).json({ success: false, error: "Payment verification failed" });
  }
});

// Helper: find intent by legacy ticket ID
async function findIntentByTicket(ticketId) {
  if (!ticketId) return null;
  const res = await pool.query(
    "SELECT id FROM booking_intents WHERE ticket_id = $1 LIMIT 1",
    [ticketId]
  );
  return res.rowCount > 0 ? res.rows[0].id : null;
}

// Mark booking intent as FAILED (called when Razorpay popup is dismissed or payment fails)
router.post("/failure", async (req, res) => {
  const { intentId, ticketId: legacyTicketId } = req.body || {};

  if (!intentId && !legacyTicketId) {
    return res.status(400).json({ error: "intentId is required" });
  }

  try {
    if (intentId) {
      const result = await pool.query(
        `UPDATE booking_intents
         SET status = 'FAILED', updated_at = NOW()
         WHERE id = $1
           AND status = 'PAYMENT_PENDING'
         RETURNING *`,
        [intentId]
      );

      if (result.rowCount === 0) {
        return res.json({ success: true, message: "No update needed" });
      }

      return res.json({ success: true, intent: result.rows[0] });
    }

    // Legacy: update ticket directly
    if (legacyTicketId) {
      const result = await pool.query(
        `UPDATE tickets
         SET payment_status = 'FAILED', status = 'PAYMENT_FAILED'
         WHERE ticket_id = $1 AND COALESCE(payment_status, 'PENDING') NOT IN ('PAID')
         RETURNING *`,
        [legacyTicketId]
      );
      return res.json({ success: true, ticket: result.rows[0] || null });
    }

    return res.json({ success: true, message: "No update needed" });
  } catch (error) {
    console.error("Payment failure recording error:", error);
    return res.status(500).json({ error: "Failed to record payment failure" });
  }
});

module.exports = router;
