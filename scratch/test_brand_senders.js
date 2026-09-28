const assert = require('assert');
const {
  SHIPPINGWISH,
  LOADSNEXUS,
  NYCLIMOWISH,
  BUYWISHONLINE,
  getBrandSender,
  replyAddress,
  addressOf,
  brandFromAddress,
  inboxFromOptions,
  resolveKnownFrom,
  isKnownMailbox,
  BRAND_DOMAINS
} = require('../utils/brand-senders');

function domainOf(from) {
  return addressOf(from).split('@')[1];
}

assert.strictEqual(replyAddress('shippingwish', 'dispatch'), 'dispatch@shippingwish.com');
assert.strictEqual(replyAddress('shippingwish', 'operations'), 'operations@shippingwish.com');
assert.strictEqual(replyAddress('shippingwish', 'billing'), 'billing@shippingwish.com');
assert.strictEqual(replyAddress('shippingwish', 'support'), 'support@shippingwish.com');
assert.strictEqual(replyAddress('shippingwish', 'noreply'), 'noreply@shippingwish.com');
assert.strictEqual(replyAddress('shippingwish', 'info'), 'info@shippingwish.com');

assert.strictEqual(replyAddress('loadsnexus', 'alerts'), 'alerts@loadsnexus.com');
assert.strictEqual(replyAddress('loadsnexus', 'billing'), 'billing@loadsnexus.com');
assert.strictEqual(replyAddress('loadsnexus', 'support'), 'support@loadsnexus.com');
assert.strictEqual(replyAddress('loadsnexus', 'deals'), 'deals@loadsnexus.com');
assert.strictEqual(replyAddress('loadsnexus', 'auth'), 'auth@loadsnexus.com');
assert.strictEqual(replyAddress('loadsnexus', 'dispatch'), 'dispatch@loadsnexus.com');

assert.strictEqual(replyAddress('nyclimowish', 'info'), 'info@nyclimowish.com');
assert.strictEqual(replyAddress('nyclimowish', 'bookings'), 'bookings@nyclimowish.com');
assert.strictEqual(replyAddress('nyclimowish', 'support'), 'support@nyclimowish.com');
assert.strictEqual(replyAddress('nyclimowish', 'billing'), 'billing@nyclimowish.com');

assert.strictEqual(replyAddress('buywishonline', 'support'), 'support@buywishonline.com');
assert.strictEqual(replyAddress('buywishonline', 'orders'), 'orders@buywishonline.com');
assert.strictEqual(replyAddress('buywishonline', 'billing'), 'billing@buywishonline.com');
assert.strictEqual(replyAddress('buywishonline', 'alerts'), 'alerts@buywishonline.com');

assert.strictEqual(brandFromAddress(LOADSNEXUS.dispatch), 'loadsnexus');
assert.strictEqual(brandFromAddress(NYCLIMOWISH.bookings), 'nyclimowish');
assert.strictEqual(brandFromAddress(BUYWISHONLINE.orders), 'buywishonline');
assert.strictEqual(brandFromAddress(SHIPPINGWISH.dispatch), 'shippingwish');
assert.strictEqual(getBrandSender('unknown', 'x'), SHIPPINGWISH.operations);

for (const [brand, table] of Object.entries({
  shippingwish: SHIPPINGWISH,
  loadsnexus: LOADSNEXUS,
  nyclimowish: NYCLIMOWISH,
  buywishonline: BUYWISHONLINE
})) {
  for (const [mailbox, from] of Object.entries(table)) {
    assert.strictEqual(domainOf(from), BRAND_DOMAINS[brand], `${brand}.${mailbox} mixed domain`);
    assert.ok(addressOf(from).startsWith(`${mailbox}@`) || mailbox === 'info', `${brand}.${mailbox} local-part`);
  }
}

const options = inboxFromOptions();
assert.ok(options.length >= 16);
for (const from of options) {
  assert.ok(isKnownMailbox(from), from);
  const brand = brandFromAddress(from);
  assert.strictEqual(domainOf(from), BRAND_DOMAINS[brand]);
}

assert.strictEqual(resolveKnownFrom('dispatch@shippingwish.com'), SHIPPINGWISH.dispatch);
assert.strictEqual(resolveKnownFrom('not-a-real@example.com'), null);
assert.ok(SHIPPINGWISH.dispatch.includes('dispatch@shippingwish.com'));

const mixed = [
  getBrandSender('shippingwish', 'dispatch'),
  getBrandSender('loadsnexus', 'alerts'),
  getBrandSender('nyclimowish', 'bookings'),
  getBrandSender('buywishonline', 'orders')
];
const domains = new Set(mixed.map(domainOf));
assert.deepStrictEqual([...domains].sort(), ['buywishonline.com', 'loadsnexus.com', 'nyclimowish.com', 'shippingwish.com']);

console.log('brand-senders ok');
