(function () {
  // #region agent log
  function dbgLog(location, message, data, hypothesisId) {
    const entry = { sessionId: '278583', location, message, data, timestamp: Date.now(), hypothesisId };
    try {
      const k = 'sw_debug_278583';
      const arr = JSON.parse(sessionStorage.getItem(k) || '[]');
      arr.push(entry);
      if (arr.length > 40) arr.shift();
      sessionStorage.setItem(k, JSON.stringify(arr));
    } catch (_) { /* ignore */ }
    fetch('http://127.0.0.1:7689/ingest/730a6415-7634-4c1c-9f05-42f0daa4c7f8', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '278583' },
      body: JSON.stringify({ sessionId: '278583', location, message, data, timestamp: Date.now(), hypothesisId })
    }).catch(() => {});
  }
  let initCallCount = 0;
  const ROLE_CACHE_KEY = 'sw_portal_role';
  const SIDEBAR_HTML_KEY = 'sw_sidebar_html';
  const SIDEBAR_VERSION = '34';
  // #endregion

  function clearRoleCache() {
    try {
      sessionStorage.removeItem(ROLE_CACHE_KEY);
      sessionStorage.removeItem(PLAN_CACHE_KEY);
      sessionStorage.removeItem(SIDEBAR_HTML_KEY);
    } catch (_) { /* ignore */ }
  }

  function ensureSidebarVersion() {
    try {
      const prev = sessionStorage.getItem('sw_sidebar_ver');
      if (prev !== SIDEBAR_VERSION) {
        sessionStorage.removeItem(SIDEBAR_HTML_KEY);
        sessionStorage.setItem('sw_sidebar_ver', SIDEBAR_VERSION);
      }
    } catch (_) { /* ignore */ }
  }

  function persistSidebarHtml(aside) {
    try {
      sessionStorage.setItem(SIDEBAR_HTML_KEY, aside.innerHTML);
    } catch (_) { /* ignore */ }
  }

  function isSidebarBooted(aside) {
    return aside.classList.contains('shell-content-ready')
      && aside.querySelectorAll('a.sidebar-nav-link').length > 0;
  }

  function loadingSidebarHtml() {
    return `
      <div class="sidebar-nav-scroll sidebar-shell-pending">
        <div class="sidebar-brand">
          <div class="nav-logo-mark">SW</div>
          <div>
            <div class="sidebar-brand-name">Shipping Wish</div>
            <div class="sidebar-brand-tag">Portal</div>
          </div>
        </div>
        <p class="sidebar-shell-placeholder" aria-live="polite">Loading your menu…</p>
      </div>
      <div class="sidebar-foot">
        <div class="sidebar-user-card">
          <div class="avatar" id="user-avatar-initials" style="background:var(--color-amber-500);color:#0f172a;font-weight:800;">SW</div>
          <div style="flex:1;min-width:0;">
            <div class="truncate" id="user-name-display" style="font-size:13px;font-weight:700;color:#fff;">Signed in</div>
            <div id="user-role-display" style="font-size:11px;color:rgba(255,255,255,0.45);">Portal</div>
          </div>
        </div>
        <div style="display:flex;gap:6px;margin-top:8px;">
          <button type="button" class="btn btn-secondary btn-block btn-sm" id="shell-change-pwd-btn" style="font-size:11px;padding:4px 6px;flex:1;" disabled>🔑 Password</button>
          <button type="button" class="btn btn-light btn-block btn-sm" id="shell-logout-btn" onclick="window.swForceLogout?window.swForceLogout():(window.logout?window.logout():null)" style="font-size:11px;padding:4px 6px;flex:1;">Sign out</button>
        </div>
      </div>`;
  }

  // --- Universal Centered Modal & Toast Dialog System ---
  function ensureModalContainer() {
    let wrap = document.getElementById('sw-modal-root');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'sw-modal-root';
      document.body.appendChild(wrap);
    }
    return wrap;
  }

  window.swModal = function (opts) {
    return new Promise((resolve) => {
      const {
        title = 'Confirmation',
        message = 'Are you sure you want to proceed?',
        icon = '⚠️',
        confirmText = 'Proceed',
        cancelText = 'Cancel',
        danger = false,
        showCancel = true
      } = (typeof opts === 'string' ? { message: opts } : opts || {});

      const root = ensureModalContainer();
      const iconClass = danger ? 'sw-modal-icon-danger' : (confirmText.toLowerCase().includes('restore') ? 'sw-modal-icon-success' : 'sw-modal-icon-warning');

      const modalHtml = `
        <div class="sw-modal-overlay" id="sw-active-modal">
          <div class="sw-modal-card">
            <div class="sw-modal-icon-wrap ${iconClass}">${icon}</div>
            <h3 class="sw-modal-title">${title}</h3>
            <p class="sw-modal-text">${message}</p>
            <div class="sw-modal-buttons">
              ${showCancel ? `<button type="button" class="sw-modal-btn sw-modal-btn-cancel" id="sw-modal-cancel-btn">${cancelText}</button>` : ''}
              <button type="button" class="sw-modal-btn ${danger ? 'sw-modal-btn-danger' : 'sw-modal-btn-primary'}" id="sw-modal-confirm-btn">${confirmText}</button>
            </div>
          </div>
        </div>
      `;

      root.innerHTML = modalHtml;

      const overlay = document.getElementById('sw-active-modal');
      const confirmBtn = document.getElementById('sw-modal-confirm-btn');
      const cancelBtn = document.getElementById('sw-modal-cancel-btn');

      function cleanup(val) {
        if (!overlay) return resolve(val);
        overlay.classList.add('closing');
        setTimeout(() => {
          root.innerHTML = '';
          resolve(val);
        }, 120);
      }

      confirmBtn.focus();
      confirmBtn.addEventListener('click', () => cleanup(true));
      if (cancelBtn) cancelBtn.addEventListener('click', () => cleanup(false));
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) cleanup(false);
      });
      const onEsc = (e) => {
        if (e.key === 'Escape') {
          document.removeEventListener('keydown', onEsc);
          cleanup(false);
        }
      };
      document.addEventListener('keydown', onEsc);
    });
  };

  window.swConfirm = function (opts) {
    if (typeof opts === 'string') opts = { message: opts };
    return window.swModal(opts);
  };

  window.swAlert = function (opts) {
    if (typeof opts === 'string') opts = { message: opts, showCancel: false, confirmText: 'OK' };
    else opts = { ...opts, showCancel: false, confirmText: opts.confirmText || 'OK' };
    return window.swModal(opts);
  };

  window.swToast = function (message, type = 'success') {
    let wrap = document.getElementById('sw-toast-root');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'sw-toast-root';
      document.body.appendChild(wrap);
    }
    const icon = type === 'error' ? '❌' : (type === 'warning' ? '⚠️' : '✅');
    const toast = document.createElement('div');
    toast.className = 'sw-toast-wrap';
    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    wrap.appendChild(toast);

    setTimeout(() => {
      toast.style.transition = 'opacity 0.25s, transform 0.25s';
      toast.style.opacity = '0';
      toast.style.transform = 'translate(-50%, -10px)';
      setTimeout(() => toast.remove(), 250);
    }, 2800);
  };

  // SVG icon helper — renders a crisp 18×18 inline SVG
  function svgIcon(paths, color, viewBox) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="${viewBox||'0 0 24 24'}" fill="none" style="flex-shrink:0;vertical-align:middle">${paths}</svg>`;
  }

  const IC = {
    crown:      svgIcon(`<path d="M3 19h18M5 10l2 5h10l2-5-4 2-3-5-3 5-4-2Z" stroke="#f59e0b" stroke-width="1.8" stroke-linejoin="round" fill="none"/><circle cx="5" cy="9" r="1.5" fill="#f59e0b"/><circle cx="19" cy="9" r="1.5" fill="#f59e0b"/><circle cx="12" cy="5" r="1.5" fill="#f59e0b"/>`),
    overview:   svgIcon(`<rect x="3" y="3" width="8" height="8" rx="2" fill="#6366f1" opacity=".9"/><rect x="13" y="3" width="8" height="8" rx="2" fill="#6366f1" opacity=".6"/><rect x="3" y="13" width="8" height="8" rx="2" fill="#6366f1" opacity=".6"/><rect x="13" y="13" width="8" height="8" rx="2" fill="#6366f1" opacity=".3"/>`),
    shield:     svgIcon(`<path d="M12 3L4 7v5c0 4.5 3.5 8.2 8 9 4.5-.8 8-4.5 8-9V7L12 3Z" fill="#ef4444" opacity=".15" stroke="#ef4444" stroke-width="1.8"/><path d="M9 12l2 2 4-4" stroke="#ef4444" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`),
    headset:    svgIcon(`<path d="M4 13a8 8 0 1 1 16 0" stroke="#38bdf8" stroke-width="1.8" fill="none"/><rect x="2" y="13" width="3" height="5" rx="1.5" fill="#38bdf8"/><rect x="19" y="13" width="3" height="5" rx="1.5" fill="#38bdf8"/><path d="M19 18v1a4 4 0 0 1-4 4h-2" stroke="#38bdf8" stroke-width="1.8" fill="none"/>`),
    robot:      svgIcon(`<rect x="4" y="8" width="16" height="12" rx="3" fill="#a78bfa" opacity=".2" stroke="#a78bfa" stroke-width="1.7"/><circle cx="9" cy="13" r="1.5" fill="#a78bfa"/><circle cx="15" cy="13" r="1.5" fill="#a78bfa"/><path d="M9 17h6" stroke="#a78bfa" stroke-width="1.5" stroke-linecap="round"/><path d="M12 5v3M9 5h6" stroke="#a78bfa" stroke-width="1.5" stroke-linecap="round"/>`),
    target:     svgIcon(`<circle cx="12" cy="12" r="9" stroke="#f97316" stroke-width="1.7" fill="none"/><circle cx="12" cy="12" r="5" stroke="#f97316" stroke-width="1.7" fill="none"/><circle cx="12" cy="12" r="2" fill="#f97316"/>`),
    handshake:  svgIcon(`<path d="M6 9l3 3 3-3 3 3 3-3" stroke="#10b981" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M3 9h18" stroke="#10b981" stroke-width="1.7" stroke-linecap="round"/><path d="M5 9V6a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3" stroke="#10b981" stroke-width="1.7" fill="none"/><path d="M5 15v3a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3" stroke="#10b981" stroke-width="1.7" fill="none"/>`),
    truck:      svgIcon(`<rect x="1" y="8" width="14" height="10" rx="2" fill="#0ea5e9" opacity=".15" stroke="#0ea5e9" stroke-width="1.7"/><path d="M15 12l3 3v3H9" stroke="#0ea5e9" stroke-width="1.7" fill="none"/><path d="M15 12l-1.5-4H9" stroke="#0ea5e9" stroke-width="1.7" fill="none"/><circle cx="5" cy="19" r="2" fill="#0ea5e9"/><circle cx="18" cy="19" r="2" fill="#0ea5e9"/>`),
    chart:      svgIcon(`<polyline points="3,17 8,11 13,14 21,6" stroke="#22d3ee" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/><polyline points="16,6 21,6 21,11" stroke="#22d3ee" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`),
    census:     svgIcon(`<rect x="4" y="2" width="16" height="20" rx="2" fill="#8b5cf6" opacity=".12" stroke="#8b5cf6" stroke-width="1.7"/><path d="M8 7h8M8 11h8M8 15h5" stroke="#8b5cf6" stroke-width="1.5" stroke-linecap="round"/>`),
    phone:      svgIcon(`<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A18 18 0 0 1 3 6a2 2 0 0 1 2-2" fill="#f43f5e" opacity=".15" stroke="#f43f5e" stroke-width="1.7"/>`),
    inbox:      svgIcon(`<path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" fill="#06b6d4" opacity=".12" stroke="#06b6d4" stroke-width="1.7"/><polyline points="2,6 12,13 22,6" stroke="#06b6d4" stroke-width="1.7" fill="none"/>`),
    sms:        svgIcon(`<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" fill="#4ade80" opacity=".15" stroke="#4ade80" stroke-width="1.7"/><path d="M8 10h.01M12 10h.01M16 10h.01" stroke="#4ade80" stroke-width="2" stroke-linecap="round"/>`),
    trash:      svgIcon(`<polyline points="3,6 5,6 21,6" stroke="#94a3b8" stroke-width="1.7" stroke-linecap="round"/><path d="M19 6l-1 14H6L5 6" stroke="#94a3b8" stroke-width="1.7" fill="none"/><path d="M10 11v6M14 11v6" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round"/><path d="M9 6V4h6v2" stroke="#94a3b8" stroke-width="1.7" fill="none"/>`),
    staff:      svgIcon(`<circle cx="9" cy="7" r="3" stroke="#f59e0b" stroke-width="1.7" fill="none"/><circle cx="17" cy="9" r="2.5" stroke="#f59e0b" stroke-width="1.5" fill="none" opacity=".7"/><path d="M3 20a6 6 0 0 1 12 0" stroke="#f59e0b" stroke-width="1.7" fill="none"/><path d="M17 12a4 4 0 0 1 4 4" stroke="#f59e0b" stroke-width="1.5" fill="none" opacity=".7"/>`),
    billing:    svgIcon(`<rect x="2" y="5" width="20" height="14" rx="2" fill="#10b981" opacity=".1" stroke="#10b981" stroke-width="1.7"/><path d="M2 10h20" stroke="#10b981" stroke-width="1.5"/><path d="M6 15h4M14 15h4" stroke="#10b981" stroke-width="1.5" stroke-linecap="round"/>`),
    fuel:       svgIcon(`<path d="M4 20V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v14" stroke="#f97316" stroke-width="1.7" fill="none"/><path d="M2 20h14M16 8l2 2a2 2 0 0 1 0 4v4" stroke="#f97316" stroke-width="1.7" stroke-linecap="round" fill="none"/><path d="M7 9h6" stroke="#f97316" stroke-width="1.5" stroke-linecap="round"/>`),
    docs:       svgIcon(`<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" fill="#a78bfa" opacity=".12" stroke="#a78bfa" stroke-width="1.7"/><polyline points="14,2 14,8 20,8" stroke="#a78bfa" stroke-width="1.7" fill="none"/><line x1="8" y1="13" x2="16" y2="13" stroke="#a78bfa" stroke-width="1.5" stroke-linecap="round"/><line x1="8" y1="17" x2="13" y2="17" stroke="#a78bfa" stroke-width="1.5" stroke-linecap="round"/>`),
    planning:   svgIcon(`<rect x="3" y="4" width="18" height="18" rx="2" fill="#38bdf8" opacity=".1" stroke="#38bdf8" stroke-width="1.7"/><path d="M16 2v4M8 2v4M3 10h18" stroke="#38bdf8" stroke-width="1.7" stroke-linecap="round"/><circle cx="12" cy="15" r="2" fill="#38bdf8" opacity=".8"/>`),
    auditlog:   svgIcon(`<rect x="4" y="3" width="14" height="18" rx="2" fill="#64748b" opacity=".15" stroke="#64748b" stroke-width="1.7"/><path d="M8 8h8M8 12h8M8 16h5" stroke="#64748b" stroke-width="1.5" stroke-linecap="round"/><circle cx="17" cy="16" r="3" fill="#f59e0b"/><path d="M16 16l.8.8 1.4-1.4" stroke="#1e293b" stroke-width="1.2" stroke-linecap="round"/>`),
    webcms:     svgIcon(`<circle cx="12" cy="12" r="9" stroke="#0ea5e9" stroke-width="1.7" fill="none"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" stroke="#0ea5e9" stroke-width="1.5" fill="none"/>`),
    blog:       svgIcon(`<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="#f472b6" stroke-width="1.7" fill="none"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z" stroke="#f472b6" stroke-width="1.7" fill="none"/>`),
    settings:   svgIcon(`<circle cx="12" cy="12" r="3" stroke="#e2e8f0" stroke-width="1.7" fill="none"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" stroke="#e2e8f0" stroke-width="1.5" fill="none"/>`),
    tasks:      svgIcon(`<path d="M9 11l3 3L22 4" stroke="#10b981" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" stroke="#10b981" stroke-width="1.8" fill="none"/>`),
    calculator: svgIcon(`<rect x="4" y="2" width="16" height="20" rx="3" stroke="#f59e0b" stroke-width="1.8" fill="none"/><rect x="7" y="5" width="10" height="4" rx="1" fill="#f59e0b" opacity=".3"/><circle cx="8" cy="13" r="1" fill="#f59e0b"/><circle cx="12" cy="13" r="1" fill="#f59e0b"/><circle cx="16" cy="13" r="1" fill="#f59e0b"/><circle cx="8" cy="17" r="1" fill="#f59e0b"/><circle cx="12" cy="17" r="1" fill="#f59e0b"/><circle cx="16" cy="17" r="1" fill="#f59e0b"/>`),
    profile:    svgIcon(`<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="#38bdf8" stroke-width="1.8" fill="none"/><circle cx="12" cy="7" r="4" stroke="#38bdf8" stroke-width="1.8" fill="none"/>`)
  };

  const STAFF_LINKS = [
    { section: 'Executive Command', superAdminOnly: true },
    { key: 'superadmin', href: '/superadmin', icon: IC.crown, label: 'Command Center (4-Brand)', superAdminOnly: true },
    { section: 'Operations' },
    { key: 'overview', navId: 'nav-tab-loads', href: '/admin-dashboard', icon: IC.overview, label: 'Overview & Loads' },
    { key: 'loadnexus', href: '/admin-loadnexus', icon: IC.shield, label: 'LoadNexus Command' },
    { key: 'dispatch', navId: 'nav-tab-desk', href: '/dispatcher-dashboard', icon: IC.headset, label: 'Dispatch Desk' },
    { key: 'ai-dispatch', href: '/ai-dispatch', icon: IC.robot, label: 'AI Dispatch', adminOnly: true },
    { key: 'loadboard', href: '/load-booking', icon: IC.target, label: 'Load Board & AI Match' },
    { key: 'planning', href: '/load-planning', icon: IC.planning, label: 'Load Planning' },
    { key: 'brokers', href: '/brokers', icon: IC.handshake, label: 'Broker Directory' },
    { key: 'fleet', href: '/fleet', icon: IC.truck, label: 'Fleet & Drivers' },
    { section: 'Sales & Communications' },
    { key: 'crm', href: '/crm-sales', icon: IC.chart, label: 'Sales CRM & Leads' },
    { key: 'census', href: '/census-desk', icon: IC.census, label: 'Census Desk' },
    { key: 'voice-calls', href: '/voice-calls', icon: IC.phone, label: 'AI Calls & Audio' },
    { key: 'inbox', href: '/inbox', icon: IC.inbox, label: 'Carrier Replies' },
    { key: 'sms-inbox', href: '/sms-inbox', icon: IC.sms, label: 'SMS & WhatsApp' },
    { section: 'Accounting' },
    { key: 'invoices', href: '/invoices', icon: IC.billing, label: 'Invoices & Billing', adminOnly: true },
    { key: 'ifta', href: '/ifta', icon: IC.fuel, label: 'IFTA & Fuel', adminOnly: true },
    { key: 'documents', href: '/documents', icon: IC.docs, label: 'Document Vault' },
    { section: 'System' },
    { key: 'staff', href: '/staff-management', icon: IC.staff, label: 'Company Staff', adminOnly: true },
    { key: 'settings', href: '/settings', icon: IC.settings, label: 'Settings', adminOnly: true },
    { key: 'trash', href: '/trash', icon: IC.trash, label: 'Trash', adminOnly: true },
    { key: 'audit', navId: 'nav-tab-audit', href: '/admin-dashboard#audit', icon: IC.auditlog, label: 'Audit Logs', adminOnly: true },
    { key: 'webcms', navId: 'nav-tab-settings', href: '/admin-dashboard#settings', icon: IC.webcms, label: 'Website CMS', adminOnly: true },
    { key: 'blog', navId: 'nav-tab-blog', href: '/admin-dashboard#blog', icon: IC.blog, label: 'Blog Manager', adminOnly: true }
  ];

  const HR_LINKS = [
    { section: 'HR & Personnel' },
    { key: 'staff', href: '/staff-management', icon: IC.staff, label: 'Company Staff' },
    { key: 'documents', href: '/documents', icon: IC.docs, label: 'Document Vault' },
    { key: 'census', href: '/census-desk', icon: IC.census, label: 'Directory Desk' },
    { section: 'Payroll & Operations' },
    { key: 'invoices', href: '/invoices', icon: IC.billing, label: 'Payroll & Billing' },
    { key: 'fleet', href: '/fleet', icon: IC.truck, label: 'Drivers & Fleet' },
    { section: 'Communications' },
    { key: 'inbox', href: '/inbox', icon: IC.inbox, label: 'Email Inbox' },
    { key: 'sms-inbox', href: '/sms-inbox', icon: IC.sms, label: 'SMS & WhatsApp' }
  ];

  const DISPATCHER_LINKS = [
    { section: 'Dispatch Desk' },
    { key: 'dispatch', navId: 'nav-tab-desk', href: '/dispatcher-dashboard', icon: IC.headset, label: 'Dispatch Desk' },
    { key: 'fleets', navId: 'nav-tab-fleets', href: '/dispatcher-dashboard#fleets', icon: IC.truck, label: 'Assigned Fleets' },
    { key: 'loadboard', href: '/load-booking', icon: IC.target, label: 'Load Board & AI Match' },
    { key: 'planning', href: '/load-planning', icon: IC.planning, label: 'Truck Load Planning' },
    { key: 'fleet', href: '/fleet', icon: IC.truck, label: 'Fleet & Drivers' },
    { key: 'brokers', href: '/brokers', icon: IC.handshake, label: 'Broker Directory' },
    { key: 'documents', href: '/documents', icon: IC.docs, label: 'RateCons & BOLs' },
    { section: 'Communications' },
    { key: 'inbox', href: '/inbox', icon: IC.inbox, label: 'Carrier Replies' },
    { key: 'sms-inbox', href: '/sms-inbox', icon: IC.sms, label: 'SMS & WhatsApp' }
  ];

  const SALES_REP_LINKS = [
    { section: 'Sales & Acquisition' },
    { key: 'crm', href: '/sales-dashboard', icon: IC.chart, label: 'Sales CRM & Leads' },
    { key: 'leads', navId: 'nav-tab-leads', href: '/sales-dashboard#leads', icon: IC.target, label: 'Carrier Pipeline' },
    { key: 'tasks', navId: 'nav-tab-tasks', href: '/sales-dashboard#tasks', icon: IC.tasks, label: 'Follow-up Tasks' },
    { key: 'census', href: '/census-desk', icon: IC.census, label: 'DOT Census Desk' },
    { key: 'voice-calls', href: '/voice-calls', icon: IC.phone, label: 'AI Cold Calling & Audio' },
    { section: 'Inbound' },
    { key: 'inbox', href: '/inbox', icon: IC.inbox, label: 'Carrier Email Replies' },
    { key: 'sms-inbox', href: '/sms-inbox', icon: IC.sms, label: 'SMS & WhatsApp' },
    { key: 'brokers', href: '/brokers', icon: IC.handshake, label: 'Broker Directory' }
  ];

  const CARRIER_LINKS = [
    { section: 'Your company' },
    { key: 'home', href: '/carrier-overview', icon: IC.chart, label: 'Fleet home' },
    { key: 'loadboard', href: '/load-booking', icon: IC.target, label: 'Load Board & AI Bidding' },
    { key: 'fleet', href: '/fleet', icon: IC.truck, label: 'Trucks & drivers' },
    { key: 'planning', href: '/load-planning', icon: IC.planning, label: 'Empty truck / next load' },
    { key: 'documents', href: '/documents', icon: IC.docs, label: 'Documents' },
    { key: 'brokers', href: '/brokers', icon: IC.handshake, label: 'Broker credit check' },
    { section: 'Money' },
    { key: 'invoices', href: '/invoices', icon: IC.billing, label: 'Service billing' },
    { key: 'ifta', href: '/ifta', icon: IC.fuel, label: 'IFTA & fuel' },
    { section: 'On the road' },
    { key: 'driver', href: '/driver-app', icon: IC.phone, label: 'Driver phone app' }
  ];

  const DRIVER_LINKS = [
    { section: 'Road' },
    { key: 'driver', href: '/driver-app', icon: IC.truck, label: 'My load' }
  ];

  const LOADBOARD_MEMBER_LINKS = [
    { section: 'Self-Dispatch AI Suite' },
    { key: 'loadboard', href: '/load-booking', icon: IC.target, label: 'Live AI Load Board' },
    { key: 'brokers', href: '/brokers', icon: IC.handshake, label: 'Broker Credit & FMCSA Check' },
    { key: 'calculator', href: '/services#calculator', icon: IC.calculator, label: 'RPM & Lane Calculator' },
    { section: 'My Account' },
    { key: 'home', href: '/carrier-overview', icon: IC.profile, label: 'Subscription & Profile' }
  ];

  const PAGE_KEY = {
    'admin-loadnexus.html': 'loadnexus',
    'admin-dashboard.html': 'overview',
    'dispatcher-dashboard.html': 'dispatch',
    'ai-dispatch.html': 'ai-dispatch',
    'load-booking.html': 'loadboard',
    'brokers.html': 'brokers',
    'fleet.html': 'fleet',
    'crm-sales.html': 'crm',
    'census-desk.html': 'census',
    'sales-dashboard.html': 'crm',
    'inbox.html': 'inbox',
    'voice-calls.html': 'voice-calls',
    'sms-inbox.html': 'sms-inbox',
    'staff-management.html': 'staff',
    'invoices.html': 'invoices',
    'ifta.html': 'ifta',
    'documents.html': 'documents',
    'load-planning.html': 'planning',
    'load-detail.html': 'overview',
    'carrier-overview.html': 'home',
    'dashboard.html': 'home',
    'driver-app.html': 'driver',
    'trash.html': 'trash',
    'settings.html': 'settings'
  };

  function pageName() {
    let p = (location.pathname.split('/').filter(Boolean).pop() || '').toLowerCase();
    if (!p || p === 'index') return 'index.html';
    if (!p.endsWith('.html')) p += '.html';
    return p;
  }

  let CURRENT_ROLE = '';
  let CURRENT_PLAN = '';
  const PLAN_CACHE_KEY = 'sw_portal_plan';

  function isLoadboardSubscriber() {
    return CURRENT_PLAN === 'loadboard_ai_pass';
  }

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

  function linkItemsForRole(role) {
    if (role === 'driver') return DRIVER_LINKS;
    if (isCarrierRole(role)) {
      if (isLoadboardSubscriber()) return LOADBOARD_MEMBER_LINKS;
      return CARRIER_LINKS;
    }
    if (role === 'dispatcher') return DISPATCHER_LINKS;
    if (role === 'sales_rep') return SALES_REP_LINKS;
    if (role === 'hr') return HR_LINKS;

    const isSuper = role === 'super_admin';
    const isAdmin = role === 'admin' || isSuper;

    const staff = STAFF_LINKS.filter((item) => {
      if (item.superAdminOnly) return isSuper;
      if (item.adminOnly) return isAdmin;
      return true;
    });
    return staff.concat(extraLinks());
  }

  function syncActiveNav(aside) {
    const active = activeKey();
    aside.querySelectorAll('a.sidebar-nav-link').forEach((el) => el.classList.remove('active'));
    for (const item of linkItemsForRole(CURRENT_ROLE)) {
      if (item.section) continue;
      if (item.key !== active) continue;
      const el = item.navId
        ? aside.querySelector(`#${item.navId}`)
        : aside.querySelector(`a.sidebar-nav-link[href="${item.href}"]`);
      if (el) el.classList.add('active');
      break;
    }
  }

  function sidebarHtml() {
    if (!CURRENT_ROLE) return loadingSidebarHtml();
    const carrier = isCarrierRole(CURRENT_ROLE);
    const driver = CURRENT_ROLE === 'driver';
    const loadboardSub = isLoadboardSubscriber();
    const active = activeKey();
    const tag = driver ? 'Driver app' : loadboardSub ? 'AI Load Pass' : carrier ? 'Your TMS' : (CURRENT_ROLE === 'dispatcher' ? 'Dispatch Desk' : (CURRENT_ROLE === 'sales_rep' ? 'Sales CRM' : 'Operations'));
    const home = driver ? '/driver-app' : loadboardSub ? '/load-booking' : carrier ? '/carrier-overview' : (CURRENT_ROLE === 'dispatcher' ? '/dispatcher-dashboard' : (CURRENT_ROLE === 'sales_rep' ? '/sales-dashboard' : '/admin-dashboard'));
    const links = linkItemsForRole(CURRENT_ROLE);
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
            <div id="user-role-display" style="font-size:11px;color:rgba(255,255,255,0.45);">${loadboardSub ? 'AI Load Pass' : 'Portal'}</div>
          </div>
        </div>
        <div style="display:flex;gap:6px;margin-top:8px;">
          <button type="button" class="btn btn-secondary btn-block btn-sm" id="shell-change-pwd-btn" style="font-size:11px;padding:4px 6px;flex:1;">🔑 Password</button>
          <button type="button" class="btn btn-light btn-block btn-sm" id="shell-logout-btn" onclick="window.swForceLogout?window.swForceLogout():(window.logout?window.logout():null)" style="font-size:11px;padding:4px 6px;flex:1;">Sign out</button>
        </div>
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

  let logoutInProgress = false;
  async function doLogout() {
    if (logoutInProgress) return;
    logoutInProgress = true;
    const btn = document.getElementById('shell-logout-btn') || document.getElementById('logout-btn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Signing out...';
    }
    clearRoleCache();
    try { sessionStorage.clear(); } catch (_) {}
    try { localStorage.clear(); } catch (_) {}
    const past = 'Thu, 01 Jan 1970 00:00:01 GMT;';
    document.cookie = 'sw_token=; Path=/; Expires=' + past;
    document.cookie = 'sw_token=; Path=/; Domain=.shippingwish.com; Expires=' + past;
    document.cookie = 'sw_token=; Path=/; Domain=shippingwish.com; Expires=' + past;
    try {
      const logoutPromise = fetch('/api/logout', { method: 'POST', credentials: 'include' });
      const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 600));
      await Promise.race([logoutPromise, timeoutPromise]);
    } catch (_) {}
    window.location.replace('/login?logged_out=1');
  }

  function ensureLogout() {
    window.logout = doLogout;
    window.swForceLogout = doLogout;
    const btn = document.getElementById('shell-logout-btn');
    if (btn) {
      btn.disabled = false;
      if (btn.dataset.shellBound !== '1') {
        btn.dataset.shellBound = '1';
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          doLogout();
        });
      }
    }
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest && e.target.closest('#shell-logout-btn, #logout-btn, [data-action="logout"]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    doLogout();
  }, true);

  function openChangePasswordModal() {
    let modal = document.getElementById('shell-pwd-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'shell-pwd-modal';
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.7);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;';
      modal.innerHTML = `
        <div style="background:#fff;border-radius:16px;max-width:400px;width:100%;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);overflow:hidden;font-family:inherit;">
          <div style="padding:16px 20px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;">
            <h3 style="margin:0;font-size:16px;font-weight:800;color:#0f172a;">🔒 Change Password</h3>
            <button type="button" id="shell-pwd-close" style="background:none;border:none;font-size:22px;cursor:pointer;color:#64748b;line-height:1;">&times;</button>
          </div>
          <form id="shell-pwd-form" style="padding:20px;display:flex;flex-direction:column;gap:12px;">
            <div id="shell-pwd-alert" style="display:none;padding:10px;border-radius:8px;font-size:12px;font-weight:600;"></div>
            <div>
              <label style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:4px;">Current Password (Optional if admin)</label>
              <input type="password" id="shell-pwd-cur" class="form-input" style="width:100%;box-sizing:border-box;padding:8px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;" placeholder="Current password">
            </div>
            <div>
              <label style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:4px;">New Password (Min 8 chars)</label>
              <input type="password" id="shell-pwd-new" required class="form-input" style="width:100%;box-sizing:border-box;padding:8px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;" placeholder="New password" minlength="8">
            </div>
            <div>
              <label style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:4px;">Confirm New Password</label>
              <input type="password" id="shell-pwd-confirm" required class="form-input" style="width:100%;box-sizing:border-box;padding:8px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;" placeholder="Confirm new password" minlength="8">
            </div>
            <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:8px;">
              <button type="button" id="shell-pwd-cancel" class="btn btn-secondary btn-sm" style="padding:6px 14px;border-radius:8px;">Cancel</button>
              <button type="submit" id="shell-pwd-submit" class="btn btn-primary btn-sm" style="padding:6px 16px;border-radius:8px;font-weight:800;background:#f59e0b;color:#0f172a;border:none;">Save Password</button>
            </div>
          </form>
        </div>
      `;
      document.body.appendChild(modal);

      const closeModal = () => { modal.style.display = 'none'; };
      document.getElementById('shell-pwd-close').onclick = closeModal;
      document.getElementById('shell-pwd-cancel').onclick = closeModal;

      document.getElementById('shell-pwd-form').onsubmit = async (e) => {
        e.preventDefault();
        const alertBox = document.getElementById('shell-pwd-alert');
        const submitBtn = document.getElementById('shell-pwd-submit');
        const cur = document.getElementById('shell-pwd-cur').value;
        const newPwd = document.getElementById('shell-pwd-new').value;
        const confirmPwd = document.getElementById('shell-pwd-confirm').value;

        if (newPwd !== confirmPwd) {
          alertBox.style.display = 'block';
          alertBox.style.background = '#fee2e2';
          alertBox.style.color = '#991b1b';
          alertBox.textContent = 'New passwords do not match!';
          return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving...';
        try {
          const res = await fetch('/api/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ current_password: cur, new_password: newPwd })
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            alertBox.style.display = 'block';
            alertBox.style.background = '#fee2e2';
            alertBox.style.color = '#991b1b';
            alertBox.textContent = data.error || 'Failed to update password.';
            submitBtn.disabled = false;
            submitBtn.textContent = 'Save Password';
            return;
          }
          alertBox.style.display = 'block';
          alertBox.style.background = '#dcfce7';
          alertBox.style.color = '#166534';
          alertBox.textContent = '✅ Password changed successfully!';
          submitBtn.textContent = 'Saved!';
          setTimeout(() => {
            closeModal();
            submitBtn.disabled = false;
            submitBtn.textContent = 'Save Password';
            document.getElementById('shell-pwd-form').reset();
            alertBox.style.display = 'none';
          }, 1800);
        } catch (err) {
          alertBox.style.display = 'block';
          alertBox.style.background = '#fee2e2';
          alertBox.style.color = '#991b1b';
          alertBox.textContent = 'Network error. Try again.';
          submitBtn.disabled = false;
          submitBtn.textContent = 'Save Password';
        }
      };
    }
    modal.style.display = 'flex';
  }

  function ensureChangePassword() {
    const btn = document.getElementById('shell-change-pwd-btn');
    if (!btn || btn.dataset.shellBound === '1') return;
    btn.dataset.shellBound = '1';
    btn.disabled = false;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      openChangePasswordModal();
    });
  }

  function sidebarNeedsRebuild(aside) {
    try {
      if (sessionStorage.getItem('sw_sidebar_ver') !== SIDEBAR_VERSION) return true;
      const cachedRole = sessionStorage.getItem(ROLE_CACHE_KEY);
      if (cachedRole !== 'super_admin' && aside.querySelector('a[href="/superadmin"]')) return true;
      if (cachedRole === 'super_admin' && !aside.querySelector('a[href="/superadmin"]')) return true;
    } catch (_) { /* ignore */ }
    return !aside.querySelector('a.sidebar-nav-link[href="/census-desk"]');
  }

  function mountSidebarContent(aside) {
    const cached = sessionStorage.getItem(ROLE_CACHE_KEY) || '';
    CURRENT_ROLE = cached;
    CURRENT_PLAN = sessionStorage.getItem(PLAN_CACHE_KEY) || '';
    if (isSidebarBooted(aside) && cached && !sidebarNeedsRebuild(aside)) {
      syncActiveNav(aside);
      aside.classList.add('shell-mounted');
      aside.classList.remove('is-shell-pending');
      // #region agent log
      dbgLog('app-shell.js:boot-skip', 'skipped mount — sidebar restored from boot cache', {
        page: pageName(),
        cachedRole: cached,
        linkCount: aside.querySelectorAll('a.sidebar-nav-link').length
      }, 'F');
      // #endregion
      return;
    }
    aside.innerHTML = cached ? sidebarHtml() : loadingSidebarHtml();
    aside.classList.add('shell-mounted', 'shell-content-ready');
    if (!cached) {
      aside.classList.add('is-shell-pending');
      aside.classList.remove('shell-content-ready');
    } else {
      aside.classList.remove('is-shell-pending');
      persistSidebarHtml(aside);
    }
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

  const shellPrefetchCache = new Map();
  let shellNavBusy = false;
  const SHELL_SKIP_SRC = /app-shell(-boot)?\.js|design-system\.css/i;
  const SHELL_REEXEC_SRC = /notifications-bell\.js|load-planning\.js|sales\.js|driver-app\.js/i;

  if (!window.__swRun) {
    window.__swRun = function (fn) {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', fn);
      } else {
        Promise.resolve(fn()).catch(console.error);
      }
    };
  }

  function isShellNavLink(a) {
    if (!a || a.target === '_blank' || a.hasAttribute('download')) return false;
    const raw = a.getAttribute('href');
    if (!raw || raw.startsWith('javascript:')) return false;
    if (raw.startsWith('/superadmin') || raw === '/superadmin') return false;
    try {
      const url = new URL(a.href, location.origin);
      if (url.origin !== location.origin) return false;
      if (url.pathname === '/superadmin' || url.pathname.startsWith('/superadmin/')) return false;
      if (url.pathname === location.pathname && url.hash) return false;
      if (!document.querySelector('.app-shell .app-main')) return false;
      if (url.pathname === '/inbox' || url.pathname === '/inbox.html') return false;
      return true;
    } catch (_) {
      return false;
    }
  }

  function prefetchShellPage(href) {
    const url = new URL(href, location.origin);
    const key = url.pathname + url.search;
    if (shellPrefetchCache.has(key)) return;
    fetch(url.pathname + url.search, { credentials: 'include', headers: { Accept: 'text/html' } })
      .then((r) => (r.ok ? r.text() : null))
      .then((html) => { if (html) shellPrefetchCache.set(key, html); })
      .catch(() => {});
  }

  function removePageExtras() {
    const shell = document.querySelector('.app-shell');
    if (!shell) return;
    let el = shell.nextElementSibling;
    while (el) {
      if (el.tagName === 'SCRIPT') break;
      const next = el.nextElementSibling;
      el.remove();
      el = next;
    }
  }

  function applyHeadExtras(doc) {
    const old = document.getElementById('sw-page-style');
    if (old) old.remove();
    const style = doc.querySelector('head style');
    if (!style || !style.textContent.trim()) return;
    const s = document.createElement('style');
    s.id = 'sw-page-style';
    s.textContent = style.textContent;
    document.head.appendChild(s);
  }

  function runFetchedScripts(doc) {
    const scripts = doc.querySelectorAll('body script');
    scripts.forEach((old) => {
      if (old.src && SHELL_SKIP_SRC.test(old.src)) return;
      const s = document.createElement('script');
      if (old.src) {
        if (SHELL_REEXEC_SRC.test(old.src)) {
          const u = new URL(old.src, location.href);
          u.searchParams.set('sw', String(Date.now()));
          s.src = u.pathname + u.search;
        } else if (/main\.js|auth\.js|tms\.js/i.test(old.src)) {
          return;
        } else {
          return;
        }
      } else {
        const code = old.textContent.replace(
          /document\.addEventListener\s*\(\s*['"]DOMContentLoaded['"]\s*,/g,
          '__swRun('
        );
        s.textContent = `try {\n${code}\n} catch(e) { console.error('[APP_SHELL_EXEC]', e); }`;
      }
      document.body.appendChild(s);
    });
  }

  function applyShellDocument(doc) {
    const newMain = doc.querySelector('.app-main');
    const oldMain = document.querySelector('.app-main');
    if (!newMain || !oldMain) throw new Error('missing app-main');

    oldMain.replaceWith(document.importNode(newMain, true));
    removePageExtras();

    const srcShell = doc.querySelector('.app-shell');
    const shell = document.querySelector('.app-shell');
    if (srcShell && shell) {
      const fragment = document.createDocumentFragment();
      let el = srcShell.nextElementSibling;
      while (el) {
        if (el.tagName === 'SCRIPT') break;
        fragment.appendChild(document.importNode(el, true));
        el = el.nextElementSibling;
      }
      shell.parentNode.insertBefore(fragment, shell.nextSibling);
    }

    applyHeadExtras(doc);
    const title = doc.querySelector('title');
    if (title) document.title = title.textContent;
    runFetchedScripts(doc);
  }

  async function shellNavigate(href, opts) {
    const url = new URL(href, location.origin);
    const key = url.pathname + url.search;
    if (shellNavBusy) return;
    shellNavBusy = true;
    const aside = document.querySelector('.app-sidebar');
  try {
      let html = shellPrefetchCache.get(key);
      if (!html) {
        const res = await fetch(key, { credentials: 'include', headers: { Accept: 'text/html' } });
        if (!res.ok) throw new Error('fetch failed');
        html = await res.text();
      } else {
        shellPrefetchCache.delete(key);
      }
      const doc = new DOMParser().parseFromString(html, 'text/html');
      applyShellDocument(doc);
      if (!opts || !opts.noHistory) {
        history.pushState({ swShell: true }, '', url.pathname + url.search + url.hash);
      }
      if (aside) {
        syncActiveNav(aside);
        persistSidebarHtml(aside);
      }
      applyPageHash();
      // #region agent log
      dbgLog('app-shell.js:shell-nav', 'partial navigation applied', {
        page: pageName(),
        href: key,
        prefetched: shellPrefetchCache.has(key)
      }, 'G');
      // #endregion
    } catch (err) {
      // #region agent log
      dbgLog('app-shell.js:shell-nav-fallback', 'partial nav failed, full reload', { href: key, err: String(err) }, 'G');
      // #endregion
      window.location.href = href;
    } finally {
      shellNavBusy = false;
    }
  }

  function setupShellNav() {
    document.addEventListener('click', (e) => {
      const a = e.target.closest('.app-sidebar a[href]');
      if (!a) return;
      const raw = a.getAttribute('href') || '';
      if (raw.startsWith('/superadmin') || raw === '/superadmin') {
        // Direct browser navigation for full-screen Multi-Brand SuperAdmin Command Center
        return;
      }
      if (!isShellNavLink(a)) return;

      const url = new URL(a.href, location.origin);

      // Same-page tab optimization: if already on this page (e.g. /admin-dashboard), switch tab instantly without lag or re-fetch!
      if (url.pathname === location.pathname) {
        e.preventDefault();
        const h = (url.hash || '').replace('#', '').toLowerCase();
        if (pageName() === 'admin-dashboard.html' && typeof window.switchAdminTab === 'function') {
          const tab = ['audit', 'settings', 'blog', 'loads', 'carriers', 'dispatchers', 'users'].includes(h) ? h : 'loads';
          window.switchAdminTab(tab);
          history.pushState({ swShell: true }, '', url.pathname + (h ? '#' + h : ''));
          const aside = document.querySelector('.app-sidebar');
          if (aside) syncActiveNav(aside);
          return;
        }
        if (pageName() === 'dispatcher-dashboard.html' && typeof window.switchDeskTab === 'function') {
          window.switchDeskTab(h === 'fleets' ? 'fleets' : 'desk');
          history.pushState({ swShell: true }, '', url.pathname + (h ? '#' + h : ''));
          const aside = document.querySelector('.app-sidebar');
          if (aside) syncActiveNav(aside);
          return;
        }
        if (pageName() === 'sales-dashboard.html' && typeof window.switchSalesTab === 'function') {
          window.switchSalesTab(h === 'tasks' ? 'tasks' : 'leads');
          history.pushState({ swShell: true }, '', url.pathname + (h ? '#' + h : ''));
          const aside = document.querySelector('.app-sidebar');
          if (aside) syncActiveNav(aside);
          return;
        }
        if (pageName() === 'carrier-overview.html' && typeof window.switchCarrierTab === 'function') {
          window.switchCarrierTab(h === 'loads' ? 'loads' : 'cockpit');
          history.pushState({ swShell: true }, '', url.pathname + (h ? '#' + h : ''));
          const aside = document.querySelector('.app-sidebar');
          if (aside) syncActiveNav(aside);
          return;
        }
        return;
      }

      e.preventDefault();
      shellNavigate(a.href);
    });

    document.querySelector('.app-sidebar')?.addEventListener('mouseenter', (e) => {
      const a = e.target.closest('a[href]');
      if (a && isShellNavLink(a)) prefetchShellPage(a.href);
    }, true);

    window.addEventListener('popstate', (e) => {
      if (e.state && e.state.swShell) {
        shellNavigate(location.href, { noHistory: true });
      }
    });

    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => {
        document.querySelectorAll('.app-sidebar a[href]').forEach((a) => {
          if (isShellNavLink(a)) prefetchShellPage(a.href);
        });
      }, { timeout: 2500 });
    }

    if (!history.state || !history.state.swShell) {
      history.replaceState({ swShell: true }, '', location.href);
    }
  }

  function init() {
    initCallCount += 1;
    const aside = document.querySelector('.app-sidebar');
    if (!aside) return;
    document.body.classList.add('app-body');
    ensureSidebarVersion();

    const staticLinkCount = aside.querySelectorAll('a.sidebar-nav-link').length;
    const staticLabels = Array.from(aside.querySelectorAll('a.sidebar-nav-link')).slice(0, 4).map((a) => a.textContent.trim().slice(0, 40));
    const initStart = Date.now();
    // #region agent log
    dbgLog('app-shell.js:init-start', 'init called with static sidebar in DOM', {
      initCallCount,
      page: pageName(),
      staticLinkCount,
      staticLabels,
      cachedRole: sessionStorage.getItem(ROLE_CACHE_KEY) || null
    }, 'A');
    // #endregion

    mountSidebarContent(aside);
    ensureLogout();
    ensureChangePassword();
    mountMobile();
    setupShellNav();

    fetch('/api/me', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const prevRole = sessionStorage.getItem(ROLE_CACHE_KEY) || '';
        const prevPlan = sessionStorage.getItem(PLAN_CACHE_KEY) || '';
        CURRENT_ROLE = (data && data.user && data.user.role) || '';
        CURRENT_PLAN = (data && data.user && data.user.weekly_plan) || (data && data.access && data.access.subscription && data.access.subscription.plan_key) || '';
        if (CURRENT_ROLE) sessionStorage.setItem(ROLE_CACHE_KEY, CURRENT_ROLE);
        if (CURRENT_PLAN) sessionStorage.setItem(PLAN_CACHE_KEY, CURRENT_PLAN);

        const superMismatch = (CURRENT_ROLE === 'super_admin' && !aside.querySelector('a[href="/superadmin"]'))
          || (CURRENT_ROLE !== 'super_admin' && !!aside.querySelector('a[href="/superadmin"]'));
        const skipRebuild = CURRENT_ROLE && CURRENT_ROLE === prevRole && CURRENT_PLAN === prevPlan && navReady && !superMismatch;

        if (skipRebuild) {
          syncActiveNav(aside);
          // #region agent log
          dbgLog('app-shell.js:skip-rebuild', 'skipped sidebar DOM rebuild on navigation', {
            initCallCount,
            page: pageName(),
            role: CURRENT_ROLE,
            msSinceInit: Date.now() - initStart
          }, 'E');
          // #endregion
        } else {
          aside.innerHTML = sidebarHtml();
          aside.classList.add('shell-content-ready');
          persistSidebarHtml(aside);
          ensureLogout();
          ensureChangePassword();
        }

        aside.classList.add('shell-mounted');
        aside.classList.remove('is-shell-pending');
        const afterReplace = aside.querySelectorAll('a.sidebar-nav-link').length;
        const renderedLabels = Array.from(aside.querySelectorAll('a.sidebar-nav-link')).slice(0, 4).map((a) => a.textContent.trim().slice(0, 40));
        // #region agent log
        dbgLog('app-shell.js:after-me', 'sidebar state after /api/me', {
          initCallCount,
          msSinceInit: Date.now() - initStart,
          role: CURRENT_ROLE,
          skipRebuild,
          afterReplace,
          renderedLabels,
          isCarrierShell: isCarrierShell()
        }, 'B');
        // #endregion
        applyPageHash();
        fillUser(data && data.user);
        if (CURRENT_ROLE === 'carrier' || CURRENT_ROLE === 'carrier_admin') {
          const p = pageName();
          if (p === 'dashboard.html') window.location.replace('/carrier-overview');
          if (p === 'crm-sales.html' || p === 'census-desk.html' || p === 'staff-management.html' || p === 'admin-dashboard.html' || p === 'dispatcher-dashboard.html') {
            window.location.replace('/carrier-overview');
          }
        }
        if (CURRENT_ROLE === 'driver' && pageName() !== 'driver-app.html') {
          window.location.replace('/driver-app');
        }
      })
      .catch((err) => {
        // #region agent log
        dbgLog('app-shell.js:me-error', '/api/me failed', { initCallCount, err: String(err) }, 'C');
        // #endregion
      });
    window.addEventListener('hashchange', applyPageHash);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
