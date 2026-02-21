import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { useTheme } from "../context/ThemeContext";
import { ArrowDownRight, ArrowUpRight, BarChart3, IndianRupee, Ticket, Percent, Sparkles } from "lucide-react";
import { chartFade, fadeUp, filterButtonMotion, pageFadeUp, staggerContainer, hoverLift } from "../utils/animations";
import "../styles/adminAnalytics.css";

const API_BASE_URL = "http://localhost:5000";
const Motion = motion;

function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatTrend(current, previous) {
  const currentValue = Number(current || 0);
  const previousValue = Number(previous || 0);

  if (previousValue <= 0) {
    return { percent: 0, direction: "neutral", label: "No previous month baseline" };
  }

  const percent = Number((((currentValue - previousValue) / previousValue) * 100).toFixed(1));
  if (percent > 0) return { percent, direction: "up", label: `${percent}% from last month` };
  if (percent < 0) return { percent: Math.abs(percent), direction: "down", label: `${Math.abs(percent)}% from last month` };
  return { percent: 0, direction: "neutral", label: "No change from last month" };
}

export default function AdminAnalytics() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const chartTheme = useMemo(
    () => ({
      grid: isDark ? "#1f2937" : "#e2e8f0",
      axis: isDark ? "#cbd5e1" : "#334155",
      barTop: isDark ? "#3b82f6" : "#2563eb",
      barBottom: isDark ? "#1e3a8a" : "#1d4ed8",
      line: isDark ? "#22d3ee" : "#0ea5e9",
      tooltipBg: isDark ? "#111827" : "#ffffff",
      tooltipBorder: isDark ? "#334155" : "#cbd5e1",
      tooltipLabel: isDark ? "#f8fafc" : "#0f172a",
      tooltipItem: isDark ? "#38bdf8" : "#0369a1",
    }),
    [isDark]
  );

  const [kpi, setKpi] = useState({
    totalRevenue: 0,
    monthlyRevenue: 0,
    lastMonthRevenue: 0,
    totalBookings: 0,
    currentMonthBookings: 0,
    lastMonthBookings: 0,
    cancellationRate: 0,
  });
  const [revenueSeries, setRevenueSeries] = useState([]);
  const [occupancy, setOccupancy] = useState([]);
  const [peakBookings, setPeakBookings] = useState([]);
  const [topRoutes, setTopRoutes] = useState([]);
  const [revenueRange, setRevenueRange] = useState(7);
  const [bookingsRange, setBookingsRange] = useState(30);
  const [revenueLoading, setRevenueLoading] = useState(false);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const formattedPeakBookings = useMemo(
    () =>
      peakBookings.map((item) => ({
        ...item,
        formattedDate: new Date(item.booking_date).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
        }),
      })),
    [peakBookings]
  );

  const formattedRevenueTrend = useMemo(
    () =>
      revenueSeries.map((item) => ({
        ...item,
        formattedDate: new Date(item.date).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
        }),
      })),
    [revenueSeries]
  );

  const revenueTrend = useMemo(
    () => formatTrend(kpi.monthlyRevenue, kpi.lastMonthRevenue),
    [kpi.monthlyRevenue, kpi.lastMonthRevenue]
  );

  const bookingsTrend = useMemo(
    () => formatTrend(kpi.currentMonthBookings, kpi.lastMonthBookings),
    [kpi.currentMonthBookings, kpi.lastMonthBookings]
  );

  const topRouteShare = useMemo(() => {
    if (!topRoutes.length) return 0;
    const total = topRoutes.reduce((sum, row) => sum + Number(row.total_bookings || 0), 0);
    if (!total) return 0;
    return Number(((Number(topRoutes[0].total_bookings || 0) / total) * 100).toFixed(1));
  }, [topRoutes]);

  const peakBookingDay = useMemo(() => {
    if (!formattedPeakBookings.length) return null;
    return formattedPeakBookings.reduce((maxRow, row) => {
      if (!maxRow) return row;
      return Number(row.total_bookings || 0) > Number(maxRow.total_bookings || 0) ? row : maxRow;
    }, null);
  }, [formattedPeakBookings]);

  const kpiCards = useMemo(
    () => [
      {
        key: "totalRevenue",
        title: "Total Revenue",
        value: formatCurrency(kpi.totalRevenue),
        trend: { direction: "neutral", label: "All-time settled revenue" },
        icon: <IndianRupee size={16} />,
      },
      {
        key: "monthlyRevenue",
        title: "Monthly Revenue",
        value: formatCurrency(kpi.monthlyRevenue),
        trend: revenueTrend,
        icon: <BarChart3 size={16} />,
      },
      {
        key: "totalBookings",
        title: "Total Bookings",
        value: Number(kpi.totalBookings || 0).toLocaleString("en-IN"),
        trend: bookingsTrend,
        icon: <Ticket size={16} />,
      },
      {
        key: "cancellationRate",
        title: "Cancellation Rate",
        value: `${Number(kpi.cancellationRate || 0)}%`,
        trend: { direction: "neutral", label: "Based on confirmed + cancelled" },
        icon: <Percent size={16} />,
      },
    ],
    [bookingsTrend, kpi.cancellationRate, kpi.monthlyRevenue, kpi.totalBookings, kpi.totalRevenue, revenueTrend]
  );

  useEffect(() => {
    const controller = new AbortController();

    const fetchJson = async (path) => {
      const res = await fetch(`${API_BASE_URL}${path}`, {
        credentials: "include",
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401 || res.status === 403) {
        throw new Error("Admin session invalid. Please log in with email/password again.");
      }
      if (!res.ok) {
        throw new Error(data?.error || `Request failed for ${path}`);
      }
      return data;
    };

    const fetchData = async () => {
      try {
        setLoading(true);
        setError("");

        const [kpiRes, occRes, topRes] = await Promise.all([
          fetchJson("/api/admin/analytics/kpi"),
          fetchJson("/api/admin/analytics/occupancy"),
          fetchJson("/api/admin/analytics/top-routes"),
        ]);

        setKpi(kpiRes || {});
        setOccupancy(Array.isArray(occRes) ? occRes : []);
        setTopRoutes(Array.isArray(topRes) ? topRes : []);
      } catch (err) {
        if (err?.name !== "AbortError") {
          setError(err?.message || "Failed to load analytics");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    const fetchRevenueTrend = async () => {
      try {
        setRevenueLoading(true);
        const res = await fetch(`${API_BASE_URL}/api/admin/analytics/revenue?range=${revenueRange}`, {
          credentials: "include",
          signal: controller.signal,
        });
        const data = await res.json().catch(() => []);
        if (!res.ok) {
          throw new Error(data?.error || "Failed to load revenue trend");
        }
        setRevenueSeries(Array.isArray(data) ? data : []);
      } catch (err) {
        if (err?.name !== "AbortError") {
          setError(err?.message || "Failed to load revenue trend");
        }
      } finally {
        setRevenueLoading(false);
      }
    };

    fetchRevenueTrend();

    return () => controller.abort();
  }, [revenueRange]);

  useEffect(() => {
    const controller = new AbortController();

    const fetchBookingsTrend = async () => {
      try {
        setBookingsLoading(true);
        const res = await fetch(`${API_BASE_URL}/api/admin/analytics/peak-bookings?range=${bookingsRange}`, {
          credentials: "include",
          signal: controller.signal,
        });
        const data = await res.json().catch(() => []);
        if (!res.ok) {
          throw new Error(data?.error || "Failed to load bookings trend");
        }
        setPeakBookings(Array.isArray(data) ? data : []);
      } catch (err) {
        if (err?.name !== "AbortError") {
          setError(err?.message || "Failed to load bookings trend");
        }
      } finally {
        setBookingsLoading(false);
      }
    };

    fetchBookingsTrend();

    return () => controller.abort();
  }, [bookingsRange]);

  return (
    <Motion.div {...pageFadeUp} className="rs-page analytics-page" style={{ maxWidth: 1240 }}>
      <div className="analytics-hero">
        <p className="analytics-eyebrow">Executive Overview</p>
        <h1 className="rs-page-title analytics-title">Admin Analytics</h1>
        <p className="analytics-subtitle">Revenue, occupancy, route demand, and booking trends from live operations.</p>
      </div>

      {error && <p className="rs-error-text">{error}</p>}

      {loading ? (
        <div className="analytics-grid-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton-card">
              <div className="skeleton" style={{ height: 16, width: "50%" }} />
              <div className="skeleton" style={{ height: 28, width: "70%" }} />
            </div>
          ))}
        </div>
      ) : (
        <div className="analytics-stack">
          <Motion.div className="analytics-grid-4" initial="hidden" animate="visible" variants={staggerContainer}>
            {kpiCards.map((card) => (
              <Motion.article className="analytics-kpi-card" key={card.key} variants={fadeUp} {...hoverLift}>
                <div className="analytics-kpi-head">
                  <span className="analytics-kpi-icon">{card.icon}</span>
                  <span className="analytics-kpi-label">{card.title}</span>
                </div>
                <p className="analytics-kpi-value">{card.value}</p>
                <div className={`analytics-kpi-trend analytics-kpi-trend--${card.trend.direction}`}>
                  {card.trend.direction === "up" && <ArrowUpRight size={14} />}
                  {card.trend.direction === "down" && <ArrowDownRight size={14} />}
                  <span>{card.trend.label}</span>
                </div>
              </Motion.article>
            ))}
          </Motion.div>

          <section className="analytics-panel">
            <div className="analytics-panel-head">
              <h3 className="rs-card-title">Revenue Analytics</h3>
              <div className="analytics-trend-controls" role="tablist" aria-label="Revenue trend range">
                {[7, 30, 90].map((range) => (
                  <Motion.button
                    key={range}
                    type="button"
                    onClick={() => setRevenueRange(range)}
                    className={`analytics-trend-pill ${revenueRange === range ? "analytics-trend-pill--active" : ""}`}
                    aria-pressed={revenueRange === range}
                    {...filterButtonMotion}
                  >
                    {range}D
                  </Motion.button>
                ))}
              </div>
            </div>
            <div className="analytics-chart-lg">
              {revenueLoading ? (
                <div className="skeleton" style={{ height: 350, width: "100%" }} />
              ) : (
                <Motion.div key={`revenue-${revenueRange}`} {...chartFade}>
                  <ResponsiveContainer width="100%" height={350}>
                    <AreaChart data={formattedRevenueTrend} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                    <defs>
                      <linearGradient id="adminRevenueArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={chartTheme.barTop} stopOpacity={0.35} />
                        <stop offset="95%" stopColor={chartTheme.barTop} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="4 4" stroke={chartTheme.grid} />
                    <XAxis dataKey="formattedDate" tick={{ fill: chartTheme.axis, fontSize: 12 }} minTickGap={12} />
                    <YAxis tick={{ fill: chartTheme.axis, fontSize: 12 }} />
                    <Tooltip
                      formatter={(v) => formatCurrency(v)}
                      contentStyle={{
                        backgroundColor: chartTheme.tooltipBg,
                        border: `1px solid ${chartTheme.tooltipBorder}`,
                        borderRadius: "10px",
                        boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                      }}
                      labelStyle={{ color: chartTheme.tooltipLabel, fontWeight: 600 }}
                      itemStyle={{ color: chartTheme.tooltipItem, fontWeight: 500 }}
                    />
                    <Legend wrapperStyle={{ color: chartTheme.axis }} />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      name={`Revenue (${revenueRange}D)`}
                      stroke={chartTheme.barTop}
                      fill="url(#adminRevenueArea)"
                      strokeWidth={3}
                      isAnimationActive
                      animationDuration={500}
                    />
                    </AreaChart>
                  </ResponsiveContainer>
                </Motion.div>
              )}
            </div>
          </section>

          <div className="analytics-grid-2">
            <section className="analytics-panel">
              <div className="analytics-panel-head">
                <h3 className="rs-card-title">Bookings Trend</h3>
                <div className="analytics-trend-controls" role="tablist" aria-label="Bookings trend range">
                  {[7, 30, 90].map((range) => (
                    <Motion.button
                      key={range}
                      type="button"
                      onClick={() => setBookingsRange(range)}
                      className={`analytics-trend-pill ${bookingsRange === range ? "analytics-trend-pill--active" : ""}`}
                      aria-pressed={bookingsRange === range}
                      {...filterButtonMotion}
                    >
                      {range}D
                    </Motion.button>
                  ))}
                </div>
              </div>
              <div className="analytics-chart-xl">
                {bookingsLoading ? (
                  <div className="skeleton" style={{ height: 380, width: "100%" }} />
                ) : (
                  <Motion.div key={`bookings-${bookingsRange}`} {...chartFade}>
                    <ResponsiveContainer width="100%" height={380}>
                      <AreaChart data={formattedPeakBookings} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                      <defs>
                        <linearGradient id="bookingArea" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={chartTheme.line} stopOpacity={0.35} />
                          <stop offset="95%" stopColor={chartTheme.line} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="4 4" stroke={chartTheme.grid} />
                      <XAxis
                        dataKey="formattedDate"
                        tick={{ fill: chartTheme.axis, fontSize: 12 }}
                        minTickGap={12}
                      />
                      <YAxis tick={{ fill: chartTheme.axis, fontSize: 12 }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: chartTheme.tooltipBg,
                          border: `1px solid ${chartTheme.tooltipBorder}`,
                          borderRadius: "10px",
                          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                        }}
                        labelStyle={{ color: chartTheme.tooltipLabel, fontWeight: 600 }}
                        itemStyle={{ color: chartTheme.tooltipItem, fontWeight: 500 }}
                      />
                      <Legend wrapperStyle={{ color: chartTheme.axis }} />
                      <Area type="monotone" dataKey="total_bookings" name={`Bookings (${bookingsRange}D)`} stroke={chartTheme.line} fill="url(#bookingArea)" strokeWidth={3} isAnimationActive animationDuration={450} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </Motion.div>
                )}
              </div>
            </section>

            <aside className="analytics-panel analytics-insight-panel">
              <div className="analytics-insight-head">
                <Sparkles size={16} />
                <span>Smart Insights</span>
              </div>
              <div className="analytics-insight-item">
                <p className="analytics-insight-label">Top route contribution</p>
                <p className="analytics-insight-value">
                  {topRoutes[0]?.route_name || "N/A"}
                  {topRouteShare > 0 ? ` • ${topRouteShare}%` : ""}
                </p>
              </div>
              <div className="analytics-insight-item">
                <p className="analytics-insight-label">Peak booking day</p>
                <p className="analytics-insight-value">
                  {peakBookingDay?.formattedDate || "N/A"}
                  {peakBookingDay ? ` • ${Number(peakBookingDay.total_bookings || 0)} bookings` : ""}
                </p>
              </div>
              <div className="analytics-insight-item">
                <p className="analytics-insight-label">Operational note</p>
                <p className="analytics-insight-value">Monitor routes with occupancy above 85% for waitlist pressure.</p>
              </div>
            </aside>
          </div>

          <div className="analytics-grid-2">
            <section className="analytics-panel">
              <div className="analytics-panel-head">
                <h3 className="rs-card-title">Top Routes</h3>
                <span className="analytics-panel-note">Highest booking demand</span>
              </div>
              <div className="table-wrapper analytics-table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Route</th>
                        <th>Bookings</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topRoutes.map((r, index) => (
                        <tr key={`${r.route_name}-${r.total_bookings}-${index}`} className="analytics-table-row">
                          <td>{r.route_name}</td>
                          <td>{Number(r.total_bookings || 0)}</td>
                        </tr>
                      ))}
                      {topRoutes.length === 0 && (
                        <tr>
                          <td colSpan={2} className="rs-helper-text">No top-route data available</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
              </div>
            </section>

            <section className="analytics-panel">
              <div className="analytics-panel-head">
                <h3 className="rs-card-title">Occupancy by Train</h3>
                <span className="analytics-panel-note">Seat utilization</span>
              </div>
                <div className="table-wrapper">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Train</th>
                        <th>Occupancy %</th>
                        <th>Booked / Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {occupancy.map((o, index) => (
                        <tr key={`${o.train_name}-${o.total_seats}-${index}`} className="analytics-table-row">
                          <td>{o.train_name}</td>
                          <td>
                            <div className="analytics-occupancy-cell">
                              <div className="analytics-occupancy-track">
                                <div
                                  className="analytics-occupancy-fill"
                                  style={{ width: `${Math.min(100, Math.max(0, Number(o.occupancy_percent || 0)))}%` }}
                                />
                              </div>
                              <span>{Number(o.occupancy_percent || 0)}%</span>
                            </div>
                          </td>
                          <td>{Number(o.booked_seats || 0)} / {Number(o.total_seats || 0)}</td>
                        </tr>
                      ))}
                      {occupancy.length === 0 && (
                        <tr>
                          <td colSpan={3} className="rs-helper-text">No occupancy data available</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
            </section>
          </div>
        </div>
      )}
    </Motion.div>
  );
}
