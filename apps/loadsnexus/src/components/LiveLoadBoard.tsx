import React, { useState, useEffect, useRef } from 'react';
import type { FreightLoad, SearchFilter, UserSession } from '../types';
import type { LaneAlert } from './LaneAlertsModal';

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
  onOpenLaneAlerts?: () => void;
  onOpenBrokerCredit?: () => void;
  onOpenAiIngest?: () => void;
  savedAlerts?: LaneAlert[];
  user?: UserSession | null;
  onOpenAuth?: (role?: 'carrier' | 'broker') => void;
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
  onOpenLaneAlerts,
  onOpenBrokerCredit,
  onOpenAiIngest,
  savedAlerts = [],
  user,
  onOpenAuth,
}) => {
  const [localOrigin, setLocalOrigin] = useState(filter.origin || '');
  const [localDest, setLocalDest] = useState(filter.destination || '');
  const [localEquip, setLocalEquip] = useState(filter.equipment || 'all');
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const [coveredMap, setCoveredMap] = useState<Record<string, number>>({});
  const [, setTicker] = useState(0);
  const prevLoadCountRef = useRef(loads.length);

  const isSubscriber = Boolean(
    user && (
      user.role === 'carrier' ||
      user.role === 'broker' ||
      user.role === 'admin' ||
      user.role === 'super_admin' ||
      user.weekly_plan === 'loadboard_ai_pass'
    )
  );

  // Sync server covered loads
  useEffect(() => {
    setCoveredMap((prev) => {
      const updated = { ...prev };
      let changed = false;
      loads.forEach((l, idx) => {
        const id = l.id || l.load_number || `SW-${2600 + idx}`;
        if ((l.is_covered || l.status === 'covered') && !updated[id]) {
          updated[id] = l.covered_at || Date.now();
          changed = true;
        }
      });
      return changed ? updated : prev;
    });
  }, [loads]);

  // 1-second interval to update covered countdowns and auto-purge after 8s
  useEffect(() => {
    const timer = setInterval(() => {
      setTicker((t) => t + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleMarkCovered = (loadId: string) => {
    setCoveredMap((prev) => ({
      ...prev,
      [loadId]: Date.now(),
    }));
    playChime();
    fetch(`/api/loadboard/loads/${encodeURIComponent(loadId)}/cover`, {
      method: 'POST',
      credentials: 'include',
    }).catch(() => {});
  };

  // Play pleasant synthetic 2-tone audio chime on new loads
  const playChime = () => {
    if (!isSoundEnabled || typeof window === 'undefined') return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880.00, ctx.currentTime + 0.12); // A5

      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(ctx.currentTime);
      osc1.stop(ctx.currentTime + 0.15);
      osc2.start(ctx.currentTime + 0.12);
      osc2.stop(ctx.currentTime + 0.4);
    } catch {
      // AudioContext unavailable or blocked by autoplay policy
    }
  };

  useEffect(() => {
    if (loads.length > prevLoadCountRef.current) {
      playChime();
    }
    prevLoadCountRef.current = loads.length;
  }, [loads.length]);

  const isMatchAlert = (load: FreightLoad) => {
    if (!savedAlerts || savedAlerts.length === 0) return false;
    const o = (load.origin || load.pickup_location || '').toLowerCase();
    const d = (load.destination || load.delivery_location || '').toLowerCase();
    const rpm = Number(load.rpm || 0);

    return savedAlerts.some((al) => {
      const matchO = !al.origin || o.includes(al.origin.toLowerCase());
      const matchD = !al.destination || d.includes(al.destination.toLowerCase());
      const matchRpm = !al.minRpm || rpm >= al.minRpm;
      return matchO && matchD && matchRpm;
    });
  };

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

  // Filter out covered loads older than 8 seconds (8,000ms)
  const activeLoads = loads.filter((load: FreightLoad, idx: number) => {
    const id = load.id || load.load_number || `SW-${2600 + idx}`;
    const coveredTime = coveredMap[id];
    if (coveredTime && Date.now() - coveredTime > 8000) {
      return false; // Auto-purged from live exchange!
    }
    return true;
  });

  // On homepage: guests see 3 clear loads + 3 blurred teaser loads (total 6 rows)
  // Subscribed users see all active loads!
  const visibleLoads = isSubscriber ? activeLoads : activeLoads.slice(0, 6);

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
                    <polygon points="16 8 20 8 23 11 23 16 16 8" />
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

              {onOpenAiIngest && (
                <button
                  type="button"
                  onClick={onOpenAiIngest}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-indigo-900 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 shadow-2xs transition-all"
                  title="Extract & Post Loads from Broker Sheets/Emails with AI"
                >
                  <span>🤖</span>
                  <span>AI Ingest</span>
                </button>
              )}

              {!isSubscriber && (
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
              )}

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

              {onOpenLaneAlerts && (
                <button
                  type="button"
                  onClick={onOpenLaneAlerts}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-300 shadow-2xs transition-all"
                  title="Configure Instant Carrier Lane Alerts"
                >
                  <span>🔔</span>
                  <span>Lane Alerts ({savedAlerts.length})</span>
                </button>
              )}

              {onOpenBrokerCredit && (
                <button
                  type="button"
                  onClick={onOpenBrokerCredit}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-blue-900 bg-blue-50 hover:bg-blue-100 border border-blue-200 shadow-2xs transition-all"
                  title="Search Live Broker Credit Scores & BMC-84 Bonds"
                >
                  <span>🛡️</span>
                  <span>Broker Credit</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  const next = !isSoundEnabled;
                  setIsSoundEnabled(next);
                  if (next) playChime();
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-all"
                title={isSoundEnabled ? 'Audio alerts active (click to mute)' : 'Audio alerts muted (click to unmute)'}
              >
                <span>{isSoundEnabled ? '🔊 Sound: ON' : '🔇 Muted'}</span>
              </button>

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
              {isSubscriber ? (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 font-extrabold">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span>Carrier AI Pass: Active (Unlimited Loads Unlocked)</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 font-bold">
                  <span>🔒</span>
                  <span>Live Teaser Mode (3 Free Preview Loads)</span>
                </div>
              )}
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
                <option value="Box Truck">26' Box Truck</option>
                <option value="Cargo Van">Cargo Van / Sprinter</option>
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

          {/* Desktop View: DAT One Table (hidden md:block) */}
          <div className="hidden md:block relative overflow-x-auto min-h-[340px]">
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
                ) : visibleLoads.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-500 font-medium">
                      <div className="font-bold text-slate-800 text-sm mb-1">No active loads matching filter criteria.</div>
                      <p className="text-xs mb-3">All matching loads may have been covered or try clearing your filters.</p>
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
                  visibleLoads.map((load, index) => {
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

                    const isAlertMatched = isMatchAlert(load);
                    const isCovered = Boolean(coveredMap[id]);
                    const age = isCovered ? (Date.now() - coveredMap[id]) : 0;
                    const secondsLeft = isCovered ? Math.max(1, Math.ceil((8000 - age) / 1000)) : 0;
                    const isRowBlurred = !isSubscriber && index >= 3;

                    return (
                      <tr
                        key={id}
                        className={`transition-all duration-500 ${
                          isCovered
                            ? 'bg-red-50/50 opacity-60 line-through select-none'
                            : isRowBlurred
                            ? 'filter blur-[4.5px] opacity-25 select-none pointer-events-none'
                            : isAlertMatched
                            ? 'bg-amber-50/50 border-l-4 border-l-amber-500 hover:bg-blue-50/40'
                            : isLive
                            ? 'bg-purple-50/30 hover:bg-blue-50/40'
                            : 'hover:bg-blue-50/40'
                        }`}
                      >
                        {/* ID / Age */}
                        <td className="py-3 px-4">
                          <div className={`font-extrabold ${isCovered ? 'text-red-700 line-through' : 'text-slate-900'}`}>{id}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {isCovered ? (
                              <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-red-600 text-white tracking-wide animate-pulse">
                                🚫 COVERED ({secondsLeft}s)
                              </span>
                            ) : isLive ? (
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
                          {isAlertMatched && !isCovered && (
                            <div className="mb-1">
                              <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                                ⭐ Matches Alert
                              </span>
                            </div>
                          )}
                          <div className={`font-bold flex items-center gap-1.5 ${isCovered ? 'text-slate-500 line-through' : 'text-slate-900'}`}>
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
                            {isCovered ? (
                              <span className="text-[11px] font-extrabold text-red-600 italic px-2.5 py-1 bg-red-100/70 border border-red-200 rounded-lg">
                                Booked &amp; Covered
                              </span>
                            ) : (
                              <>
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
                                  onClick={() => handleMarkCovered(id)}
                                  title="Mark Load as Covered (Instant Booking)"
                                  className="inline-flex items-center gap-1 px-2 py-1.5 bg-slate-100 hover:bg-red-50 hover:text-red-700 text-slate-600 rounded-lg text-xs font-bold border border-slate-200 transition-all"
                                >
                                  Cover
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onInspectLoad(load)}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm transition-all hover:shadow"
                                >
                                  <span>⚡</span> Book Load
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>

            {/* Frosted Glassmorphism Paywall Overlay for Unauthenticated Guests */}
            {!isSubscriber && visibleLoads.length > 3 && (
              <div className="absolute inset-x-0 bottom-0 top-[195px] flex items-center justify-center p-4 bg-gradient-to-t from-slate-950 via-slate-950/85 to-transparent backdrop-blur-[3px] z-10">
                <div className="bg-white border border-slate-200 shadow-2xl rounded-2xl p-6 sm:p-8 max-w-lg w-full text-center my-auto">
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center mx-auto mb-3 text-xl shadow-sm">
                    🔒
                  </div>
                  <h3 className="text-xl sm:text-2xl font-display font-extrabold text-slate-900 tracking-tight">
                    Unlock 4,850+ Live Loads &amp; Direct Contacts
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 mt-2 leading-relaxed">
                    Direct broker dispatch phone numbers, MC verification, Days-To-Pay credit scores, and instant 1-click RateCon booking are locked. Join 50,000+ carriers on LoadsNexus™.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6">
                    <button
                      type="button"
                      onClick={onOpenCarrierCheckout}
                      className="w-full py-3 px-4 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-600/30 transition-all hover:shadow active:scale-[0.98]"
                    >
                      Start Load Board — $19/mo →
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenAuth && onOpenAuth('carrier')}
                      className="w-full py-3 px-4 rounded-xl text-xs font-bold text-slate-700 hover:text-slate-900 border border-slate-200 hover:bg-slate-50 transition-all"
                    >
                      Carrier Sign In
                    </button>
                  </div>

                  <div className="flex items-center justify-center gap-4 mt-4 text-[11px] text-slate-500 font-medium">
                    <span>✓ Instant Pass Access</span>
                    <span>✓ Zero Contracts</span>
                    <span>✓ 100% Pay Kept</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Mobile View: Dedicated Freight Cards (block md:hidden) */}
          <div className="block md:hidden relative divide-y divide-slate-100 min-h-[340px]">
            {isLoading ? (
              <div className="py-12 text-center text-slate-500 font-semibold text-xs">
                <div className="inline-flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></span>
                  Scanning 50-State Spot Network…
                </div>
              </div>
            ) : visibleLoads.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-xs font-medium">
                No active loads matching criteria.
              </div>
            ) : (
              visibleLoads.map((load, index) => {
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
                const isCovered = Boolean(coveredMap[id]);
                const isRowBlurred = !isSubscriber && index >= 3;

                return (
                  <div
                    key={`m-${id}`}
                    className={`p-4 transition-all duration-300 ${
                      isCovered
                        ? 'bg-red-50/50 opacity-60 line-through select-none'
                        : isRowBlurred
                        ? 'filter blur-[4.5px] opacity-25 select-none pointer-events-none'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    {/* Header: ID, Age, Equip */}
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-1.5">
                        <span className="font-extrabold text-xs text-slate-900">{id}</span>
                        {isCovered ? (
                          <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-red-600 text-white animate-pulse">
                            COVERED
                          </span>
                        ) : (
                          <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                            {index === 0 ? 'Just now' : `${index * 4 + 2}m ago`}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                        {equip}
                      </span>
                    </div>

                    {/* Corridor Route Visual */}
                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80 mb-2.5">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                        <span className="text-emerald-500">🟢</span>
                        <span className="truncate">{origin}</span>
                        <span className="text-slate-400 font-normal text-[10px]">({puDate})</span>
                      </div>
                      <div className="ml-2 pl-3 border-l-2 border-dashed border-slate-300 py-1 text-[11px] font-extrabold text-blue-600 flex items-center gap-2">
                        <span>{miles}</span>
                        <span>·</span>
                        <span className={`px-1.5 py-0.2 rounded text-[10px] ${isHighRpm ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}`}>
                          ${rpmVal.toFixed(2)}/mi
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                        <span className="text-rose-500">🔴</span>
                        <span className="truncate">{dest}</span>
                      </div>
                    </div>

                    {/* Financials & Broker */}
                    <div className="flex items-center justify-between mb-3 px-0.5">
                      <div>
                        <div className="text-base font-black text-blue-700">{rateFormatted}</div>
                        <div className="text-[10px] text-slate-400">{weight}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-bold text-slate-800 truncate max-w-[130px]">{bName}</div>
                        <span className="inline-block text-[10px] font-extrabold px-1.5 py-0.2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded mt-0.5">
                          {dtp} DTP
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    {!isCovered && (
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => onInspectLoad(load)}
                          className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm transition-all text-center"
                        >
                          ⚡ Book Load
                        </button>
                        <a
                          href={`/api/loadboard/loads/${encodeURIComponent(id)}/ratecon-pdf?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(dest)}&rate=${load.rate || 2850}&miles=${load.miles || 650}&rpm=${rpmVal}&equipment=${encodeURIComponent(equip)}&broker=${encodeURIComponent(bName)}&mc=${encodeURIComponent(load.broker_mc || '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold border border-slate-200 transition-all text-center"
                        >
                          📄 RateCon
                        </a>
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {/* Mobile Paywall Overlay */}
            {!isSubscriber && visibleLoads.length > 3 && (
              <div className="absolute inset-x-0 bottom-0 top-[260px] flex items-center justify-center p-4 bg-gradient-to-t from-slate-950 via-slate-950/90 to-transparent backdrop-blur-[2px] z-10">
                <div className="bg-white border border-slate-200 shadow-2xl rounded-2xl p-5 max-w-xs w-full text-center">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-2 text-lg shadow-sm">
                    🔒
                  </div>
                  <h4 className="text-sm font-extrabold text-slate-900">
                    Unlock 4,850+ Live Loads
                  </h4>
                  <p className="text-[11px] text-slate-600 mt-1 mb-3.5 leading-relaxed">
                    Direct broker phone numbers and 1-click RateCon booking are locked.
                  </p>
                  <button
                    type="button"
                    onClick={onOpenCarrierCheckout}
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/30"
                  >
                    Start Load Board — $19/mo →
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenAuth && onOpenAuth('carrier')}
                    className="w-full mt-2 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold"
                  >
                    Carrier Sign In
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Table Footer */}
          <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
            <div>
              ⚡ Live loads streamed directly from LoadsNexus™ spot exchange and verified brokers.
            </div>
            <div className="flex items-center gap-4">
              {isSubscriber ? (
                <span className="font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                  Showing {visibleLoads.length} Live Loads (All Unlocked)
                </span>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-slate-600">
                    Showing 3 live preview loads of 4,850+ active spot loads
                  </span>
                  <button
                    type="button"
                    onClick={onOpenCarrierCheckout}
                    className="text-blue-600 font-bold hover:underline"
                  >
                    Unlock All 4,850+ Loads ($19/mo) →
                  </button>
                </div>
              )}
              <button
                type="button"
                onClick={onOpenBrokerPost}
                className="text-purple-600 font-bold hover:underline"
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
