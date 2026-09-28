/**
 * Pure catalog rules for the BuyWish Zendrop edit.
 * A product is stocked only when Zendrop quotes shipping to the USA, Canada,
 * and the United Kingdom, and the fastest quoted USA lane is 14 days or fewer.
 */

const TARGET_COUNTRIES = ['US', 'CA', 'GB'];
const FAST_USA_DAYS = 14;

const CATEGORY_KEYWORDS = {
  Tech: ['electronic', 'phone', 'laptop', 'gadget', 'usb', 'wireless', 'bluetooth', 'camera', 'speaker', 'headphone', 'charger', 'smart', 'tech', 'led', 'light', 'watch', 'tracker', 'earbud'],
  Home: ['home', 'house', 'room', 'decor', 'organiz', 'storage', 'curtain', 'pillow', 'lamp', 'vacuum', 'clean', 'mop', 'air', 'candle'],
  Fitness: ['fitness', 'exercise', 'gym', 'sport', 'yoga', 'weight', 'muscle', 'protein', 'resistance', 'band', 'run', 'pedometer', 'health'],
  Beauty: ['beauty', 'skin', 'face', 'hair', 'nail', 'makeup', 'cream', 'serum', 'mask', 'lip', 'eye', 'glow', 'moistur', 'cleanser', 'lash'],
  Kitchen: ['kitchen', 'cook', 'food', 'chef', 'knife', 'pot', 'pan', 'coffee', 'blender', 'grinder', 'bottle', 'cup', 'mug', 'plate', 'bake'],
  Pets: ['pet', 'dog', 'cat', 'animal', 'paw', 'collar', 'leash', 'grooming', 'treat'],
  Travel: ['travel', 'luggage', 'bag', 'backpack', 'passport', 'packing', 'suitcase'],
  Kids: ['kid', 'kids', 'child', 'baby', 'toy', 'toddler']
};

const WINNING_SEARCHES = [
  { category: 'Tech', q: 'wireless earbuds' },
  { category: 'Tech', q: 'phone accessories' },
  { category: 'Home', q: 'home organizer' },
  { category: 'Home', q: 'led lamp' },
  { category: 'Fitness', q: 'resistance bands' },
  { category: 'Beauty', q: 'skincare tool' },
  { category: 'Kitchen', q: 'kitchen gadget' },
  { category: 'Pets', q: 'pet grooming' },
  { category: 'Travel', q: 'packing cubes' }
];

function inferCategory(name, supplied) {
  const given = String(supplied || '').trim();
  if (given && !/^uncategor/i.test(given)) {
    const lower = given.toLowerCase();
    for (const cat of Object.keys(CATEGORY_KEYWORDS)) {
      if (lower.includes(cat.toLowerCase())) return cat;
    }
  }
  const hay = String(name || '').toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => hay.includes(kw))) return cat;
  }
  return given || 'Featured';
}

