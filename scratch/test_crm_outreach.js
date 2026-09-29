const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { normalizeEquipmentKeys } = require('../utils/fmcsa-equipment');

function test(name, fn) {
  fn();
  console.log('ok  ' + name);
}

const crm = fs.readFileSync(path.join(__dirname, '../routes/crm.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../public/crm-sales.html'), 'utf8');
const helper = fs.readFileSync(path.join(__dirname, '../utils/crm-outreach.js'), 'utf8');
const marketingCss = fs.readFileSync(path.join(__dirname, '../public/css/marketing.css'), 'utf8');

test('campaign uses census equipment keys, not state-only scrape', () => {
  assert.match(crm, /equipmentKeys = normalizeEquipmentKeys/);
  assert.match(crm, /searchCensusFiltered/);
  assert.match(crm, /exclusive: true/);
  assert.match(crm, /hasEmail: wantEmail/);
  assert.doesNotMatch(crm, /Math\.random\(\) \* 25/);
});

test('campaign email timeout is long enough for Resend', () => {
  assert.match(crm, /Email timeout.*8000/);
  assert.doesNotMatch(crm, /Email timeout.*2500/);
});

test('campaign SMS and Vapi stay consent-gated', () => {
  assert.match(crm, /send_sms = false/);
  assert.match(crm, /send_vapi = false/);
  assert.match(crm, /consent_confirmed/);
  assert.match(helper, /No SMS consent/);
  assert.match(helper, /AI call needs prior consent/);
});

test('bulk outreach endpoint is wired for select-then-send', () => {
  assert.match(crm, /\/leads\/bulk-outreach/);
  assert.match(helper, /channel === 'email'/);
  assert.match(helper, /channel === 'sms'/);
  assert.match(helper, /channel === 'vapi'/);
  assert.match(helper, /api\.vapi\.ai\/call\/phone/);
});

test('CRM page has census-style select, pager, and one-press Vapi', () => {
  assert.match(html, /PAGE_SIZE = 10/);
  assert.match(html, /data-act="vapi"/);
  assert.match(html, /data-bulk="email"/);
  assert.match(html, /data-bulk="sms"/);
  assert.match(html, /data-bulk="vapi"/);
  assert.match(html, /\/api\/crm\/leads\/bulk-outreach/);
  assert.match(html, /id="crm-eq-grid"/);
  assert.match(html, /key: 'reefer'/);
  assert.match(html, /They already agreed/);
  assert.match(html, /Compose &amp; send/);
  assert.match(html, /cd-hero/);
  assert.match(html, /Campaign started/);
  assert.doesNotMatch(html, /strong style="color:#fff;"/);
  assert.doesNotMatch(html, /marketing\.css/);
});

test('campaign UI sends equipment_types and vapi flag', () => {
  assert.match(html, /equipment_types: selectedEq/);
  assert.match(html, /send_vapi/);
  assert.doesNotMatch(html, /id="ai-bot-sms" checked/);
  assert.doesNotMatch(html, /id="ai-bot-vapi" checked/);
});

test('public marketing stylesheet is unchanged by this CRM desk', () => {
  assert.doesNotMatch(marketingCss, /crm-eq-grid/);
  assert.doesNotMatch(marketingCss, /data-bulk="vapi"/);
});

test('UI labels still normalize to census keys', () => {
  assert.deepStrictEqual(normalizeEquipmentKeys(['53ft Reefer', 'Dry Van']), ['reefer', 'dry_van']);
});

test('campaign schedules named follow-ups and AI replies inbound', () => {
  const desk = fs.readFileSync(path.join(__dirname, '../utils/crm-ai-desk.js'), 'utf8');
  const calling = fs.readFileSync(path.join(__dirname, '../routes/ai-calling.js'), 'utf8');
  const email = fs.readFileSync(path.join(__dirname, '../routes/email.js'), 'utf8');
  const voip = fs.readFileSync(path.join(__dirname, '../routes/voip.js'), 'utf8');
  assert.match(desk, /enqueueFollowups/);
  assert.match(desk, /Answer every question completely/);
  assert.match(desk, /Never quote a rate per mile/);
  assert.match(crm, /send_followup/);
  assert.match(calling, /assistant-request/);
  assert.match(email, /handleInboundEmail/);
  assert.match(voip, /desk\.replySms/);
  assert.match(html, /Follow-up emails day 3 and 7/);
  assert.doesNotMatch(desk, /\$3\.20\/mile/);
});

console.log('ok  crm outreach desk');
