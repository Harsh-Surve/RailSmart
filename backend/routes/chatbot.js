const express = require("express");
const router = express.Router();

router.post("/", (req, res) => {
  const { message } = req.body;

  if (!message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ reply: "Please type a message to get help." });
  }

  const msg = message.toLowerCase().trim();

  // Simple rule-based logic
  if (msg.includes("book") || msg.includes("booking")) {
    return res.json({
      reply:
        "To book a ticket, search a train → select seat → click Pay Now → complete Razorpay payment.",
    });
  }

  if (msg.includes("cancel")) {
    return res.json({
      reply:
        "Tickets can be cancelled only before train departure. Go to My Tickets → Cancel Ticket.",
    });
  }

  if (msg.includes("track")) {
    return res.json({
      reply:
        "To track your train, go to Track Train, select your train & journey date to view live status.",
    });
  }

  if (msg.includes("tatkal")) {
    return res.json({
      reply:
        "Tatkal booking opens 1 day before journey. Seats are limited and booking closes once full.",
    });
  }

  if (msg.includes("payment")) {
    return res.json({
      reply:
        "Payments are handled via Razorpay. If payment fails, you can retry the booking from the Tickets page.",
    });
  }

  // PNR Status
  if (msg.includes("pnr")) {
    return res.json({
      reply:
        "PNR status is available in your Tickets section. Each ticket includes its PNR number and status.",
    });
  }

  // Refund Status
  if (msg.includes("refund")) {
    return res.json({
      reply:
        "Refunds are processed automatically when a ticket is cancelled before departure. Refunds take 3–5 business days.",
    });
  }

  // Platform Information
  if (msg.includes("platform")) {
    return res.json({
      reply:
        "Platform information is not available in the current version. However, it can be integrated with live railway APIs in future.",
    });
  }

  // Train Delay
  if (msg.includes("delay") || msg.includes("late")) {
    return res.json({
      reply:
        "Train delay status is shown automatically in Live Tracking based on ETA calculations.",
    });
  }

  // Meals / Food
  if (msg.includes("food") || msg.includes("meal")) {
    return res.json({
      reply:
        "Catering services depend on the train. You can check IRCTC eCatering app for meal ordering.",
    });
  }

  // Help / Options
  if (msg.includes("help")) {
    return res.json({
      reply:
        "I can assist with Booking, Cancellation, Tatkal, PNR, Tracking, Refunds, Food, and Delay info.",
    });
  }

  return res.json({
    reply:
      "I can help with booking, cancellation, live tracking, Tatkal, and payments. Ask me anything!",
  });
});

module.exports = router;
