const express = require('express');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  ensureSmsMessagesTable,
  backfillFromVoipLogs,
  findLeadByPhone,
  isPhoneOptedOut,
  logSmsMessage,
  phoneTail,
  OUR_NUMBER
} = require('../utils/sms-inbox');

const router = express.Router();
const staffOnly = requireRole('admin', 'super_admin', 'dispatcher', 'sales_rep');

async function sendOutboundSms({ to_number, body, lead_id, user }) {
  const { sendTwilioSms } = require('./voip');
  const sent = await sendTwilioSms(to_number, body);
  const bodySent = sent.body || body;

  if (sent.status === 'sent' || sent.status === 'logged') {
    await logSmsMessage({
      direction: 'outbound',
      from_number: OUR_NUMBER,
      to_number,
      body: bodySent,
      lead_id,
      sent_by: user?.id,
      twilio_sid: sent.sid,
      disposition: sent.status,
      is_read: true
    });
  }

  if (lead_id) {
    await pool.query(
      `UPDATE crm_leads SET last_contacted_at = now(),
         status = CASE WHEN status = 'new' THEN 'contacted' ELSE status END
       WHERE id = $1`,
      [lead_id]
    ).catch(() => {});
  }

  return sent;
}

// GET /api/sms/inbox — conversation threads
router.get('/', requireAuth, staffOnly, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const perPage = Math.min(50, Math.max(1, parseInt(req.query.perPage || '15', 10)));
  const unreadOnly = req.query.unread === '1' || req.query.unread === 'true';
  const offset = (page - 1) * perPage;

  try {
    await ensureSmsMessagesTable();
    await backfillFromVoipLogs();

    const countRes = await pool.query(`
      WITH latest AS (
        SELECT DISTINCT ON (
          right(regexp_replace(CASE WHEN direction = 'inbound' THEN from_number ELSE to_number END, '[^0-9]', '', 'g'), 10)
        )
          right(regexp_replace(CASE WHEN direction = 'inbound' THEN from_number ELSE to_number END, '[^0-9]', '', 'g'), 10) AS peer_tail,
          direction,
          is_read
        FROM sms_messages
        ORDER BY
          right(regexp_replace(CASE WHEN direction = 'inbound' THEN from_number ELSE to_number END, '[^0-9]', '', 'g'), 10),
          created_at DESC
      ),
      unread AS (
        SELECT right(regexp_replace(from_number, '[^0-9]', '', 'g'), 10) AS peer_tail,
               COUNT(*)::int AS unread_count
        FROM sms_messages
        WHERE direction = 'inbound' AND is_read = FALSE
        GROUP BY 1
      )
      SELECT COUNT(*)::int AS count
      FROM latest l
      LEFT JOIN unread u USING (peer_tail)
      ${unreadOnly ? 'WHERE COALESCE(u.unread_count, 0) > 0' : ''}
    `);
    const total = countRes.rows[0]?.count || 0;

    const result = await pool.query(
      `
      WITH base AS (
        SELECT
          CASE WHEN direction = 'inbound' THEN from_number ELSE to_number END AS peer_phone,
          right(regexp_replace(CASE WHEN direction = 'inbound' THEN from_number ELSE to_number END, '[^0-9]', '', 'g'), 10) AS peer_tail,
          body, direction, created_at, lead_id, is_read, from_number
        FROM sms_messages
      ),
      latest AS (
        SELECT DISTINCT ON (peer_tail)
          peer_phone, peer_tail, body AS last_body, direction AS last_direction,
          created_at AS last_at, lead_id
        FROM base
        ORDER BY peer_tail, created_at DESC
      ),
      unread AS (
        SELECT right(regexp_replace(from_number, '[^0-9]', '', 'g'), 10) AS peer_tail,
               COUNT(*)::int AS unread_count
        FROM sms_messages
        WHERE direction = 'inbound' AND is_read = FALSE
        GROUP BY 1
      )
      SELECT l.*, COALESCE(u.unread_count, 0) AS unread_count,
        cl.company_name, cl.owner_name,
        EXISTS (
          SELECT 1 FROM sms_optouts o
          WHERE right(regexp_replace(o.phone, '[^0-9]', '', 'g'), 10) = l.peer_tail
        ) AS opted_out
      FROM latest l
      LEFT JOIN unread u USING (peer_tail)
      LEFT JOIN crm_leads cl ON cl.id = l.lead_id
      ${unreadOnly ? 'WHERE COALESCE(u.unread_count, 0) > 0' : ''}
      ORDER BY l.last_at DESC
      LIMIT $1 OFFSET $2
      `,
      [perPage, offset]
    );

    res.json({
      threads: result.rows,
      total,
      page,
      perPage,
      totalPages: Math.max(1, Math.ceil(total / perPage))
    });
  } catch (err) {
    console.error('SMS inbox list error:', err);
    res.status(500).json({ error: 'Could not load SMS inbox.' });
  }
});

