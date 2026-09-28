import React, { useState, useEffect } from 'react';

interface BrokerScore {
  id: number;
  company_name: string;
  mc_number: string;
  phone?: string;
  email?: string;
  credit_rating: string | null;
  credit_score: number | null;
  days_to_pay: string | null;
  bond_status: string | null;
  double_brokering_risk: string | null;
  fmcsa_status: string | null;
  about?: string | null;
  verdict?: string | null;
}

interface BrokerCreditModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialQuery?: string;
}

function fromCheck(data: Record<string, unknown>): BrokerScore {
  const check = (data.fmcsaCheck || {}) as { verdict?: string };
  return {
    id: Number(data.directoryId) || 0,
    company_name: String(data.companyName || 'Unknown'),
    mc_number: String(data.mcNumber || ''),
    phone: String(data.phone || ''),
    email: String(data.email || ''),
    credit_rating: (data.creditRating as string) || null,
    credit_score: data.creditScore == null ? null : Number(data.creditScore),
    days_to_pay: data.daysToPay == null ? null : `${data.daysToPay} days`,
    bond_status: (data.bondStatus as string) || null,
    double_brokering_risk: data.isBroker ? 'FMCSA lists broker authority' : 'No broker authority listed',
    fmcsa_status: (data.authorityStatus as string) || null,
    about: (data.aboutBroker as string) || (data.entityNote as string) || null,
    verdict: check.verdict || null
  };
}

