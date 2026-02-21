require("dotenv").config();
const http = require("http");
const { Server } = require("socket.io");
const { createApp } = require("./app");
const logger = require("../utils/logger");
const { startTrainSimulationEngine } = require("../services/trainSimulation");

if (!process.env.JWT_SECRET) {
  logger.error("Missing required environment variable", { key: "JWT_SECRET" });
}

if (!process.env.GOOGLE_CLIENT_ID) {
  logger.warn("Google audience validation disabled because GOOGLE_CLIENT_ID is not set");
}

let ioInstance = null;
const ioProxy = {
  emit: (...args) => ioInstance?.emit?.(...args),
  on: (...args) => ioInstance?.on?.(...args),
  to: (...args) => ioInstance?.to?.(...args),
};

const app = createApp(ioProxy);
const frontendOrigins = String(process.env.FRONTEND_URL || "http://localhost:5173")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const socketOrigin = frontendOrigins.length === 1 ? frontendOrigins[0] : frontendOrigins;

// HTTP server + Socket.IO for RailRadar realtime updates
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: socketOrigin,
    credentials: true,
  },
});

ioInstance = io;

io.on("connection", (socket) => {
  logger.info("Socket connected", { socketId: socket.id });
  socket.on("join-train", (payload) => {
    const trainId = Number(payload?.trainId);
    if (!Number.isFinite(trainId)) {
      return;
    }
    socket.join(`train:${trainId}`);
  });

  socket.on("leave-train", (payload) => {
    const trainId = Number(payload?.trainId);
    if (!Number.isFinite(trainId)) {
      return;
    }
    socket.leave(`train:${trainId}`);
  });

  socket.on("disconnect", () => logger.info("Socket disconnected", { socketId: socket.id }));
});

// ------------------------
// Start server
// ------------------------
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  logger.info("Backend server started", { port: PORT });

  if (process.env.NODE_ENV !== "test" && String(process.env.ENABLE_TRAIN_SIMULATION || "true") !== "false") {
    const tickMs = Number(process.env.TRAIN_SIMULATION_TICK_MS) || 5000;
    startTrainSimulationEngine({ tickMs, io });
    logger.info("Train simulation engine started", { tickMs });
  }
});

