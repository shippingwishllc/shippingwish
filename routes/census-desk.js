const express = require('express');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { searchCensusFiltered } = require('../utils/fmcsa');
const { matrixForUi, US_STATES, normalizeEquipmentKeys } = require('../utils/fmcsa-equipment');
const directories = require('../utils/census-directories');
const { sanitizeEmail } = require('../utils/email-valid');
const { sendBrandedEmail } = require('../utils/mailer');
const { buildTemplate } = require('../utils/email-templates');
const { isPhoneOptedOut, phoneTail, logSmsMessage, OUR_NUMBER } = require('../utils/sms-inbox');
const { isWithinTcpaHours } = require('../utils/us-timezones');

const router = express.Router();
const staff = [requireAuth, requireRole('admin', 'super_admin', 'dispatcher', 'sales_rep')];

router.use(...staff);

function bool(value, fallback) {
  if (value == null || value === '') return fallback;
  return value === true || value === 'true' || value === '1' || value === 'on';
}

function filtersFrom(req) {
  const body = req.body || {};
  const q = req.query || {};
  const src = Object.keys(body).length ? body : q;
  const equipment = normalizeEquipmentKeys(src.equipment);
  const state = String(src.state || '').trim().toUpperCase();
  return {
    equipment,
    state: US_STATES.includes(state) ? state : '',
    minUnits: src.minUnits || src.min_units,
    maxUnits: src.maxUnits || src.max_units,
    hasEmail: bool(src.hasEmail ?? src.has_email, false),
    hasPhone: bool(src.hasPhone ?? src.has_phone, false),
    activeOnly: bool(src.activeOnly ?? src.active_only, true),
    forHire: bool(src.forHire ?? src.for_hire, true),
    authorizedHire: bool(src.authorizedHire ?? src.authorized_hire, false),
    excludePassengers: bool(src.excludePassengers ?? src.exclude_passengers, true),
    exclusive: bool(src.exclusive, true),
    limit: src.limit,
    offset: src.offset
  };
}

router.get('/matrix', (req, res) => {
  res.json({
    ok: true,
    equipment: matrixForUi(),
    states: US_STATES,
    source: 'FMCSA Company Census (data.transportation.gov)',
    note: 'Census stores cargo flags, not trailer types. Dry Van maps to general freight; Reefer maps to refrigerated food, meat, and produce.'
  });
});

router.get('/search', async (req, res) => {
  try {
    const filters = filtersFrom(req);
    if (!filters.equipment.length && !filters.state) {
      return res.status(400).json({ error: 'Pick equipment (Dry Van, Reefer, …) and/or a state.' });
    }
    const result = await searchCensusFiltered(filters);
    res.json({
      ok: true,
      count: result.carriers.length,
      offset: result.offset,
      limit: result.limit,
      equipment: filters.equipment,
      state: filters.state,
      source: 'FMCSA Company Census',
      disclaimer: 'Public FMCSA cargo flags, not a credit score. Verify authority on SAFER before hauling.',
      carriers: result.carriers
    });
  } catch (err) {
    console.error('Census desk search:', err);
    res.status(err.status >= 400 && err.status < 500 ? err.status : 502).json({
      error: err.message || 'Census search failed.'
    });
  }
});

router.get('/directories', async (req, res) => {
  try {
    res.json({ ok: true, directories: await directories.listDirectories() });
  } catch (err) {
    res.status(500).json({ error: 'Could not load directories.' });
  }
});

router.post('/directories', async (req, res) => {
  try {
    const filters = filtersFrom(req);
    const members = Array.isArray(req.body.carriers) ? req.body.carriers : req.body.members;
    if (!members || !members.length) {
      return res.status(400).json({ error: 'Run a census search first, then save those rows into a directory.' });
    }
    const result = await directories.createDirectory({
      name: req.body.name,
      equipment: filters.equipment,
      state: filters.state,
      filters,
      createdBy: req.user && req.user.id,
      members
    });
    res.status(201).json({ ok: true, ...result });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Could not save directory.' });
  }
});

router.get('/directories/:id.csv', async (req, res) => {
  try {
    const found = await directories.getDirectory(req.params.id);
    if (!found) return res.status(404).json({ error: 'Directory not found.' });
    const slug = String(found.directory.name || 'census').replace(/[^a-z0-9]+/gi, '-').slice(0, 40);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${slug}.csv"`);
    res.send(directories.toCsv(found.members));
  } catch (err) {
    res.status(500).json({ error: 'Could not export CSV.' });
  }
});

