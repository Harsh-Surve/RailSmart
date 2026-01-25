const express = require("express");
const pool = require("../db");
const { generateOTP } = require("../utils/otp");
const { sendEmail, isEmailEnabled } = require("../utils/emailService");

const router = express.Router();

function otpHtml({ otp, minutes, ticketId }) {
  return `
    <div style="font-family: Arial, sans-serif; background:#f4f6f8; padding:20px;">
      <div style="max-width:520px; margin:auto; background:#ffffff; border-radius:8px; overflow:hidden;">

        <div style="background:#0f4c81; color:white; padding:16px 20px;">
          <h2 style="margin:0;">🚆 RailSmart</h2>
          <p style="margin:4px 0 0; font-size:14px;">
            Intelligent Railway Booking & Tracking
          </p>
        </div>

        <div style="padding:20px; color:#333;">
          <p>Hello,</p>

          <p>
            Your One-Time Password (OTP) for <strong>RailSmart verification</strong> is:
          </p>

          <div style="
            margin:20px 0;
            padding:15px;
            text-align:center;
            font-size:26px;
            font-weight:bold;
            letter-spacing:6px;
            background:#f0f4ff;
            border:1px dashed #0f4c81;
            border-radius:6px;
            color:#0f4c81;
          ">
            ${otp}
          </div>

          <p>
            ⏱️ This OTP is valid for <strong>${minutes} minutes</strong>.
          </p>

          <p style="font-size:14px; color:#555;">
            If you did not request this OTP, please ignore this email.
          </p>

          <p style="margin-top:20px;">
            Regards,<br/>
            <strong>RailSmart Team</strong>
          </p>

          <p style="margin:18px 0 0; font-size:12px; color:#6b7280;">
            Ticket reference: <strong>#${ticketId}</strong>
          </p>
        </div>

        <div style="background:#f4f6f8; padding:12px; text-align:center; font-size:12px; color:#777;">
          This is an automated message. Please do not reply.
        </div>

      </div>
    </div>
  `;
}

