const assert = require('assert');
const {
  parseHomeDays,
  formatHomeDays,
  homeTimeSkipReason,
  combineDeliveryAt,
  isEmptySoon,
  parseHomeRulesText,
  nextHomeMoment
} = require('../utils/dispatch-home-time');
const { parseCarrierText, destinationForHomeTime } = require('../utils/dispatch-brain');

function utc(y, m, d, h = 0) {
  return new Date(Date.UTC(y, m - 1, d, h, 0, 0, 0));
}

let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log('ok  ' + name);
  } catch (err) {
    failed++;
    console.error('FAIL ' + name + '\n  ' + err.message);
  }
}

test('parses FRI SAT home days', () => {
  assert.deepStrictEqual(parseHomeDays('fri, saturday and SUN'), ['FRI', 'SAT', 'SUN']);
  assert.strictEqual(formatHomeDays('home FRI SAT'), 'FRI,SAT');
});

test('HOME FRI SAT is a home_rules text, not off today', () => {
  const parsed = parseCarrierText('HOME FRI SAT', { home_state: 'TX' });
  assert.strictEqual(parsed.intent, 'home_rules');
  assert.deepStrictEqual(parsed.homeDays, ['FRI', 'SAT']);
  const off = parseCarrierText('off today');
  assert.strictEqual(off.intent, 'off');
});

test('EMPTY SOON / unloading are empty_soon', () => {
  assert.strictEqual(parseCarrierText('EMPTY SOON').intent, 'empty_soon');
  assert.strictEqual(parseCarrierText('unloading now in Atlanta').intent, 'empty_soon');
  assert.strictEqual(parseCarrierText('almost empty').intent, 'empty_soon');
});

test('home day pickup is skipped unless the load heads home', () => {
  const friday = utc(2026, 9, 25, 12); // Friday
  const carrier = { home_days: 'FRI,SAT', home_state: 'TX' };
  assert.strictEqual(
    homeTimeSkipReason(carrier, { pickupDate: friday, deliveryState: 'CA', deadhead: 40, loaded: 200 }, friday),
    'home_day_pickup'
  );
  assert.strictEqual(
    homeTimeSkipReason(carrier, { pickupDate: friday, deliveryState: 'TX', deadhead: 40, loaded: 200 }, friday),
    null
  );
});

test('long haul that misses next home evening is skipped', () => {
  const thursday = utc(2026, 9, 24, 8); // Thursday 08:00 UTC, home Friday 20:00
  const carrier = { home_days: 'FRI', home_state: 'TX' };
  assert.strictEqual(
    homeTimeSkipReason(carrier, { pickupDate: utc(2026, 9, 24), deliveryState: 'CA', deadhead: 100, loaded: 2500 }, thursday),
    'misses_home_time'
  );
  assert.strictEqual(
    homeTimeSkipReason(carrier, { pickupDate: utc(2026, 9, 24), deliveryState: 'CA', deadhead: 50, loaded: 200 }, thursday),
    null
  );
});

test('empty-soon window is 1.5 to 3.5 hours before drop', () => {
  const now = utc(2026, 9, 28, 12);
  assert.strictEqual(isEmptySoon(new Date(now.getTime() + 2.5 * 3600000), now), true);
  assert.strictEqual(isEmptySoon(new Date(now.getTime() + 1 * 3600000), now), false);
  assert.strictEqual(isEmptySoon(new Date(now.getTime() + 5 * 3600000), now), false);
});

test('date-only delivery uses 19:00 UTC', () => {
  const at = combineDeliveryAt('2026-09-28', null);
  assert.strictEqual(at.getUTCHours(), 19);
  const timed = combineDeliveryAt('2026-09-28', '2:30 PM');
  assert.strictEqual(timed.getUTCHours(), 14);
  assert.strictEqual(timed.getUTCMinutes(), 30);
});

test('parseHomeRulesText needs home + weekdays', () => {
  assert.deepStrictEqual(parseHomeRulesText('HOME FRI SAT').days, ['FRI', 'SAT']);
  assert.strictEqual(parseHomeRulesText('75201 to Atlanta'), null);
});

test('next home evening is Friday 20:00 UTC from Thursday', () => {
  const next = nextHomeMoment(utc(2026, 9, 24, 8), 'FRI,SAT');
  assert.strictEqual(next.toISOString(), '2026-09-25T20:00:00.000Z');
});

test('destination falls back to prefer_destination when home days are not set', () => {
  const dest = destinationForHomeTime({ prefer_destination: 'Georgia', home_state: 'TX' });
  assert.ok(dest);
  assert.ok(dest.states.includes('GA'));
});

if (failed) {
  console.error('\n' + failed + ' failed');
  process.exit(1);
}
console.log('\nall empty-soon / home-time checks passed');
