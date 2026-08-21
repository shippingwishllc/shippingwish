const pool = require('../db');

/**
 * Log a system action into audit_log table.
 * Does not throw errors to prevent blocking main requests.
 */
async function auditLog(userId, action, entityType = null, entityId = null, payload = null, ipAddress = null) {
  try {
    await pool.query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, payload, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId || null, action, entityType, entityId, payload ? JSON.stringify(payload) : null, ipAddress || null]
    );
  } catch (err) {
    console.error('[AUDIT_LOG_ERROR]', err.message);
  }
}

/**
 * Express middleware helper to get client IP address.
 */
function getClientIp(req) {
  return (req.headers['x-forwarded-for'] || req.ip || req.socket.remoteAddress || '').split(',')[0].trim();
}

module.exports = { auditLog, getClientIp };
