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
  // #endregion

  function clearRoleCache() {
    try {
      sessionStorage.removeItem(ROLE_CACHE_KEY);
      sessionStorage.removeItem(SIDEBAR_HTML_KEY);
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
        <button type="button" class="btn btn-light btn-block btn-sm" id="shell-logout-btn" disabled>Sign out</button>
      </div>`;
  }

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
    { key: 'trash', href: '/trash', icon: '🗑️', label: 'Trash', adminOnly: true },
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
    { key: 'invoices', href: '/invoices', icon: '💳', label: 'Service billing' },
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
    if (isCarrierRole(role)) return CARRIER_LINKS;
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
    // #region agent log
    dbgLog('app-shell.js:sidebarHtml', 'building sidebar HTML', {
      currentRole: CURRENT_ROLE || '(empty)',
      carrier,
      driver,
      linkSet: driver ? 'driver' : carrier ? 'carrier' : 'staff'
    }, 'D');
    // #endregion
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
    if (!btn || btn.dataset.shellBound === '1') return;
    btn.dataset.shellBound = '1';
    btn.disabled = false;
    btn.addEventListener('click', () => {
      clearRoleCache();
      if (typeof window.logout === 'function') return window.logout();
      fetch('/api/logout', { method: 'POST', credentials: 'include' }).finally(() => {
        window.location.href = '/login';
      });
    });
  }

  function mountSidebarContent(aside) {
    const cached = sessionStorage.getItem(ROLE_CACHE_KEY) || '';
    CURRENT_ROLE = cached;
    if (isSidebarBooted(aside) && cached) {
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
        s.textContent = code;
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
    mountMobile();
    setupShellNav();

    fetch('/api/me', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const prevRole = sessionStorage.getItem(ROLE_CACHE_KEY) || '';
        CURRENT_ROLE = (data && data.user && data.user.role) || '';
        if (CURRENT_ROLE) sessionStorage.setItem(ROLE_CACHE_KEY, CURRENT_ROLE);

        const navReady = aside.classList.contains('shell-content-ready')
          && aside.querySelectorAll('a.sidebar-nav-link').length > 0;
        const skipRebuild = CURRENT_ROLE && CURRENT_ROLE === prevRole && navReady;

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
