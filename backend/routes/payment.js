const express = require("express");
const crypto = require("crypto");
const Razorpay = require("razorpay");
const pool = require("../db");
const { sendBookingEmail } = require("../utils/emailService");
const { checkBookingEligibility } = require("../utils/bookingEligibility");

const router = express.Router();

/**
 * Validate booking eligibility for a ticket before allowing payment
 * Returns { ok: true } or { ok: false, status, error }
 */
async function validateTicketForPayment(ticketId) {
  // Fetch ticket with train schedule
  const result = await pool.query(
    `SELECT t.ticket_id, t.travel_date, t.status,
            tr.scheduled_departure
     FROM tickets t
     JOIN trains tr ON tr.train_id = t.train_id
     WHERE t.ticket_id = $1`,
    [ticketId]
  );

  if (result.rowCount === 0) {
    return { ok: false, status: 404, error: "Ticket not found" };
  }

  const ticket = result.rows[0];

  // Check if ticket is cancelled
  if ((ticket.status || "").toUpperCase() === "CANCELLED") {
    return { ok: false, status: 400, error: "Ticket is cancelled" };
  }

  // Check booking eligibility (train must not have departed)
  const eligibility = checkBookingEligibility({
    travelDate: ticket.travel_date,
    scheduledDeparture: ticket.scheduled_departure || "00:00:00",
    now: new Date()
  });

  if (!eligibility.allowed) {
    return { 
      ok: false, 
      status: 400, 
      error: `Payment not allowed: ${eligibility.reason}`,
      code: "BOOKING_CLOSED"
    };
  }

  return { ok: true, ticket };
}

async function requireRecentVerifiedOtpForTicket(ticketId) {
  // OTP is tied to (email, ticket_id). We use ticket.user_email as the source of truth.
  // If the email_otps table isn't present (migrations not applied), we skip enforcement
  // to avoid breaking existing flows.
  const ticketRes = await pool.query(
    "SELECT ticket_id, user_email FROM tickets WHERE ticket_id = $1",
    [ticketId]
  );
  if (ticketRes.rowCount === 0) {
    return { ok: false, status: 404, error: "Ticket not found" };
  }

  const email = ticketRes.rows[0].user_email;
  if (!email) {
    return { ok: false, status: 400, error: "Ticket email missing" };
  }

  try {
    const otpRes = await pool.query(
      `SELECT id
       FROM email_otps
       WHERE email = $1
         AND ticket_id = $2
         AND verified = true
         AND created_at > NOW() - INTERVAL '10 minutes'
       ORDER BY id DESC
       LIMIT 1`,
      [email, ticketId]
    );

    if (otpRes.rowCount === 0) {
      return { ok: false, status: 403, error: "OTP verification required" };
    }

    return { ok: true };
  } catch (e) {
    // 42P01 = undefined_table
    if (e?.code === "42P01") {
      console.warn("[OTP] email_otps table missing; skipping OTP enforcement");
      return { ok: true, skipped: true };
    }
    throw e;
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
// Enabled by default unless ALLOW_SIMULATED_PAYMENTS is explicitly set to 'false'.
router.post("/simulate", async (req, res) => {
  const { ticketId, paymentId } = req.body || {};

  if (!ticketId) {
    return res.status(400).json({ error: "ticketId is required" });
  }

  const allow = String(process.env.ALLOW_SIMULATED_PAYMENTS || "true").toLowerCase() !== "false";
  if (!allow) {
    return res.status(403).json({ error: "Simulated payments are disabled on server" });
  }

  try {
    // 🔒 Validate booking eligibility before allowing payment
    const validation = await validateTicketForPayment(ticketId);
    if (!validation.ok) {
      return res.status(validation.status).json({ 
        error: validation.error,
        code: validation.code 
      });
    }

    const ticketResult = await pool.query(
      "SELECT ticket_id, status, payment_status FROM tickets WHERE ticket_id = $1",
      [ticketId]
    );

    if (ticketResult.rowCount === 0) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    const ticket = ticketResult.rows[0];
    const status = String(ticket.status || "CONFIRMED").toUpperCase();
    if (status === "CANCELLED") {
      return res.status(400).json({ error: "Ticket is cancelled" });
    }

    const generatedPaymentId = paymentId || `SIMULATED_PAY_${Date.now()}`;

    const updateResult = await pool.query(
      `UPDATE tickets
       SET payment_status = 'PAID',
           payment_id = $2,
           payment_order_id = COALESCE(payment_order_id, 'SIMULATED_ORDER'),
           status = 'CONFIRMED'
       WHERE ticket_id = $1
       RETURNING *`,
      [ticketId, generatedPaymentId]
    );

    // Send booking email after successful DB update (non-blocking).
    try {
      const detailsRes = await pool.query(
        `SELECT t.ticket_id, t.user_email, t.train_id, t.travel_date, t.seat_no, t.price, t.pnr,
                tr.train_name, tr.source, tr.destination
         FROM tickets t
         JOIN trains tr ON tr.train_id = t.train_id
         WHERE t.ticket_id = $1`,
        [ticketId]
      );

      if (detailsRes.rowCount > 0) {
        sendBookingEmail({
          to: detailsRes.rows[0].user_email,
          details: detailsRes.rows[0],
        }).catch((e) => {
          console.warn("[Email] Booking email failed (simulate):", e?.message || e);
        });
      }
    } catch (e) {
      console.warn("[Email] Booking email failed (simulate):", e?.message || e);
    }

    return res.json({ success: true, simulated: true, ticket: updateResult.rows[0] });
  } catch (error) {
    console.error("Simulated payment error:", error);
    return res.status(500).json({ success: false, error: "Simulated payment failed" });
  }
});

// Create Razorpay order for a given ticket.
// Uses ticket.price from DB to prevent client-side tampering.
router.post("/create-order", async (req, res) => {
  const { ticketId } = req.body || {};

  if (!ticketId) {
    return res.status(400).json({ error: "ticketId is required" });
  }

  const razorpay = getRazorpayClient();
  if (!razorpay) {
    return res.status(500).json({
      error: "Razorpay is not configured on server",
      hint: "Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in backend .env",
    });
  }

  try {
    // 🔒 Validate booking eligibility before creating payment order
    const validation = await validateTicketForPayment(ticketId);
    if (!validation.ok) {
      return res.status(validation.status).json({ 
        error: validation.error,
        code: validation.code 
      });
    }

    const ticketResult = await pool.query(
      "SELECT ticket_id, user_email, price, status, payment_status FROM tickets WHERE ticket_id = $1",
      [ticketId]
    );

    if (ticketResult.rowCount === 0) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    const ticket = ticketResult.rows[0];

    // OTP-before-payment was removed from the UI (IRCTC-like flow).
    // Keep the capability behind an env flag for future/demo use.
    if (shouldRequirePaymentOtp()) {
      const otpGate = await requireRecentVerifiedOtpForTicket(ticket.ticket_id);
      if (!otpGate.ok) {
        return res.status(otpGate.status).json({ error: otpGate.error });
      }
    }

    // Note: Cancelled check already done in validateTicketForPayment()

    const amountPaise = Math.max(1, Math.round(Number(ticket.price) * 100));

    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt: `ticket_${ticket.ticket_id}`,
    });

    await pool.query(
      `UPDATE tickets
       SET payment_order_id = $2,
           payment_status = COALESCE(payment_status, 'PENDING')
       WHERE ticket_id = $1`,
      [ticket.ticket_id, order.id]
    );

    return res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      receipt: order.receipt,
    });
  } catch (error) {
    console.error("Error creating Razorpay order:", error);
    const statusCode = Number(error?.statusCode) || 500;
    const description = error?.error?.description;
    const code = error?.error?.code;
    const message = description || code;
    return res.status(statusCode).json({
      error: message ? `Razorpay error: ${message}` : "Failed to create payment order",
    });
  }
});

