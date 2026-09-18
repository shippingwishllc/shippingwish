// scratch/test_phase3_command_center.js
// Automated verification for Phase 3: Superadmin LoadNexus Command Center, Broker Scores & Anti-Fraud Freeze

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const jwt = require('jsonwebtoken');

const BASE_URL = 'http://localhost:3000';
const JWT_SECRET = process.env.JWT_SECRET || 'shipping_wish_super_secret_jwt_key_2026';

const adminToken = jwt.sign(
  {
    userId: 1,
    email: 'admin@shippingwish.com',
    role: 'super_admin',
    name: 'Super Admin'
  },
  JWT_SECRET,
  { expiresIn: '1h' }
);

async function runTests() {
  console.log('=====================================================');
  console.log('STARTING PHASE 3: LOADNEXUS COMMAND CENTER API TESTS');
  console.log('=====================================================\n');

  // Test 1: Live Stats
  console.log('[TEST 1] Testing GET /api/loadboard/stats/live...');
  const statsRes = await fetch(`${BASE_URL}/api/loadboard/stats/live`);
  const statsJson = await statsRes.json();
  console.log('Status:', statsRes.status, 'Stats:', statsJson.stats);
  if (!statsJson.ok || !statsJson.stats) throw new Error('Stats API failed');

  // Test 2: Broker Scores
  console.log('\n[TEST 2] Testing GET /api/loadboard/brokers/scores...');
  const brokersRes = await fetch(`${BASE_URL}/api/loadboard/brokers/scores`);
  const brokersJson = await brokersRes.json();
  console.log('Status:', brokersRes.status, 'Total Brokers:', brokersJson.brokers?.length);
  if (!brokersJson.ok || !brokersJson.brokers?.length) throw new Error('Broker scores API failed');

  // Test 3: Update Broker Score via PUT
  const targetBroker = brokersJson.brokers[0];
  console.log(`\n[TEST 3] Testing PUT /api/loadboard/brokers/${targetBroker.id}/score...`);
  const updateRes = await fetch(`${BASE_URL}/api/loadboard/brokers/${targetBroker.id}/score`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      credit_rating: 'A+',
      days_to_pay: 17,
      bond_status: 'ACTIVE ($75,000 BMC-84)',
      fraud_risk: 'LOW (Verified Prime)'
    })
  });
  const updateJson = await updateRes.json();
  console.log('Status:', updateRes.status, 'Message:', updateJson.message, 'Updated Broker:', updateJson.broker?.credit_rating);
  if (!updateJson.ok) throw new Error('Update broker score failed: ' + updateJson.error);

  // Test 4: Anti-Fraud Flag & Freeze
  console.log('\n[TEST 4] Testing POST /api/loadboard/anti-fraud/flag...');
  const freezeRes = await fetch(`${BASE_URL}/api/loadboard/anti-fraud/flag`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      load_id: 1,
      reason: 'Rate-con mismatch audit check'
    })
  });
  const freezeJson = await freezeRes.json();
  console.log('Status:', freezeRes.status, 'Action:', freezeJson.action, 'Message:', freezeJson.message);
  if (!freezeJson.ok) throw new Error('Anti-fraud flag failed: ' + freezeJson.error);

  // Test 5: Verify /admin-loadnexus.html page exists
  console.log('\n[TEST 5] Testing GET /admin-loadnexus...');
  const pageRes = await fetch(`${BASE_URL}/admin-loadnexus`);
  console.log('Status:', pageRes.status);
  if (pageRes.status !== 200) throw new Error('Admin LoadNexus page not returning 200');

  console.log('\n=====================================================');
  console.log('🎉 ALL PHASE 3 COMMAND CENTER & ANTI-FRAUD TESTS PASSED!');
  console.log('=====================================================');
}

runTests().catch(err => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
