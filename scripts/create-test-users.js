require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../db');

async function seedTestUsers() {
  console.log('🚀 Seeding/Updating Internal Test Users (Carrier & Broker)...');

  try {
    // 1. Password hashes
    const carrierPlainPassword = 'CarrierPass2026!';
    const brokerPlainPassword = 'BrokerPass2026!';

    const carrierHash = await bcrypt.hash(carrierPlainPassword, 10);
    const brokerHash = await bcrypt.hash(brokerPlainPassword, 10);

    // 2. Upsert Carrier Account
    const carrierEmail = 'carrier@shippingwish.com';
    const carrierRes = await pool.query(
      `INSERT INTO users (
        name, email, password_hash, role, company_name, phone,
        mc_number, dot_number, address, weekly_plan, trial_ends_at,
        email_verified_at, is_suspended
      ) VALUES ($1, $2, $3, 'carrier', $4, $5, $6, $7, $8, 'loadboard_ai_pass', NOW() + interval '365 days', NOW(), false)
      ON CONFLICT (email) DO UPDATE SET
        name = EXCLUDED.name,
        password_hash = EXCLUDED.password_hash,
        role = 'carrier',
        company_name = EXCLUDED.company_name,
        phone = EXCLUDED.phone,
        mc_number = EXCLUDED.mc_number,
        dot_number = EXCLUDED.dot_number,
        address = EXCLUDED.address,
        weekly_plan = 'loadboard_ai_pass',
        trial_ends_at = NOW() + interval '365 days',
        email_verified_at = NOW(),
        is_suspended = false,
        deleted_at = NULL
      RETURNING id, name, email, role, weekly_plan, trial_ends_at`,
      [
        'Apex Global Carriers',
        carrierEmail,
        carrierHash,
        'Apex Global Freight LLC',
        '+1 (800) 555-0199',
        'MC-1094821',
        '3892011',
        '100 Logistics Way, Suite 400, Dallas, TX 75201'
      ]
    );
    const carrierUser = carrierRes.rows[0];
    console.log(`✅ Carrier user ready (ID: ${carrierUser.id}, Email: ${carrierUser.email})`);

    // 2b. Guarantee active billing subscription entry for carrier
    const subCheck = await pool.query(
      `SELECT id FROM billing_subscriptions WHERE user_id = $1`,
      [carrierUser.id]
    );
    if (subCheck.rows.length === 0) {
      await pool.query(
        `INSERT INTO billing_subscriptions (
          user_id, plan_key, amount_cents, interval, status, current_period_end, created_at, updated_at
        ) VALUES ($1, 'loadboard_ai_pass', 1900, 'month', 'active', NOW() + interval '365 days', NOW(), NOW())`,
        [carrierUser.id]
      );
      console.log('✅ Active subscription record added for carrier.');
    } else {
      await pool.query(
        `UPDATE billing_subscriptions 
         SET status = 'active', plan_key = 'loadboard_ai_pass', current_period_end = NOW() + interval '365 days', updated_at = NOW()
         WHERE user_id = $1`,
        [carrierUser.id]
      );
      console.log('✅ Active subscription record refreshed for carrier.');
    }

    // 2c. Add demo fleet items if none exist for this carrier so portal pages are rich
    const truckCheck = await pool.query(`SELECT id FROM trucks WHERE carrier_id = $1`, [carrierUser.id]);
    let truckId = null;
    if (truckCheck.rows.length === 0) {
      const trk = await pool.query(
        `INSERT INTO trucks (carrier_id, truck_number, vin, plate, mileage, status)
         VALUES ($1, 'TRK-101', '1FT8W3BT7KEC91823', 'TX-8910', 142500, 'active')
         RETURNING id`,
        [carrierUser.id]
      );
      truckId = trk.rows[0].id;
      console.log('✅ Demo truck TRK-101 seeded.');
    } else {
      truckId = truckCheck.rows[0].id;
    }

    const trailerCheck = await pool.query(`SELECT id FROM trailers WHERE carrier_id = $1`, [carrierUser.id]);
    let trailerId = null;
    if (trailerCheck.rows.length === 0) {
      const trl = await pool.query(
        `INSERT INTO trailers (carrier_id, trailer_number, type, status)
         VALUES ($1, 'TRL-5301', 'dry_van', 'active')
         RETURNING id`,
        [carrierUser.id]
      );
      trailerId = trl.rows[0].id;
      console.log('✅ Demo trailer TRL-5301 seeded.');
    } else {
      trailerId = trailerCheck.rows[0].id;
    }

    const driverCheck = await pool.query(`SELECT id FROM drivers WHERE carrier_id = $1`, [carrierUser.id]);
    let driverId = null;
    if (driverCheck.rows.length === 0) {
      const drv = await pool.query(
        `INSERT INTO drivers (carrier_id, name, phone, email, license_number, assigned_truck_id, assigned_trailer_id, status)
         VALUES ($1, 'Marcus Vance', '+1 (214) 555-0182', 'marcus.vance@apexcarriers.com', 'TX-DL-8492011', $2, $3, 'active')
         RETURNING id`,
        [carrierUser.id, truckId, trailerId]
      );
      driverId = drv.rows[0].id;
      console.log('✅ Demo driver Marcus Vance seeded.');
    } else {
      driverId = driverCheck.rows[0].id;
    }

    // 2d. Add 1 active demo load for carrier
    const carrierLoadCheck = await pool.query(`SELECT id FROM loads WHERE carrier_id = $1`, [carrierUser.id]);
    if (carrierLoadCheck.rows.length === 0) {
      const ld = await pool.query(
        `INSERT INTO loads (
          load_number, carrier_id, driver_id, truck_id, trailer_id,
          broker_name, broker_mc, broker_contact,
          pickup_company, pickup_location, pickup_state, pickup_date, pickup_time,
          delivery_company, delivery_location, delivery_state, delivery_date, delivery_time,
          commodity, weight, miles, rate, rpm, carrier_pay, equipment_type, status, dispatcher_notes
        ) VALUES (
          'SW-891024', $1, $2, $3, $4,
          'Summit Logistics Brokerage', 'MC-582104', '+1 (800) 580-3101',
          'Lone Star Distribution', 'Dallas, TX', 'TX', CURRENT_DATE, '08:00',
          'Peach State Logistics Hub', 'Atlanta, GA', 'GA', CURRENT_DATE + 2, '14:00',
          'Packaged Consumer Goods', 41500, 780, 2450.00, 3.14, 2450.00, 'Dry Van', 'in_transit',
          'Priority expedited delivery. In transit on I-20 East.'
        ) RETURNING id`,
        [carrierUser.id, driverId, truckId, trailerId]
      );
      console.log(`✅ Demo in-transit load SW-891024 seeded for carrier (Load ID: ${ld.rows[0].id}).`);
    }

    // 3. Upsert Broker Account
    const brokerEmail = 'broker@shippingwish.com';
    const brokerRes = await pool.query(
      `INSERT INTO users (
        name, email, password_hash, role, company_name, phone,
        mc_number, dot_number, address, weekly_plan, trial_ends_at,
        email_verified_at, is_suspended
      ) VALUES ($1, $2, $3, 'broker', $4, $5, $6, $7, $8, 'broker_unlimited', NOW() + interval '365 days', NOW(), false)
      ON CONFLICT (email) DO UPDATE SET
        name = EXCLUDED.name,
        password_hash = EXCLUDED.password_hash,
        role = 'broker',
        company_name = EXCLUDED.company_name,
        phone = EXCLUDED.phone,
        mc_number = EXCLUDED.mc_number,
        dot_number = EXCLUDED.dot_number,
        address = EXCLUDED.address,
        weekly_plan = 'broker_unlimited',
        trial_ends_at = NOW() + interval '365 days',
        email_verified_at = NOW(),
        is_suspended = false,
        deleted_at = NULL
      RETURNING id, name, email, role, weekly_plan`,
      [
        'Summit Freight Brokerage',
        brokerEmail,
        brokerHash,
        'Summit Logistics Brokerage LLC',
        '+1 (800) 580-3101',
        'MC-582104',
        '2984102',
        '500 Commerce Blvd, Suite 200, Chicago, IL 60601'
      ]
    );
    const brokerUser = brokerRes.rows[0];
    console.log(`✅ Broker user ready (ID: ${brokerUser.id}, Email: ${brokerUser.email})`);

    // 3b. Add sample posted load by this broker
    const brokerLoadCheck = await pool.query(
      `SELECT id FROM loads WHERE broker_mc = 'MC-582104' OR broker_name LIKE '%Summit%'`
    );
    if (brokerLoadCheck.rows.length === 0) {
      await pool.query(
        `INSERT INTO loads (
          load_number, status, rate, pickup_location, delivery_location,
          pickup_date, delivery_date, equipment_type, weight, commodity,
          notes, broker_name, broker_mc, broker_contact, miles, rpm, created_at, updated_at
        ) VALUES (
          'SW-582109', 'new', 2850.00, 'Chicago, IL', 'Philadelphia, PA',
          CURRENT_DATE + 1, CURRENT_DATE + 3, 'Reefer', 42000, 'Chilled Dairy & Beverages (36°F)',
          'Anti-Double Brokering Guard: VERIFIED. Instant Rate Confirmation available. Direct carrier dispatch.',
          'Summit Logistics Brokerage LLC', 'MC-582104', '+1 (800) 580-3101 | dispatch@summitfreight.com', 760, 3.75, NOW(), NOW()
        )`
      );
      console.log('✅ Demo posted load SW-582109 seeded for broker.');
    }

    console.log('\n======================================================');
    console.log('🎉 2 INTERNAL USERS READY FOR FULL AUDIT & TESTING:');
    console.log('======================================================');
    console.log('1. CARRIER ACCOUNT:');
    console.log(`   - Email:    ${carrierEmail}`);
    console.log(`   - Password: ${carrierPlainPassword}`);
    console.log(`   - Role:     carrier`);
    console.log(`   - Plan:     loadboard_ai_pass (1 Year Active Pass)`);
    console.log(`   - Company:  Apex Global Freight LLC (MC-1094821)`);
    console.log('\n2. BROKER ACCOUNT:');
    console.log(`   - Email:    ${brokerEmail}`);
    console.log(`   - Password: ${brokerPlainPassword}`);
    console.log(`   - Role:     broker`);
    console.log(`   - Plan:     broker_unlimited`);
    console.log(`   - Company:  Summit Logistics Brokerage LLC (MC-582104)`);
    console.log('======================================================\n');
  } catch (err) {
    console.error('❌ Error seeding test users:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seedTestUsers();
