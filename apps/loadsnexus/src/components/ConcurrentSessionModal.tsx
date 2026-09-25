import React from 'react';

interface ConcurrentSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenLogin: () => void;
  onOpenUpgrade: (tier: 'loadboard_team_pass' | 'loadboard_fleet_pass') => void;
}

export const ConcurrentSessionModal: React.FC<ConcurrentSessionModalProps> = ({
  isOpen,
  onClose,
  onOpenLogin,
  onOpenUpgrade,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white border border-rose-200 rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden text-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Urgent Header Banner */}
        <div className="bg-gradient-to-r from-rose-600 via-rose-700 to-amber-700 px-6 py-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-xl shrink-0">
              ⚠️
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-wider text-rose-200">
                Security Guard · DAT One-Style Session Lock
              </div>
              <h3 className="text-base font-black tracking-tight leading-tight">
                Session Terminated on This Device
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-xs transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 text-xs text-slate-600 space-y-4">
          <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 flex items-start gap-2.5">
            <span className="text-base shrink-0 mt-0.5">🔒</span>
            <div className="leading-relaxed">
              <strong className="font-bold block text-rose-950">
                Another computer or browser just signed in to this account.
              </strong>
              To protect your freight data and maintain fair pricing, LoadsNexus accounts only permit concurrent logins up to your purchased seat tier.
            </div>
          </div>

          <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50 space-y-2.5">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700">
              LoadsNexus Seat &amp; Workstation Policy
            </div>
            <div className="grid grid-cols-1 gap-2 text-[11px]">
              <div className="flex items-center justify-between p-2 rounded-xl bg-white border border-slate-200">
                <div className="flex items-center gap-2">
                  <span className="text-blue-600 font-bold">●</span>
                  <span className="font-bold text-slate-800">Solo Pass ($19/mo)</span>
                </div>
                <span className="text-slate-500 font-medium">1 Desktop + 1 Driver Mobile</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-xl bg-white border border-blue-200 bg-blue-50/40">
                <div className="flex items-center gap-2">
                  <span className="text-emerald-600 font-bold">●</span>
                  <span className="font-bold text-slate-800">Team Pass ($39/mo)</span>
                </div>
                <span className="text-emerald-700 font-bold">3 Concurrent Dispatcher Seats</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-xl bg-white border border-purple-200 bg-purple-50/40">
                <div className="flex items-center gap-2">
                  <span className="text-purple-600 font-bold">●</span>
                  <span className="font-bold text-slate-800">Fleet Pass ($69/mo)</span>
                </div>
                <span className="text-purple-700 font-bold">5 Concurrent Dispatcher Seats</span>
              </div>
            </div>
            <p className="text-[10px] text-slate-500 leading-normal pt-1">
              Need multiple dispatchers or fleet managers searching loads at the exact same moment? Upgrade to Team or Fleet to run 3 to 5 simultaneous workstations without ever getting logged out.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2 pt-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenLogin();
              }}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-md shadow-blue-600/30 transition-all flex items-center justify-center gap-2 text-center"
            >
              <span>🔐</span> Sign In Here (Take Back Session on This Device)
            </button>

            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenUpgrade('loadboard_team_pass');
              }}
              className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-sm transition-all flex items-center justify-center gap-2 text-center"
            >
              <span>⚡</span> Upgrade to Team (3 Seats — $39/mo)
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-full py-2 px-3 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl font-medium transition-colors text-center"
            >
              Continue in Free Preview Mode
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
