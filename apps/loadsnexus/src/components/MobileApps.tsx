import React from 'react';

export const MobileApps: React.FC = () => {
  return (
    <section className="py-20 bg-slate-50 border-b border-slate-200/60" id="apps">
      <div className="max-w-[1220px] mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <div className="text-xs font-extrabold uppercase tracking-wider text-blue-600 mb-2">
            Mobile Ecosystem
          </div>
          <h2 className="text-3xl md:text-4xl font-display font-extrabold text-slate-900 tracking-tight">
            Dedicated Native Mobile Apps
          </h2>
          <p className="mt-3 text-sm md:text-base text-slate-600">
            Tailored tools built specifically for carrier dispatchers and freight brokers.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          {/* App 1: Carrier */}
          <div className="bg-white border border-slate-200 rounded-2xl p-7 shadow-sm hover:shadow-md transition-shadow">
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="1" y="3" width="15" height="13" rx="2" />
                <polygon points="16 8 20 8 23 11 23 16 16 16 8" />
                <circle cx="5.5" cy="18.5" r="2.5" />
                <circle cx="18.5" cy="18.5" r="2.5" />
              </svg>
            </div>
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded border border-blue-200">
              Carrier App
            </span>
            <h3 className="text-lg font-bold text-slate-900 mt-2 mb-2">
              LoadsNexus Carrier Pro
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed mb-6">
              Search spot freight across 50 states, broadcast truck capacity, inspect broker credit, and book loads with 1 tap.
            </p>
            <div className="flex flex-wrap gap-2.5">
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-bold">
                <svg width="14" height="14" viewBox="0 0 170 170" fill="currentColor">
                  <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.35.13-9.16-1.9-14.42-6.08-3.7-3.04-7.58-7.75-11.64-14.13-5.34-8.47-9.59-18.06-12.75-28.77-3.16-10.7-4.74-21.14-4.74-31.3 0-14.28 3.52-25.9 10.57-34.85 7.05-8.95 16.03-13.52 26.93-13.72 4.47 0 9.53 1.15 15.19 3.45 5.65 2.3 9.4 3.52 11.25 3.65 1.52-.13 5.48-1.39 11.88-3.78 6.4-2.39 11.83-3.46 16.3-3.2 12.16.88 21.75 5.75 28.76 14.6-10.84 6.57-16.14 15.65-15.9 27.23.25 9.08 3.68 16.71 10.3 22.89 6.62 6.18 14.49 9.87 23.6 11.07-2.39 7.33-5.28 14.7-8.68 22.09zM119.22 33.15c0-7.39 2.65-14.18 7.95-20.37 5.3-6.19 11.84-10.15 19.62-11.88.66 1.95 1 3.97 1.03 6.06 0 7.39-2.73 14.27-8.19 20.65-5.46 6.38-12.04 10.33-19.74 11.84-.22-2.12-.44-4.22-.67-6.3z" />
                </svg>
                <span>App Store · Pre-Release</span>
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-bold">
                <svg width="13" height="13" viewBox="0 0 512 512">
                  <path fill="#00C1A6" d="M31.2 24.5C28.2 28.1 26.5 33.7 26.5 41v430c0 7.3 1.7 12.9 4.7 16.5l2.4 2.4L259 264.5v-5.4L33.6 22.1l-2.4 2.4z" />
                  <path fill="#FFD400" d="M336.5 342l-77.5-77.5v-5.4l77.5-77.5 3.3 1.9 91.8 52.2c26.2 14.9 26.2 39.2 0 54.1L339.8 340l-3.3 2z" />
                  <path fill="#FF3333" d="M340 340.1L259 259.1 33.6 484.5c8.6 9.1 22.9 10.2 38.8 1.2L340 340.1z" />
                  <path fill="#00A0FF" d="M340 171.9L72.4 26.3c-15.9-9-30.2-7.9-38.8 1.2L259 252.9l81-81z" />
                </svg>
                <span>Google Play · Pre-Release</span>
              </div>
            </div>
          </div>

          {/* App 2: Broker */}
          <div className="bg-white border border-slate-200 rounded-2xl p-7 shadow-sm hover:shadow-md transition-shadow">
            <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            </div>
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-purple-700 bg-purple-50 px-2.5 py-0.5 rounded border border-purple-200">
              Broker App
            </span>
            <h3 className="text-lg font-bold text-slate-900 mt-2 mb-2">
              LoadsNexus Broker Desk
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed mb-6">
              Post spot loads in 30 seconds, match with verified carriers, and monitor real-time shipment GPS telematics.
            </p>
            <div className="flex flex-wrap gap-2.5">
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-bold">
                <svg width="14" height="14" viewBox="0 0 170 170" fill="currentColor">
                  <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.35.13-9.16-1.9-14.42-6.08-3.7-3.04-7.58-7.75-11.64-14.13-5.34-8.47-9.59-18.06-12.75-28.77-3.16-10.7-4.74-21.14-4.74-31.3 0-14.28 3.52-25.9 10.57-34.85 7.05-8.95 16.03-13.52 26.93-13.72 4.47 0 9.53 1.15 15.19 3.45 5.65 2.3 9.4 3.52 11.25 3.65 1.52-.13 5.48-1.39 11.88-3.78 6.4-2.39 11.83-3.46 16.3-3.2 12.16.88 21.75 5.75 28.76 14.6-10.84 6.57-16.14 15.65-15.9 27.23.25 9.08 3.68 16.71 10.3 22.89 6.62 6.18 14.49 9.87 23.6 11.07-2.39 7.33-5.28 14.7-8.68 22.09zM119.22 33.15c0-7.39 2.65-14.18 7.95-20.37 5.3-6.19 11.84-10.15 19.62-11.88.66 1.95 1 3.97 1.03 6.06 0 7.39-2.73 14.27-8.19 20.65-5.46 6.38-12.04 10.33-19.74 11.84-.22-2.12-.44-4.22-.67-6.3z" />
                </svg>
                <span>App Store · Pre-Release</span>
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-bold">
                <svg width="13" height="13" viewBox="0 0 512 512">
                  <path fill="#00C1A6" d="M31.2 24.5C28.2 28.1 26.5 33.7 26.5 41v430c0 7.3 1.7 12.9 4.7 16.5l2.4 2.4L259 264.5v-5.4L33.6 22.1l-2.4 2.4z" />
                  <path fill="#FFD400" d="M336.5 342l-77.5-77.5v-5.4l77.5-77.5 3.3 1.9 91.8 52.2c26.2 14.9 26.2 39.2 0 54.1L339.8 340l-3.3 2z" />
                  <path fill="#FF3333" d="M340 340.1L259 259.1 33.6 484.5c8.6 9.1 22.9 10.2 38.8 1.2L340 340.1z" />
                  <path fill="#00A0FF" d="M340 171.9L72.4 26.3c-15.9-9-30.2-7.9-38.8 1.2L259 252.9l81-81z" />
                </svg>
                <span>Google Play · Pre-Release</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
