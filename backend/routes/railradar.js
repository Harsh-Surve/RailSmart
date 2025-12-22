// backend/routes/railradar.js
const express = require("express");
const fetch = require("node-fetch");
const pool = require("../db");
const requireAdmin = require("../middleware/requireAdmin");
const {
  buildDateFromTimeOrTimestamp,
  computeScheduledDurationMs,
  computeProgressFromSchedule,
  getScheduleWindow,
  getTrainStatus,
} = require("../utils/trainState");

const RAILRADAR_BASE_URL = "https://railradar.in/api/v1";

module.exports = function railradarRouter(io) {
  const router = express.Router();

  // in-memory live store + simulator registry
  const liveStore = new Map(); // trainId -> snapshot
  const metaCache = new Map(); // trainId -> latest meta (incl delay_minutes)
  const sims = new Map(); // trainId -> interval id

  // ----------------------
  // External station search (kept for parity with previous route)
  // ----------------------
  router.get("/stations", async (req, res) => {
    const q = (req.query.q || "").trim();

    if (!q) {
      return res.status(400).json({ error: "Missing q query parameter" });
    }

    try {
      const url =
        `${RAILRADAR_BASE_URL}/search/stations` +
        `?q=${encodeURIComponent(q)}&provider=railradar`;

      const rrRes = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "RailSmart-Student-Project/1.0",
          Referer: "https://railradar.in/",
        },
      });

      if (!rrRes.ok) {
        const txt = await rrRes.text();
        console.error("RailRadar error:", rrRes.status, txt);
        return res.status(502).json({ error: "RailRadar API error" });
      }

      const body = await rrRes.json();

      // Extract stations from body.data.stations and add label field
      const stations = (body?.data?.stations || []).map((s) => ({
        code: s.code,
        name: s.name,
        label: `${s.name} (${s.code})`,
      }));

      res.json({ stations });
    } catch (err) {
      console.error("Error calling RailRadar:", err);
      res.status(500).json({ error: "Failed to fetch stations" });
    }
  });

  // ----------------------
  // Core RailRadar APIs
  // ----------------------

  // List trains that can be tracked
  router.get("/trains", async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT train_id, train_name, source, destination
         FROM trains
         ORDER BY train_id ASC
         LIMIT 200`
      );
      res.json(rows || []);
    } catch (err) {
      console.error("RailRadar /trains error:", err);
      res.status(500).json({ error: "Failed to load trains" });
    }
  });

  // Snapshot for a given train
  router.get("/train/:id", async (req, res) => {
    const trainId = Number(req.params.id);
    if (!Number.isFinite(trainId)) {
      return res.status(400).json({ error: "Invalid train id" });
    }

    try {
      const meta = (await getTrainMeta(trainId)) || createFallbackMeta(trainId);

      // Auto-start simulation based on schedule window
      const now = new Date();
      const schedule = getScheduleWindow(
        now,
        meta?.departure_time,
        meta?.arrival_time,
        meta?.delay_minutes || 0
      );
      const scheduleStatus = schedule
        ? getTrainStatus(now, schedule.departureAt, schedule.arrivalAt)
        : null;

      if (!sims.has(trainId) && scheduleStatus === "RUNNING") {
        console.log(`🚆 Auto-starting simulation for train ${trainId}`);
        startSimulation(trainId, meta, { scheduleWindow: schedule });
      }

      // If it already ended, stop any running simulation
      if (sims.has(trainId) && scheduleStatus === "ARRIVED") {
        stopSimulation(trainId);
      }

      const dbSnapshot = await getLatestSnapshot(trainId);
      const memorySnapshot = liveStore.get(trainId);
      const snapshot = dbSnapshot || memorySnapshot || {
        train_id: trainId,
        lat: meta.source_lat,
        lon: meta.source_lng,
        speed_kmh: 0,
        heading: 0,
        recorded_at: new Date().toISOString(),
      };

      const payload = buildPayload(snapshot, meta);
      res.json(payload);
    } catch (err) {
      console.error("RailRadar snapshot error:", err);
      res.status(500).json({ error: "Failed to fetch live data" });
    }
  });

  // Delay a train by X minutes (admin)
  router.post("/delay/:trainId", requireAdmin, async (req, res) => {
    const trainId = Number(req.params.trainId);
    if (!Number.isFinite(trainId)) {
      return res.status(400).json({ error: "Invalid train id" });
    }

    const delayMinutesRaw = req.body?.delayMinutes;
    const delayMinutes = Number(delayMinutesRaw);
    if (!Number.isFinite(delayMinutes) || delayMinutes < 0) {
      return res.status(400).json({ error: "delayMinutes must be a non-negative number" });
    }

    try {
      await pool.query(
        "UPDATE trains SET delay_minutes = $1 WHERE train_id = $2",
        [Math.floor(delayMinutes), trainId]
      );

      // Update cached meta so running simulations reflect delay instantly.
      if (metaCache.has(trainId)) {
        const current = metaCache.get(trainId);
        metaCache.set(trainId, { ...current, delay_minutes: Math.floor(delayMinutes) });
      } else {
        await getTrainMeta(trainId);
      }

      // Push an immediate update if we have a snapshot.
      const meta = metaCache.get(trainId) || (await getTrainMeta(trainId));
      const dbSnapshot = await getLatestSnapshot(trainId);
      const memorySnapshot = liveStore.get(trainId);
      const snapshot = dbSnapshot || memorySnapshot;
      if (meta && snapshot) {
        const payload = buildPayload(snapshot, meta);
        io.emit("railradar:train:update", payload);
      }

      res.json({ message: `Train delayed by ${Math.floor(delayMinutes)} minutes` });
    } catch (err) {
      console.error("RailRadar delay error:", err);
      res.status(500).json({ error: "Failed to set delay" });
    }
  });

  // Start simulated run for a train (admin)
  router.post("/simulate/:id/start", requireAdmin, async (req, res) => {
    const trainId = Number(req.params.id);
    if (!Number.isFinite(trainId)) {
      return res.status(400).json({ error: "Invalid train id" });
    }

    try {
      const meta = await getTrainMeta(trainId);
      if (!meta) {
        return res.status(404).json({ error: "Train not found" });
      }

      startSimulation(trainId, meta);
      res.json({ ok: true, trainId });
    } catch (err) {
      console.error("RailRadar simulate start error:", err);
      res.status(500).json({ error: "Failed to start simulation" });
    }
  });

  // Stop simulated run (admin)
  router.post("/simulate/:id/stop", requireAdmin, (req, res) => {
    const trainId = Number(req.params.id);
    if (!Number.isFinite(trainId)) {
      return res.status(400).json({ error: "Invalid train id" });
    }

    stopSimulation(trainId);
    res.json({ ok: true, trainId });
  });

  // List active simulations (admin)
  router.get("/simulate/active", requireAdmin, (_req, res) => {
    res.json({ active: Array.from(sims.keys()) });
  });

  // ----------------------
  // Helpers
  // ----------------------

  async function getTrainMeta(trainId) {
    const { rows } = await pool.query(
      `SELECT t.train_id, t.train_name, t.source, t.destination,
              t.departure_time, t.arrival_time,
              COALESCE(t.delay_minutes, 0) AS delay_minutes,
              s1.latitude AS source_lat, s1.longitude AS source_lng,
              s2.latitude AS dest_lat,  s2.longitude AS dest_lng
       FROM trains t
       LEFT JOIN stations s1 ON s1.name = t.source
       LEFT JOIN stations s2 ON s2.name = t.destination
       WHERE t.train_id = $1
       LIMIT 1`,
      [trainId]
    );

    if (!rows || rows.length === 0) return null;

    const row = rows[0];
    // Fallback coords if station coordinates are missing
    const fallbackLat = 19 + (trainId % 10) * 0.05;
    const fallbackLng = 73 + (trainId % 10) * 0.05;

    const meta = {
      ...row,
      source_lat: row.source_lat ?? fallbackLat,
      source_lng: row.source_lng ?? fallbackLng,
      dest_lat: row.dest_lat ?? fallbackLat + 0.3,
      dest_lng: row.dest_lng ?? fallbackLng + 0.3,
    };

    metaCache.set(trainId, meta);
    return meta;
  }

  function createFallbackMeta(trainId) {
    const baseLat = 19 + (trainId % 10) * 0.05;
    const baseLng = 73 + (trainId % 10) * 0.05;
    const meta = {
      train_id: trainId,
      train_name: `Train ${trainId}`,
      source: "Source",
      destination: "Destination",
      departure_time: "00:00",
      arrival_time: "23:59",
      delay_minutes: 0,
      source_lat: baseLat,
      source_lng: baseLng,
      dest_lat: baseLat + 0.3,
      dest_lng: baseLng + 0.3,
    };

    metaCache.set(trainId, meta);
    return meta;
  }

  // schedule helpers moved to backend/utils/trainState.js

  async function getLatestSnapshot(trainId) {
    const { rows } = await pool.query(
      `SELECT train_id, lat, lon, speed_kmh, heading, recorded_at
       FROM live_positions
       WHERE train_id = $1
       LIMIT 1`,
      [trainId]
    );
    return rows?.[0] || null;
  }

  function computeProgress(snapshot, meta) {
    const dx = meta.dest_lat - meta.source_lat;
    const dy = meta.dest_lng - meta.source_lng;
    const denom = dx * dx + dy * dy || 1;
    const t = ((snapshot.lat - meta.source_lat) * dx + (snapshot.lon - meta.source_lng) * dy) / denom;
    return Math.min(1, Math.max(0, t));
  }

  function buildPayload(snapshot, meta) {
    const now = new Date();
    const schedule = getScheduleWindow(
      now,
      meta?.departure_time,
      meta?.arrival_time,
      meta?.delay_minutes || 0
    );
    const scheduledDurationMs = schedule
      ? computeScheduledDurationMs(schedule.departureAt, schedule.arrivalAt)
      : null;

    const progress = Number.isFinite(snapshot?.progress)
      ? Math.min(1, Math.max(0, snapshot.progress))
      : schedule
      ? computeProgressFromSchedule(now, schedule.departureAt, schedule.arrivalAt)
      : computeProgress(snapshot, meta);

    const status = schedule
      ? getTrainStatus(now, schedule.departureAt, schedule.arrivalAt)
      : progress <= 0
      ? "NOT_STARTED"
      : progress >= 0.99
      ? "ARRIVED"
      : "RUNNING";

    return {
      trainId: meta.train_id,
      trainName: meta.train_name,
      source: meta.source,
      destination: meta.destination,
      lat: snapshot.lat,
      lon: snapshot.lon,
      speedKmh: snapshot.speed_kmh ?? null,
      heading: snapshot.heading ?? null,
      recordedAt: snapshot.recorded_at || new Date().toISOString(),
      startTime: schedule ? schedule.departureAt.getTime() : null,
      endTime: schedule ? schedule.arrivalAt.getTime() : null,
      scheduledDurationMs,
      delayMinutes: meta?.delay_minutes || 0,
      sourceLat: meta.source_lat,
      sourceLng: meta.source_lng,
      destLat: meta.dest_lat,
      destLng: meta.dest_lng,
      progress,
      status,
    };
  }

  async function persistSnapshot(snapshot) {
    await pool.query(
      `INSERT INTO live_positions (train_id, lat, lon, speed_kmh, heading, recorded_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (train_id)
       DO UPDATE SET
         lat = EXCLUDED.lat,
         lon = EXCLUDED.lon,
         speed_kmh = EXCLUDED.speed_kmh,
         heading = EXCLUDED.heading,
         recorded_at = EXCLUDED.recorded_at`,
      [
        snapshot.train_id,
        snapshot.lat,
        snapshot.lon,
        snapshot.speed_kmh,
        snapshot.heading,
        snapshot.recorded_at,
      ]
    );
  }

  function startSimulation(trainId, meta, opts = {}) {
    if (sims.has(trainId)) return;

    metaCache.set(trainId, meta);

    const route = makeRoute(meta);

    const now = new Date();
    const schedule =
      opts.scheduleWindow ||
      getScheduleWindow(now, meta?.departure_time, meta?.arrival_time, meta?.delay_minutes || 0);
    const departureAt =
      schedule?.departureAt || buildDateFromTimeOrTimestamp(meta.departure_time, now) || now;
    const arrivalAt =
      schedule?.arrivalAt || buildDateFromTimeOrTimestamp(meta.arrival_time, now);
    const scheduledDurationMs = computeScheduledDurationMs(departureAt, arrivalAt) || 60 * 60 * 1000;

    const getProgressFromClock = () => {
      const now = Date.now();
      const dep = departureAt.getTime();
      const t = (now - dep) / scheduledDurationMs;
      return Math.min(1, Math.max(0, t));
    };

    const run = async () => {
      const progress = getProgressFromClock();
      const idxFloat = progress * (route.length - 1);
      const idx = Math.floor(idxFloat);
      const nextIdx = Math.min(route.length - 1, idx + 1);
      const frac = idxFloat - idx;

      const a = route[idx];
      const b = route[nextIdx];
      const lat = a.lat + (b.lat - a.lat) * frac;
      const lon = a.lon + (b.lon - a.lon) * frac;
      const heading = a.heading;

      const snapshot = {
        train_id: trainId,
        lat,
        lon,
        speed_kmh: Math.round(40 + Math.random() * 60),
        heading,
        recorded_at: new Date().toISOString(),
        progress,
      };

      liveStore.set(trainId, snapshot);
      try {
        await persistSnapshot(snapshot);
      } catch (err) {
        console.error("Failed to persist live position", err);
      }

      const currentMeta = metaCache.get(trainId) || meta;
      const payload = buildPayload(snapshot, currentMeta);
      io.emit("railradar:train:update", payload);

      if (progress >= 1) {
        stopSimulation(trainId);
      }
    };

    // kick off immediately, then at interval
    run();
    const intervalId = setInterval(run, 2000);
    sims.set(trainId, intervalId);
  }

  function stopSimulation(trainId) {
    const intervalId = sims.get(trainId);
    if (intervalId) {
      clearInterval(intervalId);
    }
    sims.delete(trainId);
  }

  function makeRoute(meta) {
    const points = [];
    const steps = 80;
    const startLat = meta.source_lat;
    const startLng = meta.source_lng;
    const endLat = meta.dest_lat;
    const endLng = meta.dest_lng;

    for (let i = 0; i < steps; i += 1) {
      const t = i / (steps - 1);
      const lat = startLat + (endLat - startLat) * t;
      const lon = startLng + (endLng - startLng) * t + Math.sin(i / 5) * 0.01;
      const heading = i === 0 ? 0 : calcHeading(points[i - 1], { lat, lon });
      points.push({ lat, lon, heading });
    }

    return points;
  }

  function calcHeading(from, to) {
    if (!from || !to) return 0;
    const y = Math.sin(to.lon - from.lon) * Math.cos(to.lat);
    const x =
      Math.cos(from.lat) * Math.sin(to.lat) -
      Math.sin(from.lat) * Math.cos(to.lat) * Math.cos(to.lon - from.lon);
    const brng = Math.atan2(y, x);
    return ((brng * 180) / Math.PI + 360) % 360;
  }

  return router;
};
