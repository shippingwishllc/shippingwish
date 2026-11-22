import React, { useState } from 'react';
import type { UserSession } from '../types';

interface FmcsaLookupResult {
  verified: boolean;
  is_broker: boolean;
  usdot_active: boolean;
  mc_number: string;
  dot_number: string;
  legal_name: string;
  dba_name: string;
  address: string;
  city_state: string;
  phone: string;
  email?: string | null;
  expected_email_domain?: string | null;
  authority_status: string;
}

interface BrokerRegisterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: UserSession) => void;
  onShowToast: (msg: string) => void;
}

const FREE_DOMAINS = new Set(['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com']);

export const BrokerRegisterModal: React.FC<BrokerRegisterModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onShowToast,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [mcInput, setMcInput] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const [fmcsa, setFmcsa] = useState<FmcsaLookupResult | null>(null);
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpNotice, setOtpNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleVerifyFmcsa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mcInput.trim()) return setError('Enter your MC# or USDOT# first.');
    setError('');
    setLookingUp(true);
    try {
      const res = await fetch(`/api/v1/brokers/verify-fmcsa/${encodeURIComponent(mcInput.trim())}`);
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || 'Could not verify MC#/DOT# in FMCSA database.');
        return;
      }
      setFmcsa(data);
      if (data.phone) setPhone(data.phone);
      setStep(2);
    } catch {
      setError('Network error while checking FMCSA authority.');
    } finally {
      setLookingUp(false);
    }
  };

  const emailDomain = email.includes('@') ? email.split('@')[1].toLowerCase().trim() : '';
  const isFreeDomain = Boolean(emailDomain && FREE_DOMAINS.has(emailDomain));
  const domainMatchesFmcsa = Boolean(
    fmcsa?.expected_email_domain && emailDomain && emailDomain === fmcsa.expected_email_domain.toLowerCase()
  );

  const handleSendBrokerOtp = async () => {
    if (!fmcsa) return;
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (!email.trim() || !email.includes('@')) return setError('Please enter a valid work email address.');
    setError('');
    setOtpNotice('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/signup/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Brand': 'loadsnexus' },
        credentials: 'include',
        body: JSON.stringify({
          brand: 'loadsnexus',
          name: contactName.trim() || fmcsa.legal_name,
          email: email.trim(),
          password,
          role: 'broker',
          company: fmcsa.legal_name,
          mcNumber: fmcsa.mc_number,
          dotNumber: fmcsa.dot_number,
          phone: phone.trim() || fmcsa.phone,
          address: fmcsa.address,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not send verification code. Please check your details.');
        return;
      }
      setOtpSent(true);
      setOtpCode('');
      setOtpNotice(`6-digit verification code sent from noreply@loadsnexus.com to ${email.trim()}.`);
      onShowToast(`Verification code sent to ${email.trim()}!`);
    } catch {
      setError('Network error while sending verification code.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fmcsa) return;

    // Step 3a: Send 6-digit OTP from noreply@loadsnexus.com first
    if (!otpSent) {
      return handleSendBrokerOtp();
    }

    // Step 3b: Verify 6-digit OTP & activate FMCSA Broker account
    const cleanOtp = otpCode.replace(/\D/g, '');
    if (cleanOtp.length !== 6) {
      return setError('Please enter the 6-digit verification code sent from noreply@loadsnexus.com.');
    }

    setError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/signup/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Brand': 'loadsnexus' },
        credentials: 'include',
        body: JSON.stringify({
          brand: 'loadsnexus',
          email: email.trim(),
          otp: cleanOtp,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Incorrect or expired verification code.');
        return;
      }
      onShowToast(
        domainMatchesFmcsa
          ? `Welcome ${fmcsa.legal_name}! Email Verified & Instant FMCSA Broker access unlocked.`
          : `Email Verified! Broker account activated for ${fmcsa.legal_name}.`
      );
      if (data.user) onSuccess(data.user);
      onClose();
    } catch {
      setError('Network error while verifying OTP.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4">
      <div className="bg-white text-slate-900 rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="bg-[#0f172a] text-white px-6 py-4 flex items-center justify-between">
          <div>
            <div className="text-base font-black">🛡️ Verified Broker Registration (FMCSA Live)</div>
            <div className="text-xs text-slate-300 mt-0.5">
              Step {step} of 3 · Anti-Double-Brokering Guard Active
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-slate-300 hover:text-white text-2xl leading-none">
            &times;
          </button>
        </div>

        {/* Step Indicator */}
        <div className="grid grid-cols-3 bg-slate-100 border-b border-slate-200 text-[11px] font-extrabold text-center">
          <div className={`py-2 ${step >= 1 ? 'text-emerald-700 bg-emerald-50 border-b-2 border-emerald-600' : 'text-slate-500'}`}>
            1. MC / USDOT Check
          </div>
          <div className={`py-2 ${step >= 2 ? 'text-emerald-700 bg-emerald-50 border-b-2 border-emerald-600' : 'text-slate-500'}`}>
            2. FMCSA Auto-Fill
          </div>
          <div className={`py-2 ${step >= 3 ? 'text-emerald-700 bg-emerald-50 border-b-2 border-emerald-600' : 'text-slate-500'}`}>
            3. Verified Login
          </div>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 px-3.5 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold">
              ⚠️ {error}
            </div>
          )}

          {step === 1 && (
            <form onSubmit={handleVerifyFmcsa} className="space-y-4">
              <p className="text-xs text-slate-600">
                Enter your active <strong>MC Number</strong> or <strong>USDOT Number</strong>. We query the official US DOT FMCSA database live to verify active Property Broker Authority.
              </p>
              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1">MC# or USDOT# *</label>
                <input
                  type="text"
                  required
                  value={mcInput}
                  onChange={(e) => setMcInput(e.target.value)}
                  placeholder="e.g. MC-159021 or 2211386"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-bold focus:outline-none focus:border-emerald-600"
                />
              </div>
              <button
                type="submit"
                disabled={lookingUp}
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-sm font-black shadow-md"
              >
                {lookingUp ? '⏳ Querying US DOT FMCSA...' : '🔍 Verify FMCSA Authority →'}
              </button>
            </form>
          )}

          {step === 2 && fmcsa && (
            <div className="space-y-4">
              <div className={`p-4 rounded-xl border ${fmcsa.verified ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-black text-slate-900">{fmcsa.legal_name}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${fmcsa.verified ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white'}`}>
                    {fmcsa.verified ? '✓ FMCSA VERIFIED' : 'REVIEW REQUIRED'}
                  </span>
                </div>
                <div className="text-xs text-slate-700 mt-1.5 space-y-1">
                  <div><strong>Authority:</strong> {fmcsa.authority_status}</div>
                  <div><strong>Docket / DOT:</strong> {fmcsa.mc_number} · USDOT #{fmcsa.dot_number}</div>
                  <div><strong>Physical Address:</strong> {fmcsa.address || fmcsa.city_state}</div>
                  {fmcsa.phone && <div><strong>FMCSA Phone:</strong> {fmcsa.phone}</div>}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-700"
                >
                  ← Change MC#
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-md"
                >
                  Confirm Company &amp; Create Account →
                </button>
              </div>
            </div>
          )}

          {step === 3 && fmcsa && (
            <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
              <div className="px-3 py-2 rounded-xl bg-slate-100 text-xs font-bold text-slate-700">
                Registering: <strong>{fmcsa.legal_name}</strong> ({fmcsa.mc_number})
              </div>
              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1">Your Full Name *</label>
                <input
                  type="text"
                  required
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="John Smith (Carrier Sales)"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold"
                />
              </div>
              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1">Work Email Address *</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={fmcsa.expected_email_domain ? `you@${fmcsa.expected_email_domain}` : 'dispatch@yourbrokerage.com'}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold"
                />
                {emailDomain && (
                  <div className={`text-[11px] font-bold mt-1 ${
                    domainMatchesFmcsa ? 'text-emerald-600' : isFreeDomain ? 'text-amber-600' : 'text-blue-600'
                  }`}>
                    {domainMatchesFmcsa
                      ? `✅ Corporate domain (@${emailDomain}) matches FMCSA record — Instant Verification!`
                      : isFreeDomain
                      ? `⚠️ Free email domain (@${emailDomain}) — account will be flagged for manual admin review to prevent double-brokering.`
                      : `ℹ️ Corporate domain (@${emailDomain}) detected.`}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1">Direct Phone</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(800) 555-0199"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1">Password (8+ chars) *</label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Create strong password"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold"
                  />
                </div>
              </div>
              {otpSent && (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2">
                  <div className="text-xs font-black text-emerald-900">
                    📧 Enter 6-Digit Email OTP (from noreply@loadsnexus.com)
                  </div>
                  {otpNotice && <div className="text-[11px] text-emerald-800">{otpNotice}</div>}
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      required
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="123456"
                      className="w-36 px-3 py-2 rounded-xl border border-emerald-300 bg-white text-center font-mono text-sm font-black tracking-[0.25em] text-slate-900"
                    />
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={handleSendBrokerOtp}
                      className="px-3 py-2 rounded-xl border border-emerald-300 bg-white hover:bg-emerald-100 text-emerald-800 text-[11px] font-extrabold"
                    >
                      ↻ Resend Code
                    </button>
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setOtpSent(false);
                    setStep(2);
                  }}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-700"
                >
                  ← Back
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-black shadow-md"
                >
                  {submitting
                    ? (otpSent ? '⏳ Verifying OTP...' : '⏳ Sending OTP...')
                    : (otpSent ? '✅ Verify OTP & Activate Broker Account' : '📧 Send Verification Code (OTP) →')}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
