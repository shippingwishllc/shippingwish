const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

function requireAuth(req, res, next) {
  const token = req.cookies.sw_token;
  if (!token) return res.status(401).json({ error: 'Not signed in.' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Session expired, please sign in again.' });
  }
}

// Usage: requireRole('dispatcher', 'admin', 'super_admin')
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not signed in.' });
    // super_admin automatically gets access to any admin-restricted endpoints
    const userRole = req.user.role;
    if (roles.includes(userRole) || (roles.includes('admin') && userRole === 'super_admin')) {
      return next();
    }
    return res.status(403).json({ error: 'You do not have access to this.' });
  };
}

function requireSuperAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not signed in.' });
  if (req.user.role !== 'super_admin' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Super Admin access required.' });
  }
  next();
}

// Helper used in auth.js route to set the session cookie
function setAuthCookie(res, token) {
  res.cookie('sw_token', token, {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });
}

module.exports = { requireAuth, requireRole, requireSuperAdmin, JWT_SECRET, setAuthCookie };
