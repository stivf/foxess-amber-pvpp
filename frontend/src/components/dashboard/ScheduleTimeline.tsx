'use client';

import { getScheduleActionColor, getProfileColor } from '@/lib/colors';
import { formatTime } from '@/lib/utils';
import type { ScheduleSlot } from '@/types/api';

interface ScheduleTimelineProps {
  slots: ScheduleSlot[];
  height?: number;
}

function timeToPercent(isoString: string, dayStart: Date, dayEnd: Date): number {
  const t = new Date(isoString).getTime();
  const start = dayStart.getTime();
  const end = dayEnd.getTime();
  return Math.max(0, Math.min(100, ((t - start) / (end - start)) * 100));
}

export function ScheduleTimeline({ slots, height = 100 }: ScheduleTimelineProps) {
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(now);
  dayEnd.setHours(23, 59, 59, 999);

  const nowPct = timeToPercent(now.toISOString(), dayStart, dayEnd);

  const hourLabels = [0, 6, 12, 18, 24].map((h) => {
    const d = new Date(dayStart);
    d.setHours(h === 24 ? 23 : h, h === 24 ? 59 : 0, 0, 0);
    return {
      label: h === 0 ? '12a' : h === 6 ? '6a' : h === 12 ? '12p' : h === 18 ? '6p' : '12a',
      pct: (h / 24) * 100,
    };
  });

  if (!slots || slots.length === 0) {
    return (
      <div className="text-sm text-[var(--text-tertiary)] py-4 text-center">
        No schedule data available
      </div>
    );
  }

  return (
    <div style={{ height }}>
      {/* Action row */}
      <div className="relative h-8 rounded overflow-hidden mb-1" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
        {slots.map((slot, i) => {
          const left = timeToPercent(slot.start_time, dayStart, dayEnd);
          const right = timeToPercent(slot.end_time, dayStart, dayEnd);
          const width = right - left;
          if (width <= 0) return null;
          const color = getScheduleActionColor(slot.action);
          const label = slot.action === 'CHARGE' ? 'Charge' : slot.action === 'DISCHARGE' ? 'Discharge' : 'Hold';

          return (
            <div
              key={i}
              className="absolute top-0 bottom-0 flex items-center justify-center text-white text-xs font-medium overflow-hidden"
              style={{
                left: `${left}%`,
                width: `${width}%`,
                backgroundColor: `${color}cc`,
                borderRight: '1px solid var(--bg-primary)',
              }}
              title={`${label}: ${formatTime(slot.start_time)} – ${formatTime(slot.end_time)}\n${slot.reason}`}
            >
              {width > 8 ? label : ''}
            </div>
          );
        })}

        {/* NOW line */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10"
          style={{ left: `${nowPct}%` }}
        />
      </div>

      {/* Profile row */}
      <div className="relative h-6 rounded overflow-hidden mb-2" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
        {slots.map((slot, i) => {
          const left = timeToPercent(slot.start_time, dayStart, dayEnd);
          const right = timeToPercent(slot.end_time, dayStart, dayEnd);
          const width = right - left;
          if (width <= 0) return null;
          const color = getProfileColor(slot.profile_name);

          return (
            <div
              key={i}
              className="absolute top-0 bottom-0 flex items-center justify-center text-xs font-medium overflow-hidden"
              style={{
                left: `${left}%`,
                width: `${width}%`,
                backgroundColor: `${color}50`,
                color,
                borderRight: '1px solid var(--bg-primary)',
              }}
              title={slot.profile_name}
            >
              {width > 10 ? slot.profile_name : ''}
            </div>
          );
        })}

        {/* NOW line */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10"
          style={{ left: `${nowPct}%` }}
        />
      </div>

      {/* Hour labels */}
      <div className="relative h-4">
        {hourLabels.map(({ label, pct }) => (
          <span
            key={label}
            className="absolute text-xs text-[var(--text-tertiary)] -translate-x-1/2"
            style={{ left: `${pct}%` }}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
