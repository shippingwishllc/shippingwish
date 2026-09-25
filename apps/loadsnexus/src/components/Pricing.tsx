import React, { useState } from 'react';
import type { LoadBoardPlanTier } from './CarrierCheckoutModal';

interface PricingProps {
  onOpenCarrierCheckout: (tier?: LoadBoardPlanTier) => void;
  onOpenDispatchInquiry: () => void;
  onOpenBrokerPost: () => void;
}

export const Pricing: React.FC<PricingProps> = ({
  onOpenCarrierCheckout,
  onOpenDispatchInquiry,
  onOpenBrokerPost,
}) => {
  const [carrierTier, setCarrierTier] = useState<LoadBoardPlanTier>('loadboard_ai_pass');

  const tierMeta = {
    loadboard_ai_pass: {
      name: 'Solo Carrier Pass',
      price: '$19',
      badge: '1 Workstation + 1 Mobile',
      seatsText: '1 Desktop / Laptop + 1 Driver Mobile App',
      cta: 'Start Solo Pass ($19/mo) →'
    },
    loadboard_team_pass: {
      name: 'Team Carrier Pass',
      price: '$39',
      badge: '3 Concurrent Seats',
      seatsText: '3 Simultaneous Active Dispatcher Workstations',
      cta: 'Start Team Pass (3 Seats — $39/mo) →'
    },
    loadboard_fleet_pass: {
      name: 'Fleet Enterprise Pass',
      price: '$69',
      badge: '5 Concurrent Seats',
      seatsText: '5 Simultaneous Active Dispatcher Desks',
      cta: 'Start Fleet Pass (5 Seats — $69/mo) →'
    }
  }[carrierTier];

  return (
    <section className="py-20 bg-white border-b border-slate-200/60" id="pricing">
      <div className="max-w-[1220px] mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <div className="text-xs font-extrabold uppercase tracking-wider text-blue-600 mb-2">
            Simple &amp; Transparent
          </div>
          <h2 className="text-3xl md:text-4xl font-display font-extrabold text-slate-900 tracking-tight">
            Plans Built for Carriers &amp; Brokers of Every Size
          </h2>
          <p className="mt-3 text-sm md:text-base text-slate-600">
            Self-dispatch independently from just $19/mo with DAT-style single-device guards, or unlock multi-seat dispatcher workstations for your team.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto items-stretch">
          {/* Plan 1: Carrier Multi-Tier Self-Dispatch (Featured) */}
          <div className="bg-white border-2 border-blue-600 rounded-3xl p-7 flex flex-col justify-between shadow-xl shadow-blue-500/10 relative">
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[11px] font-black uppercase tracking-wider px-3.5 py-1 rounded-full shadow-sm">
              Most Popular
            </div>

            <div>
              <div className="text-sm font-extrabold text-blue-600 uppercase tracking-wide">
                Carrier — AI Load Board
              </div>

              {/* Sub-tier selector */}
              <div className="mt-3 mb-4 p-1 bg-slate-100 rounded-xl flex items-center gap-1 text-[11px] font-bold">
                <button
                  type="button"
                  onClick={() => setCarrierTier('loadboard_ai_pass')}
                  className={`flex-1 py-1.5 px-2 rounded-lg transition-all text-center ${
                    carrierTier === 'loadboard_ai_pass'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Solo $19
                </button>
                <button
                  type="button"
                  onClick={() => setCarrierTier('loadboard_team_pass')}
                  className={`flex-1 py-1.5 px-2 rounded-lg transition-all text-center ${
                    carrierTier === 'loadboard_team_pass'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Team $39 (3 Seats)
                </button>
                <button
                  type="button"
                  onClick={() => setCarrierTier('loadboard_fleet_pass')}
                  className={`flex-1 py-1.5 px-2 rounded-lg transition-all text-center ${
                    carrierTier === 'loadboard_fleet_pass'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Fleet $69 (5 Seats)
                </button>
              </div>

              <div className="text-4xl font-black text-slate-900 mt-2 mb-1">
                {tierMeta.price}<span className="text-sm text-slate-500 font-semibold"> / month</span>
              </div>
              <p className="text-xs text-blue-700 font-bold mb-5 flex items-center gap-1.5">
                <span>🛡️</span> {tierMeta.seatsText}
              </p>

              <ul className="space-y-3 text-xs text-slate-700 font-medium mb-8">
                <li className="flex items-start gap-2.5">
                  <span className="text-emerald-600 font-black">✔</span>
                  <span><strong>{tierMeta.seatsText}</strong> without concurrent lockouts</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-emerald-600 font-black">✔</span>
                  <span>Unlimited 50-state live spot load search</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-emerald-600 font-black">✔</span>
                  <span>Direct unmasked broker phone numbers &amp; emails</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-emerald-600 font-black">✔</span>
                  <span>Real broker Days-To-Pay (DTP) &amp; $75k bond verification</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-emerald-600 font-black">✔</span>
                  <span>Dynamic RPM &amp; deadhead corridor calculator</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-emerald-600 font-black">✔</span>
                  <span>LoadsNexus Carrier Mobile App access</span>
                </li>
              </ul>
            </div>

            <button
              type="button"
              onClick={() => onOpenCarrierCheckout(carrierTier)}
              className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/30 transition-all text-center"
            >
              {tierMeta.cta}
            </button>
          </div>

          {/* Plan 2: Included with Dispatch */}
          <div className="bg-white border border-slate-200 rounded-3xl p-7 flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow">
            <div>
              <div className="text-sm font-extrabold text-emerald-600 uppercase tracking-wide">
                Carrier + 24/7 Dedicated Dispatch
              </div>
              <div className="text-3xl font-black text-slate-900 mt-2 mb-1">
                Included Free
              </div>
              <p className="text-xs text-slate-500 mb-6">
                With any Shipping Wish Dispatch subscription (From $149/wk)
              </p>

              <ul className="space-y-3 text-xs text-slate-700 font-medium mb-8">
                <li className="flex items-start gap-2.5">
                  <span className="text-emerald-600 font-black">✔</span>
                  <span><strong className="text-slate-900">Full AI Load Board Included Free</strong></span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-emerald-600 font-black">✔</span>
                  <span>Named 24/7 Fleet Operations Manager on your staff</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-emerald-600 font-black">✔</span>
                  <span>We negotiate top RPM and book freight for you</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-emerald-600 font-black">✔</span>
                  <span>You keep 100% of broker pay (zero percentage cuts)</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-emerald-600 font-black">✔</span>
                  <span>Carrier setup packets &amp; rate confirmation handling</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-emerald-600 font-black">✔</span>
                  <span>Full Shipping Wish Enterprise TMS software</span>
                </li>
              </ul>
            </div>

            <button
              type="button"
              onClick={onOpenDispatchInquiry}
              className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/30 transition-all text-center"
            >
              Inquire Dedicated Dispatch →
            </button>
          </div>

          {/* Plan 3: Broker Free */}
          <div className="bg-white border border-slate-200 rounded-3xl p-7 flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow">
            <div>
              <div className="text-sm font-extrabold text-purple-600 uppercase tracking-wide">
                Broker — Freight &amp; Capacity
              </div>
              <div className="text-3xl font-black text-slate-900 mt-2 mb-1">
                100% Free
              </div>
              <p className="text-xs text-slate-500 mb-6">
                Post spot freight at zero cost forever · Anti-Double Brokering Guard
              </p>

              <ul className="space-y-3 text-xs text-slate-700 font-medium mb-8">
                <li className="flex items-start gap-2.5">
                  <span className="text-purple-600 font-black">✔</span>
                  <span>Unlimited spot load posting across 50 states</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-purple-600 font-black">✔</span>
                  <span>Automated Anti-Double-Brokering security certification</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-purple-600 font-black">✔</span>
                  <span>Instant FMCSA authority &amp; insurance vetting</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-purple-600 font-black">✔</span>
                  <span>Access verified carrier truck capacity roster</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-purple-600 font-black">✔</span>
                  <span>LoadsNexus Broker Mobile App access</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-purple-600 font-black">✔</span>
                  <span>Live spot publishing with zero delay</span>
                </li>
              </ul>
            </div>

            <button
              type="button"
              onClick={onOpenBrokerPost}
              className="w-full py-3.5 px-4 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-all text-center"
            >
              Post Freight Live (100% Free) →
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
