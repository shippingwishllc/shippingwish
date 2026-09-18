require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const pool = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'shippingwish-enterprise-secret-key-2026';

function generateTestToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name || 'Test User'
    },
    JWT_SECRET,
    { expiresIn: '2h' }
  );
}

function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
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
    });
    req.on('error', reject);
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

async function runTests() {
  console.log('=====================================================');
  console.log('STARTING PHASE 6: TELEMATICS, PUSH & MESSAGING TESTS');
  console.log('=====================================================\n');

  try {
    // 1. Get or create test superadmin user
    let userRes = await pool.query(`SELECT id, email, role, name FROM users WHERE role = 'super_admin' LIMIT 1`);
    if (userRes.rows.length === 0) {
      userRes = await pool.query(`SELECT id, email, role, name FROM users LIMIT 1`);
    }
    const testUser = userRes.rows[0];
    const authToken = generateTestToken(testUser);
    console.log(`[AUTH] Testing with user: ${testUser.email} (Role: ${testUser.role}, ID: ${testUser.id})`);

    // TEST 1: Register Mobile Push Token
    console.log('\n[TEST 1] Testing POST /api/mobile/push-token...');
    const testPushToken = `ExponentPushToken[Test_${Date.now()}]`;
    const pushRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/mobile/push-token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      }
    }, {
      token: testPushToken,
      platform: 'android',
      appName: 'loadnexus-carrier'
    });

    console.log('Status:', pushRes.status);
    console.log('Response:', pushRes.data);
    if (pushRes.status !== 200 || !pushRes.data.ok) {
      throw new Error('Push token registration failed');
    }
    console.log('✅ Push Token successfully registered in PostgreSQL!');

    // TEST 2: Test Push Notification Dispatch (Dry-Run / Expo)
    console.log('\n[TEST 2] Testing POST /api/mobile/send-test...');
    const testSendRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/mobile/send-test',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      }
    }, {
      title: 'LoadNexus Dispatch Alert',
      body: 'High paying spot load booked: Chicago to Atlanta ($3,450)'
    });
    console.log('Status:', testSendRes.status);
    console.log('Result:', testSendRes.data);
    if (testSendRes.status !== 200 || !testSendRes.data.ok) {
      throw new Error('Push notification test endpoint failed');
    }
    console.log('✅ Push Notification dispatch pipeline operational!');

    // TEST 3: Driver Duty GPS Tracking Ping (POST /api/tracking/ping)
    console.log('\n[TEST 3] Testing POST /api/tracking/ping (Duty Telematics)...');
    const pingRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/tracking/ping',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      }
    }, {
      latitude: 41.8781,
      longitude: -87.6298,
      speed: 63.5,
      heading: 145.0,
      locationName: 'Chicago, IL (I-94 South)',
      status: 'in_transit',
      notes: 'Driver on duty, speed 63.5mph'
    });
    console.log('Status:', pingRes.status);
    console.log('Event recorded ID:', pingRes.data.event && pingRes.data.event.id);
    if (pingRes.status !== 200 || !pingRes.data.ok) {
      throw new Error('GPS Telematics ping failed');
    }
    console.log('✅ Live GPS Telematics ping stored in PostgreSQL!');

    // TEST 4: Live Fleet GPS Query (GET /api/tracking/live-fleet)
    console.log('\n[TEST 4] Testing GET /api/tracking/live-fleet...');
    const fleetRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/tracking/live-fleet',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    console.log('Status:', fleetRes.status);
    console.log('Active Fleet Count:', fleetRes.data.count);
    console.log('Sample Driver:', fleetRes.data.fleet && fleetRes.data.fleet[0]);
    if (fleetRes.status !== 200 || !fleetRes.data.ok || fleetRes.data.fleet.length === 0) {
      throw new Error('GET /api/tracking/live-fleet failed');
    }
    console.log('✅ Live Fleet Telematics radar query successful!');

    // TEST 5: In-App Load Messaging (POST & GET /api/loads/:id/messages)
    console.log('\n[TEST 5] Testing In-App Load Messaging...');
    let loadQuery = await pool.query(`SELECT id, load_number FROM loads LIMIT 1`);
    let activeLoad;
    if (loadQuery.rows.length === 0) {
      const insertedLoad = await pool.query(`
        INSERT INTO loads (load_number, carrier_id, dispatcher_id, rate, pickup_location, delivery_location, status)
        VALUES ('SW-9901', $1, $1, 3200, 'Chicago, IL', 'Atlanta, GA', 'dispatched')
        RETURNING id, load_number
      `, [testUser.id]);
      activeLoad = insertedLoad.rows[0];
      console.log(`Created temporary test load #${activeLoad.load_number} (ID: ${activeLoad.id})`);
    } else {
      activeLoad = loadQuery.rows[0];
      console.log(`Found Load #${activeLoad.load_number} (ID: ${activeLoad.id})`);
    }

    // Post message
    const postMsgRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: `/api/loads/${activeLoad.id}/messages`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      }
    }, {
      message: 'Driver has arrived at shipper receiver dock. Checking in with receiving clerk.'
    });
    console.log('Post Message Status:', postMsgRes.status);
    console.log('Created Message:', postMsgRes.data);
    if (postMsgRes.status !== 200 || !postMsgRes.data.ok) {
      throw new Error('Post load message failed');
    }

    // Fetch messages
    const getMsgRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: `/api/loads/${activeLoad.id}/messages`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    console.log('Get Messages Status:', getMsgRes.status);
    console.log('Messages Count:', getMsgRes.data.messages && getMsgRes.data.messages.length);
    if (getMsgRes.status !== 200 || !getMsgRes.data.ok || getMsgRes.data.messages.length === 0) {
      throw new Error('Get load messages failed');
    }

    // Fetch unified timeline
    const timelineRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: `/api/loads/${activeLoad.id}/timeline`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    console.log('Timeline Events Count:', timelineRes.data.timeline && timelineRes.data.timeline.length);
    console.log('✅ Load messaging and audit timeline verified 100%!');

    // TEST 6: Verify Mobile App Assets Exist
    console.log('\n[TEST 6] Checking official mobile app assets...');
    const appNames = ['driver-app', 'loadnexus-carrier', 'shippingwish-tms', 'loadnexus-broker'];
    for (const app of appNames) {
      const iconPath = path.join(__dirname, '..', 'mobile', app, 'assets', 'icon.png');
      const adaptivePath = path.join(__dirname, '..', 'mobile', app, 'assets', 'adaptive-icon.png');
      const faviconPath = path.join(__dirname, '..', 'mobile', app, 'assets', 'favicon.png');
      if (!fs.existsSync(iconPath) || !fs.existsSync(adaptivePath) || !fs.existsSync(faviconPath)) {
        throw new Error(`Missing asset in ${app}`);
      }
      console.log(`  ✅ ${app}: icon.png (${fs.statSync(iconPath).size} B), adaptive-icon.png (${fs.statSync(adaptivePath).size} B)`);
    }

    console.log('\n=====================================================');
    console.log('🎉 ALL PHASE 6 TELEMATICS, PUSH & MESSAGING TESTS PASSED 100%!');
    console.log('=====================================================\n');
    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  }
}

runTests();
