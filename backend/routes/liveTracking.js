const express = require("express");
const router = express.Router();
const pool = require("../db");

/**
 * Combine a date string (YYYY-MM-DD) with a time string (HH:MM:SS) to create a Date object
 */
function combineDateAndTime(dateStr, timeStr) {
  // Default to today if no date provided
  const baseDate = dateStr || new Date().toISOString().split('T')[0];
  
  // Parse time (handle both HH:MM:SS and HH:MM formats)
  const timeParts = (timeStr || '00:00:00').split(':');
  const hours = parseInt(timeParts[0], 10) || 0;
  const minutes = parseInt(timeParts[1], 10) || 0;
  const seconds = parseInt(timeParts[2], 10) || 0;
  
  // Create date from YYYY-MM-DD
  const [year, month, day] = baseDate.split('-').map(Number);
  const result = new Date(year, month - 1, day, hours, minutes, seconds);
  
  return result;
}

// GET /api/trains/:trainId/live-location?date=YYYY-MM-DD
router.get("/trains/:trainId/live-location", async (req, res) => {
  const { trainId } = req.params;
  const { date } = req.query;
  
  // Use provided date or default to today
  const journeyDate = date || new Date().toISOString().split('T')[0];

  try {
    const trainRes = await pool.query(
      `
      SELECT t.train_id, t.train_name, t.source, t.destination,
             t.departure_time, t.arrival_time,
             t.scheduled_departure, t.scheduled_arrival,
             t.delay_minutes,
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
    
    // ✅ CORRECT: Combine journey date with train's scheduled times
    const depTime = tr.scheduled_departure || tr.departure_time || '00:00:00';
    const arrTime = tr.scheduled_arrival || tr.arrival_time || '23:59:59';
    
    const dep = combineDateAndTime(journeyDate, depTime);
    let arr = combineDateAndTime(journeyDate, arrTime);
    
    // Handle overnight trains: if arrival <= departure, arrival is next day
    if (arr <= dep) {
      arr.setDate(arr.getDate() + 1);
    }
    
    // Apply delay if any (extends arrival time)
    const delayMinutes = parseInt(tr.delay_minutes, 10) || 0;
    if (delayMinutes > 0) {
      arr.setMinutes(arr.getMinutes() + delayMinutes);
    }

    const now = new Date();

    const totalMs = arr.getTime() - dep.getTime();
    let progress = (now.getTime() - dep.getTime()) / (totalMs || 1);

    // Clamp progress to [0, 1]
    if (progress < 0) progress = 0;
    if (progress > 1) progress = 1;

    // Interpolate position between source and destination
    const lat = tr.source_lat + (tr.dest_lat - tr.source_lat) * progress;
    const lng = tr.source_lng + (tr.dest_lng - tr.source_lng) * progress;
    
    // Determine status based on journey date and current time
    let status;
    if (now < dep) {
      status = "NOT_STARTED";
    } else if (now >= dep && now < arr) {
      status = "RUNNING";
    } else {
      status = "ARRIVED";
    }
    
    // Calculate scheduled arrival (without delay) for display
    const scheduledArr = combineDateAndTime(journeyDate, arrTime);
    if (scheduledArr <= dep) {
      scheduledArr.setDate(scheduledArr.getDate() + 1);
    }

    res.json({
      trainId: tr.train_id,
      trainName: tr.train_name,
      source: tr.source,
      destination: tr.destination,
      progress,
      latitude: lat,
      longitude: lng,
      status,
      delayMinutes: delayMinutes > 0 ? delayMinutes : null,
      serverTime: now.toISOString(),
      departureTime: dep.toISOString(),
      arrivalTime: arr.toISOString(),           // Live ETA (with delay)
      scheduledArrival: scheduledArr.toISOString(), // Original scheduled time
      endTime: arr.toISOString(),               // Alias for frontend compatibility
      journeyDate,
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
