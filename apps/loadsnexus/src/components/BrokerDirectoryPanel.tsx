import React, { useState, useEffect, useCallback } from 'react';
import type { UserSession } from '../types';

interface BrokerRecord {
  id: number;
  company_name: string;
  mc_number?: string | null;
  dot_number?: string | null;
  contact_person?: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  state?: string | null;
  source?: string | null;
  outreach_status?: string | null;
  email_count?: number | null;
  credit_rating?: string | null;
  is_locked?: boolean;
}

interface BrokerStats {
  total_brokers?: number;
  with_email?: number;
  with_phone?: number;
  from_loads?: number;
  from_fmcsa?: number;
  invited_count?: number;
}

interface BrokerDirectoryPanelProps {
  user: UserSession;
  isLight: boolean;
  onOpenBrokerCredit: (mc?: string) => void;
  onOpenCarrierCheckout: () => void;
  showToast: (msg: string) => void;
}

const US_STATES = [
  'ALL', 'TX', 'CA', 'IL', 'GA', 'FL', 'OH', 'PA', 'NJ', 'NC',
  'TN', 'NY', 'MI', 'IN', 'WA', 'AZ', 'CO', 'MO', 'MN', 'WI', 'VA'
];

export const BrokerDirectoryPanel: React.FC<BrokerDirectoryPanelProps> = ({
  user,
  isLight,
  onOpenBrokerCredit,
  onOpenCarrierCheckout,
  showToast,
}) => {
  const [brokers, setBrokers] = useState<BrokerRecord[]>([]);
  const [stats, setStats] = useState<BrokerStats>({});
  const [loading, setLoading] = useState(true);
  const [canManage, setCanManage] = useState(false);
  const [lockedPreview, setLockedPreview] = useState(false);
  const [filteredTotal, setFilteredTotal] = useState(0);
  const [page, setPage] = useState(1);

  // Filters
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('ALL');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [outreachFilter, setOutreachFilter] = useState('all');
  const [hasEmailOnly, setHasEmailOnly] = useState(true);

  // Admin Sync & Outreach state
  const [syncState, setSyncState] = useState('ALL');
  const [syncingLoads, setSyncingLoads] = useState(false);
  const [syncingFmcsa, setSyncingFmcsa] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Outreach Modal state
  const [outreachModalOpen, setOutreachModalOpen] = useState(false);
  const [outreachTargets, setOutreachTargets] = useState<number[]>([]);
  const [outreachTargetLabel, setOutreachTargetLabel] = useState('');
  const [outreachSubject, setOutreachSubject] = useState(
    'Partner with LoadsNexus & Shipping Wish — Free Load Posting + Direct API'
  );
  const [outreachMessage, setOutreachMessage] = useState(
    "We are reaching out from LoadsNexus (loadsnexus.com) & Shipping Wish LLC. We operate an active nationwide network of vetted US carriers (53' Dry Vans, Reefers, Flatbeds, Hotshots & Box Trucks) looking for direct broker freight. We would love to set up a free brokerage posting account on LoadsNexus or connect your API directly."
  );
  const [sendingOutreach, setSendingOutreach] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchBrokers = useCallback(async (targetPage: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(targetPage),
        limit: '50',
        state: stateFilter,
        source: sourceFilter,
        outreach: outreachFilter,
        hasEmail: hasEmailOnly ? '1' : '0',
      });
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());

      const res = await fetch(`/api/brokers?${params.toString()}`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load USA Broker Directory');

      setBrokers(data.brokers || []);
      setStats(data.stats || {});
      setFilteredTotal(Number(data.filtered_total || 0));
      setCanManage(Boolean(data.can_manage));
      setLockedPreview(Boolean(data.locked_preview));
      setSelectedIds([]);
    } catch (err: any) {
      showToast(err?.message || 'Error loading broker directory');
    } finally {
      setLoading(false);
    }
  }, [stateFilter, sourceFilter, outreachFilter, hasEmailOnly, debouncedSearch, showToast]);

  useEffect(() => {
    fetchBrokers(page);
  }, [page, fetchBrokers]);

  const handleSyncFromLoads = async () => {
    setSyncingLoads(true);
    setSyncNotice('');
    try {
      const res = await fetch('/api/brokers/sync-from-loads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ includeTopBrokers: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sync failed');
      setSyncNotice(data.message || 'Synced brokers from live loads!');
      showToast(data.message || 'Brokers synced from live loads!');
      fetchBrokers(1);
      setPage(1);
    } catch (err: any) {
      showToast(err?.message || 'Sync from loads failed');
    } finally {
      setSyncingLoads(false);
    }
  };

  const handleSyncFmcsa = async () => {
    setSyncingFmcsa(true);
    setSyncNotice('');
    try {
      const res = await fetch('/api/brokers/sync-fmcsa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ state: syncState, limit: 500, emailsOnly: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'FMCSA sync failed');
      setSyncNotice(data.message || 'Synced +500 USA brokers from FMCSA!');
      showToast(data.message || 'FMCSA Live Sync complete!');
      fetchBrokers(1);
      setPage(1);
    } catch (err: any) {
      showToast(err?.message || 'FMCSA Live Sync failed');
    } finally {
      setSyncingFmcsa(false);
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 20) {
        showToast('Max 20 brokers per outreach batch to keep inbox deliverability high.');
        return prev;
      }
      return [...prev, id];
    });
  };

  const toggleSelectAllOnPage = (checked: boolean) => {
    if (!checked) {
      setSelectedIds([]);
      return;
    }
    const eligible = brokers
      .filter((b) => b.email && b.email.includes('@') && !b.is_locked)
      .slice(0, 20)
      .map((b) => b.id);
    setSelectedIds(eligible);
  };

  const openInviteModal = (ids: number[], label: string) => {
    if (!ids.length) {
      showToast('Select at least one broker with an email address first.');
      return;
    }
    setOutreachTargets(ids);
    setOutreachTargetLabel(label);
    setOutreachModalOpen(true);
  };

  const handleSendOutreach = async () => {
    if (!outreachTargets.length) return;
    setSendingOutreach(true);
    try {
      const res = await fetch('/api/brokers/send-outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          broker_ids: outreachTargets,
          subject: outreachSubject.trim(),
          message: outreachMessage.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not send invite emails');
      showToast(data.message || 'Partner invite emails sent via LoadsNexus!');
      setOutreachModalOpen(false);
      setSelectedIds([]);
      fetchBrokers(page);
    } catch (err: any) {
      showToast(err?.message || 'Outreach send failed');
    } finally {
      setSendingOutreach(false);
    }
  };

  const cardBg = isLight
    ? 'bg-white border border-slate-200 text-slate-900 shadow-sm'
    : 'bg-slate-900/90 border border-slate-800 text-slate-100';

  const inputCls = isLight
    ? 'bg-white border border-slate-300 text-slate-900 placeholder-slate-400'
    : 'bg-slate-950 border border-slate-700 text-slate-100 placeholder-slate-500';

  const startRow = filteredTotal ? (page - 1) * 50 + 1 : 0;
  const endRow = Math.min(filteredTotal, page * 50);

  return (
    <div className="space-y-5">
      {/* Header & Live Stats Banner */}
      <div className="rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 border border-emerald-500/30 p-5 text-white shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-black tracking-tight">🏛️ LoadsNexus USA Freight Broker Directory</h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-400/40">
                FMCSA Live + Synced Loads
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1">
              {canManage
                ? `Staff Command (${user.role}): Sync active USA brokers from FMCSA & live loads, and send branded LoadsNexus Free-Posting + Direct API partnership invites.`
                : lockedPreview
                ? 'Upgrade to Carrier Pass to unlock direct emails, phones, MC# & USDOT# for all 5,000+ active licensed USA freight brokers.'
                : 'Verified Carrier Subscriber Access: Search all active licensed USA freight brokers, verify MC#/USDOT#, and contact brokers directly.'}
            </p>
          </div>

          {canManage && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={syncingLoads}
                onClick={handleSyncFromLoads}
                className="px-3.5 py-2 rounded-xl text-xs font-extrabold bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white shadow-md transition-all"
              >
                {syncingLoads ? '⏳ Syncing Loads...' : '🔄 Sync From Live Loads'}
              </button>
              <select
                value={syncState}
                onChange={(e) => setSyncState(e.target.value)}
                className="px-2.5 py-2 rounded-xl text-xs font-bold bg-slate-900 border border-slate-600 text-white"
              >
                {US_STATES.map((st) => (
                  <option key={st} value={st}>
                    {st === 'ALL' ? 'All 50 States' : st}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={syncingFmcsa}
                onClick={handleSyncFmcsa}
                className="px-3.5 py-2 rounded-xl text-xs font-extrabold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white shadow-md transition-all"
              >
                {syncingFmcsa ? `⏳ Pulling FMCSA (${syncState})...` : '🏛️ Sync +500 USA Brokers (FMCSA)'}
              </button>
            </div>
          )}
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {[
            { label: 'Total USA Brokers', val: stats.total_brokers || 0, color: 'text-white' },
            { label: 'Verified Emails', val: stats.with_email || 0, color: 'text-emerald-300' },
            { label: 'Direct Phones', val: stats.with_phone || 0, color: 'text-sky-300' },
            { label: 'From Live Loads', val: stats.from_loads || 0, color: 'text-amber-300' },
            { label: 'From FMCSA API', val: stats.from_fmcsa || 0, color: 'text-purple-300' },
            { label: 'API Invites Sent', val: stats.invited_count || 0, color: 'text-teal-300' },
          ].map((k) => (
            <div key={k.label} className="rounded-xl bg-white/5 border border-white/10 px-3 py-2.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{k.label}</div>
              <div className={`text-xl font-black mt-0.5 ${k.color}`}>{Number(k.val).toLocaleString()}</div>
            </div>
          ))}
        </div>

        {syncNotice && (
          <div className="mt-3 px-3.5 py-2 rounded-xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 text-xs font-bold">
            ✅ {syncNotice}
          </div>
        )}
      </div>

      {/* Unpaid Carrier Upgrade Banner */}
      {lockedPreview && (
        <div className="rounded-2xl bg-gradient-to-r from-amber-500/15 via-emerald-500/15 to-blue-500/15 border border-emerald-500/40 p-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-sm font-black text-emerald-700 dark:text-emerald-300">
              🔒 Unlock Full Access to {(stats.total_brokers || 5000).toLocaleString()}+ Verified USA Freight Brokers
            </div>
            <p className="text-xs opacity-80 mt-1">
              Get unmasked direct broker emails, direct phone numbers, MC# / USDOT# credit checks, and unlimited live spot freight with Carrier Pass.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenCarrierCheckout}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-lg"
          >
            🔓 Unlock Full Broker Directory ($19/mo)
          </button>
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <div className={`rounded-2xl p-4 ${cardBg}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 flex-1">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="🔍 Search broker name, MC#, USDOT#, email, phone, city..."
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex-1 min-w-[220px] max-w-md ${inputCls}`}
            />
            <select
              value={stateFilter}
              onChange={(e) => { setStateFilter(e.target.value); setPage(1); }}
              className={`px-3 py-2 rounded-xl text-xs font-bold ${inputCls}`}
            >
              {US_STATES.map((st) => (
                <option key={st} value={st}>
                  {st === 'ALL' ? 'State: All USA' : `State: ${st}`}
                </option>
              ))}
            </select>
            <select
              value={sourceFilter}
              onChange={(e) => { setSourceFilter(e.target.value); setPage(1); }}
              className={`px-3 py-2 rounded-xl text-xs font-bold ${inputCls}`}
            >
              <option value="all">Source: All</option>
              <option value="load_sync">Live Synced Loads</option>
              <option value="fmcsa_census">FMCSA Live Census</option>
              <option value="known_verified">Tier-1 Verified</option>
            </select>
            {canManage && (
              <select
                value={outreachFilter}
                onChange={(e) => { setOutreachFilter(e.target.value); setPage(1); }}
                className={`px-3 py-2 rounded-xl text-xs font-bold ${inputCls}`}
              >
                <option value="all">Outreach: All</option>
                <option value="not_contacted">Not Contacted Yet</option>
                <option value="invited">Invited (Email Sent)</option>
              </select>
            )}
            <label className="inline-flex items-center gap-1.5 text-xs font-bold cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hasEmailOnly}
                onChange={(e) => { setHasEmailOnly(e.target.checked); setPage(1); }}
              />
              Has Email
            </label>
          </div>

          {canManage && (
            <button
              type="button"
              onClick={() =>
                openInviteModal(
                  selectedIds,
                  `${selectedIds.length} selected verified USA brokers (sending via dispatch@loadsnexus.com)`
                )
              }
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold shadow-sm"
            >
              ✉️ Email Selected ({selectedIds.length})
            </button>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto mt-4">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className={`border-b ${isLight ? 'border-slate-200 bg-slate-50 text-slate-500' : 'border-slate-800 bg-slate-950/60 text-slate-400'}`}>
                {canManage && (
                  <th className="py-2.5 px-3 w-8">
                    <input
                      type="checkbox"
                      checked={selectedIds.length > 0 && selectedIds.length === Math.min(20, brokers.filter(b => b.email && b.email.includes('@')).length)}
                      onChange={(e) => toggleSelectAllOnPage(e.target.checked)}
                      title="Select up to 20 brokers on this page"
                    />
                  </th>
                )}
                <th className="py-2.5 px-3 font-extrabold uppercase">Broker Company &amp; Location</th>
                <th className="py-2.5 px-3 font-extrabold uppercase">MC# / USDOT#</th>
                <th className="py-2.5 px-3 font-extrabold uppercase">Officer / Contact</th>
                <th className="py-2.5 px-3 font-extrabold uppercase">Direct Phone &amp; Email</th>
                <th className="py-2.5 px-3 font-extrabold uppercase">Source / Status</th>
                <th className="py-2.5 px-3 font-extrabold uppercase text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={canManage ? 7 : 6} className="py-10 text-center opacity-60 font-semibold">
                    Loading USA Broker Directory...
                  </td>
                </tr>
              ) : brokers.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 7 : 6} className="py-10 text-center opacity-60 font-semibold">
                    No brokers match your current filter.
                  </td>
                </tr>
              ) : (
                brokers.map((b) => {
                  const hasEmail = Boolean(b.email && b.email.includes('@') && !b.is_locked);
                  const loc = [b.city, b.state].filter(Boolean).join(', ');
                  const invited = b.outreach_status === 'invited';
                  return (
                    <tr
                      key={b.id}
                      className={`border-b transition-colors ${
                        isLight ? 'border-slate-100 hover:bg-slate-50' : 'border-slate-800/70 hover:bg-slate-800/40'
                      }`}
                    >
                      {canManage && (
                        <td className="py-3 px-3">
                          <input
                            type="checkbox"
                            disabled={!hasEmail}
                            checked={selectedIds.includes(b.id)}
                            onChange={() => toggleSelect(b.id)}
                          />
                        </td>
                      )}
                      <td className="py-3 px-3">
                        <div className="font-extrabold text-[13px]">{b.company_name}</div>
                        {loc && <div className="text-[11px] opacity-65 mt-0.5">📍 {loc}</div>}
                      </td>
                      <td className="py-3 px-3">
                        <span className="inline-block px-2 py-0.5 rounded-md bg-blue-500/15 text-blue-600 dark:text-blue-300 font-bold text-[11px]">
                          {b.mc_number || 'MC Pending'}
                        </span>
                        {b.dot_number && (
                          <div className="text-[10.5px] opacity-65 mt-0.5">DOT #{b.dot_number}</div>
                        )}
                      </td>
                      <td className="py-3 px-3 font-semibold">
                        👤 {b.contact_person || 'Broker Operations'}
                      </td>
                      <td className="py-3 px-3">
                        {b.phone && (
                          <div className="font-bold">
                            {b.is_locked ? (
                              <span className="opacity-60">🔒 {b.phone}</span>
                            ) : (
                              <a href={`tel:${b.phone}`} className="hover:underline">📞 {b.phone}</a>
                            )}
                          </div>
                        )}
                        {b.email ? (
                          <div className="mt-0.5">
                            {b.is_locked ? (
                              <span className="opacity-60 text-[11px]">🔒 {b.email}</span>
                            ) : (
                              <a href={`mailto:${b.email}`} className="text-emerald-600 dark:text-emerald-400 font-semibold hover:underline">
                                ✉️ {b.email}
                              </a>
                            )}
                          </div>
                        ) : (
                          <span className="opacity-50 text-[11px]">No email on file</span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-black ${
                            b.source === 'load_sync'
                              ? 'bg-blue-500/15 text-blue-600 dark:text-blue-300'
                              : b.source === 'fmcsa_census'
                              ? 'bg-purple-500/15 text-purple-600 dark:text-purple-300'
                              : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
                          }`}
                        >
                          {b.source === 'load_sync'
                            ? 'Live Loads'
                            : b.source === 'fmcsa_census'
                            ? 'FMCSA Live'
                            : 'Verified'}
                        </span>
                        {canManage && (
                          <div className={`text-[10.5px] font-bold mt-1 ${invited ? 'text-emerald-500' : 'opacity-55'}`}>
                            {invited ? `✅ Invited (${b.email_count || 1}x)` : '○ Not Contacted'}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {b.mc_number && (
                            <button
                              type="button"
                              onClick={() => onOpenBrokerCredit(b.mc_number || '')}
                              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border ${
                                isLight
                                  ? 'border-slate-300 hover:bg-slate-100 text-slate-700'
                                  : 'border-slate-700 hover:bg-slate-800 text-slate-200'
                              }`}
                            >
                              🛡️ Credit
                            </button>
                          )}
                          {canManage && hasEmail && (
                            <button
                              type="button"
                              onClick={() =>
                                openInviteModal([b.id], `${b.company_name} (${b.email})`)
                              }
                              className="px-2.5 py-1.5 rounded-lg text-[11px] font-extrabold bg-emerald-600 hover:bg-emerald-500 text-white"
                            >
                              ✉️ Invite / API
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!lockedPreview && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 mt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
            <div className="opacity-70 font-semibold">
              Showing {startRow.toLocaleString()}–{endRow.toLocaleString()} of {filteredTotal.toLocaleString()} matching USA brokers
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className={`px-3 py-1.5 rounded-lg font-bold border disabled:opacity-40 ${
                  isLight ? 'border-slate-300 hover:bg-slate-100' : 'border-slate-700 hover:bg-slate-800'
                }`}
              >
                ← Previous
              </button>
              <span className="font-bold px-2">Page {page}</span>
              <button
                type="button"
                disabled={endRow >= filteredTotal}
                onClick={() => setPage((p) => p + 1)}
                className={`px-3 py-1.5 rounded-lg font-bold border disabled:opacity-40 ${
                  isLight ? 'border-slate-300 hover:bg-slate-100' : 'border-slate-700 hover:bg-slate-800'
                }`}
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Outreach Modal (Staff Only) */}
      {outreachModalOpen && canManage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
          <div className={`w-full max-w-lg rounded-2xl p-6 shadow-2xl ${cardBg}`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-black">✉️ Send LoadsNexus Partner &amp; API Invite</h3>
              <button
                type="button"
                onClick={() => setOutreachModalOpen(false)}
                className="text-xl font-bold opacity-60 hover:opacity-100"
              >
                ×
              </button>
            </div>
            <div className="mb-3 px-3 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-bold">
              Recipient(s): {outreachTargetLabel}
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold mb-1">Email Subject</label>
                <input
                  type="text"
                  value={outreachSubject}
                  onChange={(e) => setOutreachSubject(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl text-xs font-semibold ${inputCls}`}
                />
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">
                  Intro Message (Free Load Posting link + Direct API integration details included automatically)
                </label>
                <textarea
                  rows={4}
                  value={outreachMessage}
                  onChange={(e) => setOutreachMessage(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl text-xs font-semibold ${inputCls}`}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => setOutreachModalOpen(false)}
                className={`px-4 py-2 rounded-xl text-xs font-bold border ${
                  isLight ? 'border-slate-300' : 'border-slate-700'
                }`}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={sendingOutreach}
                onClick={handleSendOutreach}
                className="px-4 py-2 rounded-xl text-xs font-extrabold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white"
              >
                {sendingOutreach ? '⏳ Sending...' : '🚀 Send Branded LoadsNexus Email'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
