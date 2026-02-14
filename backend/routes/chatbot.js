const express = require("express");
const router = express.Router();

router.post("/", (req, res) => {
  const { message } = req.body;

  if (!message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ reply: "Please type a message to get help." });
  }

  const msg = message.toLowerCase().trim();

  // ── Booking ──
  if (msg.includes("book") || msg.includes("booking")) {
    return res.json({
      reply:
        "Here's how to book a ticket on RailSmart:\n\n" +
        "1. Go to the 'Trains & Booking' page from the navigation bar.\n" +
        "2. Enter your departure station (From) and arrival station (To).\n" +
        "3. Select a travel date — you can book up to 120 days in advance.\n" +
        "4. Click 'Search' to see available trains on that route.\n" +
        "5. Select the train you want to travel on.\n" +
        "6. Click 'Select Seat' to open the interactive seat map.\n" +
        "7. Choose an available seat (shown in green). Booked seats are shown in red.\n" +
        "8. Review the fare summary including base fare and GST.\n" +
        "9. Click 'Pay Now' — this opens the Razorpay payment gateway.\n" +
        "10. Complete the payment using UPI, card, net banking, or wallet.\n\n" +
        "Once payment is confirmed, your ticket will appear in 'My Tickets' with a unique PNR number. You can also download a PDF copy of your ticket.",
    });
  }

  // ── Cancellation ──
  if (msg.includes("cancel")) {
    return res.json({
      reply:
        "Here's how ticket cancellation works on RailSmart:\n\n" +
        "1. Go to 'My Tickets' from the navigation bar.\n" +
        "2. Find the ticket you want to cancel.\n" +
        "3. Click the 'Cancel' button on the ticket card.\n" +
        "4. A confirmation dialog will appear — confirm the cancellation.\n\n" +
        "Important rules:\n" +
        "• You can only cancel tickets before the train's scheduled departure time.\n" +
        "• Once a train has departed or the journey is completed, cancellation is not possible.\n" +
        "• Already cancelled tickets cannot be cancelled again.\n" +
        "• After cancellation, a refund is automatically initiated.\n" +
        "• The cancelled seat becomes available for other passengers to book.\n" +
        "• Your ticket status will change to 'CANCELLED' and the payment status to 'REFUNDED'.",
    });
  }

  // ── Train Tracking ──
  if (msg.includes("track")) {
    return res.json({
      reply:
        "Here's how to track your train in real-time on RailSmart:\n\n" +
        "1. Go to 'Track Train' from the navigation bar.\n" +
        "2. Select the train you want to track from the dropdown list.\n" +
        "3. Choose the journey date (defaults to today).\n" +
        "4. The live map will display the train's current position on the railway track.\n\n" +
        "Tracking features:\n" +
        "• Live location updates every 2 seconds on the map.\n" +
        "• Shows real-time ETA (Estimated Time of Arrival) at the destination.\n" +
        "• Displays scheduled arrival vs live ETA for delay detection.\n" +
        "• The route is shown as a colored line on the map.\n" +
        "• Train status is shown as RUNNING, ARRIVED, or NOT STARTED.\n" +
        "• When the train arrives at its destination, tracking stops automatically.\n\n" +
        "Tip: You can also click 'Track Train' directly from your ticket in 'My Tickets' for quick access!",
    });
  }

  // ── Tatkal ──
  if (msg.includes("tatkal")) {
    return res.json({
      reply:
        "Here's everything about Tatkal booking on RailSmart:\n\n" +
        "What is Tatkal?\n" +
        "Tatkal is a last-minute booking scheme for urgent travel needs. It allows passengers to book tickets just one day before the journey date.\n\n" +
        "Key rules:\n" +
        "• Tatkal booking window opens exactly 1 day before the journey date.\n" +
        "• A limited number of seats are reserved for Tatkal passengers.\n" +
        "• Tatkal tickets may have a higher fare compared to regular bookings.\n" +
        "• Once all Tatkal seats are booked, no more Tatkal bookings are accepted.\n" +
        "• Tatkal tickets have restricted cancellation policies — refunds may not be applicable.\n\n" +
        "How to book Tatkal:\n" +
        "Simply select a travel date that is tomorrow, and available Tatkal seats will be shown in the seat map. The booking process is the same as regular booking.",
    });
  }

  // ── Payment ──
  if (msg.includes("payment") || msg.includes("pay")) {
    return res.json({
      reply:
        "Here's everything about payments on RailSmart:\n\n" +
        "Payment Gateway:\n" +
        "RailSmart uses Razorpay, India's leading payment gateway, for secure transactions.\n\n" +
        "Supported payment methods:\n" +
        "• UPI (Google Pay, PhonePe, Paytm, etc.)\n" +
        "• Credit & Debit Cards (Visa, Mastercard, RuPay)\n" +
        "• Net Banking (all major banks)\n" +
        "• Wallets (Paytm, Freecharge, etc.)\n\n" +
        "Payment process:\n" +
        "1. After selecting your train and seat, click 'Pay Now'.\n" +
        "2. The Razorpay checkout window will open.\n" +
        "3. Choose your preferred payment method and complete the transaction.\n" +
        "4. Once payment is verified on the server, your ticket is confirmed instantly.\n\n" +
        "If payment fails:\n" +
        "• Your seat is reserved for 10 minutes during the payment process.\n" +
        "• You can retry the payment from 'My Tickets' using the 'Retry Payment' button.\n" +
        "• If the payment window expires, the seat is released for other passengers.\n" +
        "• Failed payments are marked as 'PAYMENT FAILED' in your tickets.",
    });
  }

  // ── PNR Status ──
  if (msg.includes("pnr")) {
    return res.json({
      reply:
        "Here's how PNR works on RailSmart:\n\n" +
        "What is PNR?\n" +
        "PNR (Passenger Name Record) is a unique 10-digit number assigned to every booked ticket. It serves as your booking reference.\n\n" +
        "Where to find your PNR:\n" +
        "• Go to 'My Tickets' — each ticket card displays its PNR number.\n" +
        "• You can also expand the ticket card to see additional details including PNR and Payment ID.\n" +
        "• Your ticket PDF also contains the PNR number.\n\n" +
        "PNR tracks:\n" +
        "• Your booking status (Confirmed, Cancelled, etc.)\n" +
        "• Payment status (Paid, Pending, Refunded)\n" +
        "• Train details, seat number, and travel date\n" +
        "• Journey completion status",
    });
  }

  // ── Refund ──
  if (msg.includes("refund")) {
    return res.json({
      reply:
        "Here's how refunds work on RailSmart:\n\n" +
        "When do you get a refund?\n" +
        "• When you cancel a confirmed ticket before the train's departure time.\n" +
        "• When a payment fails after a seat was locked (automatic release).\n\n" +
        "Refund process:\n" +
        "1. Cancel your ticket from 'My Tickets'.\n" +
        "2. The refund is automatically initiated by the system.\n" +
        "3. Your payment status changes to 'REFUNDED'.\n" +
        "4. The refund amount is credited back to your original payment method.\n\n" +
        "Refund timeline:\n" +
        "• UPI payments: Refunded within 24–48 hours.\n" +
        "• Card payments: Refunded within 5–7 business days.\n" +
        "• Net Banking: Refunded within 5–7 business days.\n" +
        "• Wallets: Refunded within 24 hours.\n\n" +
        "Note: The refund amount may vary based on the cancellation policy. Tatkal tickets may have limited or no refund eligibility.",
    });
  }

  // ── Platform ──
  if (msg.includes("platform")) {
    return res.json({
      reply:
        "Platform information on RailSmart:\n\n" +
        "Currently, platform number assignment is not available in this version of RailSmart. Platform numbers are typically assigned by the railway station authorities 2–4 hours before the train's arrival.\n\n" +
        "How to check platform info:\n" +
        "• Check the railway station display boards at the station.\n" +
        "• Use the official IRCTC or NTES (National Train Enquiry System) app.\n" +
        "• Listen for platform announcements at the station.\n\n" +
        "We plan to integrate live platform data through Indian Railways APIs in a future update!",
    });
  }

  // ── Train Delay ──
  if (msg.includes("delay") || msg.includes("late")) {
    return res.json({
      reply:
        "Here's how train delay information works on RailSmart:\n\n" +
        "How RailSmart detects delays:\n" +
        "• The system compares the train's scheduled arrival time with its live ETA.\n" +
        "• If the live ETA exceeds the scheduled time, the train is marked as delayed.\n" +
        "• Delay duration is calculated and shown in minutes.\n\n" +
        "Where delay info appears:\n" +
        "• 'My Tickets' — delayed trains show a red 'RUNNING (Delayed X min)' badge.\n" +
        "• 'Track Train' — the ETA panel shows both scheduled arrival and live ETA.\n" +
        "• Status badges dynamically update as delay status changes.\n\n" +
        "Delay notifications:\n" +
        "• Currently, delays are visible through the live tracking interface.\n" +
        "• Trains running on time show an amber 'RUNNING' badge instead of red.",
    });
  }

  // ── Food / Meals ──
  if (msg.includes("food") || msg.includes("meal") || msg.includes("catering")) {
    return res.json({
      reply:
        "Food and catering information:\n\n" +
        "RailSmart currently does not offer in-app food ordering. However, here are your options for ordering meals during your journey:\n\n" +
        "1. IRCTC eCatering: Use the official IRCTC eCatering service at ecatering.irctc.co.in to pre-order meals delivered to your seat at selected stations.\n" +
        "2. Zoop / RailRestro: Third-party food delivery apps that deliver to your train seat.\n" +
        "3. Station pantry car: Long-distance trains often have pantry cars serving meals.\n" +
        "4. Station vendors: Food stalls are available at most railway stations during stops.\n\n" +
        "Tip: Pre-ordering meals through eCatering is recommended for guaranteed availability!",
    });
  }

  // ── Seat Selection ──
  if (msg.includes("seat")) {
    return res.json({
      reply:
        "Here's how seat selection works on RailSmart:\n\n" +
        "Interactive Seat Map:\n" +
        "• After selecting a train, click 'Select Seat' to open the seat map.\n" +
        "• Available seats are shown in green — click to select.\n" +
        "• Booked seats are shown in red — these cannot be selected.\n" +
        "• Your selected seat is highlighted in blue.\n\n" +
        "Seat details:\n" +
        "• Each seat has a unique number (e.g., S1, S2, etc.)\n" +
        "• The seat map updates in real-time — if someone books a seat while you're browsing, it turns red.\n" +
        "• Your selected seat is locked for 10 minutes once you initiate payment.\n\n" +
        "Tips:\n" +
        "• Window seats are popular — book early to secure your preference!\n" +
        "• If a seat shows as unavailable, try refreshing the seat map.",
    });
  }

  // ── Dashboard ──
  if (msg.includes("dashboard")) {
    return res.json({
      reply:
        "Here's what you can see on the RailSmart Dashboard:\n\n" +
        "The Dashboard provides an overview of your booking activity:\n\n" +
        "• Total Amount Spent: The total money you've spent on confirmed bookings.\n" +
        "• Total Bookings: The number of tickets you've booked.\n" +
        "• Most Booked Train: The train you've traveled on most frequently.\n" +
        "• Pending Intents: Booking intents that haven't been completed yet.\n" +
        "• Expired Intents: Booking intents that timed out without payment.\n" +
        "• Failed Payments: The number of payment attempts that failed.\n\n" +
        "Charts & Tables:\n" +
        "• Revenue by Date: A bar chart showing your spending over the last 7 days.\n" +
        "• Seat Occupancy: Shows how full each train is.\n" +
        "• Recent Bookings: A table of all your recent tickets with details.",
    });
  }

  // ── Help ──
  if (msg.includes("help") || msg.includes("what can you")) {
    return res.json({
      reply:
        "Welcome! I'm the RailSmart Assistant and I can help you with:\n\n" +
        "🎫 Booking — How to search trains, select seats, and complete payment\n" +
        "❌ Cancellation — How to cancel tickets and what the rules are\n" +
        "🚂 Train Tracking — Real-time train location on a live map\n" +
        "💳 Payments — Supported methods, failed payments, retry options\n" +
        "📋 PNR Status — Finding and understanding your PNR number\n" +
        "💰 Refunds — Refund policies, timelines, and process\n" +
        "⏰ Tatkal — Last-minute booking rules and process\n" +
        "⏱️ Delays — How RailSmart detects and shows train delays\n" +
        "💺 Seat Selection — Interactive seat map and booking tips\n" +
        "📊 Dashboard — Understanding your booking statistics\n\n" +
        "Just type your question and I'll give you a detailed answer!",
    });
  }

  // ── Greeting ──
  if (msg.includes("hello") || msg.includes("hi") || msg === "hey" || msg.includes("good morning") || msg.includes("good evening")) {
    return res.json({
      reply:
        "Hello! Welcome to RailSmart Assistant! 👋\n\n" +
        "I'm here to help you with everything related to train booking, cancellation, live tracking, payments, refunds, and more.\n\n" +
        "Here are some things you can ask me:\n" +
        "• \"How to book a ticket?\"\n" +
        "• \"Can I cancel my ticket?\"\n" +
        "• \"Track my train\"\n" +
        "• \"What are Tatkal rules?\"\n" +
        "• \"Refund status\"\n\n" +
        "Go ahead, ask me anything!",
    });
  }

  // ── Thank you ──
  if (msg.includes("thank") || msg.includes("thanks")) {
    return res.json({
      reply:
        "You're welcome! Happy to help. If you have any more questions about booking, tracking, payments, or anything else, feel free to ask anytime. Have a great journey! 🚆",
    });
  }

  // ── Default fallback ──
  return res.json({
    reply:
      "I'm not sure I understood that, but I can help with many topics!\n\n" +
      "Try asking me about:\n" +
      "• Booking a ticket\n" +
      "• Cancelling a ticket\n" +
      "• Tracking a train\n" +
      "• Payment methods & issues\n" +
      "• PNR status\n" +
      "• Refund process\n" +
      "• Tatkal booking rules\n" +
      "• Seat selection\n" +
      "• Dashboard overview\n\n" +
      "Type 'help' to see everything I can assist with!",
  });
});

module.exports = router;
