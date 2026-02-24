export const TRAIN_CLASSES = {
  SL: { label: "Sleeper", multiplier: 1, weight: 0.1 },
  "3AC": { label: "3 AC", multiplier: 2.5, weight: 0.2 },
  "2AC": { label: "2 AC", multiplier: 4, weight: 0.3 },
};

export const DEFAULT_CLASS = "SL";

export const normalizeClassType = (value) => {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "SLEEPER") return "SL";
  if (normalized === "AC") return "3AC";
  if (normalized === "1AC") return "2AC";
  if (normalized === "CC" || normalized === "CHAIR") return "3AC";
  return TRAIN_CLASSES[normalized] ? normalized : DEFAULT_CLASS;
};

export const getClassConfig = (classType) => {
  const normalizedClass = normalizeClassType(classType);
  return {
    classType: normalizedClass,
    ...(TRAIN_CLASSES[normalizedClass] || TRAIN_CLASSES[DEFAULT_CLASS]),
  };
};
