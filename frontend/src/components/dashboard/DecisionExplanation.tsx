'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { generateStatusHeadline } from '@/lib/utils';
import type { StatusResponse } from '@/types/api';
import { formatTime } from '@/lib/utils';

interface DecisionExplanationProps {
  status: StatusResponse;
  collapsible?: boolean;
}

export function DecisionExplanation({ status, collapsible = false }: DecisionExplanationProps) {
  const [expanded, setExpanded] = useState(!collapsible);

  const { battery, solar, grid, price, schedule } = status;
  const houseLoad = Math.max(
    solar.current_generation_w + grid.import_w - grid.export_w,
    0,
  );

  const { headline } = generateStatusHeadline(
    battery.mode,
    solar.current_generation_w,
    houseLoad,
    grid.import_w,
    grid.export_w,
    price.current_per_kwh,
  );

  const nextActionTime = formatTime(schedule.next_change_at);
  const nextActionLabel =
    schedule.next_action === 'CHARGE' ? 'charge' :
    schedule.next_action === 'DISCHARGE' ? 'discharge' : 'hold';

  const explanation = buildExplanation(status, headline, nextActionLabel, nextActionTime);

  if (collapsible) {
    return (
      <div className="rounded-md bg-[var(--bg-secondary)] border border-[var(--border-default)]">
        <button
          className="w-full flex items-center justify-between px-4 py-3 text-left"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
        >
          <span className="text-sm font-medium text-[var(--text-primary)]">
            Why is the system doing this?
          </span>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-[var(--text-secondary)]" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[var(--text-secondary)]" />
          )}
        </button>
        {expanded && (
          <div className="px-4 pb-4">
            <p className="text-sm text-[var(--text-primary)] leading-relaxed">{explanation}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="rounded-md bg-[var(--bg-secondary)] border border-[var(--border-default)] px-4 py-3"
      aria-label="Decision explanation"
    >
      <p className="text-sm text-[var(--text-primary)] leading-relaxed">{explanation}</p>
    </div>
  );
}

function buildExplanation(
  status: StatusResponse,
  headline: string,
  nextAction: string,
  nextActionTime: string,
): string {
  const { battery, price, schedule } = status;
  const parts: string[] = [];

  // Current state
  if (battery.mode === 'charging') {
    const powerKw = (battery.power_w / 1000).toFixed(1);
    parts.push(`Battery is charging at ${powerKw} kW.`);
    if (price.current_per_kwh < 20) {
      parts.push(`Price is ${price.current_per_kwh.toFixed(0)}c/kWh — below the import threshold.`);
    }
  } else if (battery.mode === 'discharging') {
    const powerKw = (Math.abs(battery.power_w) / 1000).toFixed(1);
    parts.push(`Battery is discharging at ${powerKw} kW.`);
    if (price.current_per_kwh > 40) {
      parts.push(`Grid price is ${price.current_per_kwh.toFixed(0)}c/kWh — above the export threshold.`);
    }
  } else {
    parts.push(`Holding battery at ${Math.round(battery.soc)}%.`);
    parts.push(`Price is moderate (${price.current_per_kwh.toFixed(0)}c/kWh).`);
  }

  // Next action
  if (schedule.next_change_at) {
    parts.push(`Next scheduled action: ${nextAction} starting at ${nextActionTime}.`);
  }

  // Override notice
  if (schedule.is_override) {
    parts.push('Manual override is active.');
  }

  return parts.join(' ');
}
