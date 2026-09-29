const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  isBrokerRow,
  isAlsoCarrier,
  buildBrokerCensusWhere,
  censusToBroker,
  pickUnseenBrokers
} = require('../utils/fmcsa-brokers');
const { buildTemplate, SMS_TEMPLATES } = require('../utils/email-templates');

function test(name, fn) {
  fn();
  console.log('ok  ' + name);
}

test('classdef BROKER and carship B are brokers; C-only is not', () => {
  assert.strictEqual(isBrokerRow({ classdef: 'AUTHORIZED FOR HIRE;OTHER-BROKER', carship: 'C;B' }), true);
  assert.strictEqual(isBrokerRow({ classdef: 'OTHER-BROKER OF PROPERTY', carship: 'B' }), true);
  assert.strictEqual(isBrokerRow({ classdef: 'AUTHORIZED FOR HIRE', carship: 'C' }), false);
  assert.strictEqual(isAlsoCarrier({ carship: 'C;B' }), true);
  assert.strictEqual(isAlsoCarrier({ carship: 'B' }), false);
});

test('broker census where is BROKER or carship B, not cargo equipment', () => {
  const where = buildBrokerCensusWhere({ state: 'TX', hasEmail: true });
  assert.match(where, /status_code = 'A'/);
  assert.match(where, /classdef.*BROKER/);
  assert.match(where, /carship.*B/);
  assert.match(where, /phy_state = 'TX'/);
  assert.match(where, /email_address IS NOT NULL/);
  assert.doesNotMatch(where, /crgo_genfreight/);
  assert.doesNotMatch(where, /crgo_coldfood/);
  const only = buildBrokerCensusWhere({ brokerOnly: true });
  assert.match(only, /not like '%C%'/);
});

test('censusToBroker maps FMCSA fields and drops non-brokers', () => {
  const row = {
    legal_name: 'ACME BROKERAGE LLC',
    company_officer_1: 'Jane Doe',
    docket1: '123456',
    docket1prefix: 'MC',
    dot_number: '999001',
    phone: '2145550100',
    email_address: 'jane@example.com',
    phy_city: 'Dallas',
    phy_state: 'TX',
    classdef: 'OTHER-BROKER',
    carship: 'B',
    status_code: 'A'
  };
  const b = censusToBroker(row);
  assert.strictEqual(b.company_name, 'ACME BROKERAGE LLC');
  assert.strictEqual(b.dot_number, '999001');
  assert.strictEqual(b.email, 'jane@example.com');
  assert.strictEqual(b.phone, '+12145550100');
  assert.strictEqual(b.also_carrier, false);
  assert.strictEqual(b.source, 'FMCSA Census broker');
  assert.strictEqual(censusToBroker({ legal_name: 'HAUL CO', classdef: 'AUTHORIZED FOR HIRE', carship: 'C' }), null);
});

test('Next page skips already-listed DOT numbers and carrier-only rows', () => {
  const rows = [
    { legal_name: 'OLD BROKER', classdef: 'OTHER-BROKER', carship: 'B', dot_number: '111' },
    { legal_name: 'CARRIER ONLY', classdef: 'AUTHORIZED FOR HIRE', carship: 'C', dot_number: '222' },
    { legal_name: 'NEW BROKER', classdef: 'OTHER-BROKER', carship: 'B', dot_number: '333' },
    { legal_name: 'NEW BROKER 2', classdef: 'OTHER-BROKER', carship: 'C;B', dot_number: '444' }
  ];
  const exclude = new Set(['111']);
  const page = pickUnseenBrokers(rows, exclude, 10);
  assert.deepStrictEqual(page.map((b) => b.dot_number), ['333', '444']);
  assert.ok(exclude.has('333'));
  assert.ok(exclude.has('111'));
  assert.ok(!page.some((b) => b.dot_number === '111'));
  assert.ok(!page.some((b) => b.dot_number === '222'));
});

test('broker email and SMS copy is capacity, not carrier ops-manager', () => {
  const tpl = buildTemplate('broker_capacity', {
    ownerName: 'Jane',
    companyName: 'ACME BROKERAGE LLC',
    recipientEmail: 'jane@example.com'
  });
  assert.match(tpl.subject, /ACME BROKERAGE LLC/);
  assert.match(tpl.text, /motor carrier/);
  assert.match(tpl.text, /do not take a cut of your broker margin/i);
  assert.doesNotMatch(tpl.text, /you keep 100%/i);
  assert.doesNotMatch(tpl.text, /Dedicated Fleet Operations Manager/);
  assert.match(SMS_TEMPLATES.broker_capacity({ companyName: 'ACME' }), /loads you post/);
  assert.doesNotMatch(SMS_TEMPLATES.broker_capacity({ companyName: 'ACME' }), /you keep 100%/);
});

test('broker marketing desk, nav, and outreach are wired', () => {
  const page = fs.readFileSync(path.join(__dirname, '../public/broker-marketing.html'), 'utf8');
  const shell = fs.readFileSync(path.join(__dirname, '../public/js/app-shell.js'), 'utf8');
  const boot = fs.readFileSync(path.join(__dirname, '../public/js/app-shell-boot.js'), 'utf8');
  const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  const route = fs.readFileSync(path.join(__dirname, '../routes/broker-marketing.js'), 'utf8');
  const util = fs.readFileSync(path.join(__dirname, '../utils/broker-marketing.js'), 'utf8');
  const fmcsa = fs.readFileSync(path.join(__dirname, '../utils/fmcsa.js'), 'utf8');
  const desk = fs.readFileSync(path.join(__dirname, '../utils/crm-ai-desk.js'), 'utf8');
  const marketingCss = fs.readFileSync(path.join(__dirname, '../public/css/marketing.css'), 'utf8');

  assert.match(page, /Select brokers, then email, SMS, or Vapi/);
  assert.match(page, /\/api\/broker-marketing\/next/);
  assert.match(page, /\/api\/broker-marketing\/outreach/);
  assert.match(page, /data-bulk="email"/);
  assert.match(page, /data-bulk="sms"/);
  assert.match(page, /data-bulk="vapi"/);
  assert.match(page, /They already agreed/);
  assert.match(page, /PAGE_SIZE = 10/);
  assert.match(page, /Next \(new companies\)/);
  assert.match(page, /Reset shown \(keep contacted\)/);
  assert.doesNotMatch(page, /marketing\.css/);
  assert.doesNotMatch(page, /#e11d48|#ef4444|XTERA/);
  assert.match(shell, /href: '\/broker-marketing'/);
  assert.match(shell, /SIDEBAR_VERSION = '30'/);
  assert.match(boot, /BOOT_VER = '30'/);
  assert.match(boot, /\/broker-marketing/);
  assert.match(server, /routes\/broker-marketing/);
  assert.match(route, /requireRole\('admin', 'super_admin', 'dispatcher', 'sales_rep'\)/);
  assert.match(util, /skipped_already_listed/);
  assert.match(util, /broker_capacity/);
  assert.match(util, /No SMS consent/);
  assert.match(util, /AI call needs prior consent/);
  assert.match(util, /api\.vapi\.ai\/call\/phone/);
  assert.match(fmcsa, /censusQuery/);
  assert.match(desk, /brokerVapiAssistant/);
  assert.match(desk, /We are a motor carrier/);
  assert.match(desk, /Do not say we are FMCSA-certified ELD hardware/);
  assert.doesNotMatch(marketingCss, /broker-marketing/);
  assert.doesNotMatch(marketingCss, /data-bulk="vapi"/);
});

console.log('ok  broker marketing desk');
