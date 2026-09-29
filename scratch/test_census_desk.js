const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  normalizeEquipmentKeys,
  equipmentWhere,
  buildCensusWhere,
  primaryEquipmentLabel,
  cargoLabelsFromRow
} = require('../utils/fmcsa-equipment');
const { cargoFromCensus, equipmentFromCensus } = require('../utils/fmcsa');

function test(name, fn) {
  fn();
  console.log('ok  ' + name);
}

test('dry van and reefer map to different census cargo flags', () => {
  const van = equipmentWhere(['dry_van']);
  const reefer = equipmentWhere(['reefer']);
  assert.match(van, /crgo_genfreight/);
  assert.doesNotMatch(van, /crgo_coldfood/);
  assert.match(reefer, /crgo_coldfood/);
  assert.match(reefer, /crgo_meat/);
  assert.doesNotMatch(reefer, /crgo_genfreight/);
});

test('UI labels like 53ft Reefer normalize to reefer', () => {
  assert.deepStrictEqual(normalizeEquipmentKeys(['53ft Reefer', 'Dry Van']), ['reefer', 'dry_van']);
});

test('exclusive dry van where-clause drops refrigerated cargo', () => {
  const where = buildCensusWhere({ equipment: ['dry_van'], exclusive: true });
  assert.match(where, /crgo_genfreight/);
  assert.match(where, /crgo_coldfood IS NULL OR crgo_coldfood != 'X'/);
});

test('census where for TX reefer 1-10 uses cargo + state + units', () => {
  const where = buildCensusWhere({
    state: 'TX',
    equipment: ['reefer'],
    minUnits: 1,
    maxUnits: 10,
    hasEmail: true
  });
  assert.match(where, /phy_state = 'TX'/);
  assert.match(where, /crgo_coldfood = 'X'/);
  assert.match(where, /power_units::number >= 1/);
  assert.match(where, /power_units::number <= 10/);
  assert.match(where, /email_address IS NOT NULL/);
  assert.match(where, /status_code = 'A'/);
  assert.doesNotMatch(where, /crgo_genfreight/);
});

test('row with only cold food is Reefer, not Dry Van', () => {
  const row = { crgo_coldfood: 'X', crgo_meat: 'X' };
  assert.strictEqual(primaryEquipmentLabel(row), 'Reefer');
  assert.strictEqual(equipmentFromCensus(row), 'Reefer');
  assert.ok(!String(cargoFromCensus(row)).includes('53ft Dry Van'));
  assert.deepStrictEqual(cargoLabelsFromRow(row), ['Refrigerated Food', 'Meat']);
});

test('mixed freight+reefer labels Reefer first', () => {
  const row = { crgo_genfreight: 'X', crgo_coldfood: 'X' };
  assert.strictEqual(primaryEquipmentLabel(row), 'Reefer');
  assert.match(equipmentFromCensus(row), /Reefer/);
  assert.match(equipmentFromCensus(row), /Dry Van/);
});

test('row with no cargo flags is blank, not a fake dry van', () => {
  assert.strictEqual(primaryEquipmentLabel({ legal_name: 'TEST HAUL' }), '');
  assert.strictEqual(cargoFromCensus({}), '');
});

test('census desk page and staff nav are wired', () => {
  const page = fs.readFileSync(path.join(__dirname, '../public/census-desk.html'), 'utf8');
  const shell = fs.readFileSync(path.join(__dirname, '../public/js/app-shell.js'), 'utf8');
  const boot = fs.readFileSync(path.join(__dirname, '../public/js/app-shell-boot.js'), 'utf8');
  const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  const route = fs.readFileSync(path.join(__dirname, '../routes/census-desk.js'), 'utf8');
  assert.match(page, /key: 'reefer'/);
  assert.match(page, /key: 'dry_van'/);
  assert.match(page, /data-eq="\$\{eq\.key\}"/);
  assert.match(page, /\/api\/census-desk\/search/);
  assert.match(page, /cd-hero/);
  assert.match(page, /id="cd-chart"/);
  assert.match(page, /id="kpi-dirs"/);
  assert.match(page, /Find active carriers by equipment/);
  assert.doesNotMatch(page, /#e11d48|#ef4444|XTERA/);
  assert.match(page, /Next page/);
  assert.match(page, /data-act="email"/);
  assert.match(page, /data-act="packet"/);
  assert.match(page, /PAGE_SIZE = 10/);
  assert.match(route, /directories\/:id\/members\/:memberId/);
  assert.match(route, /directories\/:id\/contract/);
  assert.match(shell, /href: '\/census-desk'/);
  assert.match(shell, /SIDEBAR_VERSION = '29'/);
  assert.match(boot, /BOOT_VER = '29'/);
  assert.match(server, /routes\/census-desk/);
  assert.match(route, /sms_consent = TRUE/);
  assert.doesNotMatch(route, /facebook/i);
});

test('CRM bot no longer defaults to cold SMS or invented RPM', () => {
  const crm = fs.readFileSync(path.join(__dirname, '../routes/crm.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '../public/crm-sales.html'), 'utf8');
  assert.match(crm, /send_sms = false/);
  assert.doesNotMatch(crm, /\$3\.20\/mile/);
  assert.doesNotMatch(html, /id="ai-bot-sms" checked/);
});

console.log('ok  census desk equipment filters');
