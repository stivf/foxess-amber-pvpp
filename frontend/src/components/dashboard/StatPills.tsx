import { Battery, Zap, DollarSign, Sun, Shield } from 'lucide-react';
import { getBatterySocColor, getPriceColor, getProfileColor } from '@/lib/colors';
import { formatPrice, formatDollars, formatKw } from '@/lib/utils';
import type { StatusResponse } from '@/types/api';

interface StatPillsProps {
  status: StatusResponse;
}

function Pill({
  icon,
  value,
  color,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  value: string;
  color: string;
  label?: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-mono font-medium transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2"
      style={{
        backgroundColor: `${color}26`,
        color,
      }}
      aria-label={label}
    >
      <span className="w-3.5 h-3.5 flex-shrink-0">{icon}</span>
      <span>{value}</span>
    </button>
  );
}

export function StatPills({ status }: StatPillsProps) {
  const socColor = getBatterySocColor(status.battery.soc);
  const priceColor = getPriceColor(status.price.current_per_kwh);
  const profileColor = getProfileColor(status.active_profile.name);

  return (
    <div
      className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide"
      role="row"
      aria-label="System metrics"
    >
      <Pill
        icon={<Battery className="w-3.5 h-3.5" />}
        value={`${Math.round(status.battery.soc)}%`}
        color={socColor}
        label={`Battery: ${Math.round(status.battery.soc)}%`}
      />
      <Pill
        icon={<Zap className="w-3.5 h-3.5" />}
        value={formatPrice(status.price.current_per_kwh)}
        color={priceColor}
        label={`Price: ${formatPrice(status.price.current_per_kwh)}`}
      />
      <Pill
        icon={<DollarSign className="w-3.5 h-3.5" />}
        value={formatDollars(status.savings.today_dollars)}
        color="#059669"
        label={`Today's savings: ${formatDollars(status.savings.today_dollars)}`}
      />
      <Pill
        icon={<Sun className="w-3.5 h-3.5" />}
        value={formatKw(status.solar.current_generation_w)}
        color="#EAB308"
        label={`Solar: ${formatKw(status.solar.current_generation_w)}`}
      />
      <Pill
        icon={<Shield className="w-3.5 h-3.5" />}
        value={status.active_profile.name}
        color={profileColor}
        label={`Profile: ${status.active_profile.name}`}
      />
    </div>
  );
}