export const BrokerCreditModal: React.FC<BrokerCreditModalProps> = ({
  isOpen,
  onClose,
  initialQuery = '',
}) => {
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [brokers, setBrokers] = useState<BrokerScore[]>([]);
  const [selectedBroker, setSelectedBroker] = useState<BrokerScore | null>(null);
  const [lookupError, setLookupError] = useState('');
  const [looking, setLooking] = useState(false);

  useEffect(() => {
    if (initialQuery) setSearchQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/loadboard/brokers/scores')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.brokers) setBrokers(data.brokers);
      })
      .catch(() => {});
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && initialQuery) {
      void lookup(initialQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialQuery]);

  async function lookup(raw?: string) {
    const q = String(raw || searchQuery || '').trim();
    if (!q) return;
    setLooking(true);
    setLookupError('');
    try {
      const res = await fetch(`/api/brokers/credit-check/${encodeURIComponent(q)}`, { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setLookupError('Sign in to run an FMCSA check on this MC or USDOT.');
        return;
      }
      if (!res.ok) {
        setLookupError(data.error || 'No FMCSA record found.');
        return;
      }
      const row = fromCheck(data);
      setSelectedBroker(row);
      setBrokers((prev) => [row, ...prev.filter((b) => b.mc_number !== row.mc_number)]);
    } catch {
      setLookupError('Could not reach the FMCSA census. Try again.');
    } finally {
      setLooking(false);
    }
  }

  if (!isOpen) return null;

  const filteredBrokers = brokers.filter((b) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      (b.company_name || '').toLowerCase().includes(q) ||
      (b.mc_number || '').toLowerCase().includes(q)
    );
  });

  const verdictLabel = selectedBroker?.verdict === 'ok'
    ? 'FMCSA authority looks right'
    : selectedBroker?.verdict === 'block'
      ? 'Failed FMCSA check'
      : selectedBroker?.verdict === 'caution'
        ? 'FMCSA check needs a look'
        : (selectedBroker?.fmcsa_status || 'Not checked');
  const verdictGood = selectedBroker?.verdict === 'ok';
  const verdictBad = selectedBroker?.verdict === 'block';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-2xl w-full my-8 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-display font-bold text-slate-900 flex items-center gap-2">
              <span>🛡️</span> Broker FMCSA &amp; payment check
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Looks up FMCSA authority and any bond in the insurance feed. A credit score only shows when a credit data source is connected or this broker has paid us.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="p-6 max-h-[80vh] overflow-y-auto">
          <div className="mb-5 flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void lookup(); }}
                placeholder="Enter MC# or USDOT (e.g. MC-159021)"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:border-blue-600 outline-none"
              />
              <span className="absolute left-3.5 top-2.5 text-slate-400 text-sm">🔍</span>
            </div>
            <button
              type="button"
              onClick={() => void lookup()}
              disabled={looking}
              className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 disabled:opacity-60"
            >
              {looking ? 'Checking…' : 'Check FMCSA'}
            </button>
          </div>
          {lookupError && <div className="mb-4 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{lookupError}</div>}

          {selectedBroker && (
            <div className="p-5 mb-6 rounded-2xl bg-gradient-to-br from-slate-900 to-blue-950 text-white shadow-md">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div>
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-blue-400">
                    Inspected brokerage
                  </span>
                  <h4 className="text-lg font-bold">{selectedBroker.company_name}</h4>
                  <div className="text-xs text-slate-300">{selectedBroker.mc_number}{selectedBroker.fmcsa_status ? ` · ${selectedBroker.fmcsa_status}` : ''}</div>
                </div>
                <div className="text-right">
                  <div className={`inline-block px-3 py-1 rounded-xl border font-extrabold text-sm ${verdictBad ? 'bg-red-500/20 border-red-400/40 text-red-200' : verdictGood ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300' : 'bg-amber-500/20 border-amber-400/40 text-amber-200'}`}>
                    {verdictLabel}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    {selectedBroker.credit_score != null
                      ? `Credit ${selectedBroker.credit_score}/100 (${selectedBroker.credit_rating || 'rated'})`
                      : 'No credit score on file'}
                  </div>
                </div>
              </div>
              {selectedBroker.about && <p className="text-xs text-slate-300 mb-3">{selectedBroker.about}</p>}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-800 text-xs">
                <div>
                  <span className="text-slate-400 text-[10px] uppercase font-bold block">Days to pay</span>
                  <strong className="text-emerald-400 font-extrabold text-sm">{selectedBroker.days_to_pay || 'Unknown'}</strong>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] uppercase font-bold block">BMC-84/85 bond</span>
                  <strong className="text-blue-300 font-semibold text-[11px] block truncate">{selectedBroker.bond_status || 'Not confirmed'}</strong>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] uppercase font-bold block">Broker authority</span>
                  <strong className="text-emerald-400 font-bold text-xs">{selectedBroker.double_brokering_risk || 'Not listed'}</strong>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] uppercase font-bold block">Phone</span>
                  <strong className="text-slate-200 font-semibold text-xs">{selectedBroker.phone || 'Not listed'}</strong>
                </div>
              </div>
            </div>
          )}

          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs font-bold text-slate-700">
              <span>Saved broker directory</span>
              <span className="text-slate-400 font-normal">{filteredBrokers.length} saved</span>
            </div>
            <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto">
              {filteredBrokers.length === 0 ? (
                <div className="p-4 text-xs text-slate-500">No brokers saved yet. Enter an MC or USDOT and press Check FMCSA.</div>
              ) : filteredBrokers.map((b) => (
                <div
                  key={`${b.id}-${b.mc_number}`}
                  onClick={() => setSelectedBroker(b)}
                  className={`p-3.5 flex items-center justify-between text-xs cursor-pointer transition-colors ${
                    selectedBroker?.mc_number === b.mc_number ? 'bg-blue-50/70 border-l-4 border-l-blue-600' : 'hover:bg-slate-50'
                  }`}
                >
                  <div>
                    <div className="font-bold text-slate-900">{b.company_name}</div>
                    <div className="text-[11px] text-slate-500">{b.mc_number || 'MC not listed'}{b.days_to_pay ? ` · DTP: ${b.days_to_pay}` : ''}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 font-bold text-[11px]">
                      {b.credit_rating || (b.credit_score != null ? String(b.credit_score) : 'Unrated')}
                    </span>
                    <button
                      type="button"
                      className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:border-blue-400 text-slate-700 font-semibold text-[11px] shadow-2xs"
                    >
                      Inspect
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
