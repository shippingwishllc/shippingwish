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
        'Lane planning with your approval',
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
        'Empty-mile planning',
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
        'Named senior operations manager',
        'Priority 24/7 telematics desk',
      ],
      ctaUrl: '/checkout?plan=command_weekly',
    },
  ];

  return (
    <section className="py-20 bg-[#f4f7fb] border-b border-slate-200" id="plans">
      <div className="max-w-[1240px] mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <div className="text-xs font-extrabold uppercase tracking-wider text-amber-700 mb-2">
            Weekly Subscription
          </div>
          <h2 className="text-3xl sm:text-4xl font-display font-black text-[#0b1f3a] tracking-tight">
            Pick a desk. Card on file. Charge starts next week.
          </h2>
          <p className="mt-4 text-sm sm:text-base text-slate-600">
            Secure Stripe Checkout. $0 due now. If you cancel before the first charge, the trial ends and you owe nothing.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto items-stretch">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`rounded-3xl p-7 flex flex-col justify-between transition-all relative ${
                plan.featured
                  ? 'bg-white border-2 border-amber-400 shadow-xl'
                  : 'bg-white border border-slate-200 shadow-sm'
              }`}
            >
              {plan.badge && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-amber-400 text-slate-950 text-[11px] font-black uppercase tracking-wider px-3.5 py-1 rounded-full shadow-md">
                  {plan.badge}
                </div>
              )}

              <div>
                <div className="text-base font-bold text-[#0b1f3a] mb-0.5">{plan.name}</div>
                <div className="text-xs text-slate-500 font-semibold mb-4">{plan.trucks}</div>

                <div className="text-4xl font-black text-[#0b1f3a] mb-1">
                  ${plan.price}
                  <span className="text-xs text-slate-500 font-normal ml-1">{plan.period}</span>
                </div>

                <div className="text-xs font-bold text-emerald-700 mb-6 bg-emerald-50 px-2.5 py-1 rounded-lg inline-block border border-emerald-200">
                  {plan.trial}
                </div>

                <ul className="space-y-3 text-xs text-slate-600 mb-8 border-t border-slate-200 pt-6">
                  {plan.features.map((feat, fIdx) => (
                    <li key={fIdx} className="flex items-center gap-2">
                      <span className="text-emerald-600 font-bold">✔</span>
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <a
                href={plan.ctaUrl}
                className={`w-full py-3.5 px-4 rounded-xl text-xs font-bold text-center transition-all ${
                  plan.featured
                    ? 'bg-amber-400 hover:bg-amber-300 text-slate-950'
                    : 'bg-[#0b1f3a] hover:bg-[#16325c] text-white'
                }`}
              >
                Checkout securely →
              </a>
            </div>
          ))}
        </div>

        {/* Stripe Security Pills */}
        <div className="flex flex-wrap items-center justify-center gap-3 mt-10 text-xs font-semibold text-slate-500">
          <span className="px-3 py-1.5 rounded-full bg-white border border-slate-200">
            Stripe checkout
          </span>
          <span className="px-3 py-1.5 rounded-full bg-white border border-slate-200">
            Cancel before the first charge
          </span>
        </div>
      </div>
    </section>
  );
};
