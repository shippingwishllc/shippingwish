import React, { useState, useEffect } from 'react';
import type { UserSession } from '../types';

interface NavbarProps {
  user: UserSession | null;
  onOpenAuth: (role?: 'carrier' | 'broker') => void;
  onOpenCarrierCheckout: () => void;
  onOpenBrokerPost?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  onOpenAuth,
  onOpenCarrierCheckout,
  onOpenBrokerPost,
}) => {
  const [scrolled, setScrolled] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 15);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [drawerOpen]);

  const handleLogout = async () => {
    try {
      await fetch('/api/logout', { method: 'POST', credentials: 'include' });
    } catch {}
    window.location.href = '/';
  };

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-200 ${
          scrolled
            ? 'bg-white/95 backdrop-blur-md shadow-sm border-b border-slate-200'
            : 'bg-white border-b border-slate-100'
        }`}
        role="navigation"
        aria-label="Main Navigation"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-[74px] flex items-center justify-between gap-4">
          {/* Logo Section (Always shrink-0, perfectly aligned) */}
          <a href="/" className="flex items-center gap-2.5 sm:gap-3 group shrink-0 py-1" aria-label="LoadsNexus Home">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-blue-700 via-blue-600 to-indigo-600 text-white font-black flex items-center justify-center text-sm shadow-md shadow-blue-500/25 group-hover:scale-105 transition-transform shrink-0">
              LN
            </div>
            <div className="text-lg sm:text-xl font-display font-extrabold text-slate-900 tracking-tight shrink-0 flex items-center">
              Loads<span className="text-blue-600">Nexus</span>
              <sup className="text-[10px] font-black text-blue-600 ml-0.5">™</sup>
            </div>
          </a>

          {/* Desktop Navigation Links (>= lg: 1024px) */}
          <ul className="hidden lg:flex items-center gap-4 xl:gap-7 text-xs xl:text-sm font-semibold text-slate-600 shrink-0">
            <li>
              <a
                href="#live-board-section"
                className="hover:text-blue-600 transition-colors whitespace-nowrap py-1 block"
              >
                <span className="hidden xl:inline">Search Live Loads</span>
                <span className="xl:hidden">Live Loads</span>
              </a>
            </li>
            <li>
              <a
                href="#solutions"
                className="hover:text-blue-600 transition-colors whitespace-nowrap py-1 block"
              >
                Carriers
              </a>
            </li>
            <li>
              <a
                href="#solutions"
                className="hover:text-blue-600 transition-colors whitespace-nowrap py-1 block"
              >
                Brokers
              </a>
            </li>
            <li>
              <a
                href="#comparison"
                className="hover:text-blue-600 transition-colors whitespace-nowrap py-1 block"
              >
                <span className="hidden xl:inline">Why LoadsNexus</span>
                <span className="xl:hidden">Why Us</span>
              </a>
            </li>
            <li className="hidden xl:block">
              <a
                href="#apps"
                className="hover:text-blue-600 transition-colors whitespace-nowrap py-1 block"
              >
                Mobile Apps
              </a>
            </li>
            <li>
              <a
                href="#pricing"
                className="hover:text-blue-600 transition-colors whitespace-nowrap py-1 block"
              >
                <span className="hidden xl:inline">Pricing ($19/mo)</span>
                <span className="xl:hidden">Pricing</span>
              </a>
            </li>
          </ul>

          {/* Right Actions for Laptops & Desktops (>= 1024px) */}
          <div className="hidden lg:flex items-center gap-3 shrink-0">
            {/* Full badge on xl screens, compact chip on lg screens */}
            <div className="hidden xl:inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 border border-slate-200/90 text-xs font-medium text-slate-600 shrink-0">
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                className="text-blue-600 shrink-0"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <span className="whitespace-nowrap">Operated by Shipping Wish LLC</span>
            </div>

            <div className="hidden lg:inline-flex xl:hidden items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-[11px] font-semibold text-slate-600 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
              <span className="whitespace-nowrap">Shipping Wish Verified</span>
            </div>

            {/* Authenticated user pill or Sign In button */}
            {user ? (
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-50 border border-blue-200 hover:bg-blue-100/70 text-slate-800 text-xs font-bold transition-colors whitespace-nowrap"
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
                  <span className="truncate max-w-[120px]">{user.name || user.email}</span>
                  <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-blue-200/70 text-blue-800">
                    {user.role}
                  </span>
                  <span className="text-slate-400 text-[10px]">▼</span>
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-xl py-2 z-50">
                    <div className="px-4 py-2 border-b border-slate-100 text-[11px] text-slate-500">
                      Signed in as<br />
                      <strong className="text-slate-800 truncate block">{user.email}</strong>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setUserMenuOpen(false);
                        handleLogout();
                      }}
                      className="w-full text-left px-4 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 transition-colors"
                    >
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onOpenAuth()}
                className="px-3.5 py-2 text-xs font-bold text-slate-700 hover:text-slate-900 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-xl transition-all whitespace-nowrap shrink-0"
              >
                Sign In
              </button>
            )}

            <button
              type="button"
              onClick={onOpenCarrierCheckout}
              className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm shadow-blue-600/30 transition-all hover:shadow active:scale-[0.98] whitespace-nowrap shrink-0"
            >
              Get Started ($19/mo)
            </button>
          </div>

          {/* Right Actions for Tablets & Mobile (< 1024px) */}
          <div className="flex lg:hidden items-center gap-2 shrink-0">
            {user ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-xs font-bold text-slate-800">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                <span className="truncate max-w-[80px] sm:max-w-[120px] text-[11px]">
                  {user.name?.split(' ')[0] || 'Account'}
                </span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onOpenAuth()}
                className="px-2.5 sm:px-3 py-1.5 text-xs font-bold text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-lg whitespace-nowrap transition-colors"
              >
                Sign In
              </button>
            )}

            <button
              type="button"
              onClick={onOpenCarrierCheckout}
              className="hidden sm:inline-flex px-3 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm whitespace-nowrap transition-colors"
            >
              $19 Pass
            </button>

            {/* Hamburger Toggle */}
            <button
              type="button"
              onClick={() => setDrawerOpen(!drawerOpen)}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg border border-slate-200 flex flex-col items-center justify-center gap-1 text-slate-700 hover:bg-slate-50 active:bg-slate-100 transition-colors shrink-0"
              aria-label="Toggle navigation menu"
            >
              <span className={`w-4 h-0.5 bg-slate-700 transition-all ${drawerOpen ? 'rotate-45 translate-y-1.5' : ''}`}></span>
              <span className={`w-4 h-0.5 bg-slate-700 transition-all ${drawerOpen ? 'opacity-0' : ''}`}></span>
              <span className={`w-4 h-0.5 bg-slate-700 transition-all ${drawerOpen ? '-rotate-45 -translate-y-1.5' : ''}`}></span>
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile & Tablet Slide-out Drawer */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden bg-slate-950/60 backdrop-blur-sm transition-opacity"
          onClick={() => setDrawerOpen(false)}
        >
          <div
            className="fixed top-0 right-0 bottom-0 w-[300px] sm:w-[360px] bg-white p-6 flex flex-col gap-5 shadow-2xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-600 text-white font-black flex items-center justify-center text-xs shadow-sm">
                  LN
                </div>
                <div className="font-display font-extrabold text-slate-900 text-base">
                  Loads<span className="text-blue-600">Nexus</span>™
                </div>
              </div>
              <button
                type="button"
                className="w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close menu"
              >
                ✕
              </button>
            </div>

            {/* Trust pill inside drawer */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200/80 text-[11px] font-medium text-slate-600">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-blue-600 shrink-0"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <span>Operated by Shipping Wish LLC</span>
            </div>

            {/* Navigation links */}
            <nav className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
              <a
                href="#live-board-section"
                onClick={() => setDrawerOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-blue-50 hover:text-blue-600 transition-colors"
              >
                <span className="text-base">🔍</span> Search Live Loads
              </a>
              <a
                href="#solutions"
                onClick={() => setDrawerOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-blue-50 hover:text-blue-600 transition-colors"
              >
                <span className="text-base">🚚</span> For Carriers &amp; Drivers
              </a>
              <a
                href="#solutions"
                onClick={() => setDrawerOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-blue-50 hover:text-blue-600 transition-colors"
              >
                <span className="text-base">💼</span> For Freight Brokers
              </a>
              <a
                href="#comparison"
                onClick={() => setDrawerOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-blue-50 hover:text-blue-600 transition-colors"
              >
                <span className="text-base">⚡</span> Compare vs DAT
              </a>
              <a
                href="#apps"
                onClick={() => setDrawerOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-blue-50 hover:text-blue-600 transition-colors"
              >
                <span className="text-base">📱</span> Mobile Applications
              </a>
              <a
                href="#pricing"
                onClick={() => setDrawerOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-blue-50 hover:text-blue-600 transition-colors"
              >
                <span className="text-base">💳</span> Pricing ($19/mo Pass)
              </a>
            </nav>

            {/* Drawer Action buttons */}
            <div className="mt-auto pt-4 border-t border-slate-100 flex flex-col gap-2.5">
              {user ? (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800 truncate">{user.name || user.email}</span>
                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-blue-100 text-blue-700">
                      {user.role}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setDrawerOpen(false);
                      handleLogout();
                    }}
                    className="w-full py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-lg text-center transition-colors"
                  >
                    Sign Out
                  </button>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setDrawerOpen(false);
                      onOpenAuth('carrier');
                    }}
                    className="w-full py-2.5 text-xs font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl text-center transition-colors"
                  >
                    Carrier Portal Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDrawerOpen(false);
                      onOpenAuth('broker');
                    }}
                    className="w-full py-2.5 text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-xl text-center transition-colors"
                  >
                    Broker Desk Sign In
                  </button>
                  {onOpenBrokerPost && (
                    <button
                      type="button"
                      onClick={() => {
                        setDrawerOpen(false);
                        onOpenBrokerPost();
                      }}
                      className="w-full py-2.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-xl text-center transition-colors"
                    >
                      Post Freight Free →
                    </button>
                  )}
                </>
              )}

              <button
                type="button"
                onClick={() => {
                  setDrawerOpen(false);
                  onOpenCarrierCheckout();
                }}
                className="w-full py-3 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl text-center shadow-md shadow-blue-600/30 transition-all active:scale-[0.98]"
              >
                Start Load Board — $19/mo
              </button>

              <div className="text-center pt-2 text-[10px] text-slate-400">
                24/7 Support:{' '}
                <a href="tel:+18005803101" className="text-slate-600 font-bold hover:underline">
                  +1 (800) 580-3101
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
