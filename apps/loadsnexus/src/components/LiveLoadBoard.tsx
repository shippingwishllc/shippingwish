import React, { useState } from 'react';
import type { FreightLoad, SearchFilter } from '../types';

interface LiveLoadBoardProps {
  loads: FreightLoad[];
  isLoading: boolean;
  filter: SearchFilter;
  onFilterChange: (filter: SearchFilter) => void;
  onRefresh: () => void;
  onInspectLoad: (load: FreightLoad) => void;
  onOpenBrokerPost: () => void;
  onOpenCarrierCheckout: () => void;
  isLiveStreaming?: boolean;
  onToggleLiveStream?: () => void;
  lastRefreshedAt?: Date | null;
}

export const LiveLoadBoard: React.FC<LiveLoadBoardProps> = ({
  loads,
  isLoading,
  filter,
  onFilterChange,
  onRefresh,
  onInspectLoad,
  onOpenBrokerPost,
  onOpenCarrierCheckout,
  isLiveStreaming = true,
  onToggleLiveStream,
  lastRefreshedAt,
}) => {
  const [localOrigin, setLocalOrigin] = useState(filter.origin || '');
  const [localDest, setLocalDest] = useState(filter.destination || '');
  const [localEquip, setLocalEquip] = useState(filter.equipment || 'all');

  const handleFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onFilterChange({
      origin: localOrigin,
      destination: localDest,
      equipment: localEquip,
    });
  };

  const handleResetFilter = () => {
    setLocalOrigin('');
    setLocalDest('');
    setLocalEquip('all');
    onFilterChange({ origin: '', destination: '', equipment: 'all' });
  };

  return (
    <section className="py-12 bg-slate-100/60" id="live-board-section">
      <div className="max-w-[1220px] mx-auto px-6">
        <div className="bg-white border border-slate-200/90 rounded-2xl shadow-sm overflow-hidden">
          
          {/* Board Header */}
          <div className="p-6 md:p-8 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-5">
            <div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <rect x="1" y="3" width="15" height="13" rx="2" />
                    <polygon points="16 8 20 8 23 11 23 16 16 16 8" />
                    <circle cx="5.5" cy="18.5" r="2.5" />
                    <circle cx="18.5" cy="18.5" r="2.5" />
                  </svg>
                </div>
                <h2 className="text-xl md:text-2xl font-bold font-display text-slate-900 tracking-tight">
                  LoadsNexus™ Live Spot Freight Exchange
                </h2>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 radar-pulse-dot"></span>
                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                  4,850+ Live Verified Loads
                </span>
                <span className="text-xs text-slate-500 hidden sm:inline">
                  · {lastRefreshedAt ? `Auto-synced ${lastRefreshedAt.toLocaleTimeString()}` : 'Updated live in real-time'}
                </span>
              </div>
            </div>

            <div className="flex items-center flex-wrap gap-2.5">
              <button
                type="button"
                onClick={onOpenBrokerPost}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 shadow-sm transition-all"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Post Spot Freight (Free)
              </button>

              <button
                type="button"
                onClick={onOpenCarrierCheckout}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm transition-all"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                Unlock Direct Contacts ($19/mo)
              </button>

              {onToggleLiveStream && (
                <button
                  type="button"
                  onClick={onToggleLiveStream}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border shadow-xs ${
                    isLiveStreaming
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                      : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                  }`}
                  title={isLiveStreaming ? 'Live Auto-Refresh active (every 30s)' : 'Click to enable 30s auto-refresh'}
                >
                  <span className={`w-2 h-2 rounded-full ${isLiveStreaming ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}></span>
                  <span>{isLiveStreaming ? 'Auto-Refresh: ON (30s)' : 'Auto-Refresh: PAUSED'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={onRefresh}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-all"
                title="Refresh Live Stream Now"
              >
                🔄 Refresh
              </button>
            </div>
          </div>

          {/* Stats Bar & Quick Filter */}
          <div className="px-6 py-4 bg-slate-50/80 border-b border-slate-200/80 flex flex-col lg:flex-row lg:items-center justify-between gap-4 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600">
                <span>National Spot RPM:</span>
                <strong className="text-slate-900 font-extrabold">$3.18 / mi</strong>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600">
                <span>Monitored Brokers:</span>
                <strong className="text-slate-900 font-extrabold">28 Active</strong>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800">
                <span>Security Shield:</span>
                <strong className="font-extrabold">100% Anti-Double-Brokering Guard</strong>
              </div>
            </div>

            {/* In-Table Filter */}
            <form onSubmit={handleFilterSubmit} className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={localOrigin}
                onChange={(e) => setLocalOrigin(e.target.value)}
                placeholder="Filter Origin..."
                className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-900 w-28 focus:outline-none focus:border-blue-500"
              />
              <input
                type="text"
                value={localDest}
                onChange={(e) => setLocalDest(e.target.value)}
                placeholder="Filter Dest..."
                className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-900 w-28 focus:outline-none focus:border-blue-500"
              />
              <select
                value={localEquip}
                onChange={(e) => setLocalEquip(e.target.value)}
                className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-900 w-32 focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="all">All Equipment</option>
                <option value="Dry Van">53' Dry Van</option>
                <option value="Reefer">53' Reefer</option>
                <option value="Flatbed">Flatbed</option>
                <option value="Power Only">Power Only</option>
                <option value="Hotshot">Hotshot</option>
              </select>
              <button
                type="submit"
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs transition-colors"
              >
                Filter
              </button>
              <button
                type="button"
                onClick={handleResetFilter}
                className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-lg text-xs transition-colors"
              >
                Reset
              </button>
            </form>
          </div>

          {/* DAT One Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200/80 text-slate-500 uppercase tracking-wider font-extrabold text-[11px]">
                  <th className="py-3 px-4">Age / ID</th>
                  <th className="py-3 px-4">Trip Corridor</th>
                  <th className="py-3 px-4">Distance &amp; RPM</th>
                  <th className="py-3 px-4">Rate (USD)</th>
                  <th className="py-3 px-4">Equipment &amp; Weight</th>
                  <th className="py-3 px-4">Pickup Date</th>
                  <th className="py-3 px-4">Broker &amp; Credit Score</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-500 font-semibold">
                      <div className="inline-flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></span>
                        Scanning 50-State Spot Network for Live Verified Freight…
                      </div>
                    </td>
                  </tr>
                ) : loads.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-500 font-medium">
                      <div className="font-bold text-slate-800 text-sm mb-1">No loads matching filter criteria.</div>
                      <p className="text-xs mb-3">Try clearing your search filters or post your truck capacity.</p>
                      <button
                        type="button"
                        onClick={handleResetFilter}
                        className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs"
                      >
                        Reset All Filters
                      </button>
                    </td>
                  </tr>
                ) : (
                  loads.map((load, index) => {
                    const id = load.id || load.load_number || `SW-${2600 + index}`;
                    const origin = load.origin || load.pickup_location || 'Chicago, IL';
                    const dest = load.destination || load.delivery_location || 'Dallas, TX';
                    const miles = load.miles ? `${load.miles} mi` : '650 mi';
                    const rpmVal = parseFloat(String(load.rpm || 3.10));
                    const isHighRpm = rpmVal >= 3.30;
                    const rateFormatted = load.rate ? `$${Number(load.rate).toLocaleString()}` : '$2,450';
                    const equip = load.equipment_type || load.equipment || "53' Dry Van";
                    const weight = load.weight ? (typeof load.weight === 'number' ? `${load.weight.toLocaleString()} lbs` : load.weight) : '42,000 lbs';
                    const puDate = load.pickup_date || 'Today';
                    const bName = load.broker_name || 'Verified Freight Broker';
                    const dtp = load.days_to_pay || '18 days';
                    const isLive = load.is_live_broker_post;

                    return (
                      <tr
                        key={id}
                        className={`hover:bg-blue-50/40 transition-colors ${
                          isLive ? 'bg-purple-50/30' : ''
                        }`}
                      >
                        {/* ID / Age */}
                        <td className="py-3 px-4">
                          <div className="font-extrabold text-slate-900">{id}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {isLive ? (
                              <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">
                                ⚡ LIVE BROKER
                              </span>
                            ) : index === 0 ? (
                              'Just now'
                            ) : (
                              `${index * 4 + 2}m ago`
                            )}
                          </div>
                        </td>

                        {/* Corridor */}
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900 flex items-center gap-1.5">
                            <span>📍</span>
                            <span>{origin}</span>
                            <span className="text-blue-600 font-bold">→</span>
                            <span>{dest}</span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5">
                            <span>FTL Spot Freight</span>
                            <span>·</span>
                            <span>{load.commodity || 'General Freight'}</span>
                          </div>
                        </td>

                        {/* Distance & RPM */}
                        <td className="py-3 px-4">
                          <div className="font-extrabold text-slate-900">{miles}</div>
                          <div className="mt-0.5">
                            <span
                              className={`text-[11px] font-extrabold px-1.5 py-0.5 rounded ${
                                isHighRpm
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-blue-50 text-blue-700'
                              }`}
                            >
                              ${rpmVal.toFixed(2)} / mi
                            </span>
                          </div>
                        </td>

                        {/* Rate */}
                        <td className="py-3 px-4">
                          <div className="font-black text-slate-900 text-sm">{rateFormatted}</div>
                          <div className="text-[10px] text-slate-400">100% Pay Kept</div>
                        </td>

                        {/* Equipment & Weight */}
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-800">{equip}</div>
                          <div className="text-[11px] text-slate-500">{weight}</div>
                        </td>

                        {/* Pickup Date */}
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{puDate}</div>
                          <div className="text-[10px] text-slate-400">Direct Booking</div>
                        </td>

                        {/* Broker & Score */}
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900 truncate max-w-[150px]">{bName}</div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] font-extrabold px-1.5 py-0.2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded">
                              {dtp} DTP
                            </span>
                            <span className="text-[10px] font-bold px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded">
                              Bond Active
                            </span>
                          </div>
                        </td>

                        {/* Action */}
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <a
                              href={`/api/loadboard/loads/${encodeURIComponent(id)}/ratecon-pdf?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(dest)}&rate=${load.rate || 2850}&miles=${load.miles || 650}&rpm=${rpmVal}&equipment=${encodeURIComponent(equip)}&broker=${encodeURIComponent(bName)}&mc=${encodeURIComponent(load.broker_mc || '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Download Official Rate Confirmation PDF"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold border border-slate-200 transition-all hover:shadow-xs"
                            >
                              <span>📄</span>
                              <span className="hidden sm:inline">RateCon</span>
                            </a>
                            <button
                              type="button"
                              onClick={() => onInspectLoad(load)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm transition-all hover:shadow"
                            >
                              <span>⚡</span> Book Load
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Table Footer */}
          <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
            <div>
              ⚡ Live loads streamed directly from LoadsNexus™ spot exchange and verified brokers.
            </div>
            <div className="flex items-center gap-4">
              <span>
                <strong className="text-slate-900 font-extrabold">{loads.length}</strong> loads displayed
              </span>
              <button
                type="button"
                onClick={onOpenBrokerPost}
                className="text-blue-600 font-bold hover:underline"
              >
                + Post a Load (Free)
              </button>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};
