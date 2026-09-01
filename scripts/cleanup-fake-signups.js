/**
 * Remove fake carrier signups — keeps accounts matching "ahsan" in name or email,
 * or emails listed in KEEP_CARRIER_EMAILS (comma-separated).
 * Usage: node scripts/cleanup-fake-signups.js [--force]
 *   --force  delete all carriers if no keep match (fresh start for OTP signup)
 */
require('dotenv').config();
const pool = require('../db');
const { TRIAL_DAYS } = require('../middleware/subscription');

const force = process.argv.includes('--force');

function extraKeepEmails() {
  const raw = process.env.KEEP_CARRIER_EMAILS || '';
  return raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

async function main() {
  const extras = extraKeepEmails();
  const keepRes = await pool.query(
    `SELECT id, email, name FROM users
     WHERE role = 'carrier'
       AND (
         lower(name) LIKE '%ahsan%'
         OR lower(email) LIKE '%ahsan%'
         OR lower(email) = ANY($1::text[])
       )
     ORDER BY created_at ASC`,
    [extras]
  );
  const keepIds = keepRes.rows.map((r) => r.id);
  if (!keepIds.length) {
    if (!force) {
      console.error('No Ahsan account found — aborting. Re-run with --force to delete ALL carriers.');
      process.exit(1);
    }
    console.warn('No keep match — --force deleting every carrier account.');
  } else {
    console.log('Keeping:', keepRes.rows);
  }

  const victims = keepIds.length
    ? await pool.query(
      `SELECT id, email, name FROM users
       WHERE role = 'carrier' AND id NOT IN (${keepIds.join(',')})`
    )
    : await pool.query(`SELECT id, email, name FROM users WHERE role = 'carrier'`);

  for (const u of victims.rows) {
    const id = u.id;
    await pool.query('DELETE FROM loads WHERE carrier_id = $1', [id]).catch(() => {});
    await pool.query('DELETE FROM trucks WHERE carrier_id = $1', [id]).catch(() => {});
    await pool.query('DELETE FROM drivers WHERE carrier_id = $1', [id]).catch(() => {});
    await pool.query('DELETE FROM trailers WHERE carrier_id = $1', [id]).catch(() => {});
    await pool.query('DELETE FROM documents WHERE carrier_id = $1', [id]).catch(() => {});
    await pool.query('DELETE FROM dispatcher_carriers WHERE carrier_id = $1', [id]).catch(() => {});
    await pool.query('DELETE FROM billing_subscriptions WHERE user_id = $1', [id]).catch(() => {});
    await pool.query('DELETE FROM signup_pending WHERE lower(email) = lower($1)', [u.email]).catch(() => {});
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    console.log('Deleted', u.email);
  }

  const trialEnds = new Date();
  trialEnds.setDate(trialEnds.getDate() + TRIAL_DAYS);
  for (const k of keepRes.rows) {
    await pool.query(
      `UPDATE users SET trial_ends_at = $1, email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $2`,
      [trialEnds, k.id]
    );
  }
  if (keepRes.rows.length) {
    console.log('Trial reset until', trialEnds.toISOString(), 'for kept accounts');
  }
  console.log('Deleted', victims.rows.length, 'fake carrier account(s).');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
