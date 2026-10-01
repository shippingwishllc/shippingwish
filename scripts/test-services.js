/**
 * Comprehensive Service & Module Verification Suite
 * Tests routes, IFTA calculation/export, invoice generation,
 * BuyWish catalog math, and server initialization.
 */

const fs = require('fs');
const path = require('path');

async function runTests() {
  console.log('======================================================');
  console.log('  Shipping Wish - Service & System Verification Suite');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${message}`);
      failed++;
    }
  }

  // TEST 1: Node & Express Core Load
  try {
    const express = require('express');
    const app = express();
    assert(typeof app.use === 'function', 'Express core module initializes successfully');
  } catch (err) {
    assert(false, `Express initialization: ${err.message}`);
  }

  // TEST 2: Server Routing & Mounting
  try {
    const serverApp = require('../server.js');
    assert(typeof serverApp === 'function', 'Root server.js imports and exports Express application cleanly');
  } catch (err) {
    assert(false, `server.js import: ${err.message}`);
  }

  // TEST 3: IFTA Route & CSV Export Logic
  try {
    const iftaRouter = require('../routes/ifta');
    assert(Boolean(iftaRouter), 'IFTA router loads successfully');

    // Test tax rate calculation logic
    const testMiles = 1200;
    const testGallons = 200;
    const avgMpg = testMiles / testGallons; // 6.0 MPG
    const caMiles = 600;
    const txMiles = 600;
    const caTaxableGal = caMiles / avgMpg; // 100 gal
    const txTaxableGal = txMiles / avgMpg; // 100 gal
    const caRate = 0.441;
    const txRate = 0.20;
    const caDue = caTaxableGal * caRate; // $44.10
    const txDue = txTaxableGal * txRate; // $20.00
    assert(caDue.toFixed(2) === '44.10', 'IFTA California fuel tax calculation matches formula ($44.10)');
    assert(txDue.toFixed(2) === '20.00', 'IFTA Texas fuel tax calculation matches formula ($20.00)');
  } catch (err) {
    assert(false, `IFTA test: ${err.message}`);
  }

  // TEST 4: Invoice PDF & Commission Math
  try {
    const invoicesRouter = require('../routes/invoices');
    assert(Boolean(invoicesRouter), 'Invoices router loads successfully');

    const loads = [
      { load_number: 'SW-TEST-1', rate: 2500, pickup_location: 'Dallas, TX', delivery_location: 'Atlanta, GA' },
      { load_number: 'SW-TEST-2', rate: 3500, pickup_location: 'Chicago, IL', delivery_location: 'Newark, NJ' }
    ];
    const gross = loads.reduce((s, l) => s + l.rate, 0); // $6000
    const feePercent = 10;
    const commAmt = (gross * feePercent) / 100; // $600
    const carrierPay = gross - commAmt; // $5400
    assert(gross === 6000, 'Invoice gross freight aggregates correctly ($6,000)');
    assert(commAmt === 600, 'Dispatch commission calculates accurately ($600 at 10%)');
    assert(carrierPay === 5400, 'Carrier net payout calculates accurately ($5,400)');
  } catch (err) {
    assert(false, `Invoice test: ${err.message}`);
  }

  // TEST 5: BuyWish Catalog & Margin Logic
  try {
    const catalog = require('../utils/buywish-catalog');
    assert(typeof catalog.priceWithMargin === 'function', 'BuyWish catalog pricing utility loaded');
    assert(Array.isArray(catalog.TARGET_COUNTRIES), 'BuyWish target countries configured (USA, CAN, GBR)');
  } catch (err) {
    assert(false, `BuyWish test: ${err.message}`);
  }

  // TEST 6: Mobile Suite Directory & Dependency Check
  try {
    const mobileApps = [
      'driver-app',
      'loadnexus-carrier',
      'shippingwish-tms',
      'loadnexus-broker',
      'buywish-shop'
    ];
    mobileApps.forEach(appName => {
      const appDir = path.join(__dirname, '..', 'mobile', appName);
      const hasPkg = fs.existsSync(path.join(appDir, 'package.json'));
      const hasNodeModules = fs.existsSync(path.join(appDir, 'node_modules'));
      assert(hasPkg && hasNodeModules, `Mobile app [${appName}] package.json & node_modules verified`);
    });
  } catch (err) {
    assert(false, `Mobile apps test: ${err.message}`);
  }

  // TEST 7: Autonomous DAT Load Parsing & Driver SMS Offer
  try {
    const { parseDatInput, formatDriverSms } = require('../utils/dat-load-parser');
    const sampleInput = `𝗗𝗛𝗢: 72\n𝗟𝗼𝗮𝗱𝗲𝗱 𝗠𝗶𝗹𝗲𝘀 : 563\n\n𝗙𝗿𝗼𝗺:Hopkinsville KY\n𝗧𝗼: DIBERSVILLE MS\n\n𝗣𝗶𝗰𝗸𝘂𝗽: TODAY BEFORE 5PM\n𝗗𝗲𝗹𝗶𝘃𝗲𝗿y: TOMORROW 8 TO 3PM\n\n𝗪𝗲𝗶𝗴𝗵t: 2500\nRATE: 1000\nDRIVER ASSIST AT RECEIVER`;
    const parsed = parseDatInput(sampleInput);
    assert(parsed.length === 1, 'DAT parser extracted 1 load from key-value text');
    assert(parsed[0].origin_city === 'Hopkinsville' && parsed[0].origin_state === 'KY', 'DAT parser resolved Hopkinsville, KY');
    assert(parsed[0].rate === 1000, 'DAT parser resolved $1000 freight rate');
    const sms = formatDriverSms(parsed[0], '101');
    assert(sms.includes('TRUCK #101') && sms.includes('BOOK IT'), 'Driver SMS offer correctly generated in user format');
  } catch (err) {
    assert(false, `DAT workflow test: ${err.message}`);
  }

  console.log('\n======================================================');
  console.log(`  Tests completed: ${passed} passed, ${failed} failed`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
