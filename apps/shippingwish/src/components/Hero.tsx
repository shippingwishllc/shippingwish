import React, { useState, useEffect } from 'react';
import type { LiveLoadCard } from '../types';

const SAMPLE_LOADS: LiveLoadCard[] = [
  {
    id: 'LOAD SW-98401',
    miles: 715,
    rpm: 4.82,
    pay: 3450,
    origin: 'Chicago, IL',
    destination: 'Atlanta, GA',
    equipment: "53' Dry Van",
    note: 'Booked by your operations manager. Freight pay goes to your company. Your weekly plan is billed separately on Stripe.',
  },
  {
    id: 'LOAD SW-98402',
    miles: 925,
    rpm: 3.65,
    pay: 3375,
    origin: 'Dallas, TX',
    destination: 'Charlotte, NC',
    equipment: "53' Reefer",
    note: 'Pre-loaded produce corridor secured. Zero double-brokering risk verified by compliance desk.',
  },
  {
    id: 'LOAD SW-98403',
    miles: 450,
    rpm: 4.10,
    pay: 1845,
    origin: 'Philadelphia, PA',
    destination: 'Columbus, OH',
    equipment: 'Flatbed',
    note: 'Same-day reload staged before empty. Maximum RPM achieved with zero empty deadhead.',
  },
];

export const Hero: React.FC = () => {
  const [loadIndex, setLoadIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setLoadIndex((prev) => (prev + 1) % SAMPLE_LOADS.length);
    }, 5500);
    return () => clearInterval(timer);
  }, []);

  const currentLoad = SAMPLE_LOADS[loadIndex];

  return (
    <section className="relative pt-32 pb-20 md:pt-40 md:pb-28 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 overflow-hidden border-b border-slate-800/80">
      {/* Background Ambient Glow Orbs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-600/15 rounded-full blur-3xl hero-glow-orb"></div>
        <div className="absolute top-1/3 right-1/4 w-80 h-80 bg-indigo-600/15 rounded-full blur-3xl hero-glow-orb" style={{ animationDelay: '-4s' }}></div>
      </div>

      <div className="max-w-[1240px] mx-auto px-6 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          
          {/* Left Column: Headlines & CTAs */}
          <div className="lg:col-span-7">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/25 text-blue-400 text-xs font-black uppercase tracking-wider mb-6">
              <span className="w-2 h-2 rounded-full bg-blue-500 live-pulse-dot"></span>
              <span>24/7 Operations Desk</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] font-display font-black text-white tracking-tight leading-[1.12]">
              Hire a manager for your trucking company.{' '}
              <em className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-300 to-amber-300 not-italic">
                We work as your staff.
              </em>
            </h1>

            <p className="mt-6 text-base sm:text-lg text-slate-300 leading-relaxed max-w-2xl">
              Shipping Wish places a named Fleet Operations Manager inside your company — 24/7 load booking, broker handling, and a full TMS.
              You keep every dollar the broker pays. Flat weekly subscription. You do not buy your own load-board seat. First week is free.
            </p>

            <div className="flex flex-wrap items-center gap-4 mt-8">
              <a
                href="/pricing"
                className="px-7 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-2xl text-sm font-black shadow-xl shadow-blue-600/30 transition-all hover:scale-[1.02] text-center"
              >
                Start 7 days free — $0 today
              </a>
              <a
                href="/about"
                className="px-6 py-4 bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 border border-slate-700 rounded-2xl text-sm font-bold transition-all text-center"
              >
                See the company
              </a>
            </div>

            {/* Free FMCSA lookup card */}
            <a
              href="/carrier-search"
              className="mt-8 p-4 bg-slate-900/80 border border-slate-800 hover:border-slate-700 rounded-2xl flex items-center justify-between gap-4 transition-all hover:bg-slate-800/60 group block max-w-xl"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-slate-800 text-white flex items-center justify-center text-lg shrink-0 group-hover:scale-105 transition-transform">
                  🔎
                </div>
                <div>
                  <div className="text-sm font-bold text-white group-hover:text-blue-400 transition-colors">
                    Free FMCSA carrier lookup
                  </div>
                  <div className="text-xs text-slate-400">
                    Search MC#, USDOT, company name, phone, or email — public DOT records, no login
                  </div>
                </div>
              </div>
              <span className="text-xs font-black text-blue-400 shrink-0 hidden sm:inline">
                Search now →
              </span>
            </a>

            {/* Trust points */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-8 pt-6 border-t border-slate-800/80 text-xs font-semibold text-slate-400">
              <div className="flex items-center gap-1.5">
                <span className="text-emerald-400">🔒</span> Stripe secure
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-emerald-400">✓</span> Week 1 free = $0
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-emerald-400">✓</span> 100+ team staff
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-emerald-400">✓</span> High RPM floor
              </div>
            </div>
          </div>

          {/* Right Column: Live Interactive Carrier Operations Portal Panel */}
          <div className="lg:col-span-5">
            <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-7 shadow-2xl backdrop-blur-md relative overflow-hidden">
              <div className="flex items-center justify-between pb-4 border-b border-slate-800 text-xs font-bold">
                <span className="text-slate-300">Carrier Operations Portal</span>
                <span className="flex items-center gap-2 text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 live-pulse-dot"></span>
                  <span>Live desk &amp; AI load stream</span>
                </span>
              </div>

              {/* Dynamic Load Card */}
              <div className="mt-5 p-5 rounded-2xl bg-slate-950/80 border border-slate-800">
                <div className="flex items-center justify-between text-xs text-slate-400 font-bold mb-2">
                  <span className="text-blue-400">{currentLoad.id}</span>
                  <span>{currentLoad.miles} mi · ${currentLoad.rpm.toFixed(2)} / mi</span>
                </div>

                <div className="text-3xl sm:text-4xl font-black text-emerald-400 my-2">
                  ${currentLoad.pay.toLocaleString()}
                </div>

                <div className="flex items-center gap-2 text-sm font-extrabold text-white my-3">
                  <span>{currentLoad.origin}</span>
                  <span className="text-blue-500">→</span>
                  <span>{currentLoad.destination}</span>
                  <span className="text-xs text-slate-400 font-normal ml-auto">({currentLoad.equipment})</span>
                </div>

                <p className="text-xs text-slate-400 leading-relaxed border-t border-slate-800/80 pt-3">
                  {currentLoad.note}
                </p>

                <a
                  href="/load-booking"
                  className="mt-4 w-full py-2.5 px-4 rounded-xl text-xs font-extrabold text-slate-950 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 shadow-md shadow-amber-500/20 transition-all flex items-center justify-center gap-2 text-center"
                >
                  <span>🎯</span> Search 500+ Live AI Loads →
                </a>
              </div>

              {/* Live KPIs */}
              <div className="grid grid-cols-2 gap-3 mt-5">
                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 text-center">
                  <div className="text-base font-black text-white">2,480+</div>
                  <div className="text-[11px] text-slate-400 font-medium mt-0.5">Active loads</div>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 text-center">
                  <div className="text-base font-black text-emerald-400">$3.24 / mi</div>
                  <div className="text-[11px] text-slate-400 font-medium mt-0.5">Market avg RPM</div>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 text-center">
                  <div className="text-base font-black text-amber-400">100%</div>
                  <div className="text-[11px] text-slate-400 font-medium mt-0.5">Broker pay kept</div>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 text-center">
                  <div className="text-base font-black text-blue-400">24/7</div>
                  <div className="text-[11px] text-slate-400 font-medium mt-0.5">Desk coverage</div>
                </div>
              </div>

            </div>
          </div>

        </div>
      </div>
    </section>
  );
};
