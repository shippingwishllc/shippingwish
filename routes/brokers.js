const express = require('express');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { lookupCensusRow, digits } = require('../utils/fmcsa');

const router = express.Router();

function formatPhone(value) {
  const d = digits(value);
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return String(value || '').trim();
}

function formatCensusDate(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length < 8) return '';
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

function entityTypes(carship) {
  const map = { C: 'Carrier', B: 'Broker', S: 'Shipper', F: 'Freight Forwarder' };
  return String(carship || '')
    .split(/[;,/]/)
    .map((part) => map[part.trim().toUpperCase()] || '')
    .filter(Boolean);
}

function censusBrokerPayload(row) {
  const mc = digits(row.docket1);
  const prefix = String(row.docket1prefix || 'MC').toUpperCase();
  const types = entityTypes(row.carship);
  const usdotActive = String(row.status_code || '').toUpperCase() === 'A';
  const docketActive = String(row.docket1_status_code || '').toUpperCase() === 'A';
  const isBroker = types.includes('Broker');
  const cityState = [row.phy_city, row.phy_state, row.phy_zip].filter(Boolean).join(', ');
  const address = [row.phy_street, cityState].filter(Boolean).join(', ');
  const authorityBits = [];
  authorityBits.push(usdotActive ? 'USDOT ACTIVE' : 'USDOT INACTIVE');
  if (row.docket1_status_code) {
    authorityBits.push(`${prefix} docket ${docketActive ? 'ACTIVE' : row.docket1_status_code}`);
  }
  if (row.classdef) authorityBits.push(row.classdef);
  if (types.length) authorityBits.push(types.join(' + '));

  return {
    ok: true,
    authentic: true,
    source: 'FMCSA Census',
    mcNumber: mc ? `${prefix}-${mc}` : '',
    dotNumber: String(row.dot_number || ''),
    companyName: row.legal_name || row.dba_name || 'Unknown',
    cityState: cityState || 'US',
    address,
    phone: formatPhone(row.phone),
    email: String(row.email_address || '').toLowerCase(),
    officer: String(row.company_officer_1 || '').replace(/\s+/g, ' ').trim(),
    entityTypes: types.join(', ') || 'Not listed',
    authorityStatus: authorityBits.join(' — '),
    usdotActive,
    isBroker,
    addDate: formatCensusDate(row.add_date),
    bondStatus: 'Not in FMCSA census. Confirm BMC-84/BMC-85 on FMCSA L&I.',
    bondUrl: row.dot_number
      ? `https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=USDOT&query_string=${encodeURIComponent(row.dot_number)}`
      : 'https://safer.fmcsa.dot.gov/',
    creditRating: 'N/A',
    creditScore: null,
    daysToPay: null,
    factoringStatus: 'Not published by FMCSA. Check Highway, DAT, or your factor.',
    creditLimit: 'Not published by FMCSA',
    riskLevel: usdotActive ? 'FMCSA ACTIVE' : 'FMCSA INACTIVE',
    entityNote: isBroker
      ? 'FMCSA lists broker authority on this docket. Credit score / days-to-pay are not government data.'
      : 'FMCSA does not list Broker on this docket (carrier/shipper only). Credit score is not government data.',
    verifiedAt: new Date().toISOString()
  };
}

router.get('/credit-check/:mc', requireAuth, async (req, res) => {
  const rawInput = String(req.params.mc || '').trim();
  if (!rawInput) {
    return res.status(400).json({ error: 'Valid MC or DOT number is required.' });
  }

  try {
    const row = await lookupCensusRow(rawInput);
    if (!row) {
      return res.status(404).json({
        error: `No FMCSA census record for ${rawInput}. Check the MC/DOT, or search the legal name.`
      });
    }

    const payload = censusBrokerPayload(row);
    const mcDigits = digits(payload.mcNumber);
    try {
      const saved = await pool.query(
        `SELECT id, credit_rating, notes FROM brokers
         WHERE regexp_replace(coalesce(mc_number,''), '[^0-9]', '', 'g') = $1
         LIMIT 1`,
        [mcDigits]
      );
      if (saved.rows.length) {
        payload.alreadySaved = true;
        payload.directoryId = saved.rows[0].id;
        payload.directoryRating = saved.rows[0].credit_rating || '';
      }
    } catch {
      // directory lookup is optional
    }

    return res.json(payload);
  } catch (err) {
    console.error('Credit check error:', err);
    res.status(500).json({ error: 'Could not look up FMCSA census for this broker.' });
  }
});

