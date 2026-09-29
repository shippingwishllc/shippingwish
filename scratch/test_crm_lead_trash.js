const assert = require('assert');
const fs = require('fs');
const path = require('path');

function test(name, fn) {
  fn();
  console.log('ok  ' + name);
}

const crm = fs.readFileSync(path.join(__dirname, '../routes/crm.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../public/crm-sales.html'), 'utf8');
const trashHtml = fs.readFileSync(path.join(__dirname, '../public/trash.html'), 'utf8');
const trashRoute = fs.readFileSync(path.join(__dirname, '../routes/trash.js'), 'utf8');
const trashUtil = fs.readFileSync(path.join(__dirname, '../utils/trash.js'), 'utf8');
const v5 = fs.readFileSync(path.join(__dirname, '../sql/migrations/v5_soft_delete.sql'), 'utf8');
const marketingCss = fs.readFileSync(path.join(__dirname, '../public/css/marketing.css'), 'utf8');

test('CRM lead rows do not render pre-checked', () => {
  assert.doesNotMatch(html, /value="\$\{l\.id\}" checked/);
  assert.match(html, /<input type="checkbox" value="\$\{l\.id\}">/);
  assert.match(html, /id="btn-clear-checks"/);
});

test('row Delete moves the lead to Trash, not every checked box', () => {
  assert.match(html, /Move this lead to Trash/);
  assert.match(html, /Checked boxes are for Email\/SMS\/Vapi/);
  assert.match(crm, /SET deleted_at = now\(\), deleted_by/);
  assert.doesNotMatch(crm, /pool\.query\('DELETE FROM crm_leads WHERE id = \$1'\)/);
  assert.match(crm, /WHERE l\.deleted_at IS NULL/);
});

test('Trash lists CRM leads as their own tab', () => {
  assert.match(trashHtml, /data-type="leads"/);
  assert.match(trashHtml, /CRM leads/);
  assert.match(trashHtml, /kpi-trash-leads/);
  assert.match(trashRoute, /type === 'leads'/);
  assert.match(trashRoute, /type: 'lead'/);
  assert.match(trashRoute, /lead: 'crm_leads'/);
  assert.match(trashUtil, /type === 'lead'/);
  assert.match(trashUtil, /DELETE FROM crm_leads WHERE deleted_at IS NOT NULL/);
  assert.match(v5, /ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS deleted_at/);
});

test('public marketing stylesheet is unchanged', () => {
  assert.doesNotMatch(marketingCss, /btn-clear-checks/);
  assert.doesNotMatch(marketingCss, /kpi-trash-leads/);
});

console.log('ok  crm lead trash');
