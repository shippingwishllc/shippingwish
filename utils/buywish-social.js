const NETWORKS = {
  facebook: ['facebook.com', 'fb.com', 'fb.me'],
  instagram: ['instagram.com'],
  linkedin: ['linkedin.com'],
  tiktok: ['tiktok.com'],
  x: ['x.com', 'twitter.com']
};

function hostAllowed(hostname, hosts) {
  const host = String(hostname || '').toLowerCase().replace(/\.$/, '');
  return hosts.some((allowed) => host === allowed || host.endsWith('.' + allowed));
}

function cleanSocialUrl(value, network) {
  const hosts = NETWORKS[network];
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return '';
  let url;
  try {
    url = new URL(raw);
  } catch (err) {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  if (!hostAllowed(url.hostname, hosts)) return null;
  return url.toString();
}

function cleanSocialLinks(body) {
  const source = body || {};
  const links = {};
  const names = Object.keys(NETWORKS);
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    const cleaned = cleanSocialUrl(source[name], name);
    if (cleaned == null) {
      return { error: 'Use a full https link for ' + name + ', for example https://www.instagram.com/buywishonline.' };
    }
    links[name] = cleaned;
  }
  return { links };
}

module.exports = { NETWORKS, cleanSocialUrl, cleanSocialLinks };
