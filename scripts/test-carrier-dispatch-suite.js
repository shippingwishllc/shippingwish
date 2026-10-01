/**
 * scripts/test-carrier-dispatch-suite.js
 * Verification test suite for:
 * 1. Carrier Packet Engine (W-9, COI, MC Authority, Factoring NOA)
 * 2. Broker Tracking Engine & GPS Breadcrumbs
 * 3. POD Delivery Scanner & Factoring Invoicing
 * 4. AI Voice & Outreach Marketing Training Prompts
 */

const assert = require('assert');
const { getCarrierProfile, buildBrokerPacketEmail } = require('../utils/carrier-packet');
const { scanPodDocument, generateCarrierInvoice, buildFactoringSubmissionEmail } = require('../utils/pod-scanner');
const { generateTrackingToken } = require('../routes/broker-tracking');
const { OUTREACH_FACTS, buildCarrierSmsPitch } = require('../utils/outreach-templates');

async function runTests() {
  console.log('--- STARTING CARRIER DISPATCH & MARKETING TEST SUITE ---');

  // Test 1: Carrier Packet Generation
  console.log('\n[1/4] Testing Carrier Packet Generation...');
  const profile = await getCarrierProfile();
  assert(profile.mc_number === '1489201', 'Default MC number should match');
  assert(profile.documents.w9_url.includes('W9'), 'W-9 document URL should be present');
  assert(profile.insurance.auto_liability_limit.includes('$1,000,000'), 'Auto liability must be $1,000,000');

  const packetEmail = buildBrokerPacketEmail(profile, {
    brokerName: 'TQL Logistics',
    loadId: 'DAT-9921',
    origin: 'Hopkinsville, KY',
    destination: 'Diberville, MS',
    agreedRate: 1000
  });

  assert(packetEmail.subject.includes('CARRIER PACKET & SETUP'), 'Packet email subject must contain setup header');
  assert(packetEmail.text.includes('1489201'), 'Text email must include MC number');
  assert(packetEmail.html.includes('$1,000'), 'HTML email must include agreed rate');
  console.log('✓ Carrier Packet test passed! (Generated email subject:', packetEmail.subject + ')');

  // Test 2: Live Tracking Token Generation
  console.log('\n[2/4] Testing Live Tracking Token...');
  const token = generateTrackingToken();
  assert(typeof token === 'string' && token.length === 32, 'Tracking token must be 32-char hex string');
  console.log('✓ Tracking token test passed! (Generated token:', token + ')');

  // Test 3: Signed POD Scanner & Factoring Invoice
  console.log('\n[3/4] Testing POD Scanner & Factoring Submission...');
  const sampleCleanPod = `
    BILL OF LADING & DELIVERY RECEIPT
    Shipper: Hopkinsville Grain & Milling, KY
    Consignee: Gulf Wholesale Docks, Diberville MS
    Order Reference: DAT-9921
    Pieces: 24 Pallets (2500 lbs)
    RECEIVED IN GOOD CONDITION - CLEAN DELIVERY
    Consignee Signature: John D. Miller (Dock Supervisor)
    Date: 2026-10-02
    Seal Intact: YES (#884920)
  `;

  const podResult = scanPodDocument(sampleCleanPod);
  assert(podResult.valid === true, 'Clean POD with signature must be valid');
  assert(podResult.clean_bill === true, 'No damage must be noted');
  assert(podResult.signature_detected === true, 'Signature must be detected');

  const invoice = generateCarrierInvoice(profile, {
    id: 9921,
    rate: 1000,
    pickup_location: 'Hopkinsville KY',
    delivery_location: 'Diberville MS'
  });

  assert(invoice.total_due === 1000, 'Total due should be $1000');
  assert(invoice.carrier.mc === '1489201', 'Invoice carrier MC must match');

  const factoringEmail = buildFactoringSubmissionEmail(invoice, podResult);
  assert(factoringEmail.subject.includes('FACTORING SCHEDULE'), 'Factoring subject must be properly formatted');
  assert(factoringEmail.text.includes('$1,000'), 'Factoring schedule must reflect $1,000');
  console.log('✓ POD Scanner & Factoring test passed! (Invoice:', invoice.invoice_number + ')');

  // Test 4: Outreach Marketing Facts & SMS Pitch
  console.log('\n[4/4] Testing AI Marketing & Sales Outreach Pitch...');
  assert(OUTREACH_FACTS.includes('Autonomous 24/7 AI Dispatch Manager'), 'OUTREACH_FACTS must include Autonomous AI Dispatch Manager');
  assert(OUTREACH_FACTS.includes('0% Commission'), 'OUTREACH_FACTS must include 0% Commission');
  assert(OUTREACH_FACTS.includes('1-Click DAT Matcher'), 'OUTREACH_FACTS must include 1-Click DAT Matcher');

  const smsPitch = buildCarrierSmsPitch({ company_name: 'Apex Hauling LLC' });
  assert(smsPitch.includes('Apex Hauling'), 'SMS pitch must personalize company name');
  assert(smsPitch.includes('flat $149/wk'), 'SMS pitch must include $149 flat pricing');
  assert(smsPitch.includes('0% cut'), 'SMS pitch must emphasize 0% cut');
  console.log('✓ AI Marketing & Sales Outreach test passed! (Sample SMS Pitch:', smsPitch.slice(0, 75) + '...)');

  console.log('\n======================================================');
  console.log('🎉 ALL 4 CORE MODULE TESTS PASSED WITH 100% SUCCESS!');
  console.log('======================================================\n');
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
