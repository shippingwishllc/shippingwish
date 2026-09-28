const assert = require('assert');
const fs = require('fs');
const path = require('path');

const tracking = fs.readFileSync(path.join(__dirname, '../public/js/site-tracking.js'), 'utf8');
const settings = fs.readFileSync(path.join(__dirname, '../routes/settings.js'), 'utf8');
const home = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
const appHome = fs.readFileSync(path.join(__dirname, '../apps/shippingwish/index.html'), 'utf8');
const chrome = fs.readFileSync(path.join(__dirname, '../public/js/site-chrome.js'), 'utf8');
const admin = fs.readFileSync(path.join(__dirname, '../public/admin-dashboard.html'), 'utf8');
const superadmin = fs.readFileSync(path.join(__dirname, '../public/superadmin/index.html'), 'utf8');

function gtmId(value) {
  const id = String(value || '').trim().toUpperCase();
  return /^GTM-[A-Z0-9]+$/.test(id) ? id : '';
}
function pixelId(value) {
  const id = String(value || '').replace(/\s/g, '');
  return /^\d{6,20}$/.test(id) ? id : '';
}

assert.strictEqual(gtmId('GTM-55MF65H2'), 'GTM-55MF65H2');
assert.strictEqual(gtmId('gtm-55mf65h2'), 'GTM-55MF65H2');
assert.strictEqual(gtmId('javascript:alert(1)'), '');
assert.strictEqual(pixelId('123456789012345'), '123456789012345');
assert.strictEqual(pixelId('abc'), '');

assert.match(tracking, /GTM-55MF65H2/);
assert.match(tracking, /googletagmanager\.com\/gtm\.js/);
assert.match(tracking, /connect\.facebook\.net\/en_US\/fbevents\.js/);
assert.match(tracking, /loadsnexus/);
assert.match(tracking, /nyclimo/);
assert.match(tracking, /buywish/);
assert.match(home, /site-tracking\.js\?v=1/);
assert.match(appHome, /site-tracking\.js\?v=1/);
assert.match(chrome, /site-tracking\.js\?v=1/);
assert.match(settings, /gtm_container_id: 'GTM-55MF65H2'/);
assert.match(admin, /set-gtm-container-id/);
assert.match(admin, /set-facebook-pixel-id/);
assert.match(superadmin, /setGtmContainerId/);
assert.match(superadmin, /setFacebookPixelId/);

console.log('ok  GTM-55MF65H2 and Facebook Pixel wiring');
