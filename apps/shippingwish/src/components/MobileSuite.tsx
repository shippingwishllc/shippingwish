import React from 'react';

export const MobileSuite: React.FC = () => {
  return (
    <section className="py-20 bg-slate-950 border-b border-slate-800/80">
      <div className="max-w-[1240px] mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <div className="text-xs font-extrabold uppercase tracking-wider text-blue-400 mb-2">
            Dedicated Mobile Suite
          </div>
          <h2 className="text-3xl sm:text-4xl font-display font-black text-white tracking-tight">
            Shipping Wish Mobile Applications
          </h2>
          <p className="mt-4 text-sm sm:text-base text-slate-300">
            High-performance native mobile applications built specifically for fleet managers and CDL drivers. Seamless real-time synchronization with your Shipping Wish cloud TMS dispatch desk.
          </p>
        </div>

        {/* 2 Apps Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto mb-8">
          
          {/* App 1: Shipping Wish TMS */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-7 flex flex-col justify-between shadow-xl">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="text-3xl">🖥️</div>
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-blue-400 bg-blue-500/10 px-3 py-1 rounded-full border border-blue-500/20">
                  Fleet Operations
                </span>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">
                Shipping Wish TMS
              </h3>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed mb-6">
                Active fleet dispatches overview, live driver GPS telematics map, digital document vault (RateCon/BOL/POD), and factoring revenue tracker.
              </p>
            </div>

            <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
                <svg width="14" height="14" viewBox="0 0 170 170" fill="currentColor">
                  <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.35.13-9.16-1.9-14.42-6.08-3.7-3.04-7.58-7.75-11.64-14.13-5.34-8.47-9.59-18.06-12.75-28.77-3.16-10.7-4.74-21.14-4.74-31.3 0-14.28 3.52-25.9 10.57-34.85 7.05-8.95 16.03-13.52 26.93-13.72 4.47 0 9.53 1.15 15.19 3.45 5.65 2.3 9.4 3.52 11.25 3.65 1.52-.13 5.48-1.39 11.88-3.78 6.4-2.39 11.83-3.46 16.3-3.2 12.16.88 21.75 5.75 28.76 14.6-10.84 6.57-16.14 15.65-15.9 27.23.25 9.08 3.68 16.71 10.3 22.89 6.62 6.18 14.49 9.87 23.6 11.07-2.39 7.33-5.28 14.7-8.68 22.09zM119.22 33.15c0-7.39 2.65-14.18 7.95-20.37 5.3-6.19 11.84-10.15 19.62-11.88.66 1.95 1 3.97 1.03 6.06 0 7.39-2.73 14.27-8.19 20.65-5.46 6.38-12.04 10.33-19.74 11.84-.22-2.12-.44-4.22-.67-6.3z" />
                </svg>
                <svg width="13" height="13" viewBox="0 0 512 512">
                  <path fill="#00C1A6" d="M31.2 24.5C28.2 28.1 26.5 33.7 26.5 41v430c0 7.3 1.7 12.9 4.7 16.5l2.4 2.4L259 264.5v-5.4L33.6 22.1l-2.4 2.4z" />
                  <path fill="#FFD400" d="M336.5 342l-77.5-77.5v-5.4l77.5-77.5 3.3 1.9 91.8 52.2c26.2 14.9 26.2 39.2 0 54.1L339.8 340l-3.3 2z" />
                  <path fill="#FF3333" d="M340 340.1L259 259.1 33.6 484.5c8.6 9.1 22.9 10.2 38.8 1.2L340 340.1z" />
                  <path fill="#00A0FF" d="M340 171.9L72.4 26.3c-15.9-9-30.2-7.9-38.8 1.2L259 252.9l81-81z" />
                </svg>
                <span>iOS &amp; Android</span>
              </div>

              <a
                href="/login"
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all text-center"
              >
                Open Portal →
              </a>
            </div>
          </div>

          {/* App 2: Driver Console */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-7 flex flex-col justify-between shadow-xl">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="text-3xl">🚛</div>
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
                  CDL Drivers
                </span>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">
                Driver Console App
              </h3>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed mb-6">
                1-Tap Google/Apple navigation, 1-tap milestone status (Loaded, In Transit, Delivered), camera BOL/POD scanner, and live GPS corridor ping.
              </p>
            </div>

            <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
                <svg width="14" height="14" viewBox="0 0 170 170" fill="currentColor">
                  <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.35.13-9.16-1.9-14.42-6.08-3.7-3.04-7.58-7.75-11.64-14.13-5.34-8.47-9.59-18.06-12.75-28.77-3.16-10.7-4.74-21.14-4.74-31.3 0-14.28 3.52-25.9 10.57-34.85 7.05-8.95 16.03-13.52 26.93-13.72 4.47 0 9.53 1.15 15.19 3.45 5.65 2.3 9.4 3.52 11.25 3.65 1.52-.13 5.48-1.39 11.88-3.78 6.4-2.39 11.83-3.46 16.3-3.2 12.16.88 21.75 5.75 28.76 14.6-10.84 6.57-16.14 15.65-15.9 27.23.25 9.08 3.68 16.71 10.3 22.89 6.62 6.18 14.49 9.87 23.6 11.07-2.39 7.33-5.28 14.7-8.68 22.09zM119.22 33.15c0-7.39 2.65-14.18 7.95-20.37 5.3-6.19 11.84-10.15 19.62-11.88.66 1.95 1 3.97 1.03 6.06 0 7.39-2.73 14.27-8.19 20.65-5.46 6.38-12.04 10.33-19.74 11.84-.22-2.12-.44-4.22-.67-6.3z" />
                </svg>
                <svg width="13" height="13" viewBox="0 0 512 512">
                  <path fill="#00C1A6" d="M31.2 24.5C28.2 28.1 26.5 33.7 26.5 41v430c0 7.3 1.7 12.9 4.7 16.5l2.4 2.4L259 264.5v-5.4L33.6 22.1l-2.4 2.4z" />
                  <path fill="#FFD400" d="M336.5 342l-77.5-77.5v-5.4l77.5-77.5 3.3 1.9 91.8 52.2c26.2 14.9 26.2 39.2 0 54.1L339.8 340l-3.3 2z" />
                  <path fill="#FF3333" d="M340 340.1L259 259.1 33.6 484.5c8.6 9.1 22.9 10.2 38.8 1.2L340 340.1z" />
                  <path fill="#00A0FF" d="M340 171.9L72.4 26.3c-15.9-9-30.2-7.9-38.8 1.2L259 252.9l81-81z" />
                </svg>
                <span>iOS &amp; Android</span>
              </div>

              <a
                href="/driver-app"
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all text-center"
              >
                Get App →
              </a>
            </div>
          </div>

        </div>

        {/* Cross Referral Card to LoadsNexus */}
        <div className="bg-slate-900/60 border border-blue-500/25 rounded-2xl p-5 sm:p-6 max-w-4xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-blue-400">
              LoadsNexus™ Load Board Apps
            </div>
            <div className="text-sm font-semibold text-slate-200 mt-1">
              Looking for the LoadsNexus Carrier Pro or Broker Desk mobile applications?
            </div>
          </div>

          <a
            href="https://www.loadsnexus.com/#apps"
            target="_blank"
            rel="noopener"
            className="px-4 py-2 border border-blue-500/40 text-blue-300 hover:text-white hover:border-blue-400 rounded-xl text-xs font-bold transition-all shrink-0"
          >
            LoadsNexus Apps →
          </a>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-4 mt-8">
          <a
            href="/mobile-apps"
            className="px-6 py-3.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-extrabold shadow-md transition-all"
          >
            Explore Mobile Apps Suite →
          </a>
          <a
            href="/app-downloads"
            className="px-6 py-3.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all"
          >
            Download Center →
          </a>
        </div>
      </div>
    </section>
  );
};
