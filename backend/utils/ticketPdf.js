// utils/ticketPdf.js
const PDFDocument = require("pdfkit");
const qrcode = require("qrcode");
const bwipjs = require("bwip-js");
const moment = require("moment");
const fs = require("fs");
const path = require("path");

const resolveFirstExistingPath = (candidates) => {
  for (const p of candidates) {
    if (!p) continue;
    try {
      if (fs.existsSync(p)) return p;
    } catch (e) {
      // ignore
    }
  }
  return null;
};

// Use the same logo as the frontend login page.
const LOGO_PATH = resolveFirstExistingPath([
  path.resolve(__dirname, "..", "..", "frontend", "public", "logo", "logo.png"),
  path.resolve(process.cwd(), "frontend", "public", "logo", "logo.png"),
  path.resolve(process.cwd(), "public", "logo.png"),
]);

/**
 * Final all-in-one ticket PDF utilities:
 * - generateTicketPdf(ticket, stream)     => A4 IRCTC-hybrid ticket (polished)
 * - generateTicketPdfA5(ticket, stream)   => Compact A5 receipt-style ticket
 *
 * Features included:
 * - stronger watermark (opacity 0.13)
 * - fare box moved 8px left
 * - seal moved up for denser footer
 * - stamp PNG support (public/stamp.png), fallback to drawn ✓
 * - tighter spacing and reduced white gap
 * - passenger table support (ticket.passengers = [{name,age,gender,seat}])
 *
 * Required: npm install pdfkit qrcode bwip-js moment
 */

// ---------- Shared helpers ----------
const safeGet = (ticket, keys, fallback = "") => {
  if (!Array.isArray(keys)) keys = [keys];
  for (const k of keys) {
    if (typeof k === "string") {
      if (ticket[k] != null && ticket[k] !== "") return ticket[k];
    } else if (typeof k === "function") {
      try {
        const v = k();
        if (v != null && v !== "") return v;
      } catch (e) { /* ignore */ }
    }
  }
  return fallback;
};

const fmtDate = (v) => {
  if (!v) return "-";
  const m = moment(v);
  return m.isValid() ? m.format("DD/MM/YYYY") : String(v);
};
const fmtDateTime = (v) => {
  if (!v) return "-";
  const m = moment(v);
  return m.isValid() ? m.format("DD/MM/YYYY, HH:mm:ss") : String(v);
};
const fmtTime = (v) => {
  if (!v) return "-";
  const fmts = ["HH:mm:ss", "HH:mm", "hh:mm A", moment.ISO_8601];
  for (const f of fmts) {
    const m = moment(v, f, true);
    if (m.isValid()) return m.format("HH:mm");
  }
  const m2 = moment(v);
  return m2.isValid() ? m2.format("HH:mm") : String(v);
};

