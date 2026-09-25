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
  const [successMessage, setSuccessMessage] = useState('');

  // Password reset flow state: 'login' | 'forgot_email' | 'forgot_otp'
  const [mode, setMode] = useState<'login' | 'forgot_email' | 'forgot_otp'>('login');
  const [resetOtp, setResetOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  if (!isOpen) return null;

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');
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

  const handleSendResetOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setErrorMessage('Please enter your account email address.');
      return;
    }
    setErrorMessage('');
    setSuccessMessage('');
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/auth/forgot-password/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data.error || 'Could not send reset code. Please check your email.');
        setIsSubmitting(false);
        return;
      }

      setSuccessMessage('A 6-digit verification code has been sent to your email.');
      setMode('forgot_otp');
      setIsSubmitting(false);
    } catch {
      setErrorMessage('Failed to send reset code. Please check your connection.');
      setIsSubmitting(false);
    }
  };

  const handleVerifyResetOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetOtp.trim()) {
      setErrorMessage('Please enter the 6-digit code from your email.');
      return;
    }
    if (newPassword.length < 8) {
      setErrorMessage('New password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage('Passwords do not match. Please re-enter.');
      return;
    }

    setErrorMessage('');
    setSuccessMessage('');
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/auth/forgot-password/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          otp: resetOtp.trim(),
          new_password: newPassword,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data.error || 'Invalid or expired code. Please request a new one.');
        setIsSubmitting(false);
        return;
      }

      setSuccessMessage('Password reset successfully! You can now sign in with your new password.');
      setPassword(newPassword);
      setMode('login');
      setIsSubmitting(false);
      onShowToast('✅ Password reset successfully! Please sign in.');
    } catch {
      setErrorMessage('Failed to reset password. Please try again.');
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
              {mode === 'login'
                ? 'LoadsNexus™ Sign In'
                : mode === 'forgot_email'
                ? 'Reset Your Password'
                : 'Enter Verification Code'}
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              {mode === 'login'
                ? 'Access your Carrier Load Board or Broker Dispatch Desk'
                : mode === 'forgot_email'
                ? 'We will email a 6-digit code to verify your identity'
                : `Enter the code sent to ${email}`}
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
          {mode === 'login' && (
            /* Role Tabs */
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
          )}

          {errorMessage && (
            <div className="p-3 mb-5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-2">
              <span>⚠️</span>
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3 mb-5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold flex items-center gap-2">
              <span>✓</span>
              <span>{successMessage}</span>
            </div>
          )}

          {/* STEP 1: LOGIN FORM */}
          {mode === 'login' && (
            <form onSubmit={handleLoginSubmit} className="space-y-4 text-xs font-bold text-slate-700">
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
                <div className="flex items-center justify-between mb-1">
                  <label>
                    Password <span className="text-rose-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setErrorMessage('');
                      setSuccessMessage('');
                      setMode('forgot_email');
                    }}
                    className="text-blue-600 hover:text-blue-700 font-bold text-[11px] hover:underline"
                  >
                    Forgot Password?
                  </button>
                </div>
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
          )}

          {/* STEP 2: FORGOT PASSWORD - REQUEST OTP */}
          {mode === 'forgot_email' && (
            <form onSubmit={handleSendResetOtp} className="space-y-4 text-xs font-bold text-slate-700">
              <div>
                <label className="block mb-1">
                  Enter Your Account Email <span className="text-rose-500">*</span>
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

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 px-4 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-600/30 transition-all text-center"
              >
                {isSubmitting ? 'Sending Code…' : 'Send 6-Digit Verification Code →'}
              </button>

              <div className="pt-3 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setErrorMessage('');
                    setMode('login');
                  }}
                  className="text-slate-500 hover:text-slate-800 font-bold text-xs"
                >
                  ← Back to Sign In
                </button>
              </div>
            </form>
          )}

          {/* STEP 3: FORGOT PASSWORD - VERIFY OTP & ENTER NEW PASSWORD */}
          {mode === 'forgot_otp' && (
            <form onSubmit={handleVerifyResetOtp} className="space-y-4 text-xs font-bold text-slate-700">
              <div>
                <label className="block mb-1">
                  6-Digit Email Verification Code <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={resetOtp}
                  onChange={(e) => setResetOtp(e.target.value)}
                  placeholder="e.g. 123456"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-center text-lg font-black tracking-widest text-blue-600 focus:bg-white focus:border-blue-600 outline-none"
                />
              </div>

              <div>
                <label className="block mb-1">
                  New Password (min 8 characters) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:border-blue-600 outline-none"
                />
              </div>

              <div>
                <label className="block mb-1">
                  Confirm New Password <span className="text-rose-500">*</span>
                </label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:border-blue-600 outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 px-4 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-600/30 transition-all text-center"
              >
                {isSubmitting ? 'Resetting Password…' : 'Reset Password & Sign In →'}
              </button>

              <div className="pt-3 flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => setMode('forgot_email')}
                  className="text-blue-600 hover:underline font-bold"
                >
                  Resend Code
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setErrorMessage('');
                    setMode('login');
                  }}
                  className="text-slate-500 hover:text-slate-800 font-bold"
                >
                  Back to Sign In
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
