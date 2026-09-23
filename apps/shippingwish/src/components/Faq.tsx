import React, { useState } from 'react';
import type { FaqItem } from '../types';

export const Faq: React.FC = () => {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  const faqs: FaqItem[] = [
    {
      question: 'Do you take a cut of my loads?',
      answer: 'No. Freight revenue stays with your company. Shipping Wish bills only the weekly subscription on Stripe.',
    },
    {
      question: 'When am I charged?',
      answer: 'Today: $0. Your card is saved. The first weekly charge runs after the 7-day trial. Cancel in Stripe before that date and you are not billed.',
    },
    {
      question: 'Do I still need my own load board?',
      answer: "No. You do not buy a load-board subscription to work with us. Shipping Wish already uses professional load boards as a paying customer. We find and book freight for your MC. You approve loads in the TMS. You don't pay for a second seat.",
    },
    {
      question: 'Are you a broker?',
      answer: 'No. Shipping Wish LLC is an independent operations company. We work for your MC. We do not buy or sell freight.',
    },
    {
      question: 'Can I cancel?',
      answer: 'Yes. Cancel anytime in Stripe. If you cancel during the free week, the subscription never bills.',
    },
  ];

  return (
    <section className="py-20 bg-slate-950 border-b border-slate-800/80">
      <div className="max-w-[1240px] mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <div className="text-xs font-extrabold uppercase tracking-wider text-blue-400 mb-2">
            Questions
          </div>
          <h2 className="text-3xl sm:text-4xl font-display font-black text-white tracking-tight">
            Clear answers before you put a card on file.
          </h2>
        </div>

        <div className="max-w-2xl mx-auto space-y-4">
          {faqs.map((faq, idx) => {
            const isOpen = openIdx === idx;
            return (
              <div
                key={idx}
                className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden transition-colors"
              >
                <button
                  type="button"
                  onClick={() => setOpenIdx(isOpen ? null : idx)}
                  className="w-full p-5 text-left flex items-center justify-between gap-4 font-bold text-sm text-white hover:text-blue-400 transition-colors"
                >
                  <span>{faq.question}</span>
                  <span className="text-slate-400 text-lg">{isOpen ? '−' : '+'}</span>
                </button>
                {isOpen && (
                  <div className="px-5 pb-5 text-xs sm:text-sm text-slate-400 leading-relaxed border-t border-slate-800/60 pt-3">
                    {faq.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
