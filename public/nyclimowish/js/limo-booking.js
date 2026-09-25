(function () {
  const state = {
    serviceType: 'point_to_point',
    pickup: '', dropoff: '', pickupDate: '', pickupTime: '',
    hours: 3, miles: 0, durationMins: 0, routeIsEstimate: true,
    quotes: [], selectedVehicle: null, bookingId: null, bookingNumber: null
  };

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

  const params = new URLSearchParams(window.location.search);
  if (params.get('pickup')) $('b-pickup').value = params.get('pickup');
  if (params.get('dropoff')) $('b-dropoff').value = params.get('dropoff');
  if (params.get('pickupDate')) $('b-date').value = params.get('pickupDate');
  if (params.get('pickupTime')) $('b-time').value = params.get('pickupTime');
  if (params.get('serviceType') === 'hourly') setTab('hourly');

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
    $('b-dropoff-wrap').style.display = type === 'hourly' ? 'none' : 'block';
    $('b-duration-wrap').style.display = type === 'hourly' ? 'block' : 'none';
  }

  $('btn-step1').addEventListener('click', async () => {
    state.pickup = $('b-pickup').value.trim();
    state.dropoff = $('b-dropoff').value.trim();
    state.pickupDate = $('b-date').value;
    state.pickupTime = $('b-time').value;
    state.hours = parseFloat($('b-hours').value) || 3;

    if (!state.pickup || !state.pickupDate || !state.pickupTime) {
      alert('Please fill in pickup, date, and time.');
      return;
    }
    if (state.serviceType === 'point_to_point' && !state.dropoff) {
      alert('Please enter a drop-off location.');
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
          pickup: state.pickup,
          dropoff: state.dropoff,
          hours: state.hours
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      state.quotes = data.quotes;
      state.miles = data.distance?.miles || 0;
      state.durationMins = data.distance?.durationMins || 0;
      state.routeIsEstimate = data.distance?.isEstimate !== false;

      renderSidebar();
      renderVehicles();
      showStep(2);
    } catch (err) {
      alert('Could not calculate pricing: ' + err.message);
    } finally {
      $('btn-step1').disabled = false;
      $('btn-step1').textContent = 'Continue →';
    }
  });

  function renderSidebar() {
    $('sb-pickup').textContent = state.pickup;
    $('sb-dropoff').textContent = state.serviceType === 'hourly' ? 'Hourly Service' : state.dropoff;
    const d = new Date(state.pickupDate + 'T' + state.pickupTime);
    $('sb-datetime').textContent = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) + ' at ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    if (state.serviceType === 'hourly') {
      $('sb-duration').textContent = state.hours + ' hours';
      $('sidebar-stats').textContent = '';
    } else {
      $('sb-duration').textContent = '';
      $('sidebar-stats').textContent = state.miles + ' mi · ' + Math.floor(state.durationMins / 60) + 'h ' + (state.durationMins % 60) + 'm · ' + (state.routeIsEstimate ? 'estimated route' : 'road route');
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
          <h4>${q.name}</h4>
          <p>${q.models || ''}</p>
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
      showStep(3);
    }, 300);
  }

  function renderPassengerSummary() {
    const v = state.selectedVehicle;
    if (!v) return;
    $('summary-vehicle').innerHTML = `<strong>${v.name}</strong><br><span style="color:#666;font-size:0.85rem;">${v.models || ''}</span>`;
    $('price-breakdown').innerHTML = priceHtml(v.pricing);
    $('final-price').innerHTML = priceHtml(v.pricing);
  }

  function priceHtml(p) {
    return `<div class="limo-price-row"><span>Base fare</span><span>$${p.subtotal.toFixed(2)}</span></div>
      ${p.tolls > 0 ? `<div class="limo-price-row"><span>Tolls</span><span>$${p.tolls.toFixed(2)}</span></div>` : ''}
      <div class="limo-price-row"><span>Gratuity (included)</span><span>$${p.gratuity.toFixed(2)}</span></div>
      <div class="limo-price-row total"><span>Total</span><span>$${p.total.toFixed(2)}</span></div>
      <p style="font-size:0.75rem;color:#999;margin-top:8px;">ℹ All-Inclusive Price</p>`;
  }

  $('btn-step3').addEventListener('click', async () => {
    const first = $('p-first').value.trim();
    const last = $('p-last').value.trim();
    const email = $('p-email').value.trim();
    const phone = $('p-phone').value.trim();
    if (!first || !last || !email || !phone) {
      alert('Please fill in all passenger details.');
      return;
    }

    $('btn-step3').disabled = true;
    $('btn-step3').textContent = 'Creating booking...';

    try {
      const res = await fetch('/api/nyclimo/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceType: state.serviceType,
          pickup: state.pickup,
          dropoff: state.dropoff,
          pickupDate: state.pickupDate,
          pickupTime: state.pickupTime,
          durationHours: state.hours,
          distanceMiles: state.miles,
          durationMins: state.durationMins,
          vehicleId: state.selectedVehicle.id,
          firstName: first,
          lastName: last,
          email,
          phone,
          tripNotes: $('p-notes').value,
          passengers: parseInt($('p-passengers').value || '1', 10),
          childSeats: $('p-child-seats').checked ? 1 : 0,
          referralCode: params.get('ref') || params.get('referral') || undefined
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      state.bookingId = data.booking.id;
      state.bookingNumber = data.booking.booking_number;
      $('btn-pay').disabled = data.booking.status !== 'operator_accepted';
      $('operator-status').textContent = data.booking.status === 'operator_accepted'
        ? 'A licensed operator accepted your request. Payment is ready.'
        : 'Your request is with verified licensed operators. We will enable payment as soon as a partner accepts.';
      showStep(4);
      pollOperatorStatus();
    } catch (err) {
      alert('Booking failed: ' + err.message);
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
