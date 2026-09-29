const assert = require('assert');
const fs = require('fs');
const path = require('path');

function test(name, fn) {
  fn();
  console.log('ok  ' + name);
}

const html = fs.readFileSync(path.join(__dirname, '../public/staff-management.html'), 'utf8');
const auth = fs.readFileSync(path.join(__dirname, '../routes/auth.js'), 'utf8');
const marketingCss = fs.readFileSync(path.join(__dirname, '../public/css/marketing.css'), 'utf8');
const script = html.match(/<script>\n([\s\S]*?)\n<\/script>/)[1];

test('staff desk script parses (no duplicate let IS_ADMIN)', () => {
  assert.strictEqual((html.match(/let IS_ADMIN/g) || []).length, 1);
  new Function(script);
});

test('staff desk has add, tabs, edit, password, trash — no mock users', () => {
  assert.match(html, /openAddUserModal/);
  assert.match(html, /filterByRole\('dispatcher'/);
  assert.match(html, /data-act="edit"/);
  assert.match(html, /data-act="password"/);
  assert.match(html, /data-act="delete"/);
  assert.match(html, /id="edit-user-modal"/);
  assert.match(html, /id="password-user-modal"/);
  assert.doesNotMatch(html, /renderMockUsers/);
});

test('staff APIs edit, password, toggle-suspend, and trash', () => {
  assert.match(auth, /router\.patch\('\/users\/:id'/);
  assert.match(auth, /router\.post\('\/users\/:id\/password'/);
  assert.match(auth, /router\.patch\('\/users\/:id\/toggle-suspend'/);
  assert.match(auth, /UPDATE users SET deleted_at = now\(\)/);
  assert.doesNotMatch(auth, /password_hash.*RETURNING/);
});

test('public marketing stylesheet is unchanged', () => {
  assert.doesNotMatch(marketingCss, /staff-management/);
  assert.doesNotMatch(marketingCss, /password-user-modal/);
});

console.log('ok  staff desk');
