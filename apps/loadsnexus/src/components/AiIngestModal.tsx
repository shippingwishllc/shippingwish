import React, { useState } from 'react';

interface AiIngestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (count: number) => void;
  onShowToast: (msg: string) => void;
}

const SAMPLE_BROKER_SHEET = `URGENT SPOT FREIGHT AVAILABLE TODAY:
1. Chicago, IL to Dallas, TX - 53ft Dry Van - 41,500 lbs - $2,650 all in - General Retail Goods
2. Atlanta, GA to Miami, FL - 53ft Reefer - 36,000 lbs - $3,100 all in - Fresh Produce
3. Columbus, OH to Charlotte, NC - 26ft Box Truck - 7,800 lbs - $1,750 all in - E-Commerce Pallets (Liftgate)
4. Houston, TX to Phoenix, AZ - 48ft Flatbed - 44,000 lbs - $3,450 all in - Steel Pipe Bundles
5. Philadelphia, PA to Boston, MA - Sprinter / Cargo Van - 2,200 lbs - $1,150 all in - Medical Supplies
Contact: Summit Freight Logistics LLC (MC-582104) | Phone: (800) 580-3101 | dispatch@summitfreight.com`;

export const AiIngestModal: React.FC<AiIngestModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onShowToast,
}) => {
  const [rawText, setRawText] = useState('');
  const [brokerName, setBrokerName] = useState('Summit Freight Logistics');
  const [brokerMc, setBrokerMc] = useState('MC-582104');
  const [brokerPhone, setBrokerPhone] = useState('+1 (800) 580-3101');
  const [brokerEmail, setBrokerEmail] = useState('dispatch@summitfreight.com');
  const [isParsing, setIsParsing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleLoadSample = () => {
    setRawText(SAMPLE_BROKER_SHEET);
    setErrorMsg('');
  };

  const handleIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawText.trim()) {
      setErrorMsg('Please paste some broker text or click "Load Sample Sheet".');
      return;
    }

    setIsParsing(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/loadboard/ai-ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          rawText,
          brokerName,
          brokerMc,
          brokerPhone,
          brokerEmail,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Failed to extract loads with AI.');
        setIsParsing(false);
        return;
      }

      onSuccess(data.count || 1);
      onShowToast(`🎉 Successfully extracted & published ${data.count} live freight loads via AI!`);
      setIsParsing(false);
      setRawText('');
      onClose();
    } catch {
      setErrorMsg('Network error connecting to AI parser. Please try again.');
      setIsParsing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-2xl w-full my-8 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-blue-900 to-indigo-900 text-white">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">🤖</span>
              <h3 className="text-xl font-display font-bold">
                AI Freight Ingestion Desk
              </h3>
            </div>
            <p className="text-xs text-blue-200 mt-1">
              Extract unstructured broker emails, rate sheets &amp; chats directly into live loads
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full border border-white/20 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleIngest} className="p-6">
          {errorMsg && (
            <div className="p-3 mb-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
              ⚠️ {errorMsg}
            </div>
          )}

          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-bold text-slate-800">
              Paste Raw Broker Email / Load Sheet / Dispatch Text:
            </label>
            <button
              type="button"
              onClick={handleLoadSample}
              className="text-xs font-bold text-blue-600 hover:text-blue-800 underline"
            >
              📋 Load Sample 5-Load Sheet
            </button>
          </div>

          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            rows={7}
            placeholder={`Paste any messy broker email here, e.g.:\nDallas, TX to Atlanta, GA - 26ft Box Truck - 7,500 lbs - $2,100 all in...\nChicago, IL to Miami, FL - 53ft Reefer - 38,000 lbs - $3,400...`}
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 outline-none transition-all leading-relaxed"
          />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Broker Name</label>
              <input
                type="text"
                value={brokerName}
                onChange={(e) => setBrokerName(e.target.value)}
                className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Broker MC#</label>
              <input
                type="text"
                value={brokerMc}
                onChange={(e) => setBrokerMc(e.target.value)}
                className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Phone</label>
              <input
                type="text"
                value={brokerPhone}
                onChange={(e) => setBrokerPhone(e.target.value)}
                className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Email</label>
              <input
                type="text"
                value={brokerEmail}
                onChange={(e) => setBrokerEmail(e.target.value)}
                className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800"
              />
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between gap-3">
            <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
              <span>⚡</span>
              <span>Enforces strict equipment physics (Box Truck &le; 10,000 lbs)</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isParsing}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs shadow-md transition-all flex items-center gap-2"
              >
                {isParsing ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    AI Parsing Freight...
                  </>
                ) : (
                  <>
                    <span>🚀</span> Extract &amp; Publish Loads
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
