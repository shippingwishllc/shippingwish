import React from 'react';

export const DeskTimeline: React.FC = () => {
  const steps = [
    {
      num: '01',
      title: 'Morning board',
      desc: 'Empty times, HOS windows, and preferred lanes before the first broker call.',
    },
    {
      num: '02',
      title: 'Rate & book',
      desc: 'Negotiate to your floor. Packet, credit, and rate con in your TMS — you approve before it moves.',
    },
    {
      num: '03',
      title: 'Track & paper',
      desc: 'Check calls, appointment windows, BOL and POD follow-up so you get paid clean.',
    },
    {
      num: '04',
      title: 'Reload before empty',
      desc: 'Next load staged before you drop, so the truck is not waiting empty for the next phone call.',
    },
  ];

  return (
    <section className="py-20 bg-white border-b border-slate-200">
      <div className="max-w-[1240px] mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <div className="text-xs font-extrabold uppercase tracking-wider text-amber-700 mb-2">
            A Week On The Desk
          </div>
          <h2 className="text-3xl sm:text-4xl font-display font-black text-[#0b1f3a] tracking-tight">
            What your manager actually does.
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
          {steps.map((step, idx) => (
            <div
              key={idx}
              className="bg-[#f4f7fb] border border-slate-200 rounded-3xl p-6 shadow-sm"
            >
              <div className="text-2xl font-black text-amber-600 mb-3">{step.num}</div>
              <h3 className="text-base font-bold text-[#0b1f3a] mb-2">{step.title}</h3>
              <p className="text-xs text-slate-600 leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
