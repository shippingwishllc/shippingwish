/**
 * scripts/test-subscription-guard-and-sync.js
 * Verification of Subscription Tier Enforcements & AI Carrier Sync
 */

const {
  TIER_TRUCK_LIMITS,
  extractZipCode,
  enforceTruckSubscriptionLimit,
  syncCarrierToAiDispatch,
  syncTruckLocationToAiDispatch
} = require('../utils/carrier-sync');
const pool = require('../db');

async function runTests() {
  console.log('======================================================');
  console.log('  Testing Subscription Tier Guards & AI Carrier Sync  ');
  console.log('======================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${message}`);
      process.exitCode = 1;
    }
  }

  // 1. Test extractZipCode helper
  assert(extractZipCode('Hopkinsville, KY 42240') === '42240', 'Extract 5-digit ZIP from city/state string');
  assert(extractZipCode('42240') === '42240', 'Extract clean 5-digit ZIP directly');
  assert(extractZipCode('Chicago IL') === 'Chicago IL', 'Fall back to short city/state text when no numeric ZIP');
  assert(extractZipCode('') === null, 'Empty string returns null');

  // 2. Test Tier definitions
  assert(TIER_TRUCK_LIMITS.solo_weekly.maxTrucks === 1, 'Solo weekly ($149) permits exactly 1 truck');
  assert(TIER_TRUCK_LIMITS.fleet_weekly.maxTrucks === 5, 'Fleet weekly ($350) permits up to 5 trucks');
  assert(TIER_TRUCK_LIMITS.command_weekly.maxTrucks === 999, 'Fleet Command ($500) permits unlimited trucks');

  // 3. Test Staff override logic
  const staffCheck = await enforceTruckSubscriptionLimit(999999, 'super_admin');
  assert(staffCheck.allowed === true && staffCheck.maxAllowed === 999, 'SuperAdmin and staff have unlimited truck privileges');

  const dispatcherCheck = await enforceTruckSubscriptionLimit(999999, 'dispatcher');
  assert(dispatcherCheck.allowed === true && dispatcherCheck.maxAllowed === 999, 'Dispatcher has staff override privileges');

  // 4. Test logic with mocked database calls to test every subscription scenario
  const origQuery = pool.query;

  // Scenario A: Solo carrier with 0 trucks
  pool.query = async (text, params) => {
    if (text.includes('SELECT COUNT(*)::int')) {
      return { rows: [{ count: 0 }] };
    }
    if (text.includes('SELECT u.id, u.role')) {
      return { rows: [{ id: 101, role: 'carrier', weekly_plan: 'solo_weekly', plan_key: 'solo_weekly', sub_status: 'active' }] };
    }
    return { rows: [] };
  };
  const soloZeroCheck = await enforceTruckSubscriptionLimit(101, 'carrier');
  assert(soloZeroCheck.allowed === true && soloZeroCheck.maxAllowed === 1, 'Solo plan with 0 trucks can add truck');

  // Scenario B: Solo carrier with 1 truck tries to add second
  pool.query = async (text, params) => {
    if (text.includes('SELECT COUNT(*)::int')) {
      return { rows: [{ count: 1 }] };
    }
    if (text.includes('SELECT u.id, u.role')) {
      return { rows: [{ id: 101, role: 'carrier', weekly_plan: 'solo_weekly', plan_key: 'solo_weekly', sub_status: 'active' }] };
    }
    return { rows: [] };
  };
  const soloMaxCheck = await enforceTruckSubscriptionLimit(101, 'carrier');
  assert(soloMaxCheck.allowed === false, 'Solo plan ($149/wk) with 1 truck is BLOCKED from adding 2nd truck');
  assert(soloMaxCheck.upgradeUrl === '/checkout?plan=fleet_weekly', 'Solo plan guides to Small Fleet ($350/wk)');

  // Scenario C: Small Fleet carrier with 4 trucks
  pool.query = async (text, params) => {
    if (text.includes('SELECT COUNT(*)::int')) {
      return { rows: [{ count: 4 }] };
    }
    if (text.includes('SELECT u.id, u.role')) {
      return { rows: [{ id: 202, role: 'carrier', weekly_plan: 'fleet_weekly', plan_key: 'fleet_weekly', sub_status: 'active' }] };
    }
    return { rows: [] };
  };
  const fleetCheck4 = await enforceTruckSubscriptionLimit(202, 'carrier');
  assert(fleetCheck4.allowed === true && fleetCheck4.maxAllowed === 5, 'Fleet plan with 4 trucks can add 5th truck');

  // Scenario D: Small Fleet carrier with 5 trucks tries to add 6th
  pool.query = async (text, params) => {
    if (text.includes('SELECT COUNT(*)::int')) {
      return { rows: [{ count: 5 }] };
    }
    if (text.includes('SELECT u.id, u.role')) {
      return { rows: [{ id: 202, role: 'carrier', weekly_plan: 'fleet_weekly', plan_key: 'fleet_weekly', sub_status: 'active' }] };
    }
    return { rows: [] };
  };
  const fleetMaxCheck = await enforceTruckSubscriptionLimit(202, 'carrier');
  assert(fleetMaxCheck.allowed === false, 'Fleet plan ($350/wk) with 5 trucks is BLOCKED from adding 6th truck');
  assert(fleetMaxCheck.upgradeUrl === '/checkout?plan=command_weekly', 'Fleet plan guides to Fleet Command ($500/wk)');

  // Scenario E: Fleet Command carrier with 15 trucks
  pool.query = async (text, params) => {
    if (text.includes('SELECT COUNT(*)::int')) {
      return { rows: [{ count: 15 }] };
    }
    if (text.includes('SELECT u.id, u.role')) {
      return { rows: [{ id: 303, role: 'carrier', weekly_plan: 'command_weekly', plan_key: 'command_weekly', sub_status: 'active' }] };
    }
    return { rows: [] };
  };
  const commandCheck = await enforceTruckSubscriptionLimit(303, 'carrier');
  assert(commandCheck.allowed === true && commandCheck.maxAllowed === 999, 'Fleet Command ($500/wk) allows unlimited trucks');

  // Scenario F: Unpaid / Past Due carrier
  pool.query = async (text, params) => {
    if (text.includes('SELECT COUNT(*)::int')) {
      return { rows: [{ count: 0 }] };
    }
    if (text.includes('SELECT u.id, u.role')) {
      return { rows: [{ id: 404, role: 'carrier', weekly_plan: 'past_due', sub_status: 'past_due' }] };
    }
    return { rows: [] };
  };
  const pastDueCheck = await enforceTruckSubscriptionLimit(404, 'carrier');
  assert(pastDueCheck.allowed === false && pastDueCheck.reason.includes('past due'), 'Past due subscription blocks truck addition');

  // Scenario G: Canceled subscription
  pool.query = async (text, params) => {
    if (text.includes('SELECT COUNT(*)::int')) {
      return { rows: [{ count: 0 }] };
    }
    if (text.includes('SELECT u.id, u.role')) {
      return { rows: [{ id: 505, role: 'carrier', weekly_plan: 'canceled', sub_status: 'canceled' }] };
    }
    return { rows: [] };
  };
  const canceledCheck = await enforceTruckSubscriptionLimit(505, 'carrier');
  assert(canceledCheck.allowed === false && canceledCheck.reason.includes('canceled'), 'Canceled subscription blocks truck addition');

  // Scenario H: Sync Carrier to AI Dispatch (Insert & Update paths)
  let insertCalled = false;
  pool.query = async (text, params) => {
    if (text.includes('SELECT id FROM ai_dispatch_carriers')) {
      return { rows: [] }; // Carrier not yet present
    }
    if (text.includes('INSERT INTO ai_dispatch_carriers')) {
      insertCalled = true;
      return {
        rows: [{
          id: 777,
          company_name: params[0],
          contact_name: params[1],
          phone: params[2],
          email: params[3],
          equipment: params[4],
          empty_zip: params[5],
          status: 'active'
        }]
      };
    }
    return { rows: [] };
  };

  const newCarrier = await syncCarrierToAiDispatch({
    company_name: 'Fast Lane Hauling',
    contact_name: 'Mike Smith',
    phone: '+18005551234',
    email: 'mike@fastlane.com',
    equipment: "53' Dry Van",
    empty_zip: 'Hopkinsville KY 42240',
    status: 'active'
  });
  assert(insertCalled === true, 'Carrier sync correctly triggers database INSERT when new');
  assert(newCarrier && newCarrier.empty_zip === '42240', 'Carrier sync parsed clean 5-digit ZIP into empty_zip');

  // Scenario I: Route Planning location sync updates AI Dispatch Brain
  let updateCalled = false;
  pool.query = async (text, params) => {
    if (text.includes('SELECT id, name, company_name')) {
      return {
        rows: [{
          id: 888,
          name: 'Dave Miller',
          company_name: 'Miller Express',
          phone: '+17735559090',
          email: 'dave@millerexpress.com',
          mc_number: '987654',
          dot_number: '123456'
        }]
      };
    }
    if (text.includes('SELECT id FROM ai_dispatch_carriers')) {
      return { rows: [{ id: 999 }] }; // Carrier already exists
    }
    if (text.includes('UPDATE ai_dispatch_carriers')) {
      updateCalled = true;
      return {
        rows: [{
          id: 999,
          empty_zip: params[4],
          prefer_destination: params[5]
        }]
      };
    }
    return { rows: [] };
  };

  await syncTruckLocationToAiDispatch(888, {
    empty_zip: 'Dallas TX 75201',
    prefer_destination: 'Southeast (GA/FL)',
    equipment: "53' Reefer"
  });
  assert(updateCalled === true, 'Route Planning scheduling calls location sync and triggers UPDATE on ai_dispatch_carriers');

  // Restore pool.query
  pool.query = origQuery;

  console.log('\n======================================================');
  console.log(`  Tests Completed: ${passed}/${total} Passed (${Math.round((passed/total)*100)}%)`);
  console.log('======================================================\n');
}

runTests().then(() => {
  process.exit(0);
}).catch(e => {
  console.error(e);
  process.exit(1);
});
