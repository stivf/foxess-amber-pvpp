import { Sun, Battery, Home, Zap } from 'lucide-react';
import { energySourceColors } from '@/lib/colors';
import { formatKwh, formatKw } from '@/lib/utils';

interface EnergyMetricCardsProps {
  solarGeneratedKwh: number;
  solarPeakKw?: number;
  batteryCyclesKwh: number;
  batteryNetKwh?: number;
  houseConsumedKwh: number;
  houseAvgKw?: number;
  gridExportKwh: number;
  gridImportKwh: number;
}

interface MetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  subDetail: string;
  color: string;
  tint: string;
}

function MetricCard({ icon, label, value, subDetail, color, tint }: MetricCardProps) {
  return (
    <div
      className="rounded-md p-3 flex flex-col gap-1"
      style={{
        backgroundColor: tint,
        borderLeft: `3px solid ${color}`,
      }}
    >
      <div className="flex items-center gap-1.5">
        <span style={{ color }}>{icon}</span>
        <span className="text-sm font-medium text-[var(--text-primary)]">{label}</span>
      </div>
      <p
        className="text-xl font-bold font-mono"
        style={{ color }}
      >
        {value}
      </p>
      <p className="text-xs text-[var(--text-secondary)]">{subDetail}</p>
    </div>
  );
}

export function EnergyMetricCards({
  solarGeneratedKwh,
  solarPeakKw,
  batteryCyclesKwh,
  batteryNetKwh,
  houseConsumedKwh,
  houseAvgKw,
  gridExportKwh,
  gridImportKwh,
}: EnergyMetricCardsProps) {
  const netGridKwh = gridImportKwh - gridExportKwh;

  return (
    <div className="grid grid-cols-2 gap-2">
      <MetricCard
        icon={<Sun className="w-4 h-4" />}
        label="Solar"
        value={formatKwh(solarGeneratedKwh)}
        subDetail={solarPeakKw != null ? `Peak: ${formatKw(solarPeakKw * 1000)}` : 'Generated today'}
        color={energySourceColors.solar}
        tint="#EAB30826"
      />
      <MetricCard
        icon={<Battery className="w-4 h-4" />}
        label="Battery"
        value={formatKwh(Math.abs(batteryCyclesKwh))}
        subDetail={batteryNetKwh != null ? `${batteryNetKwh.toFixed(1)} cycles today` : 'Net charged'}
        color={energySourceColors.battery}
        tint="#06B6D426"
      />
      <MetricCard
        icon={<Home className="w-4 h-4" />}
        label="House"
        value={formatKwh(houseConsumedKwh)}
        subDetail={houseAvgKw != null ? `Avg: ${formatKw(houseAvgKw * 1000)}` : 'Consumed today'}
        color={energySourceColors.house}
        tint="#3B82F626"
      />
      <MetricCard
        icon={<Zap className="w-4 h-4" />}
        label="Grid"
        value={formatKwh(Math.abs(netGridKwh))}
        subDetail={`Exp ${formatKwh(gridExportKwh)}, Imp ${formatKwh(gridImportKwh)}`}
        color={energySourceColors.grid}
        tint="#EC489926"
      />
    </div>
  );
}
