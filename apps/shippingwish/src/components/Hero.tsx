import React from 'react';

const deskRows = [
  { label: 'Named manager', detail: 'One person on your company, not a rotating call queue.' },
  { label: 'Lower 48', detail: 'Owner-operators and small fleets in the United States.' },
  { label: 'Broker pay', detail: 'Every dollar the broker pays stays with your company.' },
  { label: 'First week', detail: '$0 today. The weekly charge starts after 7 days.' },
  { label: 'TMS included', detail: 'Loads, rate cons, and documents in the carrier portal.' }
];

function OperationsCard() {
  return (
    <aside className="rounded-3xl bg-white border border-slate-200 shadow-xl shadow-slate-200/70 overflow-hidden">
      <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-slate-100 bg-[#0b1f3a] text-white">
        <div>
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-blue-200">Your company desk</div>
          <div className="mt-1 text-base font-bold">Named manager on the account</div>
        </div>
        <span className="inline-flex items-center gap-1.5 shrink-0 text-[11px] font-bold text-emerald-100 bg-white/10 border border-white/15 rounded-full px-2.5 py-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
          Desk active
        </span>
      </div>
      <ul className="divide-y divide-slate-100">
        {deskRows.map((row) => (
          <li key={row.label} className="px-5 py-3.5">
            <div className="text-sm font-bold text-[#0b1f3a]">{row.label}</div>
            <p className="mt-0.5 text-xs text-slate-500 leading-relaxed">{row.detail}</p>
          </li>
        ))}
      </ul>
      <div className="px-5 py-4 bg-[#f4f7fb] text-xs font-semibold text-slate-600 border-t border-slate-100">
        You approve every load before it is booked. Flat weekly plan. No percentage of the load.
      </div>
    </aside>
  );
}

export const Hero: React.FC = () => {
  return (
    <section className="relative pt-32 pb-20 md:pt-40 md:pb-28 bg-gradient-to-b from-[#eef4fb] via-white to-[#f4f7fb] overflow-hidden border-b border-slate-200">
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-200/30 rounded-full blur-3xl"></div>
      </div>

      <div className="max-w-[1240px] mx-auto px-6 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-start">
          <div className="lg:col-span-7">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#0b1f3a] text-white text-xs font-black uppercase tracking-wider mb-6">
              <span className="w-2 h-2 rounded-full bg-blue-400"></span>
              <span>24/7 Operations Desk</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-[3.25rem] font-display font-black text-[#0b1f3a] tracking-tight leading-[1.08]">
              Hire a manager for your trucking company.{' '}
              <span className="text-blue-700">We work as </span>
              <span className="text-amber-600">your staff.</span>
            </h1>

            <p className="mt-6 text-base sm:text-lg text-slate-600 leading-relaxed max-w-2xl">
              Shipping Wish places a named Fleet Operations Manager inside your company — 24/7 load booking, broker handling, and a full TMS. You keep every dollar the broker pays. Flat weekly subscription. You do not buy your own load-board seat. First week is free.
            </p>

            <div className="flex flex-wrap items-center gap-4 mt-8">
              <a
                href="/pricing"
                className="px-7 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-sm font-black shadow-lg shadow-blue-600/25 transition-all text-center"
              >
                Start 7 days free — $0 today
              </a>
              <a
                href="/about"
                className="px-6 py-4 bg-white hover:bg-slate-50 text-[#0b1f3a] border border-slate-300 rounded-2xl text-sm font-bold transition-all text-center"
              >
                See the company
              </a>
            </div>

            <a
              href="/carrier-search"
              className="mt-8 p-4 bg-white border border-slate-200 hover:border-blue-300 rounded-2xl flex items-center justify-between gap-4 transition-all shadow-sm block max-w-xl"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-[#0b1f3a] text-white flex items-center justify-center text-sm font-black shrink-0">
                  MC
                </div>
                <div>
                  <div className="text-sm font-bold text-[#0b1f3a]">
                    Free FMCSA carrier lookup
                  </div>
                  <div className="text-xs text-slate-500">
                    Search MC#, USDOT, company name, phone, or email — public U.S. DOT records
                  </div>
                </div>
              </div>
              <span className="text-xs font-black text-blue-700 shrink-0 hidden sm:inline">
                Search →
              </span>
            </a>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-8 pt-6 border-t border-slate-200 text-xs font-semibold text-slate-600">
              <div className="flex items-center gap-1.5">
                <span className="text-emerald-600">✓</span> You keep broker pay
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-emerald-600">✓</span> Week 1 is $0
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-emerald-600">✓</span> You approve loads
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-emerald-600">✓</span> TMS included
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 lg:sticky lg:top-28">
            <OperationsCard />
          </div>
        </div>
      </div>
    </section>
  );
};
