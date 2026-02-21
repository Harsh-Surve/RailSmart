const logger = require("../utils/logger");

function errorHandler(err, req, res, next) {
  logger.error("Unhandled error", {
    message: err?.message,
    stack: err?.stack,
    route: req.originalUrl,
    method: req.method,
    ip: req.ip,
  });

  if (res.headersSent) {
    return next(err);
  }

  return res.status(err?.statusCode || 500).json({
    message: "Internal Server Error",
  });
}

module.exports = { errorHandler };