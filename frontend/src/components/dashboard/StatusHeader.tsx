import { getScheduleActionColor } from '@/lib/colors';
import { generateStatusHeadline } from '@/lib/utils';
import type { StatusResponse } from '@/types/api';

interface StatusHeaderProps {
  status: StatusResponse;
}

export function StatusHeader({ status }: StatusHeaderProps) {
  const { battery, solar, grid, price } = status;
  const houseLoad = (solar.current_generation_w + grid.import_w) - (grid.export_w + battery.power_w);

  const { headline, subtext } = generateStatusHeadline(
    battery.mode,
    solar.current_generation_w,
    Math.max(houseLoad, 0),
    grid.import_w,
    grid.export_w,
    price.current_per_kwh,
  );

  const borderColor = getScheduleActionColor(status.schedule.current_action);

  return (
    <div
      className="rounded-md bg-[var(--bg-secondary)] border border-[var(--border-default)] px-4 py-3"
      style={{ borderLeft: `4px solid ${borderColor}` }}
      role="banner"
      aria-label="System status"
    >
      <p className="text-base font-semibold text-[var(--text-primary)]">{headline}</p>
      <p className="text-sm text-[var(--text-secondary)] mt-0.5">{subtext}</p>
    </div>
  );
}
