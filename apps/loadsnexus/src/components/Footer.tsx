import React from 'react';

interface FooterProps {
  onOpenAuth: (role?: 'carrier' | 'broker') => void;
  onOpenCarrierCheckout: () => void;
  onOpenBrokerPost: () => void;
  onOpenDispatchInquiry: () => void;
  onOpenPrivacy?: () => void;
  onOpenTerms?: () => void;
}

export const Footer: React.FC<FooterProps> = ({
  onOpenAuth,
  onOpenCarrierCheckout,
  onOpenBrokerPost,
  onOpenDispatchInquiry,
  onOpenPrivacy,
  onOpenTerms,
}) => {
  const [socialLinks, setSocialLinks] = React.useState({
    facebook: 'https://facebook.com/1297152946819472',
    linkedin: 'https://linkedin.com/company/loadsnexus',
    instagram: 'https://instagram.com/loadsnexus',
    twitter: 'https://x.com/loadsnexus'
  });

  React.useEffect(() => {
    fetch('/api/social/public-links')
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok && d.links?.loadsnexus) {
          setSocialLinks((prev) => ({ ...prev, ...d.links.loadsnexus }));
        }
      })
      .catch(() => {});
  }, []);

  return (
    <footer className="bg-slate-950 text-slate-400 py-16 border-t border-slate-900 text-xs" role="contentinfo">
      <div className="max-w-[1220px] mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 pb-12 border-b border-slate-800/80">
          
          {/* Brand info */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-700 to-blue-500 text-white font-extrabold flex items-center justify-center text-xs">
                LN
              </div>
              <div className="text-lg font-display font-extrabold text-white tracking-tight">
                Loads<span className="text-blue-500">Nexus</span>™
              </div>
            </div>
            <p className="leading-relaxed text-slate-400">
              The next-generation freight load board and capacity exchange network. Engineered with proprietary anti-fraud security and real-time payment telemetry.
            </p>
            <div className="text-[11px] text-slate-500">
              Operated by <strong className="text-slate-300">Shipping Wish LLC</strong><br />
              19266 Coastal Hwy, Rehoboth Beach, DE 19971
            </div>

            {/* Social Media Links */}
            <div className="flex items-center gap-2 pt-2">
              {socialLinks.facebook && (
                <a
                  href={socialLinks.facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="LoadsNexus Facebook"
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
                  aria-label="LoadsNexus LinkedIn"
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
                  aria-label="LoadsNexus Instagram"
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
                  aria-label="LoadsNexus X"
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

          {/* Platform */}
          <div>
            <h4 className="text-white font-bold text-xs uppercase tracking-wider mb-4">Platform</h4>
            <ul className="space-y-2.5">
              <li>
                <a href="#live-board-section" className="hover:text-white transition-colors">
                  Search Live Loads
                </a>
              </li>
              <li>
                <a href="#faq" className="hover:text-white transition-colors">
                  Frequently Asked Questions (FAQ)
                </a>
              </li>
              <li>
                <a href="#features" className="hover:text-white transition-colors">
                  AI Lane Matching
                </a>
              </li>
              <li>
                <a href="#features" className="hover:text-white transition-colors">
                  Broker Credit Ratings
                </a>
              </li>
              <li>
                <a href="#features" className="hover:text-white transition-colors">
                  Anti-Fraud Guard
                </a>
              </li>
              <li>
                <a href="#apps" className="hover:text-white transition-colors">
                  Mobile Applications
                </a>
              </li>
            </ul>
          </div>

          {/* Solutions */}
          <div>
            <h4 className="text-white font-bold text-xs uppercase tracking-wider mb-4">Solutions</h4>
            <ul className="space-y-2.5">
              <li>
                <a href="#solutions" className="hover:text-white transition-colors">
                  Motor Carriers
                </a>
              </li>
              <li>
                <a href="#solutions" className="hover:text-white transition-colors">
                  Owner-Operators
                </a>
              </li>
              <li>
                <a href="#solutions" className="hover:text-white transition-colors">
                  Freight Brokers &amp; 3PL
                </a>
              </li>
              <li>
                <a href="#pricing" className="hover:text-white transition-colors">
                  Pricing Plans ($19/mo)
                </a>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onOpenAuth()}
                  className="hover:text-white transition-colors text-left"
                >
                  Account Sign In
                </button>
              </li>
            </ul>
          </div>

          {/* Support & Legal */}
          <div>
            <h4 className="text-white font-bold text-xs uppercase tracking-wider mb-4">Support &amp; Legal</h4>
            <ul className="space-y-2.5">
              <li>
                <button
                  type="button"
                  onClick={onOpenBrokerPost}
                  className="hover:text-white transition-colors text-left"
                >
                  Post Freight (Free)
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={onOpenCarrierCheckout}
                  className="hover:text-white transition-colors text-left"
                >
                  Carrier Pass ($19/mo)
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={onOpenDispatchInquiry}
                  className="hover:text-white transition-colors text-left"
                >
                  Dispatch Desk Inquiry
                </button>
              </li>
              {onOpenPrivacy && (
                <li>
                  <button
                    type="button"
                    onClick={onOpenPrivacy}
                    className="hover:text-white transition-colors text-left"
                  >
                    Privacy Policy
                  </button>
                </li>
              )}
              {onOpenTerms && (
                <li>
                  <button
                    type="button"
                    onClick={onOpenTerms}
                    className="hover:text-white transition-colors text-left"
                  >
                    Terms of Service
                  </button>
                </li>
              )}
              <li>
                <a href="tel:+18005803101" className="text-blue-400 hover:text-blue-300 font-bold">
                  Support: +1 (800) 580-3101
                </a>
              </li>
            </ul>
          </div>

        </div>

        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-500">
          <div>
            © 2026 LoadsNexus™ — An Enterprise Freight Product of{' '}
            <span className="font-bold text-slate-300">Shipping Wish LLC</span>. All rights reserved.
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4">
            {onOpenPrivacy && (
              <button
                type="button"
                onClick={onOpenPrivacy}
                className="hover:text-slate-300 transition-colors"
              >
                Privacy Policy
              </button>
            )}
            <span>·</span>
            {onOpenTerms && (
              <button
                type="button"
                onClick={onOpenTerms}
                className="hover:text-slate-300 transition-colors"
              >
                Terms of Service
              </button>
            )}
            <span>·</span>
            <a href="#faq" className="hover:text-slate-300 transition-colors">
              FAQs
            </a>
            <span>·</span>
            <span className="flex items-center gap-1.5 text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              Anti-Double-Brokering Guard Active
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
};
