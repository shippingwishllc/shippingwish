import React from 'react';

const equipment = [
  {
    n: '01',
    icon: '🚚',
    title: 'Dry van',
    text: '53ft dry van booking for owner-operators and small fleets. You set the floor. You approve the load.',
    tags: ['53ft van', 'You approve', 'Named manager'],
    foot: 'Operations desk',
    footNote: 'Broker calls and paperwork stay with us'
  },
  {
    n: '02',
    icon: '❄️',
    title: 'Reefer',
    text: 'Temperature-controlled freight with check calls and appointment windows in the TMS.',
    tags: ['Reefer', 'Check calls', 'Appointments'],
    foot: 'Cold freight',
    footNote: 'Status and documents in your portal'
  },
  {
    n: '03',
    icon: '🏗',
    title: 'Flatbed',
    text: 'Open-deck booking with the same named manager on your account — no rotating call queue.',
    tags: ['Flatbed', 'Stepdeck', 'Broker packet'],
    foot: 'Open deck',
    footNote: 'Rate con in the TMS before it moves'
  },
  {
    n: '04',
    icon: '📦',
    title: 'Box truck',
    text: 'Box truck and sprinter work when it fits your authority, insurance, and the lanes you want.',
    tags: ['Box truck', 'Sprinter', 'You approve'],
    foot: 'City and regional',
    footNote: 'No forced dispatch'
  },
  {
    n: '05',
    icon: '⚡',
    title: 'Hotshot',
    text: 'Pickup and gooseneck lanes when your equipment and MC match what the broker posted.',
    tags: ['Hotshot', 'Gooseneck', 'Lower 48'],
    foot: 'Fast turns',
    footNote: 'You still accept every load'
  },
  {
    n: '06',
    icon: '👤',
    title: 'Owner-operator desk',
    text: 'One manager on your company. Flat weekly plan. Freight pay stays with you — we do not take a cut of the load.',
    tags: ['1 truck', '$149 / week', 'First week $0'],
    foot: 'Solo authority',
    footNote: 'TMS included on the plan'
  }
];

export const EquipmentDesk: React.FC = () => {
  return (
    <section className="py-20 bg-[#f8fafc] border-b border-slate-200" id="equipment">
      <div className="max-w-[1240px] mx-auto px-6">
        <div className="max-w-3xl">
          <div className="text-xs font-extrabold uppercase tracking-wider text-blue-700 mb-2">
            Equipment we book
          </div>
          <h2 className="text-3xl sm:text-4xl font-display font-black text-[#0b1f3a] tracking-tight">
            A company desk for the trucks you actually run.
          </h2>
          <p className="mt-4 text-sm sm:text-base text-slate-600 leading-relaxed">
            Same named manager, same weekly plan. We do not advertise an average rate per mile. The broker rate is whatever you approve on that load.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5 mt-12">
          {equipment.map((item) => (
            <article
              key={item.n}
              className="flex flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md hover:border-blue-200 transition-all"
            >
              <div className="flex items-start justify-between">
                <div className="w-12 h-12 rounded-2xl bg-[#0b1f3a] text-white flex items-center justify-center text-xl">
                  {item.icon}
                </div>
                <span className="text-sm font-black text-slate-300">{item.n}</span>
              </div>
              <h3 className="mt-4 text-xl font-display font-black text-[#0b1f3a]">{item.title}</h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed flex-1">{item.text}</p>
              <div className="flex flex-wrap gap-1.5 mt-4">
                {item.tags.map((tag) => (
                  <span key={tag} className="px-2.5 py-1 rounded-full bg-slate-50 border border-slate-200 text-[11px] font-bold text-slate-600">
                    {tag}
                  </span>
                ))}
              </div>
              <div className="mt-5 pt-4 border-t border-slate-100 flex items-end justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-[#0b1f3a]">{item.foot}</div>
                  <div className="text-[11px] text-slate-500">{item.footNote}</div>
                </div>
                <a href="/dispatch" className="text-xs font-extrabold text-blue-700 hover:underline whitespace-nowrap">
                  See the desk →
                </a>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};
