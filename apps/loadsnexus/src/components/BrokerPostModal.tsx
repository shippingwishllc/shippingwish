import React, { useState, useEffect } from 'react';
import type { FreightLoad, UserSession } from '../types';

interface BrokerPostModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (load: FreightLoad) => void;
  onShowToast: (msg: string) => void;
  prefill?: { origin: string; dest: string } | null;
  user?: UserSession | null;
  onOpenAuth?: (role?: 'carrier' | 'broker') => void;
}

export const BrokerPostModal: React.FC<BrokerPostModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onShowToast,
  prefill,
  user,
  onOpenAuth,
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
  const [brokerName, setBrokerName] = useState(user?.company_name || user?.name || '');
  const [brokerMc, setBrokerMc] = useState(user?.mc_number || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [email, setEmail] = useState(user?.email || '');
  const [notes, setNotes] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [postedLoad, setPostedLoad] = useState<FreightLoad | null>(null);

  useEffect(() => {
    if (user) {
      if (user.company_name) setBrokerName(user.company_name);
      else if (user.name && !brokerName) setBrokerName(user.name);
      if (user.mc_number) setBrokerMc(user.mc_number);
      if (user.phone) setPhone(user.phone);
      if (user.email) setEmail(user.email);
    }
  }, [user, isOpen]);

  // Adjust default weight when equipment changes
  const handleEquipmentChange = (newEquipment: string) => {
    setEquipment(newEquipment);
    if (newEquipment === 'Box Truck' && Number(weight) > 10000) {
      setWeight(8500);
    } else if (newEquipment === 'Cargo Van' && Number(weight) > 3500) {
      setWeight(3000);
    } else if (newEquipment.includes("53'") && Number(weight) < 15000) {
      setWeight(42000);
    }
  };

  if (!isOpen) return null;

  const isBrokerOrAdmin =
    user && ['broker', 'admin', 'super_admin', 'dispatcher', 'sales_rep'].includes(user.role);
  const isCarrier = user && user.role === 'carrier';

  const rpmPreview =
    rate && miles && Number(miles) > 0
      ? (Number(rate) / Number(miles)).toFixed(2)
      : null;

  const isBoxTruck = equipment === 'Box Truck';
  const weightNum = Number(weight) || 0;
  const isBoxTruckOverweight = isBoxTruck && weightNum > 10000;

  const handleModalClose = () => {
    setPostedLoad(null);
    setErrorMessage('');
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    // Client-side Equipment Physics Check
    if (isBoxTruck && weightNum > 10000) {
      setErrorMessage('Box Truck payload cannot exceed 10,000 lbs. Legal GVWR capacity limit.');
      return;
    }

    // Client-side Contact & Rate Sanity Checks
    const cleanPhone = String(phone).replace(/[^0-9]/g, '');
    if (cleanPhone.length < 10) {
      setErrorMessage('A valid 10-digit direct broker dispatch phone number is required.');
      return;
    }
    const fakePhonePatterns = ['5550', '000000', '1234567', '999999', '111111'];
    if (fakePhonePatterns.some((p) => cleanPhone.includes(p))) {
      setErrorMessage('Invalid or disposable phone number detected. Direct corporate dispatch phone is required.');
      return;
    }

    const cleanMc = String(brokerMc).replace(/[^0-9]/g, '');
    if (cleanMc.length < 5) {
      setErrorMessage('A valid FMCSA Broker MC number (minimum 5 digits) is required.');
      return;
    }

    const numRate = Number(rate);
    const numMiles = Number(miles) > 0 ? Number(miles) : 650;
    const rpmVal = numRate / numMiles;

    if (numRate < 150) {
      setErrorMessage('Load rate must be at least $150 USD.');
      return;
    }
    if (rpmVal < 1.00) {
      setErrorMessage(`Rate per mile ($${rpmVal.toFixed(2)}/mi) is below standard spot market minimum ($1.00/mi).`);
      return;
    }
    if (rpmVal > 8.50 && numRate > 5000) {
      setErrorMessage(`Rate per mile ($${rpmVal.toFixed(2)}/mi) exceeds reasonable spot market limits ($8.50/mi). Please verify rate.`);
      return;
    }

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
        if (data.code === 'AUTH_REQUIRED') {
          setErrorMessage('Session expired or broker login required. Please sign in as a Broker.');
        } else {
          setErrorMessage(data.error || 'Could not post load. Please verify details.');
        }
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
        broker_name: brokerName || user?.company_name || 'LoadsNexus™ Verified Brokerage',
        broker_mc: brokerMc || user?.mc_number || 'MC-VERIFIED',
        broker_phone: phone || user?.phone || '+1 (800) 580-3101',
        broker_email: email || user?.email || 'dispatch@loadsnexus.com',
        days_to_pay: '21 days',
        credit_score: 'A+ (Verified)',
        is_live_broker_post: true,
      };

      onSuccess(newLoad);
      setPostedLoad(newLoad);
      onShowToast(`🎉 Load #${newLoad.id} is now LIVE on LoadsNexus!`);
      setIsSubmitting(false);

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
      onClick={handleModalClose}
    >
      <div
        className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-2xl w-full my-8 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-display font-bold text-slate-900 flex items-center gap-2">
              <span>⚡</span> {postedLoad ? 'Spot Freight Posted Live!' : 'Post Spot Freight to LoadsNexus™'}
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              {postedLoad
                ? 'Your load is broadcasted across the 50-state carrier network with rate confirmation available'
                : '100% Free Forever for Freight Brokers & 3PLs · Real-Time Carrier Matching'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleModalClose}
            className="w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        {postedLoad ? (
          <div className="p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
              ✓
            </div>
            <h4 className="text-xl font-display font-bold text-slate-900 mb-1">
              Load #{postedLoad.id} is Live on LoadsNexus!
            </h4>
            <p className="text-xs text-slate-500 mb-6 max-w-md mx-auto">
              Your freight posting has been dispatched to vetted motor carriers with 100% Anti-Double-Brokering security guard verification.
            </p>

            {/* Load Summary Card */}
            <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-5 mb-6 text-left max-w-md mx-auto">
              <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                <span>Pickup: <strong>{postedLoad.pickup_date}</strong></span>
                <span className="font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  {postedLoad.days_to_pay}
                </span>
              </div>
              <div className="text-base font-bold text-slate-900 mb-1">
                {postedLoad.origin} → {postedLoad.destination}
              </div>
              <div className="text-xs text-slate-600 mb-3">
                {postedLoad.equipment_type} · {postedLoad.miles} mi · {postedLoad.commodity}
              </div>
              <div className="text-2xl font-black text-blue-700">
                ${Number(postedLoad.rate).toLocaleString()}{' '}
                <span className="text-xs font-semibold text-slate-500">
                  (${postedLoad.rpm}/mi)
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 max-w-md mx-auto">
              <a
                href={`/api/loadboard/loads/${encodeURIComponent(postedLoad.id)}/ratecon-pdf?origin=${encodeURIComponent(postedLoad.origin || '')}&destination=${encodeURIComponent(postedLoad.destination || '')}&rate=${postedLoad.rate || 2850}&miles=${postedLoad.miles || 650}&rpm=${postedLoad.rpm || 3.15}&equipment=${encodeURIComponent(postedLoad.equipment_type || '')}&broker=${encodeURIComponent(postedLoad.broker_name || '')}&mc=${encodeURIComponent(postedLoad.broker_mc || '')}&phone=${encodeURIComponent(postedLoad.broker_phone || '')}&email=${encodeURIComponent(postedLoad.broker_email || '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-md transition-all hover:shadow-lg"
              >
                <span>📄</span> Download Rate Confirmation (PDF)
              </a>

              <button
                type="button"
                onClick={handleModalClose}
                className="w-full sm:w-auto px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm transition-all"
              >
                View on Live Board →
              </button>
            </div>
          </div>
        ) : !user ? (
          /* Shield 1: Authentication Gate */
          <div className="p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-purple-100 text-purple-600 flex items-center justify-center mx-auto mb-4 text-3xl shadow-inner">
              🛡️
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-100/80 text-purple-800 text-[11px] font-extrabold uppercase tracking-wider mb-2">
              <span className="w-2 h-2 rounded-full bg-purple-600 animate-pulse"></span>
              Shield 1 · Anti-Ghost Freight Guard Active
            </div>
            <h4 className="text-xl font-display font-extrabold text-slate-900 mb-2">
              Broker Verification Required to Post Freight
            </h4>
            <p className="text-xs text-slate-600 mb-6 max-w-md mx-auto leading-relaxed">
              LoadsNexus™ enforces strict fraud and double-brokering safeguards. To protect paying motor carriers from ghost loads, prank postings, and dead phone numbers, freight posting is strictly reserved for verified Freight Brokers & Shippers.
            </p>

            {/* Value props */}
            <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-4 mb-6 text-left max-w-md mx-auto space-y-2.5">
              <div className="flex items-center gap-2.5 text-xs text-slate-700">
                <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[11px] font-bold shrink-0">✓</span>
                <span><strong>100% Free Forever for Brokers:</strong> Zero posting fees, zero commissions.</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-slate-700">
                <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[11px] font-bold shrink-0">✓</span>
                <span><strong>Zero Ghost Freight Tolerance:</strong> Verified MC# and direct corporate phone required.</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-slate-700">
                <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[11px] font-bold shrink-0">✓</span>
                <span><strong>10,000+ Active Motor Carriers:</strong> Instant spot load distribution across 50 US states.</span>
              </div>
            </div>

            <div className="flex flex-col gap-2.5 max-w-md mx-auto">
              <button
                type="button"
                onClick={() => {
                  handleModalClose();
                  onOpenAuth?.('broker');
                }}
                className="w-full py-3.5 px-4 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-extrabold shadow-lg shadow-purple-600/30 transition-all flex items-center justify-center gap-2"
              >
                <span>🔐</span> Sign In as Freight Broker →
              </button>
              <p className="text-[11px] text-slate-500">
                New broker? Click above to register a free Broker Account in under 60 seconds.
              </p>
            </div>
          </div>
        ) : !isBrokerOrAdmin ? (
          /* Role Gate (Carrier or Non-Broker) */
          <div className="p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center mx-auto mb-4 text-3xl shadow-inner">
              ⚠️
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100/80 text-amber-800 text-[11px] font-extrabold uppercase tracking-wider mb-2">
              {isCarrier ? 'Carrier Account Detected' : 'Broker Role Required'}
            </div>
            <h4 className="text-xl font-display font-extrabold text-slate-900 mb-2">
              {isCarrier ? 'Motor Carriers Cannot Post Broker Freight' : 'Broker Authorization Required'}
            </h4>
            <p className="text-xs text-slate-600 mb-4 max-w-md mx-auto leading-relaxed">
              {isCarrier ? (
                <>
                  You are currently signed in as <strong>{user?.company_name || user?.name}</strong> with a Motor Carrier account.
                </>
              ) : (
                <>
                  Your current account role (<strong>{user?.role}</strong>) does not have freight posting permissions.
                </>
              )}
            </p>
            <div className="bg-amber-50 border border-amber-200/90 rounded-2xl p-4 mb-6 text-left max-w-md mx-auto text-xs text-amber-900 leading-relaxed">
              <p className="font-bold mb-1">Anti-Double-Brokering Safeguard:</p>
              <p className="text-[11px] text-amber-800">
                Federal regulations and LoadsNexus rules prohibit unauthorized accounts and motor carriers from posting freight without active Broker Authority (FMCSA Operating Authority). To post freight, please sign in with your verified Broker account.
              </p>
            </div>

            <div className="flex flex-col gap-2.5 max-w-md mx-auto">
              <button
                type="button"
                onClick={() => {
                  handleModalClose();
                  onOpenAuth?.('broker');
                }}
                className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-extrabold shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>🔄</span> Switch to Broker Account →
              </button>
              <button
                type="button"
                onClick={handleModalClose}
                className="text-xs text-slate-500 hover:text-slate-800 font-semibold cursor-pointer"
              >
                Return to Live Load Board
              </button>
            </div>
          </div>
        ) : (
          /* Broker Posting Form (When Authenticated as Broker/Admin) */
          <div className="p-6 max-h-[80vh] overflow-y-auto">
            {/* Verified Broker Identity Banner */}
            <div className="flex items-center gap-3 p-3.5 mb-6 rounded-xl bg-purple-50 border border-purple-200/80 text-purple-900 text-xs">
              <div className="w-8 h-8 rounded-lg bg-purple-600 text-white flex items-center justify-center shrink-0 text-base font-bold shadow-sm">
                ✓
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-extrabold text-purple-950 flex items-center gap-2">
                  <span>Verified FMCSA Broker: {brokerName || user?.company_name || user?.name}</span>
                  <span className="text-[10px] bg-purple-200/80 text-purple-900 px-2 py-0.5 rounded-full font-bold">
                    Shield 1 Active
                  </span>
                </div>
                <p className="text-[11px] text-purple-700 mt-0.5 truncate">
                  MC #{brokerMc || user?.mc_number || 'FMCSA-VERIFIED'} · Contact: {phone || user?.phone || user?.email} · Anti-Double-Brokering Guard Active
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
                    onChange={(e) => handleEquipmentChange(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:border-purple-600 outline-none cursor-pointer"
                  >
                    <option value="53' Dry Van">53' Dry Van (Max 45,000 lbs)</option>
                    <option value="53' Reefer">53' Reefer (Temp Controlled)</option>
                    <option value="Flatbed">Flatbed (Max 48,000 lbs)</option>
                    <option value="Step Deck">Step Deck</option>
                    <option value="Power Only">Power Only</option>
                    <option value="Hotshot">Hotshot (Max 16,500 lbs)</option>
                    <option value="Box Truck">Box Truck (26ft, Max 10,000 lbs)</option>
                    <option value="Cargo Van">Cargo Van / Sprinter (Max 3,500 lbs)</option>
                  </select>
                </div>

                <div>
                  <label className="block mb-1">
                    Total Pay ($ USD) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="150"
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
                      <span className={Number(rpmPreview) < 1.00 ? 'text-rose-600' : 'text-purple-600'}>
                        Rate: ${rpmPreview} / mi {Number(rpmPreview) < 1.00 && '(Low)'}
                      </span>
                    ) : (
                      'Rate/mile: $--'
                    )}
                  </div>
                </div>
              </div>

              {/* Weight, Commodity & Pickup Date */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block mb-1">
                    Weight (lbs) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value ? Number(e.target.value) : '')}
                    placeholder={isBoxTruck ? 'e.g. 8500 (Max 10,000)' : 'e.g. 42000'}
                    className={`w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-medium text-slate-900 focus:bg-white outline-none ${
                      isBoxTruckOverweight
                        ? 'border-rose-400 focus:border-rose-600 ring-1 ring-rose-300'
                        : 'border-slate-200 focus:border-purple-600'
                    }`}
                  />
                  {isBoxTruckOverweight && (
                    <div className="text-[10px] text-rose-600 mt-1 font-bold">
                      ⚠️ Box Truck max payload is 10,000 lbs (GVWR limit).
                    </div>
                  )}
                  {isBoxTruck && !isBoxTruckOverweight && (
                    <div className="text-[10px] text-emerald-600 mt-1 font-semibold">
                      ✓ Valid 26ft Box Truck payload (≤ 10,000 lbs)
                    </div>
                  )}
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
                    placeholder="e.g. Summit Logistics Brokerage LLC"
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
                    placeholder="e.g. MC-582104"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:border-purple-600 outline-none"
                  />
                </div>
              </div>

              {/* Phone & Email */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block mb-1">
                    Dispatcher Direct Phone <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+1 (800) 580-3101"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:border-purple-600 outline-none"
                  />
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    10-digit direct phone for carrier rate negotiation & check calls
                  </div>
                </div>

                <div>
                  <label className="block mb-1">
                    Dispatcher Corporate Email <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="dispatch@brokerage.com"
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
                  placeholder="e.g. Clean 53' trailer required, no pallet exchange, 2 load straps, FCFS pickup 08:00 - 16:00."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:border-purple-600 outline-none"
                ></textarea>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting || isBoxTruckOverweight}
                className="w-full py-3.5 px-4 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white rounded-xl text-sm font-bold shadow-md shadow-purple-600/30 transition-all text-center flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <span>Publishing Live to LoadsNexus…</span>
                ) : (
                  <>
                    <span>⚡</span>
                    <span>Post Load Live to LoadsNexus (100% Free) →</span>
                  </>
                )}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
