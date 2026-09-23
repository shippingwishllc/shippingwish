import React from 'react';

export const CtaBanner: React.FC = () => {
  return (
    <section className="py-20 bg-slate-950 text-center border-b border-slate-800/80">
      <div className="max-w-[1240px] mx-auto px-6">
        <h2 className="text-3xl sm:text-5xl font-display font-black text-white tracking-tight">
          Put a manager on your company this week.
        </h2>
        <p className="mt-4 text-sm sm:text-base text-slate-400 max-w-xl mx-auto">
          $0 due now. Live operations desk. TMS included. Call{' '}
          <a href="tel:+19177370021" className="text-blue-400 font-bold hover:underline">
            +1 (917) 737-0021
          </a>{' '}
          if you want a human first.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4 mt-8">
          <a
            href="/pricing"
            className="px-7 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-sm font-black shadow-lg shadow-blue-600/30 transition-all hover:scale-[1.02]"
          >
            See weekly plans →
          </a>
          <a
            href="/contact"
            className="px-6 py-4 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-2xl text-sm font-bold transition-all"
          >
            Talk to operations
          </a>
        </div>
      </div>
    </section>
  );
};
