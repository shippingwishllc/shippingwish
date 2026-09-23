import React from 'react';

export const ComparisonTable: React.FC = () => {
  const rows = [
    {
      feature: 'Monthly Price (Carriers)',
      ln: '$19 / mo',
      lnHighlight: true,
      dat: '$45 – $149 / mo',
      ts: '$40 – $150 / mo',
    },
    {
      feature: 'AI Predictive Lane Matching',
      ln: '✔ Included',
      dat: '✖ Limited / High Tier',
      ts: '✖ Manual Search Only',
    },
    {
      feature: 'Real Broker Credit & Days-To-Pay',
      ln: '✔ Included Free',
      dat: 'Extra Add-On Cost',
      ts: 'Extra Add-On Cost',
    },
    {
      feature: 'Anti-Double-Brokering Security Guard',
      ln: '✔ Active Real-Time',
      dat: '✖ Basic Report',
      ts: '✖ Reactive Only',
    },
    {
      feature: 'Direct Broker Phone & Email Contacts',
      ln: '✔ Unmasked Direct',
      dat: '✔ Yes',
      ts: '✔ Yes',
    },
    {
      feature: '4-App Mobile Suite (iOS & Android)',
      ln: '✔ Included (4 Apps)',
      dat: '1 Cluttered App',
      ts: '1 Cluttered App',
    },
    {
      feature: 'Free With Dedicated Dispatch Service',
      ln: '✔ 100% Free with SW Desk',
      dat: '✖ No Dispatch Service',
      ts: '✖ No Dispatch Service',
    },
  ];

  return (
    <section className="py-20 bg-white border-b border-slate-200/60" id="comparison">
      <div className="max-w-[1220px] mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <div className="text-xs font-extrabold uppercase tracking-wider text-blue-600 mb-2">
            Market Comparison
          </div>
          <h2 className="text-3xl md:text-4xl font-display font-extrabold text-slate-900 tracking-tight">
            Why Modern Fleets Are Switching
          </h2>
          <p className="mt-3 text-sm md:text-base text-slate-600">
            Compare LoadsNexus directly against legacy 1990s load board technology.
          </p>
        </div>

        <div className="overflow-x-auto max-w-4xl mx-auto border border-slate-200 rounded-2xl shadow-sm">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 uppercase tracking-wider text-[11px] font-extrabold">
                <th className="py-4 px-6">Feature &amp; Capabilities</th>
                <th className="py-4 px-6 bg-blue-50/80 text-blue-900 font-black border-x border-blue-200">
                  🔷 LoadsNexus™
                </th>
                <th className="py-4 px-6">DAT One™</th>
                <th className="py-4 px-6">Truckstop.com™</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-4 px-6 font-bold text-slate-800">{row.feature}</td>
                  <td className="py-4 px-6 bg-blue-50/40 border-x border-blue-100">
                    <span
                      className={`font-black ${
                        row.lnHighlight
                          ? 'text-blue-600 text-sm'
                          : row.ln.startsWith('✔')
                          ? 'text-emerald-700'
                          : 'text-slate-900'
                      }`}
                    >
                      {row.ln}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-slate-600">
                    <span className={row.dat.startsWith('✖') ? 'text-rose-600 font-semibold' : ''}>
                      {row.dat}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-slate-600">
                    <span className={row.ts.startsWith('✖') ? 'text-rose-600 font-semibold' : ''}>
                      {row.ts}
                    </span>
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
