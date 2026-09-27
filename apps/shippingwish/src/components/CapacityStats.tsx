import React from 'react';

export const CapacityStats: React.FC = () => {
  const stats = [
    { num: '24/7', label: 'Desk coverage on active freight' },
    { num: '48', label: 'U.S. states we work' },
    { num: '$0', label: 'Due during your first week' },
    { num: '100%', label: 'Broker pay stays with you' },
  ];

  return (
    <section className="py-20 bg-[#0b1f3a] border-b border-slate-800">
      <div className="max-w-[1240px] mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <div className="text-xs font-extrabold uppercase tracking-wider text-amber-300 mb-2">
            What you can count on
          </div>
          <h2 className="text-3xl sm:text-4xl font-display font-black text-white tracking-tight">
            A U.S. operations desk with a clear weekly plan.
          </h2>
          <p className="mt-4 text-sm sm:text-base text-slate-300">
            We do not publish headcount or average rate claims. These are the terms of the service: coverage, geography, the free week, and who keeps the freight pay.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
          {stats.map((stat, idx) => (
            <div
              key={idx}
              className="bg-white/5 border border-white/10 rounded-2xl p-6 text-center"
            >
              <div className="text-3xl sm:text-4xl font-black text-amber-300 mb-1">
                {stat.num}
              </div>
              <p className="text-xs text-slate-300 font-semibold">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
