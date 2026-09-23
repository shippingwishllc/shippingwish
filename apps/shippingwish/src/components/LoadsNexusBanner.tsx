import React from 'react';

export const LoadsNexusBanner: React.FC = () => {
  return (
    <section className="py-20 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 border-b border-slate-800/80">
      <div className="max-w-[1240px] mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          
          <div className="lg:col-span-7">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/25 text-blue-400 text-xs font-black uppercase tracking-wider mb-6">
              🔷 Powered by Shipping Wish LLC
            </div>

            <h2 className="text-3xl sm:text-5xl font-display font-black text-white tracking-tight leading-tight">
              Introducing <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-400">
                LoadsNexus™
              </span>{' '}
              AI Load Board
            </h2>

            <p className="mt-4 text-sm sm:text-base text-slate-400 leading-relaxed max-w-xl">
              Our AI-powered freight exchange for carriers and brokers. Real broker credit scores, anti-double-brokering protection, and the 4-app mobile suite — all on one platform.
            </p>

            <div className="flex flex-wrap items-center gap-4 mt-8">
              <a
                href="https://www.loadsnexus.com"
                target="_blank"
                rel="noopener"
                className="px-6 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-sm font-black shadow-lg shadow-blue-600/30 transition-all hover:scale-[1.02]"
              >
                Visit LoadsNexus.com →
              </a>
              <a
                href="/mobile-apps"
                className="px-6 py-3.5 bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border border-slate-700 rounded-xl text-sm font-bold transition-all"
              >
                📱 Mobile Apps
              </a>
            </div>
          </div>

          <div className="lg:col-span-5 grid grid-cols-2 gap-4">
            <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl text-center">
              <div className="text-3xl font-black text-blue-400">AI</div>
              <div className="text-xs text-slate-400 font-semibold mt-1">Load Matching</div>
            </div>
            <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl text-center">
              <div className="text-3xl font-black text-emerald-400">0</div>
              <div className="text-xs text-slate-400 font-semibold mt-1">Double-Broker Risk</div>
            </div>
            <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl text-center">
              <div className="text-3xl font-black text-purple-400">4</div>
              <div className="text-xs text-slate-400 font-semibold mt-1">Mobile Apps</div>
            </div>
            <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl text-center">
              <div className="text-3xl font-black text-amber-400">2</div>
              <div className="text-xs text-slate-400 font-semibold mt-1">Carrier &amp; Broker Portals</div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};
