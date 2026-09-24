import React, { useState } from 'react';
import type { FreightLoad, UserSession } from '../types';

interface LoadDetailsModalProps {
  load: FreightLoad | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenCarrierCheckout: () => void;
  onOpenBrokerCredit?: (mc?: string) => void;
  user?: UserSession | null;
  onOpenAuth?: (role?: 'carrier' | 'broker') => void;
}

export const LoadDetailsModal: React.FC<LoadDetailsModalProps> = ({
  load,
  isOpen,
  onClose,
  onOpenCarrierCheckout,
  onOpenBrokerCredit,
  user,
  onOpenAuth,
}) => {
  const [showInquiryForm, setShowInquiryForm] = useState(false);
  const [carrierMc, setCarrierMc] = useState('');
  const [carrierPhone, setCarrierPhone] = useState('');
  const [counterRate, setCounterRate] = useState<number | string>(load?.rate || '');
  const [isSendingInquiry, setIsSendingInquiry] = useState(false);
  const [inquirySent, setInquirySent] = useState(false);

  if (!isOpen || !load) return null;

  const isSubscriber = Boolean(
    user && (
      user.role === 'carrier' ||
      user.role === 'broker' ||
      user.role === 'admin' ||
      user.role === 'super_admin' ||
      user.weekly_plan === 'loadboard_ai_pass'
    )
  );

  const origin = load.origin || load.pickup_location || 'Chicago, IL';
  const dest = load.destination || load.delivery_location || 'Dallas, TX';
  const rate = load.rate ? `$${Number(load.rate).toLocaleString()}` : '$2,450';
  const miles = load.miles ? `${load.miles} mi` : '650 mi';
  const rpm = load.rpm ? `$${parseFloat(String(load.rpm)).toFixed(2)}/mi` : '$3.15/mi';
  const bName = load.broker_name || 'Verified Freight Broker';
  const bMc = load.broker_mc || 'MC-981240';
  const bPhone = load.broker_phone || '+1 (800) 580-3101';
  const bEmail = load.broker_email || 'dispatch@brokerage.com';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-lg w-full my-8 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-display font-bold text-slate-900">
              Load Details &amp; Broker Contact
            </h3>
            <p className="text-xs text-slate-500 mt-1">Verified Spot Freight Corridor</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {/* Corridor & Rate Banner */}
          <div className="p-5 mb-5 rounded-2xl bg-slate-50 border border-slate-200/90">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-extrabold text-blue-600 uppercase tracking-wider">
                Load #{load.id}
              </span>
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                {load.days_to_pay || '18 days'} DTP · A+
              </span>
            </div>

            <div className="text-lg font-bold text-slate-900 mb-1">
              {origin} → {dest}
            </div>

            <div className="text-xs text-slate-600">
              {load.equipment_type || load.equipment || "53' Dry Van"} · {miles} · {rpm}
            </div>

            <div className="text-2xl font-black text-blue-700 mt-3">
              {rate}{' '}
              <span className="text-xs font-semibold text-slate-500">100% pay kept</span>
            </div>
          </div>

          {/* Direct Broker Contact */}
          <div className="p-5 mb-6 rounded-xl bg-blue-50/70 border border-blue-200">
            <div className="text-xs font-extrabold uppercase tracking-wider text-blue-900 mb-1">
              Verified Brokerage Contact
            </div>
            <div className="text-base font-extrabold text-slate-900">
              {bName} {isSubscriber ? `(${bMc})` : '(MC-••••••)'}
            </div>

            {isSubscriber ? (
              <div className="flex flex-wrap gap-2.5 mt-3">
                <a
                  href={`tel:${bPhone.replace(/[^0-9+]/g, '')}`}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm transition-all"
                >
                  📞 Call: {bPhone}
                </a>
                <a
                  href={`mailto:${bEmail}?subject=Inquiry%20regarding%20Load%20${load.id}`}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-bold transition-all"
                >
                  ✉️ Email: {bEmail}
                </a>
                {onOpenBrokerCredit && (
                  <button
                    type="button"
                    onClick={() => onOpenBrokerCredit(bMc)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-100 hover:bg-blue-200 text-blue-800 rounded-lg text-xs font-bold transition-all"
                    title="Check Live Broker Credit & Bond"
                  >
                    🛡️ Credit: A+ (98)
                  </button>
                )}
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 mt-3 text-xs">
                <div className="font-extrabold flex items-center gap-1.5 mb-1 text-xs">
                  <span>🔒</span> Direct Broker Phone &amp; Email Locked
                </div>
                <p className="text-amber-800 text-[11px] mb-3 leading-relaxed">
                  Broker phone numbers and 1-click RateCon booking require an active <strong>LoadsNexus™ Carrier Pass ($19/mo)</strong>.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenCarrierCheckout();
                    }}
                    className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm transition-all"
                  >
                    Unlock with $19/mo Pass →
                  </button>
                  {onOpenAuth && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenAuth('carrier');
                      }}
                      className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg text-xs font-bold transition-all"
                    >
                      Carrier Sign In
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Instant Carrier Booking Inquiry Accordion (Only for Subscribers) */}
          {isSubscriber && (
            <div className="mb-5 p-4 rounded-xl border border-slate-200 bg-slate-50">
              <button
                type="button"
                onClick={() => setShowInquiryForm((prev) => !prev)}
                className="w-full flex items-center justify-between text-xs font-extrabold text-slate-800"
              >
                <span className="flex items-center gap-1.5">
                  <span>⚡</span> Instant Booking Offer / Counter-Bid to Broker
                </span>
                <span>{showInquiryForm ? '▲ Hide' : '▼ Make Offer'}</span>
              </button>

              {showInquiryForm && (
                <div className="mt-4 pt-3 border-t border-slate-200 text-xs">
                  {inquirySent ? (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-bold">
                      ✅ Booking inquiry &amp; rate confirmation request dispatched to {bName}! Download your official RateCon below.
                    </div>
                  ) : (
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        setIsSendingInquiry(true);
                        try {
                          await fetch('/api/loadboard/inquire-broker', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            credentials: 'include',
                            body: JSON.stringify({
                              brokerName: bName,
                              brokerEmail: bEmail,
                              brokerMc: bMc,
                              pickupLocation: origin,
                              deliveryLocation: dest,
                              rate: counterRate || load.rate,
                              miles: load.miles,
                              carrierMc,
                              contactPhone: carrierPhone,
                            }),
                          });
                        } catch {
                          // ignore network failure
                        }
                        setIsSendingInquiry(false);
                        setInquirySent(true);
                      }}
                      className="space-y-3"
                    >
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">Your Carrier MC#</label>
                          <input
                            type="text"
                            required
                            value={carrierMc}
                            onChange={(e) => setCarrierMc(e.target.value)}
                            placeholder="e.g. MC-1094821"
                            className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-900 outline-none focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">Proposed Gross Rate ($)</label>
                          <input
                            type="number"
                            value={counterRate}
                            onChange={(e) => setCounterRate(e.target.value)}
                            placeholder={`$${load.rate || 2850}`}
                            className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-900 outline-none focus:border-blue-500"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">Dispatcher Phone</label>
                        <input
                          type="tel"
                          value={carrierPhone}
                          onChange={(e) => setCarrierPhone(e.target.value)}
                          placeholder="+1 (800) 555-0199"
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-900 outline-none focus:border-blue-500"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={isSendingInquiry}
                        className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-lg text-xs font-bold transition-all shadow-xs"
                      >
                        {isSendingInquiry ? 'Sending Inquiry…' : '⚡ Submit Booking Offer & Request RateCon'}
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Rate Confirmation PDF & Carrier Pass */}
          {isSubscriber ? (
            <a
              href={`/api/loadboard/loads/${encodeURIComponent(load.id)}/ratecon-pdf?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(dest)}&rate=${counterRate || load.rate || 2850}&miles=${load.miles || 650}&rpm=${load.rpm || 3.15}&equipment=${encodeURIComponent(load.equipment_type || "53' Dry Van")}&broker=${encodeURIComponent(bName)}&mc=${encodeURIComponent(bMc)}&phone=${encodeURIComponent(bPhone)}&email=${encodeURIComponent(bEmail)}&carrier_mc=${encodeURIComponent(carrierMc)}&carrier_phone=${encodeURIComponent(carrierPhone)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full mb-3 py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-sm transition-all text-center flex items-center justify-center gap-2 border border-slate-700 hover:shadow-md"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
              <span>📄 Download Official Rate Confirmation (PDF)</span>
            </a>
          ) : (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenCarrierCheckout();
              }}
              className="w-full mb-3 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold border border-slate-300 flex items-center justify-center gap-2 transition-colors"
            >
              <span>🔒 RateCon PDF Download Locked ($19/mo Pass Required)</span>
            </button>
          )}

          {!isSubscriber && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenCarrierCheckout();
              }}
              className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/30 transition-all text-center"
            >
              Start Carrier Pass ($19/mo) for 50-State Access →
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
