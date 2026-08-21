const pool = require('../db');

/**
 * Create an in-app notification for a user.
 */
async function createNotification(userId, title, message, type = 'info', link = null) {
  if (!userId || !title || !message) return null;
  try {
    const result = await pool.query(
      `INSERT INTO notifications (user_id, title, message, type, link)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, title, message, type, link || null]
    );
    return result.rows[0];
  } catch (err) {
    console.error('[NOTIFICATION_CREATE_ERROR]', err.message);
    return null;
  }
}

/**
 * Notify all super_admins and admins
 */
async function notifyAdmins(title, message, type = 'info', link = null) {
  try {
    const admins = await pool.query(`SELECT id FROM users WHERE role IN ('super_admin', 'admin') AND is_suspended = FALSE`);
    const promises = admins.rows.map(admin => createNotification(admin.id, title, message, type, link));
    await Promise.all(promises);
  } catch (err) {
    console.error('[NOTIFY_ADMINS_ERROR]', err.message);
  }
}

module.exports = { createNotification, notifyAdmins };
