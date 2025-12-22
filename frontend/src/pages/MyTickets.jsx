import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FaCalendarAlt, FaClock, FaRupeeSign, FaTrain } from "react-icons/fa";
import { useToast } from "../components/ToastProvider";
import TicketPreviewThumbnail, { TicketPreviewModal } from "../components/TicketPreviewThumbnail";
import ConfirmDialog from "../components/ConfirmDialog";

const API_BASE_URL = "http://localhost:5000";

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
  const [previewTicketId, setPreviewTicketId] = useState(null);
  const location = useLocation();

  const sleep = useCallback((ms) => new Promise((r) => setTimeout(r, ms)), []);

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
  const past = [];
  const cancelled = [];

  const getTicketStatus = (ticket) => {
    if ((ticket.status || "").toUpperCase() === "CANCELLED") return "CANCELLED";
    if (!ticket.travel_date) return "COMPLETED";
    const travel = new Date(ticket.travel_date);
    // compare date-only
    const today = new Date(new Date().toDateString());
    const travelDay = new Date(travel.toDateString());
    if (travelDay >= today) return "UPCOMING";
    return "COMPLETED";
  };

  tickets.forEach((t) => {
    const status = getTicketStatus(t);
    if (status === "CANCELLED") cancelled.push(t);
    else if (status === "UPCOMING") upcoming.push(t);
    else past.push(t);
  });

  const StatusBadge = ({ status }) => {
    if (status === "CANCELLED")
      return (
        <span className="rs-badge rs-badge--danger">CANCELLED</span>
      );
    if (status === "UPCOMING")
      return (
        <span className="rs-badge rs-badge--success">UPCOMING</span>
      );
    return <span className="rs-badge rs-badge--muted">COMPLETED</span>;
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
    try {
      console.log("PAY NOW CLICKED", ticket);
      showToast("info", "Opening payment gateway...");
      setPayingTicketId(ticket?.ticket_id ?? null);
      const email = getUserEmail();
      if (!email) {
        showToast("error", "Please login to make payment.");
        return;
      }

      if (String(ticket?.status || "").toUpperCase() === "CANCELLED") {
        showToast("info", "This ticket is cancelled.");
        return;
      }

      const ok = await loadRazorpay();
      if (!ok) {
        showToast("error", "Failed to load payment gateway.");
        return;
      }

      const keyRes = await fetch(`${API_BASE_URL}/api/payment/key`);
      const keyJson = await keyRes.json().catch(() => ({}));
      console.log("payment/key", keyRes.status, keyJson);
      if (!keyRes.ok || !keyJson?.keyId) {
        // Demo fallback: simulated payment (college-friendly)
        showToast("info", "Razorpay not configured. Using demo payment...");

        // Simulate gateway processing time
        await sleep(1800);

        const simRes = await fetch(`${API_BASE_URL}/api/payment/simulate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticketId: ticket.ticket_id }),
        });
        const simJson = await simRes.json().catch(() => ({}));
        console.log("payment/simulate", simRes.status, simJson);
        if (!simRes.ok || !simJson?.success) {
          showToast("error", simJson?.error || "Demo payment failed.");
          return;
        }
        showToast("success", "Demo payment successful! Ticket confirmed.");

        // Instant UI update (optimistic), then refresh from server
        setTickets((prev) =>
          prev.map((t) =>
            t.ticket_id === ticket.ticket_id
              ? { ...t, payment_status: "PAID", status: "CONFIRMED", payment_id: simJson?.ticket?.payment_id || t.payment_id }
              : t
          )
        );

        await fetchTickets();
        return;
      }

      const orderRes = await fetch(`${API_BASE_URL}/api/payment/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId: ticket.ticket_id }),
      });
      const order = await orderRes.json().catch(() => null);
      console.log("payment/create-order", orderRes.status, order);
      if (!orderRes.ok || !order?.orderId) {
        showToast("error", order?.error || "Failed to create payment order.");
        return;
      }

      const options = {
        key: keyJson.keyId,
        amount: order.amount,
        currency: order.currency,
        name: "RailSmart",
        description: "Train Ticket Payment",
        order_id: order.orderId,
        prefill: {
          email,
        },
        modal: {
          ondismiss: () => {
            showToast("info", "Payment not completed.");
          },
        },
        handler: async function (response) {
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
          await fetchTickets();

          const updateObj = { ts: Date.now(), ticketId: ticket.ticket_id, action: "pay" };
          try {
            localStorage.setItem("rs_tickets_update", JSON.stringify(updateObj));
          } catch {
            // ignore
          }
          window.dispatchEvent(
            new CustomEvent("rs_tickets_updated", { detail: updateObj })
          );
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", () => {
        showToast("error", "Payment failed. Please try again.");
      });
      rzp.open();
    } catch (err) {
      console.error("Pay Now error:", err);
      showToast("error", "Server error while initiating payment.");
    } finally {
      setPayingTicketId(null);
    }
  };

  const handleOpenPreview = (t) => {
    if ((t.status || "").toUpperCase() === "CANCELLED") {
      showToast("info", "This ticket is cancelled — no preview available.");
      return;
    }
    setPreviewTicketId(t.ticket_id);
  };

  const renderTicketCard = (t) => {
    const status = getTicketStatus(t);
    const isHighlighted = highlightId === t.ticket_id;

    return (
      <div
        key={t.ticket_id}
        id={`ticket-${t.ticket_id}`}
        className={`rs-ticket-card ${isHighlighted ? "rs-ticket-card--highlight" : ""}`}
        style={{
          display: "flex",
          gap: "1rem",
          alignItems: "flex-start",
        }}
      >
        <div style={{ flexShrink: 0 }}>
          <TicketPreviewThumbnail
            ticketId={t.ticket_id}
            size={140}
            onOpen={() => handleOpenPreview(t)}
            // defensive: thumbnail component should handle its own image errors
          />
        </div>

        <div style={{ flex: 1 }}>
          <div className="rs-ticket-main">
            <div className="rs-ticket-header">
              <div className="rs-ticket-train">
                <span className="rs-ticket-train-icon"><FaTrain /></span>
                <span className="rs-ticket-title">{t.train_name}</span>
                <StatusBadge status={status} />
                <PaymentBadge ticket={t} />
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

            <button
              type="button"
              className="rs-btn-outline rs-btn-outline--small"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                navigate(`/track?trainId=${t.train_id}`);
              }}
            >
              Track Train
            </button>

            <button
              type="button"
              className="rs-btn-outline rs-btn-outline--small"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();

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

            <button
              type="button"
              className="rs-btn-outline rs-btn-outline--small rs-btn-outline--danger"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (status !== "UPCOMING") return;
                openCancelModal(t);
              }}
              disabled={
                cancellingId === t.ticket_id ||
                status === "CANCELLED" ||
                status === "COMPLETED"
              }
            >
              {status === "CANCELLED" ? "Cancelled" : cancellingId === t.ticket_id ? "Cancelling…" : "Cancel Ticket"}
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
            {upcoming.length > 0 && (
              <section className="rs-tickets-section">
                <div className="rs-section-header">
                  <h3>Upcoming journeys</h3>
                  <span className="rs-section-badge">{upcoming.length}</span>
                </div>
                <div className="rs-tickets-list">
                  {upcoming.map((t) => renderTicketCard(t))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {previewTicketId && (
        <TicketPreviewModal
          ticketId={previewTicketId}
          open={true}
          onClose={() => setPreviewTicketId(null)}
        />
      )}
    </div>
  );
}

export default MyTickets;
