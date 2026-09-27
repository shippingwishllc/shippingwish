import React from 'react';

const OUTLINE =
  'M 64.8,32 L 39.1,60 L 45.1,88 L 39.1,146 L 40.6,172 L 40.6,204 L 60.2,252 L 70.8,270 L 82.9,292 L 96.5,322 L 128.3,332 L 146.4,348 L 149.5,362 L 185.7,360 L 241.7,386 L 271.9,386 L 309.7,376 L 389.9,420 L 447.3,492 L 450.3,484 L 450.3,456 L 479.1,434 L 486.6,426 L 501.8,418 L 541.1,422 L 568.3,428 L 586.4,408 L 622.7,408 L 636.3,418 L 663.5,430 L 668.1,456 L 683.2,490 L 701.3,508 L 708.9,496 L 710.4,474 L 702.9,444 L 689.2,406 L 689.2,390 L 698.3,372 L 711.9,356 L 740.7,334 L 778.5,308 L 772.4,274 L 784.5,246 L 795.1,226 L 801.1,202 L 831.4,192 L 861.6,178 L 848,166 L 858.6,138 L 907,116 L 887.3,68 L 838.9,108 L 811.7,112 L 767.9,140 L 725.5,146 L 668.1,164 L 642.4,96 L 637.8,82 L 589.5,76 L 527.5,78 L 507.8,40 L 480.6,32 L 370.2,32 L 228.1,32 Z';

const lanes = [
  { id: 'west', d: 'M 132,331 L 332,218 L 490,230 L 596,174', dur: '14s' },
  { id: 'south', d: 'M 456,356 L 644,337 L 707,496', dur: '11s' },
  { id: 'east', d: 'M 596,174 L 644,337 L 798,198', dur: '13s', delay: '-4s' },
  { id: 'gulf', d: 'M 132,331 L 456,356 L 596,174', dur: '16s', delay: '-7s' },
];

const hubs = [
  { name: 'Los Angeles', x: 132, y: 331 },
  { name: 'Dallas', x: 456, y: 356 },
  { name: 'Denver', x: 332, y: 218 },
  { name: 'Chicago', x: 596, y: 174 },
  { name: 'Atlanta', x: 644, y: 337 },
  { name: 'Newark', x: 798, y: 198 },
];

export const UsaLaneMap: React.FC<{ idPrefix?: string }> = ({ idPrefix = 'lane' }) => {
  return (
    <div className="usa-map rounded-3xl border border-slate-200 bg-white shadow-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
        <span className="text-xs font-bold text-[#0b1f3a]">Lower 48 lane map</span>
        <span className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 live-pulse-dot"></span>
          Desk active
        </span>
      </div>
      <div className="relative bg-[#f4f7fb]">
        <svg viewBox="0 0 940 540" className="w-full h-auto block" role="img" aria-label="Animated map of freight lanes across the continental United States">
          <path d={OUTLINE} fill="#e8eef6" stroke="#0b1f3a" strokeWidth="2.2" />
          {lanes.map((lane) => (
            <path
              key={lane.id}
              id={`${idPrefix}-${lane.id}`}
              d={lane.d}
              fill="none"
              stroke="#2563eb"
              strokeWidth="2.4"
              strokeLinecap="round"
              className="lane-flow"
              opacity="0.85"
            />
          ))}
          {lanes.map((lane) => (
            <g key={`${lane.id}-truck`} className="usa-motion">
              <circle r="6.5" fill="#f59e0b" stroke="#0f172a" strokeWidth="1.4">
                <animateMotion dur={lane.dur} begin={lane.delay || '0s'} repeatCount="indefinite" rotate="auto">
                  <mpath href={`#${idPrefix}-${lane.id}`} />
                </animateMotion>
              </circle>
            </g>
          ))}
          {hubs.map((hub) => (
            <g key={hub.name}>
              <circle cx={hub.x} cy={hub.y} r="4" fill="#0b1f3a" />
              <circle cx={hub.x} cy={hub.y} r="8" fill="none" stroke="#2563eb" strokeWidth="1" opacity="0.45" />
            </g>
          ))}
        </svg>
      </div>
      <p className="px-4 py-3 text-[11px] leading-relaxed text-slate-500">
        Animated coverage across the United States. Trucks on this map are not a live GPS feed of a specific carrier.
      </p>
    </div>
  );
};
