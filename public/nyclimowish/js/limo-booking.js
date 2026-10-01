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

  const VEHICLE_ICONS = {
    business_sedan: '🚗', premium_sedan: '🚗', elitex_suv: '🚙',
    luxury_suv: '🚙', business_sprinter: '🚌', stretch_limo: '🥂',
    standard_van: '🚐', party_bus: '🎉'
  };

  const BADGE_MAP = {
    best_value: ['Best Value', 'limo-badge-value'],
    top_rated: ['Top Rated', 'limo-badge-rated'],
    popular: ['Popular', 'limo-badge-popular']
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
    const list = input.parentElement?.querySelector('.limo-suggest');
    let timer = null;

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
      timer = setTimeout(() => searchAddress(input, list), 350);
    });

    input.addEventListener('blur', () => {
      setTimeout(() => hideList(list), 180);
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
      list.innerHTML = suggestions.map((item, index) =>
        `<button type="button" data-index="${index}">${escapeHtml(item.mainText || item.label)}${item.secondaryText ? `<small>${escapeHtml(item.secondaryText)}</small>` : ''}</button>`
      ).join('');
      list.hidden = false;
      list.querySelectorAll('button').forEach((button) => {
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
    $('b-dropoff-wrap').style.display = hourly ? 'none' : 'block';
    $('b-stops-wrap').style.display = hourly ? 'none' : 'block';
    $('b-duration-wrap').style.display = hourly ? 'block' : 'none';
  }

  $('btn-step1').addEventListener('click', async () => {
    const pickup = placePayload($('b-pickup'));
    const dropoff = placePayload($('b-dropoff'));
    const stops = collectStops();
    state.pickup = pickup.address;
    state.dropoff = dropoff.address;
    state.stops = stops.map((stop) => stop.address);
    state.pickupDate = $('b-date').value;
    state.pickupTime = $('b-time').value;
    state.hours = parseFloat($('b-hours').value) || 3;
    showError('step1-error', '');

    if (!state.pickup || !state.pickupDate || !state.pickupTime) {
      showError('step1-error', 'Please fill in pickup, date, and time.');
      return;
    }
    if (state.serviceType === 'point_to_point' && !state.dropoff) {
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

      renderSidebar();
      renderVehicles();
      showStep(2);
    } catch (err) {
      showError('step1-error', err.message || 'Could not calculate pricing.');
    } finally {
      $('btn-step1').disabled = false;
      $('btn-step1').textContent = 'Continue →';
    }
  });

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
    box.textContent = '';
    if (!state.mapUrl) {
      box.textContent = 'Route map';
      $('map-note').textContent = '';
      return;
    }
    const frame = document.createElement('iframe');
    frame.title = 'Driving route';
    frame.loading = 'lazy';
    frame.referrerPolicy = 'origin';
    frame.src = state.mapUrl;
    box.appendChild(frame);
    $('map-note').textContent = state.mapProvider === 'google_embed'
      ? 'Map: Google Maps Embed'
      : 'Map: OpenStreetMap';
  }

  function renderSidebar() {
    renderMap();
    $('sb-pickup').textContent = state.pickup;
    $('sb-dropoff').textContent = state.serviceType === 'hourly' ? 'Hourly Service' : state.dropoff;
    $('sb-stops').innerHTML = state.stops.map((stop) =>
      `<div class="limo-route-pin">➕ <span>${escapeHtml(stop)}</span></div>`
    ).join('');
    const d = new Date(state.pickupDate + 'T' + state.pickupTime);
    $('sb-datetime').textContent = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) + ' at ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    if (state.serviceType === 'hourly') {
      $('sb-duration').textContent = state.hours + ' hours';
      $('sidebar-stats').textContent = '';
    } else {
      $('sb-duration').textContent = '';
      const hours = Math.floor(state.durationMins / 60);
      const mins = state.durationMins % 60;
      $('sidebar-stats').textContent = state.miles + ' mi · ' + hours + 'h ' + mins + 'm · ' + (state.routeIsEstimate ? 'estimated route' : 'driving route');
    }
  }

  function renderVehicles() {
    $('vehicle-list').innerHTML = state.quotes.map((q) => {
      const badge = q.badge ? BADGE_MAP[q.badge] : null;
      const icon = VEHICLE_ICONS[q.id] || '🚗';
      return `<div class="limo-vehicle-card" data-id="${q.id}">
        <div class="limo-vehicle-img">${icon}</div>
        <div class="limo-vehicle-info">
          ${badge ? `<div class="limo-vehicle-badges"><span class="limo-badge ${badge[1]}">${badge[0]}</span></div>` : ''}
          <h4>${escapeHtml(q.name)}</h4>
          <p>${escapeHtml(q.models || '')}</p>
          <div class="limo-amenities">
            <span class="limo-amenity" title="Passengers">👤 ${q.passengers}</span>
            <span class="limo-amenity" title="Luggage">🧳 ${q.luggage}</span>
            <span class="limo-amenity" title="WiFi">📶</span>
            <span class="limo-amenity" title="Water">💧</span>
          </div>
        </div>
        <div class="limo-vehicle-price">
          ${q.pricing.original > q.pricing.total ? `<div class="limo-price-original">$${q.pricing.original.toFixed(2)}</div>` : ''}
          <div class="limo-price-total">$${q.pricing.total.toFixed(2)}</div>
          <div class="limo-price-note">✓ Gratuity included</div>
        </div>
        <div class="limo-vehicle-radio"></div>
      </div>`;
    }).join('');

    document.querySelectorAll('.limo-vehicle-card').forEach((card) => {
      card.addEventListener('click', () => selectVehicle(card.dataset.id));
    });
  }

  function selectVehicle(id) {
    state.selectedVehicle = state.quotes.find((q) => q.id === id);
    document.querySelectorAll('.limo-vehicle-card').forEach((c) => {
      c.classList.toggle('selected', c.dataset.id === id);
    });

    setTimeout(() => {
      renderPassengerSummary();
      const capacity = Number(state.selectedVehicle?.passengers || 60);
      $('p-passengers').max = String(capacity);
      if (Number($('p-passengers').value) > capacity) $('p-passengers').value = String(capacity);
      showStep(3);
    }, 300);
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

  $('btn-back-2').addEventListener('click', () => showStep(1));
  $('btn-back-3').addEventListener('click', () => showStep(2));

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
