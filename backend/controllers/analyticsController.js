const pool = require("../db");
const cache = require("../utils/cache");

const isCacheEnabled = process.env.NODE_ENV !== "test";

function toNumber(value, fallback = 0) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
}

function resolveRangeDays(rawRange, fallback = 30) {
  const allowedRanges = new Set([7, 30, 90]);
  const parsed = Number.parseInt(String(rawRange ?? fallback), 10);
  return allowedRanges.has(parsed) ? parsed : fallback;
}

function sendCachedJson(res, key) {
  if (!isCacheEnabled) return false;
  const cached = cache.get(key);
  if (cached === undefined) return false;
  res.json(cached);
  return true;
}

function setCachedJson(key, payload) {
  if (!isCacheEnabled) return;
  cache.set(key, payload);
}

exports.getKPIOverview = async (req, res) => {
  const cacheKey = "analytics:kpi-overview";
  if (sendCachedJson(res, cacheKey)) {
    return;
  }

  try {
    const revenueQuery = `
      SELECT
        COALESCE(SUM(amount), 0) AS total_revenue,
        COALESCE(
          SUM(
            CASE
              WHEN DATE_TRUNC('month', COALESCE(created_at, date, NOW())) = DATE_TRUNC('month', CURRENT_DATE)
              THEN amount
              ELSE 0
            END
          ),
          0
        ) AS monthly_revenue,
        COALESCE(
          SUM(
            CASE
              WHEN DATE_TRUNC('month', COALESCE(created_at, date, NOW())) = DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
              THEN amount
              ELSE 0
            END
          ),
          0
        ) AS last_month_revenue
      FROM payments
      WHERE UPPER(COALESCE(status, '')) = 'SUCCESS';
    `;

    const bookingsQuery = `
      SELECT
        COUNT(*)::int AS total_bookings,
        COUNT(*) FILTER (WHERE UPPER(COALESCE(status, '')) = 'CANCELLED')::int AS cancelled_bookings,
        COUNT(*) FILTER (WHERE UPPER(COALESCE(status, '')) IN ('CONFIRMED', 'CANCELLED'))::int AS considered_bookings,
        COUNT(*) FILTER (
          WHERE DATE_TRUNC('month', COALESCE(booking_date, NOW())) = DATE_TRUNC('month', CURRENT_DATE)
        )::int AS current_month_bookings,
        COUNT(*) FILTER (
          WHERE DATE_TRUNC('month', COALESCE(booking_date, NOW())) = DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
        )::int AS last_month_bookings,
        COALESCE(
          ROUND(
            (
              COUNT(*) FILTER (WHERE UPPER(COALESCE(status, '')) = 'CANCELLED')
            )::numeric
            /
            NULLIF(
              (COUNT(*) FILTER (WHERE UPPER(COALESCE(status, '')) IN ('CONFIRMED', 'CANCELLED')))::numeric,
              0
            ) * 100,
            2
          ),
          0
        ) AS cancellation_rate
      FROM tickets;
    `;

    const [revenueResult, bookingsResult] = await Promise.all([
      pool.query(revenueQuery),
      pool.query(bookingsQuery),
    ]);

    const totalBookings = toNumber(bookingsResult.rows[0]?.total_bookings, 0);
    const cancellationRate = toNumber(bookingsResult.rows[0]?.cancellation_rate, 0);

    const payload = {
      totalRevenue: toNumber(revenueResult.rows[0]?.total_revenue, 0),
      monthlyRevenue: toNumber(revenueResult.rows[0]?.monthly_revenue, 0),
      lastMonthRevenue: toNumber(revenueResult.rows[0]?.last_month_revenue, 0),
      totalBookings,
      currentMonthBookings: toNumber(bookingsResult.rows[0]?.current_month_bookings, 0),
      lastMonthBookings: toNumber(bookingsResult.rows[0]?.last_month_bookings, 0),
      cancellationRate,
    };

    setCachedJson(cacheKey, payload);
    res.json(payload);
  } catch (err) {
    console.error("KPI ERROR FULL:", err?.message || err);
    console.error(err?.stack || "No stack available");
    res.status(500).json({ error: err?.message || "Failed to fetch KPI data" });
  }
};

exports.getRevenueByRoute = async (req, res) => {
  const cacheKey = "analytics:revenue-by-route";
  if (sendCachedJson(res, cacheKey)) {
    return;
  }

  try {
    const query = `
      SELECT
        CONCAT(COALESCE(tr.source, 'N/A'), ' → ', COALESCE(tr.destination, 'N/A')) AS route_name,
        COALESCE(SUM(p.amount), 0)::numeric(12,2) AS total_revenue
      FROM payments p
      JOIN tickets tk ON p.ticket_id = tk.ticket_id
      JOIN trains tr ON tk.train_id = tr.train_id
      WHERE UPPER(COALESCE(p.status, '')) = 'SUCCESS'
      GROUP BY tr.source, tr.destination
      ORDER BY total_revenue DESC
      LIMIT 8;
    `;

    const result = await pool.query(query);
    const payload = result.rows;
    setCachedJson(cacheKey, payload);
    res.json(payload);
  } catch (err) {
    console.error("Revenue By Route ERROR:", err);
    res.status(500).json({ error: "Failed to fetch revenue data" });
  }
};

