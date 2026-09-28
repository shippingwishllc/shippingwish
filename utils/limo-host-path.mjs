/** Map a NYC Limo Wish hostname onto files under /nyclimowish.
 * Vercel serves public/login.html before host rewrites, so this runs first.
 */

const DIRECTORY_INDEX = new Set(['driver', 'passenger']);

export function isLimoHost(host) {
  const name = String(host || '').split(',')[0].trim().split(':')[0].toLowerCase();
  return name === 'nyclimowish.com' || name === 'www.nyclimowish.com' || name.endsWith('.nyclimowish.com');
}

export function limoRewritePath(pathname) {
  const path = String(pathname || '/');
  if (path === '/api' || path.startsWith('/api/') || path === '/uploads' || path.startsWith('/uploads/')) return null;
  if (path === '/nyclimowish' || path.startsWith('/nyclimowish/')) return null;
  if (path === '/' || path === '/index' || path === '/index.html') return '/nyclimowish/index.html';
  if (/\.[a-z0-9]+$/i.test(path)) return '/nyclimowish' + path;
  const clean = path.replace(/\/$/, '') || '/';
  const parts = clean.split('/').filter(Boolean);
  if (parts.length === 1 && DIRECTORY_INDEX.has(parts[0])) return `/nyclimowish/${parts[0]}/index.html`;
  return '/nyclimowish' + clean + '.html';
}
