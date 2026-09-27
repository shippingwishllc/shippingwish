import React from 'react';

const problems = [
  {
    title: 'Empty miles between drops',
    text: 'The desk plans the next lane before the truck is empty, using your equipment, hours, and home time. You approve the load before it is booked.',
  },
  {
    title: 'Broker calls after hours',
    text: 'A named operations manager stays on the phones, rate confirmations, and check calls. You are not left with a random after-hours queue.',
  },
  {
    title: 'Paperwork that delays pay',
    text: 'Rate cons, BOLs, and PODs live in the TMS that comes with the weekly plan. Clean paperwork is how the broker or factor pays your company.',
  },
  {
    title: 'Not sure what the desk will and will not do',
    text: 'We book freight for your MC. We do not take a cut of the load. We are not a broker. Freight pay stays with your company. Our only bill is the weekly subscription.',
  },
];

const steps = [
  { n: '01', title: 'Tell us the fleet', text: 'Owner-operator or small fleet, equipment, lanes you want, and the states you run in the Lower 48.' },
  { n: '02', title: 'Carrier setup', text: 'Send MC authority, insurance, and W-9 through the online carrier setup. A manager is assigned to your company.' },
  { n: '03', title: 'First week is $0', text: 'Card is saved in Stripe. The first weekly charge starts after 7 days. Cancel before that date and you are not billed.' },
  { n: '04', title: 'You approve every load', text: 'We negotiate and prepare the packet. Nothing moves until you accept it in the TMS. No forced dispatch.' },
];

export const CarrierGuide: React.FC = () => {
  return (
    <section className="py-20 bg-white border-b border-slate-200" id="how-dispatch-works">
      <div className="max-w-[1240px] mx-auto px-6">
        <div className="max-w-3xl">
          <div className="text-xs font-extrabold uppercase tracking-wider text-amber-700 mb-2">
            Built for U.S. carriers
          </div>
          <h2 className="text-3xl sm:text-4xl font-display font-black text-[#0b1f3a] tracking-tight">
            A named manager for owner-operators and small fleets in the United States.
          </h2>
          <p className="mt-4 text-sm sm:text-base text-slate-600 leading-relaxed">
            Shipping Wish LLC is a U.S. fleet operations desk in Rehoboth Beach, Delaware. We work for motor carriers that run in the Lower 48.
            You keep the broker’s freight pay. We charge a flat weekly plan and include the TMS. This page is the short version of how that works.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-12">
          {problems.map((item) => (
            <article key={item.title} className="rounded-2xl border border-slate-200 bg-[#f4f7fb] p-6">
              <h3 className="text-lg font-bold text-[#0b1f3a]">{item.title}</h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">{item.text}</p>
            </article>
          ))}
        </div>

        <div className="mt-14">
          <h3 className="text-2xl font-display font-black text-[#0b1f3a]">How a U.S. carrier starts</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
            {steps.map((step) => (
              <article key={step.n} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-sm font-black text-amber-600">{step.n}</div>
                <h4 className="mt-2 text-base font-bold text-[#0b1f3a]">{step.title}</h4>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">{step.text}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="mt-10 flex flex-wrap gap-3">
          <a href="/services" className="px-5 py-3 rounded-xl bg-[#0b1f3a] text-white text-sm font-bold">See how the desk works</a>
          <a href="/pricing" className="px-5 py-3 rounded-xl bg-amber-400 text-slate-950 text-sm font-extrabold">See weekly plans</a>
          <a href="/carrier-setup" className="px-5 py-3 rounded-xl border border-slate-300 text-slate-800 text-sm font-bold">Start carrier setup</a>
        </div>
      </div>
    </section>
  );
};
