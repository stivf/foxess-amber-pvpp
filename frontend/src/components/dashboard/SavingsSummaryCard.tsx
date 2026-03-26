'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { SavingsSummary, AnalyticsSavings } from '@/types/api';

interface SavingsSummaryCardProps {
  savings: SavingsSummary;
  analytics?: AnalyticsSavings | null;
}

type Period = 'today' | 'week' | 'month';

export function SavingsSummaryCard({ savings, analytics }: SavingsSummaryCardProps) {
  const [period, setPeriod] = useState<Period>('today');

  const savingsAmount =
    period === 'today' ? savings.today_dollars :
    period === 'week' ? savings.this_week_dollars :
    savings.this_month_dollars;

  const periodLabel = period === 'today' ? 'Today' : period === 'week' ? 'This Week' : 'This Month';

  return (
    <div className="h-full flex flex-col">
      <p className="text-sm font-semibold text-[var(--text-primary)] mb-3">{periodLabel}&apos;s Savings</p>

      {/* Primary savings number */}
      <div className="flex items-baseline gap-1 mb-1">
        <span className="text-3xl font-bold font-mono" style={{ color: '#059669' }}>
          ${Math.abs(savingsAmount).toFixed(2)}
        </span>
      </div>

      {/* Cost breakdown from analytics */}
      {analytics && period === 'today' && analytics.breakdown.length > 0 && (() => {
        const today = analytics.breakdown[analytics.breakdown.length - 1];
        const importCost = today.import_kwh * (analytics.avg_buy_price / 100);
        const exportEarning = today.export_kwh * (analytics.avg_sell_price / 100);
        return (
          <div className="space-y-1 mb-3">
            <div className="flex justify-between text-sm">
              <span style={{ color: 'var(--text-secondary)' }}>Import costs:</span>
              <span className="font-mono" style={{ color: '#DC2626' }}>-${importCost.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span style={{ color: 'var(--text-secondary)' }}>Export earnings:</span>
              <span className="font-mono" style={{ color: '#059669' }}>+${exportEarning.toFixed(2)}</span>
            </div>
            <div
              className="flex justify-between text-sm pt-1 border-t"
              style={{ borderColor: 'var(--border-default)' }}
            >
              <span style={{ color: 'var(--text-secondary)' }}>Net cost:</span>
              <span className="font-mono font-medium" style={{ color: 'var(--text-primary)' }}>
                ${Math.max(0, importCost - exportEarning).toFixed(2)}
              </span>
            </div>
          </div>
        );
      })()}

      {/* Period selector */}
      <div className="mt-auto flex gap-1">
        {(['today', 'week', 'month'] as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={cn(
              'flex-1 py-1 text-xs font-medium rounded transition-colors capitalize',
              period === p
                ? 'text-white'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
            )}
            style={
              period === p
                ? { backgroundColor: '#059669' }
                : { backgroundColor: 'var(--bg-tertiary)' }
            }
          >
            {p === 'today' ? 'Today' : p === 'week' ? 'Week' : 'Month'}
          </button>
        ))}
      </div>
    </div>
  );
}
