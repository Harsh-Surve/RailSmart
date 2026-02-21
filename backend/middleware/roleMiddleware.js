function allowRoles(...roles) {
  return (req, res, next) => {
    const userRole = String(req.user?.role || "").toLowerCase();
    const normalizedRoles = roles.map((role) => String(role || "").toLowerCase());

    if (!userRole || !normalizedRoles.includes(userRole)) {
      return res.status(403).json({ message: "Forbidden: Access denied" });
    }

    next();
  };
}

module.exports = { allowRoles };
