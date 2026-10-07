import React from 'react';

export const Footer: React.FC = () => {
  const [socialLinks, setSocialLinks] = React.useState({
    facebook: 'https://facebook.com/shippingwish',
    linkedin: 'https://linkedin.com/company/shippingwish',
    instagram: 'https://instagram.com/shippingwish',
    twitter: 'https://x.com/shippingwish'
  });

  React.useEffect(() => {
    fetch('/api/social/public-links')
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok && d.links?.shippingwish) {
          setSocialLinks((prev) => ({ ...prev, ...d.links.shippingwish }));
        }
      })
      .catch(() => {});
  }, []);

  return (
    <footer className="bg-[#071628] text-slate-300 py-16 border-t border-white/10 text-xs" role="contentinfo">
      <div className="max-w-[1240px] mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 pb-12 border-b border-slate-800/80">
          
          {/* Brand Column */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-blue-400 text-white font-black flex items-center justify-center text-xs">
                SW
              </div>
              <div className="text-lg font-display font-black text-white tracking-tight">
                Shipping <span className="text-blue-400">Wish</span>
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

            {/* Social Media Links */}
            <div className="flex items-center gap-2 pt-2">
              {socialLinks.facebook && (
                <a
                  href={socialLinks.facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Shipping Wish Facebook"
                  title="Facebook"
                  className="w-8 h-8 rounded-lg bg-slate-900 hover:bg-blue-600 border border-slate-800 flex items-center justify-center text-slate-400 hover:text-white transition-all shadow-sm"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                </a>
              )}
              {socialLinks.linkedin && (
                <a
                  href={socialLinks.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Shipping Wish LinkedIn"
                  title="LinkedIn"
                  className="w-8 h-8 rounded-lg bg-slate-900 hover:bg-[#0a66c2] border border-slate-800 flex items-center justify-center text-slate-400 hover:text-white transition-all shadow-sm"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
                  </svg>
                </a>
              )}
              {socialLinks.instagram && (
                <a
                  href={socialLinks.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Shipping Wish Instagram"
                  title="Instagram"
                  className="w-8 h-8 rounded-lg bg-slate-900 hover:bg-pink-600 border border-slate-800 flex items-center justify-center text-slate-400 hover:text-white transition-all shadow-sm"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                  </svg>
                </a>
              )}
              {socialLinks.twitter && (
                <a
                  href={socialLinks.twitter}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Shipping Wish X"
                  title="X / Twitter"
                  className="w-8 h-8 rounded-lg bg-slate-900 hover:bg-black border border-slate-800 flex items-center justify-center text-slate-400 hover:text-white transition-all shadow-sm"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                  </svg>
                </a>
              )}
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
