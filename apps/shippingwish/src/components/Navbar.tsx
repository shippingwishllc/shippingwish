import React, { useState, useEffect } from 'react';

export const Navbar: React.FC = () => {
  const [scrolled, setScrolled] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [servicesOpen, setServicesOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-200 ${
          scrolled
            ? 'bg-slate-900/95 backdrop-blur-md shadow-lg border-b border-slate-800'
            : 'bg-slate-950/80 backdrop-blur-sm border-b border-slate-800/60'
        }`}
        role="navigation"
        aria-label="Main Navigation"
      >
        <div className="max-w-[1240px] mx-auto px-6 h-[76px] flex items-center justify-between">
          {/* Logo */}
          <a href="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-blue-400 text-white font-black flex items-center justify-center text-sm shadow-md shadow-blue-500/20 group-hover:scale-105 transition-transform">
              SW
            </div>
            <div className="text-xl font-display font-extrabold text-white tracking-tight">
              Shipping <span className="text-blue-500">Wish</span>
            </div>
          </a>

          {/* Desktop Nav Links */}
          <ul className="hidden lg:flex items-center gap-7 text-sm font-semibold text-slate-300">
            <li>
              <a href="/" className="text-white hover:text-blue-400 transition-colors">
                Home
              </a>
            </li>

            {/* Services Dropdown */}
            <li className="relative group">
              <button
                type="button"
                onClick={() => setServicesOpen(!servicesOpen)}
                className="flex items-center gap-1 hover:text-white transition-colors py-2"
              >
                <span>Services</span>
                <span className="text-xs opacity-70">▾</span>
              </button>

              <div className="absolute top-full left-0 w-64 bg-slate-900 border border-slate-800 rounded-2xl p-3 shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 transform translate-y-2 group-hover:translate-y-0">
                <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider px-3 py-1.5">
                  Operations
                </div>
                <a
                  href="/carrier-setup"
                  className="block px-3 py-2 rounded-xl text-xs font-bold text-amber-400 hover:bg-slate-800/80 transition-colors"
                >
                  ⚡ Carrier Setup (Online)
                </a>
                <a
                  href="/dispatch"
                  className="block px-3 py-2 rounded-xl text-xs font-medium text-slate-200 hover:bg-slate-800/80 hover:text-white transition-colors"
                >
                  Fleet Operations Manager
                </a>
                <a
                  href="/fleet-support"
                  className="block px-3 py-2 rounded-xl text-xs font-medium text-slate-200 hover:bg-slate-800/80 hover:text-white transition-colors"
                >
                  Fleet Support
                </a>

                <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider px-3 py-1.5 mt-2 border-t border-slate-800/80">
                  Load Board
                </div>
                <a
                  href="https://www.loadsnexus.com"
                  target="_blank"
                  rel="noopener"
                  className="block px-3 py-2 rounded-xl text-xs font-bold text-blue-400 hover:bg-slate-800/80 transition-colors"
                >
                  🔷 LoadsNexus™ AI Load Board ↗
                </a>
                <a
                  href="/mobile-apps"
                  className="block px-3 py-2 rounded-xl text-xs font-medium text-blue-300 hover:bg-slate-800/80 transition-colors"
                >
                  📱 Mobile Apps (iOS &amp; Android)
                </a>

                <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider px-3 py-1.5 mt-2 border-t border-slate-800/80">
                  Financial &amp; Compliance
                </div>
                <a
                  href="/factoring"
                  className="block px-3 py-2 rounded-xl text-xs font-medium text-slate-200 hover:bg-slate-800/80 hover:text-white transition-colors"
                >
                  Factoring
                </a>
                <a
                  href="/insurance"
                  className="block px-3 py-2 rounded-xl text-xs font-medium text-slate-200 hover:bg-slate-800/80 hover:text-white transition-colors"
                >
                  Insurance
                </a>
                <a
                  href="/eld"
                  className="block px-3 py-2 rounded-xl text-xs font-medium text-slate-200 hover:bg-slate-800/80 hover:text-white transition-colors"
                >
                  ELD &amp; Telematics
                </a>
                <a
                  href="/dot-compliance"
                  className="block px-3 py-2 rounded-xl text-xs font-medium text-slate-200 hover:bg-slate-800/80 hover:text-white transition-colors"
                >
                  DOT Compliance
                </a>
              </div>
            </li>

            <li>
              <a href="/carrier-setup" className="text-amber-400 hover:text-amber-300 transition-colors font-bold">
                Carrier Setup
              </a>
            </li>
            <li>
              <a href="/pricing" className="hover:text-white transition-colors">
                Pricing
              </a>
            </li>
            <li>
              <a href="/carrier-search" className="hover:text-white transition-colors">
                Carrier Lookup
              </a>
            </li>
            <li>
              <a href="/about" className="hover:text-white transition-colors">
                About
              </a>
            </li>
            <li>
              <a href="/contact" className="hover:text-white transition-colors">
                Contact
              </a>
            </li>
          </ul>

          {/* Desktop Right Actions */}
          <div className="hidden lg:flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800/80 border border-slate-700/80 text-xs font-bold text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-500 live-pulse-dot"></span>
              <span>24/7 Desk</span>
            </div>

            <a
              href="/login"
              className="px-4 py-2 text-xs font-bold text-slate-300 hover:text-white border border-slate-700 hover:border-slate-600 rounded-xl transition-colors"
            >
              Sign In
            </a>

            <a
              href="/pricing"
              className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-xl shadow-md shadow-blue-600/30 transition-all hover:scale-[1.02]"
            >
              Start Free Week
            </a>
          </div>

          {/* Mobile Hamburger */}
          <button
            type="button"
            className="lg:hidden flex flex-col justify-center items-center gap-1.5 w-10 h-10 rounded-xl border border-slate-800 text-slate-300"
            onClick={() => setDrawerOpen(!drawerOpen)}
            aria-label="Toggle navigation menu"
          >
            <span className="w-5 h-0.5 bg-slate-300"></span>
            <span className="w-5 h-0.5 bg-slate-300"></span>
            <span className="w-5 h-0.5 bg-slate-300"></span>
          </button>
        </div>
      </nav>

      {/* Mobile Drawer */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden bg-slate-950/80 backdrop-blur-md"
          onClick={() => setDrawerOpen(false)}
        >
          <div
            className="fixed top-0 right-0 bottom-0 w-[300px] bg-slate-900 border-l border-slate-800 p-6 flex flex-col gap-5 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="font-display font-extrabold text-white text-lg">
                Shipping <span className="text-blue-500">Wish</span>
              </div>
              <button
                type="button"
                className="w-8 h-8 rounded-full border border-slate-800 flex items-center justify-center text-slate-400 hover:text-white"
                onClick={() => setDrawerOpen(false)}
              >
                ✕
              </button>
            </div>

            <nav className="flex flex-col gap-3.5 text-sm font-semibold text-slate-300">
              <a href="/" onClick={() => setDrawerOpen(false)} className="hover:text-white">Home</a>
              <a href="/carrier-setup" onClick={() => setDrawerOpen(false)} className="text-amber-400 font-bold">⚡ Carrier Setup (Online)</a>
              <a href="https://www.loadsnexus.com" target="_blank" rel="noopener" onClick={() => setDrawerOpen(false)} className="text-blue-400 font-bold">🔷 LoadsNexus™ AI Load Board ↗</a>
              <a href="/mobile-apps" onClick={() => setDrawerOpen(false)} className="text-blue-300 font-medium">📱 Mobile Apps (iOS &amp; Android)</a>
              <a href="/services" onClick={() => setDrawerOpen(false)} className="hover:text-white">Services</a>
              <a href="/dispatch" onClick={() => setDrawerOpen(false)} className="hover:text-white">Fleet Operations</a>
              <a href="/pricing" onClick={() => setDrawerOpen(false)} className="hover:text-white">Pricing</a>
              <a href="/carrier-search" onClick={() => setDrawerOpen(false)} className="hover:text-white">Carrier Lookup</a>
              <a href="/about" onClick={() => setDrawerOpen(false)} className="hover:text-white">About</a>
              <a href="/contact" onClick={() => setDrawerOpen(false)} className="hover:text-white">Contact</a>
            </nav>

            <div className="mt-auto pt-6 border-t border-slate-800 flex flex-col gap-3">
              <a
                href="/login"
                onClick={() => setDrawerOpen(false)}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-center text-slate-200 bg-slate-800 hover:bg-slate-700"
              >
                Sign In to TMS Portal
              </a>
              <a
                href="/pricing"
                onClick={() => setDrawerOpen(false)}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-center text-white bg-blue-600 hover:bg-blue-500 shadow-md shadow-blue-600/30"
              >
                Start 7 Days Free — $0 Today
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
