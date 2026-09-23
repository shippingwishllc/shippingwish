import React, { useState } from 'react';
import type { UserSession } from '../types';

interface AuthModalProps {
  isOpen: boolean;
  initialRole?: 'carrier' | 'broker';
  onClose: () => void;
  onSuccess: (user: UserSession) => void;
  onOpenCarrierCheckout: () => void;
  onOpenBrokerPost: () => void;
  onShowToast: (msg: string) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  initialRole = 'carrier',
  onClose,
  onSuccess,
  onOpenCarrierCheckout,
  onOpenBrokerPost,
  onShowToast,
}) => {
  const [role, setRole] = useState<'carrier' | 'broker'>(initialRole);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data.error || 'Invalid credentials. Please verify your email and password.');
        setIsSubmitting(false);
        return;
      }

      const user: UserSession = data.user;
      onSuccess(user);
      onShowToast(`Welcome back, ${user.name || 'User'}! Direct broker contacts unlocked.`);
      setIsSubmitting(false);
      onClose();
    } catch {
      setErrorMessage('Network error during sign in. Please try again.');
      setIsSubmitting(false);
    }
  };

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
              LoadsNexus™ Sign In
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Access your Carrier Load Board or Broker Dispatch Desk
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
          {/* Role Tabs */}
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl mb-6">
            <button
              type="button"
              onClick={() => setRole('carrier')}
              className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                role === 'carrier'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>🚚</span> Carrier Portal
            </button>
            <button
              type="button"
              onClick={() => setRole('broker')}
              className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                role === 'broker'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>💼</span> Broker Desk
            </button>
          </div>

          {errorMessage && (
            <div className="p-3 mb-5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold">
              {errorMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 text-xs font-bold text-slate-700">
            <div>
              <label className="block mb-1">
                Account Email <span className="text-rose-500">*</span>
              </label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. user@company.com"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:border-blue-600 outline-none"
              />
            </div>

            <div>
              <label className="block mb-1">
                Password <span className="text-rose-500">*</span>
              </label>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:border-blue-600 outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className={`w-full py-3 px-4 rounded-xl text-xs font-bold text-white shadow-md transition-all text-center ${
                role === 'broker'
                  ? 'bg-purple-600 hover:bg-purple-700 shadow-purple-600/30'
                  : 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/30'
              }`}
            >
              {isSubmitting
                ? 'Verifying Credentials…'
                : role === 'broker'
                ? 'Sign In to Broker Desk →'
                : 'Sign In to Carrier Portal →'}
            </button>

            <div className="pt-4 border-t border-slate-100 text-center text-xs text-slate-500">
              {role === 'carrier' ? (
                <div>
                  Need a Carrier pass?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenCarrierCheckout();
                    }}
                    className="text-blue-600 font-bold hover:underline"
                  >
                    Subscribe for $19/mo →
                  </button>
                </div>
              ) : (
                <div>
                  New Broker?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenBrokerPost();
                    }}
                    className="text-purple-600 font-bold hover:underline"
                  >
                    Post loads 100% Free →
                  </button>
                </div>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