async function generateTicketPdf(ticket = {}, stream = null) {
  const doc = new PDFDocument({ size: "A4", margin: 40, autoFirstPage: false });

  if (stream) doc.pipe(stream);
  doc.addPage();

  const W = doc.page.width;
  const H = doc.page.height;

  try {
    // ---------- Header ----------
    const headerH = 84;
    doc.rect(0, 0, W, headerH).fill("#0f3b5f");
    try { if (LOGO_PATH) doc.image(LOGO_PATH, 46, 18, { width: 56 }); } catch (e) { /* ignore */ }
    doc.fill("#ffffff").font("Helvetica-Bold").fontSize(26).text("RailSmart E-Ticket", 120, 26);
    doc.font("Helvetica").fontSize(10).fill("#ffffff").text("Intelligent Railway Ticket Booking System", 120, 54);

    // ---------- Card (tighter to reduce whitespace) ----------
    const cardX = 48;
    const cardY = headerH + 18;
    const cardW = W - cardX * 2;
    const cardH = 190; // tightened
    doc.roundedRect(cardX, cardY, cardW, cardH, 8).fill("#ffffff").stroke("#e6edf6");

    // ---------- Info box ----------
    const infoX = cardX + 12;
    const infoY = cardY + 12;
    const infoW = cardW - 24;
    const infoH = 92;
    doc.roundedRect(infoX, infoY, infoW, infoH, 6).fill("#fbfdff").stroke("#eef4fb");

    // Ticket left text
    const leftX = infoX + 10;
    let y = infoY + 8;
    const ticketId = safeGet(ticket, ["ticket_id", "id"], "RS-000");
    doc.fill("#1f2937").font("Helvetica-Bold").fontSize(12).text(`Ticket ID: ${ticketId}`, leftX, y);

    const passenger = safeGet(ticket, ["passenger_name", "passengerName", "user_email", "passengerEmail"], "");
    doc.font("Helvetica").fontSize(9).fill("#374151").text(passenger, leftX, y + 18);

    const booked = safeGet(ticket, ["booking_date", "bookedOn", () => ticket.rawBookingDate], null);
    const bookedText = booked ? fmtDateTime(booked) : "-";
    doc.font("Helvetica").fontSize(9).fill("#667085").text(`Booked On: ${bookedText}`, leftX, y + 36);

    // ---------- PNR stacked (Layout C) ----------
    const pnrValue = safeGet(ticket, [
      "pnr",
      () => ticket?.rawResponse?.[0]?.pnr,
      () => ticket?.response?.pnr,
      "pnr_no",
      "pnrNumber",
      "pnrno"
    ], null);

    const pnrBoxW = 84;
    const pnrBoxH = 62;
    const pnrBoxX = infoX + infoW - pnrBoxW - 12;
    const pnrBoxY = infoY + 8;
    doc.roundedRect(pnrBoxX, pnrBoxY, pnrBoxW, pnrBoxH, 6).fill("#ffffff").stroke("#e6eaf2");
    doc.font("Helvetica-Bold").fontSize(9).fill("#0f3b5f")
       .text("PNR", pnrBoxX + 8, pnrBoxY + 8, { width: pnrBoxW - 16, align: "center" });
    doc.font("Helvetica-Bold").fontSize(11).fill("#111827")
       .text(pnrValue ? String(pnrValue) : "N/A", pnrBoxX + 8, pnrBoxY + 28, { width: pnrBoxW - 16, align: "center" });

    // ---------- QR & Barcode (shifted left so PNR sits at top-right) ----------
    const qrSize = 110;
    const qrX = infoX + infoW - qrSize - 14 - pnrBoxW; // moved left so PNR fits right
    const qrY = infoY + 6;
    try {
      const qrData = `ticket:${ticketId};pnr:${pnrValue || ""};train:${safeGet(ticket, ["train_name","trainName"], "")};date:${safeGet(ticket, ["travel_date","travelDate"], "")}`;
      const qrDataURL = await qrcode.toDataURL(qrData, { margin: 1, width: 300 });
      const qrBuf = Buffer.from(qrDataURL.split(",")[1], "base64");
      doc.image(qrBuf, qrX, qrY, { width: qrSize, height: qrSize });
    } catch (e) {
      console.error("QR generation failed:", e);
    }

    try {
      const barcodeBuf = await bwipjs.toBuffer({
        bcid: "code128",
        text: ticketId || pnrValue || "RS-000",
        scale: 2,
        height: 40,
        includetext: false
      });
      doc.image(barcodeBuf, qrX, qrY + qrSize + 6, { width: qrSize, height: 46 });
    } catch (e) {
      console.error("Barcode generation failed:", e);
    }

    // ---------- dotted separator ----------
    const sepY = infoY + infoH + 12;
    for (let px = cardX + 14; px < cardX + cardW - 14; px += 10) doc.rect(px, sepY, 1.8, 0.9).fill("#d6dbe6");

    // ---------- Journey Details (tighter) ----------
    let detailsY = sepY + 16;
    doc.font("Helvetica-Bold").fontSize(16).fill("#0f3b5f").text("Journey Details", cardX + 12, detailsY);
    detailsY += 14;

    doc.font("Helvetica").fontSize(10).fill("#111827");
    const leftCol = cardX + 12;
    const rightCol = cardX + 320;
    let rowY = detailsY;

    doc.text(`Train: ${safeGet(ticket, ["train_name","trainName"], "-")}`, leftCol, rowY);
    doc.text(`Seat: ${safeGet(ticket, ["seat_no","seat"], "-")}`, rightCol, rowY);
    rowY += 12;

    doc.text(`PNR: ${pnrValue ? pnrValue : "-"}`, leftCol, rowY);
    rowY += 12;

    const route = safeGet(ticket, ["route"], null) || (ticket.source && ticket.destination ? `${ticket.source} -> ${ticket.destination}` : "-");
    doc.text(`Route: ${route}`, leftCol, rowY);
    rowY += 12;

    const travelDate = safeGet(ticket, ["travel_date","travelDate"], null);
    doc.text(`Travel Date: ${travelDate ? fmtDate(travelDate) : "-"}`, leftCol, rowY);
    rowY += 12;

    const departure = safeGet(ticket, ["departure_time","departure"], null);
    const arrival = safeGet(ticket, ["arrival_time","arrival"], null);
    doc.text(`Departure: ${departure ? fmtTime(departure) : "-"}`, leftCol, rowY);
    doc.text(`Arrival: ${arrival ? fmtTime(arrival) : "-"}`, rightCol, rowY);
    rowY += 14;

    // ---------- passenger table (if exists) ----------
    if (Array.isArray(ticket.passengers) && ticket.passengers.length > 0) {
      doc.font("Helvetica-Bold").fontSize(11).fill("#0f3b5f").text("Passengers", leftCol, rowY);
      rowY += 14;
      // headers
      doc.font("Helvetica-Bold").fontSize(9).fill("#374151");
      const pcolX = leftCol;
      doc.text("Name", pcolX, rowY);
      doc.text("Age", pcolX + 180, rowY);
      doc.text("Gender", pcolX + 230, rowY);
      doc.text("Seat", pcolX + 310, rowY);
      rowY += 12;
      doc.font("Helvetica").fontSize(9).fill("#111827");
      for (const p of ticket.passengers) {
        doc.text(p.name || p.fullName || "-", pcolX, rowY, { width: 160 });
        doc.text(p.age != null ? String(p.age) : "-", pcolX + 180, rowY);
        doc.text(p.gender || "-", pcolX + 230, rowY);
        doc.text(p.seat || p.seat_no || "-", pcolX + 310, rowY);
        rowY += 12;
      }
      rowY += 6;
    }

    // small IRCTC-like disclaimer under details
    doc.font("Helvetica").fontSize(9).fill("#667085")
       .text("This is a system generated ticket. No signature required.", leftCol, rowY, { width: cardW - 120 });
    rowY += 20;

    // ---------- Fare box (moved left 8px compared to previous) ----------
    const fareW = 145;
    const fareH = 38;
    const fareX = cardX + cardW - fareW - 28; // moved left by 8px
    const fareY = rowY - 6;
    doc.roundedRect(fareX, fareY, fareW, fareH, 6).fill("#f8fafc").stroke("#e6eef6");
    doc.font("Helvetica").fontSize(11).fill("#0f3b5f").text("Fare", fareX + 12, fareY + 6);
    const fareAmt = Number(safeGet(ticket, ["price","fare"], 0)) || 0;
    doc.font("Helvetica-Bold").fontSize(13).fill("#111827").text(`₹${fareAmt.toFixed(2)}`, fareX + 12, fareY + 18);

    // ---------- Watermark (darker & slightly larger) ----------
    doc.save();
    doc.rotate(-30, { origin: [W / 2, H / 2] });
    doc.font("Helvetica-Bold").fontSize(104).fillColor("#e6eef6").opacity(0.13).text("RailSmart", W / 2 - 250, H / 2 - 8);
    doc.restore();
    doc.fillColor("#000").opacity(1);

    // ---------- Footer: move seal up, tighten footer spacing ----------
    const issuedAt = fmtDateTime(new Date());
    const verificationCode = pnrValue || ticketId || "N/A";
    const printedAt = moment().format("DD/MM/YYYY, HH:mm");

    const footerLeftX = cardX + 4;
    const footerY = H - 140;
    doc.font("Helvetica").fontSize(8).fill("#6b7280").text(`Issued: ${issuedAt}`, footerLeftX, footerY);
    doc.text(`Verification code: ${verificationCode}`, footerLeftX, footerY + 12);

    doc.font("Helvetica").fontSize(8).fill("#6b7280").text(`Printed: ${printedAt}`, W / 2 - 40, H - 64);

    // ---------- Seal (moved up) ----------
    const sealW = 260;
    const sealH = 78;
    const sealX = W - sealW - 52;
    const sealY = H - 160; // moved up by 10px
    doc.roundedRect(sealX, sealY, sealW, sealH, 8).fill("#ffffff").stroke("#dbe9f2");

    const stampR = 20;
    const stampCX = sealX + 36 + stampR;
    const stampCY = sealY + 28;
    doc.lineWidth(1.2).strokeColor("#c6d6e2");
    doc.circle(stampCX, stampCY, stampR).stroke();
    doc.circle(stampCX, stampCY, stampR - 6).fill("#f3f8fb");

    // Use PNG stamp if exists, otherwise draw check
    let usedStamp = false;
    try {
      // if public/stamp.png exists, this will succeed; position centered in badge
      doc.image("public/stamp.png", stampCX - 16, stampCY - 16, { width: 32, height: 32 });
      usedStamp = true;
    } catch (e) {
      // fallback to drawn checkmark
      doc.fill("#0d874a").font("Helvetica-Bold").fontSize(14).text("✓", stampCX - doc.widthOfString("✓") / 2, stampCY - doc.currentLineHeight() / 2, { lineBreak: false });
    }

    // seal text
    const sealTextX = stampCX + stampR + 14;
    let sy = sealY + 10;
    doc.font("Helvetica-Bold").fontSize(10).fill("#1a2e43").text("Digitally verified by RailSmart System", sealTextX, sy);
    sy += 16;
    doc.font("Helvetica").fontSize(8).fill("#52606d").text("This ticket is digitally signed and valid without a physical signature.", sealTextX, sy, { width: sealW - (sealTextX - sealX) - 18 });
    sy = sealY + sealH - 18;
    doc.font("Helvetica-Bold").fontSize(9).fill("#0f3b5f").text("RailSmart System", sealTextX, sy);

    // optional signature image (keeps same behavior)
    try { doc.image("public/sign.png", sealX + 12, sealY + sealH - 40, { width: 64 }); } catch (e) { /* ignore */ }

    // contact line moved up slightly
    doc.font("Helvetica").fontSize(8).fill("#9aa4b2")
       .text("For any queries call 139 or email support@railsmart.com", cardX, H - 46, { width: W - cardX * 2, align: "center" });

    doc.end();

    if (stream) return;
    return await collectBuffer(doc);

  } catch (err) {
    try { doc.end(); } catch (e) { /* ignore */ }
    console.error("PDF generation error:", err);
    throw err;
  }
}

