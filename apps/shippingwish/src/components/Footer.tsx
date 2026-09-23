import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-slate-950 text-slate-400 py-16 border-t border-slate-900 text-xs" role="contentinfo">
      <div className="max-w-[1240px] mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 pb-12 border-b border-slate-800/80">
          
          {/* Brand Column */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-blue-400 text-white font-black flex items-center justify-center text-xs">
                SW
              </div>
              <div className="text-lg font-display font-black text-white tracking-tight">
                Shipping <span className="text-blue-500">Wish</span>
              </div>
            </div>

            <p className="leading-relaxed text-slate-400">
              Dedicated fleet operations managers, live load booking, and enterprise TMS software for motor carriers on a flat weekly subscription.
            </p>

            <div className="text-[11px] text-slate-500 leading-relaxed">
              <strong className="text-slate-300">Shipping Wish LLC</strong><br />
              19266 Coastal Hwy, Rehoboth Beach, DE 19971<br />
              Phone:{' '}
              <a href="tel:+19177370021" className="text-blue-400 hover:underline font-bold">
                +1 (917) 737-0021
              </a><br />
              Email:{' '}
              <a href="mailto:info@shippingwish.com" className="text-slate-300 hover:underline">
                info@shippingwish.com
              </a>
            </div>
          </div>

          {/* Operations & Services */}
          <div>
            <h4 className="text-white font-bold text-xs uppercase tracking-wider mb-4">Operations &amp; Services</h4>
            <ul className="space-y-2.5">
              <li>
                <a href="/carrier-setup" className="text-amber-400 hover:text-amber-300 font-bold transition-colors">
                  ⚡ Carrier Setup (Online)
                </a>
              </li>
              <li>
                <a href="/dispatch" className="hover:text-white transition-colors">
                  Fleet Operations Manager
                </a>
              </li>
              <li>
                <a href="/fleet-support" className="hover:text-white transition-colors">
                  Fleet Support Desk
                </a>
              </li>
              <li>
                <a href="https://www.loadsnexus.com" target="_blank" rel="noopener" className="text-blue-400 hover:text-blue-300 font-bold transition-colors">
                  LoadsNexus™ AI Load Board ↗
                </a>
              </li>
              <li>
                <a href="/mobile-apps" className="hover:text-white transition-colors">
                  Mobile Applications Suite
                </a>
              </li>
            </ul>
          </div>

          {/* Solutions & Pricing */}
          <div>
            <h4 className="text-white font-bold text-xs uppercase tracking-wider mb-4">Plans &amp; Tools</h4>
            <ul className="space-y-2.5">
              <li>
                <a href="/pricing" className="hover:text-white transition-colors">
                  Weekly Subscription Plans
                </a>
              </li>
              <li>
                <a href="/checkout?plan=solo_weekly" className="hover:text-white transition-colors">
                  Owner Operator ($149/wk)
                </a>
              </li>
              <li>
                <a href="/checkout?plan=fleet_weekly" className="hover:text-white transition-colors">
                  Small Fleet ($350/wk)
                </a>
              </li>
              <li>
                <a href="/carrier-search" className="hover:text-white transition-colors">
                  Free FMCSA Carrier Lookup
                </a>
              </li>
              <li>
                <a href="/login" className="hover:text-white transition-colors">
                  Carrier TMS Portal Sign In
                </a>
              </li>
            </ul>
          </div>

          {/* Compliance & Company */}
          <div>
            <h4 className="text-white font-bold text-xs uppercase tracking-wider mb-4">Company &amp; Compliance</h4>
            <ul className="space-y-2.5">
              <li>
                <a href="/about" className="hover:text-white transition-colors">
                  About Shipping Wish
                </a>
              </li>
              <li>
                <a href="/factoring" className="hover:text-white transition-colors">
                  Freight Invoice Factoring
                </a>
              </li>
              <li>
                <a href="/insurance" className="hover:text-white transition-colors">
                  Commercial Truck Insurance
                </a>
              </li>
              <li>
                <a href="/dot-compliance" className="hover:text-white transition-colors">
                  FMCSA &amp; DOT Compliance
                </a>
              </li>
              <li>
                <a href="/contact" className="hover:text-white transition-colors">
                  Contact Support Desk
                </a>
              </li>
            </ul>
          </div>

        </div>

        {/* Bottom Credits & Payment Badges */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-500">
          <div>
            © 2026 Shipping Wish LLC. All rights reserved. You keep 100% of broker freight pay.
          </div>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-slate-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              24/7 Fleet Operations Desk Active
            </span>
            <span className="flex items-center gap-1.5 text-slate-400">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
              Stripe 256-Bit Encrypted
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
};
