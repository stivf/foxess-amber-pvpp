'use client';

import { useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { formatDollars } from '@/lib/utils';
import type { SavingsSummary } from '@/types/api';

type Period = 'today' | 'week' | 'month';

interface SavingsCardProps {
  savings: SavingsSummary;
  // These would come from analytics API in a real implementation
  importCosts?: number;
  exportEarnings?: number;
  netCost?: number;
}

const PERIOD_SEGMENTS = [
  { value: 'today' as Period, label: 'Today' },
  { value: 'week' as Period, label: 'Week' },
  { value: 'month' as Period, label: 'Month' },
];

export function SavingsCard({ savings, importCosts = 1.2, exportEarnings = 3.6, netCost = 1.2 }: SavingsCardProps) {
  const [period, setPeriod] = useState<Period>('today');

  const savingsAmount =
    period === 'today' ? savings.today_dollars :
    period === 'week' ? savings.this_week_dollars :
    savings.this_month_dollars;

  const withoutBattery = savingsAmount + importCosts;

  return (
    <div className="rounded-md bg-[var(--bg-secondary)] border border-[var(--border-default)] p-4 space-y-4">
      {/* Period selector */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
          {period === 'today' ? "Today's" : period === 'week' ? "This Week's" : "This Month's"} Savings
        </h3>
        <SegmentedControl
          segments={PERIOD_SEGMENTS}
          value={period}
          onChange={setPeriod}
          className="text-xs"
        />
      </div>

      {/* Primary savings number */}
      <div className="flex items-end gap-2">
        <TrendingUp className="w-5 h-5 mb-1" style={{ color: '#059669' }} aria-hidden />
        <span
          className="text-3xl font-bold font-mono leading-none"
          style={{ color: '#059669' }}
          aria-label={`Saved ${formatDollars(savingsAmount)}`}
        >
          {formatDollars(savingsAmount)}
        </span>
      </div>

      <p className="text-sm text-[var(--text-secondary)]">
        vs {formatDollars(withoutBattery)} without battery
      </p>

      {/* Breakdown */}
      <div className="space-y-1.5 pt-2 border-t border-[var(--border-default)]">
        <div className="flex items-center justify-between text-sm">
          <span className="text-[var(--text-secondary)]">Import costs</span>
          <span className="font-mono text-[var(--text-primary)]">-{formatDollars(importCosts)}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-[var(--text-secondary)]">Export earnings</span>
          <span className="font-mono" style={{ color: '#059669' }}>+{formatDollars(exportEarnings)}</span>
        </div>
        <div className="flex items-center justify-between text-sm pt-1 border-t border-[var(--border-default)]">
          <span className="font-medium text-[var(--text-primary)]">Net cost</span>
          <span className="font-mono font-medium text-[var(--text-primary)]">{formatDollars(netCost)}</span>
        </div>
      </div>
    </div>
  );
}
