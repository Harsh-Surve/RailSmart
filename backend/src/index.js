require("dotenv").config();
const http = require("http");
const express = require("express");
const cors = require("cors");
const { Server } = require("socket.io");
const pool = require("../db");
const requireAdmin = require("../middleware/requireAdmin");

const app = express();
app.use(cors());
app.use(express.json());

// HTTP server + Socket.IO for RailRadar realtime updates
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

io.on("connection", (socket) => {
  console.log("Socket connected", socket.id);
  socket.on("disconnect", () => console.log("Socket disconnected", socket.id));
});

// ------------------------
// Health routes
// ------------------------
app.get("/", (req, res) => {
  res.json({ message: "RailSmart API is running ✅" });
});

app.get("/db-check", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({ status: "ok", time: result.rows[0].now });
  } catch (err) {
    console.error("DB check error:", err);
    res.status(500).json({ status: "error", message: "DB connection failed" });
  }
});

// ------------------------
// Mount route modules
// ------------------------
app.use("/api", require("../routes/trains"));
app.use("/api", require("../routes/tickets"));
app.use("/api", require("../routes/auth"));
app.use("/api", require("../routes/seatMap"));
app.use("/api/payment", require("../routes/payment"));
app.use("/api/payments", require("../routes/payment"));
app.use("/api", require("../routes/liveTracking"));
app.use("/api/railradar", require("../routes/railradar")(io));
app.use("/api/stations", require("../routes/stations"));

// Admin routes - protected with requireAdmin middleware
app.use("/api/admin", requireAdmin, require("../routes/admin"));

// ------------------------
// Start server
// ------------------------
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log("🔥 Backend is running and ACTIVE on port", PORT);
});

