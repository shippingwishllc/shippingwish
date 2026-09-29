const BRAND_MAILBOXES = [
  { id: 'shippingwish', domain: 'shippingwish.com', label: 'Shipping Wish', legacy: true },
  { id: 'loadsnexus', domain: 'loadsnexus.com', label: 'LoadsNexus', legacy: false },
  { id: 'nyclimowish', domain: 'nyclimowish.com', label: 'NYC Limo Wish', legacy: false },
  { id: 'buywish', domain: 'buywishonline.com', label: 'BuyWish', legacy: false }
];

const FOLDERS = ['inbox', 'sent', 'draft', 'spam', 'trash', 'all'];

function knownMailbox(domain) {
  const value = String(domain || '').toLowerCase().trim();
  return BRAND_MAILBOXES.find((brand) => brand.domain === value) || null;
}

function hostsOf(address) {
  const matches = String(address || '').toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g) || [];
  return matches.map((email) => email.split('@')[1]);
}

function matchesMailbox(address, domain) {
  const brand = knownMailbox(domain);
  if (!brand) return true;
  const hosts = hostsOf(address);
  if (hosts.includes(brand.domain)) return true;
  if (!hosts.length && brand.legacy) return true;
  return false;
}

function byNewest(rows) {
  return rows.slice().sort((a, b) => new Date(b.created_at || b.updated_at || 0) - new Date(a.created_at || a.updated_at || 0));
}

function filterBrandMessages({ inboundRows, outboundRows, domain, folder }) {
  const inbound = inboundRows || [];
  const outbound = outboundRows || [];
  const active = knownMailbox(domain);
  const box = active ? active.domain : '';
  const keepIn = (row) => !box || matchesMailbox(row.to_email, box);
  const keepOut = (row) => !box || matchesMailbox(row.from_email, box);

  if (folder === 'spam') {
    return byNewest(inbound.filter((row) => row.is_spam && !row.deleted_at && keepIn(row)));
  }
  if (folder === 'trash') {
    return byNewest(inbound.filter((row) => row.deleted_at && keepIn(row)));
  }
  if (folder === 'sent') {
    return byNewest(outbound.filter(keepOut));
  }
  const inbox = inbound.filter((row) => !row.is_spam && !row.deleted_at && keepIn(row));
  if (folder === 'all') return byNewest(inbox.concat(outbound.filter(keepOut)));
  return byNewest(inbox);
}

function normalizeFolder(folder, direction) {
  const value = String(folder || '').toLowerCase().trim();
  if (FOLDERS.includes(value)) return value;
  const dir = String(direction || '').toLowerCase().trim();
  if (dir === 'outbound') return 'sent';
  if (dir === 'all') return 'all';
  if (dir === 'spam' || dir === 'trash' || dir === 'draft') return dir;
  return 'inbox';
}

module.exports = {
  BRAND_MAILBOXES,
  FOLDERS,
  knownMailbox,
  matchesMailbox,
  filterBrandMessages,
  normalizeFolder
};
