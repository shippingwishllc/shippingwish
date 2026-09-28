const SHOP = 'https://www.buywishonline.com';

function xmlEscape(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function csvEscape(value) {
  return `"${String(value == null ? '' : value).replace(/"/g, '""')}"`;
}

function cleanText(value, max) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function httpsImage(value) {
  const url = String(value || '').trim();
  return /^https:\/\//i.test(url) ? url : '';
}

function metaCatalogItems(rows) {
  return (rows || []).map((row) => {
    const id = String(row.zendrop_id || row.id || '').replace(/^p-/i, '');
    if (!/^\d+$/.test(id)) return null;
    const images = []
      .concat(row.image_url || [])
      .concat(Array.isArray(row.images) ? row.images : [])
      .map(httpsImage)
      .filter(Boolean);
    const uniqueImages = [...new Set(images)];
    if (!uniqueImages.length) return null;
    const price = Number(row.retail_price);
    if (!Number.isFinite(price) || price <= 0) return null;
    const handle = row.handle || `p-${id}`;
    const title = cleanText(row.title, 150);
    if (title.length < 2) return null;
    const description = cleanText(row.description, 5000) || title;
    const compare = Number(row.compare_price);
    const onSale = Number.isFinite(compare) && compare > price;
    return {
      id,
      title,
      description,
      availability: row.is_active === false || row.in_stock === false ? 'out of stock' : 'in stock',
      condition: 'new',
      price: `${(onSale ? compare : price).toFixed(2)} USD`,
      sale_price: onSale ? `${price.toFixed(2)} USD` : '',
      link: `${SHOP}/products/${handle}`,
      image_link: uniqueImages[0],
      additional_image_link: uniqueImages.slice(1, 10),
      brand: 'BuyWishOnline'
    };
  }).filter(Boolean);
}

function renderMetaCatalogXml(items) {
  const body = (items || []).map((item) => `    <item>
      <g:id>${xmlEscape(item.id)}</g:id>
      <g:title>${xmlEscape(item.title)}</g:title>
      <g:description>${xmlEscape(item.description)}</g:description>
      <g:availability>${xmlEscape(item.availability)}</g:availability>
      <g:condition>new</g:condition>
      <g:price>${xmlEscape(item.price)}</g:price>
      ${item.sale_price ? `<g:sale_price>${xmlEscape(item.sale_price)}</g:sale_price>` : ''}
      <g:link>${xmlEscape(item.link)}</g:link>
      <g:image_link>${xmlEscape(item.image_link)}</g:image_link>
      ${item.additional_image_link.map((url) => `<g:additional_image_link>${xmlEscape(url)}</g:additional_image_link>`).join('\n      ')}
      <g:brand>BuyWishOnline</g:brand>
      <g:identifier_exists>no</g:identifier_exists>
    </item>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>BuyWishOnline</title>
    <link>${SHOP}</link>
    <description>Products sold on BuyWishOnline.</description>
${body}
  </channel>
</rss>`;
}

function renderMetaCatalogCsv(items) {
  const header = ['id', 'title', 'description', 'availability', 'condition', 'price', 'link', 'image_link', 'additional_image_link', 'brand'];
  const lines = (items || []).map((item) => [
    item.id,
    item.title,
    item.description,
    item.availability,
    item.condition,
    item.price,
    item.link,
    item.image_link,
    item.additional_image_link.join(','),
    item.brand
  ].map(csvEscape).join(','));
  return `${header.join(',')}\n${lines.join('\n')}\n`;
}

module.exports = { metaCatalogItems, renderMetaCatalogXml, renderMetaCatalogCsv };
