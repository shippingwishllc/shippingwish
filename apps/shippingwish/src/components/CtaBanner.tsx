import React from 'react';

export const CtaBanner: React.FC = () => {
  return (
    <section className="py-20 bg-[#0b1f3a] text-center">
      <div className="max-w-[1240px] mx-auto px-6">
        <h2 className="text-3xl sm:text-5xl font-display font-black text-white tracking-tight">
          Put a dispatcher on your U.S. fleet this week.
        </h2>
        <p className="mt-4 text-sm sm:text-base text-slate-300 max-w-xl mx-auto">
          $0 due now. TMS included. Call{' '}
          <a href="tel:+19177370021" className="text-amber-300 font-bold hover:underline">
            +1 (917) 737-0021
          </a>{' '}
          if you want a person on the desk first.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4 mt-8">
          <a
            href="/pricing"
            className="px-7 py-4 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-2xl text-sm font-black transition-all"
          >
            See weekly plans
          </a>
          <a
            href="/contact"
            className="px-6 py-4 bg-transparent hover:bg-white/10 text-white border border-white/30 rounded-2xl text-sm font-bold transition-all"
          >
            Talk to operations
          </a>
        </div>
      </div>
    </section>
  );
};
