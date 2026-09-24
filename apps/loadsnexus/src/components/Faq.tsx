import React, { useState } from 'react';

interface FaqProps {
  onOpenCarrierCheckout: () => void;
  onOpenBrokerPost: () => void;
}

export const Faq: React.FC<FaqProps> = ({ onOpenCarrierCheckout, onOpenBrokerPost }) => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqs = [
    {
      q: 'How does the $19/mo Carrier Pass work?',
      a: 'The $19/mo Carrier Pass gives motor carriers and owner-operators unlimited access to 4,850+ live spot freight loads across all 50 US states. You get direct broker dispatch phone numbers, MC verification, Days-to-Pay (DTP) credit scores, automated 1-click Rate Confirmation PDFs, and our AI Rate Negotiation Copilot. There are zero contracts, zero transaction commissions, and you can cancel anytime with 1 click.'
    },
    {
      q: 'Is posting loads 100% Free for Freight Brokers & 3PLs?',
      a: 'Yes, 100% free! Freight brokers and shippers can post unlimited spot freight and truckload shipments without paying listing fees. We verify your active FMCSA MC/DOT authority and BMC-84 bond to ensure our carrier roster connects exclusively with legitimate, solvent brokerages.'
    },
    {
      q: 'How do you prevent Double-Brokering and Fraudulent loads?',
      a: 'LoadsNexus™ operates a proprietary 3-tier Anti-Fraud Shield. We perform real-time FMCSA authority checks, cross-reference broker physical addresses and authorized dispatch phone lines, enforce commercial truck physics (e.g. 10,000 lbs GVWR limits on box trucks), and monitor IP telemetry to prevent stolen identities and unauthorized re-brokering.'
    },
    {
      q: 'What does Days-To-Pay (DTP) mean and how is it scored?',
      a: 'Days-To-Pay (DTP) measures the historical average number of days a broker takes to pay carriers after receiving proof of delivery (POD). A broker with 15–20 days DTP and an A+ rating indicates excellent financial health and prompt settlement, allowing carriers to book with confidence.'
    },
    {
      q: 'What equipment types are supported on LoadsNexus™?',
      a: 'We support all major commercial equipment types: 53\' Dry Vans, 53\' Temperature-Controlled Reefers, Flatbeds, 26\' Box Trucks, Cargo Vans / Sprinters, Power Only (tow-away), and Hotshot trailers. Each category features real-time RPM benchmarking and weight capacity validation.'
    },
    {
      q: 'How does the AI Carrier Rate Negotiation Copilot work?',
      a: 'Our built-in AI copilot analyzes the corridor miles, diesel fuel costs (based on current US national averages), and deadhead miles to calculate your net driver profit. It then generates an assertive phone negotiation script and a professional booking offer email to help you counter-bid brokers for top dollar (averaging 12-15% higher pay per load).'
    },
    {
      q: 'Can I cancel my carrier subscription anytime?',
      a: 'Yes, absolutely. There are no contracts, no lock-in periods, and no cancellation penalties. You can manage your subscription with 1 click from your self-service Stripe billing portal, or simply contact our 24/7 support desk.'
    }
  ];

  return (
    <section className="py-20 bg-white border-t border-slate-200/80" id="faq">
      <div className="max-w-4xl mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-extrabold uppercase tracking-wider mb-3">
            <span>FREQUENTLY ASKED QUESTIONS</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-display font-extrabold text-slate-900 tracking-tight">
            Everything You Need to Know About LoadsNexus™
          </h2>
          <p className="text-slate-600 text-sm mt-3 leading-relaxed">
            Transparent answers on pricing, broker vetting, carrier subscriptions, and our proprietary anti-fraud load board technology.
          </p>
        </div>

        <div className="space-y-3.5">
          {faqs.map((faq, idx) => {
            const isOpen = openIndex === idx;
            return (
              <div
                key={idx}
                className="border border-slate-200 rounded-2xl overflow-hidden transition-all duration-200 bg-slate-50/50 hover:bg-slate-50"
              >
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? null : idx)}
                  className="w-full p-5 text-left flex items-center justify-between gap-4 font-display font-bold text-slate-900 text-sm md:text-base"
                >
                  <span>{faq.q}</span>
                  <span className={`w-7 h-7 rounded-full bg-white border border-slate-200 flex items-center justify-center text-xs font-bold text-slate-500 transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180 bg-blue-50 text-blue-600 border-blue-200' : ''}`}>
                    ▼
                  </span>
                </button>

                {isOpen && (
                  <div className="px-5 pb-5 pt-1 text-slate-600 text-xs sm:text-sm leading-relaxed border-t border-slate-100">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* FAQ Conversion Box */}
        <div className="mt-12 p-6 sm:p-8 rounded-2xl bg-gradient-to-br from-slate-900 to-blue-950 text-white flex flex-col sm:flex-row items-center justify-between gap-6 shadow-xl">
          <div>
            <h3 className="text-lg sm:text-xl font-bold font-display">
              Ready to find high-paying spot freight?
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 mt-1">
              Join 50,000+ carriers and brokers moving freight on LoadsNexus™ today.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={onOpenCarrierCheckout}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-md transition-all whitespace-nowrap"
            >
              Get Started ($19/mo) →
            </button>
            <button
              type="button"
              onClick={onOpenBrokerPost}
              className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl border border-white/20 transition-all whitespace-nowrap"
            >
              Post Loads Free
            </button>
          </div>
        </div>

      </div>
    </section>
  );
};
