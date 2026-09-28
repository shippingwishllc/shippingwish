(function () {
  const DEFAULT_GTM = 'GTM-55MF65H2';
  const DEFAULT_GA = 'G-LW66Y70PFE';

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

  function gaId(value) {
    const id = String(value || '').trim().toUpperCase();
    return /^G-[A-Z0-9]{4,20}$/.test(id) ? id : '';
  }

  function pixelId(value) {
    const id = String(value || '').replace(/\s/g, '');
    return /^\d{6,20}$/.test(id) ? id : '';
  }

  function insertScript(src) {
    const script = document.createElement('script');
    script.async = true;
    script.src = src;
    const first = document.getElementsByTagName('script')[0];
    if (first && first.parentNode) first.parentNode.insertBefore(script, first);
    else (document.head || document.documentElement).appendChild(script);
  }

  function installGtm(id) {
    const container = gtmId(id);
    if (!container || window.__swGtmId === container) return;
    window.__swGtmId = container;
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
    insertScript('https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(container));

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

  function installGa4(id) {
    const measurement = gaId(id);
    if (!measurement || window.__swGaId === measurement) return;
    window.__swGaId = measurement;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    insertScript('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(measurement));
    window.gtag('config', measurement);
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
      insertScript('https://connect.facebook.net/en_US/fbevents.js');
    }
    window.fbq('init', pixel);
    window.fbq('track', 'PageView');
  }

  function apply(settings) {
    if (isLoggedInShell()) return;
    if (!window.__swGtmId) installGtm((settings && settings.gtm_container_id) || DEFAULT_GTM);
    if (!window.__swGaId) installGa4((settings && settings.ga_measurement_id) || DEFAULT_GA);
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
