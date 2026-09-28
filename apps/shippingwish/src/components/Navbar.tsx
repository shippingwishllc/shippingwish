import React, { useState, useEffect } from 'react';

export const Navbar: React.FC = () => {
  const [scrolled, setScrolled] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 1024) setDrawerOpen(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    document.body.classList.toggle('sw-menu-open', drawerOpen);
    const previous = document.body.style.overflow;
    document.body.style.overflow = drawerOpen ? 'hidden' : previous;
    return () => {
      document.body.classList.remove('sw-menu-open');
      document.body.style.overflow = '';
    };
  }, [drawerOpen]);

  const close = () => setDrawerOpen(false);

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-200 ${
          scrolled
            ? 'bg-slate-900/95 backdrop-blur-md shadow-lg border-b border-slate-800'
            : 'bg-slate-950 border-b border-slate-800'
        }`}
        role="navigation"
        aria-label="Main Navigation"
      >
        <div className="max-w-[1240px] mx-auto px-4 sm:px-6 h-[72px] flex items-center justify-between gap-4">
          <a href="/" className="flex items-center gap-3 group shrink-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-blue-400 text-white font-black flex items-center justify-center text-sm shadow-md shadow-blue-500/20 group-hover:scale-105 transition-transform">
              SW
            </div>
            <div className="text-lg font-display font-extrabold text-white tracking-tight">
              Shipping <span className="text-blue-400">Wish</span>
            </div>
          </a>

          <ul className="hidden lg:flex items-center gap-1 text-[13px] font-semibold text-slate-200">
            <li>
              <a href="/" className="px-3 py-2 rounded-lg text-white hover:bg-white/10 transition-colors">
                Home
              </a>
            </li>
            <li className="relative group">
              <a
                href="/services"
                className="flex items-center gap-1 px-3 py-2 rounded-lg hover:bg-white/10 hover:text-white transition-colors"
              >
                Services
                <span className="text-[10px] opacity-70">▾</span>
              </a>
              <div className="absolute top-full left-0 w-64 bg-white border border-slate-200 rounded-2xl p-3 shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-50">
                <div className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider px-3 py-1.5">
                  Operations
                </div>
                <a href="/carrier-setup" className="block px-3 py-2 rounded-xl text-xs font-bold text-amber-700 hover:bg-amber-50">Carrier Setup (Online)</a>
                <a href="/dispatch" className="block px-3 py-2 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50">Fleet Operations Manager</a>
                <a href="/fleet-support" className="block px-3 py-2 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50">Fleet Support</a>
                <a href="/#equipment" className="block px-3 py-2 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50">Equipment we book</a>
                <div className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider px-3 py-1.5 mt-2 border-t border-slate-100">Load Board</div>
                <a href="https://www.loadsnexus.com" target="_blank" rel="noopener" className="block px-3 py-2 rounded-xl text-xs font-bold text-blue-700 hover:bg-slate-50">LoadsNexus AI Load Board</a>
                <a href="/mobile-apps" className="block px-3 py-2 rounded-xl text-xs font-medium text-blue-700 hover:bg-slate-50">Mobile Apps</a>
                <div className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider px-3 py-1.5 mt-2 border-t border-slate-100">Tools</div>
                <a href="/carrier-search" className="block px-3 py-2 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50">FMCSA Carrier Lookup</a>
                <a href="/factoring" className="block px-3 py-2 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50">Factoring</a>
                <a href="/insurance" className="block px-3 py-2 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50">Insurance</a>
                <a href="/eld" className="block px-3 py-2 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50">ELD &amp; Telematics</a>
                <a href="/dot-compliance" className="block px-3 py-2 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50">DOT Compliance</a>
              </div>
            </li>
            <li>
              <a href="/#how-dispatch-works" className="px-3 py-2 rounded-lg hover:bg-white/10 hover:text-white transition-colors">How it works</a>
            </li>
            <li>
              <a href="/pricing" className="px-3 py-2 rounded-lg hover:bg-white/10 hover:text-white transition-colors">Pricing</a>
            </li>
            <li>
              <a href="/about" className="px-3 py-2 rounded-lg hover:bg-white/10 hover:text-white transition-colors">About</a>
            </li>
            <li>
              <a href="/contact" className="px-3 py-2 rounded-lg hover:bg-white/10 hover:text-white transition-colors">Contact</a>
            </li>
          </ul>

          <div className="hidden lg:flex items-center gap-3 shrink-0">
            <a href="tel:+19177370021" className="text-[13px] font-bold text-slate-200 hover:text-white whitespace-nowrap">
              +1 (917) 737-0021
            </a>
            <a
              href="/login"
              className="px-3 py-2 text-xs font-bold text-slate-100 hover:text-white border border-white/20 hover:border-white/40 rounded-full transition-colors"
            >
              Sign In
            </a>
            <a
              href="/pricing"
              className="px-4 py-2 text-xs font-extrabold uppercase tracking-wide text-white bg-blue-600 hover:bg-blue-500 rounded-full shadow-md shadow-blue-600/30 transition-all"
            >
              Start free week
            </a>
          </div>

          <button
            type="button"
            className="lg:hidden flex flex-col justify-center items-center gap-1.5 w-10 h-10 rounded-xl border border-white/20 text-white"
            onClick={() => setDrawerOpen(!drawerOpen)}
            aria-label="Toggle navigation menu"
            aria-expanded={drawerOpen}
          >
            <span className="w-5 h-0.5 bg-white"></span>
            <span className="w-5 h-0.5 bg-white"></span>
            <span className="w-5 h-0.5 bg-white"></span>
          </button>
        </div>
      </nav>

      {drawerOpen && (
        <div className="sw-drawer lg:hidden fixed inset-0 z-[80] bg-white flex flex-col" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="h-[72px] px-5 flex items-center justify-between border-b border-slate-800 shrink-0 bg-slate-950">
            <a href="/" onClick={close} className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-blue-400 text-white font-black flex items-center justify-center text-sm">
                SW
              </div>
              <div className="text-lg font-display font-extrabold text-white tracking-tight">
                Shipping <span className="text-blue-400">Wish</span>
              </div>
            </a>
            <button
              type="button"
              className="w-10 h-10 rounded-full border border-slate-700 flex items-center justify-center text-slate-300 hover:text-white"
              onClick={close}
              aria-label="Close menu"
            >
              ✕
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-5 pt-2">
            {[
              ['/', 'Home'],
              ['/services', 'Services'],
              ['/#how-dispatch-works', 'How it works'],
              ['/carrier-setup', 'Carrier Setup (Online)'],
              ['/dispatch', 'Fleet Operations'],
              ['/pricing', 'Pricing'],
              ['/carrier-search', 'Carrier Lookup'],
              ['/about', 'About'],
              ['/contact', 'Contact'],
            ].map(([href, label]) => (
              <a
                key={href}
                href={href}
                onClick={close}
                className={`block py-4 text-base font-semibold border-b border-slate-200 ${
                  href === '/carrier-setup' ? 'text-amber-700' : 'text-slate-800'
                }`}
              >
                {label}
              </a>
            ))}
            <a
              href="https://www.loadsnexus.com"
              target="_blank"
              rel="noopener"
              onClick={close}
              className="block py-4 text-base font-semibold text-blue-700 border-b border-slate-200"
            >
              LoadsNexus AI Load Board
            </a>
          </nav>

          <div
            className="shrink-0 px-5 pt-4 border-t border-slate-200 flex flex-col gap-3 bg-white"
            style={{ paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))' }}
          >
            <a href="tel:+19177370021" onClick={close} className="w-full py-3.5 px-4 rounded-xl text-sm font-bold text-center text-slate-800 bg-white border border-slate-300">
              Call +1 (917) 737-0021
            </a>
            <a href="/login" onClick={close} className="w-full py-3.5 px-4 rounded-xl text-sm font-bold text-center text-slate-800 bg-white border border-slate-300">
              Sign In
            </a>
            <a href="/pricing" onClick={close} className="w-full py-3.5 px-4 rounded-xl text-sm font-extrabold text-center text-white bg-blue-600">
              Start 7 Days Free — $0 Today
            </a>
          </div>
        </div>
      )}
    </>
  );
};