function stripHtml(value) {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeProduct(p) {
  const images = [];
  if (p.image) images.push(p.image);
  if (Array.isArray(p.images)) {
    p.images.forEach((img) => {
      const url = typeof img === 'string' ? img : (img && (img.url || img.src));
      if (url && !images.includes(url)) images.push(url);
    });
  }

  const rawDesc = p.description || '';
  const cleanDesc = stripHtml(rawDesc).substring(0, 500);
  const features = [];
  const bulletMatches = String(rawDesc).match(/<li[^>]*>(.*?)<\/li>/gi) || [];
  bulletMatches.slice(0, 5).forEach((m) => {
    const text = stripHtml(m);
    if (text && text.length < 120) features.push(text);
  });

  const retailPrice = parseFloat(p.price || p.retail_price || 0) || 0;
  const suppliedComparePrice = parseFloat(p.compare_at_price || p.compare_price || 0);
  const comparePrice = Number.isFinite(suppliedComparePrice) && suppliedComparePrice > retailPrice
    ? suppliedComparePrice.toFixed(2)
    : null;

  const title = p.name || p.title || 'Premium Product';
  let badge = 'new';
  if (p.is_trending || p.trending) badge = 'hot';
  else if (comparePrice) badge = 'sale';

  const supplierCost = parseFloat(p.cost || p.supplier_cost || p.base_price || 0);

  return {
    id: p.id,
    zendrop_id: p.id,
    title,
    category: inferCategory(title, p.category || p.category_name),
    retail_price: retailPrice.toFixed(2),
    compare_price: comparePrice,
    supplier_cost: Number.isFinite(supplierCost) && supplierCost > 0 ? supplierCost : 0,
    description: cleanDesc,
    features,
    images: images.slice(0, 4),
    image_url: images[0] || null,
    badge,
    rating: Number.isFinite(Number(p.rating || p.review_rating)) ? Number(p.rating || p.review_rating) : null,
    reviews: Number.isFinite(Number(p.review_count || p.reviews)) ? Number(p.review_count || p.reviews) : 0,
    delivery: p.estimated_delivery || p.delivery_estimate || null,
    ships_to: Array.isArray(p.ships_to) ? p.ships_to : [],
    product_url: p.product_url || null,
    in_stock: typeof p.in_stock === 'boolean'
      ? p.in_stock
      : (Number.isFinite(Number(p.inventory_quantity)) ? Number(p.inventory_quantity) > 0 : null),
    is_trending: Boolean(p.is_trending || p.trending)
  };
}

function collectDayValues(node, found = []) {
  if (!node || typeof node !== 'object') return found;
  if (Array.isArray(node)) {
    node.forEach((item) => collectDayValues(item, found));
    return found;
  }
  const dayKeys = ['estimated_days', 'delivery_days', 'days', 'max_days', 'min_days', 'estimated_delivery_days'];
  dayKeys.forEach((key) => {
    const n = Number(node[key]);
    if (Number.isFinite(n) && n >= 0 && n < 120) found.push(n);
  });
  Object.values(node).forEach((value) => {
    if (value && typeof value === 'object') collectDayValues(value, found);
  });
  return found;
}

function laneHasMethod(node) {
  if (!node || typeof node !== 'object') return false;
  const text = JSON.stringify(node).toLowerCase();
  if (!text || text === '{}' || text === '[]' || text === 'null') return false;
  if (node.error || node.errors) return false;
  if (node.available === false || node.ships === false || node.shippable === false) return false;
  const denied = /not available|cannot ship|can't ship|does not ship|no shipping|unsupported country/.test(text);
  if (denied) return false;
  return Boolean(
    node.cost != null ||
    node.price != null ||
    node.free_shipping === true ||
    node.type ||
    node.method ||
    node.service ||
    (Array.isArray(node.shipping_estimates) && node.shipping_estimates.length) ||
    (Array.isArray(node.methods) && node.methods.length) ||
    (Array.isArray(node.rates) && node.rates.length) ||
    collectDayValues(node).length
  );
}

function summarizeLane(data) {
  if (!data || typeof data !== 'object') return { ships: false, fastestDays: null };
  if (data.error || data.errors) return { ships: false, fastestDays: null };
  const ships = laneHasMethod(data);
  const days = collectDayValues(data);
  const fastestDays = days.length ? Math.min(...days) : null;
  return { ships, fastestDays };
}

function scoreProduct({ trending, shipsAll, fastestDays, inStock, comparePrice, retailPrice }) {
  let score = 0;
  if (trending) score += 35;
  if (shipsAll) score += 25;
  if (Number.isFinite(fastestDays)) {
    if (fastestDays <= 5) score += 25;
    else if (fastestDays <= 8) score += 18;
    else if (fastestDays <= FAST_USA_DAYS) score += 10;
  }
  if (inStock !== false) score += 10;
  const compare = Number(comparePrice);
  const retail = Number(retailPrice);
  if (Number.isFinite(compare) && Number.isFinite(retail) && compare > retail) score += 5;
  return score;
}

function qualifiesForStore(profile) {
  if (!profile || !profile.shipsAll) return false;
  return Number.isFinite(profile.fastestDays) && profile.fastestDays <= FAST_USA_DAYS;
}

function deliveryLabel(profile) {
  if (!profile || !profile.shipsAll) return null;
  const days = profile.fastestDays;
  const dayText = Number.isFinite(days) ? `USA from ${days} day${days === 1 ? '' : 's'}` : 'USA, Canada, and UK';
  return `Ships to USA, Canada & UK · ${dayText}`;
}

function productHandle(zendropId) {
  const id = String(zendropId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  return id ? `p-${id}` : null;
}

function storeProductFromRow(row) {
  const images = Array.isArray(row.images) ? row.images : (row.image_url ? [row.image_url] : []);
  const features = Array.isArray(row.features) ? row.features : [];
  const ships = Array.isArray(row.ships_to) ? row.ships_to : [];
  const retail = Number(row.retail_price);
  return {
    id: Number(row.zendrop_id) || row.id,
    zendrop_id: row.zendrop_id,
    handle: row.handle,
    title: row.title,
    category: row.category || 'Featured',
    retail_price: Number.isFinite(retail) ? retail.toFixed(2) : '0.00',
    compare_price: row.compare_price != null ? Number(row.compare_price).toFixed(2) : null,
    description: row.description || '',
    features,
    images,
    image_url: row.image_url || images[0] || null,
    badge: row.badge || 'new',
    rating: null,
    reviews: 0,
    delivery: row.delivery_label || null,
    ships_to: ships,
    in_stock: row.is_active !== false,
    winning_score: row.winning_score || 0,
    product_url: `https://www.buywishonline.com/products/${row.handle}`
  };
}

module.exports = {
  TARGET_COUNTRIES,
  FAST_USA_DAYS,
  WINNING_SEARCHES,
  inferCategory,
  normalizeProduct,
  summarizeLane,
  scoreProduct,
  qualifiesForStore,
  deliveryLabel,
  productHandle,
  storeProductFromRow
};
