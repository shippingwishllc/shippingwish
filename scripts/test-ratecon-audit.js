const assert = require('assert');
const { parseRateCon, auditRateCon } = require('../utils/ratecon-audit');

console.log('======================================================');
console.log('  Testing Rate Confirmation PDF Audit Engine');
console.log('======================================================\n');

// 1. Clean matching RateCon
const validRateConText = `CARRIER RATE CONFIRMATION
Order Number: OGR-99412
Broker: Ogre Logistics (MC 941285)
Shipper: 100 Main St, Hopkinsville, KY
Receiver: 500 Gulf Fwy, Dibersville, MS
Total Carrier Pay: $1,000.00
Detention: $50.00/hr after 2 hrs
TONU: $150
DRIVER ASSIST REQUIRED AT RECEIVER`;

const parsed = parseRateCon(validRateConText);
assert.strictEqual(parsed.rate, 1000, 'Rate should be $1000');
assert.strictEqual(parsed.origin, 'Hopkinsville, KY', 'Origin should be Hopkinsville, KY');
assert.strictEqual(parsed.destination, 'Dibersville, MS', 'Destination should be Dibersville, MS');
assert.strictEqual(parsed.broker_mc, '941285', 'Broker MC should be 941285');
assert.strictEqual(parsed.driver_assist, true, 'Driver assist should be true');

const expected = { rate: 1000, origin: 'Hopkinsville, KY', destination: 'Dibersville, MS' };
const auditPass = auditRateCon(expected, parsed);
assert.strictEqual(auditPass.status, 'PASSED', 'Audit should pass');
assert.strictEqual(auditPass.passed, true, 'Audit passed boolean should be true');
console.log('  [PASS] Clean RateCon verified & audit passed (Score: ' + auditPass.score + ')');

// 2. Underpaid / Discrepancy RateCon
const underpaidText = validRateConText.replace('$1,000.00', '$900.00');
const parsedUnderpaid = parseRateCon(underpaidText);
const auditFail = auditRateCon(expected, parsedUnderpaid);
assert.strictEqual(auditFail.status, 'DISCREPANCY', 'Audit should flag DISCREPANCY');
assert.strictEqual(auditFail.passed, false, 'Audit passed should be false');
assert(auditFail.discrepancies.some(d => d.message.includes('SHORT BY $100')), 'Discrepancy should mention $100 shortage');
console.log('  [PASS] Rate discrepancy caught ($900 vs agreed $1,000)');

console.log('\n======================================================');
console.log('  All RateCon Audit Tests Passed (2/2)');
console.log('======================================================\n');
