import React from 'react';

export const LoadsNexusBanner: React.FC = () => {
  return (
    <section className="py-20 bg-white border-b border-slate-200">
      <div className="max-w-[1240px] mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          
          <div className="lg:col-span-7">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50 border border-blue-100 text-blue-800 text-xs font-black uppercase tracking-wider mb-6">
              🔷 Powered by Shipping Wish LLC
            </div>

            <h2 className="text-3xl sm:text-5xl font-display font-black text-[#0b1f3a] tracking-tight leading-tight">
              LoadsNexus load board
            </h2>

            <p className="mt-4 text-sm sm:text-base text-slate-600 leading-relaxed max-w-xl">
              A separate Shipping Wish product for carriers and brokers who want to search posted freight. Operations clients still approve every load. LoadsNexus is not a promise of a specific rate.
            </p>

            <div className="flex flex-wrap items-center gap-4 mt-8">
              <a
                href="https://www.loadsnexus.com"
                target="_blank"
                rel="noopener"
                className="px-6 py-3.5 bg-[#0b1f3a] hover:bg-[#16325c] text-white rounded-xl text-sm font-black transition-all"
              >
                Visit LoadsNexus.com
              </a>
              <a
                href="/services"
                className="px-6 py-3.5 bg-white hover:bg-slate-50 text-[#0b1f3a] border border-slate-300 rounded-xl text-sm font-bold transition-all"
              >
                See the operations desk
              </a>
            </div>
          </div>

          <div className="lg:col-span-5 grid grid-cols-2 gap-4">
            <div className="p-6 bg-[#f4f7fb] border border-slate-200 rounded-2xl text-center">
              <div className="text-lg font-black text-[#0b1f3a]">Search</div>
              <div className="text-xs text-slate-500 font-semibold mt-1">Posted freight</div>
            </div>
            <div className="p-6 bg-[#f4f7fb] border border-slate-200 rounded-2xl text-center">
              <div className="text-lg font-black text-[#0b1f3a]">Check</div>
              <div className="text-xs text-slate-500 font-semibold mt-1">Broker packet</div>
            </div>
            <div className="p-6 bg-[#f4f7fb] border border-slate-200 rounded-2xl text-center">
              <div className="text-lg font-black text-[#0b1f3a]">Approve</div>
              <div className="text-xs text-slate-500 font-semibold mt-1">You accept the load</div>
            </div>
            <div className="p-6 bg-[#f4f7fb] border border-slate-200 rounded-2xl text-center">
              <div className="text-lg font-black text-[#0b1f3a]">Separate</div>
              <div className="text-xs text-slate-500 font-semibold mt-1">From the weekly desk</div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};
