const pool = require('../db');

const TRASH_RETENTION_DAYS = parseInt(process.env.TRASH_RETENTION_DAYS || '30', 10);

function getRetentionDays() {
  const n = parseInt(process.env.TRASH_RETENTION_DAYS || '30', 10);
  return Number.isFinite(n) && n > 0 ? n : 30;
}

function trashPurgeMeta(deletedAt) {
  const retentionDays = getRetentionDays();
  if (!deletedAt) {
    return { retentionDays, daysLeft: null, purgeAt: null };
  }
  const deleted = new Date(deletedAt);
  const purgeAt = new Date(deleted);
  purgeAt.setDate(purgeAt.getDate() + retentionDays);
  const daysLeft = Math.max(0, Math.ceil((purgeAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
  return {
    retentionDays,
    daysLeft,
    purgeAt: purgeAt.toISOString()
  };
}

function enrichTrashItem(item) {
  const meta = trashPurgeMeta(item.deleted_at);
  return { ...item, ...meta };
}

async function purgeExpiredTrash() {
  const days = getRetentionDays();
  const dayStr = String(days);

  const loads = await pool.query(
    `DELETE FROM loads WHERE deleted_at IS NOT NULL AND deleted_at < now() - ($1 || ' days')::interval RETURNING id`,
    [dayStr]
  );
  const drivers = await pool.query(
    `DELETE FROM drivers WHERE deleted_at IS NOT NULL AND deleted_at < now() - ($1 || ' days')::interval RETURNING id`,
    [dayStr]
  );
  const emails = await pool.query(
    `DELETE FROM email_inbound WHERE deleted_at IS NOT NULL AND deleted_at < now() - ($1 || ' days')::interval RETURNING id`,
    [dayStr]
  );

  const oldUsers = await pool.query(
    `SELECT id FROM users WHERE deleted_at IS NOT NULL AND deleted_at < now() - ($1 || ' days')::interval`,
    [dayStr]
  );
  let usersDeleted = 0;
  for (const row of oldUsers.rows) {
    const ok = await permanentlyDeleteUser(row.id);
    if (ok) usersDeleted += 1;
  }

  return {
    retentionDays: days,
    purged: {
      loads: loads.rowCount || 0,
      drivers: drivers.rowCount || 0,
      emails: emails.rowCount || 0,
      users: usersDeleted
    }
  };
}

async function permanentlyDeleteUser(id) {
  const check = await pool.query('SELECT id, role FROM users WHERE id = $1 AND deleted_at IS NOT NULL', [id]);
  if (!check.rows.length) return false;
  if (check.rows[0].role === 'super_admin') {
    const countRes = await pool.query("SELECT COUNT(*) FROM users WHERE role = 'super_admin' AND deleted_at IS NULL");
    if (parseInt(countRes.rows[0].count, 10) <= 1) return false;
  }

  await pool.query('DELETE FROM loads WHERE carrier_id = $1', [id]).catch(() => {});
  await pool.query('DELETE FROM trucks WHERE carrier_id = $1', [id]).catch(() => {});
  await pool.query('DELETE FROM drivers WHERE carrier_id = $1', [id]).catch(() => {});
  await pool.query('DELETE FROM trailers WHERE carrier_id = $1', [id]).catch(() => {});
  await pool.query('DELETE FROM documents WHERE carrier_id = $1', [id]).catch(() => {});
  await pool.query('DELETE FROM dispatcher_carriers WHERE carrier_id = $1', [id]).catch(() => {});
  await pool.query('DELETE FROM billing_subscriptions WHERE user_id = $1', [id]).catch(() => {});
  await pool.query('DELETE FROM signup_pending WHERE lower(email) = lower((SELECT email FROM users WHERE id = $1))', [id]).catch(() => {});
  const res = await pool.query('DELETE FROM users WHERE id = $1 AND deleted_at IS NOT NULL', [id]);
  return res.rowCount > 0;
}

async function permanentlyDeleteItem(type, id) {
  if (type === 'load') {
    const res = await pool.query('DELETE FROM loads WHERE id = $1 AND deleted_at IS NOT NULL RETURNING id', [id]);
    return res.rows.length > 0;
  }
  if (type === 'driver') {
    const res = await pool.query('DELETE FROM drivers WHERE id = $1 AND deleted_at IS NOT NULL RETURNING id', [id]);
    return res.rows.length > 0;
  }
  if (type === 'email') {
    const res = await pool.query('DELETE FROM email_inbound WHERE id = $1 AND deleted_at IS NOT NULL RETURNING id', [id]);
    return res.rows.length > 0;
  }
  if (type === 'user') {
    return permanentlyDeleteUser(id);
  }
  return false;
}

let lastAutoPurge = 0;
async function maybeAutoPurgeTrash() {
  const now = Date.now();
  if (now - lastAutoPurge < 60 * 60 * 1000) return null;
  lastAutoPurge = now;
  try {
    return await purgeExpiredTrash();
  } catch (err) {
    console.warn('[TRASH] auto-purge skipped:', err.message);
    return null;
  }
}

module.exports = {
  TRASH_RETENTION_DAYS,
  getRetentionDays,
  trashPurgeMeta,
  enrichTrashItem,
  purgeExpiredTrash,
  permanentlyDeleteItem,
  maybeAutoPurgeTrash
};
