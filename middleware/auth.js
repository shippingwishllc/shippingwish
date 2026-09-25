const jwt = require('jsonwebtoken');
const pool = require('../db');
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET || (IS_PRODUCTION ? null : 'dev-secret-change-me');
if (!JWT_SECRET) throw new Error('JWT_SECRET must be configured in production.');

function extractToken(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return req.cookies ? (req.cookies.sw_token || req.cookies.nlw_token) : null;
}

async function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: 'Not signed in.' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);

    // DAT-Style Concurrent Session Verification
    if (req.user && req.user.session_id) {
      try {
        const sess = await pool.query(
          'SELECT id FROM user_active_sessions WHERE session_id = $1',
          [req.user.session_id]
        );
        if (sess.rows.length === 0) {
          clearAuthCookie(res, req);
          return res.status(401).json({
            error: 'Your session has ended because this account was logged into from another device or computer.',
            code: 'CONCURRENT_SESSION_TERMINATED'
          });
        }
      } catch (dbErr) {
        // Fail-open on transient database connection errors
      }
    }

    next();
  } catch (e) {
    return res.status(401).json({ error: 'Session expired, please sign in again.' });
  }
}

// Usage: requireRole('dispatcher', 'admin', 'super_admin')
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not signed in.' });
    // super_admin automatically gets universal access to any restricted endpoints
    const userRole = req.user.role;
    if (userRole === 'super_admin' || req.user.is_super_admin || roles.includes(userRole) || (roles.includes('admin') && userRole === 'super_admin')) {
      return next();
    }
    return res.status(403).json({ error: 'You do not have access to this.' });
  };
}

function requireSuperAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not signed in.' });
  if (req.user.role !== 'super_admin' && req.user.role !== 'admin' && !req.user.is_super_admin) {
    return res.status(403).json({ error: 'Super Admin access required.' });
  }
  next();
}

async function optionalAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    req.user = null;
    return next();
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    if (req.user && req.user.session_id) {
      try {
        const sess = await pool.query(
          'SELECT id FROM user_active_sessions WHERE session_id = $1',
          [req.user.session_id]
        );
        if (sess.rows.length === 0) {
          req.user = null;
        }
      } catch {}
    }
  } catch (e) {
    req.user = null;
  }
  next();
}

// Helper used in auth.js route to set the session cookie
function setAuthCookie(res, token) {
  const isSecure = process.env.NODE_ENV === 'production' || (process.env.APP_URL && process.env.APP_URL.startsWith('https://'));
  res.cookie('sw_token', token, {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });
}

function clearAuthCookie(res, req) {
  const isSecure = process.env.NODE_ENV === 'production' || (process.env.APP_URL && process.env.APP_URL.startsWith('https://')) || (req && (req.secure || req.headers['x-forwarded-proto'] === 'https'));
  
  const clearOpts = {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax',
    path: '/'
  };

  res.clearCookie('sw_token', clearOpts);
  res.clearCookie('sw_token', { path: '/' });
  res.clearCookie('sw_token', { path: '/', domain: '.shippingwish.com' });
  res.clearCookie('sw_token', { path: '/', domain: 'shippingwish.com' });

  // Force Set-Cookie headers with 1970 expiration and Max-Age=0 across all domain variants
  res.header('Set-Cookie', [
    `sw_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; SameSite=Lax${isSecure ? '; Secure' : ''}`,
    `sw_token=; Path=/; Domain=.shippingwish.com; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; SameSite=Lax${isSecure ? '; Secure' : ''}`,
    `sw_token=; Path=/; Domain=shippingwish.com; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; SameSite=Lax${isSecure ? '; Secure' : ''}`
  ]);
}

module.exports = { requireAuth, requireRole, requireSuperAdmin, optionalAuth, extractToken, JWT_SECRET, setAuthCookie, clearAuthCookie };

