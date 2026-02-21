const { verifyToken } = require("./authMiddleware");
const { allowRoles } = require("./roleMiddleware");

const adminOnly = allowRoles("admin");

function requireAdmin(req, res, next) {
  return verifyToken(req, res, (verifyErr) => {
    if (verifyErr) {
      return next(verifyErr);
    }
    return adminOnly(req, res, next);
  });
}

module.exports = requireAdmin;
