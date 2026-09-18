require('dotenv').config();
const http = require('http');
const jwt = require('jsonwebtoken');
const pool = require('d:/shippingwish/db');

const JWT_SECRET = process.env.JWT_SECRET || 'shippingwish-enterprise-secret-key-2026';

function generateTestToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name || 'Test User' },
    JWT_SECRET,
    { expiresIn: '2h' }
  );
}

function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const contentType = res.headers['content-type'] || '';
        if (contentType.includes('application/json')) {
          try {
            resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(buffer.toString('utf8')) });
          } catch (e) {
            resolve({ status: res.statusCode, headers: res.headers, text: buffer.toString('utf8') });
          }
        } else {
          resolve({ status: res.statusCode, headers: res.headers, buffer, text: buffer.toString('utf8') });
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
  console.log('STARTING PHASE 11: DETENTION CLOCK & COI TESTS');
  console.log('=====================================================\n');

  try {
    let adminRes = await pool.query(`SELECT id, email, role, name, company_name, mc_number, dot_number FROM users WHERE role = 'super_admin' LIMIT 1`);
    if (adminRes.rows.length === 0) adminRes = await pool.query(`SELECT id, email, role, name, company_name, mc_number, dot_number FROM users LIMIT 1`);
    const testAdmin = adminRes.rows[0];
    const adminToken = generateTestToken(testAdmin);

    // Get an existing load or create one
    let loadRes = await pool.query(`SELECT id, load_number, rate FROM loads ORDER BY id DESC LIMIT 1`);
    let testLoad = loadRes.rows[0];

    // TEST 1: Dock Check-In
    console.log(`[TEST 1] Testing POST /api/detention/checkin (Load #${testLoad.load_number || testLoad.id})...`);
    const checkinRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/detention/checkin',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      }
    }, {
      load_id: testLoad.id,
      stop_type: 'shipper',
      gps_lat: 32.7767,
      gps_lon: -96.7970,
      notes: 'Dock door #14 backed in and engine turned off.'
    });

    console.log('Status:', checkinRes.status);
    if (checkinRes.status !== 200 || !checkinRes.data.ok) {
      throw new Error(`Checkin failed: ${JSON.stringify(checkinRes.data)}`);
    }
    console.log('Check-in Message:', checkinRes.data.message);
    console.log('✅ Driver dock check-in logged & 2-hour free dwell timer started!\n');

    // TEST 2: Active Dwellings Monitor
    console.log('[TEST 2] Testing GET /api/detention/active...');
    const activeRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/detention/active',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });

    console.log('Status:', activeRes.status);
    if (activeRes.status !== 200 || !activeRes.data.ok) {
      throw new Error('Active dwells fetch failed');
    }
    console.log(`Active trucks currently dwelling: ${activeRes.data.count}`);
    console.log('✅ Active dock dwell telematics monitor operational!\n');

    // TEST 3: Dock Checkout & Detention Computation
    console.log(`[TEST 3] Testing POST /api/detention/checkout (4 hrs dwell = 2 hrs detention @ $75/hr + $250 lumper)...`);
    const checkoutRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/detention/checkout',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      }
    }, {
      load_id: testLoad.id,
      stop_type: 'shipper',
      mock_dwell_minutes: 240, // 4 hours
      lumper_amount: 250.00,
      notes: 'Receiver unloaded 24 pallets of chilled cargo.'
    });

    console.log('Status:', checkoutRes.status);
    if (checkoutRes.status !== 200 || !checkoutRes.data.ok) {
      throw new Error(`Checkout failed: ${JSON.stringify(checkoutRes.data)}`);
    }

    const s = checkoutRes.data.summary;
    console.log(`Total Dwell: ${s.total_dwell_hours} hrs (${checkoutRes.data.event.total_dwell_minutes} mins)`);
    console.log(`Free Time Deducted: ${s.free_hours} hrs`);
    console.log(`Billable Detention: ${s.billable_detention_hours} hrs ➔ $${s.detention_amount}`);
    console.log(`Lumper Reimbursement: $${s.lumper_amount}`);
    console.log(`Total Supplemental Accessorial Due: $${s.total_accessorial_due}`);

    if (s.detention_amount !== 150.00 || s.total_accessorial_due !== 400.00) {
      throw new Error(`Detention math mismatch! Expected $150 detention and $400 total, got $${s.total_accessorial_due}`);
    }
    console.log('✅ Detention calculation formula (dwell minus 2h free time @ $75/hr) verified mathematically!\n');

    // TEST 4: Load Detention Events Query
    console.log(`[TEST 4] Testing GET /api/detention/load/${testLoad.id}...`);
    const loadDetRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: `/api/detention/load/${testLoad.id}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });

    console.log('Status:', loadDetRes.status);
    if (loadDetRes.status !== 200 || !loadDetRes.data.ok) {
      throw new Error('Load detention query failed');
    }
    console.log(`Recorded Events: ${loadDetRes.data.events.length}`);
    console.log(`Total Detention: $${loadDetRes.data.totals.total_detention} | Total Accessorials: $${loadDetRes.data.totals.total_accessorials_due}`);
    console.log('✅ Load detention & accessorial audit history verified!\n');

    // TEST 5: Generate Supplemental Accessorial Invoice PDF
    console.log(`[TEST 5] Testing GET /api/detention/invoice/${testLoad.id}/pdf...`);
    const invPdfRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: `/api/detention/invoice/${testLoad.id}/pdf`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });

    console.log('Status:', invPdfRes.status);
    console.log('Content-Type:', invPdfRes.headers['content-type']);
    if (invPdfRes.status !== 200 || !invPdfRes.headers['content-type'].includes('application/pdf')) {
      throw new Error('Accessorial invoice PDF generation failed');
    }
    console.log('Buffer size:', invPdfRes.buffer ? invPdfRes.buffer.length : 0, 'bytes');
    const invPdfHeader = invPdfRes.buffer.slice(0, 5).toString('utf8');
    if (!invPdfHeader.startsWith('%PDF-')) throw new Error('Invalid PDF header on accessorial invoice');
    console.log(`Valid vector PDF header: ${invPdfHeader}`);
    console.log('✅ Supplemental Accessorial Invoice PDF generation verified!\n');

    // TEST 6: Insurance Coverages Preview
    console.log('[TEST 6] Testing GET /api/coi/preview...');
    const coiPrevRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/coi/preview',
      method: 'GET'
    });

    console.log('Status:', coiPrevRes.status);
    if (coiPrevRes.status !== 200 || !coiPrevRes.data.ok) {
      throw new Error('COI preview failed');
    }
    const cov = coiPrevRes.data.coverages;
    console.log(`Auto Liability: $${cov.auto_liability.toLocaleString()} CSL`);
    console.log(`General Liability: $${cov.general_liability.toLocaleString()} Agg`);
    console.log(`Motor Truck Cargo: $${cov.cargo_liability.toLocaleString()} (Broad Form Reefer Spoilage Included)`);
    console.log('✅ Standard Fleet Insurance limits verified!\n');

    // TEST 7: Instant ACORD 25 Certificate of Insurance PDF Generation
    console.log('[TEST 7] Testing POST /api/coi/generate (C.H. Robinson Worldwide as Certificate Holder)...');
    const coiPdfRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/coi/generate',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      }
    }, {
      holder_company: 'C.H. Robinson Worldwide, Inc.',
      holder_address: '14701 Charlson Rd, Eden Prairie, MN 55347',
      holder_email: 'carrier_onboarding@chrobinson.com'
    });

    console.log('Status:', coiPdfRes.status);
    console.log('Content-Type:', coiPdfRes.headers['content-type']);
    if (coiPdfRes.status !== 200 || !coiPdfRes.headers['content-type'].includes('application/pdf')) {
      throw new Error('COI PDF generation failed');
    }
    console.log('Buffer size:', coiPdfRes.buffer ? coiPdfRes.buffer.length : 0, 'bytes');
    const coiPdfHeader = coiPdfRes.buffer.slice(0, 5).toString('utf8');
    if (!coiPdfHeader.startsWith('%PDF-')) throw new Error('Invalid PDF header on ACORD-25 COI');
    console.log(`Valid vector ACORD 25 PDF header: ${coiPdfHeader}`);
    console.log('✅ Instant ACORD-25 Certificate of Insurance (COI) PDF verified!\n');

    // TEST 8: Verify Admin LoadNexus Web Desk Integration
    console.log('[TEST 8] Testing GET /admin-loadnexus...');
    const webRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/admin-loadnexus',
      method: 'GET'
    });

    console.log('Status:', webRes.status);
    if (!webRes.text.includes('tab-content-detention') || !webRes.text.includes('loadDetentionDesk') || !webRes.text.includes('generateBrokerCoiPdf')) {
      throw new Error('Admin LoadNexus HTML missing Detention & COI desk integration');
    }
    console.log('✅ Web Admin Detention & COI Desk verified!\n');

    console.log('=====================================================');
    console.log('🎉 ALL PHASE 11 DETENTION & COI TESTS PASSED 100%!');
    console.log('=====================================================');
    process.exit(0);
  } catch (err) {
    console.error('❌ PHASE 11 TEST FAILED:', err.message);
    process.exit(1);
  }
}

runTests();
