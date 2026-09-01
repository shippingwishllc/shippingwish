(function () {
  var aside = document.getElementById('app-sidebar') || document.querySelector('.app-sidebar');
  if (!aside) return;
  try {
    var role = sessionStorage.getItem('sw_portal_role');
    var html = sessionStorage.getItem('sw_sidebar_html');
    if (role && html) {
      aside.innerHTML = html;
      aside.classList.add('shell-mounted', 'shell-content-ready');
      document.documentElement.classList.add('portal-nav-cached');
    }
  } catch (_) { /* ignore */ }
})();
