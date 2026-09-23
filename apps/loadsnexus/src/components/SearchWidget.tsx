import React, { useState } from 'react';
import type { SearchFilter } from '../types';

interface SearchWidgetProps {
  onSearch: (filter: SearchFilter) => void;
  onOpenPostFreight: (prefill?: { origin: string; dest: string }) => void;
}

export const SearchWidget: React.FC<SearchWidgetProps> = ({ onSearch, onOpenPostFreight }) => {
  const [mode, setMode] = useState<'loads' | 'capacity'>('loads');
  const [origin, setOrigin] = useState('Chicago, IL');
  const [destination, setDestination] = useState('Dallas, TX');
  const [equipment, setEquipment] = useState("53' Dry Van");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'capacity') {
      onOpenPostFreight({ origin, dest: destination });
    } else {
      onSearch({ origin, destination, equipment });
      const target = document.getElementById('live-board-section');
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xl shadow-slate-900/5 p-6 max-w-4xl mx-auto -mt-6 relative z-20">
      {/* Top Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-slate-100">
        <div className="inline-flex p-1 bg-slate-100 rounded-xl gap-1">
          <button
            type="button"
            onClick={() => setMode('loads')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              mode === 'loads'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <rect x="1" y="3" width="15" height="13" rx="2" />
              <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
              <circle cx="5.5" cy="18.5" r="2.5" />
              <circle cx="18.5" cy="18.5" r="2.5" />
            </svg>
            Find Loads (Carriers)
          </button>

          <button
            type="button"
            onClick={() => setMode('capacity')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              mode === 'capacity'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            Post Freight / Search Trucks (Brokers)
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-3 py-1.5 rounded-full">
          <span className="w-2 h-2 rounded-full bg-emerald-500 radar-pulse-dot"></span>
          <span>4,850+ Live Verified Loads</span>
        </div>
      </div>

      {/* Form Fields */}
      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-5">
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">
            Origin (City, State or Zip)
          </label>
          <input
            type="text"
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            placeholder="e.g. Chicago, IL"
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 outline-none transition-all"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">
            Destination
          </label>
          <input
            type="text"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="e.g. Dallas, TX or Anywhere"
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 outline-none transition-all"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">
            Equipment Type
          </label>
          <select
            value={equipment}
            onChange={(e) => setEquipment(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 outline-none transition-all cursor-pointer"
          >
            <option value="53' Dry Van">53' Dry Van</option>
            <option value="53' Reefer">53' Reefer (Temp Controlled)</option>
            <option value="Flatbed">Flatbed / Step Deck</option>
            <option value="Power Only">Power Only</option>
            <option value="Hotshot">Hotshot</option>
          </select>
        </div>

        <div className="flex items-end">
          <button
            type="submit"
            className={`w-full py-2.5 px-4 rounded-xl text-sm font-bold text-white transition-all shadow-md ${
              mode === 'capacity'
                ? 'bg-purple-600 hover:bg-purple-700 shadow-purple-600/30'
                : 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/30'
            }`}
          >
            {mode === 'capacity' ? '⚡ Post Freight Free' : 'Search Loads'}
          </button>
        </div>
      </form>
    </div>
  );
};
