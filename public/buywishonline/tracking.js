(function () {
  const pending = [];
  let ready = false;

  function safeMeta(value) {
    const id = String(value || '').trim();
    return /^\d{6,20}$/.test(id) ? id : '';
  }

  function safeGoogle(value) {
    const id = String(value || '').trim().toUpperCase();
    if (/^G-[A-Z0-9]{4,20}$/.test(id)) return id;
    if (/^AW-\d{6,20}$/.test(id)) return id;
    if (/^GTM-[A-Z0-9]{4,12}$/.test(id)) return id;
    return '';
  }

  function installMeta(id) {
    if (window.fbq || !id) return;
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(script);
    const queue = window.fbq = function () {
      queue.callMethod ? queue.callMethod.apply(queue, arguments) : queue.queue.push(arguments);
    };
    if (!window._fbq) window._fbq = queue;
    queue.push = queue;
    queue.loaded = true;
    queue.version = '2.0';
    queue.queue = [];
    queue('init', id);
    queue('track', 'PageView');
  }

  function gtmPresent(id) {
    const nodes = document.getElementsByTagName('script');
    for (let i = 0; i < nodes.length; i++) {
      const src = nodes[i].src || '';
      if (src.indexOf('googletagmanager.com/gtm.js') !== -1 && src.indexOf(id) !== -1) return true;
    }
    return false;
  }

  function installGoogle(id) {
    if (!id) return;
    if (id.indexOf('GTM-') === 0 && gtmPresent(id)) {
      window.bwoGoogleInstalled = window.bwoGoogleInstalled || id;
      return;
    }
    if (window.bwoGoogleInstalled) return;
    window.bwoGoogleInstalled = id;
    if (id.indexOf('GTM-') === 0) {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
      const script = document.createElement('script');
      script.async = true;
      script.src = 'https://www.googletagmanager.com/gtm.js?id=' + id;
      document.head.appendChild(script);
      return;
    }
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
    document.head.appendChild(script);
    window.gtag('config', id);
  }

  function money(value) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
  }

  function googleEvent(name, params) {
    if (window.gtag) window.gtag('event', name, params);
    else if (window.dataLayer) window.dataLayer.push(Object.assign({ event: name }, params));
  }

  function sendTrack(eventName, product) {
    if (!eventName || !product) return;
    const payload = {
      content_ids: [String(product.id || product.zendrop_id || '')],
      content_name: product.title || '',
      content_type: 'product',
      value: money(product.retail_price),
      currency: 'USD'
    };
    if (window.fbq) window.fbq('track', eventName, payload);
    if (eventName === 'ViewContent') {
      googleEvent('view_item', {
        currency: 'USD',
        value: payload.value,
        items: [{ item_id: payload.content_ids[0], item_name: payload.content_name, price: payload.value }]
      });
    } else if (eventName === 'AddToCart') {
      googleEvent('add_to_cart', {
        currency: 'USD',
        value: payload.value,
        items: [{ item_id: payload.content_ids[0], item_name: payload.content_name, price: payload.value }]
      });
    }
  }

  function sendPurchase(orderNumber, value, currency) {
    const key = 'bwo_tracked_' + String(orderNumber || '');
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch (err) {}
    const amount = money(value);
    const code = currency || 'USD';
    if (window.fbq) window.fbq('track', 'Purchase', { value: amount, currency: code });
    googleEvent('purchase', { transaction_id: String(orderNumber || ''), value: amount, currency: code });
  }

  function flush() {
    ready = true;
    pending.splice(0).forEach((item) => {
      if (item[0] === 'track') sendTrack(item[1], item[2]);
      else sendPurchase(item[1], item[2], item[3]);
    });
  }

  window.bwoTrack = function (eventName, product) {
    if (!ready) {
      pending.push(['track', eventName, product]);
      return;
    }
    sendTrack(eventName, product);
  };

  window.bwoTrackPurchase = function (orderNumber, value, currency) {
    if (!ready) {
      pending.push(['purchase', orderNumber, value, currency]);
      return;
    }
    sendPurchase(orderNumber, value, currency);
  };

  window.bwoTrackingReady = fetch('/api/buywish/tracking')
    .then((res) => res.json())
    .then((data) => {
      const meta = safeMeta(data && data.meta_pixel_id);
      const google = safeGoogle(data && data.google_tag_id);
      if (meta) installMeta(meta);
      if (google) installGoogle(google);
    })
    .catch(function () {})
    .then(flush);
})();
