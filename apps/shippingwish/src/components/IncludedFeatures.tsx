import React from 'react';

export const IncludedFeatures: React.FC = () => {
  const features = [
    {
      title: 'Hire a manager, 24/7',
      desc: 'Your operations manager works as an employee of your company would: lanes, equipment, appointment windows, and broker follow-up around the clock.',
      icon: '👨‍💼',
    },
    {
      title: 'TMS software included',
      desc: 'Loads, documents, rate cons, BOLs, PODs, and status in one carrier portal. No second software invoice.',
      icon: '💻',
    },
    {
      title: 'We book. You don’t buy a load board.',
      desc: 'Our desk already pays for professional load boards. You approve freight in the TMS. Packets, credit checks, and booking stay with us.',
      icon: '🎯',
    },
    {
      title: 'High RPM, less deadhead',
      desc: 'Reload planning before you empty. Lane strategy built to lift revenue per mile and cut empty miles.',
      icon: '📈',
    },
    {
      title: 'You keep freight pay',
      desc: 'Brokers and factors pay your company. Our only charge is the weekly Stripe subscription.',
      icon: '💵',
    },
    {
      title: 'No hidden charges',
      desc: 'No setup fee. No extras for after-hours. Cancel in Stripe before the trial ends and you pay nothing.',
      icon: '🛡️',
    },
  ];

  return (
    <section className="py-20 bg-slate-950 border-b border-slate-800/80" id="included">
      <div className="max-w-[1240px] mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <div className="text-xs font-extrabold uppercase tracking-wider text-blue-400 mb-2">
            What's In The Plan
          </div>
          <h2 className="text-3xl sm:text-4xl font-display font-black text-white tracking-tight">
            Everything your company needs to stay loaded.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {features.map((feat, idx) => (
            <div
              key={idx}
              className="bg-slate-900/80 border border-slate-800 rounded-3xl p-7 shadow-lg hover:border-slate-700 transition-colors"
            >
              <div className="text-3xl mb-4">{feat.icon}</div>
              <h3 className="text-lg font-bold text-white mb-2">{feat.title}</h3>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">{feat.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
