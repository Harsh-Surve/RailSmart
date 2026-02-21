const fs = require("fs");
const path = require("path");
const winston = require("winston");

const logsDirectory = path.join(__dirname, "..", "logs");
if (!fs.existsSync(logsDirectory)) {
  fs.mkdirSync(logsDirectory, { recursive: true });
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === "production" ? "info" : "debug"),
  defaultMeta: { service: "railsmart-backend" },
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: path.join(logsDirectory, "error.log"),
      level: "error",
    }),
    new winston.transports.File({
      filename: path.join(logsDirectory, "combined.log"),
    }),
  ],
});

module.exports = logger;