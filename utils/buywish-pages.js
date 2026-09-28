/**
 * Server-rendered BuyWish pages for search engines.
 * Product copy comes from the synced catalog. Empty collections are not indexed.
 */

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : '0.00';
}

const SHELL_CSS = `
  :root { --ink:#1a1a2e; --ivory:#f7f7f9; --gold:#e94560; --paper:#ffffff; --muted:#6b7280; }
  * { box-sizing:border-box; }
  body { margin:0; font-family:Inter,sans-serif; background:var(--ivory); color:var(--ink); }
  a { color:inherit; }
  header, main, footer { max-width:1080px; margin:0 auto; padding:24px; }
  header { display:flex; justify-content:space-between; align-items:center; }
  .brand { font-size:22px; font-weight:800; letter-spacing:-0.03em; text-decoration:none; }
  nav a { margin-left:18px; text-decoration:none; font-size:14px; letter-spacing:.08em; text-transform:uppercase; }
  h1 { font-weight:900; font-size:40px; line-height:1.1; margin:12px 0; letter-spacing:-0.03em; }
  .muted { color:var(--muted); }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:18px; }
  .card { background:var(--paper); border:1px solid #eadfce; text-decoration:none; display:block; }
  .card img { width:100%; height:220px; object-fit:cover; background:#efe8dc; }
  .card div { padding:14px; }
  .price { font-weight:600; }
  .product { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:32px; }
  .product img { width:100%; background:#efe8dc; }
  button, .btn { background:var(--ink); color:#fff; border:0; padding:14px 22px; letter-spacing:.08em; text-transform:uppercase; text-decoration:none; display:inline-block; cursor:pointer; }
  @media (max-width:720px) { .product { grid-template-columns:1fr; } h1 { font-size:36px; } }
`;

function head({ title, description, canonical, image, jsonLd, robots }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta name="robots" content="${esc(robots || 'index, follow')}">
  <link rel="canonical" href="${esc(canonical)}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${esc(canonical)}">
  ${image ? `<meta property="og:image" content="${esc(image)}">` : ''}
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>${SHELL_CSS}</style>
  ${jsonLd ? `<script type="application/ld+json">${jsonLd}</script>` : ''}
</head>
<body>
<header>
  <a class="brand" href="/">BuyWishOnline</a>
  <nav>
    <a href="/">Shop</a>
    <a href="/account">Account</a>
    <a href="/?track=1">Track</a>
  </nav>
</header>`;
}

function foot() {
  return `<footer class="muted">
  <p>BuyWishOnline is operated by Shipping Wish LLC. Orders for the USA, Canada, and the United Kingdom are fulfilled through Zendrop after payment.</p>
  <p><a href="/about">About</a> · <a href="/contact">Contact</a> · <a href="/privacy-policy">Privacy</a> · <a href="/terms">Terms</a></p>
</footer>
</body></html>`;
}

function renderProductPage(product) {
  const canonical = `https://www.buywishonline.com/products/${product.handle}`;
  const description = (product.description || `${product.title} from BuyWishOnline.`).slice(0, 160);
  const price = money(product.retail_price);
  const json = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    description: product.description || product.title,
    image: product.images && product.images.length ? product.images : undefined,
    sku: String(product.zendrop_id || product.handle),
    brand: { '@type': 'Brand', name: 'BuyWishOnline' },
    offers: {
      '@type': 'Offer',
      url: canonical,
      priceCurrency: 'USD',
      price,
      availability: product.in_stock === false ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
      areaServed: ['US', 'CA', 'GB']
    }
  }).replace(/</g, '\\u003c');
  const image = product.image_url || (product.images && product.images[0]) || '';
  return `${head({
    title: `${product.title} | BuyWishOnline`,
    description,
    canonical,
    image,
    jsonLd: json
  })}
<main>
  <p class="muted">${esc(product.category || 'Featured')} · Ships to USA, Canada &amp; UK</p>
  <div class="product">
    <div>${image ? `<img src="${esc(image)}" alt="${esc(product.title)}">` : ''}</div>
    <div>
      <h1>${esc(product.title)}</h1>
      <p class="price">$${esc(price)} USD</p>
      <p>${esc(product.delivery || 'Shipping time is confirmed for USA, Canada, and the United Kingdom before this piece is stocked.')}</p>
      <p>${esc(product.description || '')}</p>
      ${(product.features || []).length ? `<ul>${product.features.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
      <p><a class="btn" href="/?product=${encodeURIComponent(product.id)}">Add to bag</a></p>
    </div>
  </div>
</main>
${foot()}`;
}

function renderCollectionPage(category, products) {
  const slug = String(category || 'featured').toLowerCase();
  const canonical = `https://www.buywishonline.com/collections/${encodeURIComponent(slug)}`;
  const title = `${category} | BuyWishOnline`;
  const description = `Shop ${category} pieces that Zendrop can ship to the USA, Canada, and the United Kingdom.`;
  const cards = products.map((p) => {
    const img = p.image_url || (p.images && p.images[0]) || '';
    return `<a class="card" href="/products/${esc(p.handle)}">
      ${img ? `<img src="${esc(img)}" alt="${esc(p.title)}">` : ''}
      <div><strong>${esc(p.title)}</strong><div class="price">$${esc(money(p.retail_price))}</div></div>
    </a>`;
  }).join('');
  return `${head({
    title,
    description,
    canonical,
    robots: products.length ? 'index, follow' : 'noindex, follow'
  })}
<main>
  <p class="muted">Collection</p>
  <h1>${esc(category)}</h1>
  <p>Pieces in this edit have a Zendrop shipping quote for the USA, Canada, and the United Kingdom, with USA delivery quoted at 14 days or faster.</p>
  <div class="grid">${cards || '<p>This collection is being stocked. Check back after the next catalog sync.</p>'}</div>
</main>
${foot()}`;
}

function renderSitemap(urls) {
  const body = urls.map((url) => `  <url><loc>${esc(url.loc)}</loc>${url.lastmod ? `<lastmod>${esc(url.lastmod)}</lastmod>` : ''}<changefreq>${esc(url.changefreq || 'weekly')}</changefreq><priority>${esc(url.priority || '0.6')}</priority></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>`;
}

module.exports = { esc, renderProductPage, renderCollectionPage, renderSitemap };
