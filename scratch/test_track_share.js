const assert = require('assert');
const fs = require('fs');
const path = require('path');

function test(name, fn) {
  fn();
  console.log('ok  ' + name);
}

test('tracking send/accept/view routes exist and do not mention scraping MacroPoint', () => {
  const route = fs.readFileSync(path.join(__dirname, '../routes/track-share.js'), 'utf8');
  const util = fs.readFileSync(path.join(__dirname, '../utils/track-share.js'), 'utf8');
  const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  assert.match(route, /\/send/);
  assert.match(route, /\/accept\//);
  assert.match(route, /\/view\//);
  assert.match(route, /STOP on file/);
  assert.match(util, /status = 'accepted'/);
  assert.match(server, /routes\/track-share/);
  assert.doesNotMatch(route, /macropoint\.com\/scrape/i);
});

test('driver Accept page and broker map do not invent Dallas GPS', () => {
  const accept = fs.readFileSync(path.join(__dirname, '../public/track-accept.html'), 'utf8');
  const view = fs.readFileSync(path.join(__dirname, '../public/track-share.html'), 'utf8');
  const desk = fs.readFileSync(path.join(__dirname, '../public/broker-desk.html'), 'utf8');
  assert.match(accept, /Accept tracking/);
  assert.match(accept, /\/api\/track-share\/ping\//);
  assert.doesNotMatch(accept, /32\.7767/);
  assert.match(view, /No GPS yet/);
  assert.match(desk, /Send tracking/);
  assert.match(desk, /\/api\/track-share\/send/);
  assert.match(desk, /visibility-desk/);
  assert.match(desk, /vp-fourkites/);
});

test('LoadsNexus broker nav and SW Track plan are honest about ELD', () => {
  const shell = fs.readFileSync(path.join(__dirname, '../public/js/app-shell.js'), 'utf8');
  const billing = fs.readFileSync(path.join(__dirname, '../routes/billing.js'), 'utf8');
  const eld = fs.readFileSync(path.join(__dirname, '../public/eld-desk.html'), 'utf8');
  const marketingCss = fs.readFileSync(path.join(__dirname, '../public/css/marketing.css'), 'utf8');
  assert.match(shell, /BROKER_LINKS/);
  assert.match(shell, /href: '\/broker-desk'/);
  assert.match(shell, /SIDEBAR_VERSION = '29'/);
  assert.match(billing, /sw_track/);
  assert.match(billing, /Not sold as registered ELD hardware/);
  assert.match(eld, /checkout\?plan=sw_track/);
  assert.doesNotMatch(eld, /FMCSA-certified Shipping Wish ELD hardware/);
  assert.doesNotMatch(marketingCss, /broker-desk/);
});

test('load detail and driver app wire send/accept tracking', () => {
  const detail = fs.readFileSync(path.join(__dirname, '../public/load-detail.html'), 'utf8');
  const drv = fs.readFileSync(path.join(__dirname, '../public/js/driver-app.js'), 'utf8');
  assert.match(detail, /\/api\/track-share\/send/);
  assert.match(drv, /\/api\/track-share\/mine/);
});

console.log('ok  track share');
