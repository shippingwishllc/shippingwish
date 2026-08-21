// ---- mobile nav ----
document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      links.classList.toggle('open');
    });
    links.querySelectorAll('a').forEach(a => a.addEventListener('click', () => links.classList.remove('open')));
    document.addEventListener('click', (e) => {
      if (!links.contains(e.target) && !toggle.contains(e.target)) {
        links.classList.remove('open');
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') links.classList.remove('open');
    });
  }

  initOdometers();
  initCounters();
  initContactForm();
});

// ---- odometer-style KPI digits (dispatch board in hero) ----
function renderOdometer(el, value, digits) {
  const str = String(value).padStart(digits, '0');
  el.innerHTML = str.split('').map(d => `<span class="digit">${d}</span>`).join('');
}

function animateOdometer(el, target, digits, duration = 1400) {
  const start = performance.now();
  function tick(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(target * eased);
    renderOdometer(el, current, digits);
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function initOdometers() {
  const nodes = document.querySelectorAll('[data-odometer]');
  if (!nodes.length) return;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const target = parseInt(el.dataset.odometer, 10);
        const digits = parseInt(el.dataset.digits || '3', 10);
        animateOdometer(el, target, digits);
        observer.unobserve(el);
      }
    });
  }, { threshold: 0.4 });
  nodes.forEach(el => observer.observe(el));
}

// ---- plain number counters (KPI cards section) ----
function initCounters() {
  const nodes = document.querySelectorAll('[data-counter]');
  if (!nodes.length) return;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const target = parseFloat(el.dataset.counter);
        const suffix = el.dataset.suffix || '';
        const decimals = el.dataset.decimals ? parseInt(el.dataset.decimals, 10) : 0;
        const duration = 1500;
        const start = performance.now();
        function tick(now) {
          const progress = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          const current = target * eased;
          el.textContent = current.toFixed(decimals) + suffix;
          if (progress < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
        observer.unobserve(el);
      }
    });
  }, { threshold: 0.4 });
  nodes.forEach(el => observer.observe(el));
}

// ---- Request Service / Contact form ----
function initContactForm() {
  const form = document.getElementById('contact-form');
  if (!form) return;
  const msg = document.getElementById('form-msg');
  const btn = form.querySelector('button[type="submit"]');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.className = 'form-msg';
    msg.textContent = '';
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = 'Sending…';

    const data = Object.fromEntries(new FormData(form).entries());

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Something went wrong.');
      msg.className = 'form-msg ok';
      msg.textContent = "Request received — a dispatcher will call you shortly. Check your email for confirmation.";
      form.reset();
    } catch (err) {
      msg.className = 'form-msg err';
      msg.textContent = err.message || 'Could not send your request. Please call +1 917 737 0021.';
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  });
}
