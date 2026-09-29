const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { encryptSecret, decryptSecret } = require('../utils/eld-crypto');
const {
  listProviders,
  oauthAuthorizeUrl,
  mapMotiveVehicle,
  mapSamsaraVehicle,
  mapMotiveDriver,
  normalizeDuty,
  minutesFromClock,
  formatMinutes,
  applyWebhookLocation,
  osmEmbedForPoints
} = require('../utils/eld-providers');

function test(name, fn) {
  fn();
  console.log('ok  ' + name);
}

test('secrets round-trip and stay off the public provider list', () => {
  const blob = encryptSecret('motive-demo-key-not-real');
  assert.notEqual(blob, 'motive-demo-key-not-real');
  assert.strictEqual(decryptSecret(blob), 'motive-demo-key-not-real');
  const catalog = JSON.stringify(listProviders());
  assert.doesNotMatch(catalog, /sk_live|Bearer |MOTIVE_CLIENT_SECRET=|sessionId/);
  assert.match(catalog, /motive/);
  assert.match(catalog, /samsara/);
  assert.match(catalog, /geotab/);
});

test('Motive OAuth URL is the official gomotive authorize endpoint', () => {
  const url = oauthAuthorizeUrl('motive', {
    clientId: 'demo-client',
    state: 'abc',
    redirectUri: 'https://shippingwish.com/api/eld-connect/oauth/motive/callback'
  });
  assert.match(url, /^https:\/\/gomotive\.com\/oauth\/authorize\?/);
  assert.match(url, /client_id=demo-client/);
  assert.match(url, /response_type=code/);
  assert.doesNotMatch(url, /keeptruckin\.com\/login/);
});

test('Motive and Samsara vehicle mappers keep real GPS and skip missing coords', () => {
  const motive = mapMotiveVehicle({
    vehicle: {
      id: 91,
      number: '402',
      vin: '1XKADB9X0LJ123456',
      current_location: { lat: 39.7684, lon: -86.1581, description: 'Indianapolis, IN', located_at: '2026-04-02T12:00:00Z' }
    }
  });
  assert.strictEqual(motive.external_id, '91');
  assert.strictEqual(motive.gps_lat, 39.7684);
  assert.strictEqual(motive.vin, '1XKADB9X0LJ123456');
  const empty = mapMotiveVehicle({ vehicle: { id: 2, number: '88' } });
  assert.strictEqual(empty.gps_lat, null);
  const samsara = mapSamsaraVehicle({
    id: 'veh_1',
    name: 'Unit 12',
    gps: { latitude: 41.25, longitude: -95.94, time: '2026-04-02T12:00:00Z' }
  });
  assert.strictEqual(samsara.gps_lon, -95.94);
  assert.ok(!osmEmbedForPoints([{ lat: null, lng: null }]));
  assert.match(osmEmbedForPoints([{ lat: 39.7684, lng: -86.1581 }]), /openstreetmap\.org\/export\/embed/);
});

test('HOS clocks map from vendor fields without inventing hours', () => {
  assert.strictEqual(normalizeDuty('driving'), 'DRIVING');
  assert.strictEqual(minutesFromClock(5400000), 90);
  assert.strictEqual(formatMinutes(null), '—');
  const driver = mapMotiveDriver({
    user: { id: 5, full_name: 'Test Driver', email: 'driver@example.com', duty_status: 'OFF_DUTY' }
  });
  assert.strictEqual(driver.drive_remaining_minutes, null);
  assert.strictEqual(driver.duty_status, 'OFF_DUTY');
});

test('webhook location apply requires a vehicle id and does not invent Dallas', () => {
  const mapped = applyWebhookLocation('motive', {
    vehicle_location: { vehicle_id: 91, lat: 33.4, lon: -112.0, description: 'Phoenix, AZ' }
  });
  assert.strictEqual(mapped.external_id, '91');
  assert.strictEqual(mapped.gps_lat, 33.4);
  assert.strictEqual(applyWebhookLocation('motive', { hello: true }), null);
});

test('login ELD desk is wired and public marketing.css is untouched', () => {
  const page = fs.readFileSync(path.join(__dirname, '../public/eld-desk.html'), 'utf8');
  const shell = fs.readFileSync(path.join(__dirname, '../public/js/app-shell.js'), 'utf8');
  const boot = fs.readFileSync(path.join(__dirname, '../public/js/app-shell-boot.js'), 'utf8');
  const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  const route = fs.readFileSync(path.join(__dirname, '../routes/eld-connect.js'), 'utf8');
  const compliance = fs.readFileSync(path.join(__dirname, '../routes/eld-compliance.js'), 'utf8');
  const tracking = fs.readFileSync(path.join(__dirname, '../routes/tracking.js'), 'utf8');
  const marketingCss = fs.readFileSync(path.join(__dirname, '../public/css/marketing.css'), 'utf8');
  const eldMarketing = fs.readFileSync(path.join(__dirname, '../public/eld.html'), 'utf8');

  assert.match(page, /Connect Motive, Samsara, or Geotab/);
  assert.match(page, /\/api\/eld-connect\/api-key/);
  assert.match(page, /eld-consent/);
  assert.doesNotMatch(page, /marketing\.css/);
  assert.match(shell, /href: '\/eld-desk'/);
  assert.match(shell, /SIDEBAR_VERSION = '29'/);
  assert.match(boot, /BOOT_VER = '29'/);
  assert.match(server, /routes\/eld-connect/);
  const providers = fs.readFileSync(path.join(__dirname, '../utils/eld-providers.js'), 'utf8');
  assert.match(route, /consent is required/);
  assert.match(providers, /gomotive\.com\/oauth\/authorize/);
  assert.match(providers, /MOTIVE_CLIENT_ID/);
  assert.doesNotMatch(compliance, /gps_lat = 32\.7767/);
  assert.doesNotMatch(compliance, /odometer_miles = 184920/);
  assert.doesNotMatch(compliance, /MC-1094821/);
  assert.doesNotMatch(compliance, /FMCSA ELD COMPLIANT/);
  assert.doesNotMatch(tracking, /Marcus Vance \(Unit #402\)/);
  assert.doesNotMatch(marketingCss, /eld-desk/);
  assert.match(eldMarketing, /design-system\.css/);
});

test('driver app duty change posts real GPS fields, not a hardcoded city', () => {
  const js = fs.readFileSync(path.join(__dirname, '../public/js/driver-app.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '../public/driver-app.html'), 'utf8');
  assert.match(js, /\/api\/eld\/status-change/);
  assert.match(js, /gps_lat/);
  assert.match(html, /data-duty="DRIVING"/);
  assert.doesNotMatch(js, /Dallas/);
});

console.log('ok  eld connect');
