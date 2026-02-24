import { getClassConfig } from "../config/trainClasses";

export const calculateClassAdjustedPrice = (basePrice, classType) => {
  const base = Number(basePrice || 0);
  const classConfig = getClassConfig(classType);
  const adjustedBase = base * classConfig.multiplier;
  return {
    base,
    multiplier: classConfig.multiplier,
    adjustedBase,
    classType: classConfig.classType,
    classLabel: classConfig.label,
    classWeight: classConfig.weight,
  };
};

const safeNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const rerankTrainsByClass = (trains, classType) => {
  const list = Array.isArray(trains) ? trains : [];
  if (list.length === 0) return [];

  const classConfig = getClassConfig(classType);
  const maxDelay = Math.max(...list.map((train) => safeNumber(train.delay_minutes || train.delayMinutes)), 1);
  const maxDuration = Math.max(...list.map((train) => safeNumber(train.travel_duration_minutes || train.travelDurationMinutes)), 1);

  const ranked = list.map((train) => {
    const totalSeats = Math.max(safeNumber(train.total_seats || train.availableSeats || train.totalSeats), 1);
    const availableSeats = Math.max(safeNumber(train.available_seats || train.availableSeats), 0);
    const delayMinutes = Math.max(safeNumber(train.delay_minutes || train.delayMinutes), 0);
    const durationMinutes = Math.max(safeNumber(train.travel_duration_minutes || train.travelDurationMinutes), 1);

    const availabilityScore = availableSeats / totalSeats;
    const delayScore = delayMinutes / maxDelay;
    const durationScore = durationMinutes / maxDuration;
    const classBoost = 0.1 * classConfig.weight;

    const aiScore =
      0.5 * availabilityScore -
      0.3 * delayScore -
      0.2 * durationScore +
      classBoost;

    const classPrice = calculateClassAdjustedPrice(train.base_price ?? train.price ?? train.basePrice, classConfig.classType);

    return {
      ...train,
      class_type: classConfig.classType,
      class_label: classPrice.classLabel,
      class_multiplier: classPrice.multiplier,
      base_price: classPrice.base,
      price: Number(classPrice.adjustedBase.toFixed(2)),
      ai_score: Number(aiScore.toFixed(4)),
      class_boost: Number(classBoost.toFixed(4)),
    };
  });

  return ranked.sort((left, right) => right.ai_score - left.ai_score);
};
