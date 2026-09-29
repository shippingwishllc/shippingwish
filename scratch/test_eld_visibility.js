const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  eventChecksum,
  buildRodsFile,
  packetReady,
  listingStatus,
  registrationChecklist,
  dutyMap
} = require('../utils/eld-rods');
const {
  listPartners,
  getPartner,
  buildFourkitesPayload,
  buildMacropointXml,
  buildTruckerToolsPayload,
  truckerToolsCsv,
  fourkitesLocatedAt,
  digestAuthorization,
  parseDigestChallenge,
  previewPayload,
  xmlEscape,
  visibilityFromBody
} = require('../utils/visibility-partners');

function test(name, fn) {
  fn();
  console.log('ok  ' + name);
}

test('FMCSA packet is not listed without a pasted listing ID and ECM', () => {
  const draft = listingStatus({ legal_name: 'Shipping Wish LLC' });
  assert.strictEqual(draft.listed, false);
  assert.strictEqual(draft.listing_id, null);
  const ready = packetReady({
    legal_name: 'Shipping Wish LLC',
    usdot: '1234567',
    device_model: 'SW ELD 1',
    software_version: '1.0.0',
    ecm_connected: false,
    transfer_option: 'telematics',
    self_cert_statement: true,
    file_validator_checked: true
  });
  assert.strictEqual(ready.ok, false);
  assert.ok(ready.missing.some((m) => /ECM/i.test(m)));
  const listed = listingStatus({ fmcsa_listing_id: 'ELD-SW-TEST' });
  assert.strictEqual(listed.listed, true);
  assert.strictEqual(listed.listing_id, 'ELD-SW-TEST');
});

test('RODS file uses real duty events and does not invent a listing ID', () => {
  const file = buildRodsFile({
    packet: { legal_name: 'Shipping Wish LLC', usdot: '9999999', device_model: 'SW ELD 1', ecm_connected: true },
    driver: { id: 7, name: 'Test Driver', email: 'driver@example.com' },
    vehicle: { unit_number: '402', vin: '1XKADB9X0LJ123456' },
    events: [{
      duty_status: 'DRIVING',
      started_at: '2026-09-29T12:00:00Z',
      gps_lat: 39.7684,
      gps_lon: -86.1581,
      location_city: 'Indianapolis',
      location_state: 'IN',
      odometer_miles: 100,
      engine_hours: 2
    }],
    now: new Date('2026-09-29T18:00:00Z')
  });
  assert.match(file.body, /ELD File Header Segment:/);
  assert.match(file.body, /ELD Event List:/);
  assert.match(file.body, /NOT_LISTED/);
  assert.match(file.body, /not listed on the FMCSA registered ELD list/i);
  assert.doesNotMatch(file.body, /32\.7767/);
  assert.doesNotMatch(file.body, /FMCSA-CERTIFIED/);
  assert.strictEqual(file.listed, false);
  assert.strictEqual(file.event_count, 1);
  assert.strictEqual(dutyMap('DRIVING').code, 3);
  assert.strictEqual(eventChecksum(['1', 'DRIVING']), eventChecksum(['1', 'DRIVING']));
  assert.notStrictEqual(eventChecksum(['1']), eventChecksum(['2']));
});

test('checklist points at the real FMCSA provider portal', () => {
  const c = registrationChecklist({});
  assert.match(c.links.provider_portal, /eld\.fmcsa\.dot\.gov\/provider/);
  assert.strictEqual(c.phone_gps_is_eld, undefined);
  assert.strictEqual(c.listed, false);
  assert.ok(c.steps.find((s) => s.key === 'ecm'));
});

test('FourKites, MacroPoint, Trucker Tools use official partner endpoints, not scrape URLs', () => {
  const keys = listPartners().map((p) => p.key).sort();
  assert.deepStrictEqual(keys, ['fourkites', 'macropoint', 'truckertools']);
  const fk = getPartner('fourkites');
  assert.strictEqual(fk.pushUrl, 'https://tracking-api.fourkites.com/api/v1/tracking/dispatcher_updates');
  const mp = getPartner('macropoint');
  assert.strictEqual(mp.pushUrl, 'https://macropoint-lite.com/api/1.0/tms/data/location');
  const catalog = JSON.stringify(listPartners());
  assert.doesNotMatch(catalog, /macropoint\.com\/scrape/i);
  assert.match(catalog, /integrations@truckertools\.com/);
  assert.match(catalog, /MPActivations@descartes\.com/);
});

test('FourKites dispatcher payload requires shipper + BOL and real GPS', () => {
  const payload = buildFourkitesPayload({
    lat: 41.85,
    lon: -87.65,
    shipper: 'SHIPPER-A',
    billOfLading: 'BOL-99',
    locatedAt: '2026-09-29T14:21:00Z'
  });
  assert.strictEqual(payload.updates[0].latitude, '41.85');
  assert.strictEqual(payload.updates[0].locatedAt, fourkitesLocatedAt('2026-09-29T14:21:00Z'));
  assert.match(payload.updates[0].locatedAt, /^\d{4}-\d{2}-\d{2}-\d{2}\.\d{2}\.\d{2}$/);
  assert.throws(() => buildFourkitesPayload({ lat: 41, lon: -87, shipper: '', billOfLading: 'x' }));
  assert.throws(() => buildFourkitesPayload({ lat: null, lon: -87, shipper: 'A', billOfLading: 'B' }));
});

