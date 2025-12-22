function bookingSuccessTemplate({
  ticketId,
  train,
  route,
  date,
  seat,
  price,
  pnr,
} = {}) {
  const safe = (v) => (v == null ? "" : String(v));
  const money = price == null || price === "" ? "" : `₹${Number(price).toFixed(2)}`;

  return `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;line-height:1.4">
      <h2 style="margin:0 0 8px">🎟 Ticket Confirmed – RailSmart</h2>
      <p style="margin:0 0 14px;color:#374151">Your ticket has been successfully confirmed.</p>
      <table cellpadding="6" cellspacing="0" style="border-collapse:collapse">
        ${ticketId ? `<tr><td><b>Ticket ID</b></td><td>${safe(ticketId)}</td></tr>` : ""}
        ${pnr ? `<tr><td><b>PNR</b></td><td>${safe(pnr)}</td></tr>` : ""}
        <tr><td><b>Train</b></td><td>${safe(train)}</td></tr>
        <tr><td><b>Route</b></td><td>${safe(route)}</td></tr>
        <tr><td><b>Date</b></td><td>${safe(date)}</td></tr>
        <tr><td><b>Seat</b></td><td>${safe(seat)}</td></tr>
        ${money ? `<tr><td><b>Amount Paid</b></td><td>${money}</td></tr>` : ""}
      </table>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0" />
      <p style="margin:0;color:#6b7280">🚆 Thank you for choosing <b>RailSmart</b>. Safe journey!</p>
    </div>
  `;
}

function cancelTemplate({ ticketId, train, route, date, seat, pnr } = {}) {
  const safe = (v) => (v == null ? "" : String(v));

  return `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;line-height:1.4">
      <h2 style="margin:0 0 8px">❌ Ticket Cancelled – RailSmart</h2>
      <p style="margin:0 0 14px;color:#374151">Your ticket has been cancelled.</p>
      <table cellpadding="6" cellspacing="0" style="border-collapse:collapse">
        ${ticketId ? `<tr><td><b>Ticket ID</b></td><td>${safe(ticketId)}</td></tr>` : ""}
        ${pnr ? `<tr><td><b>PNR</b></td><td>${safe(pnr)}</td></tr>` : ""}
        <tr><td><b>Train</b></td><td>${safe(train)}</td></tr>
        ${route ? `<tr><td><b>Route</b></td><td>${safe(route)}</td></tr>` : ""}
        <tr><td><b>Date</b></td><td>${safe(date)}</td></tr>
        <tr><td><b>Seat</b></td><td>${safe(seat)}</td></tr>
      </table>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0" />
      <p style="margin:0;color:#6b7280">If applicable, refund will be processed (demo).</p>
    </div>
  `;
}

module.exports = {
  bookingSuccessTemplate,
  cancelTemplate,
};
