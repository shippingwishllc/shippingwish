import React, { useState, useEffect } from 'react';
import type { UserSession } from '../types';

interface NavbarProps {
  user: UserSession | null;
  onOpenAuth: (role?: 'carrier' | 'broker') => void;
  onOpenCarrierCheckout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ user, onOpenAuth, onOpenCarrierCheckout }) => {
  const [scrolled, setScrolled] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-200 ${
          scrolled ? 'bg-white/95 backdrop-blur-md shadow-sm border-b border-slate-200' : 'bg-white border-b border-slate-100'
        }`}
        role="navigation"
        aria-label="Main Navigation"
      >
        <div className="max-w-[1220px] mx-auto px-6 h-[74px] flex items-center justify-between">
          {/* Logo */}
          <a href="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-700 to-blue-500 text-white font-extrabold flex items-center justify-center text-sm shadow-md shadow-blue-500/20 group-hover:scale-105 transition-transform">
              LN
            </div>
            <div className="text-xl font-display font-extrabold text-slate-900 tracking-tight">
              Loads<span className="text-blue-600">Nexus</span>
              <sup className="text-[10px] font-black text-blue-600 ml-0.5">™</sup>
            </div>
          </a>

          {/* Nav Links */}
          <ul className="hidden md:flex items-center gap-7 text-sm font-semibold text-slate-600">
            <li>
              <a href="#live-board-section" className="hover:text-blue-600 transition-colors">
                Search Live Loads
              </a>
            </li>
            <li>
              <a href="#solutions" className="hover:text-blue-600 transition-colors">
                Carriers
              </a>
            </li>
            <li>
              <a href="#solutions" className="hover:text-blue-600 transition-colors">
                Brokers
              </a>
            </li>
            <li>
              <a href="#comparison" className="hover:text-blue-600 transition-colors">
                Why LoadsNexus
              </a>
            </li>
            <li>
              <a href="#apps" className="hover:text-blue-600 transition-colors">
                Mobile Apps
              </a>
            </li>
            <li>
              <a href="#pricing" className="hover:text-blue-600 transition-colors">
                Pricing ($19/mo)
              </a>
            </li>
          </ul>

          {/* Actions */}
          <div className="hidden lg:flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 border border-slate-200 text-xs font-medium text-slate-600">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              <span>Operated by Shipping Wish LLC</span>
            </div>

            {user ? (
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-700 bg-blue-50 border border-blue-100 px-3 py-1.5 rounded-lg">
                  👤 {user.name || user.email} ({user.role})
                </span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onOpenAuth()}
                className="px-4 py-2 text-xs font-bold text-slate-700 hover:text-slate-900 border border-slate-200 hover:border-slate-300 rounded-lg transition-colors"
              >
                Sign In
              </button>
            )}

            <button
              type="button"
              onClick={onOpenCarrierCheckout}
              className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm shadow-blue-600/30 transition-all hover:shadow"
            >
              Get Started ($19/mo)
            </button>
          </div>

          {/* Hamburger button */}
          <button
            type="button"
            className="md:hidden flex flex-col justify-center items-center gap-1.5 w-10 h-10 rounded-lg border border-slate-200 text-slate-700"
            onClick={() => setDrawerOpen(!drawerOpen)}
            aria-label="Toggle navigation menu"
          >
            <span className="w-5 h-0.5 bg-slate-700"></span>
            <span className="w-5 h-0.5 bg-slate-700"></span>
            <span className="w-5 h-0.5 bg-slate-700"></span>
          </button>
        </div>
      </nav>

      {/* Mobile Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden bg-slate-900/60 backdrop-blur-sm" onClick={() => setDrawerOpen(false)}>
          <div
            className="fixed top-0 right-0 bottom-0 w-[280px] bg-white p-6 flex flex-col gap-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="font-display font-extrabold text-slate-900">
                Loads<span className="text-blue-600">Nexus</span>™
              </div>
              <button
                type="button"
                className="w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center text-slate-500"
                onClick={() => setDrawerOpen(false)}
              >
                ✕
              </button>
            </div>

            <nav className="flex flex-col gap-4 text-sm font-semibold text-slate-700">
              <a href="#live-board-section" onClick={() => setDrawerOpen(false)}>Search Live Loads</a>
              <a href="#solutions" onClick={() => setDrawerOpen(false)}>For Carriers &amp; Drivers</a>
              <a href="#solutions" onClick={() => setDrawerOpen(false)}>For Freight Brokers</a>
              <a href="#comparison" onClick={() => setDrawerOpen(false)}>Compare vs DAT</a>
              <a href="#apps" onClick={() => setDrawerOpen(false)}>Mobile Applications</a>
              <a href="#pricing" onClick={() => setDrawerOpen(false)}>Pricing ($19/mo)</a>
            </nav>

            <div className="mt-auto flex flex-col gap-3">
              <button
                type="button"
                onClick={() => { setDrawerOpen(false); onOpenAuth('carrier'); }}
                className="w-full py-2.5 text-xs font-bold text-slate-800 bg-slate-100 rounded-lg text-center"
              >
                Carrier Portal Sign In
              </button>
              <button
                type="button"
                onClick={() => { setDrawerOpen(false); onOpenAuth('broker'); }}
                className="w-full py-2.5 text-xs font-bold text-purple-700 bg-purple-50 rounded-lg text-center"
              >
                Broker Portal Sign In
              </button>
              <button
                type="button"
                onClick={() => { setDrawerOpen(false); onOpenCarrierCheckout(); }}
                className="w-full py-2.5 text-xs font-bold text-white bg-blue-600 rounded-lg text-center shadow-md shadow-blue-600/30"
              >
                Start Load Board — $19/mo
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
