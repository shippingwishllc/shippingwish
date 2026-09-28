import React from 'react';
import type { FreightLoad } from '../types';

export const CorridorTicker: React.FC<{ loads?: FreightLoad[] }> = ({ loads = [] }) => {
  const lanes = loads.filter((l) => l.origin && l.destination && l.rate).slice(0, 4);
  if (!lanes.length) return null;

  return (
    <section className="py-8 bg-white border-b border-slate-200/60">
      <div className="max-w-[1220px] mx-auto px-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700">
            <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping"></span>
            Posted spot freight
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {lanes.map((lane) => {
            const miles = Number(lane.miles) || 0;
            const rate = Number(lane.rate) || 0;
            const rpm = Number(lane.rpm) || (miles ? rate / miles : 0);
            return (
              <div
                key={lane.id}
                className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 hover:border-blue-300 transition-colors"
              >
                <div className="flex items-center justify-between text-xs font-extrabold text-slate-900 mb-1">
                  <span>{lane.origin} → {lane.destination}</span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500 mb-2">
                  <span>{lane.equipment_type || 'Equipment n/a'}{miles ? ` · ${miles} mi` : ''}</span>
                </div>
                <div className="flex items-baseline justify-between pt-2 border-t border-slate-200/60">
                  <span className="text-base font-black text-slate-900">${rate.toLocaleString()}</span>
                  <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                    {rpm ? `$${rpm.toFixed(2)} / mi` : 'RPM n/a'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
