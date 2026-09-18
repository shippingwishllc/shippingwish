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
  const SIDEBAR_VERSION = '24';
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

  const STAFF_LINKS = [
    { section: 'Operations' },
    { key: 'overview', navId: 'nav-tab-loads', href: '/admin-dashboard', icon: '📊', label: 'Overview & Loads' },
    { key: 'loadnexus', href: '/admin-loadnexus', icon: '🛡️', label: 'LoadNexus Command' },
    { key: 'dispatch', navId: 'nav-tab-desk', href: '/dispatcher-dashboard', icon: '🎧', label: 'Dispatch Desk' },
    { key: 'loadboard', href: '/load-booking', icon: '🎯', label: 'Load Board & AI Match' },
    { key: 'brokers', href: '/brokers', icon: '🤝', label: 'Broker Directory' },
    { key: 'fleet', href: '/fleet', icon: '🚛', label: 'Fleet & Drivers' },
    { section: 'Sales & Staff' },
    { key: 'crm', href: '/crm-sales', icon: '📈', label: 'Sales CRM & Leads' },
    { key: 'inbox', href: '/inbox', icon: '📬', label: 'Carrier Replies' },
    { key: 'sms-inbox', href: '/sms-inbox', icon: '📱', label: 'SMS Replies' },
    { key: 'trash', href: '/trash', icon: '🗑️', label: 'Trash', adminOnly: true },
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
    { key: 'loadboard', href: '/load-booking', icon: '🎯', label: 'Load Board & AI Bidding' },
    { key: 'fleet', href: '/fleet', icon: '🚛', label: 'Trucks & drivers' },
    { key: 'planning', href: '/load-planning', icon: '📅', label: 'Empty truck / next load' },
    { key: 'documents', href: '/documents', icon: '📄', label: 'Documents' },
    { key: 'brokers', href: '/brokers', icon: '🤝', label: 'Broker credit check' },
    { section: 'Money' },
    { key: 'invoices', href: '/invoices', icon: '💳', label: 'Service billing' },
    { key: 'ifta', href: '/ifta', icon: '⛽', label: 'IFTA & fuel' },
    { section: 'On the road' },
    { key: 'driver', href: '/driver-app', icon: '📱', label: 'Driver phone app' }
  ];

  const DRIVER_LINKS = [
    { section: 'Road' },
    { key: 'driver', href: '/driver-app', icon: '📱', label: 'My load' }
  ];

  const LOADBOARD_MEMBER_LINKS = [
    { section: 'Self-Dispatch AI Suite' },
    { key: 'loadboard', href: '/load-booking', icon: '🎯', label: 'Live AI Load Board' },
    { key: 'brokers', href: '/brokers', icon: '🤝', label: 'Broker Credit & FMCSA Check' },
    { key: 'calculator', href: '/services#calculator', icon: '📈', label: 'RPM & Lane Calculator' },
    { section: 'My Account' },
    { key: 'home', href: '/carrier-overview', icon: '⚙️', label: 'Subscription & Profile' }
  ];

  const PAGE_KEY = {
    'admin-loadnexus.html': 'loadnexus',
    'admin-dashboard.html': 'overview',
    'dispatcher-dashboard.html': 'dispatch',
    'load-booking.html': 'loadboard',
    'brokers.html': 'brokers',
    'fleet.html': 'fleet',
    'crm-sales.html': 'crm',
    'sales-dashboard.html': 'crm',
    'inbox.html': 'inbox',
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
    'trash.html': 'trash'
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
    const staff = STAFF_LINKS.filter((item) => {
      if (!item.adminOnly) return true;
      return role === 'admin' || role === 'super_admin';
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
    const tag = driver ? 'Driver app' : loadboardSub ? 'AI Load Pass' : carrier ? 'Your TMS' : 'Operations';
    const home = driver ? '/driver-app' : loadboardSub ? '/load-booking' : carrier ? '/carrier-overview' : '/admin-dashboard';
    const links = driver ? DRIVER_LINKS : loadboardSub ? LOADBOARD_MEMBER_LINKS : carrier ? CARRIER_LINKS : STAFF_LINKS.concat(extraLinks());
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
    } catch (_) { /* ignore */ }
    return !aside.querySelector('a.sidebar-nav-link[href="/sms-inbox"]');
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
    try {
      const url = new URL(a.href, location.origin);
      if (url.origin !== location.origin) return false;
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
        s.textContent = `try { (function(){\n${code}\n})(); } catch(e) { console.error('[APP_SHELL_EXEC]', e); }`;
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
      const apply = () => applyShellDocument(doc);
      if (document.startViewTransition) {
        await document.startViewTransition(apply);
      } else {
        apply();
      }
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
      if (!a || !isShellNavLink(a)) return;
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

        const navReady = aside.classList.contains('shell-content-ready')
          && aside.querySelectorAll('a.sidebar-nav-link').length > 0;
        const skipRebuild = CURRENT_ROLE && CURRENT_ROLE === prevRole && CURRENT_PLAN === prevPlan && navReady;

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
          if (p === 'crm-sales.html' || p === 'staff-management.html' || p === 'admin-dashboard.html' || p === 'dispatcher-dashboard.html') {
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
