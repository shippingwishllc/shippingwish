import React from 'react';

export const MobileSuite: React.FC = () => {
  return (
    <section className="py-20 bg-[#f4f7fb] border-b border-slate-200">
      <div className="max-w-[1240px] mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <div className="text-xs font-extrabold uppercase tracking-wider text-amber-700 mb-2">
            Carrier tools
          </div>
          <h2 className="text-3xl sm:text-4xl font-display font-black text-[#0b1f3a] tracking-tight">
            TMS and driver tools that come with the desk
          </h2>
          <p className="mt-4 text-sm sm:text-base text-slate-600">
            The weekly plan includes the carrier portal. Drivers and dispatchers use it in the browser on a phone or laptop. Store badges are not shown until an app is listed there.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto mb-8">
          <div className="bg-white border border-slate-200 rounded-3xl p-7 flex flex-col justify-between shadow-sm">
            <div>
              <div className="text-[11px] font-extrabold uppercase tracking-wider text-blue-700 bg-blue-50 px-3 py-1 rounded-full border border-blue-100 inline-block mb-4">
                Fleet operations
              </div>
              <h3 className="text-xl font-bold text-[#0b1f3a] mb-2">Shipping Wish TMS</h3>
              <p className="text-sm text-slate-600 leading-relaxed mb-6">
                Loads, rate confirmations, BOLs, and PODs in one portal. Your manager updates status. You approve freight before it moves.
              </p>
            </div>
            <a href="/login" className="px-4 py-2.5 bg-[#0b1f3a] text-white rounded-xl text-xs font-bold text-center">
              Open carrier portal
            </a>
          </div>

          <div className="bg-white border border-slate-200 rounded-3xl p-7 flex flex-col justify-between shadow-sm">
            <div>
              <div className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100 inline-block mb-4">
                Drivers
              </div>
              <h3 className="text-xl font-bold text-[#0b1f3a] mb-2">Driver updates</h3>
              <p className="text-sm text-slate-600 leading-relaxed mb-6">
                Drivers mark loaded, in transit, and delivered, and can send document photos back to the desk. The page works in a phone browser.
              </p>
            </div>
            <a href="/mobile-apps" className="px-4 py-2.5 bg-amber-400 text-slate-950 rounded-xl text-xs font-bold text-center">
              See mobile access
            </a>
          </div>
        </div>

        <div className="text-center">
          <a href="/mobile-apps" className="text-sm font-bold text-amber-800 hover:underline">
            Mobile access details
          </a>
        </div>
      </div>
    </section>
  );
};
