const extractEntities = require("./entityExtractor");
const { getClassifier } = require("./intentClassifier");
const logger = require("../utils/logger");
const pool = require("../db");

class AssistantEngine {
  constructor(options = {}) {
    this.confidenceThreshold = Number(options.confidenceThreshold ?? process.env.ASSISTANT_CONFIDENCE_THRESHOLD ?? 0.4);
    this.cityCache = new Map();
  }

  normalizeCity(value) {
    const cleaned = String(value || "")
      .replace(/[^a-zA-Z\s-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleaned) return null;
    return cleaned
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  }

  isLikelySingleSlotInput(message) {
    const cleaned = String(message || "")
      .replace(/[^a-zA-Z\s-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!cleaned) return false;
    const words = cleaned.split(" ");
    if (words.length > 3) return false;
    if (/\b(from|to|on|today|tomorrow|next|book|ticket|train|travel|going|want|need|class|ac|sleeper)\b/i.test(cleaned)) {
      return false;
    }
    return true;
  }

  async resolveCityFromDb(candidate) {
    const normalizedCandidate = this.normalizeCity(candidate);
    if (!normalizedCandidate) return null;

    const cacheKey = normalizedCandidate.toLowerCase();
    if (this.cityCache.has(cacheKey)) {
      return this.cityCache.get(cacheKey);
    }

    try {
      const stationMatch = await pool.query(
        `SELECT name
         FROM stations
         WHERE LOWER(name) = LOWER($1)
         LIMIT 1`,
        [normalizedCandidate]
      );

      if (stationMatch.rows.length > 0) {
        const exactName = this.normalizeCity(stationMatch.rows[0].name) || normalizedCandidate;
        this.cityCache.set(cacheKey, exactName);
        return exactName;
      }
    } catch {
      // fall through to train-route based validation
    }

    try {
      const trainMatch = await pool.query(
        `SELECT source AS city
         FROM trains
         WHERE LOWER(source) = LOWER($1)
         UNION
         SELECT destination AS city
         FROM trains
         WHERE LOWER(destination) = LOWER($1)
         LIMIT 1`,
        [normalizedCandidate]
      );

      if (trainMatch.rows.length > 0) {
        const exactName = this.normalizeCity(trainMatch.rows[0].city) || normalizedCandidate;
        this.cityCache.set(cacheKey, exactName);
        return exactName;
      }
    } catch {
      // no-op, return null below
    }

    this.cityCache.set(cacheKey, null);
    return null;
  }

  async applySequentialBookingSlotFill({ message, context, entities, intent }) {
    if (intent !== "BOOK_TRAIN") return entities;
    if (!this.isLikelySingleSlotInput(message)) return entities;

    const nextEntities = { ...entities };
    const resolvedCity = await this.resolveCityFromDb(message);
    if (!resolvedCity) return nextEntities;

    const source = nextEntities.source ? this.normalizeCity(nextEntities.source) : null;
    const destination = nextEntities.destination ? this.normalizeCity(nextEntities.destination) : null;

    if (!source && !destination) {
      nextEntities.destination = resolvedCity;
    } else if (!source) {
      if (destination && destination.toLowerCase() === resolvedCity.toLowerCase()) {
        nextEntities.duplicateCityNotice = `You already selected ${destination} as destination. Please share a different source city.`;
      } else {
        nextEntities.source = resolvedCity;
      }
    } else if (!destination) {
      if (source.toLowerCase() === resolvedCity.toLowerCase()) {
        nextEntities.duplicateCityNotice = `You already selected ${source} as source. Where would you like to travel?`;
      } else {
        nextEntities.destination = resolvedCity;
      }
    }

    if (!nextEntities.travelClass && !context.travelClass) {
      const classHint = String(message || "").toLowerCase();
      if (/\b(2\s*ac|2ac)\b/.test(classHint)) nextEntities.travelClass = "2AC";
      if (/\b(3\s*ac|3ac|ac|chair\s*car|cc|air\s*conditioned)\b/.test(classHint)) nextEntities.travelClass = "3AC";
      if (/\b(sleeper|sl)\b/.test(classHint)) nextEntities.travelClass = "SL";
    }

    return nextEntities;
  }

  normalizeContext(context = {}) {
    const input = context && typeof context === "object" ? context : {};
    return {
      intent: typeof input.intent === "string" ? input.intent : null,
      source: typeof input.source === "string" ? input.source : null,
      destination: typeof input.destination === "string" ? input.destination : null,
      travelClass: typeof input.travelClass === "string" ? input.travelClass : null,
      date: typeof input.date === "string" ? input.date : null,
      trainNumber: typeof input.trainNumber === "string" ? input.trainNumber : null,
    };
  }

  mergeEntities(context, currentEntities) {
    return {
      source: currentEntities.source || context.source || null,
      destination: currentEntities.destination || context.destination || null,
      travelClass: currentEntities.travelClass || context.travelClass || null,
      date: currentEntities.date || context.date || null,
      trainNumber: currentEntities.trainNumber || context.trainNumber || null,
    };
  }

  isDateOnOrAfterToday(dateValue) {
    if (!dateValue) return false;
    const raw = String(dateValue).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;

    const parsed = new Date(`${raw}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return false;

    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return parsed >= startOfToday;
  }

  getDateValidationError(userMessage, currentDate) {
    const message = String(userMessage || "").toLowerCase();

    if (/\byesterday\b|\blast\s+(week|month|year)\b/.test(message)) {
      return "Travel date must be today or later. Please choose a valid future date.";
    }

    if (currentDate && !this.isDateOnOrAfterToday(currentDate)) {
      return "Travel date must be today or later. Please choose a valid future date.";
    }

    if (/\b\d{4}-\d{2}-\d{2}\b/.test(message) && currentDate && !this.isDateOnOrAfterToday(currentDate)) {
      return "Travel date must be today or later. Please choose a valid future date.";
    }

    return null;
  }

  getMissingBookingFields(entities) {
    const missing = [];
    if (!entities.source) missing.push("source");
    if (!entities.destination) missing.push("destination");
    if (!entities.date) missing.push("date");
    if (!entities.travelClass) missing.push("travelClass");
    return missing;
  }

  resolveIntent({ contextIntent, inferredIntent, normalizedConfidence, extractedEntities }) {
    const hasBookingEntity = Boolean(
      extractedEntities.source || extractedEntities.destination || extractedEntities.travelClass || extractedEntities.date
    );
    const hasTrackingEntity = Boolean(extractedEntities.trainNumber);

    if (hasTrackingEntity && (inferredIntent === "TRACK_TRAIN" || contextIntent === "TRACK_TRAIN")) {
      return "TRACK_TRAIN";
    }

    if (hasBookingEntity && (inferredIntent === "BOOK_TRAIN" || contextIntent === "BOOK_TRAIN")) {
      return "BOOK_TRAIN";
    }

    if (hasBookingEntity) {
      return "BOOK_TRAIN";
    }

    if (hasTrackingEntity) {
      return "TRACK_TRAIN";
    }

    if (normalizedConfidence >= this.confidenceThreshold) {
      return inferredIntent;
    }

    if (contextIntent && hasBookingEntity) {
      return contextIntent;
    }

    if (contextIntent && hasTrackingEntity) {
      return contextIntent;
    }

    if (contextIntent === "BOOK_TRAIN") {
      return "BOOK_TRAIN";
    }

    if (contextIntent === "TRACK_TRAIN") {
      return "TRACK_TRAIN";
    }

    return "UNKNOWN";
  }

  getStatus(intent, entities, missingFields, lowConfidence) {
    if (lowConfidence) return "LOW_CONFIDENCE";
    if (intent === "BOOK_TRAIN") return missingFields.length > 0 ? "COLLECTING_INFO" : "READY_TO_SEARCH";
    if (intent === "TRACK_TRAIN") return entities.trainNumber ? "SHOW_RESULTS" : "COLLECTING_INFO";
    if (intent === "INFO_QUERY" || intent === "GREETING" || intent === "CANCEL_TICKET") return "INFO_MODE";
    return "LOW_CONFIDENCE";
  }

  generateReply(intent, entities, status, options = {}) {
    const dateValidationError = options?.dateValidationError || null;
    const duplicateCityNotice = options?.duplicateCityNotice || null;

    if (status === "LOW_CONFIDENCE") {
      return "I’m not confident I understood. Could you rephrase?";
    }

    if (intent === "GREETING") {
      return "Hello! How can I assist you with your travel today?";
    }

    if (intent === "INFO_QUERY") {
      return "You can search trains, book tickets, track trains, and manage refunds using RailSmart.";
    }

    if (intent === "TRACK_TRAIN") {
      if (entities.trainNumber) {
        return `Showing live tracking details for train ${entities.trainNumber}.`;
      }
      return "Please share your train number or name, and I can help you with tracking steps.";
    }

    if (intent === "CANCEL_TICKET") {
      return "You can cancel from My Tickets before departure time. Share your PNR if you need help with next steps.";
    }

    if (intent === "BOOK_TRAIN") {
      if (duplicateCityNotice) return duplicateCityNotice;
      if (!entities.source) return "From which city are you travelling?";
      if (!entities.destination) return "Where would you like to travel?";
      if (dateValidationError) return dateValidationError;
      if (!entities.date) return "When are you planning to travel?";
      if (!entities.travelClass) return "Available classes: SL, 3AC, 2AC. Which do you prefer?";

      return `Searching trains from ${entities.source} to ${entities.destination} on ${entities.date} in ${entities.travelClass} class.`;
    }

    return "I’m not confident I understood. Could you rephrase?";
  }

  async process(message, context = {}) {
    const userMessage = String(message || "").trim();
    const requestId = typeof context?.requestId === "string" ? context.requestId : null;
    if (!userMessage) {
      return {
        error: "message is required",
        status: 400,
      };
    }

    const normalizedContext = this.normalizeContext(context);
  logger.info("[AI] Incoming message", { requestId, message: userMessage, context: normalizedContext });

    const classifier = await getClassifier();
    const confidence = classifier.getClassifications(userMessage);
    const top = confidence[0] || { label: "UNKNOWN", value: 0 };
    const scoreSum = confidence.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
    const normalizedConfidence = scoreSum > 0 ? (Number(top.value) || 0) / scoreSum : 0;

    const extractedEntities = extractEntities(userMessage);
    const intent = this.resolveIntent({
      contextIntent: normalizedContext.intent,
      inferredIntent: top.label || "UNKNOWN",
      normalizedConfidence,
      extractedEntities,
    });
    logger.info("[AI] Intent classified", {
      requestId,
      intent,
      confidenceScore: normalizedConfidence,
      topClass: top.label || "UNKNOWN",
      top3: confidence.slice(0, 3),
      threshold: this.confidenceThreshold,
      extractedEntities,
    });

    let entities = this.mergeEntities(normalizedContext, extractedEntities);
    entities = await this.applySequentialBookingSlotFill({
      message: userMessage,
      context: normalizedContext,
      entities,
      intent,
    });
    const dateValidationError = intent === "BOOK_TRAIN" ? this.getDateValidationError(userMessage, entities.date) : null;
    if (dateValidationError) {
      entities.date = null;
    }

    const missingFields = intent === "BOOK_TRAIN" ? this.getMissingBookingFields(entities) : [];
    const lowConfidence = normalizedConfidence < this.confidenceThreshold && intent === "UNKNOWN";
    const status = this.getStatus(intent, entities, missingFields, lowConfidence);
    const updatedContext = {
      intent,
      source: entities.source,
      destination: entities.destination,
      travelClass: entities.travelClass,
      date: entities.date,
      trainNumber: entities.trainNumber,
    };
    logger.info("[AI] Context updated", { requestId, updatedContext, status, missingFields });

    const reply = this.generateReply(intent, entities, status, {
      dateValidationError,
      duplicateCityNotice: entities.duplicateCityNotice || null,
    });

    return {
      intent,
      confidence,
      confidenceScore: normalizedConfidence,
      confidenceTop: {
        label: top.label || "UNKNOWN",
        value: Number(top.value) || 0,
      },
      entities,
      missingFields,
      reply,
      status,
      updatedContext,
      context: updatedContext,
    };
  }
}

module.exports = AssistantEngine;
