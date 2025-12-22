// backend/routes/stations.js
const express = require("express");
const router = express.Router();
const pool = require("../db");

// GET /api/stations/search?q=mum
router.get("/search", async (req, res) => {
  const q = (req.query.q || "").trim();

  if (!q) {
    return res.json({ stations: [] });
  }

  try {
    const result = await pool.query(
      `
      SELECT name
      FROM stations
      WHERE LOWER(name) LIKE LOWER($1)
      ORDER BY name
      LIMIT 10
      `,
      [`${q}%`]   // "mum%" → Mumbai, etc.
    );

    return res.json({ stations: result.rows });
  } catch (err) {
    console.error("Error searching stations:", err);
    return res.status(500).json({ error: "Failed to search stations" });
  }
});

module.exports = router;
