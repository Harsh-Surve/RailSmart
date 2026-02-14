import React, { useEffect, useState } from "react";
import ConfirmDialog from "../components/ConfirmDialog";
import AnimatedCounter from "../components/AnimatedCounter";
import { LayoutDashboard, IndianRupee, Ticket, Train, Clock, TimerOff, XCircle, CalendarDays, Armchair, TicketCheck, ArrowRight, X } from "lucide-react";
import "../styles/dashboard.css";

const API_BASE_URL = "http://localhost:5000";

export default function AdminDashboard() {
  const [overview, setOverview] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isCancellingId, setIsCancellingId] = useState(null);
  const [cancelDialog, setCancelDialog] = useState({ open: false, ticket: null });

  const fetchData = async () => {
    try {
      setLoading(true);
      setError("");

      // Get user email for admin verification
      const userStr = localStorage.getItem("user");
      const user = userStr ? JSON.parse(userStr) : null;
      const headers = {
        "Content-Type": "application/json",
      };
      if (user?.email) {
        headers["x-user-email"] = user.email;
      }

      const [overviewRes, bookingsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/admin/overview`, { headers }),
        fetch(`${API_BASE_URL}/api/admin/bookings`, { headers }),
      ]);

      if (!overviewRes.ok) {
        throw new Error("Failed to load overview");
      }
      if (!bookingsRes.ok) {
        throw new Error("Failed to load bookings");
      }

      const overviewData = await overviewRes.json();
      const bookingsData = await bookingsRes.json();

      // Transform the new API structure to match component expectations
      const transformedOverview = {
        totalRevenue: overviewData.summary?.total_revenue || 0,
        totalBookings: overviewData.summary?.total_bookings || 0,
        todayRevenue: overviewData.summary?.today_revenue || 0,
        mostBookedTrain: overviewData.mostBookedTrain,
        topTrains: overviewData.mostBookedTrain ? [overviewData.mostBookedTrain] : [],
        seatOccupancy: overviewData.topOccupancy || [],
        revenueByDate: overviewData.revenueByDate || [],
        intentStats: overviewData.intentStats || { pending: 0, expired: 0, failed: 0 },
      };

      setOverview(transformedOverview);
      setBookings(bookingsData || []);
    } catch (err) {
      console.error("Admin dashboard error:", err);
      setError(err.message || "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== "rs_tickets_update") return;
      fetchData();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const confirmCancelTicket = async (ticketId) => {
    try {
      setIsCancellingId(ticketId);

      // Get user email for admin verification
      const userStr = localStorage.getItem("user");
      const user = userStr ? JSON.parse(userStr) : null;
      const headers = {
        "Content-Type": "application/json",
      };
      if (user?.email) {
        headers["x-user-email"] = user.email;
      }

      const res = await fetch(
        `${API_BASE_URL}/api/tickets/${ticketId}/cancel`,
        {
          method: "PATCH",
          headers,
        }
      );

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to cancel ticket");
      }

      // Optimistically update the UI so the table reflects the cancel immediately
      setBookings((prev) =>
        prev.map((b) => (b.ticket_id === ticketId ? { ...b, status: "CANCELLED" } : b))
      );

      // Re-load all admin stats so revenue & occupancy update
      fetchData();
    } catch (err) {
      console.error("Admin cancel error:", err);
      alert(err.message || "Failed to cancel ticket");
    } finally {
      setIsCancellingId(null);
    }
  };

  const formatCurrency = (n) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    }).format(Number(n || 0));

  return (
    <>
      <ConfirmDialog
        open={cancelDialog.open}
        title="Cancel ticket"
        message={
          cancelDialog.ticket
            ? `Are you sure you want to cancel ticket #${cancelDialog.ticket.ticket_id}?`
            : ""
        }
        confirmLabel="Yes, cancel ticket"
        cancelLabel="Keep ticket"
        onCancel={() => setCancelDialog({ open: false, ticket: null })}
        onConfirm={async () => {
          if (!cancelDialog.ticket) return;
          await confirmCancelTicket(cancelDialog.ticket.ticket_id);
          setCancelDialog({ open: false, ticket: null });
        }}
      />

      <div className="dashboard-container">
        <h1 className="dashboard-title"><LayoutDashboard size={28} style={{ verticalAlign: 'middle', marginRight: 8 }} /> User Dashboard</h1>
        <p className="dashboard-subtitle">
          Overview of your RailSmart bookings, spend, and travel analytics
        </p>

        {loading && !overview && (
          <>
            {/* Summary card skeletons - only show on first load */}
            <div className="dashboard-grid">
              {[1, 2, 3].map((i) => (
                <div key={i} className="skeleton-card">
                  <div className="skeleton" style={{ height: 14, width: "50%", marginBottom: 6 }} />
                  <div className="skeleton" style={{ height: 28, width: "70%", marginBottom: 6 }} />
                  <div className="skeleton" style={{ height: 12, width: "40%" }} />
                </div>
              ))}
            </div>

            {/* Table skeleton */}
            <div className="skeleton-card" style={{ marginBottom: "1.5rem" }}>
              <div className="skeleton" style={{ height: 18, width: "30%", marginBottom: 12 }} />
              <div className="skeleton" style={{ height: 200, width: "100%" }} />
            </div>
          </>
        )}

        {/* Error as banner — never hides existing data */}
        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "0.75rem 1rem", marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ flex: 1, color: "#b91c1c" }}>{error}</span>
            <button onClick={() => setError("")} style={{ background: "none", border: "none", cursor: "pointer", color: "#b91c1c", display: "flex" }}><X size={18} /></button>
          </div>
        )}

        {!loading && !overview && !error && (
          <p className="error-text">Unable to load dashboard data. Please check if the backend server is running and refresh.</p>
        )}

        {overview && (
          <div className="fade-in">
            {/* Top summary cards */}
            <div className="dashboard-grid">
              <SummaryCard
                title={<><IndianRupee size={16} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Total Amount Spent</>}
                value={
                  <AnimatedCounter
                    value={overview.totalRevenue}
                    prefix="₹"
                    formatter={(n) =>
                      new Intl.NumberFormat("en-IN", {
                        maximumFractionDigits: 2,
                      }).format(n)
                    }
                  />
                }
                subtitle="Across all your confirmed tickets"
                color="#10b981"
              />
              <SummaryCard
                title={<><Ticket size={16} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Total Bookings</>}
                value={<AnimatedCounter value={overview.totalBookings} />}
                subtitle="Total confirmed tickets"
                color="#3b82f6"
              />
              <SummaryCard
                title={<><Train size={16} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Most Booked Train</>}
                value={
                  overview.topTrains && overview.topTrains.length > 0
                    ? overview.topTrains[0].train_name
                    : "No data"
                }
                subtitle={
                  overview.topTrains && overview.topTrains.length > 0
                    ? `${overview.topTrains[0].bookings} bookings`
                    : ""
                }
                color="#8b5cf6"
              />
            </div>

            {/* Booking Intent Stats */}
            {(overview.intentStats?.pending > 0 || overview.intentStats?.expired > 0 || overview.intentStats?.failed > 0) && (
              <div className="dashboard-grid">
                <SummaryCard
                  title={<><Clock size={16} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Pending Intents</>}
                  value={<AnimatedCounter value={overview.intentStats.pending} />}
                  subtitle="Awaiting payment (10 min lock)"
                  color="#f59e0b"
                />
                <SummaryCard
                  title={<><TimerOff size={16} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Expired Intents</>}
                  value={<AnimatedCounter value={overview.intentStats.expired} />}
                  subtitle="Payment window expired"
                  color="#6b7280"
                />
                <SummaryCard
                  title={<><XCircle size={16} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Failed Payments</>}
                  value={<AnimatedCounter value={overview.intentStats.failed} />}
                  subtitle="Payment dismissed or failed"
                  color="#ef4444"
                />
              </div>
            )}

            <div className="dashboard-grid-2col">
              {/* Revenue by date */}
              <Card title={<><CalendarDays size={16} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Revenue by Date (Last 7 Days)</>}>
                {!overview.revenueByDate || overview.revenueByDate.length === 0 ? (
                  <p className="empty-text">Loading…</p>
                ) : overview.revenueByDate.every((d) => d.revenue === 0) ? (
                  <p className="empty-text">No revenue in the last 7 days.</p>
                ) : (
                  <div className="revenue-chart">
                    {overview.revenueByDate.map((item) => {
                      const max =
                        Math.max(...overview.revenueByDate.map((d) => d.revenue || 0)) || 1;
                      const heightPercent = (item.revenue / max) * 100;
                      const dateLabel = new Date(item.date).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "2-digit",
                      });

                      return (
                        <div key={item.date} className="revenue-bar-col">
                          <div
                            className="revenue-bar"
                            style={{ height: `${heightPercent}%` }}
                          >
                            {item.revenue > 0 && (
                              <span className="revenue-tooltip">
                                ₹{item.revenue.toFixed(0)}
                              </span>
                            )}
                          </div>
                          <div className="revenue-date">{dateLabel}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>

              {/* Seat occupancy */}
              <Card title={<><Armchair size={16} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Seat Occupancy per Train</>}>
                {overview.seatOccupancy && overview.seatOccupancy.length > 0 ? (
                  <div className="dashboard-table-wrap dashboard-table-wrap--short">
                    <table className="dashboard-table">
                      <thead>
                        <tr>
                          <th>Train</th>
                          <th>Route</th>
                          <th>Booked</th>
                          <th>Total</th>
                          <th>Occupancy</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overview.seatOccupancy.map((row) => (
                          <tr key={row.train_id}>
                            <td className="td-medium">{row.train_name}</td>
                            <td className="td-muted">
                              {row.source} → {row.destination}
                            </td>
                            <td>{row.booked_seats}</td>
                            <td>{row.total_seats}</td>
                            <td>
                              <span
                                className={`badge ${
                                  row.occupancy_percent >= 80
                                    ? "badge--occ-high"
                                    : row.occupancy_percent >= 50
                                    ? "badge--occ-mid"
                                    : "badge--occ-low"
                                }`}
                              >
                                {row.occupancy_percent}%
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="empty-text">No seat occupancy data yet.</p>
                )}
              </Card>
            </div>

            {/* Recent bookings table */}
            <Card title={<><TicketCheck size={16} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Recent Bookings</>}>
              {bookings.length === 0 ? (
                <p className="empty-text">No bookings found.</p>
              ) : (
                <div className="dashboard-table-wrap">
                  <table className="dashboard-table">
                    <thead>
                      <tr>
                        <th>Ticket ID</th>
                        <th>PNR</th>
                        <th>User</th>
                        <th>Train</th>
                        <th>Route</th>
                        <th>Travel Date</th>
                        <th>Seat</th>
                        <th>Price</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bookings.map((b) => {
                        const isCancelled = b.status === "CANCELLED";
                        const isBusy = isCancellingId === b.ticket_id;
                        return (
                          <tr key={b.ticket_id}>
                            <td className="td-id">#{b.ticket_id}</td>
                            <td className="td-mono">{b.pnr}</td>
                            <td className="td-muted">{b.user_email}</td>
                            <td className="td-medium">{b.train_name}</td>
                            <td className="td-muted">
                              {b.source} → {b.destination}
                            </td>
                            <td>
                              {new Date(b.travel_date).toLocaleDateString("en-IN", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })}
                            </td>
                            <td className="td-bold">{b.seat_no}</td>
                            <td className="td-price">{formatCurrency(b.price)}</td>
                            <td>
                              <span
                                className={`badge ${
                                  isCancelled ? "badge--cancelled" : "badge--confirmed"
                                }`}
                              >
                                {b.status || "CONFIRMED"}
                              </span>
                            </td>
                            <td>
                              <button
                                type="button"
                                className="cancel-btn"
                                onClick={() =>
                                  setCancelDialog({ open: true, ticket: b })
                                }
                                disabled={isCancelled || isBusy}
                              >
                                {isCancelled
                                  ? "Cancelled"
                                  : isBusy
                                  ? "Cancelling..."
                                  : "Cancel"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
    </>
  );
}

/* ── Sub-components ──────────────────────────── */

function Card({ title, children }) {
  return (
    <div className="section-card">
      <h2>{title}</h2>
      {children}
    </div>
  );
}

function SummaryCard({ title, value, subtitle, color }) {
  return (
    <div className="summary-card" style={{ borderLeft: `4px solid ${color}` }}>
      <p className="summary-label">{title}</p>
      <p className="summary-value">{value}</p>
      {subtitle && <p className="summary-sub">{subtitle}</p>}
    </div>
  );
}
