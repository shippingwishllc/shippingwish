/**
 * Pure catalog rules for the BuyWish Zendrop edit.
 * A product is stocked only when Zendrop quotes shipping to the USA, Canada,
 * and the United Kingdom, and the fastest quoted USA lane is 14 days or fewer.
 */

const TARGET_COUNTRIES = ['US', 'CA', 'GB'];
const FAST_USA_DAYS = 14;

const CATEGORY_KEYWORDS = {
  Tech: ['electronic', 'laptop', 'gadget', 'usb', 'wireless', 'bluetooth', 'camera', 'speaker', 'headphone', 'charger', 'smartwatch', 'tech', 'led', 'earbud', 'computer', 'tablet', 'ring light'],
  Phone: ['cellphone', 'phone case', 'screen protector', 'phone holder', 'mobile case', 'iphone', 'phone accessory', 'tempered glass'],
  Home: ['home', 'house', 'decor', 'organiz', 'storage', 'curtain', 'pillow', 'lamp', 'vacuum', 'clean', 'mop', 'candle', 'blanket', 'bedding'],
  Fitness: ['fitness', 'exercise', 'gym', 'sport', 'sporting', 'yoga', 'weight', 'muscle', 'protein', 'resistance', 'band', 'pedometer', 'dumbbell', 'barbell', 'workout'],
  Beauty: ['beauty', 'skin', 'face', 'hair', 'nail', 'makeup', 'cream', 'serum', 'mask', 'lipstick', 'lip balm', 'lash', 'glow', 'moistur', 'cleanser', 'skincare', 'cosmetic'],
  Kitchen: ['kitchen', 'cook', 'food', 'chef', 'knife', 'coffee', 'blender', 'grinder', 'plate', 'bake', 'cookware', 'utensil'],
  Jewelry: ['jewelry', 'necklace', 'bracelet', 'earring', 'pendant', 'wristwatch', 'watch', 'ring', 'anklet'],
  Women: ['women', 'ladies', 'dress', 'blouse', 'skirt', 'legging', 'lingerie'],
  Men: ['men', 'mens', 'polo', 'necktie'],
  Shoes: ['shoe', 'sneaker', 'boot', 'sandal', 'heel', 'loafer', 'footwear'],
  Bags: ['handbag', 'purse', 'tote', 'wallet', 'backpack', 'crossbody', 'clutch', 'duffel'],
  Pets: ['pet', 'dog', 'cat', 'animal', 'paw', 'collar', 'leash', 'grooming', 'puppy', 'kitten'],
  Travel: ['travel', 'luggage', 'passport', 'packing', 'suitcase', 'toiletry', 'travel pillow'],
  Kids: ['kid', 'child', 'children', 'toy', 'toddler', 'puzzle', 'plush', 'doll'],
  Baby: ['baby', 'newborn', 'infant', 'onesie', 'diaper'],
  Arts: ['acrylic paint', 'canvas', 'watercolor', 'craft kit', 'sketchbook', 'drawing set', 'art supply']
};

// Official Zendrop catalog names. These are filters, not store labels.
// Broad parents such as "Apparel & Accessories" are omitted so a supplier
// label cannot pull an unrelated product into clothing or jewelry.
const DEPARTMENT_ZENDROP_CATEGORIES = {
  Tech: ['Electronics', 'Audio', 'Computers', 'Cameras & Optics', 'Cameras'],
  Phone: ['Cell Phones', 'Mobile Phone Accessories', 'Phone Accessories', 'phone accessories'],
  Home: ['Home & Garden', 'Decor', 'Lighting', 'Linens & Bedding', 'Household Appliances', 'Furniture'],
  Fitness: ['Sporting Goods', 'Fitness & General Exercise Equipment', 'Outdoor Recreation', 'Athletics'],
  Beauty: ['Health & Beauty', 'Personal Care', 'Health Care'],
  Kitchen: ['Kitchen & Dining'],
  Jewelry: ['Jewelry', 'Watches'],
  Women: ["Women's Clothing", 'Dresses', 'Clothing'],
  Men: ["Men's Clothing", 'Clothing'],
  Shoes: ['Shoes', 'Footwear'],
  Bags: ['Handbags', 'Backpacks', 'Wallets', 'Luggage & Bags'],
  Pets: ['Animals & Pet Supplies', 'Pet Supplies'],
  Travel: ['Suitcases', 'Luggage & Bags'],
  Kids: ['Toys & Games', 'Toys'],
  Baby: ['Baby & Toddler', 'Baby'],
  Arts: ['Arts & Entertainment', 'Arts & Crafts', 'Crafts']
};

