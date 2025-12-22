const express = require("express");
const router = express.Router();
const pool = require("../db");

// GET /api/trains/:trainId/live-location?date=YYYY-MM-DD
router.get("/trains/:trainId/live-location", async (req, res) => {
  const { trainId } = req.params;
  const { date } = req.query;

  try {
    const trainRes = await pool.query(
      `
      SELECT t.train_id, t.train_name, t.source, t.destination,
             t.departure_time, t.arrival_time,
             s1.latitude AS source_lat, s1.longitude AS source_lng,
             s2.latitude AS dest_lat,  s2.longitude AS dest_lng
      FROM trains t
      JOIN stations s1 ON s1.name = t.source
      JOIN stations s2 ON s2.name = t.destination
      WHERE t.train_id = $1
      `,
      [trainId]
    );

    if (trainRes.rows.length === 0) {
      return res.status(404).json({ error: "Train not found" });
    }

    const tr = trainRes.rows[0];

    const dep = new Date(tr.departure_time);
    const arr = new Date(tr.arrival_time);
    const now = new Date();

    const totalMs = arr.getTime() - dep.getTime();
    let progress = (now.getTime() - dep.getTime()) / (totalMs || 1);

    if (progress < 0) progress = 0;
    if (progress > 1) progress = 1;

    const lat = tr.source_lat + (tr.dest_lat - tr.source_lat) * progress;
    const lng = tr.source_lng + (tr.dest_lng - tr.source_lng) * progress;

    res.json({
      trainId: tr.train_id,
      trainName: tr.train_name,
      source: tr.source,
      destination: tr.destination,
      progress,
      latitude: lat,
      longitude: lng,
      status:
        progress <= 0 ? "NOT_STARTED" : progress >= 1 ? "ARRIVED" : "RUNNING",
      serverTime: now.toISOString(),
      departureTime: dep.toISOString(),
      arrivalTime: arr.toISOString(),
      date: date || null,
      sourceLat: tr.source_lat,
      sourceLng: tr.source_lng,
      destLat: tr.dest_lat,
      destLng: tr.dest_lng,
    });
  } catch (err) {
    console.error("Live location error:", err);
    res.status(500).json({ error: "Failed to compute live location" });
  }
});

module.exports = router;
