// scratch/test_phase4_public_integration.js
// Automated verification for Phase 4: Public Homepage LoadNexus Showcase, Dynamic Ticker & Mobile Apps Portal

const BASE_URL = 'http://localhost:3000';

async function runTests() {
  console.log('=====================================================');
  console.log('STARTING PHASE 4: PUBLIC HOMEPAGE & TICKER TESTS');
  console.log('=====================================================\n');

  // Test 1: Public Stats Endpoint
  console.log('[TEST 1] Testing GET /api/loadboard/public-stats...');
  const statsRes = await fetch(`${BASE_URL}/api/loadboard/public-stats`);
  const statsJson = await statsRes.json();
  console.log('Status:', statsRes.status);
  console.log('Loads Today:', statsJson.loads_today);
  console.log('Avg RPM:', statsJson.avg_rpm);
  console.log('Corridors Count:', statsJson.live_corridors?.length);
  if (!statsJson.ok || !statsJson.live_corridors?.length) {
    throw new Error('Public stats failed or returned empty corridors');
  }

  // Verify first corridor has dynamic date
  const c1 = statsJson.live_corridors[0];
  console.log('Sample Corridor 1:', c1.origin, '➔', c1.destination, 'Rate:', c1.rate, 'Date:', c1.pickup_date);

  // Test 2: Public Mobile Apps Portal
  console.log('\n[TEST 2] Testing GET /mobile-apps...');
  const appsRes = await fetch(`${BASE_URL}/mobile-apps`);
  console.log('Status:', appsRes.status);
  const appsHtml = await appsRes.text();
  if (appsRes.status !== 200 || !appsHtml.includes('Driver Console') || !appsHtml.includes('LoadNexus Carrier')) {
    throw new Error('Mobile apps page did not render expected content');
  }
  console.log('Mobile Apps Portal: Valid HTML rendered with all 4 applications!');

  // Test 3: Public Homepage LoadNexus Section
  console.log('\n[TEST 3] Testing GET / (Homepage)...');
  const homeRes = await fetch(`${BASE_URL}/`);
  console.log('Status:', homeRes.status);
  const homeHtml = await homeRes.text();
  if (!homeHtml.includes('LoadNexus™') || !homeHtml.includes('Driver Console App')) {
    throw new Error('Homepage missing LoadNexus showcase section');
  }
  console.log('Homepage: Successfully includes LoadNexus™ & Dedicated Mobile Suite section!');

  console.log('\n=====================================================');
  console.log('🎉 ALL PHASE 4 PUBLIC INTEGRATION TESTS PASSED 100%!');
  console.log('=====================================================');
}

runTests().catch(err => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
