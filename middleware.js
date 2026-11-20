import { isLimoHost, limoRewritePath } from './utils/limo-host-path.mjs';

export const config = {
  matcher: '/:path*'
};

// BuyWishOnline Geo-Firewall: ONLY USA, Canada, UK, Australia, and Europe (EEA/EFTA)
const BUYWISH_ALLOWED_COUNTRIES = new Set([
  'US', 'CA', 'GB', 'AU',
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU',
  'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
  'NO', 'CH', 'IS', 'LI'
]);

function pass() {
  return new Response(null, { headers: { 'x-middleware-next': '1' } });
}

function geoBlockedHtml(countryCode) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>BuyWishOnline — Regional Availability</title>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #F6F1E8; color: #14120F; display: grid; place-items: center; min-height: 100vh; padding: 24px; }
    .box { max-width: 480px; background: #FFFDF8; border: 1px solid #E5D7C3; border-radius: 18px; padding: 34px 28px; text-align: center; box-shadow: 0 20px 45px rgba(20,18,15,0.08); }
    .badge { display: inline-block; background: #14120F; color: #D4AF37; font-size: 11px; font-weight: 800; letter-spacing: 1.5px; padding: 6px 14px; border-radius: 999px; margin-bottom: 16px; }
    h1 { margin: 0 0 12px; font-size: 22px; }
    p { margin: 0 0 10px; color: #5C554D; font-size: 14px; line-height: 1.55; }
    .regions { margin-top: 16px; padding: 12px; background: #F6F1E8; border-radius: 10px; font-size: 12px; font-weight: 700; color: #14120F; }
  </style>
</head>
<body>
  <div class="box">
    <div class="badge">BUYWISHONLINE</div>
    <h1>Storefront Not Available in Your Region</h1>
    <p>For cardholder security and verified fulfillment, BuyWishOnline currently serves customers exclusively in our supported regions.</p>
    <div class="regions">Supported Regions: United States · Canada · United Kingdom · Australia · Europe</div>
    <p style="margin-top:14px; font-size:11px; color:#8C8277;">Detected Region Code: ${countryCode || 'UNKNOWN'}</p>
  </div>
</body>
</html>`;
}

export default function middleware(request) {
  const host = (request.headers.get('x-forwarded-host') || request.headers.get('host') || '').toLowerCase();
  const url = new URL(request.url);
  const path = url.pathname;

  if (host.includes('buywishonline.com')) {
    // 1. Always allow Store Admin, Superadmin SSO, Auth, and Stripe Webhooks from ANY location (so Owner is never locked out!)
    const isAdminOrAuthPath =
      path === '/admin' ||
      path === '/admin/' ||
      path.startsWith('/buywishonline/admin') ||
      path.startsWith('/api/superadmin') ||
      path === '/api/me' ||
      path === '/api/login' ||
      path === '/api/logout' ||
      path.startsWith('/api/buywish/admin') ||
      path === '/api/buywish/webhook' ||
      path === '/api/buywish/store-status';

    // Prevent Vercel cleanUrls static public/admin.html from shadowing BuyWishOnline Store Admin
    if (path === '/admin' || path === '/admin/') {
      url.pathname = '/buywishonline/admin.html';
      return new Response(null, {
        headers: { 'x-middleware-rewrite': url.toString() }
      });
    }

    if (isAdminOrAuthPath) return pass();

    // 2. Allow authenticated Owner/Admin cookie (sw_token) to preview storefront from anywhere
    const cookieHeader = request.headers.get('cookie') || '';
    const hasAdminSession = /\bsw_token=[^;\s]+/.test(cookieHeader);

    // 3. Enforce Geo-IP Firewall on public visitors (USA, Canada, UK, Australia, Europe only)
    const ipCountry = (request.headers.get('x-vercel-ip-country') || '').toUpperCase().trim();
    if (ipCountry && !hasAdminSession && !BUYWISH_ALLOWED_COUNTRIES.has(ipCountry)) {
      if (path.startsWith('/api/')) {
        return new Response(
          JSON.stringify({
            error: 'BuyWishOnline is currently available only in the USA, Canada, UK, Australia, and Europe.',
            code: 'GEO_RESTRICTED',
            region: ipCountry
          }),
          { status: 403, headers: { 'content-type': 'application/json; charset=utf-8' } }
        );
      }
      return new Response(geoBlockedHtml(ipCountry), {
        status: 451,
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }
      });
    }

    return pass();
  }

  if (!isLimoHost(host)) return pass();

  const dest = limoRewritePath(path);
  if (!dest) return pass();

  url.pathname = dest;
  return new Response(null, {
    headers: { 'x-middleware-rewrite': url.toString() }
  });
}
