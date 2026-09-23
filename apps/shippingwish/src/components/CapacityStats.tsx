import React from 'react';

export const CapacityStats: React.FC = () => {
  const stats = [
    { num: '100+', label: 'Dedicated operations staff' },
    { num: '24/7', label: 'Coverage on active freight' },
    { num: '48', label: 'States we work' },
    { num: '$0', label: 'Due during your first week' },
  ];

  return (
    <section className="py-20 bg-slate-900 border-b border-slate-800/80">
      <div className="max-w-[1240px] mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <div className="text-xs font-extrabold uppercase tracking-wider text-blue-400 mb-2">
            Company Capacity
          </div>
          <h2 className="text-3xl sm:text-4xl font-display font-black text-white tracking-tight">
            100+ dedicated people managing your work.
          </h2>
          <p className="mt-4 text-sm sm:text-base text-slate-300">
            Built to run as an extension of your motor carrier — booking, paperwork, and profit protection across the Lower 48.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
          {stats.map((stat, idx) => (
            <div
              key={idx}
              className="bg-slate-950/80 border border-slate-800 rounded-2xl p-6 text-center shadow-lg"
            >
              <div className="text-3xl sm:text-4xl font-black text-blue-400 mb-1">
                {stat.num}
              </div>
              <p className="text-xs text-slate-400 font-semibold">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
