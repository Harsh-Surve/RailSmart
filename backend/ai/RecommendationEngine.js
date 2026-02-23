const WEIGHTS = {
  availability: Number(process.env.RECO_WEIGHT_AVAILABILITY || 0.5),
  delay: Number(process.env.RECO_WEIGHT_DELAY || 0.3),
  duration: Number(process.env.RECO_WEIGHT_DURATION || 0.2),
};

function generateReasons(availabilityScore, delayScore, durationScore) {
  const reasons = [];

  if (availabilityScore > 0.7) {
    reasons.push("High seat availability");
  } else if (availabilityScore > 0.4) {
    reasons.push("Moderate seat availability");
  } else {
    reasons.push("Limited seat availability");
  }

  if (delayScore < 0.2) {
    reasons.push("Low delay");
  } else if (delayScore < 0.5) {
    reasons.push("Acceptable delay");
  } else {
    reasons.push("Higher delay risk");
  }

  if (durationScore < 0.4) {
    reasons.push("Shorter travel duration");
  } else if (durationScore < 0.7) {
    reasons.push("Moderate travel duration");
  } else {
    reasons.push("Longer travel duration");
  }

  return reasons;
}

function parseTimeToMinutes(value) {
  if (!value) return 0;
  const normalized = String(value).split(".")[0];
  const parts = normalized.split(":").map((part) => Number(part));
  const hours = Number.isFinite(parts[0]) ? parts[0] : 0;
  const minutes = Number.isFinite(parts[1]) ? parts[1] : 0;
  return hours * 60 + minutes;
}

function calculateDurationMinutes(departure, arrival) {
  const departureMinutes = parseTimeToMinutes(departure);
  const arrivalMinutes = parseTimeToMinutes(arrival);
  let diff = arrivalMinutes - departureMinutes;
  if (diff < 0) diff += 24 * 60;
  return Math.max(diff, 1);
}

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function recommendTrains(trains) {
  if (!Array.isArray(trains) || trains.length === 0) return [];

  const enriched = trains.map((train) => {
    const totalSeats = Math.max(safeNumber(train.total_seats), 1);
    const availableSeats = Math.max(safeNumber(train.available_seats), 0);
    const travelDurationMinutes = calculateDurationMinutes(train.departure_time, train.arrival_time);

    return {
      ...train,
      total_seats: totalSeats,
      available_seats: availableSeats,
      travel_duration_minutes: travelDurationMinutes,
      delay_minutes: Math.max(safeNumber(train.delay_minutes), 0),
    };
  });

  const maxDelay = Math.max(...enriched.map((train) => train.delay_minutes), 1);
  const maxDuration = Math.max(...enriched.map((train) => train.travel_duration_minutes), 1);

  const ranked = enriched.map((train) => {
    const availabilityScore = train.available_seats / train.total_seats;
    const delayScore = train.delay_minutes / maxDelay;
    const durationScore = train.travel_duration_minutes / maxDuration;

    const aiScore =
      WEIGHTS.availability * availabilityScore -
      WEIGHTS.delay * delayScore -
      WEIGHTS.duration * durationScore;

    const aiReason = generateReasons(availabilityScore, delayScore, durationScore);

    return {
      ...train,
      availability_score: Number(availabilityScore.toFixed(4)),
      delay_score: Number(delayScore.toFixed(4)),
      duration_score: Number(durationScore.toFixed(4)),
      ai_score: Number(aiScore.toFixed(4)),
      ai_reason: aiReason,
    };
  });

  return ranked.sort((left, right) => right.ai_score - left.ai_score);
}

module.exports = {
  recommendTrains,
  WEIGHTS,
};
