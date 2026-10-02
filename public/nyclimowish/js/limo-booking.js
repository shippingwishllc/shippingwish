(function () {
  const state = {
    serviceType: 'point_to_point',
    pickup: '', dropoff: '', pickupDate: '', pickupTime: '',
    hours: 3, miles: 0, durationMins: 0, routeIsEstimate: true, routeSource: '',
    stops: [],
    quotes: [], selectedVehicle: null, bookingId: null, bookingNumber: null,
    mapUrl: '', mapProvider: 'none'
  };

  const sessions = new WeakMap();

  const SVGS = {
    passenger: '<svg class="limo-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>',
    luggage: '<svg class="limo-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="15" rx="2"></rect><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="9" y1="11" x2="9" y2="16"></line><line x1="15" y1="11" x2="15" y2="16"></line></svg>',
    seat: '<svg class="limo-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h10a2 2 0 0 1 2 2v8a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V6a2 2 0 0 1 2-2z"></path><path d="M5 14h14"></path><path d="M7 18v3"></path><path d="M17 18v3"></path></svg>',
    phone: '<svg class="limo-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>',
    wifi: '<svg class="limo-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"></path><path d="M1.42 9a16 16 0 0 1 21.16 0"></path><path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path><line x1="12" y1="20" x2="12.01" y2="20"></line></svg>',
    flight: '<svg class="limo-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.3c.4-.2.6-.6.5-1.1z"></path></svg>',
    check: '<svg class="limo-check-svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" /></svg>'
  };

  const VEHICLE_CONFIG = {
    business_sedan: {
      image: '/nyclimowish/images/fleet/business-sedan.jpg',
      badge: { text: 'Best Value', icon: '🏷️', cls: 'badge-value' },
      models: 'Cadillac CT6, Lyriq or similar'
    },
    premium_sedan: {
      image: '/nyclimowish/images/fleet/premium-sedan.jpg',
      badge: { text: 'Top Rated', icon: '🛡️', cls: 'badge-rated' },
      models: 'Mercedes S Class and BMW 7 Series'
    },
    elitex_suv: {
      image: '/nyclimowish/images/fleet/elitex-suv.jpg',
      badge: { text: 'Popular', icon: '🔥', cls: 'badge-popular' },
      models: 'Cadillac Escalade ESV, Lincoln Navigator or similar'
    },
    luxury_suv: {
      image: '/nyclimowish/images/fleet/luxury-suv.jpg',
      badge: { text: 'Best Value', icon: '🏷️', cls: 'badge-value' },
      models: 'Chevrolet Suburban or similar'
    },
    standard_van: {
      image: '/nyclimowish/images/fleet/standard-van.jpg',
      badge: { text: 'Best Value', icon: '🏷️', cls: 'badge-value' },
      models: 'Ford Transit Van With Standard Seating'
    },
    business_sprinter: {
      image: '/nyclimowish/images/fleet/business-sprinter.jpg',
      badge: { text: 'Popular', icon: '🔥', cls: 'badge-popular' },
      models: 'Mercedes Sprinter With Standard Seating'
    },
    stretch_limo: {
      image: '/nyclimowish/images/fleet/stretch-limo.jpg',
      badge: null,
      models: 'Lincoln MKT / Chrysler'
    },
    party_bus: {
      image: '/nyclimowish/images/fleet/party-bus.jpg',
      badge: { text: 'Best Value', icon: '🏷️', cls: 'badge-value' },
      models: 'Luxury Party Bus With Executive Lounge Seating'
    }
  };

  const BADGE_MAP = {
    best_value: { text: 'Best Value', icon: '🏷️', cls: 'badge-value' },
    top_rated: { text: 'Top Rated', icon: '🛡️', cls: 'badge-rated' },
    popular: { text: 'Popular', icon: '🔥', cls: 'badge-popular' }
  };

  function $(id) { return document.getElementById(id); }
  function showStep(n) {
    document.querySelectorAll('.book-step').forEach((s) => s.style.display = 'none');
    $('step-' + n).style.display = 'block';
    document.querySelectorAll('.limo-step').forEach((s) => {
      const sn = parseInt(s.dataset.step, 10);
      s.classList.toggle('active', sn === n);
      s.classList.toggle('done', sn < n);
    });
    window.scrollTo(0, 0);
  }

  function showError(id, message) {
    const el = $(id);
    if (el) el.textContent = message || '';
  }

  function tokenFor(input) {
    if (!sessions.has(input)) sessions.set(input, crypto.randomUUID());
    return sessions.get(input);
  }

  function resetToken(input) {
    sessions.set(input, crypto.randomUUID());
  }

  function placePayload(input) {
    if (!input) return { address: '' };
    const placeId = input.dataset.placeId || '';
    return {
      address: input.value.trim(),
      placeId: placeId || undefined,
      sessionToken: placeId ? tokenFor(input) : undefined
    };
  }

  function hideList(list) {
    if (!list) return;
    list.hidden = true;
    list.innerHTML = '';
  }

  function bindAddress(input) {
    if (!input || input.dataset.bound === '1') return;
    input.dataset.bound = '1';
    input.setAttribute('autocomplete', 'off');
    const box = input.closest('.limo-address-box') || input.parentElement;
    const list = box?.querySelector('.limo-suggest');
    let timer = null;
    let activeIndex = -1;

    input.addEventListener('input', () => {
      if (input.dataset.placeLabel !== input.value.trim()) {
        input.dataset.placeId = '';
        input.dataset.placeLabel = '';
      }
      clearTimeout(timer);
      const value = input.value.trim();
      if (value.length < 3) {
        hideList(list);
        if (!value) resetToken(input);
        return;
      }
      timer = setTimeout(() => searchAddress(input, list), 280);
    });

    input.addEventListener('keydown', (e) => {
      if (!list || list.hidden) return;
      const items = list.querySelectorAll('.limo-suggest-item');
      if (!items.length) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIndex = (activeIndex + 1) % items.length;
        updateActiveItem(items, activeIndex);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIndex = (activeIndex - 1 + items.length) % items.length;
        updateActiveItem(items, activeIndex);
      } else if (e.key === 'Enter') {
        if (activeIndex >= 0 && items[activeIndex]) {
          e.preventDefault();
          items[activeIndex].click();
        }
      } else if (e.key === 'Escape') {
        hideList(list);
      }
    });

    input.addEventListener('blur', () => {
      setTimeout(() => hideList(list), 220);
    });
  }

  function updateActiveItem(items, index) {
    items.forEach((item, i) => {
      const active = i === index;
      item.classList.toggle('active', active);
      item.setAttribute('aria-selected', active ? 'true' : 'false');
      if (active) item.scrollIntoView({ block: 'nearest' });
    });
  }

  async function searchAddress(input, list) {
    const query = input.value.trim();
    if (!list || query.length < 3) return;
    try {
      const res = await fetch('/api/nyclimo/places/autocomplete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: query, sessionToken: tokenFor(input) })
      });
      const data = await res.json().catch(() => ({}));
      if (input.value.trim() !== query) return;
      if (!res.ok) {
        hideList(list);
        return;
      }
      const suggestions = data.suggestions || [];
      if (!suggestions.length) {
        hideList(list);
        return;
      }

      const isGoogle = suggestions.some((s) => s.source === 'google_places');
      const footerHtml = isGoogle
        ? `<div class="limo-suggest-footer">
             <span class="limo-suggest-source">
               <span class="limo-suggest-dot dot-google">●</span> Powered by <strong>Google</strong>
             </span>
           </div>`
        : `<div class="limo-suggest-footer">
             <span class="limo-suggest-source">
               <span class="limo-suggest-dot dot-brand">●</span> Powered by <strong>NYC Limo Wish</strong>
             </span>
           </div>`;

      const listHtml = suggestions.map((item, index) => {
        const mainText = escapeHtml(item.mainText || item.label || '');
        const secondaryText = escapeHtml(item.secondaryText || '');
        return `
          <button type="button" class="limo-suggest-item" data-index="${index}" role="option">
            <svg class="limo-suggest-pin" viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/>
            </svg>
            <div class="limo-suggest-content">
              <div class="limo-suggest-main">${mainText}</div>
              ${secondaryText ? `<div class="limo-suggest-sub">${secondaryText}</div>` : ''}
            </div>
          </button>
        `;
      }).join('');

      list.innerHTML = `<div class="limo-suggest-list" role="listbox">${listHtml}</div>${footerHtml}`;
      list.hidden = false;

      list.querySelectorAll('.limo-suggest-item').forEach((button) => {
        button.addEventListener('mousedown', (event) => {
          event.preventDefault();
          const item = suggestions[Number(button.dataset.index)];
          if (!item) return;
          input.value = item.label;
          input.dataset.placeId = item.placeId || '';
          input.dataset.placeLabel = item.label;
          hideList(list);
        });
      });
    } catch (_) {
      hideList(list);
    }
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }

  function collectStops() {
    return [...document.querySelectorAll('#b-stops .limo-address')]
      .map(placePayload)
      .filter((stop) => stop.address);
  }

  function addStop(prefill) {
    const wrap = $('b-stops');
    if (wrap.querySelectorAll('.limo-stop').length >= 5) return;
    const row = document.createElement('div');
    row.className = 'limo-field limo-stop';
    row.innerHTML = `<label>Stop</label>
      <div class="limo-address-box">
        <span class="limo-field-icon">➕</span>
        <input class="limo-input limo-address" placeholder="Add a stop" autocomplete="off" style="background:#f9f9f9;color:#000;border-color:#ddd;">
        <div class="limo-suggest" hidden></div>
      </div>
      <button type="button" class="limo-stop-remove">Remove stop</button>`;
    wrap.appendChild(row);
    const input = row.querySelector('input');
    bindAddress(input);
    if (prefill) input.value = prefill;
    row.querySelector('.limo-stop-remove').addEventListener('click', () => {
      row.remove();
      updateStopButton();
    });
    updateStopButton();
  }

  function updateStopButton() {
    const count = document.querySelectorAll('#b-stops .limo-stop').length;
    $('btn-add-stop').hidden = count >= 5;
  }

  document.querySelectorAll('.limo-address').forEach(bindAddress);
  $('btn-add-stop').addEventListener('click', () => addStop());

  const params = new URLSearchParams(window.location.search);
  if (params.get('pickup')) $('b-pickup').value = params.get('pickup');
  if (params.get('dropoff')) $('b-dropoff').value = params.get('dropoff');
  if (params.get('pickupPlaceId')) {
    $('b-pickup').dataset.placeId = params.get('pickupPlaceId');
    $('b-pickup').dataset.placeLabel = params.get('pickup') || '';
  }
  if (params.get('dropoffPlaceId')) {
    $('b-dropoff').dataset.placeId = params.get('dropoffPlaceId');
    $('b-dropoff').dataset.placeLabel = params.get('dropoff') || '';
  }
  if (params.get('pickupSessionToken')) {
    sessions.set($('b-pickup'), params.get('pickupSessionToken'));
  }
  if (params.get('dropoffSessionToken')) {
    sessions.set($('b-dropoff'), params.get('dropoffSessionToken'));
  }
  if (params.get('pickupDate')) $('b-date').value = params.get('pickupDate');
  if (params.get('pickupTime')) $('b-time').value = params.get('pickupTime');
  if (params.get('serviceType') === 'hourly') setTab('hourly');
  if (params.get('hours') && $('b-hours')) {
    const hours = params.get('hours');
    if ([...$('b-hours').options].some((option) => option.value === hours)) $('b-hours').value = hours;
  }

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (!$('b-date').value) $('b-date').value = tomorrow.toISOString().split('T')[0];
  if (!$('b-time').value) $('b-time').value = '12:00';
  $('b-date').min = tomorrow.toISOString().split('T')[0];

  document.querySelectorAll('.limo-tab').forEach((tab) => {
    tab.addEventListener('click', () => setTab(tab.dataset.tab));
  });

  function setTab(type) {
    state.serviceType = type;
    document.querySelectorAll('.limo-tab').forEach((t) => {
      t.classList.toggle('active', t.dataset.tab === type);
    });
    const hourly = type === 'hourly';
    $('b-dropoff-wrap').style.display = 'block';
    $('b-duration-wrap').style.display = hourly ? 'block' : 'none';
    $('b-stops-wrap').style.display = hourly ? 'none' : 'block';
    if ($('b-same-as-pickup')) {
      $('b-same-as-pickup').style.display = hourly ? 'inline-block' : 'none';
    }
  }

  $('b-same-as-pickup')?.addEventListener('click', (e) => {
    e.preventDefault();
    const pVal = $('b-pickup').value.trim();
    if (!pVal) {
      $('b-pickup').focus();
      return;
    }
    $('b-dropoff').value = pVal;
    $('b-dropoff').dataset.placeId = $('b-pickup').dataset.placeId || '';
    $('b-dropoff').dataset.placeLabel = $('b-pickup').dataset.placeLabel || pVal;

    const btn = $('b-same-as-pickup');
    const orig = btn.textContent;
    btn.textContent = 'Copied ✓';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = orig;
      btn.classList.remove('copied');
    }, 1200);
  });

  if (params.get('addStop') === '1') {
    addStop();
  }

  function splitAddress(addr) {
    if (!addr) return { main: '—', sub: '' };
    const commaIndex = addr.indexOf(',');
    if (commaIndex !== -1) {
      return {
        main: addr.slice(0, commaIndex).trim(),
        sub: addr.slice(commaIndex + 1).trim()
      };
    }
    return { main: addr.trim(), sub: '' };
  }

  async function submitStep1() {
    let pickup = placePayload($('b-pickup'));
    let dropoff = placePayload($('b-dropoff'));
    const stops = collectStops();
    state.pickup = pickup.address;
    state.dropoff = dropoff.address;
    state.stops = stops.map((stop) => stop.address);
    state.pickupDate = $('b-date').value;
    state.pickupTime = $('b-time').value;
    state.hours = parseFloat($('b-hours').value) || 3;
    showError('step1-error', '');

    if (!state.pickup || !state.pickupDate || !state.pickupTime) {
      document.documentElement.classList.remove('limo-preloading-step2');
      showStep(1);
      showError('step1-error', 'Please fill in pickup, date, and time.');
      return;
    }
    if (state.serviceType === 'hourly' && !state.dropoff) {
      state.dropoff = state.pickup;
      $('b-dropoff').value = state.pickup;
      $('b-dropoff').dataset.placeId = $('b-pickup').dataset.placeId || '';
      $('b-dropoff').dataset.placeLabel = $('b-pickup').dataset.placeLabel || state.pickup;
      dropoff = placePayload($('b-dropoff'));
    }
    if (state.serviceType === 'point_to_point' && !state.dropoff) {
      document.documentElement.classList.remove('limo-preloading-step2');
      showStep(1);
      showError('step1-error', 'Please enter a drop-off location.');
      return;
    }

    $('btn-step1').disabled = true;
    $('btn-step1').textContent = 'Calculating prices...';

    try {
      const res = await fetch('/api/nyclimo/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceType: state.serviceType,
          pickup: pickup.address,
          pickupPlaceId: pickup.placeId,
          pickupSessionToken: pickup.sessionToken,
          dropoff: dropoff.address,
          dropoffPlaceId: dropoff.placeId,
          dropoffSessionToken: dropoff.sessionToken,
          stops: stops.map((stop) => ({
            address: stop.address,
            placeId: stop.placeId,
            sessionToken: stop.sessionToken
          })),
          hours: state.hours
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Pricing is unavailable.');

      applyVerifiedAddress($('b-pickup'), data.pickup);
      applyVerifiedAddress($('b-dropoff'), data.dropoff);
      (data.stops || []).forEach((stop, index) => {
        const input = document.querySelectorAll('#b-stops .limo-address')[index];
        applyVerifiedAddress(input, stop);
      });
      state.pickup = data.pickup?.formatted || state.pickup;
      state.dropoff = data.dropoff?.formatted || state.dropoff;
      state.stops = (data.stops || []).map((stop) => stop.formatted).filter(Boolean);
      state.quotes = data.quotes;
      state.miles = data.distance?.miles || 0;
      state.durationMins = data.distance?.durationMins || 0;
      state.routeIsEstimate = data.distance?.isEstimate !== false;
      state.routeSource = data.distance?.source || '';
      state.mapUrl = safeMapUrl(data.map?.embedUrl);
      state.mapProvider = state.mapUrl ? (data.map?.provider || 'none') : 'none';

      document.documentElement.classList.remove('limo-preloading-step2');
      renderSidebar();
      renderVehicles();
      showStep(2);
    } catch (err) {
      document.documentElement.classList.remove('limo-preloading-step2');
      showStep(1);
      showError('step1-error', err.message || 'Could not calculate pricing.');
    } finally {
      $('btn-step1').disabled = false;
      $('btn-step1').textContent = 'Continue →';
    }
  }

  $('btn-step1').addEventListener('click', submitStep1);

  // Auto-advance directly to Step 2 if user arrived with pickup and dropoff / hourly details
  const hasPickup = Boolean(params.get('pickup'));
  const isHourly = params.get('serviceType') === 'hourly' || params.get('type') === 'hourly';
  const hasDropoff = Boolean(params.get('dropoff'));
  if (hasPickup && (hasDropoff || isHourly) && params.get('edit') !== '1') {
    submitStep1();
  }

  function applyVerifiedAddress(input, geo) {
    if (!input || !geo?.formatted) return;
    input.value = geo.formatted;
    input.dataset.placeLabel = geo.formatted;
    resetToken(input);
  }

  function safeMapUrl(url) {
    try {
      const parsed = new URL(url);
      const google = parsed.protocol === 'https:' && parsed.hostname === 'www.google.com' && parsed.pathname.startsWith('/maps/embed/');
      const osm = parsed.protocol === 'https:' && parsed.hostname === 'www.openstreetmap.org' && parsed.pathname.startsWith('/export/embed');
      return google || osm ? parsed.toString() : '';
    } catch (_) {
      return '';
    }
  }

  function renderMap() {
    const box = $('sidebar-map');
    if (!box) return;
    box.innerHTML = '';
    if (!state.mapUrl) {
      box.innerHTML = `<div class="limo-map-placeholder">
        <span class="limo-map-spin">📍</span>
        <span>Route map loading...</span>
      </div>`;
      return;
    }
    const frame = document.createElement('iframe');
    frame.title = 'Driving route';
    frame.loading = 'lazy';
    frame.referrerPolicy = 'origin';
    frame.src = state.mapUrl;
    box.appendChild(frame);
  }

  function renderSidebar() {
    renderMap();

    // Pickup address
    const pSplit = splitAddress(state.pickup);
    if ($('sb-pickup-main')) $('sb-pickup-main').textContent = pSplit.main || state.pickup || '—';
    if ($('sb-pickup-sub')) $('sb-pickup-sub').textContent = pSplit.sub || '';

    // Dropoff address
    if (state.serviceType === 'hourly') {
      const isCustomDrop = Boolean(state.dropoff && state.dropoff !== state.pickup);
      if ($('sb-dropoff-main')) {
        $('sb-dropoff-main').textContent = isCustomDrop ? splitAddress(state.dropoff).main : 'Hourly Charter Service';
      }
      if ($('sb-dropoff-sub')) {
        $('sb-dropoff-sub').textContent = isCustomDrop ? splitAddress(state.dropoff).sub : `${state.hours} hours dedicated chauffeur on standby`;
      }
    } else {
      const dSplit = splitAddress(state.dropoff);
      if ($('sb-dropoff-main')) $('sb-dropoff-main').textContent = dSplit.main || state.dropoff || '—';
      if ($('sb-dropoff-sub')) $('sb-dropoff-sub').textContent = dSplit.sub || '';
    }

    // Intermediate stops
    if ($('sb-stops-container')) {
      $('sb-stops-container').innerHTML = (state.stops || []).map((stop) => {
        const sSplit = splitAddress(stop);
        return `<div class="limo-timeline-stop stop-intermediate">
          <div class="limo-stop-marker">
            <div class="limo-pin-badge pin-stop">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg>
            </div>
            <div class="limo-route-track"></div>
          </div>
          <div class="limo-stop-info">
            <div class="limo-stop-main">${escapeHtml(sSplit.main)}</div>
            <div class="limo-stop-sub">${escapeHtml(sSplit.sub)}</div>
          </div>
        </div>`;
      }).join('');
    }

    // Date & Time formatting
    const d = new Date(state.pickupDate + 'T' + state.pickupTime);
    if (!isNaN(d.getTime())) {
      if ($('sb-meta-date')) {
        $('sb-meta-date').textContent = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
      }
      if ($('sb-meta-time')) {
        $('sb-meta-time').textContent = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      }
    } else {
      if ($('sb-meta-date')) $('sb-meta-date').textContent = state.pickupDate || '—';
      if ($('sb-meta-time')) $('sb-meta-time').textContent = state.pickupTime || '—';
    }

    // Distance and Duration under map
    if (state.serviceType === 'hourly') {
      if ($('sb-duration')) $('sb-duration').textContent = `${state.hours} hours duration`;
      if ($('sb-duration-wrap')) $('sb-duration-wrap').style.display = 'flex';
      if ($('stat-miles')) $('stat-miles').textContent = `${state.hours} hours`;
      if ($('stat-duration')) $('stat-duration').textContent = 'Hourly Charter';
    } else {
      const hours = Math.floor(state.durationMins / 60);
      const mins = state.durationMins % 60;
      const durationStr = hours > 0 ? `${hours} hour ${mins} min` : `${mins} min`;
      if ($('sb-duration')) $('sb-duration').textContent = `${durationStr} estimated`;
      if ($('sb-duration-wrap')) $('sb-duration-wrap').style.display = 'flex';
      if ($('stat-miles')) $('stat-miles').textContent = `${state.miles} mi`;
      if ($('stat-duration')) $('stat-duration').textContent = durationStr;
    }
  }

  function getVehicleBadge(q) {
    if (q.badge && BADGE_MAP[q.badge]) {
      const b = BADGE_MAP[q.badge];
      return `<div class="limo-vehicle-badge ${b.cls}"><span class="badge-icon">${b.icon}</span> ${b.text}</div>`;
    }
    const cfg = VEHICLE_CONFIG[q.id];
    if (cfg?.badge) {
      return `<div class="limo-vehicle-badge ${cfg.badge.cls}"><span class="badge-icon">${cfg.badge.icon}</span> ${cfg.badge.text}</div>`;
    }
    return '';
  }

  function renderVehicles() {
    $('vehicle-list').innerHTML = state.quotes.map((q) => {
      const cfg = VEHICLE_CONFIG[q.id] || {};
      const imgUrl = q.image_url || cfg.image || '/nyclimowish/images/fleet/business-sedan.jpg';
      const models = escapeHtml(q.models || cfg.models || '');
      const badgeHtml = getVehicleBadge(q);
      const isSelected = state.selectedVehicle && state.selectedVehicle.id === q.id;

      return `<div class="limo-vehicle-card ${isSelected ? 'selected' : ''}" data-id="${q.id}" role="button" tabindex="0">
        <div class="limo-vehicle-radio" role="radio" aria-checked="${isSelected ? 'true' : 'false'}"></div>
        <div class="limo-vehicle-photo-wrap">
          <img src="${imgUrl}" class="limo-vehicle-photo" alt="${escapeHtml(q.name)}" loading="lazy">
        </div>
        <div class="limo-vehicle-info">
          ${badgeHtml}
          <h3 class="limo-vehicle-name">${escapeHtml(q.name)}</h3>
          <p class="limo-vehicle-models">${models}</p>
          <div class="limo-vehicle-amenities">
            <div class="limo-capacity-pill">
              <span class="limo-cap-item" title="${q.passengers} Passengers">
                ${SVGS.passenger}
                <span>${q.passengers}</span>
              </span>
              <span class="limo-cap-divider"></span>
              <span class="limo-cap-item" title="${q.luggage} Luggage Capacity">
                ${SVGS.luggage}
                <span>${q.luggage}</span>
              </span>
            </div>
            <div class="limo-amenity-circle" title="Premium Leather Interior">${SVGS.seat}</div>
            <div class="limo-amenity-circle" title="Direct Chauffeur Connection">${SVGS.phone}</div>
            <div class="limo-amenity-circle" title="Complimentary High-Speed Wi-Fi">${SVGS.wifi}</div>
            <div class="limo-amenity-circle" title="Real-Time Flight Tracking">${SVGS.flight}</div>
          </div>
        </div>
        <div class="limo-vehicle-price">
          ${q.pricing.original > q.pricing.total ? `<div class="limo-price-original">$${q.pricing.original.toFixed(2)}</div>` : ''}
          <div class="limo-price-total">$${q.pricing.total.toFixed(2)}</div>
          <div class="limo-price-note">${SVGS.check} Gratuity included</div>
        </div>
      </div>`;
    }).join('');

    document.querySelectorAll('.limo-vehicle-card').forEach((card) => {
      card.addEventListener('click', () => selectVehicle(card.dataset.id));
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectVehicle(card.dataset.id);
        }
      });
    });
  }

  function selectVehicle(id) {
    state.selectedVehicle = state.quotes.find((q) => q.id === id);
    document.querySelectorAll('.limo-vehicle-card').forEach((c) => {
      const isCard = c.dataset.id === id;
      c.classList.toggle('selected', isCard);
      const radio = c.querySelector('.limo-vehicle-radio');
      if (radio) radio.setAttribute('aria-checked', isCard ? 'true' : 'false');
    });

    setTimeout(() => {
      renderPassengerSummary();
      const capacity = Number(state.selectedVehicle?.passengers || 60);
      $('p-passengers').max = String(capacity);
      if (Number($('p-passengers').value) > capacity) $('p-passengers').value = String(capacity);
      showStep(3);
    }, 280);
  }

  function getEffectivePricing(v) {
    if (!v || !v.pricing) return null;
    const baseSubtotal = Number(v.pricing.subtotal) || 0;
    const tolls = Number(v.pricing.tolls) || 0;
    const airportFee = Number(v.pricing.airportFee) || 0;
    const childSeats = parseInt($('p-child-seats-select')?.value || '0', 10);
    const childSeatFee = childSeats * 20;
    const meetAndGreet = $('p-meet-greet')?.checked || false;
    const meetAndGreetFee = meetAndGreet ? 30 : 0;
    const taxableTotal = baseSubtotal + childSeatFee + meetAndGreetFee;
    const gratuity = Math.round(taxableTotal * 0.20 * 100) / 100;
    const total = Math.round((taxableTotal + tolls + airportFee + gratuity) * 100) / 100;
    return {
      subtotal: baseSubtotal,
      tolls,
      airportFee,
      childSeats,
      childSeatFee,
      meetAndGreet,
      meetAndGreetFee,
      gratuity,
      total
    };
  }

  function renderPassengerSummary() {
    const v = state.selectedVehicle;
    if (!v) return;
    const effective = getEffectivePricing(v);
    $('summary-vehicle').innerHTML = `<strong>${escapeHtml(v.name)}</strong><br><span style="color:#666;font-size:0.85rem;">${escapeHtml(v.models || '')}</span>`;
    $('price-breakdown').innerHTML = priceHtml(effective);
    $('final-price').innerHTML = priceHtml(effective);
  }

  function priceHtml(p) {
    if (!p) return '';
    const tolls = Number(p.tolls) || 0;
    const airportFee = Number(p.airportFee) || 0;
    const childSeatFee = Number(p.childSeatFee) || 0;
    const meetAndGreetFee = Number(p.meetAndGreetFee) || 0;

    return `<div class="limo-price-row"><span>Base fare</span><span>$${Number(p.subtotal).toFixed(2)}</span></div>
      ${tolls > 0 ? `<div class="limo-price-row"><span>Tolls</span><span>$${tolls.toFixed(2)}</span></div>` : ''}
      ${airportFee > 0 ? `<div class="limo-price-row"><span>Port Authority Airport Access Fee</span><span>$${airportFee.toFixed(2)}</span></div>` : ''}
      ${childSeatFee > 0 ? `<div class="limo-price-row"><span>Child Safety Seats (${p.childSeats})</span><span>$${childSeatFee.toFixed(2)}</span></div>` : ''}
      ${meetAndGreetFee > 0 ? `<div class="limo-price-row"><span>VIP Meet &amp; Greet</span><span>$${meetAndGreetFee.toFixed(2)}</span></div>` : ''}
      <div class="limo-price-row"><span>Gratuity (20% included)</span><span>$${Number(p.gratuity).toFixed(2)}</span></div>
      <div class="limo-price-row total"><span>Total</span><span>$${Number(p.total).toFixed(2)}</span></div>
      <p style="font-size:0.75rem;color:#999;margin-top:8px;">ℹ All-Inclusive Guaranteed Rate</p>`;
  }

  $('p-child-seats-select')?.addEventListener('change', () => renderPassengerSummary());
  $('p-meet-greet')?.addEventListener('change', () => renderPassengerSummary());

  $('btn-back-2')?.addEventListener('click', () => showStep(1));
  $('btn-back-top')?.addEventListener('click', () => showStep(1));
  $('btn-back-3')?.addEventListener('click', () => showStep(2));

  $('btn-step3').addEventListener('click', async () => {
    const first = $('p-first').value.trim();
    const last = $('p-last').value.trim();
    const email = $('p-email').value.trim();
    const phone = $('p-phone').value.trim();
    showError('step3-error', '');
    if (!first || !last || !email || !phone) {
      showError('step3-error', 'Please fill in all passenger details.');
      return;
    }
    const pickup = placePayload($('b-pickup'));
    const dropoff = placePayload($('b-dropoff'));

    $('btn-step3').disabled = true;
    $('btn-step3').textContent = 'Creating booking...';

    const childSeats = parseInt($('p-child-seats-select')?.value || '0', 10);
    const meetAndGreet = $('p-meet-greet')?.checked || false;

    try {
      const res = await fetch('/api/nyclimo/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceType: state.serviceType,
          pickup: pickup.address,
          pickupPlaceId: pickup.placeId,
          pickupSessionToken: pickup.sessionToken,
          dropoff: dropoff.address,
          dropoffPlaceId: dropoff.placeId,
          dropoffSessionToken: dropoff.sessionToken,
          stops: collectStops(),
          pickupDate: state.pickupDate,
          pickupTime: state.pickupTime,
          durationHours: state.hours,
          vehicleId: state.selectedVehicle.id,
          firstName: first,
          lastName: last,
          email,
          phone,
          tripNotes: $('p-notes').value,
          flightNumber: $('p-flight').value.trim(),
          passengers: parseInt($('p-passengers').value || '1', 10),
          luggage: parseInt($('p-luggage').value || '0', 10),
          childSeats,
          meetAndGreet,
          referralCode: params.get('ref') || params.get('referral') || undefined
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Booking failed.');
      state.bookingId = data.booking.id;
      state.bookingNumber = data.booking.booking_number;
      if (data.booking.total_price != null) {
        state.selectedVehicle = {
          ...state.selectedVehicle,
          pricing: {
            ...state.selectedVehicle.pricing,
            subtotal: Number(data.booking.base_price),
            tolls: Number(data.booking.tolls),
            gratuity: Number(data.booking.gratuity),
            total: Number(data.booking.total_price)
          }
        };
        renderPassengerSummary();
      }
      $('btn-pay').disabled = data.booking.status !== 'operator_accepted';
      $('operator-status').textContent = data.booking.status === 'operator_accepted'
        ? 'A licensed operator accepted your request. Payment is ready.'
        : 'Your request is with verified licensed operators. We will enable payment as soon as a partner accepts.';
      showStep(4);
      pollOperatorStatus();
    } catch (err) {
      showError('step3-error', err.message || 'Booking failed.');
    } finally {
      $('btn-step3').disabled = false;
      $('btn-step3').textContent = 'Continue to Payment →';
    }
  });

  let statusTimer = null;
  async function pollOperatorStatus() {
    if (statusTimer) clearInterval(statusTimer);
    const check = async () => {
      if (!state.bookingNumber) return;
      try {
        const response = await fetch('/api/nyclimo/track/' + encodeURIComponent(state.bookingNumber));
        const data = await response.json();
        if (!response.ok) return;
        const booking = data.booking;
        if (booking.status === 'operator_accepted') {
          $('operator-status').textContent = 'A licensed operator accepted your request. Payment is ready.';
          $('btn-pay').disabled = false;
          clearInterval(statusTimer);
          statusTimer = null;
        } else if (booking.status === 'confirmed') {
          $('operator-status').textContent = 'Your ride is confirmed and paid.';
          $('btn-pay').disabled = true;
          clearInterval(statusTimer);
          statusTimer = null;
        } else {
          $('operator-status').textContent = 'Booking status: ' + booking.status.replaceAll('_', ' ') + '. Waiting for a verified operator to accept.';
        }
      } catch (_) {}
    };
    await check();
    if (!$('btn-pay').disabled) return;
    statusTimer = setInterval(check, 12000);
  }

  $('btn-pay').addEventListener('click', async () => {
    if ($('btn-pay').disabled) return;
    $('btn-pay').disabled = true;
    $('btn-pay').textContent = 'Redirecting to Stripe...';
    try {
      const res = await fetch('/api/nyclimo/bookings/' + state.bookingId + '/checkout', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      window.location.href = data.url;
    } catch (err) {
      alert('Payment setup failed: ' + err.message);
      $('btn-pay').disabled = false;
      $('btn-pay').textContent = 'Pay with Stripe →';
    }
  });
})();
