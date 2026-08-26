(function () {
  const STAFF_LINKS = [
    { section: 'Operations' },
    { key: 'overview', navId: 'nav-tab-loads', href: '/admin-dashboard', icon: '📊', label: 'Overview & Loads' },
    { key: 'dispatch', navId: 'nav-tab-desk', href: '/dispatcher-dashboard', icon: '🎧', label: 'Dispatch Desk' },
    { key: 'brokers', href: '/brokers', icon: '🤝', label: 'Broker Directory' },
    { key: 'fleet', href: '/fleet', icon: '🚛', label: 'Fleet & Drivers' },
    { section: 'Sales & Staff' },
    { key: 'crm', href: '/crm-sales', icon: '📈', label: 'Sales CRM & Leads' },
    { key: 'inbox', href: '/inbox', icon: '📬', label: 'Carrier Replies' },
    { key: 'staff', href: '/staff-management', icon: '👔', label: 'Company Staff' },
    { section: 'Accounting' },
    { key: 'invoices', href: '/invoices', icon: '💳', label: 'Invoices & Billing' },
    { key: 'ifta', href: '/ifta', icon: '⛽', label: 'IFTA & Fuel' },
    { key: 'documents', href: '/documents', icon: '📄', label: 'Document Vault' },
    { key: 'planning', href: '/load-planning', icon: '📅', label: 'Load Planning' },
    { section: 'System' },
    { key: 'audit', navId: 'nav-tab-audit', href: '/admin-dashboard#audit', icon: '🛡️', label: 'Audit Logs' },
    { key: 'settings', navId: 'nav-tab-settings', href: '/admin-dashboard#settings', icon: '🌐', label: 'Website CMS' },
    { key: 'blog', navId: 'nav-tab-blog', href: '/admin-dashboard#blog', icon: '📰', label: 'Blog Manager' }
  ];

  const CARRIER_LINKS = [
    { section: 'Your company' },
    { key: 'home', href: '/carrier-overview', icon: '📊', label: 'Fleet home' },
    { key: 'fleet', href: '/fleet', icon: '🚛', label: 'Trucks & drivers' },
    { key: 'planning', href: '/load-planning', icon: '📅', label: 'Empty truck / next load' },
    { key: 'documents', href: '/documents', icon: '📄', label: 'Documents' },
    { key: 'brokers', href: '/brokers', icon: '🤝', label: 'Broker credit check' },
    { section: 'Money' },
    { key: 'invoices', href: '/invoices', icon: '💳', label: 'Broker invoices' },
    { key: 'ifta', href: '/ifta', icon: '⛽', label: 'IFTA & fuel' },
    { section: 'On the road' },
    { key: 'driver', href: '/driver-app', icon: '📱', label: 'Driver phone app' }
  ];

  const DRIVER_LINKS = [
    { section: 'Road' },
    { key: 'driver', href: '/driver-app', icon: '📱', label: 'My load' }
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
    'carrier-overview.html': 'home',
    'dashboard.html': 'home',
    'driver-app.html': 'driver'
  };

  function pageName() {
    let p = (location.pathname.split('/').filter(Boolean).pop() || '').toLowerCase();
    if (!p || p === 'index') return 'index.html';
    if (!p.endsWith('.html')) p += '.html';
    return p;
  }

  let CURRENT_ROLE = '';

  function isCarrierRole(role) {
    return role === 'carrier' || role === 'carrier_admin';
  }

  function isCarrierShell() {
    return isCarrierRole(CURRENT_ROLE);
  }

  function hashKey() {
    return (location.hash || '').replace('#', '').toLowerCase();
  }

  function extraLinks() {
    const p = pageName();
    if (p === 'dispatcher-dashboard.html') {
      return [
        { section: 'This desk' },
        { key: 'fleets', navId: 'nav-tab-fleets', href: '/dispatcher-dashboard#fleets', icon: '🚛', label: 'Assigned Fleets' }
      ];
    }
    if (p === 'sales-dashboard.html') {
      return [
        { section: 'This board' },
        { key: 'leads', navId: 'nav-tab-leads', href: '/sales-dashboard#leads', icon: '🎯', label: 'Lead Pipeline' },
        { key: 'tasks', navId: 'nav-tab-tasks', href: '/sales-dashboard#tasks', icon: '📋', label: 'Follow-up Tasks' }
      ];
    }
    if (p === 'carrier-overview.html') {
      return [
        { section: 'Cockpit' },
        { key: 'cockpit', navId: 'nav-tab-cockpit', href: '/carrier-overview#cockpit', icon: '📊', label: 'Fleet Cockpit' },
        { key: 'carrier-loads', navId: 'nav-tab-loads', href: '/carrier-overview#loads', icon: '📦', label: 'My Loads' }
      ];
    }
    return [];
  }

  function activeKey() {
    const p = pageName();
    const h = hashKey();
    if (p === 'admin-dashboard.html') {
      if (h === 'audit') return 'audit';
      if (h === 'settings') return 'settings';
      if (h === 'blog') return 'blog';
      return 'overview';
    }
    if (p === 'dispatcher-dashboard.html') {
      if (h === 'fleets') return 'fleets';
      if (h === 'desk') return 'desk';
      return 'dispatch';
    }
    if (p === 'sales-dashboard.html') {
      if (h === 'tasks') return 'tasks';
      if (h === 'leads') return 'leads';
    }
    if (p === 'carrier-overview.html') {
      if (h === 'loads') return 'carrier-loads';
      if (h === 'cockpit') return 'cockpit';
    }
    return PAGE_KEY[p] || '';
  }

  function renderLinks(items, active) {
    return items.map((item) => {
      if (item.section) return `<div class="sidebar-section-label">${item.section}</div>`;
      const cls = item.key === active ? 'sidebar-nav-link active' : 'sidebar-nav-link';
      const id = item.navId ? ` id="${item.navId}"` : '';
      return `<a href="${item.href}" class="${cls}"${id}><span aria-hidden="true">${item.icon}</span> ${item.label}</a>`;
    }).join('');
  }

  function sidebarHtml() {
    const carrier = isCarrierRole(CURRENT_ROLE);
    const driver = CURRENT_ROLE === 'driver';
    const active = activeKey();
    const tag = driver ? 'Driver app' : carrier ? 'Your TMS' : 'Operations';
    const home = driver ? '/driver-app' : carrier ? '/carrier-overview' : '/admin-dashboard';
    const links = driver ? DRIVER_LINKS : carrier ? CARRIER_LINKS : STAFF_LINKS.concat(extraLinks());
    return `
      <div class="sidebar-nav-scroll">
        <a href="${home}" class="sidebar-brand">
          <div class="nav-logo-mark">SW</div>
          <div>
            <div class="sidebar-brand-name">Shipping Wish</div>
            <div class="sidebar-brand-tag">${tag}</div>
          </div>
        </a>
        ${renderLinks(links, active)}
      </div>
      <div class="sidebar-foot">
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

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function fillUser(user) {
    if (!user) return;
    const name = user.name || user.email || user.company_name || 'User';
    const role = (user.role || 'user').replace(/_/g, ' ');
    const av = initials(user.name || user.company_name || user.email);
    setText('user-name-display', name);
    setText('user-role-display', role);
    setText('disp-name-display', name);
    setText('disp-role-display', role);
    setText('user-display-name', name);
    setText('user-profile-display', name);
    setText('user-badge-inv', name);
    setText('user-badge-docs', name);
    setText('user-badge-broker', name);
    setText('fleet-user-name', name);
    setText('fleet-user-role', role);
    setText('ifta-user-name', name);
    setText('ifta-user-role', role);
    setText('carrier-name-nav', user.company_name || name);
    setText('carrier-role-nav', role);
    setText('carrier-name-display', user.company_name || name);
    const avatarIds = ['user-avatar-initials', 'disp-avatar-initials', 'crm-avatar', 'sales-avatar-initials', 'carrier-avatar-initials', 'fleet-avatar-initials', 'ifta-avatar-initials', 'inv-avatar', 'doc-avatar', 'broker-avatar'];
    avatarIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = av;
    });
  }

  function ensureLogout() {
    const btn = document.getElementById('shell-logout-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (typeof window.logout === 'function') return window.logout();
      fetch('/api/logout', { method: 'POST', credentials: 'include' }).finally(() => {
        window.location.href = '/login';
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
      if (!aside) return;
      aside.classList.toggle('is-open');
      backdrop.classList.toggle('is-open');
    };
    bar.querySelector('button').addEventListener('click', toggle);
    backdrop.addEventListener('click', toggle);
  }

  function applyPageHash() {
    const p = pageName();
    const h = hashKey();
    if (p === 'admin-dashboard.html' && typeof window.switchAdminTab === 'function') {
      const tab = ['audit', 'settings', 'blog', 'loads', 'carriers', 'dispatchers', 'users'].includes(h) ? h : 'loads';
      window.switchAdminTab(tab);
    }
    if (p === 'dispatcher-dashboard.html' && typeof window.switchDeskTab === 'function') {
      window.switchDeskTab(h === 'fleets' ? 'fleets' : 'desk');
    }
    if (p === 'sales-dashboard.html' && typeof window.switchSalesTab === 'function') {
      window.switchSalesTab(h === 'tasks' ? 'tasks' : 'leads');
    }
    if (p === 'carrier-overview.html' && typeof window.switchCarrierTab === 'function') {
      window.switchCarrierTab(h === 'loads' ? 'loads' : 'cockpit');
    }
  }

  function init() {
    const aside = document.querySelector('.app-sidebar');
    if (!aside) return;
    if (document.querySelector('.driver-header')) return;
    document.body.classList.add('app-body');
    fetch('/api/me', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        CURRENT_ROLE = (data && data.user && data.user.role) || '';
        aside.innerHTML = sidebarHtml();
        mountMobile();
        ensureLogout();
        applyPageHash();
        fillUser(data && data.user);
        if (CURRENT_ROLE === 'carrier' || CURRENT_ROLE === 'carrier_admin') {
          const p = pageName();
          if (p === 'dashboard.html') window.location.replace('/carrier-overview');
          if (p === 'crm-sales.html' || p === 'staff-management.html' || p === 'admin-dashboard.html' || p === 'dispatcher-dashboard.html') {
            window.location.replace('/carrier-overview');
          }
        }
        if (CURRENT_ROLE === 'driver' && pageName() !== 'driver-app.html') {
          window.location.replace('/driver-app');
        }
      })
      .catch(() => {});
    window.addEventListener('hashchange', applyPageHash);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
