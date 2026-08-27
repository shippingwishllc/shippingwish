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

  function animateCounter(el, options) {
    const target = parseFloat(el.dataset.heroCounter || el.dataset.counter || '0');
    const duration = options.immediate ? 0 : parseInt(el.dataset.duration || '1400', 10);
    if (reduced || duration === 0) {
      el.textContent = formatValue(target, el);
      return;
    }
    const start = performance.now();
    function tick(now) {
      const progress = Math.min((now - start) / duration, 1);
      const current = target * easeOutCubic(progress);
      el.textContent = formatValue(current, el);
      if (progress < 1) requestAnimationFrame(tick);
      else el.textContent = formatValue(target, el);
    }
    requestAnimationFrame(tick);
  }

  function initHeroCounters() {
    document.querySelectorAll('[data-hero-counter]').forEach((el, i) => {
      setTimeout(() => animateCounter(el, { immediate: false }), 400 + i * 120);
    });
  }

  function initScrollCounters() {
    const nodes = document.querySelectorAll('.mkt-stat-num[data-counter]');
    if (!nodes.length) return;
    if (reduced) {
      nodes.forEach((el) => {
        el.textContent = formatValue(parseFloat(el.dataset.counter), el);
      });
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const target = parseFloat(entry.target.dataset.counter || '0');
        if (target === 0) {
          entry.target.textContent = formatValue(0, entry.target);
        } else {
          entry.target.textContent = formatValue(0, entry.target);
          animateCounter(entry.target, { immediate: false });
        }
        entry.target.closest('.mkt-stat')?.classList.add('is-counted');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.35 });

    nodes.forEach((el) => observer.observe(el));
  }

  function initKpiGrids() {
    const grids = document.querySelectorAll('.mkt-kpi-grid');
    grids.forEach((grid) => {
      const counters = grid.querySelectorAll('[data-counter]:not(.mkt-stat-num)');
      if (reduced) {
        grid.classList.add('is-visible');
        counters.forEach((el) => {
          el.textContent = formatValue(parseFloat(el.dataset.counter || '0'), el);
        });
        return;
      }

      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          grid.classList.add('is-visible');
          counters.forEach((el, idx) => {
            const target = parseFloat(el.dataset.counter || '0');
            setTimeout(() => {
              el.textContent = formatValue(0, el);
              if (target > 0) animateCounter(el, { immediate: false });
              else el.textContent = formatValue(0, el);
            }, 200 + idx * 100);
          });
          observer.unobserve(entry.target);
        });
      }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

      observer.observe(grid);
    });
  }

  function initStatPop() {
    const stats = document.querySelectorAll('.mkt-stat-pop');
    if (!stats.length || reduced) {
      stats.forEach((s) => s.classList.add('is-visible'));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.2 });
    stats.forEach((el) => observer.observe(el));
  }

  function init() {
    initHeroCounters();
    initScrollCounters();
    initKpiGrids();
    initStatPop();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