const STORE_DEPARTMENTS = {
  Tech: { slug: 'tech', title: 'Tech & Gadgets', short: 'Tech', icon: '💻', blurb: 'Headphones, chargers, and everyday gadgets.', searches: ['wireless earbuds', 'bluetooth speaker', 'usb charger', 'laptop stand'] },
  Phone: { slug: 'phone', title: 'Phone Accessories', short: 'Phone', icon: '📱', blurb: 'Cases, screen protection, and phone add-ons.', searches: ['phone case', 'screen protector', 'phone holder', 'tempered glass'], strict: true },
  Home: { slug: 'home', title: 'Home & Living', short: 'Home', icon: '🏠', blurb: 'Decor, lighting, and comfort for every room.', searches: ['home organizer', 'led lamp', 'throw blanket', 'wall decor'] },
  Kitchen: { slug: 'kitchen', title: 'Kitchen & Cooking', short: 'Kitchen', icon: '🍳', blurb: 'Tools for cooking, coffee, and the table.', searches: ['kitchen gadget', 'coffee accessories', 'food container', 'cookware'] },
  Fitness: { slug: 'fitness', title: 'Fitness & Outdoors', short: 'Fitness', icon: '🏃', blurb: 'Gear for training, yoga, and time outside.', searches: ['resistance bands', 'yoga mat', 'fitness tracker', 'dumbbell'] },
  Beauty: { slug: 'beauty', title: 'Beauty & Wellness', short: 'Beauty', icon: '✨', blurb: 'Skin, hair, and daily self-care.', searches: ['skincare tool', 'makeup brush', 'hair tool', 'face serum'] },
  Jewelry: { slug: 'jewelry', title: 'Jewelry & Watches', short: 'Jewelry', icon: '💍', blurb: 'Necklaces, earrings, bracelets, and watches.', searches: ['necklace', 'bracelet', 'earrings', 'wristwatch'], strict: true },
  Women: { slug: 'women', title: "Women's Clothing", short: 'Women', icon: '👗', blurb: 'Dresses, tops, and everyday clothing.', searches: ['women dress', 'blouse', 'women leggings', 'skirt'], strict: true },
  Men: { slug: 'men', title: "Men's Clothing", short: 'Men', icon: '👔', blurb: 'Shirts, layers, and everyday clothing.', searches: ['men shirt', 'men hoodie', 'men jacket', 'polo shirt'], strict: true },
  Shoes: { slug: 'shoes', title: 'Shoes', short: 'Shoes', icon: '👟', blurb: 'Sneakers, sandals, and boots.', searches: ['sneakers', 'running shoes', 'sandals', 'boots'], strict: true },
  Bags: { slug: 'bags', title: 'Bags & Accessories', short: 'Bags', icon: '👜', blurb: 'Bags, backpacks, and small accessories.', searches: ['handbag', 'backpack', 'wallet', 'crossbody bag'], strict: true },
  Travel: { slug: 'travel', title: 'Travel Essentials', short: 'Travel', icon: '🧳', blurb: 'Packing, luggage, and trip comfort.', searches: ['packing cubes', 'travel pillow', 'luggage tag', 'toiletry kit'] },
  Pets: { slug: 'pets', title: 'Pet Supplies', short: 'Pets', icon: '🐾', blurb: 'Care and play for dogs and cats.', searches: ['pet grooming', 'dog toy', 'cat bed', 'dog leash'] },
  Kids: { slug: 'kids', title: 'Kids & Toys', short: 'Kids', icon: '🧸', blurb: 'Toys and small gifts for little ones.', searches: ['kids toy', 'building blocks', 'puzzle', 'plush toy'] },
  Baby: { slug: 'baby', title: 'Baby & Kids Clothing', short: 'Baby', icon: '🍼', blurb: 'Clothing and care for babies.', searches: ['baby clothes', 'newborn onesie', 'baby bib', 'infant set'], strict: true },
  Arts: { slug: 'arts', title: 'Arts & Crafts', short: 'Arts', icon: '🎨', blurb: 'Paint, sketching, and craft kits.', searches: ['acrylic paint', 'sketchbook', 'craft kit', 'watercolor set'], strict: true }
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
    // Match a whole short word, and a longer stem only at the start of a word.
    // "men" does not hit "women" or "mental", and "dress" does not hit "dresser".
    const end = needle.length <= 5 ? '(?:es|s)?(?:[^a-z0-9]|$)' : '';
    if (new RegExp(`(?:^|[^a-z0-9])${escaped}${end}`).test(hay)) score += needle.length;
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

function roundMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function clampMargin(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 30;
  return Math.min(80, Math.max(0, Math.round(n)));
}

let storeMarginPercent = clampMargin(process.env.BUYWISH_MARGIN_PERCENT);

function setStoreMarginPercent(value) {
  storeMarginPercent = clampMargin(value);
}

function getStoreMarginPercent() {
  return storeMarginPercent;
}

function priceWithMargin(listed, cost, marginPercent = getStoreMarginPercent()) {
  const retail = roundMoney(listed);
  const supplierCost = roundMoney(cost);
  const margin = clampMargin(marginPercent);
  if (supplierCost > 0 && retail > 0 && retail <= supplierCost) {
    return roundMoney(supplierCost * (1 + margin / 100)).toFixed(2);
  }
  if (retail > 0) return retail.toFixed(2);
  if (supplierCost > 0) return roundMoney(supplierCost * (1 + margin / 100)).toFixed(2);
  return '0.00';
}

function bundlePriceAllowed({ priceA, priceB, costA, costB, bundlePrice }) {
  const sellA = roundMoney(priceA);
  const sellB = roundMoney(priceB);
  const sum = roundMoney(sellA + sellB);
  const bundle = roundMoney(bundlePrice);
  const floorA = roundMoney(costA) > 0 ? roundMoney(costA) : sellA;
  const floorB = roundMoney(costB) > 0 ? roundMoney(costB) : sellB;
  const floor = roundMoney(floorA + floorB);
  if (!(bundle > 0) || !(sum > bundle)) {
    return { ok: false, error: 'The offer price has to be lower than the two selling prices added together.' };
  }
  if (bundle + 0.001 < floor) {
    return { ok: false, error: 'That offer is below the supplier cost. Raise the price so the order still covers both products.' };
  }
  return { ok: true, sum: sum.toFixed(2), bundle: bundle.toFixed(2), floor: floor.toFixed(2) };
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
  const supplierCost = parseFloat(p.cost || p.supplier_cost || p.base_price || 0);
  const sellingPrice = priceWithMargin(retailPrice, supplierCost);
  const suppliedComparePrice = parseFloat(p.compare_at_price || p.compare_price || 0);
  const comparePrice = Number.isFinite(suppliedComparePrice) && suppliedComparePrice > Number(sellingPrice)
    ? suppliedComparePrice.toFixed(2)
    : null;

  const title = p.name || p.title || 'Premium Product';
  let badge = 'new';
  if (p.is_trending || p.trending) badge = 'hot';
  else if (comparePrice) badge = 'sale';

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
    retail_price: sellingPrice,
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

function productMatchesQuery(product, query) {
  const tokens = String(query || '').toLowerCase().split(/\s+/).filter((token) => token.length >= 2);
  if (!tokens.length) return false;
  const hay = `${(product && product.title) || ''} ${(product && product.description) || ''} ${(product && product.category) || ''}`.toLowerCase();
  return tokens.every((token) => hay.includes(token));
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

function slugifyCategory(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function validCategorySlug(slug) {
  return /^[a-z0-9-]{2,40}$/.test(String(slug || '')) && !String(slug).startsWith('-') && !String(slug).endsWith('-');
}

function cleanIcon(value) {
  const icon = String(value || '').replace(/[<>]/g, '').trim();
  return icon ? icon.slice(0, 8) : '';
}

function publicDepartments(customRows) {
  const built = Object.entries(STORE_DEPARTMENTS).map(([key, dept]) => ({
    key,
    slug: dept.slug,
    title: dept.title,
    short: dept.short || dept.title,
    blurb: dept.blurb,
    icon: dept.icon || '🛍️',
    builtin: true
  }));
  const taken = new Set(built.map((dept) => dept.slug));
  const custom = (customRows || [])
    .filter((row) => row && row.slug && row.is_active !== false && !taken.has(String(row.slug).toLowerCase()))
    .map((row) => ({
      key: String(row.slug).toLowerCase(),
      slug: String(row.slug).toLowerCase(),
      title: row.title,
      short: row.short || row.title,
      blurb: row.blurb || '',
      icon: cleanIcon(row.icon) || '🛍️',
      builtin: false
    }));
  return built.concat(custom);
}

function categoryMatches(productCategory, filter) {
  const cat = String(productCategory || '').toLowerCase();
  const raw = String(filter || '').trim().toLowerCase();
  if (!raw || raw === 'all') return true;
  if (cat === raw) return true;
  const dept = departmentByQuery(filter);
  return Boolean(dept && (cat === dept.key.toLowerCase() || cat === dept.slug));
}

function categoryKeyFromSlug(slug) {
  const dept = departmentBySlug(slug) || departmentByQuery(slug);
  return dept ? dept.key : String(slug || '').toLowerCase();
}

function applyCatalogEdits(products, edits, categoryFilter, { includeSaved = false } = {}) {
  const hidden = new Set();
  const moved = new Map();
  (edits && edits.overrides || []).forEach((row) => {
    const id = String(row.zendrop_id || '');
    if (!id) return;
    if (row.is_hidden) hidden.add(id);
    if (row.category_slug) moved.set(id, categoryKeyFromSlug(row.category_slug));
  });
  const byId = new Map();
  (products || []).forEach((product) => {
    const id = String((product && (product.zendrop_id || product.id)) || '');
    if (!id || hidden.has(id)) return;
    const copy = { ...product };
    if (moved.has(id)) copy.category = moved.get(id);
    byId.set(id, copy);
  });
  if (includeSaved) {
    (edits && edits.saved || []).forEach((product) => {
      const id = String((product && (product.zendrop_id || product.id)) || '');
      if (!id || hidden.has(id)) return;
      const category = moved.get(id) || product.category;
      if (byId.has(id)) {
        byId.get(id).category = category;
        return;
      }
      byId.set(id, { ...product, category });
    });
  }
  return [...byId.values()].filter((product) => categoryMatches(product.category, categoryFilter));
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
    retail_price: priceWithMargin(Number.isFinite(retail) ? retail : 0, row.supplier_cost || 0),
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
  productMatchesQuery,
  categoryFilterIsTrusted,
  normalizeProduct,
  productSharePath,
  summarizeLane,
  scoreProduct,
  qualifiesForStore,
  deliveryLabel,
  productHandle,
  storeProductFromRow,
  roundMoney,
  clampMargin,
  setStoreMarginPercent,
  getStoreMarginPercent,
  priceWithMargin,
  bundlePriceAllowed,
  slugifyCategory,
  validCategorySlug,
  cleanIcon,
  publicDepartments,
  applyCatalogEdits,
  categoryKeyFromSlug
};
