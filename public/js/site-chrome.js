(function () {
  function slug() {
    const raw = (location.pathname.split('/').filter(Boolean).pop() || '').toLowerCase();
    if (!raw || raw === 'index' || raw === 'index.html') return '';
    return raw.replace(/\.html$/, '');
  }
  const path = slug();
  const isHome = !path;

  if (!document.querySelector('.app-shell') && !document.querySelector('.auth-wrapper')) {
    document.body.classList.add('marketing');
    if (!document.querySelector('link[href*="marketing.css"]')) {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = '/css/marketing.css';
      document.head.appendChild(l);
    }
  }

  function payBadges() {
    return `
      <div class="pay-cards" aria-label="Accepted payment methods">
        <span class="pay-card pay-card-visa" title="Visa">
          <svg viewBox="0 0 48 32" aria-hidden="true"><rect width="48" height="32" rx="4" fill="#1A1F71"/><text x="24" y="21" text-anchor="middle" fill="#fff" font-size="11" font-weight="700" font-family="Arial,sans-serif" font-style="italic">VISA</text></svg>
        </span>
        <span class="pay-card pay-card-mc" title="Mastercard">
          <svg viewBox="0 0 48 32" aria-hidden="true"><rect width="48" height="32" rx="4" fill="#fff"/><circle cx="19" cy="16" r="9" fill="#EB001B"/><circle cx="29" cy="16" r="9" fill="#F79E1B"/><path d="M24 9.2a9 9 0 0 1 0 13.6 9 9 0 0 1 0-13.6z" fill="#FF5F00"/></svg>
        </span>
        <span class="pay-card pay-card-amex" title="American Express">
          <svg viewBox="0 0 48 32" aria-hidden="true"><rect width="48" height="32" rx="4" fill="#2E77BC"/><text x="24" y="19" text-anchor="middle" fill="#fff" font-size="7.5" font-weight="700" font-family="Arial,sans-serif">AMEX</text></svg>
        </span>
        <span class="pay-card pay-card-disc" title="Discover">
          <svg viewBox="0 0 48 32" aria-hidden="true"><rect width="48" height="32" rx="4" fill="#4A4A4A"/><text x="22" y="19" text-anchor="middle" fill="#fff" font-size="6.5" font-weight="700" font-family="Arial,sans-serif">DISCOVER</text><circle cx="36" cy="16" r="7" fill="#F47216"/></svg>
        </span>
      </div>`;
  }

  function navHtml() {
    const active = (href, extra) => {
      const file = href.replace(/^\//, '').replace(/\.html$/, '').split('#')[0];
      if (file && path === file) return ' class="active" aria-current="page"';
      const extras = (extra || []).map((e) => String(e).replace(/\.html$/, ''));
      if (extras.includes(path)) return ' class="active"';
      return '';
    };
    return `
    <div class="nav-inner">
      <a href="/" class="nav-logo" aria-label="Shipping Wish LLC Home">
        <div class="nav-logo-mark" aria-hidden="true">SW</div>
        <div class="nav-logo-text">Shipping <span>Wish</span></div>
      </a>
      <ul class="nav-links" role="list">
        <li><a href="/"${isHome ? ' class="active" aria-current="page"' : ''}>Home</a></li>
        <li class="nav-item-dropdown">
          <a href="/services"${active('/services.html', ['dispatch.html','load-booking.html','fleet-support.html','factoring.html','insurance.html','eld.html','dot-compliance.html'])}>Services ▾</a>
          <div class="nav-dropdown-menu" role="menu">
            <div class="dropdown-label">Operations</div>
            <a href="/dispatch" role="menuitem">Fleet Operations Manager</a>
            <a href="/load-booking" role="menuitem">Load Booking</a>
            <a href="/fleet-support" role="menuitem">Fleet Support</a>
            <div class="dropdown-label">Financial</div>
            <a href="/factoring" role="menuitem">Factoring</a>
            <a href="/insurance" role="menuitem">Insurance</a>
            <div class="dropdown-label">Compliance</div>
            <a href="/eld" role="menuitem">ELD &amp; Telematics</a>
            <a href="/dot-compliance" role="menuitem">DOT Compliance</a>
          </div>
        </li>
        <li><a href="/pricing"${active('/pricing.html', ['checkout.html','checkout-success.html'])}>Pricing</a></li>
        <li><a href="/carrier-search"${active('/carrier-search.html')}>Carrier Lookup</a></li>
        <li><a href="/about"${active('/about.html')}>About</a></li>
        <li><a href="/blog"${active('/blog.html', ['blog-post.html'])}>Insights</a></li>
        <li><a href="/contact"${active('/contact.html')}>Contact</a></li>
      </ul>
      <div class="nav-actions">
        <div class="live-status" aria-live="polite"><span class="live-dot" aria-hidden="true"></span> 24/7 Desk</div>
        <a href="/login" class="btn btn-secondary btn-sm" id="nav-login-btn">Sign In</a>
        <a href="/pricing" class="btn btn-primary btn-sm" id="nav-cta-btn">Start Free Week</a>
      </div>
      <button type="button" class="nav-hamburger" id="nav-hamburger" aria-label="Open menu" aria-expanded="false" aria-controls="nav-mobile"><span></span><span></span><span></span></button>
    </div>`;
  }

  function mobileHtml() {
    return `
      <a href="/" data-nav-close>Home</a>
      <a href="/services" data-nav-close>Services</a>
      <a href="/dispatch" data-nav-close>Fleet Operations</a>
      <a href="/pricing" data-nav-close>Pricing</a>
      <a href="/carrier-search" data-nav-close>Carrier Lookup</a>
      <a href="/about" data-nav-close>About</a>
      <a href="/blog" data-nav-close>Insights</a>
      <a href="/contact" data-nav-close>Contact</a>
      <div class="nav-mobile-cta-group">
        <a href="/login" class="btn btn-secondary-glass" data-nav-close>Sign In</a>
        <a href="/pricing" class="btn btn-primary-amber" data-nav-close>Start Free Week →</a>
      </div>`;
  }

  function footerHtml() {
    return `
  <div class="container">
    <div class="footer-top">
      <div class="footer-brand">
        <a href="/" class="nav-logo footer-logo">
          <div class="nav-logo-mark">SW</div>
          <div class="nav-logo-text footer-logo-text">Shipping <span>Wish</span></div>
        </a>
        <p>Dedicated fleet operations managers for motor carriers. Flat weekly subscription. You keep 100% of freight pay. TMS included.</p>
        <div class="footer-contact">
          <div class="footer-contact-item">+1 (917) 737-0021</div>
          <div class="footer-contact-item">info@shippingwish.com</div>
          <div class="footer-contact-item">Rehoboth Beach, DE</div>
        </div>
        <div style="margin-top:16px;">${payBadges()}</div>
      </div>
      <div class="footer-col">
        <h4>Services</h4>
        <ul>
          <li><a href="/dispatch">Fleet Operations Manager</a></li>
          <li><a href="/load-booking">Load Booking</a></li>
          <li><a href="/fleet-support">Fleet Support</a></li>
          <li><a href="/factoring">Factoring</a></li>
          <li><a href="/pricing">Weekly Plans</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h4>Company</h4>
        <ul>
          <li><a href="/about">About</a></li>
          <li><a href="/carrier-search">Free Carrier Lookup</a></li>
          <li><a href="/blog">Insights</a></li>
          <li><a href="/login">Carrier Portal</a></li>
          <li><a href="/contact">Contact</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h4>Legal</h4>
        <ul>
          <li><a href="/privacy-policy">Privacy Policy</a></li>
          <li><a href="/terms">Terms of Service</a></li>
        </ul>
      </div>
    </div>
    <div class="footer-bottom">
      <p>© ${new Date().getFullYear()} Shipping Wish LLC. Independent operations support — not a freight broker or motor carrier.</p>
      <p class="footer-pay-note">Secure checkout by Stripe · Visa, Mastercard, Amex &amp; Discover</p>
    </div>
  </div>`;
  }

  function setMenuOpen(open) {
    const hamburger = document.getElementById('nav-hamburger');
    const mobile = document.getElementById('nav-mobile');
    if (!mobile) return;
    mobile.classList.toggle('open', open);
    document.body.classList.toggle('nav-open', open);
    document.documentElement.classList.toggle('nav-open', open);
    if (hamburger) {
      hamburger.setAttribute('aria-expanded', open ? 'true' : 'false');
      hamburger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    }
    document.body.style.overflow = open ? 'hidden' : '';
  }

  function isMenuOpen() {
    const mobile = document.getElementById('nav-mobile');
    return !!(mobile && mobile.classList.contains('open'));
  }

  function bindGlobalNavOnce() {
    if (window.__swNavBound) return;
    window.__swNavBound = true;

    document.addEventListener('click', (e) => {
      const btn = e.target.closest && e.target.closest('#nav-hamburger, .nav-hamburger');
      if (btn) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setMenuOpen(!isMenuOpen());
        return;
      }
      if (e.target.closest && e.target.closest('[data-nav-close]')) {
        setMenuOpen(false);
      }
    }, true);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') setMenuOpen(false);
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth > 992) setMenuOpen(false);
    });
  }

  function bindLoggedIn() {
    fetch('/api/me', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data || !data.user) return;
        const btn = document.getElementById('nav-login-btn');
        if (btn) {
          btn.textContent = 'My Portal';
          const role = data.user.role || '';
          btn.href = (role === 'carrier' || role === 'driver') ? '/carrier-overview' : '/admin-dashboard';
        }
      })
      .catch(() => {});
  }

  function bindReveals() {
    const nodes = document.querySelectorAll('.reveal');
    const show = () => nodes.forEach((el) => el.classList.add('visible'));
    if (!nodes.length) return;
    if (!('IntersectionObserver' in window)) {
      show();
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -24px 0px' });
    nodes.forEach((el) => io.observe(el));
    setTimeout(show, 2200);
  }

  function loadMarketingAnimations() {
    if (window.__swMktAnimLoaded) return;
    if (document.querySelector('script[src*="marketing-animations"]')) {
      window.__swMktAnimLoaded = true;
      return;
    }
    const s = document.createElement('script');
    s.src = '/js/marketing-animations.js';
    s.defer = true;
    document.body.appendChild(s);
    window.__swMktAnimLoaded = true;
  }

  function init() {
    if (document.querySelector('.app-shell')) return;
    if (document.querySelector('.auth-wrapper')) return;

    let nav = document.querySelector('nav.nav');
    if (!nav) {
      nav = document.createElement('nav');
      nav.className = 'nav';
      nav.setAttribute('role', 'navigation');
      document.body.insertBefore(nav, document.body.firstChild);
    }
    nav.innerHTML = navHtml();

    let mobile = document.getElementById('nav-mobile');
    if (!mobile) {
      mobile = document.createElement('div');
      mobile.className = 'nav-mobile';
      mobile.id = 'nav-mobile';
      mobile.setAttribute('role', 'dialog');
      mobile.setAttribute('aria-modal', 'true');
      mobile.setAttribute('aria-label', 'Mobile navigation');
      nav.after(mobile);
    }
    mobile.innerHTML = mobileHtml();
    bindGlobalNavOnce();
    bindLoggedIn();
    bindReveals();
    loadMarketingAnimations();

    let footer = document.querySelector('footer.footer');
    if (!footer) {
      footer = document.createElement('footer');
      footer.className = 'footer';
      document.body.appendChild(footer);
    }
    footer.innerHTML = footerHtml();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