exports.getOccupancyStats = async (req, res) => {
  const cacheKey = "analytics:occupancy-stats";
  if (sendCachedJson(res, cacheKey)) {
    return;
  }

  try {
    const query = `
      SELECT
        tr.train_name,
        COUNT(tk.ticket_id)::int AS booked_seats,
        tr.total_seats,
        ROUND(
          CASE
            WHEN tr.total_seats > 0 THEN (COUNT(tk.ticket_id) * 100.0 / tr.total_seats)
            ELSE 0
          END,
          2
        ) AS occupancy_percent
      FROM trains tr
      LEFT JOIN tickets tk
        ON tr.train_id = tk.train_id
       AND UPPER(COALESCE(tk.status, 'CONFIRMED')) = 'CONFIRMED'
      GROUP BY tr.train_id, tr.train_name, tr.total_seats
      ORDER BY occupancy_percent DESC;
    `;

    const result = await pool.query(query);
    const payload = result.rows;
    setCachedJson(cacheKey, payload);
    res.json(payload);
  } catch (err) {
    console.error("Occupancy ERROR:", err);
    res.status(500).json({ error: "Failed to fetch occupancy data" });
  }
};

exports.getPeakBookings = async (req, res) => {
  try {
    const rangeDays = resolveRangeDays(req.query?.range, 30);
    const cacheKey = `analytics:peak-bookings:${rangeDays}`;
    if (sendCachedJson(res, cacheKey)) {
      return;
    }

    const query = `
      SELECT
        DATE(COALESCE(booking_date, NOW())) AS booking_date,
        COUNT(*)::int AS total_bookings
      FROM tickets
      WHERE COALESCE(booking_date, NOW()) >= CURRENT_DATE - MAKE_INTERVAL(days => $1::int)
      GROUP BY DATE(COALESCE(booking_date, NOW()))
      ORDER BY booking_date;
    `;

    const result = await pool.query(query, [rangeDays]);
    const payload = result.rows;
    setCachedJson(cacheKey, payload);
    res.json(payload);
  } catch (err) {
    console.error("Peak Bookings ERROR:", err);
    res.status(500).json({ error: "Failed to fetch peak bookings" });
  }
};

exports.getRevenueByRange = async (req, res) => {
  try {
    const rangeDays = resolveRangeDays(req.query?.range, 7);
    const cacheKey = `analytics:revenue-by-range:${rangeDays}`;
    if (sendCachedJson(res, cacheKey)) {
      return;
    }

    const query = `
      SELECT
        DATE(COALESCE(p.created_at, p.date, NOW())) AS date,
        COALESCE(SUM(p.amount), 0)::numeric(12,2) AS revenue
      FROM payments p
      WHERE UPPER(COALESCE(p.status, '')) = 'SUCCESS'
        AND COALESCE(p.created_at, p.date, NOW()) >= CURRENT_DATE - ($1::int * INTERVAL '1 day')
      GROUP BY DATE(COALESCE(p.created_at, p.date, NOW()))
      ORDER BY date ASC;
    `;

    const result = await pool.query(query, [rangeDays]);
    const payload = result.rows;
    setCachedJson(cacheKey, payload);
    res.json(payload);
  } catch (err) {
    console.error("Revenue Range ERROR:", err);
    res.status(500).json({ error: "Failed to fetch revenue data" });
  }
};

exports.getRevenueTrend = exports.getRevenueByRange;

exports.getTopRoutes = async (req, res) => {
  const cacheKey = "analytics:top-routes";
  if (sendCachedJson(res, cacheKey)) {
    return;
  }

  try {
    const query = `
      SELECT
        CONCAT(COALESCE(tr.source, 'N/A'), ' → ', COALESCE(tr.destination, 'N/A')) AS route_name,
        COUNT(tk.ticket_id)::int AS total_bookings
      FROM tickets tk
      JOIN trains tr ON tk.train_id = tr.train_id
      WHERE UPPER(COALESCE(tk.status, 'CONFIRMED')) <> 'CANCELLED'
      GROUP BY tr.source, tr.destination
      ORDER BY total_bookings DESC
      LIMIT 5;
    `;

    const result = await pool.query(query);
    const payload = result.rows;
    setCachedJson(cacheKey, payload);
    res.json(payload);
  } catch (err) {
    console.error("Top Routes ERROR:", err);
    res.status(500).json({ error: "Failed to fetch top routes" });
  }
};
