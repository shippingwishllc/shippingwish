import React from 'react';

interface DispatchInquiryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenCarrierCheckout: () => void;
}

export const DispatchInquiryModal: React.FC<DispatchInquiryModalProps> = ({
  isOpen,
  onClose,
  onOpenCarrierCheckout,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-md w-full my-8 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-display font-bold text-slate-900">
              Dedicated Operations Dispatch Desk
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              24/7 Professional Dispatch Partner · All Loads &amp; Negotiations Handled
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

        {/* Body */}
        <div className="p-6">
          <p className="text-xs text-slate-600 leading-relaxed mb-5">
            Carriers with dedicated dispatch desks get full LoadsNexus Load Board access included free.
            Our operations desk negotiates top RPM directly with brokers, handles packets, and plans your reloads.
          </p>

          <div className="p-5 mb-6 rounded-2xl bg-slate-50 border border-slate-200/90 text-center">
            <div className="text-xs font-bold text-slate-700">📞 Contact 24/7 Operations Desk Directly:</div>
            <div className="text-xl font-black text-blue-600 my-1.5">+1 (917) 737-0021</div>
            <div className="text-xs text-slate-500">Email: dispatch@shippingwish.com</div>
          </div>

          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenCarrierCheckout();
            }}
            className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/30 transition-all text-center"
          >
            Or Self-Dispatch for $19/mo →
          </button>
        </div>
      </div>
    </div>
  );
};