router.post("/send", async (req, res) => {
  const { email, ticketId } = req.body || {};

  if (!email || !ticketId) {
    return res.status(400).json({ success: false, error: "email and ticketId are required" });
  }

  if (!isEmailEnabled()) {
    return res.status(500).json({
      success: false,
      error: "Email is not configured on server",
      hint: "Set EMAIL_USER and EMAIL_PASS in backend/.env and restart backend",
    });
  }

  try {
    // Validate ticket exists and belongs to email
    const tRes = await pool.query(
      "SELECT ticket_id, user_email, status, payment_status FROM tickets WHERE ticket_id = $1",
      [ticketId]
    );

    if (tRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: "Ticket not found" });
    }

    const ticket = tRes.rows[0];
    if (String(ticket.user_email || "").toLowerCase() !== String(email).toLowerCase()) {
      return res.status(403).json({ success: false, error: "Ticket does not belong to this email" });
    }

    const status = String(ticket.status || "").toUpperCase();
    if (status === "CANCELLED") {
      return res.status(400).json({ success: false, error: "Ticket is cancelled" });
    }

    const pay = String(ticket.payment_status || "").toUpperCase();
    if (pay === "PAID") {
      return res.status(400).json({ success: false, error: "Ticket is already paid" });
    }

    // Rate-limit OTP sends: max 3 OTPs per email in last 10 minutes
    const limitRes = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM email_otps
       WHERE email = $1
         AND created_at > NOW() - INTERVAL '10 minutes'`,
      [email]
    );

    if ((limitRes.rows?.[0]?.count ?? 0) >= 3) {
      return res.status(429).json({
        success: false,
        error: "Too many OTP requests. Please try again later.",
      });
    }

    // Soft rate-limit: block if an unexpired OTP was sent in the last 30 seconds
    const recentRes = await pool.query(
      `SELECT id, created_at
       FROM email_otps
       WHERE email = $1 AND ticket_id = $2
       ORDER BY id DESC
       LIMIT 1`,
      [email, ticketId]
    );

    if (recentRes.rowCount > 0) {
      const createdAt = new Date(recentRes.rows[0].created_at);
      if (Date.now() - createdAt.getTime() < 30_000) {
        return res.status(429).json({ success: false, error: "Please wait before requesting another OTP" });
      }
    }

    // Cleanup expired rows (optional housekeeping)
    await pool.query("DELETE FROM email_otps WHERE expires_at < NOW() - INTERVAL '1 day'");

    const otp = generateOTP();
    const minutes = 5;
    const expiresAt = new Date(Date.now() + minutes * 60_000);

    await pool.query(
      "INSERT INTO email_otps (email, ticket_id, otp, expires_at) VALUES ($1, $2, $3, $4)",
      [email, ticketId, otp, expiresAt]
    );

    await sendEmail({
      to: email,
      subject: "RailSmart OTP Verification",
      html: otpHtml({ otp, minutes, ticketId }),
    });

    return res.json({ success: true, expiresInSeconds: minutes * 60 });
  } catch (e) {
    console.error("OTP send error:", e?.stack || e);

    // Friendly, academic-safe hints for common failure modes
    const pgCode = e?.code;
    if (pgCode === "42P01") {
      return res.status(500).json({
        success: false,
        error: "OTP table is missing in database",
        hint: "Run backend/migrations/2026_add_email_otps.sql (and 2026_add_email_otps_attempts.sql if present) on your Postgres DB",
      });
    }

    if (pgCode === "42703") {
      return res.status(500).json({
        success: false,
        error: "OTP schema mismatch in database",
        hint: "Apply latest OTP migrations (created_at/attempts columns) and restart backend",
      });
    }

    const msg = String(e?.message || "");
    if (e?.code === "EAUTH" || /invalid login|authentication failed|bad credentials/i.test(msg)) {
      return res.status(500).json({
        success: false,
        error: "Email authentication failed",
        hint: "Use a Gmail App Password for EMAIL_PASS (not your normal Gmail password) and ensure EMAIL_USER/EMAIL_PASS are set in backend/.env",
      });
    }

    return res.status(500).json({
      success: false,
      error: "Failed to send OTP",
      ...(process.env.NODE_ENV !== "production" ? { detail: msg } : {}),
    });
  }
});

router.post("/verify", async (req, res) => {
  const { email, ticketId, otp } = req.body || {};

  if (!email || !ticketId || !otp) {
    return res.status(400).json({ success: false, error: "email, ticketId and otp are required" });
  }

  const otpStr = String(otp).trim();
  if (!/^\d{6}$/.test(otpStr)) {
    return res.status(400).json({ success: false, error: "OTP must be a 6-digit number" });
  }

  try {
    // Find the latest active OTP for this email + ticket
    const activeRes = await pool.query(
      `SELECT id, otp, attempts
       FROM email_otps
       WHERE email = $1
         AND ticket_id = $2
         AND verified = false
         AND expires_at > NOW()
       ORDER BY id DESC
       LIMIT 1`,
      [email, ticketId]
    );

    if (activeRes.rowCount === 0) {
      return res.status(400).json({ success: false, error: "Invalid or expired OTP" });
    }

    const row = activeRes.rows[0];
    const attempts = Number(row.attempts || 0);
    if (attempts >= 5) {
      return res.status(429).json({
        success: false,
        error: "Too many failed attempts. OTP locked. Please request a new OTP.",
      });
    }

    if (String(row.otp) !== otpStr) {
      const bumpRes = await pool.query(
        "UPDATE email_otps SET attempts = attempts + 1 WHERE id = $1 RETURNING attempts",
        [row.id]
      );
      const newAttempts = Number(bumpRes.rows?.[0]?.attempts || attempts + 1);
      if (newAttempts >= 5) {
        return res.status(429).json({
          success: false,
          error: "Too many failed attempts. OTP locked. Please request a new OTP.",
        });
      }
      return res.status(400).json({ success: false, error: "Invalid OTP" });
    }

    await pool.query("UPDATE email_otps SET verified = true WHERE id = $1", [row.id]);

    return res.json({ success: true });
  } catch (e) {
    console.error("OTP verify error:", e?.stack || e);

    const pgCode = e?.code;
    if (pgCode === "42P01") {
      return res.status(500).json({
        success: false,
        error: "OTP table is missing in database",
        hint: "Run backend/migrations/2026_add_email_otps.sql (and 2026_add_email_otps_attempts.sql) on your Postgres DB",
      });
    }

    if (pgCode === "42703") {
      return res.status(500).json({
        success: false,
        error: "OTP schema mismatch in database",
        hint: "Apply latest OTP migrations (attempts column) and restart backend",
      });
    }

    const msg = String(e?.message || "");
    return res.status(500).json({
      success: false,
      error: "Failed to verify OTP",
      ...(process.env.NODE_ENV !== "production" ? { detail: msg } : {}),
    });
  }
});

module.exports = router;
