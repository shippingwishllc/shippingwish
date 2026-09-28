// From addresses only. Resend API keys stay in env — never commit keys.
// One sending key per Resend account covers every mailbox on that verified domain:
//   shippingwish.com  → RESEND_API_KEY
//   loadsnexus.com    → RESEND_LOADSNEXUS_API_KEY
//   nyclimowish.com   → RESEND_NYCLIMOWISH_API_KEY
//   buywishonline.com → RESEND_BUYWISHONLINE_API_KEY

const SHIPPINGWISH = {
  operations: 'Shipping Wish Operations <operations@shippingwish.com>',
  dispatch: 'Shipping Wish Dispatch <dispatch@shippingwish.com>',
  billing: 'Shipping Wish Billing <billing@shippingwish.com>',
  support: 'Shipping Wish Support <support@shippingwish.com>',
  noreply: 'Shipping Wish LLC <noreply@shippingwish.com>',
  info: 'Shipping Wish LLC <info@shippingwish.com>'
};

const LOADSNEXUS = {
  alerts: 'LoadsNexus Alerts <alerts@loadsnexus.com>',
  billing: 'LoadsNexus Billing <billing@loadsnexus.com>',
  support: 'LoadsNexus Support <support@loadsnexus.com>',
  deals: 'LoadsNexus Deals <deals@loadsnexus.com>',
  auth: 'LoadsNexus Security <auth@loadsnexus.com>',
  dispatch: 'LoadsNexus Dispatch <dispatch@loadsnexus.com>'
};

const NYCLIMOWISH = {
  info: 'NYC Limo Wish <info@nyclimowish.com>',
  bookings: 'NYC Limo Wish Bookings <bookings@nyclimowish.com>',
  support: 'NYC Limo Wish Support <support@nyclimowish.com>',
  billing: 'NYC Limo Wish Billing <billing@nyclimowish.com>'
};

const BUYWISHONLINE = {
  support: 'BuyWishOnline Support <support@buywishonline.com>',
  orders: 'BuyWishOnline Orders <orders@buywishonline.com>',
  billing: 'BuyWishOnline Billing <billing@buywishonline.com>',
  alerts: 'BuyWishOnline Alerts <alerts@buywishonline.com>'
};

const BRANDS = {
  shippingwish: SHIPPINGWISH,
  loadsnexus: LOADSNEXUS,
  nyclimowish: NYCLIMOWISH,
  buywishonline: BUYWISHONLINE
};

const DEFAULT_MAILBOX = {
  shippingwish: 'operations',
  loadsnexus: 'support',
  nyclimowish: 'info',
  buywishonline: 'support'
};

const BRAND_DOMAINS = {
  shippingwish: 'shippingwish.com',
  loadsnexus: 'loadsnexus.com',
  nyclimowish: 'nyclimowish.com',
  buywishonline: 'buywishonline.com'
};

function addressOf(from) {
  const m = String(from || '').match(/<([^>]+)>/);
  return (m ? m[1] : String(from || '')).trim().toLowerCase();
}

function getBrandSender(brand, mailbox) {
  const table = BRANDS[brand];
  if (!table) return SHIPPINGWISH.operations;
  const key = mailbox && table[mailbox] ? mailbox : DEFAULT_MAILBOX[brand];
  return table[key] || SHIPPINGWISH.operations;
}

function replyAddress(brand, mailbox) {
  return addressOf(getBrandSender(brand, mailbox));
}

function brandFromAddress(from) {
  const addr = addressOf(from);
  if (addr.endsWith('@loadsnexus.com')) return 'loadsnexus';
  if (addr.endsWith('@nyclimowish.com')) return 'nyclimowish';
  if (addr.endsWith('@buywishonline.com')) return 'buywishonline';
  return 'shippingwish';
}

function resolveKnownFrom(from) {
  const addr = addressOf(from);
  if (!addr) return null;
  for (const table of Object.values(BRANDS)) {
    for (const value of Object.values(table)) {
      if (addressOf(value) === addr) return value;
    }
  }
  return null;
}

function isKnownMailbox(from) {
  return Boolean(resolveKnownFrom(from));
}

function inboxFromOptions() {
  return [
    SHIPPINGWISH.operations,
    SHIPPINGWISH.dispatch,
    SHIPPINGWISH.billing,
    SHIPPINGWISH.support,
    LOADSNEXUS.dispatch,
    LOADSNEXUS.deals,
    LOADSNEXUS.support,
    LOADSNEXUS.billing,
    LOADSNEXUS.alerts,
    NYCLIMOWISH.info,
    NYCLIMOWISH.bookings,
    NYCLIMOWISH.support,
    NYCLIMOWISH.billing,
    BUYWISHONLINE.support,
    BUYWISHONLINE.orders,
    BUYWISHONLINE.billing
  ];
}

module.exports = {
  BRANDS,
  BRAND_DOMAINS,
  SHIPPINGWISH,
  LOADSNEXUS,
  NYCLIMOWISH,
  BUYWISHONLINE,
  getBrandSender,
  replyAddress,
  addressOf,
  brandFromAddress,
  resolveKnownFrom,
  isKnownMailbox,
  inboxFromOptions
};
