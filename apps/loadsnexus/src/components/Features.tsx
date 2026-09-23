import React from 'react';

export const Features: React.FC = () => {
  const features = [
    {
      title: 'AI Predictive Load Matching',
      desc: 'Our engine evaluates your real-time GPS position, deadhead threshold, and historical RPM floors to deliver freight tailored to your specific fleet operations.',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 14.5a1.5 1.5 0 1 1-1.5-1.5 1.5 1.5 0 0 1 1.5 1.5zm1.5-6.5a2.5 2.5 0 0 0-5 0c0 2 2.5 2.5 2.5 4h1c0-2-2.5-2.5-2.5-4a1.5 1.5 0 0 1 3 0c0 1.5-1.5 2-2 3h1c1-.8 2-1.5 2-3z" />
        </svg>
      ),
      bg: 'bg-blue-50 text-blue-600',
    },
    {
      title: 'Real Days-To-Pay (DTP) Ratings',
      desc: 'Never haul for a slow-paying or defaulting broker. Live Days-To-Pay scores, credit limits, and $75,000 BMC-84 surety bond statuses verified on every load.',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="12" y1="1" x2="12" y2="23" />
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      ),
      bg: 'bg-emerald-50 text-emerald-600',
    },
    {
      title: 'Anti-Double-Brokering Guard',
      desc: 'Every booking is monitored by automated fraud algorithms. MC authority, physical terminal IP address, and FMCSA safety records cross-checked in seconds.',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      ),
      bg: 'bg-rose-50 text-rose-600',
    },
    {
      title: 'Real-Time Market Rate Benchmark',
      desc: 'Know exactly what a lane is paying before you quote. 15-day, 30-day, and 90-day spot vs contract rate averages give you leverage during broker negotiation.',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
          <polyline points="17 6 23 6 23 12" />
        </svg>
      ),
      bg: 'bg-blue-50 text-blue-600',
    },
    {
      title: '4-App Mobile Suite',
      desc: 'Native mobile experiences for CDL drivers, motor carriers, fleet dispatchers, and freight brokers. Complete document camera scanning, GPS tracking, and chat.',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
          <line x1="12" y1="18" x2="12.01" y2="18" />
        </svg>
      ),
      bg: 'bg-purple-50 text-purple-600',
    },
    {
      title: 'Zero-Friction TMS Sync',
      desc: 'Seamless two-way integration with the Shipping Wish TMS. Rate confirmations, BOLs, PODs, and invoice factoring generated automatically.',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      ),
      bg: 'bg-amber-50 text-amber-600',
    },
  ];

  return (
    <section className="py-20 bg-slate-50 border-b border-slate-200/60" id="features">
      <div className="max-w-[1220px] mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <div className="text-xs font-extrabold uppercase tracking-wider text-blue-600 mb-2">
            Enterprise Freight Intelligence
          </div>
          <h2 className="text-3xl md:text-4xl font-display font-extrabold text-slate-900 tracking-tight">
            Everything Legacy Load Boards Miss
          </h2>
          <p className="mt-3 text-sm md:text-base text-slate-600">
            Built from the ground up to solve today's freight fraud, payment delays, and empty deadhead miles.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feat, idx) => (
            <div
              key={idx}
              className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-5 ${feat.bg}`}>
                {feat.icon}
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-2">{feat.title}</h3>
              <p className="text-xs text-slate-600 leading-relaxed">{feat.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
