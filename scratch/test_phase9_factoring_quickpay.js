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
  console.log('STARTING PHASE 9: FACTORING & QUICKPAY AUDIT TESTS');
  console.log('=====================================================\n');

  try {
    let userRes = await pool.query(`SELECT id, email, role, name FROM users WHERE role = 'super_admin' LIMIT 1`);
    if (userRes.rows.length === 0) userRes = await pool.query(`SELECT id, email, role, name FROM users LIMIT 1`);
    const testAdmin = userRes.rows[0];
    const adminToken = generateTestToken(testAdmin);

    // Get an existing load
    let loadRes = await pool.query(`SELECT id, load_number, rate, pickup_location, delivery_location FROM loads LIMIT 1`);
    let testLoad;
    if (loadRes.rows.length > 0) {
      testLoad = loadRes.rows[0];
    } else {
      const newLoad = await pool.query(`
        INSERT INTO loads (load_number, pickup_location, delivery_location, rate, equipment_type, commodity, status)
        VALUES ('SW-TEST-9001', 'Chicago, IL', 'Atlanta, GA', 3450.00, '53ft Reefer', 'Chilled Produce', 'assigned')
        RETURNING id, load_number, rate, pickup_location, delivery_location
      `);
      testLoad = newLoad.rows[0];
    }

    console.log(`Using Test Load #${testLoad.load_number || testLoad.id} ($${testLoad.rate || 3450} rate)\n`);

    // TEST 1: Submit Load for 24-Hour QuickPay (2% fee)
    console.log('[TEST 1] Testing POST /api/factoring/submit (24h QuickPay)...');
    const submitRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/factoring/submit',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      }
    }, {
      load_id: testLoad.id,
      payment_method: 'quickpay_24h',
      remit_bank_name: 'JPMorgan Chase Bank, N.A.',
      remit_account_last4: '9182',
      pod_notes: 'Consignee receiver signed clean BOL on dock. No OS&D claims.'
    });

    console.log('Status:', submitRes.status);
    if (submitRes.status !== 200 || !submitRes.data.ok) {
      throw new Error(`QuickPay submit failed: ${JSON.stringify(submitRes.data)}`);
    }

    const sub = submitRes.data.submission;
    console.log(`Created Submission ID: #${sub.id}`);
    console.log(`Gross Amount: $${sub.gross_amount} | Fee (${sub.fee_percent}%): -$${sub.fee_amount} | Net Payout: $${sub.net_payout}`);
    console.log(`Status: ${sub.status}`);

    const expectedFee = parseFloat(((parseFloat(sub.gross_amount) * 2.0) / 100).toFixed(2));
    const expectedNet = parseFloat((parseFloat(sub.gross_amount) - expectedFee).toFixed(2));
    if (parseFloat(sub.net_payout) !== expectedNet) {
      throw new Error(`Fee math mismatch! Expected ${expectedNet}, got ${sub.net_payout}`);
    }
    console.log('✅ QuickPay 2% calculation verified mathematically!\n');

    // TEST 2: List Factoring Submissions
    console.log('[TEST 2] Testing GET /api/factoring/submissions...');
    const listRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/factoring/submissions',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });

    console.log('Status:', listRes.status);
    if (listRes.status !== 200 || !listRes.data.ok) {
      throw new Error(`Factoring submissions list failed: ${JSON.stringify(listRes.data)}`);
    }
    console.log(`Fetched ${listRes.data.count} submissions.`);
    const found = listRes.data.submissions.find(s => s.id === sub.id);
    if (!found) throw new Error('Newly created submission not found in list');
    console.log(`Found record in queue: Settlement #${found.id} for Load #${found.load_number}`);
    console.log('✅ Factoring submissions pipeline query operational!\n');

    // TEST 3: Approve QuickPay Payout (Instant ACH Release)
    console.log(`[TEST 3] Testing POST /api/factoring/approve/${sub.id}...`);
    const approveRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: `/api/factoring/approve/${sub.id}`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });

    console.log('Status:', approveRes.status);
    if (approveRes.status !== 200 || !approveRes.data.ok) {
      throw new Error(`Factoring approve failed: ${JSON.stringify(approveRes.data)}`);
    }
    console.log(`Approved status: ${approveRes.data.submission.status}`);
    console.log(`Message: ${approveRes.data.message}`);
    console.log('✅ QuickPay payout approval & ACH release operational!\n');

    // TEST 4: Generate Factoring Packet PDF
    console.log(`[TEST 4] Testing GET /api/factoring/packet/${sub.id}/pdf...`);
    const pdfRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: `/api/factoring/packet/${sub.id}/pdf`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });

    console.log('Status:', pdfRes.status);
    console.log('Content-Type:', pdfRes.headers['content-type']);
    console.log('Content-Disposition:', pdfRes.headers['content-disposition']);
    console.log('Buffer size:', pdfRes.buffer ? pdfRes.buffer.length : 0, 'bytes');

    if (pdfRes.status !== 200 || !pdfRes.headers['content-type'].includes('application/pdf')) {
      throw new Error('Factoring packet PDF generation failed');
    }
    const pdfHeader = pdfRes.buffer.slice(0, 5).toString('utf8');
    if (!pdfHeader.startsWith('%PDF-')) {
      throw new Error(`Invalid PDF header: ${pdfHeader}`);
    }
    console.log(`Valid PDF document header: ${pdfHeader}`);
    console.log('✅ Factoring Settlement Packet PDF generation verified!\n');

    // TEST 5: Verify Web Dashboard Endpoint
    console.log('[TEST 5] Testing GET /admin-loadnexus...');
    const webRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/admin-loadnexus',
      method: 'GET'
    });
    console.log('Status:', webRes.status);
    if (!webRes.text.includes('tab-content-factoring') || !webRes.text.includes('loadFactoringSubmissions')) {
      throw new Error('Admin LoadNexus HTML missing factoring integration');
    }
    console.log('✅ Web Admin Factoring & QuickPay desk verified!\n');

    console.log('=====================================================');
    console.log('🎉 ALL PHASE 9 FACTORING & QUICKPAY TESTS PASSED 100%!');
    console.log('=====================================================');
    process.exit(0);
  } catch (err) {
    console.error('❌ PHASE 9 TEST FAILED:', err.message);
    process.exit(1);
  }
}

runTests();
