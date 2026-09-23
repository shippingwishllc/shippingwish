import React from 'react';

export const CorridorTicker: React.FC = () => {
  const lanes = [
    {
      route: 'Chicago, IL → Dallas, TX',
      equip: "53' Dry Van · 925 mi",
      score: 'A+ · 3.5 DTP',
      rate: '$2,850',
      rpm: '$3.08 / mi',
    },
    {
      route: 'Atlanta, GA → Miami, FL',
      equip: "53' Reefer · 660 mi",
      score: 'A · 4.0 DTP',
      rate: '$2,450',
      rpm: '$3.71 / mi',
    },
    {
      route: 'Los Angeles, CA → Phoenix, AZ',
      equip: 'Flatbed · 375 mi',
      score: 'A+ · 2.8 DTP',
      rate: '$1,450',
      rpm: '$3.86 / mi',
    },
    {
      route: 'Philadelphia, PA → Charlotte, NC',
      equip: "53' Dry Van · 480 mi",
      score: 'A · 3.8 DTP',
      rate: '$1,720',
      rpm: '$3.58 / mi',
    },
  ];

  return (
    <section className="py-8 bg-white border-b border-slate-200/60">
      <div className="max-w-[1220px] mx-auto px-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700">
            <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping"></span>
            Trending Live Spot Freight Corridors
          </div>
          <div className="text-xs text-slate-500 font-semibold">
            Live Rates Updated Every 60 Seconds
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {lanes.map((lane, idx) => (
            <div
              key={idx}
              className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 hover:border-blue-300 transition-colors"
            >
              <div className="flex items-center justify-between text-xs font-extrabold text-slate-900 mb-1">
                <span>{lane.route}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500 mb-2">
                <span>{lane.equip}</span>
                <span className="text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded font-bold border border-blue-100">
                  {lane.score}
                </span>
              </div>
              <div className="flex items-baseline justify-between pt-2 border-t border-slate-200/60">
                <span className="text-base font-black text-slate-900">{lane.rate}</span>
                <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                  {lane.rpm}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
