const assert = require('assert');
const {
  classifyProduct,
  flattenCategories,
  categoriesForDepartment,
  productMatchesQuery,
  categoryFilterIsTrusted,
  productSharePath,
  departmentBySlug,
  summarizeLane,
  scoreProduct,
  qualifiesForStore,
  deliveryLabel,
  productHandle,
  normalizeProduct,
  inferCategory
} = require('../utils/buywish-catalog');
const {
  isOrderCreateTool,
  selectOrderTool,
  buildOrderArguments,
  extractOrderId
} = require('../utils/buywish-fulfillment');
const { renderProductPage, renderCollectionPage, renderSitemap, injectProductIntoStorefront } = require('../utils/buywish-pages');

const fastLane = summarizeLane({
  shipping_estimates: [{ type: 'Express', cost: 4.5, estimated_days: 6 }]
});
assert.strictEqual(fastLane.ships, true);
assert.strictEqual(fastLane.fastestDays, 6);

const blocked = summarizeLane({ error: 'Country not supported' });
assert.strictEqual(blocked.ships, false);

const empty = summarizeLane({});
assert.strictEqual(empty.ships, false);

const profile = { shipsAll: true, fastestDays: 6 };
assert.strictEqual(qualifiesForStore(profile), true);
assert.strictEqual(qualifiesForStore({ shipsAll: true, fastestDays: 20 }), false);
assert.strictEqual(qualifiesForStore({ shipsAll: false, fastestDays: 4 }), false);
assert.ok(deliveryLabel(profile).includes('USA'));

const score = scoreProduct({
  trending: true,
  shipsAll: true,
  fastestDays: 5,
  inStock: true,
  comparePrice: 40,
  retailPrice: 25
});
assert.ok(score >= 70);

const product = normalizeProduct({
  id: 42,
  name: 'Wireless earbuds',
  price: '19.00',
  description: '<ul><li>Charging case</li></ul>',
  is_trending: true
});
assert.strictEqual(product.category, 'Tech');
assert.strictEqual(product.handle, 'p-42');
assert.strictEqual(product.product_url, 'https://www.buywishonline.com/products/p-42');
assert.strictEqual(productSharePath(product), '/products/p-42');
assert.strictEqual(product.features[0], 'Charging case');
assert.strictEqual(inferCategory('Dog collar'), 'Pets');
assert.strictEqual(inferCategory('Kemei Rechargeable Electric Hair Clipper'), 'Beauty');
assert.strictEqual(inferCategory('DIY Wooden Mechanical Owl Clock Model for Home Decor'), 'Home');
assert.strictEqual(inferCategory('Foam Barbell Shoulder Pads for Weightlifting'), 'Fitness');
assert.strictEqual(inferCategory('Paw Patrol Shampoo 8 oz Bottle'), 'Pets');
assert.strictEqual(inferCategory('Men’s Premium Sunset Chaser Tank Top'), 'Featured');
assert.strictEqual(classifyProduct({ title: 'Wireless earbuds', supplier_category: 'Apparel & Accessories' }).key, 'Tech');
assert.strictEqual(classifyProduct({ title: 'Plain cotton tee', supplier_category: 'Apparel & Accessories' }), null);
const tech = classifyProduct({ title: 'Bluetooth speaker' });
const home = classifyProduct({ title: 'Throw blanket for the living room' });
assert.notStrictEqual(tech.key, home.key);
const flat = flattenCategories({
  categories: [{ id: 7, name: 'Electronics', children: [{ id: 70, name: 'Audio' }] }, { id: 13, name: 'Home & Garden' }]
});
assert.strictEqual(categoriesForDepartment(flat, 'Tech')[0].name, 'Electronics');
assert.strictEqual(productHandle(42), 'p-42');
assert.strictEqual(departmentBySlug('tech').title, 'Tech & Gadgets');
assert.ok(!departmentBySlug('beauty').blurb.toLowerCase().includes('zendrop'));
const sameAsTrending = Array.from({ length: 10 }, (_, i) => ({ id: i + 1 }));
const distinct = Array.from({ length: 10 }, (_, i) => ({ id: i + 100 }));
assert.strictEqual(categoryFilterIsTrusted(sameAsTrending, sameAsTrending), false);
assert.strictEqual(categoryFilterIsTrusted(distinct, sameAsTrending), true);
assert.strictEqual(categoryFilterIsTrusted(distinct.slice(0, 4), []), false);
assert.strictEqual(productMatchesQuery({ title: 'Wireless Earbuds', description: '' }, 'earbud'), true);
assert.strictEqual(productMatchesQuery({ title: 'Blue Yoga Mat', description: 'for exercise' }, 'yoga mat'), true);
assert.strictEqual(productMatchesQuery({ title: 'Throw Blanket', description: 'home decor' }, 'earbuds'), false);
assert.strictEqual(departmentBySlug('nope'), null);

