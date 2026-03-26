'use client';

import { getBatterySocColor, getBatteryModeColor } from '@/lib/colors';
import { formatKw, formatSoc } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { BatteryState } from '@/types/api';

interface BatteryGaugeProps {
  battery: BatteryState;
  solarW?: number;
  loadW?: number;
}

export function BatteryGauge({ battery }: BatteryGaugeProps) {
  const socColor = getBatterySocColor(battery.soc);
  const modeColor = getBatteryModeColor(battery.mode);
  const isCharging = battery.mode === 'charging';
  const isDischarging = battery.mode === 'discharging';
  const powerSign = isCharging ? '+' : isDischarging ? '-' : '';
  const powerKw = Math.abs(battery.power_w) / 1000;

  const modeLabel =
    battery.mode === 'charging' ? 'Charging' :
    battery.mode === 'discharging' ? 'Discharging' :
    battery.mode === 'holding' ? 'Holding' : 'Idle';

  // SVG circular gauge
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const fillPercent = battery.soc / 100;
  const dashOffset = circumference * (1 - fillPercent);

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Circular gauge */}
      <div className="relative" aria-label={`Battery: ${formatSoc(battery.soc)}`}>
        <svg width="140" height="140" viewBox="0 0 160 160" aria-hidden="true">
          {/* Background track */}
          <circle
            cx="80"
            cy="80"
            r={radius}
            fill="none"
            stroke="var(--bg-tertiary)"
            strokeWidth="14"
          />
          {/* Fill arc */}
          <circle
            cx="80"
            cy="80"
            r={radius}
            fill="none"
            stroke={socColor}
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            transform="rotate(-90 80 80)"
            style={{ transition: 'stroke-dashoffset 0.3s ease, stroke 0.3s ease' }}
          />
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="text-4xl font-bold font-mono leading-none"
            style={{ color: socColor }}
          >
            {Math.round(battery.soc)}
          </span>
          <span className="text-sm text-[var(--text-secondary)] font-mono">%</span>
        </div>
      </div>

      {/* State badge */}
      <div
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium text-white',
          isCharging && 'animate-pulse-gentle',
        )}
        style={{ backgroundColor: modeColor }}
        role="status"
        aria-label={`Battery mode: ${modeLabel}`}
      >
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-white/60" />
        {modeLabel}
      </div>

      {/* Power value */}
      {(isCharging || isDischarging) && (
        <p className="text-base font-mono text-[var(--text-primary)] font-medium">
          {powerSign}{powerKw.toFixed(1)} kW
        </p>
      )}

      {/* Temperature */}
      {battery.temperature != null && (
        <p className="text-xs text-[var(--text-tertiary)] font-mono">
          {battery.temperature.toFixed(0)}°C
        </p>
      )}
    </div>
  );
}
