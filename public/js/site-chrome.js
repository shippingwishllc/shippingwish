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
            <a href="/carrier-setup" role="menuitem" style="color:#facc15;font-weight:700;">⚡ Carrier Setup (Online)</a>
            <a href="/dispatch" role="menuitem">Fleet Operations Manager</a>
            <a href="/load-booking" role="menuitem">LoadNexus™ Freight Board</a>
            <a href="/mobile-apps" role="menuitem" style="color:#60a5fa;font-weight:700;">📱 4 Mobile Apps Suite</a>
            <a href="/downloads" role="menuitem" style="color:#34d399;font-weight:700;">📥 App Downloads (APK)</a>
            <a href="/fleet-support" role="menuitem">Fleet Support</a>
            <div class="dropdown-label">Financial</div>
            <a href="/factoring" role="menuitem">Factoring</a>
            <a href="/insurance" role="menuitem">Insurance</a>
            <div class="dropdown-label">Compliance</div>
            <a href="/eld" role="menuitem">ELD &amp; Telematics</a>
            <a href="/dot-compliance" role="menuitem">DOT Compliance</a>
          </div>
        </li>
        <li><a href="/carrier-setup"${active('/carrier-setup.html')}>Carrier Setup</a></li>
        <li><a href="/pricing"${active('/pricing.html', ['checkout.html','checkout-success.html'])}>Pricing</a></li>
        <li><a href="/carrier-search"${active('/carrier-search.html')}>Carrier Lookup</a></li>
        <li><a href="/about"${active('/about.html')}>About</a></li>
        <li><a href="/blog"${active('/blog.html', ['blog-post.html'])}>Insights</a></li>
        <li><a href="/contact"${active('/contact.html')}>Contact</a></li>
      </ul>
      <div class="nav-actions">
        <div class="live-status" aria-live="polite"><span class="live-dot" aria-hidden="true"></span> 24/7 Desk</div>
        <a href="/carrier-setup" class="btn btn-secondary btn-sm" id="nav-setup-btn" style="border-color:#eab308;color:#facc15;">Carrier Setup</a>
        <a href="/login" class="btn btn-secondary btn-sm" id="nav-login-btn">Sign In</a>
        <a href="/pricing" class="btn btn-primary btn-sm" id="nav-cta-btn">Start Free Week</a>
      </div>
      <button type="button" class="nav-hamburger" id="nav-hamburger" aria-label="Open menu" aria-expanded="false" aria-controls="nav-mobile"><span></span><span></span><span></span></button>
    </div>`;
  }

  function mobileHtml() {
    return `
      <a href="/" data-nav-close>Home</a>
      <a href="/carrier-setup" data-nav-close style="color:#facc15;font-weight:700;">⚡ Carrier Setup (Online)</a>
      <a href="/load-booking" data-nav-close>LoadNexus™ Freight Board</a>
      <a href="/mobile-apps" data-nav-close style="color:#60a5fa;font-weight:700;">📱 4 Mobile Apps (Expo Go)</a>
      <a href="/downloads" data-nav-close style="color:#34d399;font-weight:700;">📥 App Downloads (APK)</a>
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
  <div class="container" style="max-width:1380px;">
    <div class="footer-top enterprise-footer-grid">
      <!-- Col 1: Brand, Headquarters, Hotline, App Badges -->
      <div class="footer-brand" style="max-width:none;">
        <a href="/" class="nav-logo footer-logo">
          <div class="nav-logo-mark">SW</div>
          <div class="nav-logo-text footer-logo-text">Shipping <span>Wish</span></div>
        </a>
        <p style="max-width:320px;font-size:13px;line-height:1.6;color:rgba(255,255,255,0.7);margin-top:12px;">
          Premier U.S. freight dispatch, load booking, and fleet operations management. Dedicated managers, 100% direct broker pay, zero forced dispatch.
        </p>
        
        <div class="footer-contact" style="margin-top:14px;font-size:12px;display:flex;flex-direction:column;gap:6px;">
          <div class="footer-contact-item">📞 <a href="tel:+19177370021" style="color:#fbbf24;font-weight:700;">+1 (917) 737-0021</a> (24/7 Ops)</div>
          <div class="footer-contact-item">✉️ <a href="mailto:info@shippingwish.com" style="color:#cbd5e1;">info@shippingwish.com</a></div>
          <div class="footer-contact-item">📍 19266 Coastal Hwy, Rehoboth Beach, DE 19971</div>
        </div>

        <div class="footer-app-badges">
          <a href="/login" class="footer-app-btn" title="Carrier Portal App for iOS">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.62-.75 1.04-1.8 1.01-2.87-.96.04-2.12.64-2.8 1.43-.6.68-1.12 1.76-.98 2.81 1.07.08 2.16-.58 2.77-1.37z"/></svg>
            <span>iOS App</span>
          </a>
          <a href="/login" class="footer-app-btn" title="Carrier Portal App for Android">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M3.5 2.2 14.2 12 3.5 21.8V2.2Z" fill="#EA4335"/><path d="M14.2 12 17.6 8.9l3.7 2.1c1.1.63 1.1 2.37 0 3l-3.7 2.1L14.2 12Z" fill="#FBBC04"/><path d="M14.2 12 3.5 21.8l10.7-6.1L17.6 15.1 14.2 12Z" fill="#4285F4"/><path d="M14.2 12 17.6 8.9 14.2 5.8 3.5 2.2 14.2 12Z" fill="#34A853"/></svg>
            <span>Android App</span>
          </a>
        </div>
      </div>

      <!-- Col 2: Equipment Dispatched -->
      <div class="footer-col">
        <h4>Equipment</h4>
        <ul>
          <li><a href="/services#dispatch">🚚 53' Dry Van</a></li>
          <li><a href="/services#dispatch">❄️ 53' Reefer (Cold Chain)</a></li>
          <li><a href="/services#dispatch">🏗️ Flatbed &amp; Stepdeck</a></li>
          <li><a href="/services#dispatch">📦 26' Box Truck / Hotshot</a></li>
          <li><a href="/services#dispatch">🔄 Power Only (Drop &amp; Hook)</a></li>
          <li><a href="/services#dispatch">🚗 Auto &amp; Specialized</a></li>
        </ul>
      </div>

      <!-- Col 3: Operations & Desks -->
      <div class="footer-col">
        <h4>Operations</h4>
        <ul>
          <li><a href="/carrier-setup" style="color:#facc15;font-weight:700;">⚡ 2-Min Carrier Setup</a></li>
          <li><a href="/dispatch">Fleet Operations Desk</a></li>
          <li><a href="/load-booking">Load Board Hunting</a></li>
          <li><a href="/fleet-support">Fleet &amp; Driver Support</a></li>
          <li><a href="/factoring">24-Hour Factoring Setup</a></li>
          <li><a href="/insurance">Commercial Insurance</a></li>
          <li><a href="/pricing">Weekly Plans ($149/wk)</a></li>
        </ul>
      </div>

      <!-- Col 4: Carrier Tech & Tools -->
      <div class="footer-col">
        <h4>Tech &amp; Tools</h4>
        <ul>
          <li><a href="/load-booking" style="color:#60a5fa;font-weight:700;">LoadNexus™ Load Board</a></li>
          <li><a href="/mobile-apps" style="color:#34d399;font-weight:700;">📱 4 Mobile Apps Suite</a></li>
          <li><a href="/downloads" style="color:#60a5fa;font-weight:700;">📥 Mobile Downloads (APK)</a></li>
          <li><a href="/carrier-search">Free FMCSA Carrier Lookup</a></li>
          <li><a href="/services#pricing">RPM Revenue Calculator</a></li>
          <li><a href="/login">Carrier Owner Cockpit</a></li>
          <li><a href="/driver-app">Driver Mobile Console</a></li>
          <li><a href="/eld">Advance Track ELD / GPS</a></li>
          <li><a href="/dot-compliance">IFTA &amp; Safety Audits</a></li>
        </ul>
      </div>

      <!-- Col 5: Company & Governance -->
      <div class="footer-col">
        <h4>Company</h4>
        <ul>
          <li><a href="/about">About Shipping Wish LLC</a></li>
          <li><a href="/about#team">Executive Leadership</a></li>
          <li><a href="/about#compliance">Corporate Legal Filings</a></li>
          <li><a href="/blog">Freight Insights &amp; Blog</a></li>
          <li><a href="/contact">24/7 Operations Desk</a></li>
          <li><a href="/contact?subject=careers">Dispatcher Careers</a></li>
          <li><a href="/contact?subject=broker-partner">Broker Partner Network</a></li>
        </ul>
      </div>

      <!-- Col 6: Compliance & Legal -->
      <div class="footer-col">
        <h4>Compliance</h4>
        <ul>
          <li><a href="/privacy-policy">Privacy Policy</a></li>
          <li><a href="/terms">Terms of Service</a></li>
          <li><a href="/services#faq">Carrier Bill of Rights</a></li>
          <li><a href="/terms#zero-forced">Zero Forced Dispatch Policy</a></li>
          <li><a href="/terms#anti-double">Anti-Double Brokering Rules</a></li>
          <li><a href="/terms#security">Stripe 256-Bit Encryption</a></li>
          <li><a href="/services#faq">FAQ &amp; Knowledge Base</a></li>
        </ul>
      </div>
    </div>

    <!-- Middle Strip: Corporate Telematics Synergy & Security Badges -->
    <div style="border-top:1px solid rgba(255,255,255,0.08);padding:18px 0;display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:14px;font-size:12px;color:rgba(255,255,255,0.65);">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        <span style="display:inline-flex;align-items:center;gap:6px;color:#34d399;font-weight:700;">
          <span style="width:8px;height:8px;border-radius:50%;background:#34d399;box-shadow:0 0 6px #34d399;display:inline-block;"></span>
          TMS &amp; Desk Systems Operational (99.98% SLA)
        </span>
        <span>&bull;</span>
        <span>Verified Freight Operations Desk &amp; TMS</span>
        <span>&bull;</span>
        <span>Integrated with <a href="https://advancetracksystem.com" target="_blank" rel="noopener" style="color:#38bdf8;font-weight:700;text-decoration:underline;">Advance Track AI Telematics</a></span>
      </div>
      <div>
        ${payBadges()}
      </div>
    </div>

    <!-- Bottom Legal Copyright -->
    <div class="footer-bottom" style="padding-top:14px;">
      <p style="font-size:12px;color:rgba(255,255,255,0.5);margin:0;">
        &copy; ${new Date().getFullYear()} Shipping Wish LLC. All rights reserved. 19266 Coastal Hwy, Rehoboth Beach, DE 19971. Independent freight dispatch and fleet operations management company. We are not a freight broker or motor carrier; we represent motor carriers under dispatch management agency.
      </p>
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
