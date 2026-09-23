import React from 'react';

interface HeroProps {
  onOpenCarrierCheckout: () => void;
  onOpenBrokerPost: () => void;
  onOpenAuth: (role: 'carrier' | 'broker') => void;
}

export const Hero: React.FC<HeroProps> = ({
  onOpenCarrierCheckout,
  onOpenBrokerPost,
  onOpenAuth,
}) => {
  return (
    <header className="pt-28 pb-16 bg-gradient-to-b from-white via-slate-50 to-slate-100 border-b border-slate-200/60">
      <div className="max-w-[1220px] mx-auto px-6">
        {/* Top Eyebrow */}
        <div className="text-center max-w-3xl mx-auto mb-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50 border border-blue-200/60 text-blue-700 text-xs font-extrabold uppercase tracking-wider mb-5">
            <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse"></span>
            <span>NEXT-GEN AI FREIGHT NETWORK · TRUSTED BY 50,000+ TRUCKERS</span>
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-extrabold text-slate-900 tracking-tight leading-[1.12]">
            Find High-Paying Loads.<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-700 to-blue-500">
              Move Freight Smarter With AI.
            </span>
          </h1>

          <p className="mt-5 text-base md:text-lg text-slate-600 leading-relaxed max-w-2xl mx-auto">
            The intelligent freight exchange built for modern trucking. Access verified spot freight, real broker credit scores (Days-To-Pay), zero double-brokering, and lane rate intelligence.
          </p>
        </div>

        {/* Persona Action Cards */}
        <div id="solutions" className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-12 max-w-4xl mx-auto">
          {/* Carrier Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-7 flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="1" y="3" width="15" height="13" rx="2" />
                    <polygon points="16 8 20 8 23 11 23 16 16 16 8" />
                    <circle cx="5.5" cy="18.5" r="2.5" />
                    <circle cx="18.5" cy="18.5" r="2.5" />
                  </svg>
                </div>
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                  Motor Carriers &amp; O/O
                </span>
              </div>

              <h2 className="text-xl font-bold text-slate-900 mb-2">
                Keep Your Trucks Moving at Maximum RPM
              </h2>
              <p className="text-sm text-slate-600 mb-5 leading-relaxed">
                Direct access to high-paying broker freight. See Days-To-Pay scores before booking and keep 100% of your earnings.
              </p>

              <ul className="space-y-2.5 text-xs text-slate-700 font-medium mb-6">
                <li className="flex items-center gap-2">
                  <span className="text-emerald-600 font-bold">✔</span> Real broker Days-To-Pay credit scores &amp; bond checks
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-600 font-bold">✔</span> AI lane matching: eliminate empty deadhead miles
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-600 font-bold">✔</span> Starting at only $19/month (or free with dispatch)
                </li>
              </ul>
            </div>

            <div className="flex items-center gap-3 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={onOpenCarrierCheckout}
                className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold text-center shadow-sm transition-all"
              >
                Start for $19/mo →
              </button>
              <button
                type="button"
                onClick={() => onOpenAuth('carrier')}
                className="py-2.5 px-4 border border-slate-200 hover:border-slate-300 text-slate-700 rounded-xl text-xs font-bold transition-all"
              >
                Carrier Login
              </button>
            </div>
          </div>

          {/* Broker Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-7 flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-11 h-11 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    <polyline points="9 12 11 14 15 10" />
                  </svg>
                </div>
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-purple-700 bg-purple-50 px-3 py-1 rounded-full border border-purple-200">
                  Freight Brokers &amp; 3PL
                </span>
              </div>

              <h2 className="text-xl font-bold text-slate-900 mb-2">
                Cover Loads Fast With Zero Double-Brokering
              </h2>
              <p className="text-sm text-slate-600 mb-5 leading-relaxed">
                Post freight to thousands of vetted carriers. Instant MC authority checks, automated carrier packets, and anti-fraud verification.
              </p>

              <ul className="space-y-2.5 text-xs text-slate-700 font-medium mb-6">
                <li className="flex items-center gap-2">
                  <span className="text-purple-600 font-bold">✔</span> Automated Anti-Double-Brokering security guard
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-purple-600 font-bold">✔</span> Real-time available carrier capacity matching
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-purple-600 font-bold">✔</span> Instant rate confirmation &amp; digital onboarding
                </li>
              </ul>
            </div>

            <div className="flex items-center gap-3 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={onOpenBrokerPost}
                className="flex-1 py-2.5 px-4 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold text-center shadow-sm transition-all"
              >
                Post Freight (Free) →
              </button>
              <button
                type="button"
                onClick={() => onOpenAuth('broker')}
                className="py-2.5 px-4 border border-slate-200 hover:border-slate-300 text-slate-700 rounded-xl text-xs font-bold transition-all"
              >
                Broker Login
              </button>
            </div>
          </div>
        </div>

      </div>
    </header>
  );
};
