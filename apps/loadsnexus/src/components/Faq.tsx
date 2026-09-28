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
      a: 'The $19/mo Carrier Pass gives motor carriers and owner-operators access to posted spot freight on LoadsNexus. You get broker contacts when they are on the post, FMCSA authority checks, and rate confirmation tools. There are no long-term contracts, and you can cancel anytime.'
    },
    {
      q: 'Is posting loads 100% Free for Freight Brokers & 3PLs?',
      a: 'Yes. Brokers and shippers can post without listing fees. We check the FMCSA census for active broker authority before a post goes live. Bond status is shown when the insurance feed or LoadWrap returns it; otherwise we tell you to confirm BMC-84/85 on SAFER.'
    },
    {
      q: 'How do you prevent Double-Brokering and Fraudulent loads?',
      a: 'LoadsNexus™ operates a proprietary 3-tier Anti-Fraud Shield. We perform real-time FMCSA authority checks, cross-reference broker physical addresses and authorized dispatch phone lines, enforce commercial truck physics (e.g. 10,000 lbs GVWR limits on box trucks), and monitor IP telemetry to prevent stolen identities and unauthorized re-brokering.'
    },
    {
      q: 'What does Days-To-Pay (DTP) mean and how is it scored?',
      a: 'Days-To-Pay is the average number of days a broker took to pay after POD, shown only when we have paid-load history with that broker or a connected credit feed (LoadWrap) returns it. FMCSA does not publish DTP or letter grades. If you see n/a, we do not have that data yet.'
    },
    {
      q: 'What equipment types are supported on LoadsNexus™?',
      a: 'We support all major commercial equipment types: 53\' Dry Vans, 53\' Temperature-Controlled Reefers, Flatbeds, 26\' Box Trucks, Cargo Vans / Sprinters, Power Only (tow-away), and Hotshot trailers. Each category features real-time RPM benchmarking and weight capacity validation.'
    },
    {
      q: 'How does the AI Carrier Rate Negotiation Copilot work?',
      a: 'The copilot uses the posted lane, miles, and rate to draft a booking email or phone script. It does not promise a higher rate, and it will not invent miles, broker credit, or market averages we do not have.'
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
              Search posted loads and post freight on LoadsNexus.
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
