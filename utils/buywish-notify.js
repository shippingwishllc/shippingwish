const { normalizePhone } = require('./sms');

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function orderItems(order) {
  const raw = order && order.items;
  const list = Array.isArray(raw) ? raw : [];
  return list.map((item) => ({
    title: String(item.title || 'Item').slice(0, 180),
    quantity: Number(item.quantity) || 1
  }));
}

function money(order) {
  const amount = Number(order.total_amount);
  const shown = Number.isFinite(amount) ? amount.toFixed(2) : String(order.total_amount || '');
  return `${order.currency || 'USD'} ${shown}`;
}

function shipLines(order) {
  return [
    order.shipping_address,
    [order.shipping_city, order.shipping_state, order.shipping_postal].filter(Boolean).join(', '),
    order.shipping_country
  ].filter(Boolean);
}

function orderSmsPhone(phone, country) {
  const raw = String(phone || '').trim();
  if (!raw) return '';
  if (raw.startsWith('+')) return normalizePhone(raw);
  const digits = raw.replace(/\D/g, '');
  const code = String(country || '').toUpperCase();
  if (code === 'GB') {
    if (digits.startsWith('0')) return normalizePhone('+44' + digits.slice(1));
    if (digits.startsWith('44')) return normalizePhone('+' + digits);
  }
  return normalizePhone(raw);
}

function orderConfirmationEmail(order) {
  const number = escapeHtml(order.order_number);
  const name = escapeHtml(order.customer_name || 'there');
  const items = orderItems(order).map((item) => `<li>${escapeHtml(item.quantity)} × ${escapeHtml(item.title)}</li>`).join('');
  const ship = shipLines(order).map((line) => escapeHtml(line)).join('<br>');
  const note = String(order.customer_note || '').trim();
  const noteHtml = note ? `<p><strong>Instructions:</strong> ${escapeHtml(note)}</p>` : '';
  const total = escapeHtml(money(order));
  const subject = `Your BuyWishOnline order ${order.order_number}`;
  const text = [
    `Hi ${order.customer_name || 'there'},`,
    '',
    `Your BuyWishOnline order ${order.order_number} is confirmed.`,
    `Total: ${money(order)}`,
    '',
    'Items:',
    ...orderItems(order).map((item) => `- ${item.quantity} × ${item.title}`),
    '',
    'Ship to:',
    ...shipLines(order),
    note ? `Instructions: ${note}` : '',
    '',
    'Track it any time at https://www.buywishonline.com',
    'Questions: support@buywishonline.com'
  ].filter((line) => line !== '').join('\n');
  const html = `
    <div style="font-family:Arial,sans-serif;color:#14120f;line-height:1.5">
      <p>Hi ${name},</p>
      <p>Your BuyWishOnline order <strong>${number}</strong> is confirmed.</p>
      <p><strong>Total:</strong> ${total}</p>
      <ul>${items}</ul>
      <p><strong>Ship to</strong><br>${ship}</p>
      ${noteHtml}
      <p>Track it any time at <a href="https://www.buywishonline.com">buywishonline.com</a>.</p>
      <p>Questions: <a href="mailto:support@buywishonline.com">support@buywishonline.com</a></p>
    </div>`;
  return { subject, html, text };
}

function orderConfirmationSms(order) {
  return `BuyWishOnline: order ${order.order_number} is confirmed. Total ${money(order)}. Track it at https://www.buywishonline.com`;
}

module.exports = {
  orderSmsPhone,
  orderConfirmationEmail,
  orderConfirmationSms
};
