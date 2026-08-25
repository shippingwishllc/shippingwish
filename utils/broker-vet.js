const { digits } = require('./fmcsa');

async function soda(dataset, params, timeoutMs = 10000) {
  const u = new URL(`https://data.transportation.gov/resource/${dataset}.json`);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value != null && value !== '') u.searchParams.set(key, String(value));
  });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(u.toString(), {
      signal: ctrl.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'ShippingWishTMS/1.0' }
    });
    const body = await resp.text();
    if (resp.status >= 400) return [];
    const data = JSON.parse(body || '[]');
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function formatBondRow(row, source) {
  const amount = Math.round(parseFloat(row.max_cov_amount || row.bond_file || 0) || 0);
  const form = row.ins_form_code || (amount ? 'BMC-84/85' : '');
  const insurer = row.insurance_company_name || '';
  const effective = String(row.effective_date || '').replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');
  const parts = [
    form || 'Surety',
    amount ? `$${amount.toLocaleString('en-US')} on file` : 'on file',
    insurer,
    effective ? `effective ${effective}` : ''
  ].filter(Boolean);
  return {
    bondOnFile: true,
    bondAmount: amount || null,
    bondForm: form,
    bondInsurer: insurer,
    bondStatus: parts.join(' — '),
    bondSource: source
  };
}

async function lookupMotusBond(mc, dot) {
  const docket = digits(mc);
  const usdot = digits(dot);
  const docketIds = docket ? [`MC${docket}`, `MC-${docket}`] : [];
  const jobs = [];
  for (const docket_number of docketIds) {
    jobs.push(soda('c5y8-a4uz', { docket_number, ins_form_code: 'BMC-84', $limit: '3' }));
    jobs.push(soda('c5y8-a4uz', { docket_number, ins_form_code: 'BMC-85', $limit: '3' }));
    jobs.push(soda('inys-ebih', { docket_number, $limit: '3' }));
  }
  if (usdot) {
    jobs.push(soda('c5y8-a4uz', { usdot_number: usdot, ins_form_code: 'BMC-84', $limit: '3' }));
    jobs.push(soda('c5y8-a4uz', { usdot_number: usdot, ins_form_code: 'BMC-85', $limit: '3' }));
    jobs.push(soda('inys-ebih', { usdot_number: usdot, $limit: '3' }));
  }
  const packs = await Promise.all(jobs);
  for (const rows of packs) {
    const bmc = (rows || []).find((r) => /BMC-8[45]/i.test(r.ins_form_code || ''));
    if (bmc) return formatBondRow(bmc, 'FMCSA Motus Insur');
  }
  for (const rows of packs) {
    const auth = (rows || []).find((r) => String(r.bond_file || '').toUpperCase() === 'Y' || parseFloat(r.bond_file) > 0);
    if (auth) {
      return formatBondRow({
        ins_form_code: 'BMC-84/85',
        max_cov_amount: parseFloat(auth.bond_file) > 1 ? auth.bond_file : '75000',
        insurance_company_name: '',
        effective_date: ''
      }, 'FMCSA Motus Carrier');
    }
  }
  return null;
}

async function lookupInternalDtp(pool, mcDigits) {
  if (!mcDigits) return null;
  try {
    const result = await pool.query(
      `SELECT
         COUNT(*)::int AS paid_count,
         ROUND(AVG(
           EXTRACT(EPOCH FROM (i.paid_date::timestamp - COALESCE(l.delivery_date, i.issued_date)::timestamp)) / 86400.0
         ))::int AS avg_dtp
       FROM invoices i
       JOIN loads l ON l.id = i.load_id
       WHERE i.status = 'paid'
         AND i.paid_date IS NOT NULL
         AND regexp_replace(coalesce(l.broker_mc, ''), '[^0-9]', '', 'g') = $1`,
      [mcDigits]
    );
    const row = result.rows[0];
    if (!row || !row.paid_count) return null;
    return {
      daysToPay: row.avg_dtp,
      paidLoadCount: row.paid_count,
      dtpSource: 'internal'
    };
  } catch {
    return null;
  }
}

function mapLoadWrap(data) {
  if (!data || typeof data !== 'object') return null;
  const score = data.trust && data.trust.trust_score != null ? Number(data.trust.trust_score) : null;
  const bondAmt = data.insurance && data.insurance.bond_on_file != null ? Number(data.insurance.bond_on_file) : null;
  const dtp = data.payment && data.payment.days_to_pay != null
    ? Number(data.payment.days_to_pay)
    : (data.days_to_pay != null ? Number(data.days_to_pay) : null);
  return {
    creditScore: Number.isFinite(score) ? score : null,
    creditRating: Number.isFinite(score)
      ? (score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : 'F')
      : null,
    creditSource: 'LoadWrap',
    daysToPay: Number.isFinite(dtp) ? dtp : null,
    dtpSource: Number.isFinite(dtp) ? 'LoadWrap' : null,
    bondOnFile: Number.isFinite(bondAmt) ? bondAmt > 0 : null,
    bondAmount: Number.isFinite(bondAmt) ? bondAmt : null,
    bondStatus: Number.isFinite(bondAmt) && bondAmt > 0
      ? `BMC-84/85 $${bondAmt.toLocaleString('en-US')} on file (LoadWrap / FMCSA)`
      : null,
    factoringStatus: data.factoring && data.factoring.status ? String(data.factoring.status) : null
  };
}

async function lookupLoadWrap(mc, dot) {
  const key = String(process.env.LOADWRAP_API_KEY || '').trim();
  if (!key) return null;
  const headers = { Authorization: `Bearer ${key}`, Accept: 'application/json' };
  const urls = [];
  if (mc) urls.push(`https://loadwrap.com/api/v1/broker/${digits(mc)}`);
  if (dot) urls.push(`https://loadwrap.com/api/v1/carrier/${digits(dot)}`);
  for (const url of urls) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const resp = await fetch(url, { headers, signal: ctrl.signal });
      clearTimeout(timer);
      if (!resp.ok) continue;
      const data = await resp.json();
      const mapped = mapLoadWrap(data);
      if (mapped) return mapped;
    } catch {
      // try next endpoint
    }
  }
  return null;
}

module.exports = {
  lookupMotusBond,
  lookupInternalDtp,
  lookupLoadWrap
};
