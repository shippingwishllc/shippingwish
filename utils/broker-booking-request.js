const { COMPANY } = require('./email-templates');
const { checkBrokerAuthority, summarize } = require('./broker-authority');

// Only called outside a transaction: an ALTER here would wait forever on a caller's row lock.
let columnsReady = null;
function ensureOfferColumns() {
  if (!columnsReady) {
    columnsReady = require('../db').query(`
      ALTER TABLE load_offers ADD COLUMN IF NOT EXISTS ratecon JSONB;
      ALTER TABLE load_offers ADD COLUMN IF NOT EXISTS broker_reply TEXT;
    `).catch((err) => { columnsReady = null; throw err; });
  }
  return columnsReady;
}

async function logEvent(db, offer, type, sender, text, rate) {
  const miles = Number(offer.miles) || 0;
  await db.query(
    `INSERT INTO ai_load_negotiations (offer_id, event_type, sender_type, message_text, rate_offered, rpm)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [offer.id, type, sender, String(text).slice(0, 2000), rate, miles && rate ? (rate / miles).toFixed(2) : 0]
  );
}

async function tellAdmins(title, message, type) {
  try {
    await require('./notifications').notifyAdmins(title, message, type || 'info', '/load-booking');
  } catch { /* best effort */ }
}

const PLACEHOLDER_EMAILS = new Set(['dispatch@broker.com', 'broker@example.com', 'test@test.com']);

function realEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) return null;
  if (PLACEHOLDER_EMAILS.has(email) || /@(example\.(com|org|net)|broker\.com)$/.test(email)) return null;
  return email;
}

function authorityOf(carrier) {
  const mc = String(carrier.mc_number || '').replace(/\D/g, '');
  const dot = String(carrier.dot_number || carrier.usdot || '').replace(/\D/g, '');
  return [mc.length >= 4 ? `MC ${mc}` : null, dot.length >= 4 ? `USDOT ${dot}` : null].filter(Boolean).join(' / ');
}

function money(n) {
  return '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// After a carrier approves a load_offers row, ask the broker to confirm at the offer's own rate.
// Never invents an MC number, a broker address, or a higher rate; when something is missing the
// offer is left for a dispatcher and admins are told why.
async function requestBrokerBooking(db, offer, { via } = {}) {
  const carrierRes = await db.query('SELECT * FROM users WHERE id = $1', [offer.carrier_id]);
  const carrier = carrierRes.rows[0] || {};
  const company = carrier.company_name || carrier.name || null;
  const authority = authorityOf(carrier);
  const brokerEmail = realEmail(offer.broker_email);
  const rate = Number(offer.rate) || 0;
  const miles = Number(offer.miles) || 0;

  const missing = [];
  if (!company) missing.push('carrier company name');
  if (!authority) missing.push('carrier MC or USDOT');
  if (!brokerEmail) missing.push('broker email');
  if (!rate) missing.push('rate');

  if (missing.length) {
    const reason = `Needs ${missing.join(', ')} before the broker can be contacted.`;
    await db.query(`UPDATE load_offers SET broker_negotiation_status = 'needs_staff' WHERE id = $1`, [offer.id]);
    await db.query(
      `INSERT INTO ai_load_negotiations (offer_id, event_type, sender_type, message_text, rate_offered, rpm)
       VALUES ($1, 'needs_staff', 'system', $2, $3, $4)`,
      [offer.id, `Carrier approved via ${via || 'portal'}. ${reason}`, rate, miles ? (rate / miles).toFixed(2) : 0]
    );
    try {
      await require('./notifications').notifyAdmins(
        `Approved offer #${offer.id} needs a dispatcher`,
        `${offer.pickup_location} → ${offer.delivery_location}. ${reason}`,
        'warning',
        '/load-booking'
      );
    } catch { /* best effort */ }
    return { sent: false, status: 'needs_staff', reason, rate };
  }

  const authorityCheck = await checkBrokerAuthority({
    mc: offer.broker_mc,
    contactEmail: brokerEmail,
    contactPhone: offer.broker_phone
  }).catch(() => ({ verdict: 'unknown', flags: [{ level: 'caution', code: 'check_failed', text: 'The FMCSA check failed. Check SAFER before booking.' }] }));
  const authorityNote = summarize(authorityCheck);
  if (authorityCheck.verdict === 'block') {
    const reason = `Broker ${offer.broker_mc || ''} did not pass the FMCSA check. ${authorityNote}`.replace(/\s+/g, ' ');
    await db.query(`UPDATE load_offers SET broker_negotiation_status = 'blocked' WHERE id = $1`, [offer.id]);
    await logEvent(db, offer, 'broker_blocked', 'system', `Carrier approved via ${via || 'portal'}. No email sent. ${reason}`, rate);
    await tellAdmins(`Offer #${offer.id}: broker failed FMCSA check`, `${offer.broker_name || 'Broker'} — ${authorityNote}`, 'warning');
    return { sent: false, status: 'blocked', reason: 'The broker did not pass our FMCSA authority check, so we did not request it.', rate, authority: authorityCheck };
  }
  if (authorityCheck.verdict !== 'ok') {
    await logEvent(db, offer, 'broker_authority_caution', 'system', authorityNote, rate);
    await tellAdmins(`Offer #${offer.id}: check the broker before booking`, `${offer.broker_name || 'Broker'} — ${authorityNote}`, 'warning');
  }

  const ops = process.env.DISPATCH_EMAIL || process.env.MAIL_REPLY_TO || COMPANY.operationsEmail;
  const lane = `${offer.pickup_location} → ${offer.delivery_location}`;
  const subject = `Booking request: ${lane} (${offer.equipment_type || 'equipment as posted'}) — ${authority} [SWO-${offer.id}]`;
  const text = [
    `Hello ${offer.broker_name || 'team'},`,
    '',
    `Shipping Wish dispatches for ${company} (${authority}). The carrier approved this load at your rate:`,
    `Lane: ${lane}`,
    offer.pickup_date ? `Pickup: ${String(offer.pickup_date).slice(0, 10)}` : null,
    `Equipment: ${offer.equipment_type || 'as posted'}`,
    miles ? `Miles: ${miles}` : null,
    `Rate: ${money(rate)}${miles ? ` (${money(rate / miles)}/mile)` : ''}`,
    '',
    `If it is still open, reply to confirm and send the rate confirmation to ${ops}. If it is covered, reply "covered" and we will stop.`,
    '',
    'Shipping Wish Dispatch',
    COMPANY.phone ? COMPANY.phone : null
  ].filter((line) => line !== null).join('\n');

  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  try {
    await require('./mailer').sendBrandedEmail({
      to: brokerEmail,
      subject,
      text,
      html: `<div style="font-family:Arial,sans-serif;font-size:14px;white-space:pre-wrap">${escaped}</div>`,
      emailType: 'broker_booking_request',
      transactional: true,
      replyTo: ops
    });
  } catch (err) {
    await db.query(`UPDATE load_offers SET broker_negotiation_status = 'needs_staff' WHERE id = $1`, [offer.id]);
    await db.query(
      `INSERT INTO ai_load_negotiations (offer_id, event_type, sender_type, message_text, rate_offered, rpm)
       VALUES ($1, 'needs_staff', 'system', $2, $3, $4)`,
      [offer.id, `Booking email to ${brokerEmail} failed. Call the broker.`, rate, miles ? (rate / miles).toFixed(2) : 0]
    );
    return { sent: false, status: 'needs_staff', reason: 'The booking email could not be sent. Call the broker.', rate };
  }

  await db.query(`UPDATE load_offers SET broker_negotiation_status = 'requested', initial_bid_rate = $1 WHERE id = $2`, [rate, offer.id]);
  await db.query(
    `INSERT INTO ai_load_negotiations (offer_id, event_type, sender_type, message_text, rate_offered, rpm)
     VALUES ($1, 'broker_request_sent', 'system', $2, $3, $4)`,
    [offer.id, `Booking request emailed to ${offer.broker_name || 'broker'} (${brokerEmail}) at the offered rate ${money(rate)}.`, rate, miles ? (rate / miles).toFixed(2) : 0]
  );
  return { sent: true, status: 'requested', brokerEmail, rate, authority: authorityCheck };
}

