import React from 'react';

const facts = [
  'Named manager',
  'You approve every load',
  'No cut of the load',
  'TMS included',
  'First week $0',
  'Lower 48',
];

export const DeskStrip: React.FC = () => {
  return (
    <section className="bg-[#0b1f3a] border-b border-slate-800" aria-label="Desk facts">
      <div className="max-w-[1240px] mx-auto px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
        {facts.map((fact) => (
          <span key={fact} className="inline-flex items-center gap-2 text-[12px] sm:text-[13px] font-bold text-slate-100">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" aria-hidden="true"></span>
            {fact}
          </span>
        ))}
      </div>
    </section>
  );
};
