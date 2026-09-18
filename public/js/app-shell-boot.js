(function () {
  function performLogout() {
    try { sessionStorage.clear(); } catch (_) {}
    try { localStorage.clear(); } catch (_) {}
    var past = 'Thu, 01 Jan 1970 00:00:01 GMT;';
    document.cookie = 'sw_token=; Path=/; Expires=' + past;
    document.cookie = 'sw_token=; Path=/; Domain=.shippingwish.com; Expires=' + past;
    document.cookie = 'sw_token=; Path=/; Domain=shippingwish.com; Expires=' + past;
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/logout');
      } else {
        fetch('/api/logout', { method: 'POST', credentials: 'include' }).catch(function () {});
      }
    } catch (_) {}
    window.location.replace('/login?logged_out=1');
  }

  window.logout = performLogout;
  window.swForceLogout = performLogout;

  document.addEventListener('click', function (e) {
    var el = e.target;
    while (el && el !== document) {
      if (el.id === 'shell-logout-btn' || el.id === 'logout-btn' || (el.getAttribute && el.getAttribute('data-action') === 'logout')) {
        e.preventDefault();
        e.stopPropagation();
        try {
          el.setAttribute('disabled', 'true');
          el.textContent = 'Signing out...';
        } catch (_) {}
        performLogout();
        return;
      }
      el = el.parentElement;
    }
  }, true);

  var aside = document.getElementById('app-sidebar') || document.querySelector('.app-sidebar');
  if (!aside) return;
  try {
    var BOOT_VER = '23';
    if (sessionStorage.getItem('sw_sidebar_ver') !== BOOT_VER) return;
    var role = sessionStorage.getItem('sw_portal_role');
    var html = sessionStorage.getItem('sw_sidebar_html');
    if (role && html && html.indexOf('/sms-inbox') !== -1) {
      aside.innerHTML = html;
      aside.classList.add('shell-mounted', 'shell-content-ready');
      document.documentElement.classList.add('portal-nav-cached');
    }
  } catch (_) { /* ignore */ }
})();

