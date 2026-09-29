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
  const rows = orderItems(order).map((item) => `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #efeae4;font-size:15px;color:#1a1a2e;">${escapeHtml(item.title)}</td>
      <td style="padding:12px 0 12px 12px;border-bottom:1px solid #efeae4;font-size:15px;color:#6b6570;text-align:right;white-space:nowrap;">× ${escapeHtml(item.quantity)}</td>
    </tr>`).join('');
  const ship = shipLines(order).map((line) => escapeHtml(line)).join('<br>');
  const note = String(order.customer_note || '').trim();
  const noteHtml = note
    ? `<tr><td style="padding:8px 28px 0;font-size:13px;line-height:1.5;color:#6b6570;"><strong style="color:#1a1a2e;">Note for delivery.</strong> ${escapeHtml(note)}</td></tr>`
    : '';
  const total = escapeHtml(money(order));
  const subject = `Thank you for shopping with BuyWishOnline — ${order.order_number}`;
  const text = [
    `Thank you for shopping with BuyWishOnline, ${order.customer_name || 'there'}.`,
    'Premium products, delivered with care.',
    '',
    `Your order ${order.order_number} is confirmed. We are getting it ready.`,
    `Total: ${money(order)}`,
    '',
    'Items:',
    ...orderItems(order).map((item) => `- ${item.quantity} × ${item.title}`),
    '',
    'Ship to:',
    ...shipLines(order),
    note ? `Note for delivery: ${note}` : '',
    '',
    'We will email you again when it ships.',
    'Visit the shop: https://www.buywishonline.com',
    'Questions: support@buywishonline.com',
    'Shipping Wish LLC'
  ].filter((line) => line !== '').join('\n');
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f6f3ef;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Thank you for shopping with BuyWishOnline. Order ${number} is confirmed.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f3ef;padding:28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden;">
          <tr>
            <td style="background:#1a1a2e;padding:28px 32px 26px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="width:36px;height:36px;background:#e94560;border-radius:10px;text-align:center;color:#ffffff;font-family:Helvetica,Arial,sans-serif;font-size:18px;font-weight:700;">B</td>
                  <td style="padding-left:12px;font-family:Helvetica,Arial,sans-serif;">
                    <div style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.02em;">BuyWishOnline</div>
                    <div style="color:#f5a623;font-size:12px;letter-spacing:0.04em;padding-top:2px;">Premium products, delivered with care</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 8px;font-family:Helvetica,Arial,sans-serif;">
              <div style="color:#e94560;font-size:12px;font-weight:700;letter-spacing:0.14em;">THANK YOU</div>
              <h1 style="margin:8px 0 0;font-size:28px;line-height:1.2;color:#1a1a2e;font-weight:700;">Thank you for shopping with us</h1>
              <p style="margin:14px 0 0;font-size:16px;line-height:1.55;color:#3d3945;">Hi ${name}, your order is confirmed. We are glad you chose BuyWishOnline, and we are getting it ready now.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 32px 0;font-family:Helvetica,Arial,sans-serif;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf7f4;border-radius:14px;">
                <tr>
                  <td style="padding:16px 18px;font-size:12px;letter-spacing:0.08em;color:#6b6570;">ORDER</td>
                  <td style="padding:16px 18px;text-align:right;font-size:14px;font-weight:700;color:#1a1a2e;">${number}</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 0;font-family:Helvetica,Arial,sans-serif;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 0;font-family:Helvetica,Arial,sans-serif;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size:15px;color:#1a1a2e;font-weight:700;">Total</td>
                  <td style="text-align:right;font-size:20px;color:#e94560;font-weight:700;">${total}</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:22px 32px 0;font-family:Helvetica,Arial,sans-serif;">
              <div style="font-size:12px;letter-spacing:0.08em;color:#6b6570;">SHIP TO</div>
              <div style="margin-top:6px;font-size:15px;line-height:1.5;color:#1a1a2e;">${ship}</div>
            </td>
          </tr>
          ${noteHtml}
          <tr>
            <td style="padding:26px 32px 8px;font-family:Helvetica,Arial,sans-serif;">
              <a href="https://www.buywishonline.com" style="display:inline-block;background:#e94560;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 22px;border-radius:10px;">Continue shopping</a>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 28px;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#6b6570;">We will email you again when it ships. Questions are welcome at <a href="mailto:support@buywishonline.com" style="color:#e94560;text-decoration:none;">support@buywishonline.com</a>.</td>
          </tr>
          <tr>
            <td style="background:#1a1a2e;padding:18px 32px;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#c8c4d4;">Wishes, on their way.<br>Shipping Wish LLC · <a href="https://www.buywishonline.com" style="color:#ffffff;text-decoration:none;">buywishonline.com</a></td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  return { subject, html, text };
}

function orderConfirmationSms(order) {
  return `Thank you for shopping with BuyWishOnline. Order ${order.order_number} is confirmed. Total ${money(order)}. https://www.buywishonline.com`;
}

module.exports = {
  orderSmsPhone,
  orderConfirmationEmail,
  orderConfirmationSms
};
