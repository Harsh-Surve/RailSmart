const nodemailer = require("nodemailer");

let cachedTransporter = null;

function isEmailEnabled() {
  return Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASS);
}

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;

  cachedTransporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS, // Gmail App Password
    },
  });

  return cachedTransporter;
}

async function sendEmail({ to, subject, html }) {
  if (!to) {
    return { skipped: true, reason: "Missing recipient" };
  }

  if (!isEmailEnabled()) {
    console.warn("[Email] Skipped (EMAIL_USER/EMAIL_PASS not set)");
    return { skipped: true, reason: "Email not configured" };
  }

  const fromName = process.env.EMAIL_FROM_NAME || "RailSmart - No Reply";
  const from = `"${fromName}" <${process.env.EMAIL_USER}>`;

  const info = await getTransporter().sendMail({
    from,
    to,
    subject,
    html,
  });

  return { skipped: false, messageId: info.messageId };
}

function formatTravelDate(d) {
  try {
    return new Date(d).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return String(d || "");
  }
}

function bookingHtml(details) {
  const train = details.train_name || `Train #${details.train_id}`;
  const route = `${details.source || ""} → ${details.destination || ""}`.trim();
  const travelDate = formatTravelDate(details.travel_date);
  const seat = details.seat_no || "(not assigned)";
  const pnr = details.pnr || "(pending)";
  const price = details.price != null ? `₹${Number(details.price).toFixed(2)}` : "";

  return `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;line-height:1.4">
      <h2 style="margin:0 0 8px">Ticket Confirmed ✅</h2>
      <p style="margin:0 0 14px;color:#374151">Thanks for booking with <b>RailSmart</b>.</p>
      <table cellpadding="6" cellspacing="0" style="border-collapse:collapse">
        <tr><td><b>Ticket ID</b></td><td>${details.ticket_id}</td></tr>
        <tr><td><b>PNR</b></td><td>${pnr}</td></tr>
        <tr><td><b>Train</b></td><td>${train}</td></tr>
        <tr><td><b>Route</b></td><td>${route}</td></tr>
        <tr><td><b>Travel Date</b></td><td>${travelDate}</td></tr>
        <tr><td><b>Seat</b></td><td>${seat}</td></tr>
        ${price ? `<tr><td><b>Fare</b></td><td>${price}</td></tr>` : ""}
        <tr><td><b>Status</b></td><td>CONFIRMED</td></tr>
      </table>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0" />
      <p style="margin:0;color:#6b7280">Safe journey 🚆</p>
    </div>
  `;
}

function cancellationHtml(details) {
  const train = details.train_name || `Train #${details.train_id}`;
  const route = `${details.source || ""} → ${details.destination || ""}`.trim();
  const travelDate = formatTravelDate(details.travel_date);
  const seat = details.seat_no || "(not assigned)";
  const pnr = details.pnr || "";

  return `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;line-height:1.4">
      <h2 style="margin:0 0 8px">Ticket Cancelled ❌</h2>
      <p style="margin:0 0 14px;color:#374151">Your RailSmart ticket has been cancelled.</p>
      <table cellpadding="6" cellspacing="0" style="border-collapse:collapse">
        <tr><td><b>Ticket ID</b></td><td>${details.ticket_id}</td></tr>
        ${pnr ? `<tr><td><b>PNR</b></td><td>${pnr}</td></tr>` : ""}
        <tr><td><b>Train</b></td><td>${train}</td></tr>
        <tr><td><b>Route</b></td><td>${route}</td></tr>
        <tr><td><b>Travel Date</b></td><td>${travelDate}</td></tr>
        <tr><td><b>Seat</b></td><td>${seat}</td></tr>
        <tr><td><b>Status</b></td><td>CANCELLED</td></tr>
      </table>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0" />
      <p style="margin:0;color:#6b7280">We hope to serve you again 🚆</p>
    </div>
  `;
}

async function sendBookingEmail({ to, details }) {
  return sendEmail({
    to,
    subject: "🎟 RailSmart Ticket Confirmed",
    html: bookingHtml(details),
  });
}

async function sendCancellationEmail({ to, details }) {
  return sendEmail({
    to,
    subject: "❌ RailSmart Ticket Cancelled",
    html: cancellationHtml(details),
  });
}

module.exports = {
  isEmailEnabled,
  sendEmail,
  sendBookingEmail,
  sendCancellationEmail,
};