// ---------- Compact A5 variant ----------
async function generateTicketPdfA5(ticket = {}, stream = null) {
  // A5 in landscape-ish compact style (useful for receipts)
  const doc = new PDFDocument({ size: "A5", margin: 24, autoFirstPage: false });

  if (stream) doc.pipe(stream);
  doc.addPage();

  const W = doc.page.width;
  const H = doc.page.height;

  try {
    // header small
    const headerH = 44;
    doc.rect(0, 0, W, headerH).fill("#0f3b5f");
    try { if (LOGO_PATH) doc.image(LOGO_PATH, 12, 8, { width: 32 }); } catch (e) { /* ignore */ }
    doc.fill("#fff").font("Helvetica-Bold").fontSize(14).text("RailSmart E-Ticket", 56, 14);

    // small info area
    const leftX = 12;
    let y = headerH + 8;
    const ticketId = safeGet(ticket, ["ticket_id", "id"], "RS-000");
    doc.fill("#1f2937").font("Helvetica-Bold").fontSize(10).text(`Ticket ID: ${ticketId}`, leftX, y);
    const passenger = safeGet(ticket, ["passenger_name", "passengerName", "passengerEmail"], "");
    doc.font("Helvetica").fontSize(8).fill("#374151").text(passenger, leftX, y + 12);
    const booked = safeGet(ticket, ["booking_date","bookedOn"], null);
    doc.font("Helvetica").fontSize(8).fill("#667085").text(`Booked: ${booked ? fmtDateTime(booked) : "-"}`, leftX, y + 24);

    // QR (small)
    const qrSize = 80;
    const qrX = W - qrSize - 12;
    const qrY = headerH + 8;
    try {
      const qrData = `ticket:${ticketId};pnr:${safeGet(ticket, ["pnr"], "")};train:${safeGet(ticket, ["train_name","trainName"], "")}`;
      const qrURL = await qrcode.toDataURL(qrData, { margin: 0, width: 200 });
      const qrBuf = Buffer.from(qrURL.split(",")[1], "base64");
      doc.image(qrBuf, qrX, qrY, { width: qrSize, height: qrSize });
    } catch (e) { /* ignore */ }

    // journey compact
    let rowY = headerH + qrSize + 18;
    doc.font("Helvetica-Bold").fontSize(11).fill("#0f3b5f").text("Journey Details", leftX, headerH + qrSize + 2);
    doc.font("Helvetica").fontSize(9).fill("#111827");
    rowY = headerH + qrSize + 22;
    doc.text(`Train: ${safeGet(ticket, ["train_name","trainName"], "-")}`, leftX, rowY);
    rowY += 10;
    doc.text(`PNR: ${safeGet(ticket, ["pnr"], "-")}`, leftX, rowY);
    rowY += 10;
    doc.text(`Route: ${safeGet(ticket, ["route"], "-")}`, leftX, rowY);
    rowY += 10;
    doc.text(`Date: ${safeGet(ticket, ["travel_date","travelDate"], "-")}`, leftX, rowY);
    rowY += 10;
    doc.text(`Dep: ${fmtTime(safeGet(ticket, ["departure_time","departure"], "-"))}  Arr: ${fmtTime(safeGet(ticket, ["arrival_time","arrival"], "-"))}`, leftX, rowY);

    // fare compact
    const fareAmt = Number(safeGet(ticket, ["price","fare"], 0)) || 0;
    doc.font("Helvetica-Bold").fontSize(11).fill("#0f3b5f").text(`Fare: ₹${fareAmt.toFixed(2)}`, W - 140, rowY - 10);

    // footer small seal (drawn check or png)
    const sealX = W - 120;
    const sealY = H - 54;
    doc.roundedRect(sealX, sealY, 96, 48, 6).fill("#fff").stroke("#e6eef6");
    try {
      doc.image("public/stamp.png", sealX + 8, sealY + 6, { width: 32, height: 32 });
    } catch (e) {
      doc.font("Helvetica-Bold").fontSize(12).fill("#0d874a").text("✓", sealX + 22 - doc.widthOfString("✓") / 2, sealY + 14);
    }
    doc.font("Helvetica").fontSize(7).fill("#1a2e43").text("Digitally verified by RailSmart", sealX + 48, sealY + 10);

    // contact line small
    doc.font("Helvetica").fontSize(7).fill("#9aa4b2").text("For queries call 139 or email support@railsmart.com", 12, H - 20, { width: W - 24, align: "center" });

    doc.end();
    if (stream) return;
    return await collectBuffer(doc);

  } catch (err) {
    try { doc.end(); } catch (e) {}
    console.error("A5 PDF generation error:", err);
    throw err;
  }
}

function collectBuffer(doc) {
  return new Promise((resolve, reject) => {
    const bufs = [];
    doc.on("data", (d) => bufs.push(d));
    doc.on("end", () => resolve(Buffer.concat(bufs)));
    doc.on("error", (e) => reject(e));
  });
}

module.exports = { generateTicketPdf, generateTicketPdfA5 };