assert.strictEqual(isOrderCreateTool({ name: 'get_orders' }), false);
assert.strictEqual(isOrderCreateTool({ name: 'create_order' }), true);
assert.strictEqual(isOrderCreateTool({ name: 'fulfill_order' }), true);

const chosen = selectOrderTool({
  tools: [{ name: 'fulfill_order' }, { name: 'get_orders' }, { name: 'create_order' }]
});
assert.strictEqual(chosen.name, 'create_order');

const order = {
  order_number: 'BWO-ABC',
  customer_name: 'Ava Shah',
  customer_email: 'ava@example.com',
  customer_phone: '555',
  shipping_address: '1 Main St',
  shipping_city: 'Austin',
  shipping_state: 'TX',
  shipping_postal: '78701',
  shipping_country: 'US',
  currency: 'USD',
  items: [{ product_id: 42, quantity: 1, title: 'Earbuds' }]
};
const built = buildOrderArguments({
  name: 'create_order',
  inputSchema: {
    type: 'object',
    required: ['product_id', 'quantity', 'country_code', 'idempotency_key'],
    properties: {
      product_id: { type: 'number' },
      quantity: { type: 'number' },
      country_code: { type: 'string' },
      idempotency_key: { type: 'string' },
      confirm: { type: 'boolean' }
    }
  }
}, order);
assert.strictEqual(built.ok, true);
assert.strictEqual(built.args.product_id, 42);
assert.strictEqual(built.args.idempotency_key, 'BWO-ABC');
assert.strictEqual(built.args.confirm, true);

const multi = buildOrderArguments({
  name: 'create_order',
  inputSchema: { properties: { product_id: {} }, required: ['product_id'] }
}, { ...order, items: [{ product_id: 1, quantity: 1 }, { product_id: 2, quantity: 1 }] });
assert.strictEqual(multi.ok, false);
assert.strictEqual(multi.manual, true);

const missing = buildOrderArguments({
  name: 'create_order',
  inputSchema: { properties: { variant_id: {} }, required: ['variant_id'] }
}, order);
assert.strictEqual(missing.ok, false);

assert.strictEqual(extractOrderId({ order: { id: 'zd_9' } }), 'zd_9');
assert.strictEqual(extractOrderId({ status: 'ok' }), null);

const html = renderProductPage({
  handle: 'p-42',
  title: 'Earbuds <gold>',
  description: 'Quiet luxury',
  retail_price: '19.00',
  zendrop_id: 42,
  images: ['https://example.com/a.jpg'],
  image_url: 'https://example.com/a.jpg',
  category: 'Tech',
  features: ['Case'],
  in_stock: true
});
assert.ok(html.includes('Earbuds &lt;gold&gt;'));
assert.ok(html.includes('https://www.buywishonline.com/products/p-42'));
assert.ok(html.includes('Share this product'));
assert.ok(!html.toLowerCase().includes('zendrop'));
const collectionPage = renderCollectionPage('Beauty & Wellness', []);
assert.ok(collectionPage.includes('Beauty &amp; Wellness'));
assert.ok(!collectionPage.toLowerCase().includes('zendrop'));
assert.ok(!html.includes('<gold>'));

const xml = renderSitemap([{ loc: 'https://www.buywishonline.com/', priority: '1.0' }]);
assert.ok(xml.includes('<loc>https://www.buywishonline.com/</loc>'));

const storefront = injectProductIntoStorefront(
  '<html><head><title>Old</title><meta name="description" content="old"><link rel="canonical" href="https://www.buywishonline.com/"><meta property="og:type" content="website"><meta property="og:url" content="https://www.buywishonline.com/"></head><body></body></html>',
  { id: 42, handle: 'p-42', title: 'Earbuds', description: 'Quiet', retail_price: '19.00', category: 'Tech', image_url: 'https://example.com/a.jpg' }
);
assert.ok(storefront.includes('window.BUYWISH_PRODUCT='));
assert.ok(storefront.includes('https://www.buywishonline.com/products/p-42'));
assert.ok(storefront.includes('detailShareUrl') === false);
assert.ok(storefront.includes('"shareUrl":"https://www.buywishonline.com/products/p-42"'));

console.log('buywish catalog tests passed');
