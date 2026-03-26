import { energySourceColors } from '@/lib/colors';
import { formatKw } from '@/lib/utils';
import type { StatusResponse } from '@/types/api';

interface PowerFlowBarsProps {
  status: StatusResponse;
}

interface FlowBar {
  label: string;
  watts: number;
  color: string;
  tint: string;
}

function Bar({ label, watts, color, tint, maxWatts }: FlowBar & { maxWatts: number }) {
  const pct = maxWatts > 0 ? Math.min((watts / maxWatts) * 100, 100) : 0;
  const isActive = watts > 50;

  return (
    <div className="flex items-center gap-2">
      <span
        className="w-14 text-sm font-medium text-[var(--text-primary)] flex-shrink-0"
        style={{ fontSize: '13px' }}
      >
        {label}
      </span>
      <div className="flex-1 relative" style={{ height: 24 }}>
        {/* Background */}
        <div
          className="absolute inset-0 rounded-sm"
          style={{ backgroundColor: tint }}
        />
        {/* Fill */}
        <div
          className="absolute top-0 left-0 bottom-0 rounded-sm transition-all duration-300"
          style={{
            width: pct > 0 ? `${pct}%` : '2px',
            backgroundColor: pct > 0 ? color : `${color}60`,
          }}
        />
        {/* Zero indicator */}
        {!isActive && (
          <div
            className="absolute top-0 bottom-0 left-0 w-0.5 rounded"
            style={{ backgroundColor: `${color}60` }}
          />
        )}
      </div>
      <span
        className="text-sm font-mono text-[var(--text-secondary)] w-14 text-right flex-shrink-0"
        style={{ fontSize: '13px' }}
      >
        {formatKw(watts)}
      </span>
    </div>
  );
}

export function PowerFlowBars({ status }: PowerFlowBarsProps) {
  const { solar, grid, battery } = status;
  const houseLoad = Math.max(
    solar.current_generation_w + grid.import_w - grid.export_w - (battery.power_w > 0 ? battery.power_w : 0),
    0,
  );

  const fromBars: FlowBar[] = [
    { label: 'Solar', watts: solar.current_generation_w, color: energySourceColors.solar, tint: '#EAB30826' },
    { label: 'Grid', watts: grid.import_w, color: energySourceColors.grid, tint: '#EC489926' },
    { label: 'Battery', watts: battery.power_w > 0 ? 0 : Math.abs(battery.power_w), color: energySourceColors.battery, tint: '#06B6D426' },
  ];

  const toBars: FlowBar[] = [
    { label: 'House', watts: houseLoad, color: energySourceColors.house, tint: '#3B82F626' },
    { label: 'Battery', watts: battery.power_w > 0 ? battery.power_w : 0, color: energySourceColors.battery, tint: '#06B6D426' },
    { label: 'Grid', watts: grid.export_w, color: energySourceColors.grid, tint: '#EC489926' },
  ];

  const allWatts = [...fromBars, ...toBars].map((b) => b.watts);
  const maxWatts = Math.max(...allWatts, 1000);

  return (
    <div className="space-y-4">
      {/* FROM section */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
          From
        </p>
        <div className="space-y-2">
          {fromBars.map((bar) => (
            <Bar key={bar.label} {...bar} maxWatts={maxWatts} />
          ))}
        </div>
      </div>

      {/* TO section */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
          To
        </p>
        <div className="space-y-2">
          {toBars.map((bar) => (
            <Bar key={bar.label} {...bar} maxWatts={maxWatts} />
          ))}
        </div>
      </div>

      <p className="text-right text-xs text-[var(--text-tertiary)] font-mono">kW</p>
    </div>
  );
}
