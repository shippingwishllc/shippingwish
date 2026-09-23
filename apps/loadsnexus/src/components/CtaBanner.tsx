import React from 'react';

interface CtaBannerProps {
  onOpenCarrierCheckout: () => void;
  onOpenBrokerPost: () => void;
}

export const CtaBanner: React.FC<CtaBannerProps> = ({
  onOpenCarrierCheckout,
  onOpenBrokerPost,
}) => {
  return (
    <section className="py-20 bg-slate-900 text-white text-center">
      <div className="max-w-[1220px] mx-auto px-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-400/20 text-blue-400 text-xs font-bold uppercase tracking-wider mb-4">
          Ready to Move Freight?
        </div>

        <h2 className="text-3xl md:text-5xl font-display font-black tracking-tight max-w-3xl mx-auto leading-tight">
          Start Searching High-Paying Loads in Seconds
        </h2>

        <p className="mt-4 text-sm md:text-base text-slate-400 max-w-xl mx-auto mb-8">
          Join over 50,000 carrier owners and logistics coordinators across North America.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4">
          <button
            type="button"
            onClick={onOpenCarrierCheckout}
            className="px-6 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-600/30 transition-all hover:scale-[1.02]"
          >
            Get Started for $19/Month →
          </button>
          <button
            type="button"
            onClick={onOpenBrokerPost}
            className="px-6 py-3.5 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 rounded-xl text-sm font-bold transition-all"
          >
            Post Freight as Broker (100% Free) →
          </button>
        </div>
      </div>
    </section>
  );
};
