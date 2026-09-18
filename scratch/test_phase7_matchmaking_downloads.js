require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');

function request(pathStr) {
  return new Promise((resolve, reject) => {
    http.get({
      hostname: 'localhost',
      port: 3000,
      path: pathStr
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, text: body });
        }
      });
    }).on('error', reject);
  });
}

async function runTests() {
  console.log('=====================================================');
  console.log('STARTING PHASE 7: MATCHMAKING, EAS BUILDS & DOWNLOADS');
  console.log('=====================================================\n');

  try {
    // TEST 1: Truck Matches API
    console.log('[TEST 1] Testing GET /api/loadboard/matches/truck...');
    const truckRes = await request('/api/loadboard/matches/truck?origin=Chicago,IL&equipment_type=Reefer&min_rpm=2.5');
    console.log('Status:', truckRes.status);
    console.log('Matches Found:', truckRes.data.count);
    if (truckRes.status !== 200 || !truckRes.data.ok || !truckRes.data.matches || truckRes.data.matches.length === 0) {
      throw new Error('Truck matchmaking failed');
    }
    const bestMatch = truckRes.data.matches[0];
    console.log(`Top Match: ${bestMatch.id} | ${bestMatch.origin} ➔ ${bestMatch.destination} | Rate: $${bestMatch.rate} ($${bestMatch.rpm}/mi) | Match Score: ${bestMatch.match_score}%`);
    console.log('Broker:', bestMatch.broker_name, `(${bestMatch.broker_rating}, DTP: ${bestMatch.days_to_pay}d)`);
    console.log('✅ Truck Matchmaking Algorithm operational!');

    // TEST 2: Load Matches API
    console.log('\n[TEST 2] Testing GET /api/loadboard/matches/load...');
    const loadRes = await request('/api/loadboard/matches/load?origin=Dallas,TX&equipment_type=Dry+Van');
    console.log('Status:', loadRes.status);
    console.log('Carrier Trucks Found:', loadRes.data.count);
    if (loadRes.status !== 200 || !loadRes.data.ok || !loadRes.data.matches || loadRes.data.matches.length === 0) {
      throw new Error('Load carrier matchmaking failed');
    }
    const bestCarrier = loadRes.data.matches[0];
    console.log(`Top Carrier: ${bestCarrier.carrier_name} (${bestCarrier.mc_number}) | Equipment: ${bestCarrier.equipment_type} | Contact: ${bestCarrier.contact_phone} | Score: ${bestCarrier.match_score}%`);
    console.log('✅ Load to Carrier Capacity Matchmaking operational!');

    // TEST 3: Precomputed Live Matching Pairs
    console.log('\n[TEST 3] Testing GET /api/loadboard/matches/live-board...');
    const liveBoardRes = await request('/api/loadboard/matches/live-board');
    console.log('Status:', liveBoardRes.status);
    console.log('Live Corridors Count:', liveBoardRes.data.pairs && liveBoardRes.data.pairs.length);
    if (liveBoardRes.status !== 200 || !liveBoardRes.data.ok || liveBoardRes.data.pairs.length === 0) {
      throw new Error('Live matchmaking board failed');
    }
    console.log('Sample Live Match:', liveBoardRes.data.pairs[0].lane, `(${liveBoardRes.data.pairs[0].match_confidence})`);
    console.log('✅ Precomputed Live Matching Board operational!');

    // TEST 4: Public Downloads Portal
    console.log('\n[TEST 4] Testing GET /app-downloads (Public Downloads Center)...');
    const dlRes = await request('/app-downloads');
    console.log('Status:', dlRes.status);
    const hasDriver = dlRes.text && dlRes.text.includes('Driver Console');
    const hasCarrier = dlRes.text && dlRes.text.includes('LoadNexus Carrier');
    const hasTms = dlRes.text && dlRes.text.includes('Shipping Wish TMS');
    const hasBroker = dlRes.text && dlRes.text.includes('LoadNexus Broker');
    if (dlRes.status !== 200 || !hasDriver || !hasCarrier || !hasTms || !hasBroker) {
      throw new Error('Downloads page did not render properly');
    }
    console.log('Downloads Portal: Clean HTML rendered with all 4 applications and APK options!');
    console.log('✅ Public Downloads Center verified!');

    // TEST 5: Verify EAS Build Configuration & Root Scripts
    console.log('\n[TEST 5] Checking EAS build scripts across 4 apps...');
    const rootPkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    const requiredScripts = ['build:driver:apk', 'build:carrier:apk', 'build:tms:apk', 'build:broker:apk'];
    for (const s of requiredScripts) {
      if (!rootPkg.scripts[s]) {
        throw new Error(`Missing root script: ${s}`);
      }
      console.log(`  ✅ ${s} -> "${rootPkg.scripts[s]}"`);
    }

    const appDirs = ['driver-app', 'loadnexus-carrier', 'shippingwish-tms', 'loadnexus-broker'];
    for (const app of appDirs) {
      const pJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'mobile', app, 'package.json'), 'utf8'));
      if (!pJson.scripts['eas-build']) {
        throw new Error(`Missing eas-build script in ${app}`);
      }
      const easJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'mobile', app, 'eas.json'), 'utf8'));
      if (!easJson.build || !easJson.build.preview || easJson.build.preview.android.buildType !== 'apk') {
        throw new Error(`Invalid eas.json in ${app}`);
      }
      console.log(`  ✅ ${app}: eas.json configured for android APK buildType!`);
    }

    console.log('\n=====================================================');
    console.log('🎉 ALL PHASE 7 MATCHMAKING & BUILD TESTS PASSED 100%!');
    console.log('=====================================================\n');
    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed:', err.message);
    process.exit(1);
  }
}

runTests();
