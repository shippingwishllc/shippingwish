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

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const params = new URLSearchParams(new FormData(form));
    window.location.href = '/book?' + params.toString();
  });

  const params = new URLSearchParams(window.location.search);
  if (params.get('pickup')) document.getElementById('pickup').value = params.get('pickup');
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
