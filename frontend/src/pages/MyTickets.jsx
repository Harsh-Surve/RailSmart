import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FaCalendarAlt, FaClock, FaCreditCard, FaRupeeSign, FaTicketAlt, FaTrain } from "react-icons/fa";
import { useToast } from "../components/ToastProvider";
import ConfirmDialog from "../components/ConfirmDialog";

// NOTE: Ticket status is now computed by the backend (Single Source of Truth)
// Frontend simply uses: ticket.computed_status, ticket.can_track, ticket.can_cancel, ticket.can_download

const API_BASE_URL = "http://localhost:5000";
const VITE_RAZORPAY_KEY_ID = import.meta.env.VITE_RAZORPAY_KEY_ID;

function MyTickets() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cancellingId, setCancellingId] = useState(null);
  const [payingTicketId, setPayingTicketId] = useState(null);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [ticketToCancel, setTicketToCancel] = useState(null);
  const [highlightId, setHighlightId] = useState(null);
  const [expandedTickets, setExpandedTickets] = useState(() => new Set());
  const location = useLocation();

  // Utility removed (unused): const sleep = useCallback((ms) => new Promise((r) => setTimeout(r, ms)), []);

  const loadRazorpay = useCallback(() => {
    return new Promise((resolve) => {
      if (window.Razorpay) return resolve(true);
      const existing = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
      if (existing) {
        existing.addEventListener("load", () => resolve(true));
        existing.addEventListener("error", () => resolve(false));
        return;
      }
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  }, []);

  // Avoid TDZ issues: some callbacks need to call fetchTickets which is declared later.
  const fetchTicketsRef = useRef(null);

  const startRazorpayPaymentForTicket = useCallback(
    async ({ ticket, email }) => {
      try {
        showToast("info", "Opening payment gateway...");

        const ok = await loadRazorpay();
        if (!ok) {
          showToast("error", "Failed to load payment gateway.");
          setPayingTicketId(null);
          return;
        }

        const keyRes = await fetch(`${API_BASE_URL}/api/payment/key`);
        const keyJson = await keyRes.json().catch(() => ({}));
        const razorpayKeyId = keyJson?.keyId || VITE_RAZORPAY_KEY_ID;
        if (!razorpayKeyId) {
          showToast("error", "Razorpay is not configured. Real payment only.");
          setPayingTicketId(null);
          return;
        }

        const orderRes = await fetch(`${API_BASE_URL}/api/payment/create-order`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticketId: ticket.ticket_id }),
        });
        const order = await orderRes.json().catch(() => null);
        if (!orderRes.ok || !order?.orderId) {
          showToast("error", order?.error || "Failed to create payment order.");
          setPayingTicketId(null);
          return;
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
            ondismiss: () => {
              showToast("info", "Payment not completed.");
              setPayingTicketId(null);
            },
          },
          handler: async function (response) {
            try {
              const verifyRes = await fetch(`${API_BASE_URL}/api/payment/verify`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  ticketId: ticket.ticket_id,
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
              await fetchTicketsRef.current?.();

              const updateObj = { ts: Date.now(), ticketId: ticket.ticket_id, action: "pay" };
              try {
                localStorage.setItem("rs_tickets_update", JSON.stringify(updateObj));
              } catch {
                // ignore
              }
              window.dispatchEvent(new CustomEvent("rs_tickets_updated", { detail: updateObj }));
            } finally {
              setPayingTicketId(null);
            }
          },
        };

        const rzp = new window.Razorpay(options);
        rzp.on("payment.failed", () => {
          showToast("error", "Payment failed. Please try again.");
          setPayingTicketId(null);
        });
        rzp.open();
      } catch (err) {
        console.error("Pay Now error:", err);
        showToast("error", "Server error while initiating payment.");
        setPayingTicketId(null);
      }
    },
    [loadRazorpay, showToast]
  );

  // refs to control behavior & avoid repeated handling
  const fetchControllerRef = useRef(null);
  const lastStorageValueRef = useRef(null);
  const mountedRef = useRef(false);

  const getUserEmail = () => {
    const storedUser = JSON.parse(localStorage.getItem("user") || "null");
    return storedUser?.email || localStorage.getItem("userEmail") || null;
  };

  // Robust fetch with abort support
  const fetchTickets = useCallback(async () => {
    // abort previous
    if (fetchControllerRef.current) {
      fetchControllerRef.current.abort();
    }
    const controller = new AbortController();
    fetchControllerRef.current = controller;

    try {
      setLoading(true);
      setError("");

      const email = getUserEmail();
      if (!email) {
        setError("You must be logged in to view your tickets.");
        setTickets([]);
        setLoading(false);
        return;
      }

      const url = `${API_BASE_URL}/api/my-tickets?email=${encodeURIComponent(
        email
      )}`;

      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Server error: ${res.status} ${txt}`);
      }

      const data = await res.json();
      // backend might return array or { tickets: [] }
      const arr = Array.isArray(data) ? data : data?.tickets || [];
      setTickets(arr);
    } catch (err) {
      if (err.name === "AbortError") {
        // expected when aborting previous fetch
        console.debug("fetchTickets aborted");
      } else {
        console.error("Error fetching tickets:", err);
        setError("Unable to load tickets. Please try again.");
      }
    } finally {
      // avoid hiding loading if component unmounted quickly
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  // Keep latest function available to earlier callbacks.
  fetchTicketsRef.current = fetchTickets;

  // Cancellation flow
  const openCancelModal = (ticket) => {
    setTicketToCancel(ticket);
    setCancelModalOpen(true);
  };
  const closeCancelModal = () => {
    setCancelModalOpen(false);
    setTicketToCancel(null);
  };

  const actuallyCancelTicket = async (ticketId) => {
    setCancellingId(ticketId);
    setError("");

    try {
      const email = getUserEmail();

      const res = await fetch(
        `${API_BASE_URL}/api/tickets/${encodeURIComponent(ticketId)}/cancel`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...(email ? { "x-user-email": email } : {}),
          },
        }
      );

      // parse body safely
      let data = null;
      try {
        data = await res.json();
      } catch (err) {
        console.debug("No JSON response", err);
        data = { message: "No JSON response" };
      }

      if (!res.ok) {
        const message = data?.error || data?.message || "Failed to cancel";
        showToast("error", message);
        return false;
      }

      // optimistic update
      setTickets((prev) =>
        prev.map((t) =>
          t.ticket_id === ticketId ? { ...t, status: "CANCELLED" } : t
        )
      );

      // notify other tabs/pages
      const updateObj = { ts: Date.now(), ticketId, action: "cancel" };
      try {
        localStorage.setItem("rs_tickets_update", JSON.stringify(updateObj));
      } catch (e) {
        console.warn("localStorage write failed", e);
      }
      // also dispatch custom event for same-tab listeners
      window.dispatchEvent(
        new CustomEvent("rs_tickets_updated", { detail: updateObj })
      );

      showToast("success", "Ticket cancelled successfully.");
      return true;
    } catch (err) {
      console.error("Cancel error:", err);
      showToast("error", "Server error while cancelling ticket.");
      return false;
    } finally {
      setCancellingId(null);
    }
  };

  // initial mount
  useEffect(() => {
    mountedRef.current = true;
    fetchTickets();

    // handler for custom events (same tab)
    const onCustomUpdate = (e) => {
      const payload = e?.detail;
      // ignore if same payload as last handled
      if (
        payload &&
        lastStorageValueRef.current &&
        lastStorageValueRef.current.ts === payload.ts
      ) {
        return;
      }
      lastStorageValueRef.current = payload;
      // refresh
      fetchTickets();
    };

    const onStorage = (e) => {
      if (e.key !== "rs_tickets_update") return;
      try {
        const obj = JSON.parse(e.newValue);
        if (
          lastStorageValueRef.current &&
          lastStorageValueRef.current.ts === obj.ts
        ) {
          return;
        }
        lastStorageValueRef.current = obj;
      } catch {
        lastStorageValueRef.current = { ts: Date.now() };
      }
      fetchTickets();
    };

    // event fired when user books in same tab (you already had this)
    const onTicketBooked = () => {
      fetchTickets();
    };

    window.addEventListener("rs_tickets_updated", onCustomUpdate);
    window.addEventListener("storage", onStorage);
    window.addEventListener("ticketBooked", onTicketBooked);

    return () => {
      mountedRef.current = false;
      if (fetchControllerRef.current) fetchControllerRef.current.abort();
      window.removeEventListener("rs_tickets_updated", onCustomUpdate);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("ticketBooked", onTicketBooked);
    };
    // empty deps -> run once on mount/unmount
  }, [fetchTickets]);

  // highlight via URL param
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const id = params.get("highlight");
    setHighlightId(id ? Number(id) : null);
  }, [location.search]);

  useEffect(() => {
    if (!highlightId) return;
    const el = document.getElementById(`ticket-${highlightId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    const t = setTimeout(() => setHighlightId(null), 3500);
    return () => clearTimeout(t);
  }, [highlightId]);

  const upcoming = [];
  const running = [];
  const past = [];
  const cancelled = [];

  /**
   * Get ticket status from backend-computed fields
   * Backend is the Single Source of Truth - no date/time logic here!
   * 
   * Backend returns:
   * - computed_status: "UPCOMING" | "RUNNING" | "COMPLETED" | "CANCELLED"
   * - can_track: boolean
   * - can_cancel: boolean  
   * - can_download: boolean
   * - status_message: string
   */
  const getTicketStatus = (ticket) => ({
    status: ticket.computed_status || ticket.status || "UPCOMING",
    canTrack: ticket.can_track ?? true,
    canCancel: ticket.can_cancel ?? true,
    canDownload: ticket.can_download ?? true,
    message: ticket.status_message || ""
  });

  tickets.forEach((t) => {
    const statusInfo = getTicketStatus(t);
    // Attach status info to ticket for use in rendering
    t._statusInfo = statusInfo;
    
    if (statusInfo.status === "CANCELLED") cancelled.push(t);
    else if (statusInfo.status === "UPCOMING") upcoming.push(t);
    else if (statusInfo.status === "RUNNING") running.push(t);
    else past.push(t);
  });

  const totalTickets = tickets.length;
  const upcomingCount = upcoming.length;
  const firstUpcoming = upcoming[0] || null;
  const totalPaid = tickets.reduce((sum, t) => {
    const paid = String(t?.payment_status || "").toUpperCase() === "PAID";
    return paid ? sum + (Number(t?.price) || 0) : sum;
  }, 0);

  const toggleExpanded = (ticketId) => {
    setExpandedTickets((prev) => {
      const next = new Set(prev);
      if (next.has(ticketId)) next.delete(ticketId);
      else next.add(ticketId);
      return next;
    });
  };

  const StatusBadge = ({ status }) => {
    if (status === "CANCELLED")
      return (
        <span className="rs-badge rs-badge--danger">CANCELLED</span>
      );
    if (status === "UPCOMING")
      return (
        <span className="rs-badge rs-badge--success">🎫 UPCOMING</span>
      );
    if (status === "RUNNING")
      return (
        <span className="rs-badge" style={{ backgroundColor: "#f59e0b", color: "white" }}>🚂 RUNNING</span>
      );
    return <span className="rs-badge rs-badge--muted">✅ COMPLETED</span>;
  };

  const PaymentBadge = ({ ticket }) => {
    const raw = ticket?.payment_status;
    if (!raw) return null;
    const s = String(raw).toUpperCase();
    if (s === "PAID") return <span className="rs-badge rs-badge--success">PAID</span>;
    if (s === "FAILED") return <span className="rs-badge rs-badge--danger">PAYMENT FAILED</span>;
    return <span className="rs-badge rs-badge--muted">PAYMENT PENDING</span>;
  };

  const canDownloadPdf = (ticket) => {
    const status = String(ticket?.status || "").toUpperCase();
    if (status === "CANCELLED") return false;
    const pay = ticket?.payment_status;
    if (pay == null) return true; // backward compatibility
    return String(pay).toUpperCase() === "PAID";
  };

  const handlePayNow = async (ticket) => {
    console.log("PAY NOW CLICKED", ticket);
    setPayingTicketId(ticket?.ticket_id ?? null);
    const email = getUserEmail();
    if (!email) {
      showToast("error", "Please login to make payment.");
      setPayingTicketId(null);
      return;
    }

    if (String(ticket?.status || "").toUpperCase() === "CANCELLED") {
      showToast("info", "This ticket is cancelled.");
      setPayingTicketId(null);
      return;
    }

    try {
      await startRazorpayPaymentForTicket({ ticket, email });
    } catch (err) {
      console.error("Payment start error:", err);
      showToast("error", err?.message || "Failed to start payment");
      setPayingTicketId(null);
    }
  };

  const renderTicketCard = (t) => {
    // Use pre-computed status info or compute fresh
    const statusInfo = t._statusInfo || getTicketStatus(t);
    const status = statusInfo.status;
    const { canTrack, canCancel, canDownload } = statusInfo;
    const isHighlighted = highlightId === t.ticket_id;
    const isExpanded = expandedTickets.has(t.ticket_id);

    return (
      <div
        key={t.ticket_id}
        id={`ticket-${t.ticket_id}`}
        className={`rs-ticket-card ${isHighlighted ? "rs-ticket-card--highlight" : ""} ${isExpanded ? "rs-ticket-card--expanded" : ""}`}
        style={{
          display: "flex",
          gap: "1rem",
          alignItems: "flex-start",
        }}
        onClick={() => toggleExpanded(t.ticket_id)}
      >
        <div style={{ flex: 1 }}>
          <div className="rs-ticket-main">
            <div className="rs-ticket-header">
              <div className="rs-ticket-train">
                <span className="rs-ticket-train-icon"><FaTrain /></span>
                <span className="rs-ticket-title">{t.train_name}</span>
                <div className="rs-ticket-badges">
                  <StatusBadge status={status} />
                  <PaymentBadge ticket={t} />
                </div>
                {/* Status message for context */}
                {statusInfo.message && status !== "UPCOMING" && (
                  <span className="rs-ticket-status-msg" style={{ fontSize: "0.75rem", color: "#6b7280", marginLeft: "0.5rem" }}>
                    {statusInfo.message}
                  </span>
                )}
              </div>
              <span className="rs-ticket-tag">{t.source} → {t.destination}</span>
            </div>

            <div className="rs-ticket-meta-row">
              <span className="rs-ticket-chip"><FaCalendarAlt size={11} />{" "}{t.travel_date ? new Date(t.travel_date).toLocaleDateString("en-GB") : "-"}</span>
              <span className="rs-ticket-chip"><FaClock size={11} />{" "}{t.booking_date ? new Date(t.booking_date).toLocaleString("en-GB") : "-"}</span>
              <span className="rs-ticket-chip rs-ticket-chip--seat">Seat {t.seat_no}</span>
            </div>

            <div className="rs-ticket-meta-row rs-ticket-meta-row--bottom">
              <span className="rs-ticket-fare"><FaRupeeSign size={11} /> {Number(t.price).toFixed(2)}</span>
            </div>

            {isExpanded && (
              <div className="rs-ticket-extra">
                <div>PNR: {t?.pnr || "—"}</div>
                <div>Payment ID: {t?.payment_id || "—"}</div>
              </div>
            )}
          </div>

          <div className="rs-ticket-actions">
            {t.payment_status && String(t.payment_status).toUpperCase() !== "PAID" &&
              String(t.status || "").toUpperCase() !== "CANCELLED" && (
              <button
                type="button"
                className="rs-btn-primary"
                disabled={payingTicketId === t.ticket_id}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handlePayNow(t);
                }}
              >
                {payingTicketId === t.ticket_id ? (
                  <>
                    <span className="rs-inline-spinner" aria-hidden="true" />
                    Processing...
                  </>
                ) : (
                  "Pay Now"
                )}
              </button>
            )}

            {/* Track Train - Enabled for UPCOMING and RUNNING only */}
            <button
              type="button"
              className="rs-btn-outline rs-btn-outline--small"
              disabled={!canTrack}
              title={!canTrack ? "Journey completed. Tracking unavailable." : "Track your train live"}
              style={{ opacity: canTrack ? 1 : 0.5, cursor: canTrack ? "pointer" : "not-allowed" }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!canTrack) {
                  showToast("info", "Journey completed. Tracking unavailable.");
                  return;
                }
                navigate(`/track?trainId=${t.train_id}`);
              }}
            >
              {canTrack ? "Track Train" : "Tracking Ended"}
            </button>

            {/* Download PDF - Always enabled for records (except cancelled) */}
            <button
              type="button"
              className="rs-btn-outline rs-btn-outline--small"
              disabled={!canDownload}
              style={{ opacity: canDownload ? 1 : 0.5 }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();

                if (!canDownload) {
                  showToast("info", "PDF not available for cancelled tickets.");
                  return;
                }
                if (!canDownloadPdf(t)) {
                  showToast("info", "Complete payment to download PDF.");
                  return;
                }
                const url = `${API_BASE_URL}/api/tickets/${t.ticket_id}/pdf?t=${Date.now()}`;
                window.open(url, "_blank", "noopener");
              }}
            >
              Download PDF
            </button>

            {/* Cancel Ticket - Only allowed for UPCOMING status */}
            <button
              type="button"
              className="rs-btn-outline rs-btn-outline--small rs-btn-outline--danger"
              title={!canCancel && status !== "CANCELLED" ? "Cancellation not available after train departure" : ""}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!canCancel) {
                  if (status === "RUNNING") {
                    showToast("info", "Cannot cancel. Train is currently running.");
                  } else if (status === "COMPLETED") {
                    showToast("info", "Cannot cancel. Journey already completed.");
                  }
                  return;
                }
                openCancelModal(t);
              }}
              disabled={cancellingId === t.ticket_id || !canCancel}
              style={{ opacity: canCancel ? 1 : 0.5, cursor: canCancel ? "pointer" : "not-allowed" }}
            >
              {status === "CANCELLED" ? "Cancelled" : 
               status === "RUNNING" ? "In Transit" :
               status === "COMPLETED" ? "Journey Done" :
               cancellingId === t.ticket_id ? "Cancelling…" : "Cancel Ticket"}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="rs-page">
      <ConfirmDialog
        open={cancelModalOpen && !!ticketToCancel}
        title="Cancel ticket"
        message={
          ticketToCancel
            ? `Are you sure you want to cancel ticket #${ticketToCancel.ticket_id}?`
            : ""
        }
        confirmLabel="Yes, cancel ticket"
        cancelLabel="Keep ticket"
        loading={cancellingId === ticketToCancel?.ticket_id}
        onCancel={() => {
          if (cancellingId) return;
          closeCancelModal();
        }}
        onConfirm={async () => {
          if (!ticketToCancel) return;
          const ok = await actuallyCancelTicket(ticketToCancel.ticket_id);
          if (ok) closeCancelModal();
        }}
      />

      <div style={{ marginBottom: "1.5rem" }}>
        <h1 className="rs-page-title">My Tickets</h1>
        <p className="rs-card-subtitle">View your upcoming and past RailSmart journeys</p>
      </div>

      <div className="dashboard-summary">
        <div className="summary-card">
          <div className="summary-icon" aria-hidden="true">
            <FaTicketAlt size={22} />
          </div>
          <div>
            <span>Total Tickets</span>
            <strong>{totalTickets}</strong>
          </div>
        </div>
        <div className="summary-card">
          <div className="summary-icon" aria-hidden="true">
            <FaCalendarAlt size={22} />
          </div>
          <div>
            <span>Upcoming Journeys</span>
            <strong>{upcomingCount}</strong>
          </div>
        </div>
        <div className="summary-card highlight">
          <div className="summary-icon" aria-hidden="true">
            <FaCreditCard size={22} />
          </div>
          <div>
            <span>Total Paid</span>
            <strong>₹ {totalPaid.toFixed(2)}</strong>
            <div className="summary-trend" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
          </div>
        </div>
      </div>

      <div className="rs-card rs-card--compact">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <div>
            <h2 className="rs-card-title">Booked Tickets</h2>
            <p className="rs-card-subtitle">View your upcoming and past RailSmart journeys.</p>
          </div>

          <button
            onClick={fetchTickets}
            disabled={loading}
            className="rs-btn"
          >
            {loading ? "Refreshing..." : "🔄 Refresh"}
          </button>
        </div>

        {loading && <p className="rs-helper-text">Loading tickets…</p>}
        {error && <p className="rs-error-text">{error}</p>}

        {!loading && !error && tickets.length === 0 && (
          <div>
            <p className="rs-helper-text">
              You have no tickets yet. Book a train from the Trains & Booking page.
            </p>
          </div>
        )}

        {!loading && !error && tickets.length > 0 && (
          <div className="rs-tickets-sections">
            {/* Running Journeys - Currently in transit */}
            {running.length > 0 && (
              <section className="rs-tickets-section">
                <div className="rs-section-header">
                  <h3>🚂 Currently Running</h3>
                  <span className="rs-section-badge" style={{ backgroundColor: "#f59e0b" }}>{running.length}</span>
                </div>
                <div className="rs-tickets-list">
                  {running.map((t) => renderTicketCard(t))}
                </div>
              </section>
            )}
            
            {/* Upcoming Journeys */}
            {upcoming.length > 0 && (
              <section className="rs-tickets-section">
                <div className="rs-section-header">
                  <h3>🎫 Upcoming Journeys</h3>
                  <span className="rs-section-badge">{upcoming.length}</span>
                </div>
                <div className="rs-tickets-list">
                  {upcoming.map((t) => renderTicketCard(t))}
                </div>
              </section>
            )}
            
            {/* Completed Journeys */}
            {past.length > 0 && (
              <section className="rs-tickets-section">
                <div className="rs-section-header">
                  <h3>✅ Completed Journeys</h3>
                  <span className="rs-section-badge rs-section-badge--muted">{past.length}</span>
                </div>
                <div className="rs-tickets-list">
                  {past.map((t) => renderTicketCard(t))}
                </div>
              </section>
            )}
            
            {/* Cancelled Tickets */}
            {cancelled.length > 0 && (
              <section className="rs-tickets-section">
                <div className="rs-section-header">
                  <h3>❌ Cancelled Tickets</h3>
                  <span className="rs-section-badge rs-section-badge--danger">{cancelled.length}</span>
                </div>
                <div className="rs-tickets-list">
                  {cancelled.map((t) => renderTicketCard(t))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {firstUpcoming ? (
        <div className="mobile-track-bar">
          <button
            type="button"
            onClick={() => navigate(`/track?trainId=${firstUpcoming.train_id}`)}
          >
            🚆 Track Train
          </button>
        </div>
      ) : null}

    </div>
  );
}

export default MyTickets;
