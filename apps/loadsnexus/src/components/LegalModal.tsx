import React from 'react';

interface LegalModalProps {
  isOpen: boolean;
  type: 'privacy' | 'terms';
  onClose: () => void;
}

export const LegalModal: React.FC<LegalModalProps> = ({ isOpen, type, onClose }) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-2xl w-full my-8 overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50">
          <div>
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-blue-600 mb-0.5">
              Legal Documentation · Shipping Wish LLC
            </div>
            <h3 className="text-xl font-display font-extrabold text-slate-900">
              {type === 'privacy' ? 'LoadsNexus™ Privacy Policy' : 'LoadsNexus™ Terms of Service'}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Effective Date: September 24, 2026 · Operated by Shipping Wish LLC
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

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto text-xs sm:text-sm text-slate-700 space-y-5 leading-relaxed">
          {type === 'privacy' ? (
            <>
              <p>
                This Privacy Policy describes how <strong>Shipping Wish LLC</strong> ("Company", "we", "us", or "our"), doing business as <strong>LoadsNexus™</strong> (accessible at <a href="https://www.loadsnexus.com" className="text-blue-600 underline">loadsnexus.com</a>), collects, uses, and discloses information when you access our freight exchange platform, mobile applications, APIs, and associated services.
              </p>

              <div>
                <h4 className="text-sm font-bold text-slate-900 mb-1">1. Information We Collect</h4>
                <ul className="list-disc pl-5 space-y-1 text-slate-600 text-xs">
                  <li><strong>Account Data:</strong> Business name, contact name, email address, phone number, physical address, USDOT number, and MC (Motor Carrier) number.</li>
                  <li><strong>Freight &amp; Capacity Telemetry:</strong> Origin/destination lanes, equipment types, posted rates, weight, trailer dimensions, and live location updates.</li>
                  <li><strong>Billing Data:</strong> Credit card and billing information processed securely via Stripe. We do not store raw card numbers on our servers.</li>
                  <li><strong>Communications:</strong> Records of SMS dispatches, Rate Confirmation generation, and customer support inquiries.</li>
                </ul>
              </div>

              <div>
                <h4 className="text-sm font-bold text-slate-900 mb-1">2. How We Use Your Information</h4>
                <p className="text-xs text-slate-600">
                  We use collected information to facilitate freight matching, verify FMCSA carrier and broker authority credentials, prevent unauthorized double-brokering, process subscription billing, deliver lane alerts, and provide 24/7 technical assistance.
                </p>
              </div>

              <div>
                <h4 className="text-sm font-bold text-slate-900 mb-1">3. Anti-Fraud &amp; Double-Brokering Safeguards</h4>
                <p className="text-xs text-slate-600">
                  To protect motor carriers and brokers from fraudulent actors, we cross-reference posted shipments and company profiles against FMCSA databases, BMC-84 surety bond filings, and proprietary IP telemetry. Any account suspected of unauthorized load harvesting or identity theft will be suspended immediately.
                </p>
              </div>

              <div>
                <h4 className="text-sm font-bold text-slate-900 mb-1">4. TCPA &amp; Automated Communications</h4>
                <p className="text-xs text-slate-600">
                  By providing your mobile number during signup, load booking, or inquiry, you consent to receive operational SMS and dispatch alerts. You can reply <strong>STOP</strong> at any time to instantly unsubscribe from text notifications.
                </p>
              </div>

              <div>
                <h4 className="text-sm font-bold text-slate-900 mb-1">5. Contact Information</h4>
                <p className="text-xs text-slate-600">
                  <strong>Shipping Wish LLC</strong> (dba LoadsNexus™)<br />
                  19266 Coastal Hwy, Rehoboth Beach, DE 19971, USA<br />
                  Toll-Free Phone: <a href="tel:+18005803101" className="text-blue-600 font-bold">+1 (800) 580-3101</a><br />
                  Support Email: <a href="mailto:support@loadsnexus.com" className="text-blue-600 font-bold">support@loadsnexus.com</a>
                </p>
              </div>
            </>
          ) : (
            <>
              <p>
                These Terms of Service ("Terms") constitute a legally binding agreement between you ("User", "Carrier", or "Broker") and <strong>Shipping Wish LLC</strong> ("LoadsNexus™", "Company", "we", "us"). By accessing <a href="https://www.loadsnexus.com" className="text-blue-600 underline">loadsnexus.com</a> or our mobile applications, you agree to comply with and be bound by these Terms.
              </p>

              <div>
                <h4 className="text-sm font-bold text-slate-900 mb-1">1. Eligibility &amp; FMCSA Compliance</h4>
                <p className="text-xs text-slate-600">
                  All users must be at least 18 years of age and hold active, valid operating authority registered with the Federal Motor Carrier Safety Administration (FMCSA), or be an authorized agent of a licensed commercial shipper, broker, or carrier.
                </p>
              </div>

              <div>
                <h4 className="text-sm font-bold text-slate-900 mb-1">2. Carrier Subscriptions &amp; Billing</h4>
                <ul className="list-disc pl-5 space-y-1 text-slate-600 text-xs">
                  <li><strong>Subscription Fee:</strong> Unlimited load board access for carriers is billed at $19.00 USD per month.</li>
                  <li><strong>Zero Contracts:</strong> Subscriptions renew automatically every 30 days and can be canceled at any time directly through the self-service Stripe billing portal.</li>
                  <li><strong>No Freight Commissions:</strong> LoadsNexus™ does not take a cut or percentage of freight payments. Motor carriers retain 100% of their gross earnings agreed with brokers.</li>
                </ul>
              </div>

              <div>
                <h4 className="text-sm font-bold text-slate-900 mb-1">3. Broker Free Load Posting Integrity</h4>
                <p className="text-xs text-slate-600">
                  Freight brokers are permitted to post spot freight free of charge. In exchange, brokers warrant that all posted loads represent genuine, contracted freight with verified pickup/delivery schedules and agreed compensation. Posting fake, ghost, or bait-and-switch shipments will result in permanent platform revocation.
                </p>
              </div>

              <div>
                <h4 className="text-sm font-bold text-slate-900 mb-1">4. Strict Zero Double-Brokering Policy</h4>
                <p className="text-xs text-slate-600">
                  LoadsNexus™ maintains an absolute zero-tolerance policy against unauthorized double-brokering, re-brokering without shipper consent, or impersonation of licensed motor carriers. Violations will be reported directly to the FMCSA Office of Registration and Safety.
                </p>
              </div>

              <div>
                <h4 className="text-sm font-bold text-slate-900 mb-1">5. Governing Law &amp; Jurisdiction</h4>
                <p className="text-xs text-slate-600">
                  These Terms are governed by and construed in accordance with the laws of the <strong>State of Delaware, United States</strong>, without regard to conflict of law principles.
                </p>
              </div>

              <div>
                <h4 className="text-sm font-bold text-slate-900 mb-1">6. Support &amp; Dispute Inquiries</h4>
                <p className="text-xs text-slate-600">
                  Shipping Wish LLC · 19266 Coastal Hwy, Rehoboth Beach, DE 19971<br />
                  Customer Support: <a href="mailto:support@loadsnexus.com" className="text-blue-600 font-bold">support@loadsnexus.com</a> · <a href="tel:+18005803101" className="text-blue-600 font-bold">+1 (800) 580-3101</a>
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors"
          >
            I Understand &amp; Close
          </button>
        </div>
      </div>
    </div>
  );
};
