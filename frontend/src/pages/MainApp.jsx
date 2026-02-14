import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import SeatMap from "../components/SeatMap.jsx";
import { useSpeechToText } from "../hooks/useSpeechToText";
import { useToast } from "../components/ToastProvider";
import { checkBookingEligibility, formatTime12Hour, getMinBookingDate, getMaxBookingDate } from "../utils/bookingEligibility";
import { Mic, Headphones, XCircle, Clock, Ticket, CheckCircle, ArrowRight } from "lucide-react";

const API_BASE_URL = "http://localhost:5000";
const VITE_RAZORPAY_KEY_ID = import.meta.env.VITE_RAZORPAY_KEY_ID;
const GST_RATE = 0.05;
const SERVICE_FEE = 10;

const calculateFare = (basePrice = 0) => {
  const base = Number(basePrice) || 0;
  const gst = base * GST_RATE;
  const serviceFee = base > 0 ? SERVICE_FEE : 0;
  return {
    base,
    gst,
    serviceFee,
    total: base + gst + serviceFee,
  };
};

function FareSummary({ basePrice }) {
  const { base, gst, serviceFee, total } = calculateFare(basePrice);

  if (!basePrice) {
    return (
      <div className="rs-fare-box rs-fare-box--empty">
        Select a train to view fare breakdown.
      </div>
    );
  }

  return (
    <div className="rs-fare-box">
      <div className="rs-fare-row">
        <span>Base fare</span>
        <span>₹{base.toFixed(2)}</span>
      </div>
      <div className="rs-fare-row">
        <span>GST (5%)</span>
        <span>₹{gst.toFixed(2)}</span>
      </div>
      <div className="rs-fare-row">
        <span>Service fee</span>
        <span>₹{serviceFee.toFixed(2)}</span>
      </div>
      <div className="rs-fare-divider" />
      <div className="rs-fare-row rs-fare-row--total">
        <span>Total</span>
        <span>₹{total.toFixed(2)}</span>
      </div>
    </div>
  );
}

// Helper to format ISO datetime to "dd/mm/yyyy" + time
function formatDateTime(isoString) {
  try {
    const d = new Date(isoString);
    const date = d.toLocaleDateString("en-GB");
    const time = d.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return { date, time };
  } catch {
    return { date: "", time: "" };
  }
}

