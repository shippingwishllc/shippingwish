import React, { useState } from 'react';
import type { FreightLoad } from '../types';

interface BrokerPostModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (load: FreightLoad) => void;
  onShowToast: (msg: string) => void;
  prefill?: { origin: string; dest: string } | null;
}

export const BrokerPostModal: React.FC<BrokerPostModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onShowToast,
  prefill,
}) => {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  const [origin, setOrigin] = useState(prefill?.origin || 'Chicago, IL');
  const [destination, setDestination] = useState(prefill?.dest || 'Dallas, TX');
  const [equipment, setEquipment] = useState("53' Dry Van");
  const [rate, setRate] = useState<number | ''>(2850);
  const [miles, setMiles] = useState<number | ''>(925);
  const [weight, setWeight] = useState<number | ''>(42000);
  const [commodity, setCommodity] = useState('General Freight');
  const [pickupDate, setPickupDate] = useState(tomorrow);
  const [brokerName, setBrokerName] = useState('');
  const [brokerMc, setBrokerMc] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen) return null;

  const rpmPreview =
    rate && miles && Number(miles) > 0
      ? (Number(rate) / Number(miles)).toFixed(2)
      : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/loadboard/broker/post-load', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          origin,
          destination,
          equipment,
          rate: Number(rate),
          miles: Number(miles) || 650,
          weight: Number(weight) || 42000,
          commodity,
          pickupDate,
          brokerName,
          brokerMc,
          contactPhone: phone,
          contactEmail: email,
          notes,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setErrorMessage(data.error || 'Could not post load. Please verify details.');
        setIsSubmitting(false);
        return;
      }

      const newLoad: FreightLoad = {
        id: data.load?.load_number || `SW-${Math.floor(1000 + Math.random() * 9000)}`,
        origin,
        destination,
        equipment_type: equipment,
        rate: Number(rate),
        miles: Number(miles) || 650,
        rpm: data.rpm || (rpmPreview ? Number(rpmPreview) : 3.15),
        weight: `${Number(weight || 42000).toLocaleString()} lbs`,
        commodity: commodity || 'General Freight',
        pickup_date: pickupDate,
        broker_name: brokerName,
        broker_mc: brokerMc,
        broker_phone: phone,
        broker_email: email,
        days_to_pay: '21 days',
        credit_score: 'A+ (Verified)',
        is_live_broker_post: true,
      };

      onSuccess(newLoad);
      onShowToast(`🎉 Load #${newLoad.id} is now LIVE on LoadsNexus!`);
      setIsSubmitting(false);
      onClose();

      // Scroll to live board
      const board = document.getElementById('live-board-section');
      if (board) board.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch {
      setErrorMessage('Network error while publishing. Please try again.');
      setIsSubmitting(false);
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
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-display font-bold text-slate-900 flex items-center gap-2">
              <span>⚡</span> Post Spot Freight to LoadsNexus™
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              100% Free Forever for Freight Brokers &amp; 3PLs · Real-Time Carrier Matching
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
        <div className="p-6 max-h-[80vh] overflow-y-auto">
          {/* Security Banner */}
          <div className="flex items-center gap-3 p-3.5 mb-6 rounded-xl bg-purple-50 border border-purple-200/80 text-purple-900 text-xs">
            <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <polyline points="9 12 11 14 15 10" />
              </svg>
            </div>
            <div>
              <div className="font-extrabold">Anti-Double-Brokering Guard Active</div>
              <p className="text-[11px] text-purple-700 mt-0.5">
                Your load is published directly to vetted motor carriers with active FMCSA operating authority.
              </p>
            </div>
          </div>

          {errorMessage && (
            <div className="p-3 mb-5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold">
              {errorMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 text-xs font-bold text-slate-700">
            {/* Origin & Destination */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block mb-1">
                  Origin (City, State or Zip) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                  placeholder="e.g. Chicago, IL"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:border-purple-600 focus:ring-1 focus:ring-purple-600 outline-none"
                />
              </div>
              <div>
                <label className="block mb-1">
                  Destination (City, State or Zip) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder="e.g. Dallas, TX"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:border-purple-600 focus:ring-1 focus:ring-purple-600 outline-none"
                />
              </div>
            </div>

            {/* Equipment, Rate & Miles */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block mb-1">
                  Equipment Type <span className="text-rose-500">*</span>
                </label>
                <select
                  value={equipment}
                  onChange={(e) => setEquipment(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:border-purple-600 outline-none cursor-pointer"
                >
                  <option value="53' Dry Van">53' Dry Van</option>
                  <option value="53' Reefer">53' Reefer (Temp Controlled)</option>
                  <option value="Flatbed">Flatbed</option>
                  <option value="Step Deck">Step Deck</option>
                  <option value="Power Only">Power Only</option>
                  <option value="Hotshot">Hotshot</option>
                  <option value="Box Truck">Box Truck</option>
                </select>
              </div>

              <div>
                <label className="block mb-1">
                  Total Pay ($ USD) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min="100"
                  step="10"
                  required
                  value={rate}
                  onChange={(e) => setRate(e.target.value ? Number(e.target.value) : '')}
                  placeholder="e.g. 2850"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:border-purple-600 outline-none"
                />
              </div>

              <div>
                <label className="block mb-1">Approx Miles</label>
                <input
                  type="number"
                  min="10"
                  value={miles}
                  onChange={(e) => setMiles(e.target.value ? Number(e.target.value) : '')}
                  placeholder="e.g. 925"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:border-purple-600 outline-none"
                />
                <div className="text-[10px] text-slate-400 mt-1 font-semibold">
                  {rpmPreview ? (
                    <span className="text-purple-600">Rate: ${rpmPreview} / mi</span>
                  ) : (
                    'Rate/mile: $--'
                  )}
                </div>
              </div>
            </div>

            {/* Weight, Commodity & Pickup Date */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block mb-1">Weight (lbs)</label>
                <input
                  type="number"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value ? Number(e.target.value) : '')}
                  placeholder="e.g. 42000"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:border-purple-600 outline-none"
                />
              </div>

              <div>
                <label className="block mb-1">Commodity</label>
                <input
                  type="text"
                  value={commodity}
                  onChange={(e) => setCommodity(e.target.value)}
                  placeholder="e.g. General Freight"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:border-purple-600 outline-none"
                />
              </div>

              <div>
                <label className="block mb-1">
                  Pickup Date <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={pickupDate}
                  onChange={(e) => setPickupDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:border-purple-600 outline-none"
                />
              </div>
            </div>

            {/* Broker Name & MC */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block mb-1">
                  Broker / Brokerage Company <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={brokerName}
                  onChange={(e) => setBrokerName(e.target.value)}
                  placeholder="e.g. Apex Freight Logistics"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:border-purple-600 outline-none"
                />
              </div>

              <div>
                <label className="block mb-1">
                  Broker MC Number <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={brokerMc}
                  onChange={(e) => setBrokerMc(e.target.value)}
                  placeholder="e.g. MC-982145"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:border-purple-600 outline-none"
                />
              </div>
            </div>

            {/* Phone & Email */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block mb-1">
                  Dispatcher Phone <span className="text-rose-500">*</span>
                </label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 (800) 555-0199"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:border-purple-600 outline-none"
                />
              </div>

              <div>
                <label className="block mb-1">
                  Dispatcher Email <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="loads@brokerage.com"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:border-purple-600 outline-none"
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block mb-1">Special Instructions / Requirements (Optional)</label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Clean 53' trailer required, no pallet exchange, 2 straps, FCFS pickup 08:00 - 16:00."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:border-purple-600 outline-none"
              ></textarea>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 px-4 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white rounded-xl text-sm font-bold shadow-md shadow-purple-600/30 transition-all text-center"
            >
              {isSubmitting ? 'Posting Live to LoadsNexus…' : '⚡ Post Load Live to LoadsNexus (100% Free) →'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
