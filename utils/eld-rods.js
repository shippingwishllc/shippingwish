/**
 * 49 CFR 395 Subpart B Appendix A — ELD output file builder.
 * Built from saved duty events only. Phone GPS is not an ELD. A listing ID is
 * never invented; it is blank until the user pastes the ID FMCSA assigns after
 * self-certification at https://eld.fmcsa.dot.gov/provider
 */

const DUTY_EVENT = {
  OFF_DUTY: { type: 1, code: 1, label: 'OFF' },
  SLEEPER_BERTH: { type: 1, code: 2, label: 'SB' },
  DRIVING: { type: 1, code: 3, label: 'D' },
  ON_DUTY_NOT_DRIVING: { type: 1, code: 4, label: 'ON' }
};

function csvCell(value) {
  if (value == null || value === '') return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvLine(cells) {
  return cells.map(csvCell).join(',');
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function eldDate(d) {
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  return `${x.getUTCFullYear()}/${pad2(x.getUTCMonth() + 1)}/${pad2(x.getUTCDate())}`;
}

function eldTime(d) {
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  return `${pad2(x.getUTCHours())}${pad2(x.getUTCMinutes())}${pad2(x.getUTCSeconds())}`;
}

function coord(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return n.toFixed(4);
}

/**
 * Appendix A 4.4.5.1.1-style event checksum: character-code sum of the
 * concatenated specified fields, modulo 256. Not a substitute for a listed ELD.
 */
function eventChecksum(fields) {
  const joined = (Array.isArray(fields) ? fields : []).map((f) => (f == null ? '' : String(f))).join('');
  let sum = 0;
  for (let i = 0; i < joined.length; i += 1) sum += joined.charCodeAt(i);
  return sum % 256;
}

function dutyMap(status) {
  return DUTY_EVENT[String(status || '').toUpperCase()] || DUTY_EVENT.OFF_DUTY;
}

function packetReady(packet) {
  const p = packet || {};
  const reasons = [];
  if (!p.legal_name) reasons.push('Legal company name');
  if (!p.usdot) reasons.push('USDOT number');
  if (!p.device_model) reasons.push('Device model name');
  if (!p.software_version) reasons.push('Software version');
  if (!p.ecm_connected) reasons.push('ECM connection (phone GPS is not an ELD)');
  if (!['telematics', 'local'].includes(p.transfer_option)) reasons.push('Transfer option (telematics or local)');
  if (!p.self_cert_statement) reasons.push('Self-certification statement');
  if (!p.file_validator_checked) reasons.push('FMCSA File Validator check (you must run it)');
  return { ok: reasons.length === 0, missing: reasons };
}

function listingStatus(packet) {
  const id = String(packet?.fmcsa_listing_id || '').trim();
  if (id) return { listed: true, listing_id: id, label: 'Listed — ID pasted from FMCSA' };
  const ready = packetReady(packet);
  if (ready.ok) return { listed: false, listing_id: null, label: 'Packet ready — submit at eld.fmcsa.dot.gov/provider. Not listed yet.' };
  return { listed: false, listing_id: null, label: 'Draft — not an FMCSA-registered ELD' };
}

function buildRodsFile({ packet, driver, vehicle, events, now }) {
  const p = packet || {};
  const d = driver || {};
  const v = vehicle || {};
  const stamp = now instanceof Date ? now : new Date(now || Date.now());
  const rows = Array.isArray(events) ? events.slice().sort((a, b) => new Date(a.started_at) - new Date(b.started_at)) : [];
  const last = rows[rows.length - 1] || {};
  const firstAt = rows[0] ? new Date(rows[0].started_at) : stamp;
  const lastAt = last.ended_at ? new Date(last.ended_at) : (last.started_at ? new Date(last.started_at) : stamp);
  const listing = listingStatus(p);
  const eldId = listing.listing_id || '';
  const eldIdentifier = String(p.device_model || 'SW-LOGBOOK').slice(0, 16);
  const comment = listing.listed
    ? 'Shipping Wish ELD output file'
    : 'TEST FILE — not listed on the FMCSA registered ELD list. Phone GPS is not an ELD.';

  const lines = [];
  lines.push('ELD File Header Segment:');
  lines.push(csvLine([
    eldId,
    eldIdentifier,
    '',
    comment,
    '00',
    p.usdot || '',
    p.legal_name || d.company_name || '',
    '8',
    '000000',
    eldDate(firstAt),
    eldDate(lastAt),
    eldDate(stamp),
    eldTime(stamp),
    d.name || '',
    d.id || '',
    d.license_number || '',
    d.license_state || '',
    '',
    '',
    v.unit_number || v.name || '',
    v.vin || '',
    v.trailer_number || '',
    last.location_city && last.location_state ? `${last.location_city}, ${last.location_state}` : '',
    coord(last.gps_lat),
    coord(last.gps_lon),
    '0',
    '0',
    d.email || '',
    listing.listed ? '1' : '0'
  ]));

  lines.push('User List:');
  if (d.id || d.name) {
    lines.push(csvLine(['1', d.id || '', d.name || '', '', d.license_number || '', d.license_state || '']));
  }

  lines.push('CMV List:');
  if (v.vin || v.unit_number || v.name) {
    lines.push(csvLine(['1', v.unit_number || v.name || '', v.vin || '']));
  }

  lines.push('ELD Event List:');
  rows.forEach((ev, idx) => {
    const map = dutyMap(ev.duty_status);
    const when = new Date(ev.started_at);
    const seq = idx + 1;
    const origin = 2;
    const status = 1;
    const date = eldDate(when);
    const time = eldTime(when);
    const lat = coord(ev.gps_lat);
    const lon = coord(ev.gps_lon);
    const odo = ev.odometer_miles != null ? String(ev.odometer_miles) : '';
    const hours = ev.engine_hours != null ? String(ev.engine_hours) : '';
    const checksum = eventChecksum([
      seq, status, origin, map.type, map.code, date, time, lat, lon, odo, hours, d.id || ''
    ]);
    lines.push(csvLine([
      seq,
      status,
      origin,
      map.type,
      map.code,
      date,
      time,
      lat,
      lon,
      ev.location_city || '',
      ev.location_state || '',
      odo,
      hours,
      checksum,
      ev.notes || ''
    ]));
  });

  lines.push("Driver's Certification of Records:");
  lines.push('Malfunctions and Data Diagnostic Events:');
  lines.push('ELD Login/Logout Report:');
  lines.push('CMV Engine Power-Up and Shut Down Activity:');
  lines.push('Unidentified Driver Profile Records:');
  lines.push('End of File:');
  lines.push(csvLine([rows.length, listing.listed ? eldId : 'NOT_LISTED', comment]));

  return {
    filename: `SW_RODS_${eldDate(stamp).replace(/\//g, '')}_${d.id || 'driver'}.csv`,
    contentType: 'text/csv; charset=utf-8',
    body: `${lines.join('\r\n')}\r\n`,
    event_count: rows.length,
    listed: listing.listed,
    listing_id: listing.listing_id,
    note: listing.label
  };
}

function registrationChecklist(packet) {
  const p = packet || {};
  const listing = listingStatus(p);
  const ready = packetReady(p);
  return {
    listed: listing.listed,
    listing_id: listing.listing_id,
    ready_to_submit: ready.ok && !listing.listed,
    missing: ready.missing,
    label: listing.label,
    steps: [
      {
        key: 'ecm',
        done: Boolean(p.ecm_connected),
        title: 'ECM-connected hardware',
        detail: '49 CFR 395 Appendix A requires engine data from the vehicle ECM. A phone GPS share (SW Track) is not an ELD and cannot be listed.'
      },
      {
        key: 'rods',
        done: Boolean(p.rods_generated_at),
        title: 'Appendix A output file',
        detail: 'Generate the comma-delimited RODS file from real duty events and keep a copy for the File Validator.'
      },
      {
        key: 'validator',
        done: Boolean(p.file_validator_checked),
        title: 'FMCSA File Validator',
        detail: 'Upload the file at the ELD Provider Portal File Validator. Shipping Wish does not mark this passed for you.'
      },
      {
        key: 'transfer',
        done: ['telematics', 'local'].includes(p.transfer_option),
        title: 'Data transfer option',
        detail: 'Telematics = web services + email. Local = USB 2.0 + Bluetooth. Pick one complete pair. Endpoints come from the FMCSA ELD Provider Portal, not from us.'
      },
      {
        key: 'selfcert',
        done: Boolean(p.self_cert_statement),
        title: 'Self-certify',
        detail: 'You certify the device meets Appendix A. FMCSA does not pre-test the device; they list it after you register.'
      },
      {
        key: 'register',
        done: listing.listed,
        title: 'Register at eld.fmcsa.dot.gov/provider',
        detail: 'Submit the packet there. Paste the listing ID here only after FMCSA publishes it. We never invent a registration number.'
      }
    ],
    links: {
      provider_portal: 'https://eld.fmcsa.dot.gov/provider',
      eld_list: 'https://eld.fmcsa.dot.gov/',
      transfer_factsheet: 'https://www.fmcsa.dot.gov/sites/fmcsa.dot.gov/files/docs/regulations/hours-service/elds/82201/eld-data-transfer-508.pdf',
      compliant: 'https://www.fmcsa.dot.gov/hours-service/elds/your-device-compliant'
    }
  };
}

module.exports = {
  DUTY_EVENT,
  csvCell,
  csvLine,
  eldDate,
  eldTime,
  coord,
  eventChecksum,
  dutyMap,
  packetReady,
  listingStatus,
  buildRodsFile,
  registrationChecklist
};
