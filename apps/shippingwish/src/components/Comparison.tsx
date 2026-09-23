import React from 'react';

export const Comparison: React.FC = () => {
  const comparisons = [
    {
      typical: 'Buy your own load board and hunt freight yourself',
      sw: 'We already use professional load boards on our desk — booking is in your weekly plan',
    },
    {
      typical: 'Random after-hours call center',
      sw: 'Named manager who knows your lanes and RPM floor',
    },
    {
      typical: 'Cut of every load, surprise extras',
      sw: 'One weekly rate. No hidden fees. You keep broker pay',
    },
    {
      typical: 'Separate software bill',
      sw: 'TMS portal included on every plan',
    },
  ];

  return (
    <section className="py-20 bg-slate-900 border-b border-slate-800/80">
      <div className="max-w-[1240px] mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <div className="text-xs font-extrabold uppercase tracking-wider text-blue-400 mb-2">
            A Different Model
          </div>
          <h2 className="text-3xl sm:text-4xl font-display font-black text-white tracking-tight">
            Not a load-board pitch. A company desk that books for you.
          </h2>
          <p className="mt-4 text-sm sm:text-base text-slate-300">
            Carriers do not need another “find your own freight” product. They need people who already work the phones, the brokers, and the paperwork — as if they were on your payroll.
          </p>
        </div>

        <div className="overflow-x-auto max-w-4xl mx-auto border border-slate-800 rounded-3xl shadow-xl bg-slate-950/60">
          <table className="w-full text-left text-xs sm:text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/90 text-slate-400 uppercase tracking-wider text-[11px] font-extrabold">
                <th className="py-4 px-6 w-1/2">What most carriers are sold</th>
                <th className="py-4 px-6 w-1/2 bg-blue-950/40 text-blue-300 border-l border-slate-800">
                  Shipping Wish weekly plan
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {comparisons.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-900/50 transition-colors">
                  <td className="py-4 px-6 text-slate-400 font-medium">
                    <span className="text-rose-400 font-bold mr-2">✖</span>
                    {row.typical}
                  </td>
                  <td className="py-4 px-6 text-slate-100 font-bold bg-blue-950/20 border-l border-slate-800">
                    <span className="text-emerald-400 font-bold mr-2">✔</span>
                    {row.sw}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};
