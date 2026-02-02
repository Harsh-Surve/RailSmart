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

// Book a ticket
router.post("/book-ticket", async (req, res) => {
  const { email, trainId, travelDate, seatNo, price } = req.body;

  if (!email || !trainId || !travelDate || !seatNo || price == null) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    // Fetch train's scheduled departure time for booking eligibility check
    const trainResult = await pool.query(
      "SELECT scheduled_departure FROM trains WHERE id = $1",
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

    // If this user already has a ticket for the same train/date/seat (e.g., payment retry),
    // return it instead of failing with "Seat already booked".
    const existingForUser = await pool.query(
      `SELECT *
       FROM tickets
       WHERE user_email = $1
         AND train_id = $2
         AND travel_date = $3
         AND seat_no = $4
         AND COALESCE(status, 'CONFIRMED') <> 'CANCELLED'
       ORDER BY booking_date DESC
       LIMIT 1`,
      [email, trainId, travelDate, seatNo]
    );

    if (existingForUser.rows.length > 0) {
      return res.json({
        message: "Ticket already exists for this seat. Continuing with existing ticket.",
        ticket: existingForUser.rows[0],
      });
    }

    // Check if seat is already booked
    const checkSeat = await pool.query(
      "SELECT 1 FROM tickets WHERE train_id = $1 AND travel_date = $2 AND seat_no = $3 AND COALESCE(status, 'CONFIRMED') <> 'CANCELLED'",
      [trainId, travelDate, seatNo]
    );

    if (checkSeat.rows.length > 0) {
      return res.status(409).json({ error: "Seat already booked" });
    }

    // Generate PNR
    const pnr = generatePNR(trainId, travelDate);

    // Insert ticket with PNR
    const result = await pool.query(
      "INSERT INTO tickets (user_email, train_id, travel_date, seat_no, price, pnr, booking_date, status, payment_status) VALUES ($1, $2, $3, $4, $5, $6, NOW(), 'PAYMENT_PENDING', 'PENDING') RETURNING *",
      [email, trainId, travelDate, seatNo, price, pnr]
    );

    res.json({ message: "Ticket booked successfully", ticket: result.rows[0] });
  } catch (error) {
    // Common PG error codes:
    // - 23505: unique_violation (race condition seat conflicts if a unique constraint exists)
    // - 42703: undefined_column (migrations not applied)
    // - 23502: not_null_violation (missing required column value)
    // - 22P02: invalid_text_representation (bad types)
    if (error?.code === "23505") {
      return res.status(409).json({ error: "Seat already booked" });
    }

    const detail = error?.message || "Unknown error";
    console.error("Error booking ticket:", {
      code: error?.code,
      message: error?.message,
      detail: error?.detail,
      constraint: error?.constraint,
    });

    // Return detail so frontend/devtools shows the *real* cause (e.g., missing columns).
    return res.status(500).json({
      error: "Failed to book ticket",
      detail,
      code: error?.code || null,
    });
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
              tr.scheduled_arrival
       FROM tickets t
       JOIN trains tr ON t.train_id = tr.train_id
       WHERE t.user_email = $1
       ORDER BY t.booking_date DESC`,
      [email]
    );

    res.json(result.rows);
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
              tr.scheduled_arrival
       FROM tickets t
       JOIN trains tr ON t.train_id = tr.train_id
       WHERE t.user_email = $1
       ORDER BY t.booking_date DESC`,
      [userId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching tickets:", error);
    res.status(500).json({ error: "Failed to fetch tickets" });
  }
});

// Delete/cancel a ticket
router.delete("/tickets/:ticketId", async (req, res) => {
  const { ticketId } = req.params;

  try {
    const result = await pool.query(
      "DELETE FROM tickets WHERE ticket_id = $1 RETURNING *",
      [ticketId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Ticket not found" });
    }

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

    return res.json({ message: "Ticket cancelled successfully", ticket: result.rows[0] });
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

    res.json({ message: "Ticket cancelled successfully", ticket: result.rows[0] });
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
