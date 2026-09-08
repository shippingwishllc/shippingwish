const express = require('express');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  ensureSmsMessagesTable,
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

    const countRes = await pool.query(`
      WITH peers AS (
        SELECT CASE WHEN direction = 'inbound' THEN from_number ELSE to_number END AS peer_phone
        FROM sms_messages
        GROUP BY 1
      ),
      enriched AS (
        SELECT p.peer_phone,
          (SELECT COUNT(*)::int FROM sms_messages sm
           WHERE sm.direction = 'inbound' AND sm.is_read = FALSE AND sm.from_number = p.peer_phone) AS unread_count
        FROM peers p
      )
      SELECT COUNT(*)::int AS count FROM enriched e
      ${unreadOnly ? 'WHERE e.unread_count > 0' : ''}
    `);
    const total = countRes.rows[0]?.count || 0;

    const result = await pool.query(
      `
      WITH peers AS (
        SELECT
          CASE WHEN direction = 'inbound' THEN from_number ELSE to_number END AS peer_phone,
          MAX(created_at) AS last_at
        FROM sms_messages
        GROUP BY 1
      ),
      enriched AS (
        SELECT
          p.peer_phone,
          p.last_at,
          (SELECT body FROM sms_messages sm
           WHERE (CASE WHEN sm.direction = 'inbound' THEN sm.from_number ELSE sm.to_number END) = p.peer_phone
           ORDER BY sm.created_at DESC LIMIT 1) AS last_body,
          (SELECT direction FROM sms_messages sm
           WHERE (CASE WHEN sm.direction = 'inbound' THEN sm.from_number ELSE sm.to_number END) = p.peer_phone
           ORDER BY sm.created_at DESC LIMIT 1) AS last_direction,
          (SELECT COUNT(*)::int FROM sms_messages sm
           WHERE sm.direction = 'inbound' AND sm.is_read = FALSE AND sm.from_number = p.peer_phone) AS unread_count,
          (SELECT lead_id FROM sms_messages sm
           WHERE (CASE WHEN sm.direction = 'inbound' THEN sm.from_number ELSE sm.to_number END) = p.peer_phone
             AND sm.lead_id IS NOT NULL
           ORDER BY sm.created_at DESC LIMIT 1) AS lead_id
        FROM peers p
      )
      SELECT e.*, l.company_name, l.owner_name,
        EXISTS (
          SELECT 1 FROM sms_optouts o
          WHERE regexp_replace(o.phone, '\\D', '', 'g') = regexp_replace(e.peer_phone, '\\D', '', 'g')
        ) AS opted_out
      FROM enriched e
      LEFT JOIN crm_leads l ON l.id = e.lead_id
      ${unreadOnly ? 'WHERE e.unread_count > 0' : ''}
      ORDER BY e.last_at DESC
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
    const tail = phoneTail(phone);
    const normalized = phone.replace(/\s/g, '');

    const messages = await pool.query(
      `SELECT sm.*, u.name AS sent_by_name
       FROM sms_messages sm
       LEFT JOIN users u ON u.id = sm.sent_by
       WHERE regexp_replace(
         CASE WHEN sm.direction = 'inbound' THEN sm.from_number ELSE sm.to_number END,
         '\\D', '', 'g'
       ) LIKE '%' || $1
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
