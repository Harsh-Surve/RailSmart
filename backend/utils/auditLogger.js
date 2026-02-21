const pool = require("../db");
const logger = require("./logger");

async function logAudit(userId, action, details = {}) {
  if (!userId || !action) {
    return;
  }

  try {
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, details)
       VALUES ($1, $2, $3)`,
      [userId, action, details]
    );
  } catch (err) {
    logger.error("Audit log failed", {
      userId,
      action,
      message: err?.message,
    });
  }
}

module.exports = { logAudit };