// Broker replies to a [SWO-id] booking request. Never books on its own: a confirmation with a
// matching rate confirmation is flagged for a dispatcher, anything else is flagged with the reason.
async function handleOfferReply({ fromEmail, subject, bodyText, resendId, attachments }) {
  const m = String(subject || '').match(/\[SWO-(\d+)\]/i);
  if (!m) return null;
  const pool = require('../db');
  await ensureOfferColumns();
  const { rows } = await pool.query(
    `SELECT o.*, u.company_name AS carrier_company, u.mc_number AS carrier_mc, u.dot_number AS carrier_dot
       FROM load_offers o LEFT JOIN users u ON u.id = o.carrier_id
      WHERE o.id = $1`,
    [Number(m[1])]
  );
  const offer = rows[0];
  if (!offer) return null;
  if (offer.broker_negotiation_status !== 'requested') return { offer: offer.id, action: `ignored_${offer.broker_negotiation_status}` };
  const sender = String(fromEmail || '').trim().toLowerCase();
  if (!realEmail(offer.broker_email) || sender !== realEmail(offer.broker_email)) {
    await tellAdmins(`Reply about offer #${offer.id} from another address`, `${sender} — check it before acting.`, 'warning');
    return { offer: offer.id, action: 'sender_mismatch' };
  }

  const { classifyBrokerReply, withoutQuotedEmail } = require('./dispatch-brain');
  const kind = classifyBrokerReply(bodyText);
  const replyText = withoutQuotedEmail(bodyText).slice(0, 500);
  const rate = Number(offer.rate) || 0;
  const lane = `${offer.pickup_location} → ${offer.delivery_location}`;
  await pool.query('UPDATE load_offers SET broker_reply = $2 WHERE id = $1', [offer.id, `${kind}: ${replyText}`]);
  const tellCarrier = async (title, message) => {
    if (!offer.carrier_id) return;
    try { await require('./notifications').createNotification(offer.carrier_id, title, message, 'info', '/carrier-overview'); } catch { /* best effort */ }
  };

  if (kind === 'declined') {
    await pool.query(`UPDATE load_offers SET broker_negotiation_status = 'declined', status = 'declined' WHERE id = $1`, [offer.id]);
    await logEvent(pool, offer, 'broker_declined', 'broker', replyText || 'Broker replied covered.', rate);
    await tellAdmins(`Offer #${offer.id} covered`, `${offer.broker_name || 'Broker'} said ${lane} is no longer available.`, 'info');
    await tellCarrier('Load no longer available', `${lane}: the broker says it is covered. We will look for another load.`);
    return { offer: offer.id, action: 'declined' };
  }

  if (kind === 'confirmed') {
    const { checkRateCon } = require('./ratecon-reader');
    const ratecon = await checkRateCon({
      resendId,
      attachments,
      bodyText,
      expected: {
        rate,
        carrierMc: offer.carrier_mc,
        carrierDot: offer.carrier_dot,
        pickup: offer.pickup_location,
        delivery: offer.delivery_location
      }
    }).catch((err) => ({ status: 'unreadable', issues: [`Could not read it: ${err.message}`], checks: [] }));
    const status = ratecon.status === 'match' ? 'confirmed' : ratecon.status === 'mismatch' ? 'ratecon_mismatch' : 'confirmed_no_ratecon';
    await pool.query('UPDATE load_offers SET broker_negotiation_status = $2, ratecon = $3::jsonb WHERE id = $1', [offer.id, status, JSON.stringify(ratecon)]);
    const summary = ratecon.status === 'match'
      ? `Rate confirmation matches: ${ratecon.checks.join(' ')}`
      : ratecon.status === 'mismatch'
        ? `Rate confirmation does not match: ${ratecon.issues.join(' ')}`
        : 'Broker confirmed, but no readable rate confirmation came with it.';
    await logEvent(pool, offer, 'broker_confirmed', 'broker', `${summary}\n\n${replyText}`, ratecon.parsed && ratecon.parsed.rate ? ratecon.parsed.rate : rate);
    await tellAdmins(
      `Offer #${offer.id}: broker confirmed ${lane}`,
      `${summary} A dispatcher must review before the carrier rolls.`,
      ratecon.status === 'match' ? 'success' : 'warning'
    );
    await tellCarrier('Broker replied', `${lane}: the broker confirmed. A dispatcher is checking the rate confirmation. Do not roll until we tell you it is booked.`);
    return { offer: offer.id, action: 'confirmed', ratecon: ratecon.status };
  }

  await logEvent(pool, offer, 'broker_question', 'broker', replyText, rate);
  await tellAdmins(`Broker question on offer #${offer.id}`, replyText.slice(0, 160), 'warning');
  return { offer: offer.id, action: 'question' };
}

module.exports = { requestBrokerBooking, handleOfferReply, realEmail, authorityOf };
