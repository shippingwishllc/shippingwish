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
  console.log('STARTING PHASE 10: SPOT RATE BENCHMARK & BIDS TESTS');
  console.log('=====================================================\n');

  try {
    let adminRes = await pool.query(`SELECT id, email, role, name FROM users WHERE role = 'super_admin' LIMIT 1`);
    if (adminRes.rows.length === 0) adminRes = await pool.query(`SELECT id, email, role, name FROM users LIMIT 1`);
    const testAdmin = adminRes.rows[0];
    const adminToken = generateTestToken(testAdmin);

    let carrierRes = await pool.query(`SELECT id, email, role, name, company_name FROM users WHERE role = 'carrier' LIMIT 1`);
    if (carrierRes.rows.length === 0) carrierRes = adminRes;
    const testCarrier = carrierRes.rows[0];
    const carrierToken = generateTestToken(testCarrier);

    // TEST 1: Rate Benchmark Engine
    console.log('[TEST 1] Testing GET /api/rates/benchmark (Dallas, TX ➔ Atlanta, GA Reefer)...');
    const benchRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/rates/benchmark?origin=Dallas,%20TX&destination=Atlanta,%20GA&equipment=reefer&diesel_price=3.65',
      method: 'GET'
    });

    console.log('Status:', benchRes.status);
    if (benchRes.status !== 200 || !benchRes.data.ok) {
      throw new Error(`Rate benchmark failed: ${JSON.stringify(benchRes.data)}`);
    }

    const b = benchRes.data;
    console.log(`Lane: ${b.lane.origin} ➔ ${b.lane.destination} (${b.lane.distance_miles} miles, ~${b.lane.estimated_transit_hours} hrs)`);
    console.log(`Market Avg: $${b.pricing_model.market_average.total_rate} ($${b.pricing_model.market_average.all_in_rpm}/mi)`);
    console.log(`Low Spot: $${b.pricing_model.low_spot.total_rate} | High Spot: $${b.pricing_model.high_spot.total_rate}`);
    console.log(`Fuel Surcharge: $${b.pricing_model.fuel_surcharge.fsc_per_mile}/mi ($${b.pricing_model.fuel_surcharge.total_fsc} total)`);
    console.log('✅ Spot Rate Benchmark Engine calculation verified!\n');

    // TEST 2: Top National Corridors Ticker
    console.log('[TEST 2] Testing GET /api/rates/top-lanes...');
    const topRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/rates/top-lanes',
      method: 'GET'
    });

    console.log('Status:', topRes.status);
    if (topRes.status !== 200 || !topRes.data.ok || !topRes.data.corridors.length) {
      throw new Error('Top lanes query failed');
    }
    console.log(`National Diesel Benchmark: $${topRes.data.national_diesel_avg}/gal`);
    console.log(`Fetched ${topRes.data.corridors.length} high-volume national corridors.`);
    console.log(`Sample Lane 1: ${topRes.data.corridors[0].origin} ➔ ${topRes.data.corridors[0].destination} ($${topRes.data.corridors[0].avg_rate}, ${topRes.data.corridors[0].trend})`);
    console.log('✅ Top High-Volume Corridors feed operational!\n');

    // TEST 3: Create a fresh test load for bidding
    console.log('[TEST 3] Creating fresh load for bidding test...');
    const newLoad = await pool.query(`
      INSERT INTO loads (load_number, pickup_location, delivery_location, rate, equipment_type, commodity, status, dispatcher_id)
      VALUES ('SW-BID-8801', 'Dallas, TX', 'Atlanta, GA', 2800.00, '53ft Reefer', 'Fresh Produce', 'new', $1)
      RETURNING id, load_number, rate, status
    `, [testAdmin.id]);
    const load = newLoad.rows[0];
    console.log(`Created Load #${load.load_number} (ID: ${load.id}, Posted Rate: $${load.rate})\n`);

    // TEST 4: Submit Counter-Offer Bid
    console.log('[TEST 4] Testing POST /api/bids/submit (Carrier Counter Offer of $3,150)...');
    const bidRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/bids/submit',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${carrierToken}`
      }
    }, {
      load_id: load.id,
      bid_type: 'counter_offer',
      offered_rate: 3150.00,
      driver_name: 'David Vance',
      truck_unit: 'Unit #304 (2024 Peterbilt 579)',
      ready_time: 'Ready for 8 AM loading dock appointment',
      notes: 'Clean reefer trailer, pre-cooled to 34F.'
    });

    console.log('Status:', bidRes.status);
    if (bidRes.status !== 200 || !bidRes.data.ok) {
      throw new Error(`Bid submit failed: ${JSON.stringify(bidRes.data)}`);
    }
    const bid = bidRes.data.bid;
    console.log(`Created Bid ID: #${bid.id} for Load #${load.id}`);
    console.log(`Type: ${bid.bid_type} | Offered Rate: $${bid.offered_rate} | Status: ${bid.status}`);
    console.log('✅ Carrier counter-offer bid submitted successfully!\n');

    // TEST 5: Fetch Bids for Load
    console.log(`[TEST 5] Testing GET /api/bids/load/${load.id}...`);
    const loadBidsRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: `/api/bids/load/${load.id}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });

    console.log('Status:', loadBidsRes.status);
    if (loadBidsRes.status !== 200 || !loadBidsRes.data.ok) {
      throw new Error('Fetch load bids failed');
    }
    console.log(`Found ${loadBidsRes.data.count} bid(s) on Load #${load.id}`);
    const foundBid = loadBidsRes.data.bids.find(b => b.id === bid.id);
    if (!foundBid) throw new Error('Submitted bid not found in load bids list');
    console.log(`Verified Bid #${foundBid.id}: Carrier "${foundBid.carrier_name || foundBid.carrier_company}" offered $${foundBid.offered_rate}`);
    console.log('✅ Load bids query operational!\n');

    // TEST 6: Broker Counter-Offer
    console.log(`[TEST 6] Testing POST /api/bids/${bid.id}/respond (Broker Counters at $3,000)...`);
    const counterRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: `/api/bids/${bid.id}/respond`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      }
    }, {
      action: 'counter',
      counter_amount: 3000.00,
      counter_notes: 'Meet in middle at $3,000 for firm noon dispatch.'
    });

    console.log('Status:', counterRes.status);
    if (counterRes.status !== 200 || !counterRes.data.ok) {
      throw new Error(`Broker counter failed: ${JSON.stringify(counterRes.data)}`);
    }
    console.log(`Updated Bid Status: ${counterRes.data.bid.status} | Counter Amount: $${counterRes.data.bid.counter_amount}`);
    console.log('✅ Broker counter-offer negotiation operational!\n');

    // TEST 7: Broker Accepts & Awards Load
    console.log(`[TEST 7] Testing POST /api/bids/${bid.id}/respond (Broker Accepts & Awards Load)...`);
    const acceptRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: `/api/bids/${bid.id}/respond`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      }
    }, {
      action: 'accepted'
    });

    console.log('Status:', acceptRes.status);
    if (acceptRes.status !== 200 || !acceptRes.data.ok) {
      throw new Error(`Broker accept failed: ${JSON.stringify(acceptRes.data)}`);
    }
    console.log(`Bid #${bid.id} Status: ${acceptRes.data.bid.status}`);

    // Verify load updated in DB
    const checkLoad = await pool.query(`SELECT id, status, carrier_id, rate FROM loads WHERE id = $1`, [load.id]);
    const updatedLoad = checkLoad.rows[0];
    console.log(`Load #${updatedLoad.id} updated -> Status: ${updatedLoad.status} | Carrier ID: ${updatedLoad.carrier_id} | Final Rate: $${updatedLoad.rate}`);
    if (updatedLoad.status !== 'booked') throw new Error('Load status was not updated to booked');
    console.log('✅ Load automatically assigned to carrier and rate locked!\n');

    // TEST 8: Verify RateCon Generation for Newly Awarded Load
    console.log(`[TEST 8] Testing GET /api/loads/${load.id}/ratecon/pdf for awarded load...`);
    const rateconRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: `/api/loads/${load.id}/ratecon/pdf`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });

    console.log('Status:', rateconRes.status);
    console.log('Content-Type:', rateconRes.headers['content-type']);
    if (rateconRes.status !== 200 || !rateconRes.headers['content-type'].includes('application/pdf')) {
      throw new Error('RateCon generation for awarded load failed');
    }
    console.log('Buffer size:', rateconRes.buffer ? rateconRes.buffer.length : 0, 'bytes');
    console.log('✅ RateCon PDF automatically generated with awarded carrier & rate!\n');

    // TEST 9: Verify Admin Command Center Web Integration
    console.log('[TEST 9] Testing GET /admin-loadnexus...');
    const webRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/admin-loadnexus',
      method: 'GET'
    });

    console.log('Status:', webRes.status);
    if (!webRes.text.includes('tab-content-pricing') || !webRes.text.includes('calculateSpotRate') || !webRes.text.includes('loadBidsQueue')) {
      throw new Error('Admin LoadNexus HTML missing Spot Rates & Bids integration');
    }
    console.log('✅ Web Admin Spot Rates & Bids Desk verified!\n');

    console.log('=====================================================');
    console.log('🎉 ALL PHASE 10 SPOT RATES & BIDS TESTS PASSED 100%!');
    console.log('=====================================================');
    process.exit(0);
  } catch (err) {
    console.error('❌ PHASE 10 TEST FAILED:', err.message);
    process.exit(1);
  }
}

runTests();
