const { COMPANY } = require('./email-templates');

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
  return { sent: true, status: 'requested', brokerEmail, rate };
}

module.exports = { requestBrokerBooking, realEmail, authorityOf };
