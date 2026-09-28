/**
 * Pure catalog rules for the BuyWish Zendrop edit.
 * A product is stocked only when Zendrop quotes shipping to the USA, Canada,
 * and the United Kingdom, and the fastest quoted USA lane is 14 days or fewer.
 */

const TARGET_COUNTRIES = ['US', 'CA', 'GB'];
const FAST_USA_DAYS = 14;

const CATEGORY_KEYWORDS = {
  Tech: ['electronic', 'phone', 'laptop', 'gadget', 'usb', 'wireless', 'bluetooth', 'camera', 'speaker', 'headphone', 'charger', 'smart', 'tech', 'led', 'light', 'watch', 'tracker', 'earbud', 'computer', 'tablet'],
  Home: ['home', 'house', 'decor', 'organiz', 'storage', 'curtain', 'pillow', 'lamp', 'vacuum', 'clean', 'mop', 'candle', 'blanket', 'bedding'],
  Fitness: ['fitness', 'exercise', 'gym', 'sport', 'yoga', 'weight', 'muscle', 'protein', 'resistance', 'band', 'pedometer', 'dumbbell', 'barbell', 'workout'],
  Beauty: ['beauty', 'skin', 'face', 'hair', 'nail', 'makeup', 'cream', 'serum', 'mask', 'lip', 'lash', 'glow', 'moistur', 'cleanser', 'skincare', 'cosmetic'],
  Kitchen: ['kitchen', 'cook', 'food', 'chef', 'knife', 'coffee', 'blender', 'grinder', 'plate', 'bake', 'cookware', 'utensil'],
  Pets: ['pet', 'dog', 'cat', 'animal', 'paw', 'collar', 'leash', 'grooming', 'puppy', 'kitten'],
  Travel: ['travel', 'luggage', 'bag', 'backpack', 'passport', 'packing', 'suitcase', 'toiletry'],
  Kids: ['kid', 'child', 'baby', 'toy', 'toddler', 'puzzle', 'newborn']
};

// Official Zendrop catalog names. These are filters, not store labels.
const DEPARTMENT_ZENDROP_CATEGORIES = {
  Tech: ['Electronics', 'Audio', 'Computers', 'Electronics Accessories', 'Cameras & Optics', 'Cameras'],
  Home: ['Home & Garden', 'Decor', 'Lighting', 'Linens & Bedding', 'Household Appliances', 'Furniture'],
  Fitness: ['Sporting Goods', 'Fitness & General Exercise Equipment', 'Outdoor Recreation', 'Athletics'],
  Beauty: ['Health & Beauty', 'Personal Care', 'Health Care'],
  Kitchen: ['Kitchen & Dining'],
  Pets: ['Animals & Pet Supplies', 'Pet Supplies'],
  Travel: ['Luggage & Bags', 'Backpacks', 'Suitcases'],
  Kids: ['Toys & Games', 'Baby & Toddler', 'Toys']
};

const STORE_DEPARTMENTS = {
  Tech: { slug: 'tech', title: 'Tech & Gadgets', blurb: 'Headphones, chargers, and everyday gadgets.', searches: ['wireless earbuds', 'phone stand', 'bluetooth speaker', 'usb charger'] },
  Home: { slug: 'home', title: 'Home & Living', blurb: 'Decor, lighting, and comfort for every room.', searches: ['home organizer', 'led lamp', 'throw blanket', 'wall decor'] },
  Fitness: { slug: 'fitness', title: 'Fitness & Outdoors', blurb: 'Gear for training, yoga, and time outside.', searches: ['resistance bands', 'yoga mat', 'fitness tracker', 'dumbbell'] },
  Beauty: { slug: 'beauty', title: 'Beauty & Wellness', blurb: 'Skin, hair, and daily self-care.', searches: ['skincare tool', 'makeup brush', 'hair tool', 'face serum'] },
  Kitchen: { slug: 'kitchen', title: 'Kitchen & Cooking', blurb: 'Tools for cooking, coffee, and the table.', searches: ['kitchen gadget', 'coffee accessories', 'food container', 'cookware'] },
  Pets: { slug: 'pets', title: 'Pet Supplies', blurb: 'Care and play for dogs and cats.', searches: ['pet grooming', 'dog toy', 'cat bed', 'dog leash'] },
  Travel: { slug: 'travel', title: 'Travel & Bags', blurb: 'Bags and essentials for the trip.', searches: ['packing cubes', 'travel pillow', 'toiletry bag', 'backpack'] },
  Kids: { slug: 'kids', title: 'Kids & Toys', blurb: 'Toys and small gifts for little ones.', searches: ['kids toy', 'baby gift', 'building blocks', 'puzzle'] }
};

const WINNING_SEARCHES = Object.entries(STORE_DEPARTMENTS).flatMap(([category, dept]) => (
  dept.searches.slice(0, 1).map((q) => ({ category, q }))
));

function departmentBySlug(slug) {
  const key = Object.keys(STORE_DEPARTMENTS).find((name) => STORE_DEPARTMENTS[name].slug === String(slug || '').toLowerCase());
  if (!key) return null;
  return { key, ...STORE_DEPARTMENTS[key] };
}

