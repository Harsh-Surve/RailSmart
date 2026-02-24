const TRAIN_CLASSES = {
  SL: { label: "Sleeper", multiplier: 1, weight: 0.1 },
  "3AC": { label: "3 AC", multiplier: 2.5, weight: 0.2 },
  "2AC": { label: "2 AC", multiplier: 4, weight: 0.3 },
};

const DEFAULT_CLASS = "SL";

function normalizeClassType(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "SLEEPER") return "SL";
  if (normalized === "AC") return "3AC";
  if (normalized === "1AC") return "2AC";
  if (normalized === "CHAIR" || normalized === "CC") return "3AC";
  return TRAIN_CLASSES[normalized] ? normalized : DEFAULT_CLASS;
}

function getClassConfig(value) {
  const classType = normalizeClassType(value);
  return {
    classType,
    ...(TRAIN_CLASSES[classType] || TRAIN_CLASSES[DEFAULT_CLASS]),
  };
}

module.exports = {
  TRAIN_CLASSES,
  DEFAULT_CLASS,
  normalizeClassType,
  getClassConfig,
};
