import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import SeatMap from "../components/SeatMap";
import { Mic, CheckCircle, ArrowRight } from "lucide-react";

const API_BASE_URL = "http://localhost:5000";

export default function Trains() {
  const navigate = useNavigate();
  // core data
  const [trains, setTrains] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // selection state
  const [selectedTrain, setSelectedTrain] = useState(null);
  const [travelDate, setTravelDate] = useState("");
  const [selectedSeat, setSelectedSeat] = useState("");

  // search inputs
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // UI state
  const [isSeatModalOpen, setSeatModalOpen] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  // voice state
  const [isListening, setIsListening] = useState(false);

  // Station auto-suggest state
  const [fromSuggestions, setFromSuggestions] = useState([]);
  const [toSuggestions, setToSuggestions] = useState([]);

  // booking success state
  const [lastBookedTicketId, setLastBookedTicketId] = useState(null);
  const [showSuccessBox, setShowSuccessBox] = useState(false);

  // Reusable fetch function with filters
  const fetchTrains = async (filters = {}) => {
    try {
      setLoading(true);
      setError("");

      const params = new URLSearchParams();

      if (filters.from) params.set("from", filters.from);
      if (filters.to) params.set("to", filters.to);
      if (filters.date) params.set("date", filters.date);

      const qs = params.toString();
      const url = qs
        ? `${API_BASE_URL}/api/trains?${qs}`
        : `${API_BASE_URL}/api/trains`;

      const res = await fetch(url);
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();

      setTrains(data || []);
    } catch (err) {
      console.error("Error fetching trains:", err);
      setError("Unable to load trains.");
    } finally {
      setLoading(false);
    }
  };

  // Fetch trains on mount (initial full list)
  useEffect(() => {
    fetchTrains();
  }, []);

  const isPastDate = (dateStr) => {
    if (!dateStr) return false;
    const chosen = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    chosen.setHours(0, 0, 0, 0);
    return chosen < today;
  };

  const validateSearchInputs = () => {
    setSearchError("");
    if (!from.trim() || !to.trim()) {
      setSearchError("Please enter both source and destination.");
      return false;
    }
    if (from.trim().toLowerCase() === to.trim().toLowerCase()) {
      setSearchError("Source and destination cannot be the same.");
      return false;
    }
    if (!travelDate) {
      setSearchError("Please select a travel date.");
      return false;
    }
    if (isPastDate(travelDate)) {
      setSearchError("Please choose a present or future travel date.");
      return false;
    }
    return true;
  };

  // Primary search handler
  const handleSearch = async () => {
    setSearchError("");
    if (!validateSearchInputs()) return;

    setIsSearching(true);
    setSelectedTrain(null);
    setSelectedSeat("");

    try {
      // Fetch trains with filters
      await fetchTrains({
        from: from.trim(),
        to: to.trim(),
        date: travelDate,
      });
    } catch (err) {
      console.error("Search error:", err);
      setSearchError("Search failed — please try again.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleClearSearch = () => {
    setFrom("");
    setTo("");
    setTravelDate("");
    setSearchError("");
    setSelectedTrain(null);
    setSelectedSeat("");
    setFromSuggestions([]);
    setToSuggestions([]);
    
    // Reload all trains
    fetchTrains();
  };

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
    setFrom(value);
    fetchStationSuggestions(value, "from");
  };

  const handleToChange = (e) => {
    const value = e.target.value;
    setTo(value);
    fetchStationSuggestions(value, "to");
  };

  const selectSuggestion = (field, station) => {
    if (field === "from") {
      setFrom(station.name);
      setFromSuggestions([]);
    } else if (field === "to") {
      setTo(station.name);
      setToSuggestions([]);
    }
  };

  // Seat modal flow
  const handleOpenSeatModal = (train) => {
    if (!travelDate) {
      alert("Please select a travel date first.");
      return;
    }
    setSelectedTrain(train);
    setSeatModalOpen(true);
  };

  const handleSeatSelected = (seatId) => {
    console.log("Seat selected from SeatMap:", seatId);
    setSelectedSeat(seatId);
    setSeatModalOpen(false);
  };

  // Booking logic
  const handleBookTicket = async () => {
    console.log("🎫 Book Ticket clicked", { selectedTrain, travelDate, selectedSeat });

    // Clear any previous success UI so failed retries don't look like success.
    setShowSuccessBox(false);
    setLastBookedTicketId(null);

    if (!selectedTrain || !travelDate || !selectedSeat) {
      alert("Please select a train, date, and seat first.");
      return;
    }

    const userEmail = localStorage.getItem("userEmail");
    console.log("👤 User email from localStorage:", userEmail);

    if (!userEmail) {
      alert("Please log in first.");
      return;
    }

    const bookingPayload = {
      email: userEmail,
      trainId: selectedTrain.train_id,
      travelDate,
      seatNo: selectedSeat,
      price: selectedTrain.price,
    };

    console.log("📤 Sending booking request:", bookingPayload);

    try {
      const res = await fetch(`${API_BASE_URL}/api/book-ticket`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bookingPayload),
      });

      console.log("📥 Response status:", res.status);
      const responseText = await res.text();
      console.log("📥 Response body:", responseText);

      let data;
      try {
        data = JSON.parse(responseText);
      } catch {
        data = { raw: responseText };
      }

      if (!res.ok) {
        console.error("❌ Booking API failed:", data);
        if (res.status === 409) {
          alert("This seat is already booked. Please select another seat.");
          setSelectedSeat("");
          return;
        }
        alert(data.error || data.message || `Booking failed (status ${res.status})`);
        return;
      }

      const ticketId = data.ticket?.ticket_id || null;
      console.log("✅ Booking successful:", data);

      setLastBookedTicketId(ticketId);
      setShowSuccessBox(true);

      // notify listeners (MyTickets) to refresh
      window.dispatchEvent(new Event("ticketBooked"));

      // Reset selection
      setSelectedSeat("");
      setSelectedTrain(null);
      setTravelDate("");
    } catch (err) {
      console.error("❌ Booking error (full):", err);
      alert(
        "Booking failed — check console for details.\n" +
          (err.message || err)
      );
    }
  };

  // 🎤 Voice Book: fill From/To using speech
  const handleVoiceBook = () => {
    if (isListening) return;

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }

    const rec = new SpeechRecognition();
    rec.lang = "en-IN";
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    setIsListening(true);
    setSearchError("");

    let message = "";
    if (!from && !to) {
      message =
        "Please say your route, for example: Mumbai to Pune.";
    } else if (!from) {
      message = "Please say your source station.";
    } else if (!to) {
      message = "Please say your destination station.";
    } else {
      message =
        "Both stations filled. You can still speak to overwrite them.";
    }
    console.log("🎤 Voice prompt:", message);

    rec.start();

    rec.onresult = (event) => {
      const transcript = event.results[0][0].transcript.trim();
      console.log("🎤 Heard:", transcript);

      // If both empty, try pattern "X to Y"
      if (!from && !to) {
        const parts = transcript.split(/\s+to\s+/i);
        if (parts.length === 2) {
          setFrom(capitalize(parts[0]));
          setTo(capitalize(parts[1]));
          return;
        }
      }

      // Otherwise, fill whichever is empty first
      if (!from) {
        setFrom(capitalize(transcript));
      } else if (!to) {
        setTo(capitalize(transcript));
      } else {
        // overwrite destination by default
        setTo(capitalize(transcript));
      }
    };

    rec.onerror = (e) => {
      console.error("Speech error:", e);
      setSearchError("Could not capture voice input. Please try again.");
      setIsListening(false);
    };

    rec.onend = () => {
      setIsListening(false);
    };
  };

  const capitalize = (str) =>
    str.length ? str[0].toUpperCase() + str.slice(1) : str;

  // Live filtering as user types (before clicking Search)
  const liveFilteredTrains = useMemo(() => {
    // If no search inputs yet, show all trains
    if (!from.trim() && !to.trim()) {
      return trains;
    }

    return trains.filter((train) => {
      const matchesFrom = from.trim()
        ? train.source.toLowerCase().includes(from.trim().toLowerCase())
        : true;

      const matchesTo = to.trim()
        ? train.destination.toLowerCase().includes(to.trim().toLowerCase())
        : true;

      return matchesFrom && matchesTo;
    });
  }, [trains, from, to]);

  // choose which list to display (live filter is sufficient)
  const displayTrains = liveFilteredTrains;

  return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif", color: "var(--rs-text-main)" }}>
      <h1 style={{ marginBottom: "1.5rem" }}>Book Your Train Ticket</h1>

      <div style={{ display: "flex", gap: "2rem", alignItems: "flex-start" }}>
        {/* LEFT: Train List */}
        <div style={{ flex: "1 1 60%", overflow: "visible" }}>
          {/* Filters row */}
          <div style={{ marginBottom: "1rem" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                flexWrap: "nowrap",
              }}
            >
              {/* FROM */}
              <div
                style={{
                  position: "relative",
                  width: "220px",
                  flexShrink: 0,
                }}
              >
                <input
                  placeholder="From"
                  autoComplete="off"
                  type="text"
                  value={from}
                  onChange={handleFromChange}
                  style={{
                    width: "100%",
                    padding: "0.55rem 1rem",
                    borderRadius: "10px",
                    border: "1px solid var(--rs-input-border)",
                    fontSize: "0.95rem",
                    boxSizing: "border-box",
                    backgroundColor: "var(--rs-input-bg)",
                    color: "var(--rs-input-fg)",
                    transition: "all 0.15s ease",
                  }}
                  onFocus={(e) => {
                    e.target.style.outline = "none";
                    e.target.style.borderColor = "var(--rs-input-border-focus)";
                    e.target.style.backgroundColor = "var(--rs-input-bg-focus)";
                    e.target.style.boxShadow = "0 0 0 1px var(--rs-input-border-focus)";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "var(--rs-input-border)";
                    e.target.style.backgroundColor = "var(--rs-input-bg)";
                    e.target.style.boxShadow = "none";
                  }}
                />

                {fromSuggestions.length > 0 && (
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 6px)",
                      left: 0,
                      right: 0,
                      background: "var(--rs-card-bg)",
                      borderRadius: "10px",
                      border: "1px solid var(--rs-border)",
                      boxShadow: "0 10px 25px rgba(15,23,42,0.15)",
                      maxHeight: "220px",
                      overflowY: "auto",
                      zIndex: 50,
                      color: "var(--rs-text-main)",
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
                        onMouseEnter={(e) => (e.target.style.backgroundColor = "var(--rs-surface-2)")}
                        onMouseLeave={(e) => e.target.style.backgroundColor = "transparent"}
                      >
                        {s.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ARROW */}
              <ArrowRight size={18} style={{ color: 'var(--rs-text-muted)', flexShrink: 0, marginTop: -2 }} />

              {/* TO */}
              <div
                style={{
                  position: "relative",
                  width: "220px",
                  flexShrink: 0,
                }}
              >
                <input
                  placeholder="To"
                  autoComplete="off"
                  type="text"
                  value={to}
                  onChange={handleToChange}
                  style={{
                    width: "100%",
                    padding: "0.55rem 1rem",
                    borderRadius: "10px",
                    border: "1px solid var(--rs-input-border)",
                    fontSize: "0.95rem",
                    boxSizing: "border-box",
                    backgroundColor: "var(--rs-input-bg)",
                    color: "var(--rs-input-fg)",
                    transition: "all 0.15s ease",
                  }}
                  onFocus={(e) => {
                    e.target.style.outline = "none";
                    e.target.style.borderColor = "var(--rs-input-border-focus)";
                    e.target.style.backgroundColor = "var(--rs-input-bg-focus)";
                    e.target.style.boxShadow = "0 0 0 1px var(--rs-input-border-focus)";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "var(--rs-input-border)";
                    e.target.style.backgroundColor = "var(--rs-input-bg)";
                    e.target.style.boxShadow = "none";
                  }}
                />

                {toSuggestions.length > 0 && (
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 6px)",
                      left: 0,
                      right: 0,
                      background: "var(--rs-card-bg)",
                      borderRadius: "10px",
                      border: "1px solid var(--rs-border)",
                      boxShadow: "0 10px 25px rgba(15,23,42,0.15)",
                      maxHeight: "220px",
                      overflowY: "auto",
                      zIndex: 50,
                      color: "var(--rs-text-main)",
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
                        onMouseEnter={(e) => (e.target.style.backgroundColor = "var(--rs-surface-2)")}
                        onMouseLeave={(e) => e.target.style.backgroundColor = "transparent"}
                      >
                        {s.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* DATE */}
              <input
                type="date"
                value={travelDate}
                onChange={(e) => setTravelDate(e.target.value)}
                style={{
                  width: "145px",
                  flexShrink: 0,
                  padding: "0.55rem 0.75rem",
                  borderRadius: "10px",
                  border: "1px solid var(--rs-input-border)",
                  fontSize: "0.9rem",
                  boxSizing: "border-box",
                  backgroundColor: "var(--rs-input-bg)",
                  color: "var(--rs-input-fg)",
                  transition: "all 0.15s ease",
                  cursor: "pointer",
                }}
                onFocus={(e) => {
                  e.target.style.outline = "none";
                  e.target.style.borderColor = "var(--rs-input-border-focus)";
                  e.target.style.backgroundColor = "var(--rs-input-bg-focus)";
                  e.target.style.boxShadow = "0 0 0 1px var(--rs-input-border-focus)";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = "var(--rs-input-border)";
                  e.target.style.backgroundColor = "var(--rs-input-bg)";
                  e.target.style.boxShadow = "none";
                }}
              />
            </div>
          </div>

          {/* Actions: search / clear / voice */}
          <div
              style={{
                display: "flex",
                gap: "10px",
                marginTop: "0.75rem",
                flexWrap: "wrap",
              }}
            >
              <button
                onClick={handleSearch}
                disabled={
                  isSearching || !from.trim() || !to.trim() || !travelDate
                }
                style={{
                  background: "#0b2c5d",
                  color: "#fff",
                  borderRadius: 8,
                  padding: "0.5rem 1rem",
                  border: "none",
                  cursor:
                    isSearching || !from.trim() || !to.trim() || !travelDate
                      ? "not-allowed"
                      : "pointer",
                  minWidth: 120,
                }}
              >
                {isSearching ? "Searching..." : "Search"}
              </button>

              <button
                onClick={handleClearSearch}
                style={{
                  background: "var(--rs-surface-2)",
                  color: "var(--rs-text-main)",
                  borderRadius: 8,
                  padding: "0.5rem 1rem",
                  border: "1px solid var(--rs-border)",
                  cursor: "pointer",
                }}
              >
                Clear
              </button>

              <button
                onClick={handleVoiceBook}
                style={{
                  background: "linear-gradient(90deg,#7c3aed,#6ea8fe)",
                  color: "#fff",
                  borderRadius: 8,
                  padding: "0.5rem 1rem",
                  border: "none",
                  cursor: "pointer",
                  opacity: isListening ? 0.8 : 1,
                }}
              >
              {isListening ? "Listening…" : <><Mic size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Voice Book</>}
            </button>
          </div>

            {showSuccessBox && (
              <div
                style={{
                  marginTop: "0.75rem",
                  padding: "0.75rem",
                  borderRadius: "10px",
                  background: "#ecfdf3",
                  border: "1px solid #22c55e40",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "10px",
                  flexWrap: "wrap",
                }}
              >
                <span style={{ fontSize: "0.9rem", color: "#166534" }}>
                  <CheckCircle size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Ticket booked successfully
                  {lastBookedTicketId && ` (ID: ${lastBookedTicketId})`}
                </span>

                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowSuccessBox(false);
                      setLastBookedTicketId(null);
                    }}
                    style={{
                      padding: "0.4rem 0.9rem",
                      borderRadius: "999px",
                      border: "1px solid var(--rs-border)",
                      background: "var(--rs-card-bg)",
                      color: "var(--rs-text-main)",
                      fontSize: "0.85rem",
                      cursor: "pointer",
                    }}
                  >
                    Book another
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (lastBookedTicketId) {
                        navigate(`/tickets?highlight=${lastBookedTicketId}`);
                      } else {
                        navigate("/tickets");
                      }
                    }}
                    style={{
                      padding: "0.4rem 0.9rem",
                      borderRadius: "999px",
                      border: "none",
                      background: "#111827",
                      color: "#ffffff",
                      fontSize: "0.85rem",
                      cursor: "pointer",
                    }}
                  >
                    Show ticket
                  </button>
                </div>
              </div>
            )}

          {searchError && (
            <p style={{ color: "crimson", marginTop: "0.6rem" }}>
              {searchError}
            </p>
          )}

          {loading && <p>Loading trains…</p>}
          {error && <p style={{ color: "red" }}>{error}</p>}

          {!loading && !error && displayTrains.length === 0 && (
            <p>No trains found for the selected route/date.</p>
          )}

          {/* Train list */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {displayTrains.map((train) => (
              <div
                key={train.train_id}
                style={{
                  borderRadius: "12px",
                  border:
                    selectedTrain?.train_id === train.train_id
                      ? "2px solid var(--rs-input-border-focus)"
                      : "1px solid var(--rs-border)",
                  padding: "1rem 1.2rem",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  boxShadow: "0 8px 20px rgba(15,23,42,0.04)",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  background: "var(--rs-card-bg)",
                }}
                onClick={() => setSelectedTrain(train)}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: "1.05rem" }}>
                    {train.train_name}
                  </div>
                  <div style={{ fontSize: "0.9rem", color: "var(--rs-text-muted)" }}>
                    {train.source} → {train.destination}
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "var(--rs-text-muted)" }}>
                    Departure:{" "}
                    {train.departure_time
                      ? new Date(train.departure_time).toLocaleString("en-GB")
                      : "-"}
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div
                    style={{
                      marginBottom: "0.3rem",
                      fontSize: "1.1rem",
                      fontWeight: 600,
                      color: "var(--rs-text-main)",
                    }}
                  >
                    ₹{Number(train.price || 0).toFixed(2)}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenSeatModal(train);
                    }}
                    style={{
                      padding: "0.35rem 0.9rem",
                      borderRadius: "999px",
                      border: "1px solid var(--rs-navy)",
                      background: "var(--rs-navy)",
                      color: "#ffffff",
                      fontSize: "0.8rem",
                      cursor: "pointer",
                    }}
                  >
                    Select Seat
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT: Booking Card */}
        <div
          style={{
            flex: "1 1 35%",
            position: "sticky",
            top: "2rem",
          }}
        >
          <div
            style={{
              background: "var(--rs-card-bg)",
              borderRadius: "16px",
              border: "1px solid var(--rs-border)",
              padding: "1.5rem",
              boxShadow: "0 10px 30px rgba(15,23,42,0.08)",
              overflow: "visible",
            }}
          >
            <h3
              style={{
                fontSize: "1.1rem",
                fontWeight: 600,
                marginBottom: "1rem",
                color: "var(--rs-text-main)",
              }}
            >
              Booking Summary
            </h3>

            <div style={{ marginBottom: "1rem" }}>
              <label
                style={{
                  fontSize: "0.8rem",
                  color: "var(--rs-text-muted)",
                  display: "block",
                  marginBottom: "0.3rem",
                }}
              >
                Selected Train
              </label>
              <input
                type="text"
                readOnly
                value={
                  selectedTrain ? selectedTrain.train_name : "No train selected"
                }
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  borderRadius: "8px",
                  border: "1px solid var(--rs-input-border)",
                  background: "var(--rs-input-readonly-bg)",
                  color: "var(--rs-input-readonly-fg)",
                  fontSize: "0.9rem",
                }}
              />
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <label
                style={{
                  fontSize: "0.8rem",
                  color: "var(--rs-text-muted)",
                  display: "block",
                  marginBottom: "0.3rem",
                }}
              >
                Travel Date
              </label>
              <input
                type="text"
                readOnly
                value={travelDate || "No date selected"}
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  borderRadius: "8px",
                  border: "1px solid var(--rs-input-border)",
                  background: "var(--rs-input-readonly-bg)",
                  color: "var(--rs-input-readonly-fg)",
                  fontSize: "0.9rem",
                }}
              />
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <label
                style={{
                  fontSize: "0.8rem",
                  color: "var(--rs-text-muted)",
                  display: "block",
                  marginBottom: "0.3rem",
                }}
              >
                Selected Seat
              </label>
              <input
                type="text"
                readOnly
                value={selectedSeat || "Click 'Select Seat' button"}
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  borderRadius: "8px",
                  border: "1px solid var(--rs-input-border)",
                  background: selectedSeat ? "#f0fdf4" : "var(--rs-input-readonly-bg)",
                  fontSize: "0.9rem",
                  fontWeight: selectedSeat ? 600 : 400,
                  color: selectedSeat ? "#15803d" : "var(--rs-input-readonly-fg)",
                }}
              />
            </div>

            {selectedTrain && (
              <div
                style={{
                  marginBottom: "1rem",
                  padding: "0.75rem",
                  background: "var(--rs-surface-2)",
                  borderRadius: "8px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "0.85rem",
                    color: "var(--rs-text-muted)",
                    marginBottom: "0.3rem",
                  }}
                >
                  <span>Route:</span>
                  <span style={{ fontWeight: 500, color: "var(--rs-text-main)" }}>
                    {selectedTrain.source} → {selectedTrain.destination}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "0.95rem",
                    fontWeight: 600,
                    color: "var(--rs-text-main)",
                  }}
                >
                  <span>Total Fare:</span>
                  <span>₹{Number(selectedTrain.price || 0).toFixed(2)}</span>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={handleBookTicket}
              disabled={!selectedTrain || !travelDate || !selectedSeat}
              style={{
                width: "100%",
                padding: "0.75rem",
                borderRadius: "10px",
                border: "none",
                background:
                  selectedTrain && travelDate && selectedSeat
                    ? "var(--rs-navy)"
                    : "var(--rs-border)",
                color: "#ffffff",
                fontSize: "0.95rem",
                fontWeight: 600,
                cursor:
                  selectedTrain && travelDate && selectedSeat
                    ? "pointer"
                    : "not-allowed",
                transition: "all 0.2s",
              }}
            >
              {selectedTrain && travelDate && selectedSeat
                ? "Book Ticket"
                : "Complete Selection"}
            </button>
          </div>
        </div>
      </div>

      {/* Seat selection modal */}
      {isSeatModalOpen && selectedTrain && (
        <SeatMap
          trainId={selectedTrain.train_id}
          travelDate={travelDate}
          selectedSeat={selectedSeat}
          onSelect={handleSeatSelected}
          onClose={() => setSeatModalOpen(false)}
        />
      )}
    </div>
  );
}