function departmentByQuery(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.toLowerCase() === 'all') return null;
  if (STORE_DEPARTMENTS[raw]) return { key: raw, ...STORE_DEPARTMENTS[raw] };
  const bySlug = departmentBySlug(raw);
  if (bySlug) return bySlug;
  const lower = raw.toLowerCase();
  const key = Object.keys(STORE_DEPARTMENTS).find((name) => name.toLowerCase() === lower || STORE_DEPARTMENTS[name].title.toLowerCase() === lower);
  return key ? { key, ...STORE_DEPARTMENTS[key] } : null;
}

function categoryName(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') return value.name || value.title || value.label || value.category_name || '';
  return String(value);
}

function keywordScore(text, keywords) {
  const hay = String(text || '').toLowerCase();
  let score = 0;
  keywords.forEach((kw) => {
    const needle = String(kw || '').toLowerCase();
    if (!needle) return;
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Match at the start of a word so "air" does not hit "hair" and "sport" does not hit "transport".
    if (new RegExp(`(?:^|[^a-z0-9])${escaped}`).test(hay)) score += needle.length;
  });
  return score;
}

function flattenCategories(payload) {
  const out = [];
  const seen = new Set();
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    const name = node.name || node.title || node.label || node.category_name;
    const id = node.id != null ? node.id : node.category_id;
    if (name && id != null) {
      const key = String(id);
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ id, name: String(name) });
      }
    }
    ['children', 'subcategories', 'categories', 'items'].forEach((key) => {
      if (Array.isArray(node[key])) visit(node[key]);
    });
  };
  if (payload && Array.isArray(payload.categories)) visit(payload.categories);
  else visit(payload);
  return out;
}

function categoriesForDepartment(flat, departmentKey) {
  const hints = DEPARTMENT_ZENDROP_CATEGORIES[departmentKey] || [];
  return (flat || [])
    .map((cat) => {
      const name = String(cat.name || '').toLowerCase();
      const exact = hints.find((hint) => name === hint.toLowerCase());
      const partial = hints.find((hint) => name.includes(hint.toLowerCase()));
      if (!exact && !partial) return null;
      return { id: cat.id, name: cat.name, rank: exact ? 0 : 1 };
    })
    .filter(Boolean)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 4);
}

function classifyProduct(product) {
  const supplied = String((product && (product.supplier_category || product.category || product.category_name)) || '');
  const suppliedLower = supplied.toLowerCase();
  const text = `${(product && product.title) || ''} ${(product && product.description) || ''}`;
  let best = null;
  let bestScore = 0;
  Object.keys(CATEGORY_KEYWORDS).forEach((key) => {
    let score = keywordScore(text, CATEGORY_KEYWORDS[key]);
    const hints = DEPARTMENT_ZENDROP_CATEGORIES[key] || [];
    if (supplied && !/^uncategor/i.test(supplied) && hints.some((hint) => suppliedLower.includes(hint.toLowerCase()))) {
      score += 12;
    }
    if (score > bestScore) {
      bestScore = score;
      best = key;
    }
  });
  return bestScore > 0 ? { key: best, score: bestScore } : null;
}

function inferCategory(name, supplied) {
  const found = classifyProduct({
    title: name,
    supplier_category: supplied && !/^uncategor/i.test(String(supplied)) ? supplied : ''
  });
  if (found) return found.key;
  return 'Featured';
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
  const supplierCategory = categoryName(p.category || p.category_name || p.category_title);
  const classified = classifyProduct({ title, description: cleanDesc, supplier_category: supplierCategory });
  const handle = productHandle(p.id);

  return {
    id: p.id,
    zendrop_id: p.id,
    handle,
    title,
    category: classified ? classified.key : 'Featured',
    supplier_category: supplierCategory,
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
    product_url: handle ? `https://www.buywishonline.com/products/${handle}` : (p.product_url || null),
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

function categoryFilterIsTrusted(categoryProducts, baselineProducts) {
  const baseline = new Set((baselineProducts || []).map((product) => String(product && (product.id || product.zendrop_id) || '')));
  const seen = new Set();
  let unique = 0;
  let overlap = 0;
  (categoryProducts || []).forEach((product) => {
    const id = String(product && (product.id || product.zendrop_id) || '');
    if (!id || seen.has(id)) return;
    seen.add(id);
    unique += 1;
    if (baseline.has(id)) overlap += 1;
  });
  if (unique < 8) return false;
  return overlap / unique < 0.45;
}

function productSharePath(product) {
  if (!product) return null;
  const handle = product.handle || productHandle(product.zendrop_id || product.id);
  return handle ? `/products/${handle}` : null;
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
  STORE_DEPARTMENTS,
  WINNING_SEARCHES,
  departmentBySlug,
  departmentByQuery,
  DEPARTMENT_ZENDROP_CATEGORIES,
  inferCategory,
  classifyProduct,
  flattenCategories,
  categoriesForDepartment,
  categoryFilterIsTrusted,
  normalizeProduct,
  productSharePath,
  summarizeLane,
  scoreProduct,
  qualifiesForStore,
  deliveryLabel,
  productHandle,
  storeProductFromRow
};
