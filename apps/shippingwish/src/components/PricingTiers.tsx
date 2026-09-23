import React from 'react';
import type { PricingPlan } from '../types';

export const PricingTiers: React.FC = () => {
  const plans: PricingPlan[] = [
    {
      id: 'solo_weekly',
      name: 'Owner Operator',
      trucks: '1 truck',
      price: 149,
      period: '/ week',
      trial: '7 days free · $0 today',
      features: [
        'Named operations manager',
        'Load booking + TMS',
        'You keep freight pay',
        'Direct broker packet handling',
        'Dynamic RPM optimization',
      ],
      ctaUrl: '/checkout?plan=solo_weekly',
    },
    {
      id: 'fleet_weekly',
      name: 'Small Fleet',
      trucks: '2–5 trucks',
      price: 350,
      period: '/ week',
      trial: '7 days free · $0 today',
      featured: true,
      badge: 'Most fleets',
      features: [
        'Dedicated operations desk',
        'Multi-truck planning',
        'RPM & deadhead reporting',
        'Full document camera vault',
        'LoadsNexus AI Load Board access',
      ],
      ctaUrl: '/checkout?plan=fleet_weekly',
    },
    {
      id: 'command_weekly',
      name: 'Fleet Command',
      trucks: '6+ trucks',
      price: 500,
      period: '/ week',
      trial: '7 days free · $0 today',
      features: [
        'Company operations team',
        'Lane strategy + compliance',
        'Custom TMS setup',
        'Dedicated senior dispatcher',
        'Priority 24/7 telematics desk',
      ],
      ctaUrl: '/checkout?plan=command_weekly',
    },
  ];

  return (
    <section className="py-20 bg-slate-900 border-b border-slate-800/80" id="plans">
      <div className="max-w-[1240px] mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <div className="text-xs font-extrabold uppercase tracking-wider text-blue-400 mb-2">
            Weekly Subscription
          </div>
          <h2 className="text-3xl sm:text-4xl font-display font-black text-white tracking-tight">
            Pick a desk. Card on file. Charge starts next week.
          </h2>
          <p className="mt-4 text-sm sm:text-base text-slate-300">
            Secure Stripe Checkout. $0 due now. If you cancel before the first charge, the trial ends and you owe nothing.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto items-stretch">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`rounded-3xl p-7 flex flex-col justify-between transition-all relative ${
                plan.featured
                  ? 'bg-slate-950 border-2 border-blue-500 shadow-2xl shadow-blue-500/10'
                  : 'bg-slate-950/70 border border-slate-800 shadow-lg'
              }`}
            >
              {plan.badge && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[11px] font-black uppercase tracking-wider px-3.5 py-1 rounded-full shadow-md">
                  {plan.badge}
                </div>
              )}

              <div>
                <div className="text-base font-bold text-white mb-0.5">{plan.name}</div>
                <div className="text-xs text-slate-400 font-semibold mb-4">{plan.trucks}</div>

                <div className="text-4xl font-black text-white mb-1">
                  ${plan.price}
                  <span className="text-xs text-slate-400 font-normal ml-1">{plan.period}</span>
                </div>

                <div className="text-xs font-bold text-emerald-400 mb-6 bg-emerald-500/10 px-2.5 py-1 rounded-lg inline-block border border-emerald-500/20">
                  {plan.trial}
                </div>

                <ul className="space-y-3 text-xs text-slate-300 mb-8 border-t border-slate-800/80 pt-6">
                  {plan.features.map((feat, fIdx) => (
                    <li key={fIdx} className="flex items-center gap-2">
                      <span className="text-blue-400 font-bold">✔</span>
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <a
                href={plan.ctaUrl}
                className={`w-full py-3.5 px-4 rounded-xl text-xs font-bold text-center transition-all ${
                  plan.featured
                    ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/30'
                    : 'bg-slate-800 hover:bg-slate-700 text-white'
                }`}
              >
                Checkout securely →
              </a>
            </div>
          ))}
        </div>

        {/* Stripe Security Pills */}
        <div className="flex flex-wrap items-center justify-center gap-3 mt-10 text-xs font-semibold text-slate-400">
          <span className="px-3 py-1.5 rounded-full bg-slate-950 border border-slate-800 flex items-center gap-1.5">
            🔒 256-bit Stripe checkout
          </span>
          <span className="px-3 py-1.5 rounded-full bg-slate-950 border border-slate-800 flex items-center gap-1.5">
            ✓ PCI-DSS via Stripe
          </span>
          <span className="px-3 py-1.5 rounded-full bg-slate-950 border border-slate-800 flex items-center gap-1.5">
            Visa · Mastercard · Amex · Discover
          </span>
        </div>
      </div>
    </section>
  );
};
