const express = require("express");
const crypto = require("crypto");
const Razorpay = require("razorpay");
const pool = require("../db");
const { sendBookingEmail } = require("../utils/emailService");

const router = express.Router();

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
    const ticketResult = await pool.query(
      "SELECT ticket_id, price, status, payment_status FROM tickets WHERE ticket_id = $1",
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
      "SELECT ticket_id, status, payment_status, payment_order_id FROM tickets WHERE ticket_id = $1",
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
