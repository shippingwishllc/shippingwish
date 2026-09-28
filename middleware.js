import { isLimoHost, limoRewritePath } from './utils/limo-host-path.mjs';

export const config = {
  matcher: '/:path*'
};

function pass() {
  return new Response(null, { headers: { 'x-middleware-next': '1' } });
}

export default function middleware(request) {
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || '';
  if (!isLimoHost(host)) return pass();

  const url = new URL(request.url);
  const dest = limoRewritePath(url.pathname);
  if (!dest) return pass();

  url.pathname = dest;
  return new Response(null, {
    headers: { 'x-middleware-rewrite': url.toString() }
  });
}
