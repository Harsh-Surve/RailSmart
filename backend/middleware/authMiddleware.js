const jwt = require("jsonwebtoken");

function verifyToken(req, res, next) {
  try {
    const token = req.cookies?.token;

    if (!token) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.error("JWT_SECRET is not configured");
      return res.status(500).json({ message: "Server auth misconfiguration" });
    }

    const decoded = jwt.verify(token, secret);
    req.user = decoded;
    next();
  } catch (_err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

module.exports = { verifyToken };
