(function () {
  const tabs = document.querySelectorAll('.limo-tab');
  const serviceType = document.getElementById('serviceType');
  const dropoffField = document.getElementById('dropoff-field');
  const durationField = document.getElementById('duration-field');
  const form = document.getElementById('hero-book-form');
  const dateInput = document.getElementById('pickupDate');
  const timeInput = document.getElementById('pickupTime');

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  dateInput.min = tomorrow.toISOString().split('T')[0];
  dateInput.value = tomorrow.toISOString().split('T')[0];
  timeInput.value = '12:00';

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const type = tab.dataset.tab;
      serviceType.value = type;
      if (type === 'hourly') {
        dropoffField.style.display = 'none';
        durationField.style.display = 'block';
      } else {
        dropoffField.style.display = 'block';
        durationField.style.display = 'none';
      }
    });
  });

  const pickupInput = document.getElementById('pickup');
  const dropoffInput = document.getElementById('dropoff');
  const pickupPlaceId = document.getElementById('pickupPlaceId');
  const pickupSessionToken = document.getElementById('pickupSessionToken');
  const dropoffPlaceId = document.getElementById('dropoffPlaceId');
  const dropoffSessionToken = document.getElementById('dropoffSessionToken');

  const sessions = new WeakMap();

  function makeUuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  function tokenFor(input) {
    if (!sessions.has(input)) sessions.set(input, makeUuid());
    return sessions.get(input);
  }

  function resetToken(input) {
    sessions.set(input, makeUuid());
  }

  function hideList(list) {
    if (!list) return;
    list.hidden = true;
    list.innerHTML = '';
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }

  function bindAddressAutocomplete(input, placeIdInput, tokenInput) {
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
        if (placeIdInput) placeIdInput.value = '';
        if (tokenInput) tokenInput.value = '';
      }
      clearTimeout(timer);
      const value = input.value.trim();
      if (value.length < 3) {
        hideList(list);
        if (!value) resetToken(input);
        return;
      }
      timer = setTimeout(() => searchAddress(input, list, placeIdInput, tokenInput), 280);
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

  async function searchAddress(input, list, placeIdInput, tokenInput) {
    const query = input.value.trim();
    if (!list || query.length < 3) return;
    const token = tokenFor(input);
    try {
      const res = await fetch('/api/nyclimo/places/autocomplete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: query, sessionToken: token })
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
          if (placeIdInput) placeIdInput.value = item.placeId || '';
          if (tokenInput) tokenInput.value = token || '';
          hideList(list);
        });
      });
    } catch (_) {
      hideList(list);
    }
  }

  bindAddressAutocomplete(pickupInput, pickupPlaceId, pickupSessionToken);
  bindAddressAutocomplete(dropoffInput, dropoffPlaceId, dropoffSessionToken);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const params = new URLSearchParams(new FormData(form));
    window.location.href = '/book?' + params.toString();
  });

  const params = new URLSearchParams(window.location.search);
  if (params.get('pickup') && pickupInput) pickupInput.value = params.get('pickup');
  if (params.get('dropoff') && dropoffInput) dropoffInput.value = params.get('dropoff');
  if (params.get('type') === 'hourly') tabs[1].click();

  document.getElementById('corporate-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    btn.textContent = 'Sending...';
    try {
      const res = await fetch('/api/corporate-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(fd))
      });
      if (res.ok) {
        btn.textContent = 'Submitted ✓';
        e.target.reset();
      } else {
        btn.textContent = 'Try Again';
        btn.disabled = false;
      }
    } catch {
      btn.textContent = 'Try Again';
      btn.disabled = false;
    }
  });

  const cityRoutes = {
    nyc: [
      ['New York ⇆ JFK Airport', '45 min', '16 mi'],
      ['New York ⇆ LaGuardia', '30 min', '10 mi'],
      ['New York ⇆ Newark (EWR)', '50 min', '18 mi'],
      ['New York ⇆ Boston', '3h 51m', '217 mi'],
      ['New York ⇆ Philadelphia', '2h 3m', '97 mi'],
      ['New York ⇆ Washington DC', '4h 6m', '229 mi']
    ],
    miami: [
      ['Miami ⇆ MIA Airport', '25 min', '12 mi'],
      ['Miami ⇆ Fort Lauderdale', '35 min', '28 mi'],
      ['Miami ⇆ Palm Beach', '1h 22m', '73 mi'],
      ['Miami ⇆ Key West', '3h 30m', '160 mi']
    ],
    boston: [
      ['Boston ⇆ Logan Airport', '20 min', '8 mi'],
      ['Boston ⇆ New York', '3h 51m', '217 mi'],
      ['Boston ⇆ Cape Cod', '1h 30m', '80 mi']
    ],
    dc: [
      ['DC ⇆ Dulles Airport', '40 min', '28 mi'],
      ['DC ⇆ Reagan National', '15 min', '5 mi'],
      ['DC ⇆ Baltimore', '1h', '40 mi']
    ],
    philly: [
      ['Philadelphia ⇆ PHL Airport', '20 min', '10 mi'],
      ['Philadelphia ⇆ New York', '2h 3m', '97 mi'],
      ['Philadelphia ⇆ Atlantic City', '1h', '60 mi']
    ],
    nj: [
      ['Newark ⇆ JFK', '50 min', '35 mi'],
      ['Jersey City ⇆ Manhattan', '20 min', '8 mi'],
      ['Newark ⇆ Philadelphia', '1h 30m', '85 mi']
    ]
  };

  document.querySelectorAll('.limo-city-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.limo-city-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const routes = cityRoutes[btn.dataset.city] || cityRoutes.nyc;
      document.getElementById('routes-body').innerHTML = routes
        .map(([r, t, d]) => `<tr><td>${r}</td><td>${t}</td><td>${d}</td></tr>`)
        .join('');
    });
  });
})();
