import React from 'react';

interface FooterProps {
  onOpenAuth: (role?: 'carrier' | 'broker') => void;
  onOpenCarrierCheckout: () => void;
  onOpenBrokerPost: () => void;
  onOpenDispatchInquiry: () => void;
}

export const Footer: React.FC<FooterProps> = ({
  onOpenAuth,
  onOpenCarrierCheckout,
  onOpenBrokerPost,
  onOpenDispatchInquiry,
}) => {
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

          {/* Support */}
          <div>
            <h4 className="text-white font-bold text-xs uppercase tracking-wider mb-4">Support &amp; Desk</h4>
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
              <li>
                <a href="tel:+19177370021" className="text-blue-400 hover:text-blue-300 font-bold">
                  Support: +1 (917) 737-0021
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
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              Anti-Double-Brokering Guard Active
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
              FMCSA Carrier Roster Synchronized
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
};