test('MacroPoint XML uses the documented TMSLocationData namespace', () => {
  const xml = buildMacropointXml({
    lat: 41.3969,
    lon: -81.662491,
    macropoint_mpid: '123456',
    macropoint_sender_load_id: 'ABC123',
    macropoint_requestor_load_id: 'Load-123',
    locatedAt: '2020-01-01T12:00:00Z'
  });
  assert.match(xml, /xmlns="http:\/\/macropoint-lite.com\/xml\/1.0"/);
  assert.match(xml, /<Latitude>41\.396900<\/Latitude>/);
  assert.match(xml, /<MPID>123456<\/MPID>/);
  assert.strictEqual(xmlEscape('<&>'), '&lt;&amp;&gt;');
  assert.throws(() => buildMacropointXml({ lat: 1, lon: 2, macropoint_mpid: '' }));
});

test('Trucker Tools payload is JSON plus CSV; partner URL is not invented', () => {
  const body = buildTruckerToolsPayload({ lat: 33.4, lon: -112, load_number: 'LN-1', driverPhone: '2145550100' }, { accountId: 'acc', partnerId: '198' });
  assert.strictEqual(body.latitude, 33.4);
  assert.strictEqual(body.accountId, 'acc');
  assert.match(truckerToolsCsv({ lat: 33.4, lon: -112, load_number: 'LN-1' }), /LoadNumber,DriverPhone,Latitude/);
  const tt = getPartner('truckertools');
  assert.strictEqual(tt.pushUrl, null);
});

test('FourKites nonce digest helper builds a Digest header', () => {
  const challenge = parseDigestChallenge('Digest realm="api", nonce="abc", qop="auth", algorithm=MD5');
  const header = digestAuthorization({
    username: 'client',
    password: 'secret',
    method: 'POST',
    uri: '/api/v1/tracking/dispatcher_updates',
    challenge,
    nc: '00000001',
    cnonce: 'deadbeef'
  });
  assert.match(header, /^Digest /);
  assert.match(header, /username="client"/);
  assert.match(header, /response="/);
});

test('visibilityFromBody only accepts the three official partners', () => {
  const vis = visibilityFromBody({
    visibility_partners: ['fourkites', 'scrapeme', 'macropoint'],
    shipper: 'ACME',
    billOfLading: 'B1'
  });
  assert.deepStrictEqual(vis.partners, ['fourkites', 'macropoint']);
  assert.deepStrictEqual(visibilityFromBody({}), {});
});

test('previewPayload and desks are wired; marketing.css is untouched', () => {
  const prev = previewPayload('fourkites', { lat: 40, lon: -74, shipper: 'S', billOfLading: 'B' });
  assert.strictEqual(prev.contentType, 'application/json');
  const page = fs.readFileSync(path.join(__dirname, '../public/visibility-desk.html'), 'utf8');
  const reg = fs.readFileSync(path.join(__dirname, '../public/eld-register.html'), 'utf8');
  const desk = fs.readFileSync(path.join(__dirname, '../public/broker-desk.html'), 'utf8');
  const eld = fs.readFileSync(path.join(__dirname, '../public/eld-desk.html'), 'utf8');
  const shell = fs.readFileSync(path.join(__dirname, '../public/js/app-shell.js'), 'utf8');
  const boot = fs.readFileSync(path.join(__dirname, '../public/js/app-shell-boot.js'), 'utf8');
  const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  const visRoute = fs.readFileSync(path.join(__dirname, '../routes/visibility.js'), 'utf8');
  const regRoute = fs.readFileSync(path.join(__dirname, '../routes/eld-registration.js'), 'utf8');
  const ping = fs.readFileSync(path.join(__dirname, '../routes/track-share.js'), 'utf8');
  const marketingCss = fs.readFileSync(path.join(__dirname, '../public/css/marketing.css'), 'utf8');
  const billing = fs.readFileSync(path.join(__dirname, '../routes/billing.js'), 'utf8');

  assert.match(page, /tracking-api\.fourkites\.com/);
  assert.match(page, /macropoint-lite\.com/);
  assert.match(page, /integrations@truckertools\.com/);
  assert.match(page, /const FALLBACK/);
  assert.match(page, /renderProv\(\);/);
  assert.doesNotMatch(page, /marketing\.css/);
  assert.match(reg, /eld\.fmcsa\.dot\.gov\/provider/);
  assert.match(reg, /phone GPS \/ SW Track is not an ELD/);
  assert.match(desk, /vp-fourkites/);
  assert.match(eld, /\/eld-register/);
  assert.match(shell, /href: '\/eld-register'/);
  assert.match(shell, /href: '\/visibility-desk'/);
  assert.match(shell, /SIDEBAR_VERSION = '29'/);
  assert.match(boot, /BOOT_VER = '29'/);
  assert.match(server, /routes\/eld-registration/);
  assert.match(server, /routes\/visibility/);
  assert.match(visRoute, /consent/);
  assert.match(regRoute, /fmcsa_listing_id/);
  assert.match(ping, /pushShareToConnections/);
  assert.doesNotMatch(marketingCss, /visibility-desk/);
  assert.doesNotMatch(marketingCss, /eld-register/);
  assert.match(billing, /MacroPoint \/ FourKites \/ Trucker Tools/);
});

console.log('ok  eld visibility');
