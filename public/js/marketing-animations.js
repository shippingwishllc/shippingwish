(function () {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function formatValue(value, el) {
    const decimals = parseInt(el.dataset.decimals || '0', 10);
    const prefix = el.dataset.prefix || '';
    const suffix = el.dataset.suffix || '';
    const n = decimals ? value.toFixed(decimals) : String(Math.round(value));
    if (el.dataset.format === 'currency') {
      return prefix + Number(n).toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      }) + suffix;
    }
    return prefix + n + suffix;
  }

  function counterTarget(el) {
    return parseFloat(el.dataset.counter || el.dataset.heroMetric || el.dataset.heroCounter || '0');
  }

  function animateCounter(el, duration) {
    const target = counterTarget(el);
    const ms = duration || parseInt(el.dataset.duration || '1200', 10);
    if (reduced || ms === 0) {
      el.textContent = formatValue(target, el);
      return;
    }
    const start = performance.now();
    function tick(now) {
      const progress = Math.min((now - start) / ms, 1);
      const current = target * easeOutCubic(progress);
      el.textContent = formatValue(current, el);
      if (progress < 1) requestAnimationFrame(tick);
      else el.textContent = formatValue(target, el);
    }
    el.textContent = formatValue(0, el);
    requestAnimationFrame(tick);
  }

  /** One hero metric only — keeps landing professional */
  function initHeroMetric() {
    const el = document.querySelector('[data-hero-metric]');
    if (!el) return;
    if (reduced) {
      el.textContent = formatValue(counterTarget(el), el);
      return;
    }
    setTimeout(() => animateCounter(el, 1400), 500);
  }

  function initMotionBlocks() {
    document.querySelectorAll('[data-motion]').forEach((block) => {
      const mode = block.dataset.motion;
      const items = block.querySelectorAll('.motion-item');
      const counters = block.querySelectorAll('[data-counter]');

      if (reduced) {
        block.classList.add('is-inview');
        counters.forEach((el) => {
          el.textContent = formatValue(parseFloat(el.dataset.counter || '0'), el);
        });
        return;
      }

      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          block.classList.add('is-inview');

          if (mode === 'pricing') {
            counters.forEach((el, idx) => {
              setTimeout(() => animateCounter(el, 1000), 180 + idx * 120);
            });
          }

          if (mode === 'stats') {
            counters.forEach((el) => {
              const target = parseFloat(el.dataset.counter || '0');
              if (target === 0) el.textContent = formatValue(0, el);
              else animateCounter(el, 1100);
            });
          }

          observer.unobserve(entry.target);
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -32px 0px' });

      observer.observe(block);
    });
  }

  function initLiveLoadboardTicker() {
    const card = document.getElementById('hero-load-card');
    if (!card) return;

    let corridors = [];
    let currentIndex = 0;
    let tickerInterval = null;

    function fetchLiveStats() {
      fetch('/api/loadboard/public-stats')
        .then(res => res.json())
        .then(data => {
          if (!data || !data.ok) return;

          // Update KPIs to match live loadboard scale
          const kpiLoads = document.getElementById('hero-kpi-loads');
          if (kpiLoads && data.loads_today) kpiLoads.textContent = data.loads_today;

          const kpiRpm = document.getElementById('hero-kpi-rpm');
          if (kpiRpm && data.avg_rpm) kpiRpm.textContent = data.avg_rpm;

          if (data.live_corridors && data.live_corridors.length) {
            corridors = data.live_corridors;
          }

          if (!tickerInterval && corridors.length) {
            tickerInterval = setInterval(rotateCard, 4200);
          }
        })
        .catch(() => {});
    }

    function rotateCard() {
      if (!corridors || !corridors.length) return;
      currentIndex = (currentIndex + 1) % corridors.length;
      const c = corridors[currentIndex];

      card.style.opacity = '0.3';
      setTimeout(() => {
        const idEl = document.getElementById('hero-load-id');
        const metricsEl = document.getElementById('hero-load-metrics');
        const payEl = document.getElementById('hero-load-pay');
        const origEl = document.getElementById('hero-load-origin');
        const destEl = document.getElementById('hero-load-dest');
        const noteEl = document.getElementById('hero-load-note');

        if (idEl) idEl.textContent = c.id;
        if (metricsEl) metricsEl.textContent = `${c.miles} mi · $${Number(c.rpm).toFixed(2)} / mi · ${c.equipment}`;
        if (payEl) payEl.textContent = Number(c.rate).toLocaleString();
        if (origEl) origEl.textContent = c.origin;
        if (destEl) destEl.textContent = c.destination;
        if (noteEl) noteEl.textContent = `${c.broker} (${c.commodity}). Direct broker pay goes to your bank.`;

        card.style.opacity = '1';
      }, 250);
    }

    fetchLiveStats();
    // Periodically refresh stats and corridors every 45s for runtime freshness
    setInterval(fetchLiveStats, 45000);
  }

  function init() {
    initHeroMetric();
    initMotionBlocks();
    initLiveLoadboardTicker();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
