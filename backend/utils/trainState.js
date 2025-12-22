function buildDateFromTimeOrTimestamp(value, baseDate = new Date()) {
  if (!value) return null;

  const normalizeToBaseDay = (hours, minutes, seconds) =>
    new Date(
      baseDate.getFullYear(),
      baseDate.getMonth(),
      baseDate.getDate(),
      Number.isFinite(hours) ? hours : 0,
      Number.isFinite(minutes) ? minutes : 0,
      Number.isFinite(seconds) ? seconds : 0
    );

  // If pg parses timestamp into a JS Date, treat it as a time-of-day and normalize to base day.
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return normalizeToBaseDay(value.getHours(), value.getMinutes(), value.getSeconds());
  }

  const str = String(value).trim();
  if (!str) return null;

  // HH:MM or HH:MM:SS
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(str)) {
    const parts = str.split(":").map((n) => Number(n));
    return normalizeToBaseDay(parts[0], parts[1], parts[2] ?? 0);
  }

  // Timestamp string => normalize to base day time-of-day.
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return null;
  return normalizeToBaseDay(d.getHours(), d.getMinutes(), d.getSeconds());
}

function addMinutes(date, minutes) {
  if (!date) return null;
  const m = Number(minutes);
  if (!Number.isFinite(m) || m === 0) return date;
  const out = new Date(date);
  out.setMinutes(out.getMinutes() + m);
  return out;
}

function computeScheduledDurationMs(departureAt, arrivalAt) {
  if (!departureAt || !arrivalAt) return null;

  let duration = arrivalAt.getTime() - departureAt.getTime();
  if (duration <= 0) duration += 24 * 60 * 60 * 1000;
  if (!Number.isFinite(duration) || duration <= 0) return null;
  return duration;
}

function getScheduleWindow(now, departureValue, arrivalValue, delayMinutes = 0) {
  const depToday = buildDateFromTimeOrTimestamp(departureValue, now);
  const arrToday = buildDateFromTimeOrTimestamp(arrivalValue, now);
  if (!depToday || !arrToday) return null;

  // Overnight if arrival time-of-day is <= departure time-of-day
  if (arrToday.getTime() <= depToday.getTime()) {
    // If it's after midnight but before today's arrival time, the departure was yesterday.
    if (now.getTime() < arrToday.getTime()) {
      const dep = new Date(depToday);
      dep.setDate(dep.getDate() - 1);
      return { departureAt: dep, arrivalAt: addMinutes(arrToday, delayMinutes) };
    }

    // Otherwise, the arrival is tomorrow.
    const arr = new Date(arrToday);
    arr.setDate(arr.getDate() + 1);
    return { departureAt: depToday, arrivalAt: addMinutes(arr, delayMinutes) };
  }

  return { departureAt: depToday, arrivalAt: addMinutes(arrToday, delayMinutes) };
}

function getTrainStatus(now, departureAt, arrivalAt) {
  if (now.getTime() < departureAt.getTime()) return "NOT_STARTED";
  if (now.getTime() >= arrivalAt.getTime()) return "ARRIVED";
  return "RUNNING";
}

function computeProgressFromSchedule(now, departureAt, arrivalAt) {
  const dep = departureAt.getTime();
  const arr = arrivalAt.getTime();
  const denom = arr - dep;
  if (!Number.isFinite(denom) || denom <= 0) return 0;
  const t = (now.getTime() - dep) / denom;
  return Math.min(1, Math.max(0, t));
}

module.exports = {
  buildDateFromTimeOrTimestamp,
  computeScheduledDurationMs,
  getScheduleWindow,
  getTrainStatus,
  computeProgressFromSchedule,
};
