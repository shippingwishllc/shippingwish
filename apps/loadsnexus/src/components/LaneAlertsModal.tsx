import React, { useState } from 'react';

export interface LaneAlert {
  id: string;
  origin: string;
  destination: string;
  equipment: string;
  minRpm: number;
  contactEmail: string;
  createdAt: string;
}

interface LaneAlertsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveAlert: (alert: LaneAlert) => void;
  savedAlerts: LaneAlert[];
  onDeleteAlert: (id: string) => void;
}

export const LaneAlertsModal: React.FC<LaneAlertsModalProps> = ({
  isOpen,
  onClose,
  onSaveAlert,
  savedAlerts,
  onDeleteAlert,
}) => {
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [equipment, setEquipment] = useState("53' Dry Van");
  const [minRpm, setMinRpm] = useState<number | ''>(3.00);
  const [contactEmail, setContactEmail] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!origin && !destination) return;

    const newAlert: LaneAlert = {
      id: `alert-${Date.now()}`,
      origin: origin.trim(),
      destination: destination.trim(),
      equipment,
      minRpm: Number(minRpm) || 2.80,
      contactEmail: contactEmail.trim(),
      createdAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    };

    onSaveAlert(newAlert);
    setSuccessMsg('🎉 Lane alert created! Loads matching this corridor will be highlighted.');
    setTimeout(() => setSuccessMsg(''), 4000);

    setOrigin('');
    setDestination('');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-lg w-full my-8 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-display font-bold text-slate-900 flex items-center gap-2">
              <span>🔔</span> Instant Carrier Lane Alerts
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Get notified immediately when high-paying freight matching your preferred lanes hits LoadsNexus.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-6 max-h-[80vh] overflow-y-auto">
          {successMsg && (
            <div className="p-3.5 mb-5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold">
              {successMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 text-xs font-bold text-slate-700">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block mb-1.5 text-slate-800">Origin Corridor</label>
                <input
                  type="text"
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                  placeholder="e.g. Chicago, IL or IL"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:border-blue-600 outline-none"
                />
              </div>

              <div>
                <label className="block mb-1.5 text-slate-800">Destination Corridor</label>
                <input
                  type="text"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder="e.g. Dallas, TX or TX"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:border-blue-600 outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block mb-1.5 text-slate-800">Equipment Type</label>
                <select
                  value={equipment}
                  onChange={(e) => setEquipment(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:border-blue-600 outline-none cursor-pointer"
                >
                  <option value="53' Dry Van">53' Dry Van</option>
                  <option value="53' Reefer">53' Reefer</option>
                  <option value="Flatbed">Flatbed / Stepdeck</option>
                  <option value="Power Only">Power Only</option>
                  <option value="Hotshot">Hotshot</option>
                </select>
              </div>

              <div>
                <label className="block mb-1.5 text-slate-800">Minimum Rate Per Mile (RPM)</label>
                <input
                  type="number"
                  step="0.05"
                  value={minRpm}
                  onChange={(e) => setMinRpm(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  placeholder="e.g. 3.25"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:border-blue-600 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block mb-1.5 text-slate-800">Notification Email (Optional)</label>
              <input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="dispatch@yourfleet.com"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:border-blue-600 outline-none"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/30 transition-all text-center"
            >
              🔔 Save Active Lane Alert →
            </button>
          </form>

          {/* Active Saved Alerts List */}
          <div className="mt-8 pt-6 border-t border-slate-100">
            <div className="text-xs font-extrabold uppercase tracking-wider text-slate-400 mb-3">
              Your Active Lane Alerts ({savedAlerts.length})
            </div>

            {savedAlerts.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-50 text-slate-500 text-center text-xs">
                No active lane alerts set. Add your preferred freight corridors above to get alerted when matching loads arrive.
              </div>
            ) : (
              <div className="space-y-2.5">
                {savedAlerts.map((al) => (
                  <div
                    key={al.id}
                    className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-bold text-slate-900">
                        {al.origin || 'Anywhere'} → {al.destination || 'Anywhere'}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {al.equipment} · Min ${al.minRpm.toFixed(2)}/mi · Created {al.createdAt}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onDeleteAlert(al.id)}
                      className="px-2 py-1 text-[11px] font-bold text-rose-600 hover:bg-rose-50 rounded transition-colors"
                      title="Delete Alert"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
