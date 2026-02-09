import React, { useEffect, useState } from "react";
import ConfirmDialog from "../components/ConfirmDialog";
import Skeleton from "../components/Skeleton";

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

      <div
      style={{
        padding: "2rem",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        background: "var(--rs-bg)",
        minHeight: "100vh",
      }}
    >
      <h1
        style={{
          fontSize: "1.8rem",
          fontWeight: 700,
          marginBottom: "0.5rem",
          color: "var(--rs-text-main)",
        }}
      >
        👤 User Dashboard
      </h1>
      <p style={{ color: "var(--rs-text-muted)", marginBottom: "1.5rem", fontSize: "0.95rem" }}>
        Overview of your RailSmart bookings, spend, and travel analytics
      </p>

      {loading && (
        <>
          <Skeleton variant="card" count={3} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "1.5rem", marginBottom: "1.8rem" }}>
            <div style={{ background: "var(--rs-card-bg)", borderRadius: "16px", border: "1px solid var(--rs-border)", padding: "1.2rem 1.4rem" }}>
              <Skeleton variant="chart" />
            </div>
            <div style={{ background: "var(--rs-card-bg)", borderRadius: "16px", border: "1px solid var(--rs-border)", padding: "1.2rem 1.4rem" }}>
              <Skeleton variant="table" count={4} />
            </div>
          </div>
        </>
      )}
      {error && (
        <p style={{ color: "crimson", marginBottom: "1rem", fontSize: "0.95rem" }}>{error}</p>
      )}

      {!loading && overview && (
        <>
          {/* Top summary cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: "1.2rem",
              marginBottom: "1.8rem",
            }}
          >
            <SummaryCard
              title="💰 Total Amount Spent"
              value={formatCurrency(overview.totalRevenue)}
              subtitle="Across all your confirmed tickets"
              color="#10b981"
            />
            <SummaryCard
              title="🎫 Total Bookings"
              value={overview.totalBookings}
              subtitle="Total confirmed tickets"
              color="#3b82f6"
            />
            <SummaryCard
              title="🚂 Most Booked Train"
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

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(300px, 1fr) minmax(400px, 2fr)",
              gap: "1.5rem",
              marginBottom: "1.8rem",
            }}
          >
            {/* Revenue by date */}
            <Card title="📅 Revenue by Date (Last 7 Days)">
              {!overview.revenueByDate || overview.revenueByDate.length === 0 ? (
                <p style={{ fontSize: "0.88rem", color: "var(--rs-text-muted)", padding: "1rem 0" }}>
                  Loading…
                </p>
              ) : overview.revenueByDate.every(d => d.revenue === 0) ? (
                <p style={{ fontSize: "0.88rem", color: "var(--rs-text-muted)", padding: "1rem 0" }}>
                  No revenue in the last 7 days.
                </p>
              ) : (
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-end",
                    gap: "0.75rem",
                    height: "150px",
                    marginTop: "0.75rem",
                  }}
                >
                  {overview.revenueByDate.map((item) => {
                    const max = Math.max(
                      ...overview.revenueByDate.map(d => d.revenue || 0)
                    ) || 1;
                    const heightPercent = (item.revenue / max) * 100;

                    // short label: dd/MM
                    const dateLabel = new Date(item.date).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "2-digit",
                    });

                    return (
                      <div
                        key={item.date}
                        style={{
                          flex: 1,
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                        }}
                      >
                        <div
                          style={{
                            position: "relative",
                            width: "100%",
                            maxWidth: "26px",
                            height: `${heightPercent}%`,
                            borderRadius: "999px",
                            background: "linear-gradient(180deg, #4f46e5, #6366f1)",
                            display: "flex",
                            alignItems: "flex-end",
                            justifyContent: "center",
                          }}
                        >
                          {item.revenue > 0 && (
                            <span
                              style={{
                                position: "absolute",
                                top: "-18px",
                                fontSize: "0.65rem",
                                color: "var(--rs-text-main)",
                                background: "var(--rs-card-bg)",
                                padding: "1px 4px",
                                borderRadius: "999px",
                                border: "1px solid var(--rs-border)",
                                whiteSpace: "nowrap",
                              }}
                            >
                              ₹{item.revenue.toFixed(0)}
                            </span>
                          )}
                        </div>
                        <div
                          style={{
                            marginTop: "0.25rem",
                            fontSize: "0.7rem",
                            color: "var(--rs-text-muted)",
                          }}
                        >
                          {dateLabel}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            {/* Seat occupancy */}
            <Card title="💺 Seat Occupancy per Train">
              {overview.seatOccupancy && overview.seatOccupancy.length > 0 ? (
                <div
                  style={{
                    maxHeight: "280px",
                    overflowY: "auto",
                  }}
                >
                  <table
                    style={{
                      width: "100%",
                      fontSize: "0.88rem",
                      borderCollapse: "collapse",
                    }}
                  >
                    <thead>
                      <tr
                        style={{
                          textAlign: "left",
                          borderBottom: "2px solid var(--rs-border)",
                        }}
                      >
                        <th style={{ padding: "0.5rem 0.3rem", fontWeight: 600 }}>Train</th>
                        <th style={{ padding: "0.5rem 0.3rem", fontWeight: 600 }}>Route</th>
                        <th style={{ padding: "0.5rem 0.3rem", fontWeight: 600 }}>Booked</th>
                        <th style={{ padding: "0.5rem 0.3rem", fontWeight: 600 }}>Total</th>
                        <th style={{ padding: "0.5rem 0.3rem", fontWeight: 600 }}>Occupancy</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.seatOccupancy.map((row) => (
                        <tr
                          key={row.train_id}
                          style={{
                            borderBottom: "1px solid var(--rs-border)",
                          }}
                        >
                          <td style={{ padding: "0.5rem 0.3rem", fontWeight: 500 }}>
                            {row.train_name}
                          </td>
                          <td
                            style={{
                              padding: "0.5rem 0.3rem",
                              color: "var(--rs-text-muted)",
                              fontSize: "0.85rem",
                            }}
                          >
                            {row.source} → {row.destination}
                          </td>
                          <td style={{ padding: "0.5rem 0.3rem" }}>
                            {row.booked_seats}
                          </td>
                          <td style={{ padding: "0.5rem 0.3rem" }}>
                            {row.total_seats}
                          </td>
                          <td
                            style={{
                              padding: "0.5rem 0.3rem",
                              fontWeight: 700,
                            }}
                          >
                            <span
                              style={{
                                padding: "0.2rem 0.6rem",
                                borderRadius: "999px",
                                fontSize: "0.8rem",
                                backgroundColor:
                                  row.occupancy_percent >= 80
                                    ? "#fee2e2"
                                    : row.occupancy_percent >= 50
                                    ? "#fef3c7"
                                    : "#dcfce7",
                                color:
                                  row.occupancy_percent >= 80
                                    ? "#b91c1c"
                                    : row.occupancy_percent >= 50
                                    ? "#92400e"
                                    : "#15803d",
                              }}
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
                <p style={{ fontSize: "0.88rem", color: "var(--rs-text-muted)", padding: "1rem 0" }}>
                  No seat occupancy data yet.
                </p>
              )}
            </Card>
          </div>

          {/* Recent bookings table */}
          <Card title="🎟️ Recent Bookings">
            {bookings.length === 0 ? (
              <p style={{ fontSize: "0.88rem", color: "var(--rs-text-muted)", padding: "1rem 0" }}>
                No bookings found.
              </p>
            ) : (
              <div
                style={{
                  maxHeight: "400px",
                  overflowY: "auto",
                }}
              >
                <table
                  style={{
                    width: "100%",
                    fontSize: "0.88rem",
                    borderCollapse: "collapse",
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        textAlign: "left",
                        borderBottom: "2px solid var(--rs-border)",
                      }}
                    >
                      <th style={{ padding: "0.5rem 0.4rem", fontWeight: 600 }}>Ticket ID</th>
                      <th style={{ padding: "0.5rem 0.4rem", fontWeight: 600 }}>PNR</th>
                      <th style={{ padding: "0.5rem 0.4rem", fontWeight: 600 }}>User</th>
                      <th style={{ padding: "0.5rem 0.4rem", fontWeight: 600 }}>Train</th>
                      <th style={{ padding: "0.5rem 0.4rem", fontWeight: 600 }}>Route</th>
                      <th style={{ padding: "0.5rem 0.4rem", fontWeight: 600 }}>Travel Date</th>
                      <th style={{ padding: "0.5rem 0.4rem", fontWeight: 600 }}>Seat</th>
                      <th style={{ padding: "0.5rem 0.4rem", fontWeight: 600 }}>Price</th>
                      <th style={{ padding: "0.5rem 0.4rem", fontWeight: 600 }}>Status</th>
                      <th style={{ padding: "0.5rem 0.4rem", fontWeight: 600 }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bookings.map((b) => {
                      const isCancelled = b.status === "CANCELLED";
                      const isBusy = isCancellingId === b.ticket_id;
                      return (
                      <tr
                        key={b.ticket_id}
                        style={{
                          borderBottom: "1px solid var(--rs-border)",
                        }}
                      >
                        <td style={{ padding: "0.5rem 0.4rem", fontWeight: 600, color: "#3b82f6" }}>
                          #{b.ticket_id}
                        </td>
                        <td style={{ padding: "0.5rem 0.4rem", fontFamily: "monospace", fontSize: "0.82rem" }}>
                          {b.pnr}
                        </td>
                        <td
                          style={{
                            padding: "0.5rem 0.4rem",
                            color: "var(--rs-text-muted)",
                            fontSize: "0.85rem",
                          }}
                        >
                          {b.user_email}
                        </td>
                        <td style={{ padding: "0.5rem 0.4rem", fontWeight: 500 }}>
                          {b.train_name}
                        </td>
                        <td
                          style={{
                            padding: "0.5rem 0.4rem",
                            color: "var(--rs-text-muted)",
                            fontSize: "0.85rem",
                          }}
                        >
                          {b.source} → {b.destination}
                        </td>
                        <td style={{ padding: "0.5rem 0.4rem" }}>
                          {new Date(b.travel_date).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </td>
                        <td style={{ padding: "0.5rem 0.4rem", fontWeight: 600 }}>
                          {b.seat_no}
                        </td>
                        <td style={{ padding: "0.5rem 0.4rem", fontWeight: 600, color: "#10b981" }}>
                          {formatCurrency(b.price)}
                        </td>
                        <td style={{ padding: "0.5rem 0.4rem" }}>
                          <span
                            style={{
                              padding: "0.15rem 0.5rem",
                              borderRadius: "999px",
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              backgroundColor: isCancelled ? "#fee2e2" : "#dcfce7",
                              color: isCancelled ? "#b91c1c" : "#166534",
                            }}
                          >
                            {b.status || "CONFIRMED"}
                          </span>
                        </td>
                        <td style={{ padding: "0.5rem 0.4rem" }}>
                          <button
                            type="button"
                            onClick={() =>
                              setCancelDialog({ open: true, ticket: b })
                            }
                            disabled={isCancelled || isBusy}
                            style={{
                              padding: "0.3rem 0.7rem",
                              borderRadius: "999px",
                              border: "none",
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              cursor: isCancelled || isBusy ? "not-allowed" : "pointer",
                              backgroundColor: isCancelled ? "#e5e7eb" : "#fee2e2",
                              color: isCancelled ? "#6b7280" : "#b91c1c",
                            }}
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
        </>
      )}
      </div>
    </>
  );
}

function Card({ title, children }) {
  return (
    <div
      style={{
        background: "var(--rs-card-bg)",
        borderRadius: "16px",
        border: "1px solid var(--rs-border)",
        padding: "1.2rem 1.4rem",
        boxShadow: "0 10px 25px rgba(15,23,42,0.08)",
      }}
    >
      <h2
        style={{
          fontSize: "1rem",
          fontWeight: 700,
          marginBottom: "0.9rem",
          color: "var(--rs-text-main)",
        }}
      >
        {title}
      </h2>
      {children}
    </div>
  );
}

function SummaryCard({ title, value, subtitle, color }) {
  return (
    <div
      style={{
        background: "var(--rs-card-bg)",
        borderRadius: "16px",
        border: "1px solid var(--rs-border)",
        padding: "1.3rem 1.5rem",
        boxShadow: "0 10px 25px rgba(15,23,42,0.08)",
        borderLeft: `4px solid ${color}`,
      }}
    >
      <p
        style={{
          fontSize: "0.85rem",
          color: "var(--rs-text-muted)",
          marginBottom: "0.5rem",
          fontWeight: 500,
        }}
      >
        {title}
      </p>
      <p
        style={{
          fontSize: "1.6rem",
          fontWeight: 700,
          color: "var(--rs-text-main)",
          marginBottom: "0.3rem",
        }}
      >
        {value}
      </p>
      {subtitle && (
        <p style={{ fontSize: "0.8rem", color: "var(--rs-text-muted)" }}>{subtitle}</p>
      )}
    </div>
  );
}
