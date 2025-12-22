// backend/middleware/requireAdmin.js
require('dotenv').config();

const adminEmails = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

function requireAdmin(req, res, next) {
  // For now, we'll check if email is passed in headers or body
  // You can enhance this with proper JWT validation later
  const userEmail = (
    req.headers['x-user-email'] || 
    req.body?.email || 
    req.query?.email || 
    ''
  ).toLowerCase();

  if (!userEmail) {
    return res.status(401).json({ error: 'Unauthorized - No user email provided' });
  }

  if (!adminEmails.includes(userEmail)) {
    return res.status(403).json({ error: 'Admin access only' });
  }

  // Set req.user for other middleware
  req.user = { email: userEmail };
  next();
}

module.exports = requireAdmin;