function MainApp() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [trains, setTrains] = useState([]);
  const [selectedTrain, setSelectedTrain] = useState(null);
  const [travelDate, setTravelDate] = useState("");
  const [isSeatMapOpen, setIsSeatMapOpen] = useState(false);
  const [selectedSeat, setSelectedSeat] = useState("");
  // eslint-disable-next-line no-unused-vars
  const [bookedSeats, setBookedSeats] = useState([]);
  const [bookingError, setBookingError] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fromInput, setFromInput] = useState("");
  const [toInput, setToInput] = useState("");
  const [isBooking, setIsBooking] = useState(false);
  const [fromSuggestions, setFromSuggestions] = useState([]);
  const [toSuggestions, setToSuggestions] = useState([]);
  const [successModalOpen, setSuccessModalOpen] = useState(false);
  const [lastTicket, setLastTicket] = useState(null);

  // Utility removed (unused): const sleep = useCallback((ms) => new Promise((r) => setTimeout(r, ms)), []);

  const loadRazorpay = useCallback(() => {
    return new Promise((resolve) => {
      if (window.Razorpay) return resolve(true);
      const existing = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
      if (existing) {
        // If script already loaded (readyState), resolve immediately
        if (existing.dataset.loaded === "true") return resolve(true);
        existing.addEventListener("load", () => { existing.dataset.loaded = "true"; resolve(true); });
        existing.addEventListener("error", () => resolve(false));
        return;
      }
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => { script.dataset.loaded = "true"; resolve(true); };
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  }, []);

  const startRazorpayPayment = useCallback(
    async ({ intentId, amount, email }) => {
      console.log("[PAY] startRazorpayPayment called for intent", intentId);

      // Load Razorpay Checkout
      const ok = await loadRazorpay();
      console.log("[PAY] loadRazorpay result:", ok);
      if (!ok) {
        throw new Error("Failed to load payment gateway. Try again.");
      }

      // Fetch Razorpay key id (public)
      const keyRes = await fetch(`${API_BASE_URL}/api/payment/key`);
      const keyJson = await keyRes.json().catch(() => ({}));
      const razorpayKeyId = keyJson?.keyId || VITE_RAZORPAY_KEY_ID;
      console.log("[PAY] razorpayKeyId:", razorpayKeyId ? "(present)" : "(missing)");
      if (!razorpayKeyId) {
        throw new Error(
          "Razorpay keys missing. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in backend/.env and restart backend."
        );
      }

      // Create backend order (uses intentId, idempotent)
      let orderRes, order;
      try {
        orderRes = await fetch(`${API_BASE_URL}/api/payment/create-order`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ intentId }),
        });
        order = await orderRes.json().catch(() => null);
        console.log("[PAY] create-order response:", orderRes.status, order);
      } catch (fetchErr) {
        console.warn("[PAY] create-order fetch threw — network error, falling back to simulated", fetchErr);
        orderRes = null;
        order = null;
      }

      // ── Simulated-payment fallback ──
      // Triggers for: keys not configured, keys expired, Razorpay API errors, network errors.
      // Only SKIP fallback for specific validation codes that mean "don't retry".
      const skipFallbackCodes = ["ALREADY_PAID", "BOOKING_CLOSED", "INVALID_AMOUNT"];
      const shouldFallback = !orderRes || (!orderRes.ok && !skipFallbackCodes.includes(order?.code));

      if (shouldFallback) {
        console.warn("[PAY] Falling back to simulated payment. order:", order);
        const simRes = await fetch(`${API_BASE_URL}/api/payment/simulate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ intentId }),
        });
        const simData = await simRes.json().catch(() => null);
        console.log("[PAY] simulate response:", simRes.status, simData);
        if (!simRes.ok || !simData?.success) {
          throw new Error(simData?.error || "Simulated payment failed.");
        }

        showToast("success", "Payment successful! Ticket confirmed. (Demo mode)");
        setLastTicket(simData.ticket);
        setSuccessModalOpen(true);
        window.dispatchEvent(
          new CustomEvent("ticketBooked", { detail: { ticket: simData.ticket } })
        );
        setBookedSeats((prev) => [...prev, selectedSeat]);
        setSelectedSeat("");
        setIsSeatMapOpen(false);
        setIsBooking(false);
        return;
      }

      // If already paid, nothing to do
      if (!orderRes.ok && order?.code === "ALREADY_PAID") {
        showToast("info", "This ticket is already paid.");
        setIsBooking(false);
        return;
      }

      if (!orderRes.ok || !order?.orderId) {
        throw new Error(order?.error || "Failed to create payment order.");
      }

      const options = {
        key: razorpayKeyId,
        amount: order.amount,
        currency: order.currency,
        name: "RailSmart",
        description: "Train Ticket Payment",
        order_id: order.orderId,
        prefill: { email },
        modal: {
          ondismiss: async () => {
            // Mark intent as FAILED so user can rebook
            try {
              await fetch(`${API_BASE_URL}/api/payment/failure`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ intentId }),
              });
            } catch (e) {
              console.warn("Failed to record payment failure:", e);
            }
            showToast("info", "Payment not completed. You can retry from My Tickets.");
            setIsBooking(false);
          },
        },
        handler: async function (response) {
          try {
            const verifyRes = await fetch(`${API_BASE_URL}/api/payment/verify`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                intentId,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });
            const verifyJson = await verifyRes.json().catch(() => ({}));
            if (!verifyRes.ok || !verifyJson?.success) {
              showToast("error", verifyJson?.error || "Payment verification failed.");
              return;
            }

            showToast("success", "Payment successful! Ticket confirmed.");
            setLastTicket(verifyJson.ticket);
            setSuccessModalOpen(true);
            window.dispatchEvent(
              new CustomEvent("ticketBooked", { detail: { ticket: verifyJson.ticket } })
            );

            setBookedSeats((prev) => [...prev, selectedSeat]);
            setSelectedSeat("");
            setIsSeatMapOpen(false);
          } catch (err) {
            console.error("Verify error:", err);
            showToast("error", "Server error while verifying payment.");
          } finally {
            setIsBooking(false);
          }
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", async () => {
        // Record failure in backend
        try {
          await fetch(`${API_BASE_URL}/api/payment/failure`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ intentId }),
          });
        } catch (e) {
          console.warn("Failed to record payment failure:", e);
        }
        showToast("error", "Payment failed. You can retry from My Tickets.");
        setBookingError("Payment failed. Try again.");
        setIsBooking(false);
      });
      rzp.open();
    },
    [
      loadRazorpay,
      selectedSeat,
      showToast,
      setBookedSeats,
      setSelectedSeat,
      setIsSeatMapOpen,
      setBookingError,
    ]
  );

  // Voice recognition
  const { startListening, listening, supported, error: voiceError } = useSpeechToText();

  // Disable past dates
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const fetchTrains = useCallback(async (filters = {}) => {
    try {
      setLoading(true);
      setError("");

      const params = new URLSearchParams();
      if (filters.from) params.append("source", filters.from);
      if (filters.to) params.append("destination", filters.to);
      // Include travel date for booking status calculation
      if (filters.date || travelDate) {
        params.append("date", filters.date || travelDate);
      }

      const query = params.toString() ? `?${params.toString()}` : "";
      const res = await fetch(`${API_BASE_URL}/api/trains${query}`);
      if (!res.ok) throw new Error(`Server error: ${res.status}`);

      const rawData = await res.json();
      const normalized = rawData.map((t) => {
        // Use new schedule-based times from backend
        const departureTime = t.departure_display || formatTime12Hour(t.departure_time) || "";
        const arrivalTime = t.arrival_display || formatTime12Hour(t.arrival_time) || "";
        
        // Get booking status from backend or calculate locally
        const bookingStatus = t.booking || checkBookingEligibility(
          travelDate,
          t.departure_time || t.scheduled_departure || "08:00"
        );

        return {
          id: t.train_id,
          name: t.train_name,
          from: t.source,
          to: t.destination,
          price: Number(t.price),
          departureTime: departureTime,
          arrivalTime: arrivalTime,
          // Raw time for eligibility checks
          scheduledDeparture: t.departure_time || t.scheduled_departure || "08:00:00",
          availableSeats: t.total_seats || t.seat_count || 64,
          runsOn: t.runs_on || "DAILY",
          // Booking eligibility
          booking: bookingStatus
        };
      });

      setTrains(normalized);
    } catch (err) {
      console.error("Failed to load trains", err);
      setError("Unable to load trains. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [travelDate]);

  // Load trains on mount
  useEffect(() => {
    fetchTrains();
  }, [fetchTrains]);

  // Fetch station suggestions from backend
  const fetchStationSuggestions = async (term, which) => {
    if (!term || term.trim().length < 2) {
      if (which === "from") setFromSuggestions([]);
      if (which === "to") setToSuggestions([]);
      return;
    }

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/stations/search?q=${encodeURIComponent(term)}`
      );
      if (!res.ok) throw new Error("Failed to fetch stations");
      const data = await res.json();
      const stations = data.stations || [];

      if (which === "from") setFromSuggestions(stations);
      if (which === "to") setToSuggestions(stations);
    } catch (err) {
      console.error("Station search error:", err);
      if (which === "from") setFromSuggestions([]);
      if (which === "to") setToSuggestions([]);
    }
  };

  const handleFromChange = (e) => {
    const value = e.target.value;
    setFromInput(value);
    fetchStationSuggestions(value, "from");
  };

  const handleToChange = (e) => {
    const value = e.target.value;
    setToInput(value);
    fetchStationSuggestions(value, "to");
  };

  const selectSuggestion = (field, station) => {
    if (field === "from") {
      setFromInput(station.name);
      setFromSuggestions([]);
    } else if (field === "to") {
      setToInput(station.name);
      setToSuggestions([]);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    fetchTrains({ from: fromInput, to: toInput });
    setSelectedTrain(null);
  };

  // Voice handlers with improved title case
  const toTitleCase = (s) =>
    s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

  // Natural language parser for full voice booking
  const parseBookingCommand = (text) => {
    const lowerText = text.toLowerCase();

    // 1. Extract stations using regex
    const fromMatch = lowerText.match(/from ([a-z\s]+?)(?:\s+to\s+|\s+on\s+|$)/i);
    const toMatch = lowerText.match(/to ([a-z\s]+?)(?:\s+on\s+|\s+today|\s+tomorrow|\s+day after|$)/i);

    const from = fromMatch ? fromMatch[1].trim() : null;
    const to = toMatch ? toMatch[1].trim() : null;

    // 2. Extract date info
    let date = null;

    if (lowerText.includes("today")) {
      date = new Date();
    } else if (lowerText.includes("tomorrow")) {
      date = new Date(Date.now() + 1 * 86400000);
    } else if (lowerText.includes("day after")) {
      date = new Date(Date.now() + 2 * 86400000);
    } else {
      // Try to parse natural dates like "5 December" or "December 10"
      const datePattern = /(\d{1,2}\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)|(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2})/i;
      const dateMatch = lowerText.match(datePattern);
      if (dateMatch) {
        const tryDate = new Date(dateMatch[0]);
        if (!isNaN(tryDate.getTime())) {
          date = tryDate;
        }
      }
    }

    // Convert date to yyyy-mm-dd
    let dateStr = null;
    if (date) {
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, "0");
      const dd = String(date.getDate()).padStart(2, "0");
      dateStr = `${yyyy}-${mm}-${dd}`;
    }

    return { from, to, date: dateStr };
  };

  // Voice input handlers (reserved for future microphone feature)
  // eslint-disable-next-line no-unused-vars
  const handleVoiceFrom = () => {
    if (!supported) {
      alert("Your browser does not support speech input.");
      return;
    }
    startListening((spoken) => {
      const cleaned = toTitleCase(spoken.trim());
      setFromInput(cleaned);
    });
  };

  // eslint-disable-next-line no-unused-vars
  const handleVoiceTo = () => {
    if (!supported) {
      alert("Speech input not supported.");
      return;
    }
    startListening((spoken) => {
      const cleaned = toTitleCase(spoken.trim());
      setToInput(cleaned);
    });
  };

  // eslint-disable-next-line no-unused-vars
  const handleVoiceDate = () => {
    if (!supported) {
      alert("Speech not supported");
      return;
    }

    startListening((speech) => {
      const spoken = speech.toLowerCase().trim();
      let dateObj = null;

      if (spoken.includes("today")) {
        dateObj = new Date();
      } else if (spoken.includes("tomorrow")) {
        dateObj = new Date(Date.now() + 86400000);
      } else if (spoken.includes("day after")) {
        dateObj = new Date(Date.now() + 2 * 86400000);
      } else {
        // Try to parse natural language date
        dateObj = new Date(spoken);
      }

      if (isNaN(dateObj)) {
        alert("Couldn't understand the date");
        return;
      }

      const yyyy = dateObj.getFullYear();
      const mm = String(dateObj.getMonth() + 1).padStart(2, "0");
      const dd = String(dateObj.getDate()).padStart(2, "0");

      setTravelDate(`${yyyy}-${mm}-${dd}`);
    });
  };

  const handleVoiceBooking = () => {
    if (!supported) {
      alert("Speech input not supported.");
      return;
    }

    startListening((spoken) => {
      console.log("Full sentence:", spoken);

      const { from, to, date } = parseBookingCommand(spoken);

      if (from) setFromInput(toTitleCase(from));
      if (to) setToInput(toTitleCase(to));
      if (date) setTravelDate(date);

      if (from && to && date) {
        showToast(
          "success",
          `Auto-filled: ${toTitleCase(from)} → ${toTitleCase(to)} on ${date}`
        );
      } else {
        const missing = [];
        if (!from) missing.push("source");
        if (!to) missing.push("destination");
        if (!date) missing.push("date");
        showToast(
          "error",
          `Couldn't detect: ${missing.join(", ")}. Try: "Book from Mumbai to Pune tomorrow"`
        );
      }
    });
  };

  const handleTrainClick = (train) => {
    setSelectedTrain(train);
    setSelectedSeat("");
    setBookedSeats([]);
  };

  const fareDetails = useMemo(
    () => calculateFare(selectedTrain?.price || 0),
    [selectedTrain]
  );

  const openSeatMap = () => {
    if (!selectedTrain) {
      showToast("error", "Please select a train first.");
      return;
    }
    if (!travelDate) {
      showToast("error", "Please select a travel date first.");
      return;
    }

    setBookingError("");
    setIsSeatMapOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Double-click / retry guard
    if (isBooking) return;

    if (!selectedTrain) {
      showToast("error", "Please select a train first.");
      return;
    }
    if (!travelDate) {
      showToast("error", "Please choose a travel date.");
      return;
    }
    if (!selectedSeat) {
      showToast("error", "Please select a seat from the seat map.");
      return;
    }

    const storedUser = JSON.parse(localStorage.getItem("user") || "null");
    const userEmail = storedUser?.email || localStorage.getItem("userEmail");

    if (!userEmail) {
      showToast("error", "You must be signed in to book a ticket.");
      setBookingError("You must be signed in to pay.");
      return;
    }

    const bookingData = {
      email: userEmail,
      trainId: selectedTrain.id,
      travelDate,
      seatNo: selectedSeat,
      price: fareDetails.total,
    };

    console.log("📤 Booking request:", bookingData);

    try {
      setIsBooking(true);
      setBookingError("");
      // Prevent stale success UI from previous attempts.
      setSuccessModalOpen(false);
      setLastTicket(null);
      console.log("PAY NOW CLICKED", bookingData);

      // 1) Create a booking intent (locks seat for 10 min) — NOT a ticket
      const res = await fetch(`${API_BASE_URL}/api/book-ticket`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bookingData),
      });

      console.log("📥 Response status:", res.status);
      const data = await res.json();
      console.log("📥 Response data:", data);

      if (!res.ok) {
        console.error("Booking error detail:", data.error || data.detail);
        // Ensure we never show stale success UI for a failed booking.
        setSuccessModalOpen(false);
        setLastTicket(null);
        if (res.status === 409) {
          showToast("error", "This seat is already booked. Please select another seat.");
          setBookingError("Seat already booked. Please choose another seat.");
          setSelectedSeat("");
        } else {
          showToast("error", data.error || "Booking failed. Please try again.");
          setBookingError(data.error || data.detail || "Booking failed. Please try again.");
        }
        setIsBooking(false);
        return;
      }

      // Guard: if ticket already exists and is already paid, skip payment
      if (data.status === "EXISTS" && !data.paymentRequired) {
        showToast("info", "This ticket is already paid. Redirecting to My Tickets.");
        setIsBooking(false);
        // Broadcast so MyTickets refreshes
        localStorage.setItem("rs_tickets_update", Date.now().toString());
        window.dispatchEvent(new StorageEvent("storage", { key: "rs_tickets_update" }));
        return;
      }

      // data.intentId is the booking intent — payment creates the ticket atomically
      const intentId = data.intentId;
      console.log("[PAY] Intent created/resumed:", intentId, "status:", data.status);

      // 2) Start payment using the intent ID
      try {
        await startRazorpayPayment({ intentId, amount: data.amount || fareDetails.total, email: userEmail });
      } catch (e) {
        showToast("error", e?.message || "Failed to start payment");
        setIsBooking(false);
      }
    } catch (err) {
      console.error("❌ Booking error:", err);
      showToast("error", "Server error while booking ticket.");
      setBookingError("Server error while starting payment. Check console/network.");
      setIsBooking(false);
    } finally {
      // isBooking is cleared in checkout callbacks to avoid double-submits
    }
  };

  return (
    <div className="rs-page">
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 className="rs-page-title" style={{ margin: 0, fontSize: "1.5rem" }}>
          RailSmart
        </h1>
        <p style={{ fontSize: "0.75rem", color: "var(--rs-text-muted)", margin: 0 }}>
          Intelligent Railway Ticket Booking System
        </p>
      </div>

      <div className="rs-layout">
        <div className="rs-card" style={{ overflow: "visible" }}>
          <h2 className="rs-card-title">Available Trains</h2>
          <p className="rs-card-subtitle">
            Click a train to select it, then choose your seat to book.
          </p>

          <form className="rs-search-bar" onSubmit={handleSearch}>
            <div className="rs-filters-row">
              <div style={{ position: "relative", flex: "1 1 180px" }}>
                <input
                  type="text"
                  placeholder="From"
                  value={fromInput}
                  onChange={handleFromChange}
                  autoComplete="off"
                  className="rs-input"
                />
                {fromSuggestions.length > 0 && (
                  <div
                    style={{
                      position: "absolute",
                      top: "110%",
                      left: 0,
                      right: 0,
                      background: "var(--rs-card-bg)",
                      borderRadius: "10px",
                      border: "1px solid var(--rs-border)",
                      boxShadow: "0 10px 25px rgba(15,23,42,0.15)",
                      maxHeight: "220px",
                      overflowY: "auto",
                      zIndex: 50,
                    }}
                  >
                    {fromSuggestions.map((s, idx) => (
                      <div
                        key={idx}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => selectSuggestion("from", s)}
                        style={{
                          padding: "8px 12px",
                          cursor: "pointer",
                          fontSize: "0.9rem",
                        }}
                      >
                        {s.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <span className="rs-search-arrow">→</span>

              <div style={{ position: "relative", flex: "1 1 180px" }}>
                <input
                  type="text"
                  placeholder="To"
                  value={toInput}
                  onChange={handleToChange}
                  autoComplete="off"
                  className="rs-input"
                />
                {toSuggestions.length > 0 && (
                  <div
                    style={{
                      position: "absolute",
                      top: "110%",
                      left: 0,
                      right: 0,
                      background: "var(--rs-card-bg)",
                      borderRadius: "10px",
                      border: "1px solid var(--rs-border)",
                      boxShadow: "0 10px 25px rgba(15,23,42,0.15)",
                      maxHeight: "220px",
                      overflowY: "auto",
                      zIndex: 50,
                    }}
                  >
                    {toSuggestions.map((s, idx) => (
                      <div
                        key={idx}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => selectSuggestion("to", s)}
                        style={{
                          padding: "8px 12px",
                          cursor: "pointer",
                          fontSize: "0.9rem",
                        }}
                      >
                        {s.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <input
                type="date"
                value={travelDate}
                onChange={(e) => setTravelDate(e.target.value)}
                className="rs-input rs-input-date"
              />
            </div>

            <div className="rs-button-row">
              <button type="submit" className="rs-btn-primary">
                Search
              </button>

              <button
                type="button"
                onClick={handleVoiceBooking}
                className="rs-btn-primary rs-btn-voice"
                title="Say: Book from Mumbai to Pune tomorrow"
              >
                <Mic size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Voice Book
              </button>
            </div>
          </form>

          {listening && (
            <p style={{ fontSize: "0.875rem", color: "#2563eb", marginTop: "0.5rem", fontWeight: 500 }}>
              <Headphones size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Listening... speak clearly
            </p>
          )}
          {voiceError && (
            <p style={{ fontSize: "0.875rem", color: "#dc2626", marginTop: "0.5rem" }}>
              <XCircle size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} /> {voiceError}
            </p>
          )}

          {loading && <p className="rs-helper-text">Loading trains…</p>}
          {error && <p className="rs-error-text">{error}</p>}
          {!loading && !error && trains.length === 0 && (
            <p className="rs-helper-text">No trains available.</p>
          )}

          {!loading && !error && trains.length > 0 && (
            <div className="rs-train-list">
              {trains.length === 0 ? (
                <p className="rs-helper-text">
                  No trains match your search. Try changing From / To.
                </p>
              ) : (
                trains.map((train) => {
                  const isSelected = selectedTrain?.id === train.id;
                  const bookingAllowed = train.booking?.allowed !== false;
                  const bookingReason = train.booking?.reason || "";
                  
                  return (
                    <button
                      key={train.id}
                      onClick={() => handleTrainClick(train)}
                      className={
                        "rs-train-card" +
                        (isSelected ? " rs-train-card--selected" : "") +
                        (!bookingAllowed ? " rs-train-card--disabled" : "")
                      }
                      style={{
                        opacity: bookingAllowed ? 1 : 0.7,
                      }}
                    >
                      <div className="rs-train-card-header">
                        <span className="rs-train-name">{train.name}</span>
                        <span className="rs-train-price">
                          ₹{train.price.toFixed(2)}
                        </span>
                      </div>
                      <div className="rs-train-meta">
                        {train.from} <ArrowRight size={14} style={{ verticalAlign: 'middle', margin: '0 4px' }} /> {train.to}
                      </div>
                      <div className="rs-train-meta-small">
                        <Clock size={12} style={{ verticalAlign: 'middle', marginRight: 3 }} /> Departure: {train.departureTime} | Arrival: {train.arrivalTime}
                      </div>
                      <div className="rs-train-meta-small">
                        <Ticket size={12} style={{ verticalAlign: 'middle', marginRight: 3 }} /> Available seats: {train.availableSeats}
                      </div>
                      {/* Booking status indicator */}
                      {travelDate && (
                        <div 
                          className="rs-train-meta-small"
                          style={{
                            marginTop: "0.5rem",
                            padding: "0.25rem 0.5rem",
                            borderRadius: "4px",
                            backgroundColor: bookingAllowed ? "rgba(34, 197, 94, 0.1)" : "rgba(239, 68, 68, 0.1)",
                            color: bookingAllowed ? "#22c55e" : "#ef4444",
                            fontWeight: 500,
                          }}
                        >
                          {bookingAllowed ? <><CheckCircle size={12} style={{ verticalAlign: 'middle', marginRight: 3 }} /> </> : <><XCircle size={12} style={{ verticalAlign: 'middle', marginRight: 3 }} /> </>}{bookingReason}
                        </div>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>

        <div className="rs-card">
          <h2 className="rs-card-title">Book Ticket</h2>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: "1rem" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  marginBottom: "0.25rem",
                }}
              >
                Travel Date
              </label>
              <input
                type="date"
                value={travelDate}
                onChange={(e) => setTravelDate(e.target.value)}
                min={todayStr}
                className="rs-input"
              />
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  marginBottom: "0.25rem",
                }}
              >
                Selected Train
              </label>
              <input
                type="text"
                disabled
                value={
                  selectedTrain
                    ? `${selectedTrain.id} – ${selectedTrain.name}`
                    : "Click a train from the list"
                }
                className="rs-input rs-input--readonly"
              />
            </div>

            <div style={{ marginBottom: "0.75rem" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  marginBottom: "0.25rem",
                }}
              >
                Selected Seat
              </label>
              <input
                type="text"
                disabled
                value={selectedSeat || "Use Select Seat button"}
                className="rs-input rs-input--readonly"
              />
            </div>

            <div style={{ marginBottom: "1.3rem" }}>
              <button
                type="button"
                onClick={openSeatMap}
                disabled={!selectedTrain || !travelDate || selectedTrain?.booking?.allowed === false}
                className="rs-btn-outline"
                style={{
                  opacity: (!selectedTrain || !travelDate || selectedTrain?.booking?.allowed === false) ? 0.5 : 1,
                }}
              >
                Select Seat
              </button>
              {bookingError && <p className="rs-error-text">{bookingError}</p>}
              {/* Show booking not allowed message */}
              {selectedTrain?.booking?.allowed === false && travelDate && (
                <p className="rs-error-text" style={{ marginTop: "0.5rem" }}>
                  <XCircle size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} /> {selectedTrain.booking.reason}
                </p>
              )}
            </div>

            <FareSummary basePrice={selectedTrain?.price || 0} />

            {(() => {
              // Check booking eligibility for selected train
              const bookingAllowed = selectedTrain?.booking?.allowed !== false;
              const canBook = bookingAllowed && !isBooking && selectedSeat && selectedTrain && travelDate;
              const buttonText = !bookingAllowed ? "Booking Closed" : isBooking ? "Processing..." : "Pay Now";
              
              return (
                <button
                  type="submit"
                  disabled={!canBook}
                  className="rs-btn-primary"
                  style={{
                    opacity: canBook ? 1 : 0.5,
                    cursor: canBook ? "pointer" : "not-allowed",
                    backgroundColor: !bookingAllowed ? "#6b7280" : undefined,
                  }}
                >
                  {isBooking ? (
                    <>
                      <span className="rs-inline-spinner" aria-hidden="true" />
                      Processing...
                    </>
                  ) : (
                    buttonText
                  )}
                </button>
              );
            })()}
          </form>
        </div>
      </div>

      {isSeatMapOpen && selectedTrain && (
        <SeatMap
          trainId={selectedTrain.id}
          travelDate={travelDate}
          selectedSeat={selectedSeat}
          onSelect={(seatId) => {
            console.log("Seat selected from SeatMap:", seatId);
            setSelectedSeat(seatId);
            setIsSeatMapOpen(false);
          }}
          onClose={() => setIsSeatMapOpen(false)}
        />
      )}

      {/* Success Modal */}
      {successModalOpen && lastTicket && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(0, 0, 0, 0.4)",
          }}
        >
          <div
            style={{
              backgroundColor: "var(--rs-card-bg)",
              border: "1px solid var(--rs-border)",
              borderRadius: "16px",
              boxShadow:
                "0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 10px 15px -3px rgba(0, 0, 0, 0.1)",
              width: "100%",
              maxWidth: "28rem",
              padding: "1.5rem",
            }}
          >
            <h3
              style={{
                fontSize: "1.125rem",
                fontWeight: 600,
                marginBottom: "0.5rem",
              }}
            >
              Payment successful! Ticket confirmed <CheckCircle size={18} style={{ verticalAlign: 'middle', marginLeft: 4 }} />
            </h3>
            <p
              style={{
                fontSize: "0.875rem",
                color: "var(--rs-text-muted)",
                marginBottom: "1rem",
              }}
            >
              Your payment is verified on the backend. Ticket for{" "}
              <span style={{ fontWeight: 500 }}>
                {selectedTrain?.name || "selected train"}
              </span>{" "}
              is now confirmed. Seat{" "}
              <span style={{ fontWeight: 500 }}>{lastTicket.seat_no || selectedSeat}</span> on{" "}
              {travelDate ? new Date(travelDate).toLocaleDateString("en-GB") : "-"}.
            </p>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "0.5rem",
              }}
            >
              <button
                onClick={() => {
                  setSuccessModalOpen(false);
                  setSelectedSeat("");
                }}
                style={{
                  padding: "0.5rem 1rem",
                  fontSize: "0.875rem",
                  borderRadius: "0.5rem",
                  border: "1px solid var(--rs-border)",
                  color: "var(--rs-text-main)",
                  backgroundColor: "var(--rs-surface-2)",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--rs-card-bg)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--rs-surface-2)";
                }}
              >
                Book another
              </button>
              <button
                onClick={() => {
                  setSuccessModalOpen(false);
                  navigate("/tickets");
                }}
                style={{
                  padding: "0.5rem 1rem",
                  fontSize: "0.875rem",
                  borderRadius: "0.5rem",
                  backgroundColor: "#10b981",
                  color: "white",
                  border: "none",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#059669";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "#10b981";
                }}
              >
                View my tickets
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MainApp;
