const pool = require("../db");
const logger = require("../utils/logger");

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

async function getAuditLogs(req, res) {
  try {
    const page = parsePositiveInt(req.query.page, 1);
    const limit = Math.min(parsePositiveInt(req.query.limit, 10), 100);
    const offset = (page - 1) * limit;

    const action = String(req.query.action || "").trim();
    const user = String(req.query.user || "").trim();
    const queryText = String(req.query.q || "").trim();
    const dateFrom = String(req.query.dateFrom || "").trim();
    const dateTo = String(req.query.dateTo || "").trim();

    const whereParts = [];
    const values = [];
    let index = 1;

    if (action) {
      whereParts.push(`a.action = $${index++}`);
      values.push(action);
    }

    if (user) {
      whereParts.push(`COALESCE(u.email, '') ILIKE $${index++}`);
      values.push(`%${user}%`);
    }

    if (queryText) {
      whereParts.push(`(
        COALESCE(u.email, '') ILIKE $${index}
        OR COALESCE(a.action, '') ILIKE $${index}
        OR COALESCE(a.details::text, '') ILIKE $${index}
      )`);
      values.push(`%${queryText}%`);
      index += 1;
    }

    if (dateFrom) {
      whereParts.push(`a.created_at >= $${index++}::timestamptz`);
      values.push(`${dateFrom}T00:00:00.000Z`);
    }

    if (dateTo) {
      whereParts.push(`a.created_at <= $${index++}::timestamptz`);
      values.push(`${dateTo}T23:59:59.999Z`);
    }

    const whereClause = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";

    const dataQuery = `
      SELECT
        a.id,
        a.action,
        a.details,
        a.created_at,
        a.user_id,
        COALESCE(u.email, 'Unknown user') AS email
      FROM audit_logs a
      LEFT JOIN users u ON a.user_id = u.user_id
      ${whereClause}
      ORDER BY a.created_at DESC
      LIMIT $${index++} OFFSET $${index++}
    `;

    const countQuery = `
      SELECT COUNT(*)::int AS total
      FROM audit_logs a
      LEFT JOIN users u ON a.user_id = u.user_id
      ${whereClause}
    `;

    const dataValues = [...values, limit, offset];
    const [dataResult, countResult] = await Promise.all([
      pool.query(dataQuery, dataValues),
      pool.query(countQuery, values),
    ]);

    const total = Number(countResult.rows[0]?.total || 0);
    const totalPages = Math.max(1, Math.ceil(total / limit));

    return res.json({
      logs: dataResult.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (err) {
    logger.error("Failed to fetch audit logs", {
      message: err?.message,
      stack: err?.stack,
    });
    return res.status(500).json({ message: "Failed to fetch audit logs" });
  }
}

module.exports = { getAuditLogs };