router.get('/directories/:id', async (req, res) => {
  try {
    const found = await directories.getDirectory(req.params.id);
    if (!found) return res.status(404).json({ error: 'Directory not found.' });
    res.json({ ok: true, ...found });
  } catch (err) {
    res.status(500).json({ error: 'Could not load directory.' });
  }
});

router.delete('/directories/:id', async (req, res) => {
  try {
    const ok = await directories.deleteDirectory(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Directory not found.' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not delete directory.' });
  }
});

router.post('/directories/:id/email', async (req, res) => {
  try {
    const found = await directories.getDirectory(req.params.id);
    if (!found) return res.status(404).json({ error: 'Directory not found.' });
    const ids = new Set((req.body.member_ids || []).map(Number).filter(Boolean));
    const targets = found.members.filter((m) => (!ids.size || ids.has(m.id)) && sanitizeEmail(m.email));
    const cap = Math.min(15, targets.length);
    let sent = 0;
    const skipped = [];
    for (const member of targets.slice(0, cap)) {
      const to = sanitizeEmail(member.email);
      const tpl = buildTemplate('dedicated_manager', {
        ownerName: member.owner_name || 'there',
        companyName: member.company_name,
        recipientEmail: to
      });
      try {
        const result = await sendBrandedEmail({
          to,
          subject: tpl.subject,
          html: tpl.html,
          text: tpl.text,
          sentBy: req.user.id,
          emailType: 'census_directory',
          templateKey: 'dedicated_manager'
        });
        if (result.skipped) {
          skipped.push({ id: member.id, reason: 'Unsubscribed' });
          continue;
        }
        await directories.markMember(member.id, { email_sent_at: new Date() });
        sent += 1;
      } catch (err) {
        skipped.push({ id: member.id, reason: err.message });
      }
    }
    res.json({
      ok: true,
      sent,
      skipped,
      remaining: Math.max(0, targets.length - cap),
      note: 'CAN-SPAM email only. Daily batch is capped at 15 so bounces stay visible.'
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Could not send email.' });
  }
});

async function hasSmsConsent(phone) {
  const tail = phoneTail(phone);
  if (!tail || tail.length < 10) return false;
  try {
    const { rows } = await pool.query(
      `SELECT id FROM ai_dispatch_carriers
       WHERE sms_consent = TRUE
         AND right(regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g'), 10) = $1
       LIMIT 1`,
      [tail]
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

router.post('/directories/:id/sms', async (req, res) => {
  try {
    const found = await directories.getDirectory(req.params.id);
    if (!found) return res.status(404).json({ error: 'Directory not found.' });
    const ids = new Set((req.body.member_ids || []).map(Number).filter(Boolean));
    const targets = found.members.filter((m) => (!ids.size || ids.has(m.id)) && phoneTail(m.phone).length >= 10);
    const cap = Math.min(10, targets.length);
    let sent = 0;
    const skipped = [];
    const { sendTwilioSms } = require('./voip');

    for (const member of targets.slice(0, cap)) {
      if (await isPhoneOptedOut(member.phone)) {
        skipped.push({ id: member.id, company: member.company_name, reason: 'STOP on file' });
        await directories.markMember(member.id, { sms_blocked_reason: 'STOP on file' });
        continue;
      }
      if (!(await hasSmsConsent(member.phone))) {
        skipped.push({
          id: member.id,
          company: member.company_name,
          reason: 'No SMS consent. Census phone is for email/CRM only until they opt in.'
        });
        await directories.markMember(member.id, { sms_blocked_reason: 'no_consent' });
        continue;
      }
      const tcpa = isWithinTcpaHours(member.phone, member.state);
      if (!tcpa.allowed) {
        skipped.push({ id: member.id, company: member.company_name, reason: tcpa.reason || 'Outside 9am–5pm local hours' });
        continue;
      }
      try {
        const body = `Hi ${member.company_name}: Shipping Wish LLC emailed your ops-manager one-pager. Reply YES if you want the desk, STOP to opt out.`;
        const smsRes = await sendTwilioSms(member.phone, body);
        await logSmsMessage({
          direction: 'outbound',
          from_number: OUR_NUMBER,
          to_number: member.phone,
          body: smsRes.body || body,
          sent_by: req.user.id,
          twilio_sid: smsRes.sid,
          disposition: smsRes.status,
          is_read: true
        });
        await directories.markMember(member.id, { sms_sent_at: new Date(), sms_blocked_reason: null });
        sent += 1;
      } catch (err) {
        skipped.push({ id: member.id, company: member.company_name, reason: err.message });
      }
    }
    res.json({
      ok: true,
      sent,
      skipped,
      remaining: Math.max(0, targets.length - cap),
      note: 'TCPA: SMS only to numbers that already consented on our dispatch desk. Everyone else can get email.'
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Could not send SMS.' });
  }
});

router.post('/directories/:id/import-crm', async (req, res) => {
  try {
    const found = await directories.getDirectory(req.params.id);
    if (!found) return res.status(404).json({ error: 'Directory not found.' });
    const { ensureCrmLeadsTable } = require('../utils/ensure-growth-schema');
    await ensureCrmLeadsTable().catch(() => {});
    const ids = new Set((req.body.member_ids || []).map(Number).filter(Boolean));
    const targets = found.members.filter((m) => !ids.size || ids.has(m.id));
    let imported = 0;
    let skipped = 0;
    for (const member of targets.slice(0, 100)) {
      const dup = await pool.query(
        `SELECT id FROM crm_leads
         WHERE ($1 <> '' AND dot_number = $1)
            OR ($2 <> '' AND mc_number = $2)
            OR ($3 <> '' AND lower(email) = lower($3))
         LIMIT 1`,
        [member.dot_number || '', member.mc_number || '', member.email || '']
      );
      if (dup.rows.length) {
        skipped += 1;
        await directories.markMember(member.id, { crm_lead_id: dup.rows[0].id });
        continue;
      }
      const ins = await pool.query(
        `INSERT INTO crm_leads (
           company_name, owner_name, phone, email, mc_number, dot_number,
           equipment_type, num_trucks, status, sales_rep_id, notes
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'new',$9,$10)
         RETURNING id`,
        [
          member.company_name,
          member.owner_name || '',
          member.phone || 'unknown',
          member.email || '',
          member.mc_number || '',
          member.dot_number || '',
          member.equipment_type || '',
          member.power_units || 1,
          req.user.id,
          `Census directory ${found.directory.name}. Cargo: ${member.cargo_carried || 'n/a'}.`
        ]
      );
      await directories.markMember(member.id, { crm_lead_id: ins.rows[0].id });
      imported += 1;
    }
    res.json({ ok: true, imported, skipped });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Could not import to CRM.' });
  }
});

router.patch('/directories/:id/members/:memberId', async (req, res) => {
  try {
    const member = await directories.updateMember(req.params.id, req.params.memberId, req.body || {});
    if (!member) return res.status(404).json({ error: 'Carrier not found in this directory.' });
    res.json({ ok: true, member });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Could not save contact.' });
  }
});

router.delete('/directories/:id/members/:memberId', async (req, res) => {
  try {
    const ok = await directories.deleteMember(req.params.id, req.params.memberId);
    if (!ok) return res.status(404).json({ error: 'Carrier not found in this directory.' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not delete this carrier.' });
  }
});

router.post('/directories/:id/contract', async (req, res) => {
  try {
    const found = await directories.getDirectory(req.params.id);
    if (!found) return res.status(404).json({ error: 'Directory not found.' });
    const ids = new Set((req.body.member_ids || []).map(Number).filter(Boolean));
    if (!ids.size) return res.status(400).json({ error: 'Pick one carrier to send the packet.' });
    const member = found.members.find((m) => ids.has(m.id));
    if (!member) return res.status(404).json({ error: 'Carrier not found in this directory.' });
    const to = sanitizeEmail(member.email);
    if (!to) return res.status(400).json({ error: 'Add an email on this row before sending the packet.' });
    const tpl = buildTemplate('onboarding', {
      ownerName: member.owner_name || 'there',
      companyName: member.company_name,
      recipientEmail: to
    });
    const attachments = [];
    const fs = require('fs');
    const path = require('path');
    const packetPath = path.join(__dirname, '../public/downloads/Shipping-Wish-Carrier-Onboarding-Packet.pdf');
    if (fs.existsSync(packetPath)) {
      attachments.push({
        filename: 'Shipping-Wish-Carrier-Onboarding-Packet.pdf',
        content: fs.readFileSync(packetPath)
      });
    }
    const result = await sendBrandedEmail({
      to,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      sentBy: req.user.id,
      emailType: 'census_packet',
      templateKey: 'onboarding',
      attachments
    });
    if (result.skipped) return res.status(400).json({ error: 'Recipient is unsubscribed.' });
    await directories.markMember(member.id, { email_sent_at: new Date() });
    res.json({ ok: true, sent: 1, message: 'Onboarding packet emailed to ' + to });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Could not send the packet.' });
  }
});

module.exports = router;
