function formatLocalDate(dateValue) {
  const year = dateValue.getFullYear();
  const month = String(dateValue.getMonth() + 1).padStart(2, "0");
  const day = String(dateValue.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const MONTHS = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};

const WEEKDAYS = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function normalizeCity(value) {
  if (!value) return null;
  const cleaned = String(value)
    .replace(/[^a-zA-Z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  return cleaned
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function parseMonthDayDate(raw, lower) {
  const onDayMonth = lower.match(/\bon\s+(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)/i);
  const monthDay = lower.match(/\b([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i);
  const match = onDayMonth || monthDay;
  if (!match) return null;

  const day = Number(onDayMonth ? match[1] : match[2]);
  const monthName = String(onDayMonth ? match[2] : match[1]).toLowerCase();
  const monthIndex = MONTHS[monthName];
  if (!Number.isFinite(day) || day < 1 || day > 31 || monthIndex === undefined) return null;

  const now = new Date();
  let year = now.getFullYear();
  let parsed = new Date(year, monthIndex, day);
  if (parsed < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
    year += 1;
    parsed = new Date(year, monthIndex, day);
  }
  return formatLocalDate(parsed);
}

function parseNextWeekday(lower) {
  const nextWeekdayMatch = lower.match(/\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
  if (!nextWeekdayMatch) return null;
  const weekdayName = String(nextWeekdayMatch[1]).toLowerCase();
  const targetDay = WEEKDAYS[weekdayName];
  if (targetDay === undefined) return null;

  const now = new Date();
  const currentDay = now.getDay();
  let delta = (targetDay - currentDay + 7) % 7;
  if (delta === 0) delta = 7;
  const dateValue = new Date(now);
  dateValue.setDate(now.getDate() + delta);
  return formatLocalDate(dateValue);
}

function parseDateFromText(raw, lower) {
  const relativeWeekday = parseNextWeekday(lower);
  if (relativeWeekday) return relativeWeekday;

  if (lower.includes("day after tomorrow")) {
    const dateValue = new Date();
    dateValue.setDate(dateValue.getDate() + 2);
    return formatLocalDate(dateValue);
  }

  if (lower.includes("tomorrow")) {
    const dateValue = new Date();
    dateValue.setDate(dateValue.getDate() + 1);
    return formatLocalDate(dateValue);
  }

  if (lower.includes("today")) {
    return formatLocalDate(new Date());
  }

  const ymdMatch = raw.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (ymdMatch) {
    return ymdMatch[1];
  }

  const dmyMatch = raw.match(/\b(\d{2})[\/-](\d{2})[\/-](\d{4})\b/);
  if (dmyMatch) {
    const [, day, month, year] = dmyMatch;
    return `${year}-${month}-${day}`;
  }

  const monthDay = parseMonthDayDate(raw, lower);
  if (monthDay) return monthDay;

  return null;
}

function parseClassFromText(lower) {
  if (/(\b2\s*ac\b|\b2ac\b)/i.test(lower)) return "2AC";
  if (/(\b3\s*ac\b|\b3ac\b|\bac\b|air\s*conditioned|chair\s*car|\bcc\b)/i.test(lower)) return "3AC";
  if (/(\bsleeper\b|\bsl\b)/i.test(lower)) return "SL";
  return null;
}

function extractEntities(text) {
  const raw = String(text || "").trim();
  const lower = raw.toLowerCase();

  let source = null;
  let destination = null;
  let travelClass = null;
  let date = null;
  let trainNumber = null;

  const trainNumberMatch = lower.match(/\btrain(?:\s*(?:number|no|#))?\s*(\d{4,6})\b/i);
  if (trainNumberMatch) {
    trainNumber = trainNumberMatch[1];
  }

  const fromToMatch = raw.match(/from\s+([a-zA-Z\s]+?)\s+to\s+([a-zA-Z\s]+?)(?:\s+(?:today|tomorrow|day after tomorrow|on\b|\d{2}[\/-]\d{2}[\/-]\d{4}|\d{4}-\d{2}-\d{2})|$)/i);
  if (fromToMatch) {
    source = normalizeCity(fromToMatch[1]);
    destination = normalizeCity(fromToMatch[2]);
  }

  const toFromMatch = raw.match(/to\s+([a-zA-Z\s]+?)\s+from\s+([a-zA-Z\s]+?)(?:\s|$)/i);
  if (toFromMatch) {
    destination = destination || normalizeCity(toFromMatch[1]);
    source = source || normalizeCity(toFromMatch[2]);
  }

  if (!source || !destination) {
    const routeMatch = raw.match(/\b([a-zA-Z][a-zA-Z\s]{1,30}?)\s+to\s+([a-zA-Z][a-zA-Z\s]{1,30}?)(?=\s+(?:on\b|today\b|tomorrow\b|day after tomorrow\b|next\b|\d{1,2}[\/-]\d{1,2}[\/-]\d{4}|\d{4}-\d{2}-\d{2})|$)/i);
    if (routeMatch) {
      const candidateSource = normalizeCity(routeMatch[1]);
      const candidateDestination = normalizeCity(routeMatch[2]);
      if (candidateSource && candidateDestination) {
        const invalidSource = /\b(book|ticket|travel|going|want|need|search|show|train)\b/i.test(routeMatch[1]);
        if (!invalidSource) {
          source = source || candidateSource;
        }
        destination = destination || candidateDestination;
      }
    }
  }

  if (!source) {
    const fromMatch = raw.match(/from\s+([a-zA-Z\s]+?)(?:\s|$)/i);
    if (fromMatch) source = normalizeCity(fromMatch[1]);
  }

  if (!destination) {
    const toMatch = raw.match(/to\s+([a-zA-Z\s]+?)(?:\s+(?:today|tomorrow|day after tomorrow|on\b|next\b)|$)/i);
    if (toMatch) destination = normalizeCity(toMatch[1]);
  }

  travelClass = parseClassFromText(lower);
  date = parseDateFromText(raw, lower);

  return { source, destination, travelClass, date, trainNumber };
}

module.exports = extractEntities;
