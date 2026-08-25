(function () {
  const path = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const isHome = path === '' || path === 'index.html' || path === '/';

  function navHtml() {
    const active = (href, extra) => {
      const file = href.replace(/^\//, '').split('#')[0];
      if (file && path === file) return ' class="active" aria-current="page"';
      if (extra && extra.includes(path)) return ' class="active"';
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
          <a href="/services.html"${active('/services.html', ['dispatch.html','load-booking.html','fleet-support.html','factoring.html','insurance.html','eld.html','dot-compliance.html'])}>Services ▾</a>
          <div class="nav-dropdown-menu" role="menu">
            <div class="dropdown-label">Operations</div>
            <a href="/dispatch.html" role="menuitem">Freight Operations</a>
            <a href="/load-booking.html" role="menuitem">Load Booking</a>
            <a href="/fleet-support.html" role="menuitem">Fleet Support</a>
            <div class="dropdown-label">Financial</div>
            <a href="/factoring.html" role="menuitem">Factoring</a>
            <a href="/insurance.html" role="menuitem">Insurance</a>
            <div class="dropdown-label">Compliance</div>
            <a href="/eld.html" role="menuitem">ELD &amp; Telematics</a>
            <a href="/dot-compliance.html" role="menuitem">DOT Compliance</a>
          </div>
        </li>
        <li><a href="/about.html"${active('/about.html')}>About</a></li>
        <li><a href="/blog.html"${active('/blog.html', ['blog-post.html'])}>Blog</a></li>
        <li><a href="/contact.html#pricing"${path === 'contact.html' ? ' class="active"' : ''}>Pricing</a></li>
        <li><a href="/contact.html"${active('/contact.html')}>Contact</a></li>
      </ul>
      <div class="nav-actions">
        <div class="live-status" aria-live="polite"><span class="live-dot" aria-hidden="true"></span> Operations Desk</div>
        <a href="/login.html" class="btn btn-secondary btn-sm" id="nav-login-btn">Sign In</a>
        <a href="/contact.html" class="btn btn-primary btn-sm" id="nav-cta-btn">Get Started</a>
      </div>
      <button class="nav-hamburger" id="nav-hamburger" aria-label="Open menu" aria-expanded="false"><span></span><span></span><span></span></button>
    </div>`;
  }

  function mobileHtml() {
    return `
      <a href="/">Home</a>
      <a href="/services.html">Services</a>
      <a href="/dispatch.html">Freight Operations</a>
      <a href="/about.html">About</a>
      <a href="/blog.html">Blog</a>
      <a href="/contact.html">Contact</a>
      <div class="nav-mobile-cta-group">
        <a href="/login.html" class="btn btn-secondary-glass">Sign In</a>
        <a href="/contact.html" class="btn btn-primary-amber">Get Started →</a>
      </div>`;
  }

  function footerHtml() {
    return `
  <div class="container">
    <div class="footer-top">
      <div class="footer-brand">
        <a href="/" class="nav-logo">
          <div class="nav-logo-mark">SW</div>
          <div class="nav-logo-text">Shipping <span>Wish</span></div>
        </a>
        <p>Delaware LLC. Dedicated fleet operations managers for U.S. motor carriers. Weekly retainer. You keep freight pay.</p>
        <div class="footer-contact">
          <div class="footer-contact-item">+1 (917) 737-0021</div>
          <div class="footer-contact-item">info@shippingwish.com</div>
          <div class="footer-contact-item">Rehoboth Beach, DE</div>
        </div>
      </div>
      <div class="footer-col">
        <h4>Services</h4>
        <ul>
          <li><a href="/dispatch.html">Freight Operations</a></li>
          <li><a href="/load-booking.html">Load Booking</a></li>
          <li><a href="/fleet-support.html">Fleet Support</a></li>
          <li><a href="/factoring.html">Factoring</a></li>
          <li><a href="/contact.html#pricing">Pricing</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h4>Company</h4>
        <ul>
          <li><a href="/about.html">About</a></li>
          <li><a href="/blog.html">Blog</a></li>
          <li><a href="/login.html">Carrier Portal</a></li>
          <li><a href="/contact.html">Contact</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h4>Legal</h4>
        <ul>
          <li><a href="/privacy-policy.html">Privacy Policy</a></li>
          <li><a href="/terms.html">Terms of Service</a></li>
        </ul>
      </div>
    </div>
    <div class="footer-bottom">
      <p>© ${new Date().getFullYear()} Shipping Wish LLC. Registered in Delaware, USA.</p>
      <p>Independent operations support — not a freight broker or motor carrier.</p>
    </div>
  </div>`;
  }

  function bindNav(nav, mobile) {
    const hamburger = nav.querySelector('#nav-hamburger');
    if (hamburger && mobile) {
      hamburger.addEventListener('click', () => {
        const open = mobile.classList.toggle('open');
        hamburger.setAttribute('aria-expanded', open ? 'true' : 'false');
        document.body.style.overflow = open ? 'hidden' : '';
      });
    }
    fetch('/api/me', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data || !data.user) return;
        const btn = document.getElementById('nav-login-btn');
        if (btn) {
          btn.textContent = 'My Portal';
          const role = data.user.role || '';
          btn.href = (role === 'carrier' || role === 'driver') ? '/dashboard.html' : '/admin-dashboard.html';
        }
      })
      .catch(() => {});
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
      nav.after(mobile);
    }
    mobile.innerHTML = mobileHtml();
    bindNav(nav, mobile);

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
