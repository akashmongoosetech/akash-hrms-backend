const getRoleLevel = (role) => {
  const levels = { Employee: 1, HR: 2, Manager: 3, Admin: 4, SuperAdmin: 5 };
  return levels[role] || 0;
};

const authorizeRoles = (allowedRoles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Not authenticated' });

  if (Array.isArray(allowedRoles)) {
    // Check if user's role is in the allowed roles array
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
    }
  } else {
    // Use level comparison for backward compatibility
    if (getRoleLevel(req.user.role) < getRoleLevel(allowedRoles)) {
      return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
    }
  }
  next();
};

module.exports = authorizeRoles;
