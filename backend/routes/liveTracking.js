const express = require("express");
const router = express.Router();
const pool = require("../db");
const { getSimulationOverlay } = require("../services/trainSimulation");

/**
 * Combine a date string (YYYY-MM-DD) with a time string (HH:MM:SS) to create a Date object
 */
function combineDateAndTime(dateStr, timeStr) {
  const baseDate = dateStr || getLocalDateStr(new Date());
  const [year, month, day] = baseDate.split('-').map(Number);

  let hours = 0;
  let minutes = 0;
  let seconds = 0;

  if (timeStr instanceof Date && Number.isFinite(timeStr.getTime())) {
    hours = timeStr.getHours();
    minutes = timeStr.getMinutes();
    seconds = timeStr.getSeconds();
  } else {
    const raw = String(timeStr || '00:00:00').trim();
    const hhmmss = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);

    if (hhmmss) {
      hours = Number(hhmmss[1]) || 0;
      minutes = Number(hhmmss[2]) || 0;
      seconds = Number(hhmmss[3] || 0) || 0;
    } else {
      const parsed = new Date(raw);
      if (Number.isFinite(parsed.getTime())) {
        hours = parsed.getHours();
        minutes = parsed.getMinutes();
        seconds = parsed.getSeconds();
      }
    }
  }

  return new Date(year, (month || 1) - 1, day || 1, hours, minutes, seconds);
}

function getLocalDateStr(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function getLiveLocationHandler(req, res) {
  const { trainId } = req.params;
  const { date } = req.query;
  
  // Use provided date or default to today
  const journeyDate = date || new Date().toISOString().split('T')[0];
  const isLiveJourneyDate = journeyDate === getLocalDateStr(new Date());

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

    let simulatedSnapshot = null;
    if (isLiveJourneyDate) {
      try {
        const liveRes = await pool.query(
          `SELECT lat, lon, speed_kmh, heading, recorded_at
           FROM live_positions
           WHERE train_id = $1
           LIMIT 1`,
          [trainId]
        );
        simulatedSnapshot = liveRes.rows?.[0] || null;
      } catch {
        simulatedSnapshot = null;
      }
    }

    const overlay = isLiveJourneyDate ? getSimulationOverlay(trainId) : null;
    if (overlay && Number.isFinite(overlay.progress)) {
      progress = Math.min(1, Math.max(0, Number(overlay.progress)));
    }

    // Interpolate position between source and destination unless simulator snapshot exists
    const computedLat = tr.source_lat + (tr.dest_lat - tr.source_lat) * progress;
    const computedLng = tr.source_lng + (tr.dest_lng - tr.source_lng) * progress;
    const lat = Number.isFinite(Number(simulatedSnapshot?.lat)) ? Number(simulatedSnapshot.lat) : computedLat;
    const lng = Number.isFinite(Number(simulatedSnapshot?.lon)) ? Number(simulatedSnapshot.lon) : computedLng;
    
    // Determine status based on journey date and current time
    let status;
    if (overlay?.status) {
      status = overlay.status;
    } else if (progress >= 1) {
      status = "ARRIVED";
    } else if (progress > 0) {
      status = "RUNNING";
    } else if (now < dep) {
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

    const extraDelay = Number.isFinite(Number(overlay?.extraDelayMinutes))
      ? Number(overlay.extraDelayMinutes)
      : 0;
    const totalDelayMinutes = delayMinutes + extraDelay;

    const remainingRatio = Math.max(0, 1 - progress);
    const etaMs =
      status === "ARRIVED"
        ? arr.getTime()
        : now.getTime() + Math.max(0, totalMs) * remainingRatio + totalDelayMinutes * 60 * 1000;
    const dynamicEta = new Date(etaMs);

    res.json({
      trainId: tr.train_id,
      trainName: tr.train_name,
      source: tr.source,
      destination: tr.destination,
      progress,
      latitude: lat,
      longitude: lng,
      status,
      delayMinutes: totalDelayMinutes > 0 ? totalDelayMinutes : null,
      speedKmh: Number.isFinite(Number(simulatedSnapshot?.speed_kmh)) ? Number(simulatedSnapshot.speed_kmh) : null,
      heading: Number.isFinite(Number(simulatedSnapshot?.heading)) ? Number(simulatedSnapshot.heading) : null,
      simulator: {
        active: Boolean(overlay),
        tickProgressPercent: overlay ? Math.round(progress * 100) : null,
        lastTickAt: overlay?.updatedAt || null,
      },
      serverTime: now.toISOString(),
      departureTime: dep.toISOString(),
      arrivalTime: dynamicEta.toISOString(),     // Live ETA (dynamic)
      scheduledArrival: scheduledArr.toISOString(), // Original scheduled time
      endTime: dynamicEta.toISOString(),         // Alias for frontend compatibility
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
}

// GET /api/trains/:trainId/live-location?date=YYYY-MM-DD
router.get("/trains/:trainId/live-location", getLiveLocationHandler);

// Alias endpoint for simulation clients
router.get("/live/:trainId", getLiveLocationHandler);

module.exports = router;
