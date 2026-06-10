import { memo, useMemo } from 'react';

function GaugeChart({ label, value, unit, max = 100, color = '#3b82f6' }) {
  const { displayValue, circumference, offset } = useMemo(() => {
    const rawValue = Number(value);
    const safeValue = Number.isFinite(rawValue) ? rawValue : 0;
    const clampedValue = Math.min(Math.max(safeValue, 0), max);
    const pct = Math.min(100, Math.max(0, (clampedValue / max) * 100));
    const circumferenceValue = 2 * Math.PI * 45;
    const offsetValue = circumferenceValue - (pct / 100) * circumferenceValue;

    let formatted = '—';
    if (Number.isFinite(clampedValue)) {
      formatted = label === 'RPM' || label === 'Speed'
        ? Math.round(clampedValue)
        : clampedValue.toFixed(2);
    }

    return {
      displayValue: formatted,
      circumference: circumferenceValue,
      offset: offsetValue,
    };
  }, [label, max, value]);

  return (
    <div className="card flex flex-col items-center">
      <svg width="120" height="120" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="45" fill="none" stroke="#e2e8f0" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r="45"
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 60 60)"
        />
        <text x="60" y="58" textAnchor="middle" className="fill-slate-900 text-xl font-bold dark:fill-white">
          {displayValue}
        </text>
        <text x="60" y="74" textAnchor="middle" className="fill-slate-500 text-xs">
          {unit}
        </text>
      </svg>
      <p className="mt-2 text-sm font-medium text-slate-600 dark:text-slate-400">{label}</p>
    </div>
  );
}

export default memo(GaugeChart);
