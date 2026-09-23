import React, { useState } from 'react';

interface CarrierCheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenAuth: (role?: 'carrier' | 'broker') => void;
  onShowToast: (msg: string) => void;
  onSuccess: () => void;
}

export const CarrierCheckoutModal: React.FC<CarrierCheckoutModalProps> = ({
  isOpen,
  onClose,
  onOpenAuth,
  onShowToast,
  onSuccess,
}) => {
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [mc, setMc] = useState('');
  const [dot, setDot] = useState('');
  const [password, setPassword] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/billing/subscribe-loadboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name,
          company,
          email,
          phone,
          mc_number: mc,
          dot_number: dot,
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data.error || 'Could not initiate checkout. Please try again.');
        setIsSubmitting(false);
        return;
      }

      if (data.url) {
        window.location.href = data.url;
      } else {
        setIsSubmitting(false);
        onClose();
        onShowToast('🎉 Carrier Pro Pass activated ($19/mo)! Unlocked all unmasked broker contacts.');
        onSuccess();
      }
    } catch {
      setErrorMessage('Network error during checkout. Please try again.');
      setIsSubmitting(false);
    }
  };

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
            <h3 className="text-xl font-display font-bold text-slate-900 flex items-center gap-2">
              <span>🔷</span> LoadsNexus™ Carrier Pro Pass
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              $19 / Month · First Day Charged $19 · Zero Free Trial · Cancel Anytime
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
          {/* Price Overview Banner */}
          <div className="p-4 mb-6 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-between">
            <div>
              <div className="text-xs font-black text-blue-900 uppercase tracking-wide">
                Carrier AI Load Board Pass
              </div>
              <div className="text-[11px] text-blue-700 mt-0.5">
                Unlimited 50-State Spot Search · Direct Unmasked Phone &amp; Email Contacts
              </div>
            </div>
            <div className="text-2xl font-black text-blue-700">
              $19<span className="text-xs text-slate-500 font-semibold">/mo</span>
            </div>
          </div>

          {errorMessage && (
            <div className="p-3 mb-5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold">
              {errorMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 text-xs font-bold text-slate-700">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block mb-1">
                  Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. John Miller"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:border-blue-600 outline-none"
                />
              </div>
              <div>
                <label className="block mb-1">
                  Company Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="e.g. Miller Express LLC"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:border-blue-600 outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block mb-1">
                  Business Email <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="john@millerexpress.com"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:border-blue-600 outline-none"
                />
              </div>
              <div>
                <label className="block mb-1">
                  Phone Number <span className="text-rose-500">*</span>
                </label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 (555) 000-0000"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:border-blue-600 outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block mb-1">
                  MC Number <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={mc}
                  onChange={(e) => setMc(e.target.value)}
                  placeholder="MC-XXXXXXX"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:border-blue-600 outline-none"
                />
              </div>
              <div>
                <label className="block mb-1">USDOT Number</label>
                <input
                  type="text"
                  value={dot}
                  onChange={(e) => setDot(e.target.value)}
                  placeholder="DOT-XXXXXX"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:border-blue-600 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block mb-1">
                Account Password <span className="text-rose-500">*</span>
              </label>
              <input
                type="password"
                minLength={6}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Choose a strong password (6+ chars)"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:border-blue-600 outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-xl text-sm font-bold shadow-md shadow-emerald-600/30 transition-all text-center"
            >
              {isSubmitting
                ? 'Connecting to Stripe Checkout ($19/mo)…'
                : 'Activate Carrier Pass — $19 Due Today →'}
            </button>

            <div className="pt-2 text-center text-xs text-slate-500 font-medium">
              Already have an active pass?{' '}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenAuth('carrier');
                }}
                className="text-blue-600 font-bold hover:underline"
              >
                Sign In here
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
