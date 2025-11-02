const getRoleLevel = (role) => {
  const levels = { Employee: 1, Admin: 2, SuperAdmin: 3 };
  return levels[role] || 0;
};

const authorizeRoles = (minRole) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Not authenticated' });
  if (getRoleLevel(req.user.role) < getRoleLevel(minRole)) {
    return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
  }
  next();
};

module.exports = authorizeRoles;
