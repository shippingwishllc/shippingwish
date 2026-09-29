const assert = require('assert');
const { knownMailbox, matchesMailbox, filterBrandMessages, normalizeFolder } = require('../utils/brand-mailboxes');

assert.ok(knownMailbox('buywishonline.com'));
assert.strictEqual(knownMailbox('gmail.com'), null);
assert.strictEqual(normalizeFolder('', 'outbound'), 'sent');
assert.strictEqual(normalizeFolder('spam', 'inbound'), 'spam');

const inbound = [
  { id: 1, to_email: 'support@buywishonline.com', is_read: false, created_at: '2026-09-29T12:00:00Z' },
  { id: 2, to_email: 'operations@shippingwish.com', created_at: '2026-09-28T12:00:00Z' },
  { id: 3, to_email: '', created_at: '2026-09-27T12:00:00Z' },
  { id: 4, to_email: 'info@nyclimowish.com', created_at: '2026-09-26T12:00:00Z' },
  { id: 5, to_email: 'dispatch@loadsnexus.com', is_spam: true, created_at: '2026-09-25T12:00:00Z' },
  { id: 6, to_email: 'orders@buywishonline.com', deleted_at: '2026-09-29T13:00:00Z', created_at: '2026-09-24T12:00:00Z' }
];
const outbound = [
  { id: 9, from_email: 'operations@shippingwish.com', created_at: '2026-09-29T11:00:00Z' },
  { id: 8, from_email: 'orders@buywishonline.com', created_at: '2026-09-28T11:00:00Z' }
];

assert.ok(matchesMailbox('', 'shippingwish.com'));
assert.strictEqual(matchesMailbox('', 'buywishonline.com'), false);
assert.strictEqual(matchesMailbox('user@evilshippingwish.com', 'shippingwish.com'), false);

const buywishInbox = filterBrandMessages({ inboundRows: inbound, outboundRows: outbound, domain: 'buywishonline.com', folder: 'inbox' });
assert.deepStrictEqual(buywishInbox.map((row) => row.id), [1]);

const buywishSent = filterBrandMessages({ inboundRows: inbound, outboundRows: outbound, domain: 'buywishonline.com', folder: 'sent' });
assert.deepStrictEqual(buywishSent.map((row) => row.id), [8]);

const shippingInbox = filterBrandMessages({ inboundRows: inbound, outboundRows: outbound, domain: 'shippingwish.com', folder: 'inbox' });
assert.deepStrictEqual(shippingInbox.map((row) => row.id), [2, 3]);

const limo = filterBrandMessages({ inboundRows: inbound, outboundRows: outbound, domain: 'nyclimowish.com', folder: 'inbox' });
assert.deepStrictEqual(limo.map((row) => row.id), [4]);

const spam = filterBrandMessages({ inboundRows: inbound, outboundRows: outbound, domain: 'loadsnexus.com', folder: 'spam' });
assert.deepStrictEqual(spam.map((row) => row.id), [5]);

const trash = filterBrandMessages({ inboundRows: inbound, outboundRows: outbound, domain: 'buywishonline.com', folder: 'trash' });
assert.deepStrictEqual(trash.map((row) => row.id), [6]);

console.log('brand mailbox tests passed');
