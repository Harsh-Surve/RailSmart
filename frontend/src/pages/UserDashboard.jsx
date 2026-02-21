import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import CountUp from "react-countup";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import DashboardSkeleton from "../components/skeletons/DashboardSkeleton";
import { useTheme } from "../context/ThemeContext";
import { chartFade, fadeUp, pageFadeUp, staggerContainer, hoverLift } from "../utils/animations";
import useAuth from "../auth/useAuth";
import "../styles/userDashboard.css";

const API_BASE_URL = "http://localhost:5000";
const Motion = motion;

function formatCurrency(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(amount || 0));
}

function formatDisplayDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function trendMeta(current, previous) {
  const curr = Number(current || 0);
  const prev = Number(previous || 0);

  if (prev <= 0) return { dir: "neutral", text: "No previous-period baseline" };

  const pct = ((curr - prev) / prev) * 100;
  if (pct > 0) return { dir: "up", text: `+${pct.toFixed(1)}% from previous period` };
  if (pct < 0) return { dir: "down", text: `${pct.toFixed(1)}% from previous period` };
  return { dir: "neutral", text: "No change from previous period" };
}

export default function UserDashboard() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const isDark = theme === "dark";

  const chartTheme = useMemo(
    () => ({
      grid: isDark ? "#1e293b" : "#e2e8f0",
      axis: isDark ? "#94a3b8" : "#334155",
      line: isDark ? "#3b82f6" : "#2563eb",
      fillStart: isDark ? "#3b82f6" : "#2563eb",
      fillEnd: isDark ? "#3b82f6" : "#93c5fd",
      tooltipBg: isDark ? "#0f172a" : "#ffffff",
      tooltipBorder: isDark ? "#334155" : "#e2e8f0",
      tooltipText: isDark ? "#e2e8f0" : "#0f172a",
    }),
    [isDark]
  );

  const chartTooltipStyle = useMemo(
    () => ({
      backgroundColor: chartTheme.tooltipBg,
      border: `1px solid ${chartTheme.tooltipBorder}`,
      borderRadius: "12px",
      color: chartTheme.tooltipText,
    }),
    [chartTheme]
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [overview, setOverview] = useState(null);
  const [revenueData, setRevenueData] = useState([]);
  const [occupancy, setOccupancy] = useState([]);
  const [recentBookings, setRecentBookings] = useState([]);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();

    const load = async () => {
      try {
        setLoading(true);
        setError("");

        const email = user?.email || localStorage.getItem("userEmail");

        if (!email) {
          throw new Error("You must be logged in to view your dashboard.");
        }

        const [ticketsRes, trainsRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/my-tickets?email=${encodeURIComponent(email)}`, {
            signal: controller.signal,
            credentials: "include",
          }),
          fetch(`${API_BASE_URL}/api/trains`, {
            signal: controller.signal,
            credentials: "include",
          }),
        ]);

        if (!ticketsRes.ok) {
          throw new Error("Failed to load your booking activity.");
        }

        const tickets = await ticketsRes.json();
        const trains = trainsRes.ok ? await trainsRes.json() : [];

        if (!mounted) return;

        const normalizedTickets = Array.isArray(tickets) ? tickets : [];
        const normalizedTrains = Array.isArray(trains) ? trains : [];

        const paidTickets = normalizedTickets.filter(
          (ticket) => String(ticket?.payment_status || "").toUpperCase() === "PAID"
        );

        const totalSpent = paidTickets.reduce((sum, ticket) => sum + Number(ticket?.price || 0), 0);

        const bookingCountByTrain = normalizedTickets.reduce((acc, ticket) => {
          const trainName = ticket?.train_name || "Unknown Train";
          acc[trainName] = (acc[trainName] || 0) + 1;
          return acc;
        }, {});

        const topTrainEntry = Object.entries(bookingCountByTrain).sort((a, b) => b[1] - a[1])[0] || null;

        const today = new Date();
        const sevenDayDates = Array.from({ length: 7 }).map((_, i) => {
          const date = new Date(today);
          date.setDate(today.getDate() - (6 - i));
          return date;
        });

        const revenueByDay = sevenDayDates.map((date) => {
          const dayKey = date.toISOString().slice(0, 10);
          const dayRevenue = paidTickets
            .filter((ticket) => {
              const bookingDate = new Date(ticket?.booking_date || ticket?.created_at || 0);
              if (Number.isNaN(bookingDate.getTime())) return false;
              return bookingDate.toISOString().slice(0, 10) === dayKey;
            })
            .reduce((sum, ticket) => sum + Number(ticket?.price || 0), 0);

          return {
            date: date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
            revenue: Number(dayRevenue.toFixed(2)),
          };
        });

        const trainSeatMap = new Map(
          normalizedTrains.map((train) => [String(train.train_name || ""), Number(train.total_seats || 0)])
        );

        const occupancyRows = Object.entries(bookingCountByTrain)
          .map(([trainName, bookings]) => {
            const totalSeats = trainSeatMap.get(trainName) || 0;
            const ratio = totalSeats > 0 ? (bookings / totalSeats) * 100 : 0;
            return {
              name: trainName,
              occupancy: Number(Math.min(100, ratio).toFixed(1)),
              bookings,
              totalSeats,
            };
          })
          .sort((a, b) => b.occupancy - a.occupancy)
          .slice(0, 6);

        const recents = normalizedTickets.slice(0, 8).map((ticket) => ({
          train: ticket?.train_name || "-",
          route: `${ticket?.source || "-"} → ${ticket?.destination || "-"}`,
          date: formatDisplayDate(ticket?.travel_date),
          price: Number(ticket?.price || 0),
          status: String(ticket?.computed_status || ticket?.status || "UPCOMING").toUpperCase(),
        }));

        const thisWeekRevenue = revenueByDay.slice(4).reduce((sum, row) => sum + row.revenue, 0);
        const previousWindowRevenue = revenueByDay.slice(0, 4).reduce((sum, row) => sum + row.revenue, 0);

        const thisWindowBookings = normalizedTickets.filter((ticket) => {
          const bookingDate = new Date(ticket?.booking_date || ticket?.created_at || 0);
          if (Number.isNaN(bookingDate.getTime())) return false;
          const threshold = new Date(today);
          threshold.setDate(today.getDate() - 3);
          return bookingDate >= threshold;
        }).length;

        const previousWindowBookings = normalizedTickets.filter((ticket) => {
          const bookingDate = new Date(ticket?.booking_date || ticket?.created_at || 0);
          if (Number.isNaN(bookingDate.getTime())) return false;
          const end = new Date(today);
          end.setDate(today.getDate() - 4);
          const start = new Date(today);
          start.setDate(today.getDate() - 7);
          return bookingDate >= start && bookingDate <= end;
        }).length;

        setOverview({
          totalSpent,
          totalBookings: normalizedTickets.length,
          topTrain: topTrainEntry?.[0] || "N/A",
          topTrainCount: topTrainEntry?.[1] || 0,
          spentTrend: trendMeta(thisWeekRevenue, previousWindowRevenue),
          bookingTrend: trendMeta(thisWindowBookings, previousWindowBookings),
        });

        setRevenueData(revenueByDay);
        setOccupancy(occupancyRows);
        setRecentBookings(recents);
      } catch (err) {
        if (err?.name !== "AbortError") {
          setError(err?.message || "Failed to load dashboard");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [user]);

  const hasData = useMemo(() => !!overview, [overview]);
  const revenueChartKey = useMemo(() => {
    const firstDate = revenueData[0]?.date || "start";
    const lastDate = revenueData[revenueData.length - 1]?.date || "end";
    return `${theme}-${revenueData.length}-${firstDate}-${lastDate}`;
  }, [revenueData, theme]);

  if (loading && !hasData) {
    return <DashboardSkeleton />;
  }

  if (!hasData) {
    return (
      <div className="rs-page user-dashboard-page">
        {error ? <p className="rs-error-text">{error}</p> : <p className="rs-helper-text">No dashboard data available yet.</p>}
      </div>
    );
  }

  return (
    <Motion.div
      {...pageFadeUp}
      className="rs-page user-dashboard-page"
    >
      <div className="user-dashboard-hero">
        <h1 className="rs-page-title">User Dashboard</h1>
        <p className="rs-helper-text">Executive snapshot of your spend, bookings, and travel activity.</p>
      </div>

      {error && <p className="rs-error-text">{error}</p>}

      <Motion.div
        initial="hidden"
        animate="visible"
        variants={staggerContainer}
        className="user-dashboard-kpi-grid"
      >
        <MetricCard
          title="Total Revenue"
          numericValue={Number(overview.totalSpent || 0)}
          prefix="₹"
          decimals={2}
          trend={overview.spentTrend}
          variants={fadeUp}
        />

        <MetricCard
          title="Total Bookings"
          numericValue={Number(overview.totalBookings || 0)}
          trend={overview.bookingTrend}
          variants={fadeUp}
        />

        <MetricCard
          title="Most Booked Train"
          value={overview.topTrain}
          subtitle={`${overview.topTrainCount} bookings`}
          variants={fadeUp}
        />
      </Motion.div>

      <DataPanel title="Revenue (Last 7 Days)">
        <Motion.div
          key={revenueChartKey}
          {...chartFade}
          className="user-dashboard-chart-wrap"
        >
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={revenueData}>
              <defs>
                <linearGradient id="userRevenueFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={chartTheme.fillStart} stopOpacity={0.4} />
                  <stop offset="95%" stopColor={chartTheme.fillEnd} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={chartTheme.grid} strokeDasharray="4 4" />
              <XAxis dataKey="date" tick={{ fill: chartTheme.axis, fontSize: 12 }} axisLine={{ stroke: chartTheme.grid }} tickLine={{ stroke: chartTheme.grid }} />
              <YAxis tick={{ fill: chartTheme.axis, fontSize: 12 }} axisLine={{ stroke: chartTheme.grid }} tickLine={{ stroke: chartTheme.grid }} />
              <Tooltip contentStyle={chartTooltipStyle} formatter={(value) => formatCurrency(value)} />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke={chartTheme.line}
                strokeWidth={3}
                fill="url(#userRevenueFill)"
                isAnimationActive
                animationDuration={500}
              />
            </AreaChart>
          </ResponsiveContainer>
        </Motion.div>
      </DataPanel>

      <DataPanel title="Seat Occupancy by Train">
        <div className="user-dashboard-occupancy-list">
          {occupancy.map((train) => (
            <div className="user-dashboard-occupancy-row" key={train.name}>
              <div className="user-dashboard-occupancy-head">
                <span>{train.name}</span>
                <span>{train.occupancy}%</span>
              </div>
              <progress className="user-dashboard-progress" max="100" value={train.occupancy} />
            </div>
          ))}
          {!occupancy.length && <p className="rs-helper-text">No occupancy data available yet.</p>}
        </div>
      </DataPanel>

      <DataPanel title="Recent Bookings">
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Train</th>
                <th>Route</th>
                <th>Date</th>
                <th>Price</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {recentBookings.map((booking, index) => (
                <tr key={`${booking.train}-${booking.date}-${index}`}>
                  <td>{booking.train}</td>
                  <td>{booking.route}</td>
                  <td>{booking.date}</td>
                  <td>{formatCurrency(booking.price)}</td>
                  <td>
                    <StatusBadge status={booking.status} />
                  </td>
                </tr>
              ))}
              {!recentBookings.length && (
                <tr>
                  <td colSpan={5} className="rs-helper-text">No bookings found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </DataPanel>
    </Motion.div>
  );
}

function MetricCard({ title, value, numericValue, prefix = "", suffix = "", decimals = 0, trend, subtitle, variants }) {
  return (
    <Motion.article
      variants={variants}
      transition={{ duration: 0.4 }}
      {...hoverLift}
      className="user-dashboard-metric-card"
    >
      <p className="user-dashboard-metric-title">{title}</p>
      <h2 className="user-dashboard-metric-value">
        {typeof numericValue === "number" ? (
          <>
            {prefix}
            <CountUp
              end={numericValue}
              duration={1.2}
              separator="," 
              decimals={decimals}
            />
            {suffix}
          </>
        ) : (
          value
        )}
      </h2>
      {trend && (
        <div className={`user-dashboard-metric-trend user-dashboard-metric-trend--${trend.dir}`}>
          {trend.dir === "up" && <ArrowUpRight size={14} />}
          {trend.dir === "down" && <ArrowDownRight size={14} />}
          <span>{trend.text}</span>
        </div>
      )}
      {subtitle && <p className="user-dashboard-metric-subtitle">{subtitle}</p>}
    </Motion.article>
  );
}

function DataPanel({ title, children }) {
  return (
    <section className="user-dashboard-panel">
      <h3 className="user-dashboard-panel-title">{title}</h3>
      {children}
    </section>
  );
}

function StatusBadge({ status }) {
  const normalized = String(status || "").toUpperCase();

  if (normalized === "CONFIRMED" || normalized === "UPCOMING") {
    return <span className="user-dashboard-status user-dashboard-status--ok">Confirmed</span>;
  }

  if (normalized === "WAITLIST") {
    return <span className="user-dashboard-status user-dashboard-status--warn">Waitlist</span>;
  }

  if (normalized === "CANCELLED" || normalized === "REFUNDED") {
    return <span className="user-dashboard-status user-dashboard-status--bad">Cancelled</span>;
  }

  if (normalized === "RUNNING") {
    return <span className="user-dashboard-status user-dashboard-status--info">Running</span>;
  }

  return <span className="user-dashboard-status user-dashboard-status--muted">{normalized || "Unknown"}</span>;
}
