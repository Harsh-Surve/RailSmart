const pool = require("../db");

const stateByTrain = new Map();
let tickTimer = null;

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function combineDateAndTime(dateStr, timeStr) {
  const now = new Date();
  const baseDate =
    dateStr ||
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const [year, month, day] = baseDate.split("-").map((part) => Number(part));

  let hours = 0;
  let minutes = 0;
  let seconds = 0;

  if (timeStr instanceof Date && Number.isFinite(timeStr.getTime())) {
    hours = timeStr.getHours();
    minutes = timeStr.getMinutes();
    seconds = timeStr.getSeconds();
  } else {
    const raw = String(timeStr || "00:00:00").trim();
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

function getScheduleWindow({ now, departureTime, arrivalTime, delayMinutes }) {
  const today = now.toISOString().slice(0, 10);
  const departureAt = combineDateAndTime(today, departureTime || "00:00:00");
  let arrivalAt = combineDateAndTime(today, arrivalTime || "23:59:59");

  if (arrivalAt <= departureAt) {
    arrivalAt.setDate(arrivalAt.getDate() + 1);
  }

  if (delayMinutes > 0) {
    arrivalAt.setMinutes(arrivalAt.getMinutes() + delayMinutes);
  }

  return { departureAt, arrivalAt };
}

function getStatus(now, departureAt, arrivalAt) {
  if (now < departureAt) return "NOT_STARTED";
  if (now >= arrivalAt) return "ARRIVED";
  return "RUNNING";
}

function interpolate(start, end, progress) {
  return start + (end - start) * progress;
}

function calculateHeadingDeg(sourceLat, sourceLng, destLat, destLng) {
  const dy = destLat - sourceLat;
  const dx = destLng - sourceLng;
  const angle = (Math.atan2(dx, dy) * 180) / Math.PI;
  return Number((angle + 360) % 360);
}

function buildFallbackCoords(trainId) {
  const baseLat = 18.95 + (trainId % 25) * 0.12;
  const baseLng = 72.7 + (trainId % 25) * 0.1;
  return {
    sourceLat: baseLat,
    sourceLng: baseLng,
    destLat: baseLat + 0.55,
    destLng: baseLng + 0.6,
  };
}

async function getTrainRowsForSimulation() {
  try {
    const { rows } = await pool.query(
      `SELECT t.train_id,
              t.departure_time,
              t.arrival_time,
              COALESCE(t.delay_minutes, 0) AS base_delay_minutes,
              s1.latitude AS source_lat,
              s1.longitude AS source_lng,
              s2.latitude AS dest_lat,
              s2.longitude AS dest_lng
       FROM trains t
       LEFT JOIN stations s1 ON s1.name = t.source
       LEFT JOIN stations s2 ON s2.name = t.destination
       ORDER BY t.train_id ASC
       LIMIT 200`
    );

    return rows.map((row) => {
      const fallback = buildFallbackCoords(row.train_id);
      return {
        trainId: Number(row.train_id),
        departureTime: row.departure_time,
        arrivalTime: row.arrival_time,
        baseDelayMinutes: toNumber(row.base_delay_minutes, 0),
        sourceLat: toNumber(row.source_lat, fallback.sourceLat),
        sourceLng: toNumber(row.source_lng, fallback.sourceLng),
        destLat: toNumber(row.dest_lat, fallback.destLat),
        destLng: toNumber(row.dest_lng, fallback.destLng),
      };
    });
  } catch {
    const { rows } = await pool.query(
      `SELECT train_id,
              departure_time,
              arrival_time,
              COALESCE(delay_minutes, 0) AS base_delay_minutes
       FROM trains
       ORDER BY train_id ASC
       LIMIT 200`
    );

    return rows.map((row) => {
      const fallback = buildFallbackCoords(row.train_id);
      return {
        trainId: Number(row.train_id),
        departureTime: row.departure_time,
        arrivalTime: row.arrival_time,
        baseDelayMinutes: toNumber(row.base_delay_minutes, 0),
        sourceLat: fallback.sourceLat,
        sourceLng: fallback.sourceLng,
        destLat: fallback.destLat,
        destLng: fallback.destLng,
      };
    });
  }
}

async function upsertLivePosition({ trainId, lat, lon, speedKmh, heading }) {
  const updateResult = await pool.query(
    `UPDATE live_positions
     SET lat = $2,
         lon = $3,
         speed_kmh = $4,
         heading = $5,
         recorded_at = NOW()
     WHERE train_id = $1`,
    [trainId, lat, lon, speedKmh, heading]
  );

  if (updateResult.rowCount > 0) {
    return;
  }

  await pool.query(
    `INSERT INTO live_positions (train_id, lat, lon, speed_kmh, heading, recorded_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [trainId, lat, lon, speedKmh, heading]
  );
}

async function tickSimulation(io) {
  const now = new Date();
  const trains = await getTrainRowsForSimulation();

  await Promise.all(
    trains.map(async (train) => {
      const existing = stateByTrain.get(train.trainId) || {
        progress: 0,
        extraDelayMinutes: 0,
      };

      const totalDelay = train.baseDelayMinutes + existing.extraDelayMinutes;
      const { departureAt, arrivalAt } = getScheduleWindow({
        now,
        departureTime: train.departureTime,
        arrivalTime: train.arrivalTime,
        delayMinutes: totalDelay,
      });

      const status = getStatus(now, departureAt, arrivalAt);

      let progress = existing.progress;
      let extraDelayMinutes = existing.extraDelayMinutes;

      if (status === "NOT_STARTED") {
        progress = 0;
      } else if (status === "ARRIVED") {
        progress = 1;
      } else {
        progress = Math.min(1, Math.max(progress, 0) + 0.02);

        if (Math.random() < 0.1) {
          extraDelayMinutes = Math.min(120, extraDelayMinutes + 2);
        }
      }

      const lat = interpolate(train.sourceLat, train.destLat, progress);
      const lon = interpolate(train.sourceLng, train.destLng, progress);
      const heading = calculateHeadingDeg(train.sourceLat, train.sourceLng, train.destLat, train.destLng);
      const speedKmh = status === "RUNNING" ? 55 + Math.floor(Math.random() * 40) : 0;
      const totalDelayMinutes = train.baseDelayMinutes + extraDelayMinutes;

      stateByTrain.set(train.trainId, {
        progress,
        extraDelayMinutes,
        status,
        updatedAt: now.toISOString(),
      });

      await upsertLivePosition({
        trainId: train.trainId,
        lat,
        lon,
        speedKmh,
        heading,
      });

      if (io?.emit) {
        const payload = {
          trainId: train.trainId,
          latitude: lat,
          longitude: lon,
          current_lat: lat,
          current_lng: lon,
          progress,
          progressPercent: Math.round(progress * 100),
          speedKmh,
          heading,
          delayMinutes: totalDelayMinutes > 0 ? totalDelayMinutes : 0,
          status,
          recordedAt: now.toISOString(),
        };

        io.emit("train-update", payload);
        io.to?.(`train:${train.trainId}`)?.emit?.("train-update", payload);
      }
    })
  );
}

function getSimulationOverlay(trainId) {
  const id = Number(trainId);
  if (!Number.isFinite(id)) return null;
  return stateByTrain.get(id) || null;
}

function startTrainSimulationEngine({ tickMs = 5000, io = null } = {}) {
  if (tickTimer) {
    return () => {
      clearInterval(tickTimer);
      tickTimer = null;
    };
  }

  tickSimulation(io).catch((err) => {
    console.warn("[TrainSimulation] initial tick failed:", err?.message || err);
  });

  tickTimer = setInterval(() => {
    tickSimulation(io).catch((err) => {
      console.warn("[TrainSimulation] tick failed:", err?.message || err);
    });
  }, Math.max(1000, Number(tickMs) || 5000));

  return () => {
    if (tickTimer) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
  };
}

module.exports = {
  startTrainSimulationEngine,
  getSimulationOverlay,
};