// Verify payment signature and confirm ticket.
router.post("/verify", async (req, res) => {
  const {
    ticketId,
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
  } = req.body || {};

  if (!ticketId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) {
    return res.status(500).json({ error: "Razorpay secret not configured" });
  }

  try {
    const ticketResult = await pool.query(
      "SELECT ticket_id, user_email, status, payment_status, payment_order_id FROM tickets WHERE ticket_id = $1",
      [ticketId]
    );

    if (ticketResult.rowCount === 0) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    const ticket = ticketResult.rows[0];

    // OTP-before-payment was removed from the UI (IRCTC-like flow).
    // Keep the capability behind an env flag for future/demo use.
    if (shouldRequirePaymentOtp()) {
      const otpGate = await requireRecentVerifiedOtpForTicket(ticket.ticket_id);
      if (!otpGate.ok) {
        return res.status(otpGate.status).json({ error: otpGate.error });
      }
    }

    const status = String(ticket.status || "CONFIRMED").toUpperCase();
    if (status === "CANCELLED") {
      return res.status(400).json({ error: "Ticket is cancelled" });
    }

    if (ticket.payment_order_id && ticket.payment_order_id !== razorpay_order_id) {
      return res.status(400).json({ error: "Order id does not match ticket" });
    }

    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      await pool.query(
        `UPDATE tickets
         SET payment_status = 'FAILED'
         WHERE ticket_id = $1 AND COALESCE(payment_status, 'PENDING') <> 'PAID'`,
        [ticketId]
      );
      return res.status(400).json({ success: false, error: "Invalid payment signature" });
    }

    const updateResult = await pool.query(
      `UPDATE tickets
       SET payment_status = 'PAID',
           payment_id = $2,
           payment_order_id = $3,
           status = 'CONFIRMED'
       WHERE ticket_id = $1
       RETURNING *`,
      [ticketId, razorpay_payment_id, razorpay_order_id]
    );

    // Send booking email after successful DB update (non-blocking).
    try {
      const detailsRes = await pool.query(
        `SELECT t.ticket_id, t.user_email, t.train_id, t.travel_date, t.seat_no, t.price, t.pnr,
                tr.train_name, tr.source, tr.destination
         FROM tickets t
         JOIN trains tr ON tr.train_id = t.train_id
         WHERE t.ticket_id = $1`,
        [ticketId]
      );

      if (detailsRes.rowCount > 0) {
        sendBookingEmail({
          to: detailsRes.rows[0].user_email,
          details: detailsRes.rows[0],
        }).catch((e) => {
          console.warn("[Email] Booking email failed (verify):", e?.message || e);
        });
      }
    } catch (e) {
      console.warn("[Email] Booking email failed (verify):", e?.message || e);
    }

    return res.json({ success: true, ticket: updateResult.rows[0] });
  } catch (error) {
    console.error("Payment verification error:", error);
    return res.status(500).json({ success: false, error: "Payment verification failed" });
  }
});

module.exports = router;
