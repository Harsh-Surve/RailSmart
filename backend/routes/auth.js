const express = require("express");
const jwt = require("jsonwebtoken");
const router = express.Router();
const pool = require("../db");
const { verifyToken } = require("../middleware/authMiddleware");
const logger = require("../utils/logger");

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

function toAuthUser(row = {}) {
  return {
    id: row.user_id,
    email: row.email,
    name: row.name,
    role: String(row.role || "user").toLowerCase(),
  };
}

function issueSessionCookie(res, user) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return { error: "JWT secret is not configured" };
  }

  const token = jwt.sign(user, secret, { expiresIn: "7d" });
  res.cookie("token", token, COOKIE_OPTIONS);
  return { token };
}

async function fetchGoogleTokenInfo(idToken) {
  const response = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return null;
  }

  const expectedAudience = process.env.GOOGLE_CLIENT_ID;
  if (expectedAudience && payload.aud !== expectedAudience) {
    return null;
  }

  if (!payload.email || payload.email_verified !== "true") {
    return null;
  }

  return payload;
}

// GET /api/auth/me
router.get(["/auth/me", "/me"], verifyToken, async (req, res) => {
  const email = String(req.user?.email || "").trim().toLowerCase();

  if (!email) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const result = await pool.query(
      `SELECT user_id, name, email, role, created_at
       FROM users
       WHERE LOWER(email) = $1
       LIMIT 1`,
      [email]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "User not found" });
    }

    const normalizedUser = toAuthUser(result.rows[0]);

    return res.json({ user: normalizedUser });
  } catch (err) {
    logger.error("auth/me error", { message: err?.message, stack: err?.stack });
    return res.status(500).json({ error: "Server error" });
  }
});

// POST /api/login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await pool.query(
      `SELECT user_id, name, email, role, password_hash
       FROM users
       WHERE email = $1 AND password_hash = $2`,
      [email, password]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: "Invalid email or password" });
    }

    const authUser = toAuthUser(result.rows[0]);
    const issueResult = issueSessionCookie(res, authUser);
    if (issueResult.error) {
      return res.status(500).json({ error: issueResult.error });
    }

    res.json({ user: authUser });
  } catch (err) {
    logger.error("Login error", { message: err?.message, stack: err?.stack, email });
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/google-login
router.post("/google-login", async (req, res) => {
  const credential = String(req.body?.credential || "").trim();

  if (!credential) {
    return res.status(400).json({ error: "Google credential is required" });
  }

  try {
    const googleProfile = await fetchGoogleTokenInfo(credential);
    if (!googleProfile) {
      return res.status(401).json({ error: "Invalid Google credential" });
    }

    const email = String(googleProfile.email || "").trim().toLowerCase();
    const name = String(googleProfile.name || email.split("@")[0] || "User").trim();

    let result = await pool.query(
      `SELECT user_id, name, email, role
       FROM users
       WHERE LOWER(email) = $1
       LIMIT 1`,
      [email]
    );

    if (!result.rows.length) {
      result = await pool.query(
        `INSERT INTO users (name, email, password_hash)
         VALUES ($1, $2, '')
         RETURNING user_id, name, email, role`,
        [name, email]
      );
    }

    const authUser = toAuthUser(result.rows[0]);
    const issueResult = issueSessionCookie(res, authUser);
    if (issueResult.error) {
      return res.status(500).json({ error: issueResult.error });
    }

    return res.json({ user: authUser });
  } catch (err) {
    logger.error("Google login error", { message: err?.message, stack: err?.stack });
    return res.status(500).json({ error: "Google login failed" });
  }
});

// POST /api/logout
router.post("/logout", (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return res.json({ message: "Logged out" });
});

// POST /api/register
router.post("/register", async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res
      .status(400)
      .json({ error: "Name, email and password are required" });
  }

  try {
    const existing = await pool.query(
      "SELECT user_id FROM users WHERE email = $1",
      [email]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING user_id, name, email, role, created_at`,
      [name, email, password]
    );

    res.status(201).json({ user: result.rows[0] });
  } catch (err) {
    logger.error("Error registering user", { message: err?.message, stack: err?.stack, email });
    res.status(500).json({ error: "Error registering user" });
  }
});

module.exports = router;
