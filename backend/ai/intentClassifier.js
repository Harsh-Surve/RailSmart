const fs = require("fs");
const path = require("path");
const natural = require("natural");

const MODEL_PATH = path.join(__dirname, "intent-model.json");
const MODEL_META_PATH = path.join(__dirname, "intent-model.meta.json");
const MODEL_VERSION = 3;

const TRAINING_DATA = {
	BOOK_TRAIN: [
		"book ticket",
		"reserve seat",
		"i want to travel",
		"book sleeper ticket",
		"book ac ticket",
		"book train",
		"find trains",
		"need a ticket",
		"reserve a seat",
		"i need train booking",
		"search train for delhi",
		"going to mumbai",
		"travel to pune",
		"show trains from chennai to bangalore",
		"is there seat available",
		"check train seats",
		"book for tomorrow",
		"book railway ticket",
		"can you book my train",
		"want to book journey",
		"help me book a ticket",
		"help me book",
		"i want to book",
		"i wanna book",
		"assist me with booking",
		"book for me",
		"book something for me",
		"train booking",
		"ticket booking",
		"i need ticket booking",
		"need train ticket",
		"reserve ticket",
		"i want to reserve seat",
		"find train for me",
		"get me a ticket",
		"can you help me book",
		"book my ticket",
		"book my seat",
		"book ticket from mumbai to pune",
		"book ac seat",
		"book sleeper seat",
		"book ticket for tomorrow",
		"need booking assistance",
		"help with train booking",
		"i need a train",
		"i need to travel tomorrow",
		"want to reserve train seat",
		"please book train ticket",
		"can you book ticket for me",
		"need railway ticket",
	],
	TRACK_TRAIN: [
		"track my train",
		"where is train",
		"train location",
		"live train status",
		"where is my train now",
		"train running status",
		"show train on map",
		"track train",
		"check live location",
		"is train delayed",
	],
	CANCEL_TICKET: [
		"cancel my ticket",
		"i want refund",
		"cancel booking",
		"cancel this train ticket",
		"i need to cancel my journey",
		"how to cancel ticket",
		"start refund process",
		"i booked wrong ticket cancel it",
		"refund my booking",
		"cancel pnr",
		"ticket cancellation",
		"please cancel my booking",
		"refund status",
		"where is my refund",
		"cancel confirmed ticket",
		"i want to cancel my reservation",
		"initiate cancellation",
		"how do i cancel my train ticket",
		"cancel and refund my ticket",
		"raise refund request",
	],
	INFO_QUERY: [
		"how to book",
		"what is tatkal",
		"how refund works",
		"how payment works",
		"what can you do",
		"what features do you have",
		"booking rules",
		"cancellation policy",
		"how can i track train",
		"tell me about railsmart",
		"show me app features",
		"what services are available",
	],
	GREETING: [
		"hello",
		"hi",
		"hey",
		"good morning",
		"good evening",
		"hii",
		"namaste",
		"hola",
	],
};

let classifierPromise = null;

function createClassifierFromTrainingData() {
	const classifier = new natural.BayesClassifier();
	for (const [intent, examples] of Object.entries(TRAINING_DATA)) {
		for (const example of examples) {
			classifier.addDocument(example, intent);
		}
	}
	classifier.train();
	return classifier;
}

function loadClassifier(modelPath) {
	return new Promise((resolve, reject) => {
		natural.BayesClassifier.load(modelPath, null, (error, classifier) => {
			if (error) return reject(error);
			return resolve(classifier);
		});
	});
}

function saveClassifier(classifier, modelPath) {
	return new Promise((resolve, reject) => {
		classifier.save(modelPath, (error) => {
			if (error) return reject(error);
			return resolve();
		});
	});
}

function readModelVersion() {
	try {
		if (!fs.existsSync(MODEL_META_PATH)) return null;
		const parsed = JSON.parse(fs.readFileSync(MODEL_META_PATH, "utf8"));
		const version = Number(parsed?.version);
		return Number.isFinite(version) ? version : null;
	} catch {
		return null;
	}
}

function writeModelVersion(version) {
	try {
		fs.writeFileSync(
			MODEL_META_PATH,
			JSON.stringify({ version, updatedAt: new Date().toISOString() }, null, 2),
			"utf8"
		);
	} catch {
		// ignore metadata write failures
	}
}

async function initializeClassifier() {
	const currentVersion = readModelVersion();
	if (fs.existsSync(MODEL_PATH) && currentVersion === MODEL_VERSION) {
		try {
			return await loadClassifier(MODEL_PATH);
		} catch {
			// fall through to retrain
		}
	}

	const classifier = createClassifierFromTrainingData();
	try {
		await saveClassifier(classifier, MODEL_PATH);
		writeModelVersion(MODEL_VERSION);
	} catch {
		// continue without blocking runtime
	}
	return classifier;
}

async function getClassifier() {
	if (!classifierPromise) {
		classifierPromise = initializeClassifier();
	}
	return classifierPromise;
}

async function retrainClassifier() {
	const classifier = createClassifierFromTrainingData();
	await saveClassifier(classifier, MODEL_PATH);
	writeModelVersion(MODEL_VERSION);
	classifierPromise = Promise.resolve(classifier);
	return classifier;
}

module.exports = {
	getClassifier,
	retrainClassifier,
	MODEL_PATH,
	MODEL_META_PATH,
	MODEL_VERSION,
};
