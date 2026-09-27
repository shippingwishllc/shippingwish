import React from 'react';

export const Partners: React.FC = () => {
  const partners = [
    { type: 'Motor carrier', name: 'MSP Transportation' },
    { type: 'Motor carrier', name: 'DANDRICH Trucking LLC' },
    { type: 'Motor carrier', name: 'Martinez Trucking LLC' },
    { type: 'Broker partner', name: 'Neon Logistics' },
    { type: 'Motor carrier', name: 'Horizon Freight Lines' },
  ];

  return (
    <section className="py-20 bg-white border-b border-slate-200">
      <div className="max-w-[1240px] mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <div className="text-xs font-extrabold uppercase tracking-wider text-amber-700 mb-2">
            On The Road With Us
          </div>
          <h2 className="text-3xl sm:text-4xl font-display font-black text-[#0b1f3a] tracking-tight">
            Carriers and broker partners we work with
          </h2>
          <p className="mt-4 text-sm sm:text-base text-slate-600">
            Motor carriers and freight partners across the Lower 48. Names are companies we work with. This is not a ranking or a customer-count claim.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 max-w-5xl mx-auto">
          {partners.map((partner, idx) => (
            <div
              key={idx}
              className="bg-[#f4f7fb] border border-slate-200 rounded-2xl p-5 text-center flex flex-col justify-center"
            >
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                {partner.type}
              </span>
              <strong className="text-sm font-extrabold text-[#0b1f3a]">
                {partner.name}
              </strong>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
