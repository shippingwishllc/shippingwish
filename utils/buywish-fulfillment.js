/**
 * Maps a paid BuyWish order onto a Zendrop order-creation tool.
 * The tool must be advertised by tools/list. This module never invents a tool name.
 */

const ORDER_TOOL_RE = /^(create|place|submit|record|fulfill)_[a-z0-9_]*order$|^order_(create|place|submit|fulfill)$/i;
const TOOL_PRIORITY = ['create_order', 'place_order', 'submit_order', 'create_store_order', 'place_store_order', 'fulfill_order'];

function isOrderCreateTool(tool) {
  const name = String(tool && tool.name || '');
  if (!name) return false;
  if (/^(get|list|search|track|update|cancel|delete|import)_/i.test(name)) return false;
  return ORDER_TOOL_RE.test(name);
}

function selectOrderTool(listResult) {
  const tools = Array.isArray(listResult)
    ? listResult
    : (listResult && (listResult.tools || listResult.items)) || [];
  const matches = tools.filter(isOrderCreateTool);
  if (!matches.length) return null;
  matches.sort((a, b) => {
    const ai = TOOL_PRIORITY.indexOf(String(a.name));
    const bi = TOOL_PRIORITY.indexOf(String(b.name));
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  return matches[0];
}

function schemaProperties(tool) {
  const schema = tool && (tool.inputSchema || tool.input_schema || tool.parameters) || {};
  return {
    properties: schema.properties && typeof schema.properties === 'object' ? schema.properties : {},
    required: Array.isArray(schema.required) ? schema.required : []
  };
}

function splitName(full) {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
  return {
    first: parts[0] || '',
    last: parts.slice(1).join(' ') || parts[0] || ''
  };
}

function buildOrderArguments(tool, order) {
  const { properties, required } = schemaProperties(tool);
  const propertyNames = Object.keys(properties);
  if (!propertyNames.length) {
    return { ok: false, manual: true, error: 'Zendrop order tool has no published input schema.' };
  }

  const items = Array.isArray(order.items) ? order.items : [];
  const first = items[0] || {};
  const names = splitName(order.customer_name);
  const country = String(order.shipping_country || '').toUpperCase();
  const values = {
    product_id: first.product_id,
    quantity: first.quantity,
    qty: first.quantity,
    country,
    country_code: country,
    customer_name: order.customer_name,
    name: order.customer_name,
    first_name: names.first,
    last_name: names.last,
    email: order.customer_email,
    customer_email: order.customer_email,
    phone: order.customer_phone || '',
    customer_phone: order.customer_phone || '',
    address: order.shipping_address,
    address1: order.shipping_address,
    address_1: order.shipping_address,
    line1: order.shipping_address,
    street: order.shipping_address,
    address2: order.shipping_line2 || '',
    line2: order.shipping_line2 || '',
    city: order.shipping_city,
    state: order.shipping_state,
    province: order.shipping_state,
    zip: order.shipping_postal,
    postal_code: order.shipping_postal,
    postcode: order.shipping_postal,
    external_order_id: order.order_number,
    external_id: order.order_number,
    store_order_id: order.order_number,
    order_number: order.order_number,
    idempotency_key: order.order_number,
    currency: order.currency || 'USD',
    confirm: true,
    confirmed: true,
    note: [order.customer_note, `BuyWishOnline ${order.order_number}`].filter(Boolean).join(' — ').slice(0, 500),
    items: items.map((item) => ({
      product_id: item.product_id,
      quantity: item.quantity,
      title: item.title
    })),
    line_items: items.map((item) => ({
      product_id: item.product_id,
      quantity: item.quantity,
      title: item.title
    }))
  };

  const acceptsLines = propertyNames.some((name) => name === 'items' || name === 'line_items');
  if (items.length !== 1 && !acceptsLines) {
    return {
      ok: false,
      manual: true,
      error: 'This Zendrop tool accepts one product per call, and the store order has more than one item.'
    };
  }

  const args = {};
  const missing = [];
  propertyNames.forEach((name) => {
    if (!Object.prototype.hasOwnProperty.call(values, name)) return;
    const value = values[name];
    if (value == null || value === '') return;
    args[name] = value;
  });

  required.forEach((name) => {
    if (args[name] == null || args[name] === '') missing.push(name);
  });
  if (missing.length) {
    return {
      ok: false,
      manual: true,
      error: `Zendrop requires ${missing.join(', ')} before this order can be sent.`
    };
  }

  if (!Object.keys(args).length) {
    return { ok: false, manual: true, error: 'No order fields matched the Zendrop tool schema.' };
  }
  return { ok: true, args, toolName: tool.name };
}

function extractOrderId(result) {
  if (!result || typeof result !== 'object') return null;
  const directKeys = ['order_id', 'zendrop_order_id', 'id', 'supplier_order_id'];
  for (const key of directKeys) {
    if (result[key] != null && String(result[key]).trim()) return String(result[key]).trim();
  }
  if (result.order && typeof result.order === 'object') {
    const nested = extractOrderId(result.order);
    if (nested) return nested;
  }
  return null;
}

module.exports = {
  isOrderCreateTool,
  selectOrderTool,
  buildOrderArguments,
  extractOrderId
};
