import React from 'react';
import type { FreightLoad } from '../types';

interface LoadDetailsModalProps {
  load: FreightLoad | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenCarrierCheckout: () => void;
}

export const LoadDetailsModal: React.FC<LoadDetailsModalProps> = ({
  load,
  isOpen,
  onClose,
  onOpenCarrierCheckout,
}) => {
  if (!isOpen || !load) return null;

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
              {bName} ({bMc})
            </div>

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
            </div>
          </div>

          {/* Rate Confirmation PDF & Carrier Pass */}
          <a
            href={`/api/loadboard/loads/${encodeURIComponent(load.id)}/ratecon-pdf?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(dest)}&rate=${load.rate || 2850}&miles=${load.miles || 650}&rpm=${load.rpm || 3.15}&equipment=${encodeURIComponent(load.equipment_type || "53' Dry Van")}&broker=${encodeURIComponent(bName)}&mc=${encodeURIComponent(bMc)}&phone=${encodeURIComponent(bPhone)}&email=${encodeURIComponent(bEmail)}`}
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
        </div>
      </div>
    </div>
  );
};