// List brokers — with quick search by name or MC number
router.get('/', requireAuth, async (req, res) => {
  const { search } = req.query;
  try {
    let query = `SELECT * FROM brokers`;
    let params = [];
    if (search) {
      query += ` WHERE lower(company_name) LIKE lower($1) OR lower(mc_number) LIKE lower($1) OR lower(contact_person) LIKE lower($1)`;
      params.push(`%${search}%`);
    }
    query += ` ORDER BY company_name ASC`;
    const result = await pool.query(query, params);
    res.json({ brokers: result.rows });
  } catch (err) {
    console.error('List brokers error:', err);
    res.status(500).json({ error: 'Could not load brokers.' });
  }
});

// Create a broker — dispatcher/admin
router.post('/', requireAuth, requireRole('dispatcher', 'admin', 'super_admin'), async (req, res) => {
  const { company_name, mc_number, contact_person, email, phone, credit_rating, notes } = req.body;
  if (!company_name) return res.status(400).json({ error: 'Broker company name is required.' });

  try {
    if (mc_number) {
      const existing = await pool.query('SELECT id FROM brokers WHERE lower(mc_number) = lower($1)', [mc_number]);
      if (existing.rows.length) return res.status(409).json({ error: 'A broker with this MC number already exists.' });
    }

    const result = await pool.query(
      `INSERT INTO brokers (company_name, mc_number, contact_person, email, phone, credit_rating, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [company_name, mc_number || null, contact_person || null, email || null, phone || null, credit_rating || 'Unrated', notes || null]
    );
    res.json({ ok: true, broker: result.rows[0] });
  } catch (err) {
    console.error('Create broker error:', err);
    res.status(500).json({ error: 'Could not create broker.' });
  }
});

// Get single broker detail + load history
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const brokerRes = await pool.query('SELECT * FROM brokers WHERE id = $1', [req.params.id]);
    if (!brokerRes.rows.length) return res.status(404).json({ error: 'Broker not found.' });

    const loadsRes = await pool.query(
      `SELECT l.id, l.load_number, l.pickup_location, l.delivery_location, l.rate, l.status, l.created_at,
              u.name AS carrier_name
       FROM loads l
       LEFT JOIN users u ON u.id = l.carrier_id
       WHERE l.broker_id = $1 OR lower(l.broker_name) = lower($2)
       ORDER BY l.created_at DESC LIMIT 20`,
      [req.params.id, brokerRes.rows[0].company_name]
    );

    res.json({ broker: brokerRes.rows[0], loads: loadsRes.rows });
  } catch (err) {
    res.status(500).json({ error: 'Could not load broker details.' });
  }
});

// Update broker — dispatcher/admin
router.put('/:id', requireAuth, requireRole('dispatcher', 'admin', 'super_admin'), async (req, res) => {
  const { company_name, mc_number, contact_person, email, phone, credit_rating, notes } = req.body;
  try {
    const result = await pool.query(
      `UPDATE brokers
       SET company_name = $1, mc_number = $2, contact_person = $3, email = $4, phone = $5, credit_rating = $6, notes = $7
       WHERE id = $8 RETURNING *`,
      [company_name, mc_number || null, contact_person || null, email || null, phone || null, credit_rating || 'A', notes || null, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Broker not found.' });
    res.json({ ok: true, broker: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Could not update broker.' });
  }
});

// Delete broker — admin/super_admin
router.delete('/:id', requireAuth, requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    await pool.query('DELETE FROM brokers WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not delete broker.' });
  }
});

module.exports = router;