// GET /api/sms/inbox/unread-count
router.get('/unread-count', requireAuth, staffOnly, async (req, res) => {
  try {
    await ensureSmsMessagesTable();
    const r = await pool.query(
      `SELECT COUNT(*)::int AS count FROM sms_messages WHERE direction = 'inbound' AND is_read = FALSE`
    );
    res.json({ unread: r.rows[0]?.count || 0 });
  } catch (err) {
    res.json({ unread: 0 });
  }
});

// GET /api/sms/inbox/thread?phone=...
router.get('/thread', requireAuth, staffOnly, async (req, res) => {
  const phone = String(req.query.phone || '').trim();
  if (!phone) return res.status(400).json({ error: 'phone query required' });

  try {
    await ensureSmsMessagesTable();
    await backfillFromVoipLogs();
    const tail = phoneTail(phone);
    const normalized = phone.replace(/\s/g, '');

    const messages = await pool.query(
      `SELECT sm.*, u.name AS sent_by_name
       FROM sms_messages sm
       LEFT JOIN users u ON u.id = sm.sent_by
       WHERE right(regexp_replace(
         CASE WHEN sm.direction = 'inbound' THEN sm.from_number ELSE sm.to_number END,
         '[^0-9]', '', 'g'
       ), 10) = $1
       ORDER BY sm.created_at ASC
       LIMIT 200`,
      [tail]
    );

    const lead = await findLeadByPhone(phone);
    const optedOut = await isPhoneOptedOut(phone);

    res.json({
      phone: normalized,
      peer_phone: messages.rows[0]
        ? (messages.rows[0].direction === 'inbound' ? messages.rows[0].from_number : messages.rows[0].to_number)
        : normalized,
      lead: lead || null,
      opted_out: optedOut,
      messages: messages.rows,
      our_number: OUR_NUMBER
    });
  } catch (err) {
    console.error('SMS thread error:', err);
    res.status(500).json({ error: 'Could not load SMS thread.' });
  }
});

// POST /api/sms/inbox/thread/read — mark inbound read for phone
router.post('/thread/read', requireAuth, staffOnly, async (req, res) => {
  const { phone } = req.body || {};
  if (!phone) return res.status(400).json({ error: 'phone required' });
  try {
    await ensureSmsMessagesTable();
    const tail = phoneTail(phone);
    await pool.query(
      `UPDATE sms_messages SET is_read = TRUE
       WHERE direction = 'inbound' AND is_read = FALSE
         AND regexp_replace(from_number, '\\D', '', 'g') LIKE '%' || $1`,
      [tail]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not mark read.' });
  }
});

// POST /api/sms/inbox/reply
router.post('/reply', requireAuth, staffOnly, async (req, res) => {
  const { phone, body, lead_id } = req.body || {};
  if (!phone || !String(body || '').trim()) {
    return res.status(400).json({ error: 'phone and body are required' });
  }

  if (await isPhoneOptedOut(phone)) {
    return res.status(409).json({ error: 'This number replied STOP. Cannot send SMS.' });
  }

  try {
    const text = String(body).trim();
    const sent = await sendOutboundSms({
      to_number: phone,
      body: text,
      lead_id: lead_id || null,
      user: req.user
    });

    if (sent.status === 'twilio_error') {
      return res.status(502).json({ error: 'Twilio could not send SMS. Check Vercel env vars.' });
    }
    if (sent.status === 'opted_out') {
      return res.status(409).json({ error: 'This number is opted out.' });
    }

    res.json({
      ok: true,
      status: sent.status,
      message: sent.status === 'sent' ? 'SMS sent.' : `SMS logged (${sent.status})`,
      body: sent.body || text
    });
  } catch (err) {
    console.error('SMS reply error:', err);
    res.status(500).json({ error: 'Failed to send reply.' });
  }
});

// GET /api/sms/inbox/stats — sent today / total threads
router.get('/stats', requireAuth, staffOnly, async (req, res) => {
  try {
    await ensureSmsMessagesTable();
    await backfillFromVoipLogs();
    const [unread, outboundToday, threads, optedOut] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS c FROM sms_messages WHERE direction='inbound' AND is_read=FALSE`),
      pool.query(`SELECT COUNT(*)::int AS c FROM sms_messages WHERE direction='outbound' AND created_at >= CURRENT_DATE`),
      pool.query(`
        SELECT COUNT(DISTINCT CASE WHEN direction='inbound' THEN from_number ELSE to_number END)::int AS c
        FROM sms_messages`),
      pool.query(`SELECT COUNT(*)::int AS c FROM sms_optouts`)
    ]);
    res.json({
      unread: unread.rows[0]?.c || 0,
      sent_today: outboundToday.rows[0]?.c || 0,
      threads: threads.rows[0]?.c || 0,
      opted_out: optedOut.rows[0]?.c || 0
    });
  } catch (err) {
    res.json({ unread: 0, sent_today: 0, threads: 0, opted_out: 0 });
  }
});

module.exports = router;
