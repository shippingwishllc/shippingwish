import React from 'react';

export const Hero: React.FC = () => {
  return (
    <section className="relative pt-32 pb-20 md:pt-40 md:pb-28 bg-gradient-to-b from-[#eef4fb] via-white to-[#f4f7fb] overflow-hidden border-b border-slate-200">
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-200/40 rounded-full blur-3xl hero-glow-orb"></div>
        <div className="absolute top-1/3 right-1/4 w-80 h-80 bg-amber-200/40 rounded-full blur-3xl hero-glow-orb" style={{ animationDelay: '-4s' }}></div>
      </div>

      <div className="max-w-[1240px] mx-auto px-6 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          <div className="lg:col-span-7">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-slate-200 text-amber-800 text-xs font-black uppercase tracking-wider mb-6 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-500 live-pulse-dot"></span>
              <span>U.S. dispatch desk · Lower 48</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-[3.4rem] font-display font-black text-[#0b1f3a] tracking-tight leading-[1.12]">
              A dedicated dispatcher for your trucking company.{' '}
              <em className="text-amber-600 not-italic">
                You keep the freight pay.
              </em>
            </h1>

            <p className="mt-6 text-base sm:text-lg text-slate-600 leading-relaxed max-w-2xl">
              Shipping Wish LLC places a named fleet operations manager on your motor carrier. We book loads, handle broker packets, and run the TMS that is included in a flat weekly plan.
              Built for owner-operators and small fleets in the United States. First week is $0. No percentage of the load.
            </p>

            <div className="flex flex-wrap items-center gap-4 mt-8">
              <a
                href="/pricing"
                className="px-7 py-4 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-2xl text-sm font-black shadow-lg shadow-amber-500/25 transition-all hover:scale-[1.02] text-center"
              >
                Start 7 days free — $0 today
              </a>
              <a
                href="/services"
                className="px-6 py-4 bg-white hover:bg-slate-50 text-[#0b1f3a] border border-slate-300 rounded-2xl text-sm font-bold transition-all text-center"
              >
                See dispatch services
              </a>
            </div>

            <a
              href="/carrier-search"
              className="mt-8 p-4 bg-white border border-slate-200 hover:border-amber-300 rounded-2xl flex items-center justify-between gap-4 transition-all shadow-sm group block max-w-xl"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-[#0b1f3a] text-white flex items-center justify-center text-lg shrink-0">
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
              <span className="text-xs font-black text-amber-700 shrink-0 hidden sm:inline">
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
                <span className="text-emerald-600">✓</span> No forced dispatch
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-emerald-600">✓</span> TMS included
              </div>
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-7 shadow-xl relative">
              <div className="flex items-center justify-between pb-4 border-b border-slate-200 text-xs font-bold">
                <span className="text-[#0b1f3a]">How a booked lane is shown</span>
                <span className="text-amber-800 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                  Example only
                </span>
              </div>

              <div className="mt-5 p-5 rounded-2xl bg-[#f4f7fb] border border-slate-200">
                <div className="text-xs font-bold text-slate-500 mb-2">Illustrative dry van lane</div>
                <div className="flex items-center gap-2 text-sm font-extrabold text-[#0b1f3a] my-3">
                  <span>Dallas, TX</span>
                  <span className="text-amber-600">→</span>
                  <span>Atlanta, GA</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Your manager negotiates the rate, sends the packet, and waits for your approval. The broker pays your company. Shipping Wish bills only the weekly plan. We do not publish a guaranteed rate per mile.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-5">
                {[
                  ['100%', 'Broker pay kept'],
                  ['$0', 'Due in week 1'],
                  ['24/7', 'Desk on active freight'],
                  ['48', 'States we cover'],
                ].map(([value, label]) => (
                  <div key={label} className="p-3.5 rounded-xl bg-[#f8fafc] border border-slate-200 text-center">
                    <div className="text-base font-black text-[#0b1f3a]">{value}</div>
                    <div className="text-[11px] text-slate-500 font-medium mt-0.5">{label}</div>
                  </div>
                ))}
              </div>

              <a
                href="/dispatch"
                className="mt-5 w-full py-3 px-4 rounded-xl text-xs font-extrabold text-slate-950 bg-amber-400 hover:bg-amber-300 transition-all flex items-center justify-center text-center"
              >
                See what the desk handles
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
