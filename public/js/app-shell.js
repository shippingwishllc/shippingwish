(function () {
  const STAFF_LINKS = [
    { section: 'Operations' },
    { key: 'overview', href: '/admin-dashboard.html', icon: '📊', label: 'Overview & Loads' },
    { key: 'dispatch', href: '/dispatcher-dashboard.html', icon: '🎧', label: 'Dispatch Desk' },
    { key: 'brokers', href: '/brokers.html', icon: '🤝', label: 'Broker Directory' },
    { key: 'fleet', href: '/fleet.html', icon: '🚛', label: 'Fleet & Drivers' },
    { section: 'Sales & Staff' },
    { key: 'crm', href: '/crm-sales.html', icon: '📈', label: 'Sales CRM & Leads' },
    { key: 'inbox', href: '/inbox.html', icon: '📬', label: 'Carrier Replies' },
    { key: 'staff', href: '/staff-management.html', icon: '👔', label: 'Company Staff' },
    { section: 'Accounting' },
    { key: 'invoices', href: '/invoices.html', icon: '💳', label: 'Invoices & Billing' },
    { key: 'ifta', href: '/ifta.html', icon: '⛽', label: 'IFTA & Fuel' },
    { key: 'documents', href: '/documents.html', icon: '📄', label: 'Document Vault' },
    { key: 'planning', href: '/load-planning.html', icon: '📅', label: 'Load Planning' },
    { section: 'System' },
    { key: 'audit', href: '/admin-dashboard.html#audit', icon: '🛡️', label: 'Audit Logs' }
  ];

  const CARRIER_LINKS = [
    { section: 'Operations' },
    { key: 'loads', href: '/dashboard.html', icon: '📦', label: 'My Loads' },
    { key: 'fleet', href: '/fleet.html', icon: '🚛', label: 'Fleet & Drivers' },
    { key: 'documents', href: '/documents.html', icon: '📄', label: 'Documents' },
    { section: 'Accounting' },
    { key: 'invoices', href: '/invoices.html', icon: '💳', label: 'Invoices' },
    { key: 'ifta', href: '/ifta.html', icon: '⛽', label: 'IFTA' }
  ];

  const PAGE_KEY = {
    'admin-dashboard.html': 'overview',
    'dispatcher-dashboard.html': 'dispatch',
    'brokers.html': 'brokers',
    'fleet.html': 'fleet',
    'crm-sales.html': 'crm',
    'sales-dashboard.html': 'crm',
    'inbox.html': 'inbox',
    'staff-management.html': 'staff',
    'invoices.html': 'invoices',
    'ifta.html': 'ifta',
    'documents.html': 'documents',
    'load-planning.html': 'planning',
    'load-detail.html': 'overview',
    'carrier-overview.html': 'overview',
    'dashboard.html': 'loads',
    'driver-app.html': 'loads'
  };

  function pageName() {
    return (location.pathname.split('/').pop() || '').toLowerCase();
  }

  function isCarrierShell() {
    const p = pageName();
    return p === 'dashboard.html' || p === 'driver-app.html';
  }

  function activeKey() {
    if (location.hash === '#audit') return 'audit';
    return PAGE_KEY[pageName()] || '';
  }

  function renderLinks(items, active) {
    return items.map((item) => {
      if (item.section) return `<div class="sidebar-section-label">${item.section}</div>`;
      const cls = item.key === active ? 'sidebar-nav-link active' : 'sidebar-nav-link';
      return `<a href="${item.href}" class="${cls}"><span aria-hidden="true">${item.icon}</span> ${item.label}</a>`;
    }).join('');
  }

  function sidebarHtml() {
    const carrier = isCarrierShell();
    const active = activeKey();
    const tag = carrier ? 'Carrier Portal' : 'Operations';
    const home = carrier ? '/dashboard.html' : '/admin-dashboard.html';
    return `
      <div>
        <a href="${home}" class="sidebar-brand">
          <div class="nav-logo-mark">SW</div>
          <div>
            <div class="sidebar-brand-name">Shipping Wish</div>
            <div class="sidebar-brand-tag">${tag}</div>
          </div>
        </a>
        ${renderLinks(carrier ? CARRIER_LINKS : STAFF_LINKS, active)}
      </div>
      <div>
        <div class="sidebar-user-card">
          <div class="avatar" id="user-avatar-initials" style="background:var(--color-amber-500);color:#0f172a;font-weight:800;">SW</div>
          <div style="flex:1;min-width:0;">
            <div class="truncate" id="user-name-display" style="font-size:13px;font-weight:700;color:#fff;">Signed in</div>
            <div id="user-role-display" style="font-size:11px;color:rgba(255,255,255,0.45);">Portal</div>
          </div>
        </div>
        <button type="button" class="btn btn-light btn-block btn-sm" id="shell-logout-btn">Sign out</button>
      </div>`;
  }

  function initials(name) {
    return String(name || 'SW').split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  }

  function fillUser(user) {
    if (!user) return;
    const nameEl = document.getElementById('user-name-display');
    const roleEl = document.getElementById('user-role-display');
    const av = document.getElementById('user-avatar-initials');
    if (nameEl) nameEl.textContent = user.name || user.email || 'User';
    if (roleEl) roleEl.textContent = (user.role || 'user').replace(/_/g, ' ');
    if (av) av.textContent = initials(user.name || user.email);
  }

  function ensureLogout() {
    const btn = document.getElementById('shell-logout-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (typeof window.logout === 'function') return window.logout();
      fetch('/api/logout', { method: 'POST', credentials: 'include' }).finally(() => {
        window.location.href = '/login.html';
      });
    });
  }

  function mountMobile() {
    if (document.querySelector('.app-mobile-bar')) return;
    const shell = document.querySelector('.app-shell, .app-layout');
    if (!shell) return;
    const bar = document.createElement('div');
    bar.className = 'app-mobile-bar';
    bar.innerHTML = '<button type="button" class="app-mobile-toggle" aria-label="Open menu">☰</button><strong>Shipping Wish</strong>';
    shell.parentNode.insertBefore(bar, shell);

    const backdrop = document.createElement('div');
    backdrop.className = 'app-sidebar-backdrop';
    document.body.appendChild(backdrop);

    const aside = document.querySelector('.app-sidebar');
    const toggle = () => {
      aside.classList.toggle('is-open');
      backdrop.classList.toggle('is-open');
    };
    bar.querySelector('button').addEventListener('click', toggle);
    backdrop.addEventListener('click', toggle);
  }

  function init() {
    const aside = document.querySelector('.app-sidebar');
    if (!aside) return;
    if (document.querySelector('.driver-header')) return;
    document.body.classList.add('app-body');
    aside.innerHTML = sidebarHtml();
    // #region agent log
    fetch('http://127.0.0.1:7689/ingest/730a6415-7634-4c1c-9f05-42f0daa4c7f8',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'278583'},body:JSON.stringify({sessionId:'278583',runId:'pre-fix',hypothesisId:'C',location:'app-shell.js:init',message:'sidebar replaced',data:{crmAvatarGone:!document.getElementById('crm-avatar'),hasNameEl:!!document.getElementById('user-name-display'),mobileBar:!!document.querySelector('.app-mobile-bar'),path:location.pathname},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    mountMobile();
    ensureLogout();
    fetch('/api/me', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => fillUser(data && data.user))
      .catch(() => {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
