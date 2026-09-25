(function () {
  const toggle = document.getElementById('mobile-toggle');
  const drawer = document.getElementById('mobile-drawer');
  const overlay = document.getElementById('mobile-overlay');
  const closeBtn = document.getElementById('mobile-close');
  const dropBtn = document.getElementById('services-drop-btn');
  const mega = document.getElementById('services-mega');
  const dropWrap = document.getElementById('services-drop');
  const mobileSvcBtn = document.getElementById('mobile-services-btn');
  const mobileSvcAcc = document.getElementById('mobile-services-acc');

  function openMenu() {
    drawer?.classList.add('open');
    overlay?.removeAttribute('hidden');
    overlay?.classList.add('open');
    document.body.classList.add('limo-menu-open');
    toggle?.setAttribute('aria-expanded', 'true');
    drawer?.setAttribute('aria-hidden', 'false');
  }

  function closeMenu() {
    drawer?.classList.remove('open');
    overlay?.classList.remove('open');
    overlay?.setAttribute('hidden', '');
    document.body.classList.remove('limo-menu-open');
    toggle?.setAttribute('aria-expanded', 'false');
    drawer?.setAttribute('aria-hidden', 'true');
  }

  toggle?.addEventListener('click', () => {
    drawer?.classList.contains('open') ? closeMenu() : openMenu();
  });
  closeBtn?.addEventListener('click', closeMenu);
  overlay?.addEventListener('click', closeMenu);
  drawer?.querySelectorAll('a').forEach((a) => a.addEventListener('click', closeMenu));

  mobileSvcBtn?.addEventListener('click', () => {
    const open = mobileSvcAcc?.hasAttribute('hidden');
    if (open) {
      mobileSvcAcc.removeAttribute('hidden');
      mobileSvcBtn.textContent = 'Services ▴';
    } else {
      mobileSvcAcc.setAttribute('hidden', '');
      mobileSvcBtn.textContent = 'Services ▾';
    }
  });

  function closeMega() {
    mega?.setAttribute('hidden', '');
    dropBtn?.setAttribute('aria-expanded', 'false');
    dropWrap?.classList.remove('open');
  }

  function openMega() {
    mega?.removeAttribute('hidden');
    dropBtn?.setAttribute('aria-expanded', 'true');
    dropWrap?.classList.add('open');
  }

  dropBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    mega?.hasAttribute('hidden') ? openMega() : closeMega();
  });

  dropWrap?.addEventListener('mouseenter', () => {
    if (window.matchMedia('(min-width: 769px)').matches) {
      clearTimeout(dropWrap._closeTimer);
      openMega();
    }
  });
  dropWrap?.addEventListener('mouseleave', () => {
    if (window.matchMedia('(min-width: 769px)').matches) {
      dropWrap._closeTimer = setTimeout(closeMega, 180);
    }
  });
  mega?.addEventListener('mouseenter', () => clearTimeout(dropWrap?._closeTimer));
  mega?.addEventListener('mouseleave', () => {
    if (window.matchMedia('(min-width: 769px)').matches) {
      dropWrap._closeTimer = setTimeout(closeMega, 180);
    }
  });

  document.addEventListener('click', (e) => {
    if (!dropWrap?.contains(e.target)) closeMega();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeMega();
      closeMenu();
    }
  });
})();
