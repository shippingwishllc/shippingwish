(function () {
  const DEFAULT_GTM = 'GTM-55MF65H2';

  function isOtherBrand() {
    const h = String(location.hostname || '').toLowerCase();
    return h.includes('loadsnexus') || h.includes('nyclimo') || h.includes('buywish');
  }

  function isLoggedInShell() {
    return !!(document.querySelector('.app-shell') || document.querySelector('.auth-wrapper'));
  }

  function gtmId(value) {
    const id = String(value || '').trim().toUpperCase();
    return /^GTM-[A-Z0-9]+$/.test(id) ? id : '';
  }

  function pixelId(value) {
    const id = String(value || '').replace(/\s/g, '');
    return /^\d{6,20}$/.test(id) ? id : '';
  }

  function installGtm(id) {
    const container = gtmId(id);
    if (!container || window.__swGtmId === container) return;
    window.__swGtmId = container;
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
    const first = document.getElementsByTagName('script')[0];
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(container);
    if (first && first.parentNode) first.parentNode.insertBefore(script, first);
    else (document.head || document.documentElement).appendChild(script);

    const placeNoscript = () => {
      if (!document.body || document.getElementById('sw-gtm-noscript')) return;
      const ns = document.createElement('noscript');
      ns.id = 'sw-gtm-noscript';
      ns.innerHTML = '<iframe src="https://www.googletagmanager.com/ns.html?id=' +
        encodeURIComponent(container) +
        '" height="0" width="0" style="display:none;visibility:hidden"></iframe>';
      document.body.insertBefore(ns, document.body.firstChild);
    };
    if (document.body) placeNoscript();
    else document.addEventListener('DOMContentLoaded', placeNoscript);
  }

  function installFacebookPixel(id) {
    const pixel = pixelId(id);
    if (!pixel || window.__swFbPixelId === pixel) return;
    window.__swFbPixelId = pixel;
    if (!window.fbq) {
      const fbq = window.fbq = function () {
        fbq.callMethod ? fbq.callMethod.apply(fbq, arguments) : fbq.queue.push(arguments);
      };
      if (!window._fbq) window._fbq = fbq;
      fbq.push = fbq;
      fbq.loaded = true;
      fbq.version = '2.0';
      fbq.queue = [];
      const script = document.createElement('script');
      script.async = true;
      script.src = 'https://connect.facebook.net/en_US/fbevents.js';
      const first = document.getElementsByTagName('script')[0];
      if (first && first.parentNode) first.parentNode.insertBefore(script, first);
      else (document.head || document.documentElement).appendChild(script);
    }
    window.fbq('init', pixel);
    window.fbq('track', 'PageView');
  }

  function apply(settings) {
    if (isLoggedInShell()) return;
    if (!window.__swGtmId) installGtm((settings && settings.gtm_container_id) || DEFAULT_GTM);
    if (settings && settings.facebook_pixel_id) installFacebookPixel(settings.facebook_pixel_id);
  }

  if (isOtherBrand()) return;

  const fallback = setTimeout(() => apply(), 400);
  fetch('/api/settings', { credentials: 'same-origin' })
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      clearTimeout(fallback);
      apply(data && data.settings);
    })
    .catch(() => {
      clearTimeout(fallback);
      apply();
    });
})();
