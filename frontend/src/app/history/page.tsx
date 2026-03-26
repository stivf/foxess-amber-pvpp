'use client';

import { useState, useEffect, useCallback } from 'react';
import { Download } from 'lucide-react';
import { NavBar } from '@/components/shared/NavBar';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { SavingsChart } from '@/components/history/SavingsChart';
import { api } from '@/lib/api';
import type { AnalyticsSavings } from '@/types/api';
import { formatKwh } from '@/lib/utils';

type Period = 'day' | 'week' | 'month' | 'year';

const PERIODS: Array<{ value: Period; label: string }> = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
];

export default function HistoryPage() {
  const [period, setPeriod] = useState<Period>('month');
  const [analytics, setAnalytics] = useState<AnalyticsSavings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getSavings(period);
      setAnalytics(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function downloadCsv() {
    if (!analytics) return;
    const rows = [
      ['Date', 'Savings ($)', 'Solar (kWh)', 'Import (kWh)', 'Export (kWh)'],
      ...analytics.breakdown.map((d) => [
        d.date,
        d.savings_dollars.toFixed(2),
        d.solar_kwh.toFixed(1),
        d.import_kwh.toFixed(1),
        d.export_kwh.toFixed(1),
      ]),
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `battery-brain-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <NavBar />

      <main className="max-w-screen-xl mx-auto px-4 py-4 space-y-4">
        {/* Period selector */}
        <div className="flex items-center gap-4">
          <div
            className="inline-flex rounded-md border p-0.5"
            style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-default)' }}
          >
            {PERIODS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setPeriod(value)}
                className="px-3 py-1.5 text-sm font-medium rounded transition-all"
                style={
                  period === value
                    ? { backgroundColor: 'var(--text-primary)', color: 'var(--bg-primary)' }
                    : { color: 'var(--text-secondary)' }
                }
              >
                {label}
              </button>
            ))}
          </div>

          {analytics && (
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {new Date(analytics.from).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} –{' '}
              {new Date(analytics.to).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          )}

          <button
            onClick={downloadCsv}
            disabled={!analytics}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border transition-colors disabled:opacity-50"
            style={{
              borderColor: 'var(--border-default)',
              color: 'var(--text-secondary)',
              backgroundColor: 'var(--bg-secondary)',
            }}
          >
            <Download className="w-3.5 h-3.5" />
            CSV
          </button>
        </div>

        {loading && !analytics && (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <div
            className="rounded-md border p-4 text-sm"
            style={{ backgroundColor: '#DC262610', borderColor: '#DC262640', color: '#DC2626' }}
          >
            {error}
          </div>
        )}

        {analytics && (
          <>
            {/* Total savings headline */}
            <Card>
              <CardContent>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      Total savings this {period}
                    </p>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-4xl font-bold font-mono" style={{ color: '#059669' }}>
                        ${analytics.total_savings_dollars.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-6">
                    <div className="text-center">
                      <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Avg buy</p>
                      <p className="text-lg font-bold font-mono" style={{ color: 'var(--text-primary)' }}>
                        {analytics.avg_buy_price.toFixed(1)}c
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Avg sell</p>
                      <p className="text-lg font-bold font-mono" style={{ color: 'var(--text-primary)' }}>
                        {analytics.avg_sell_price.toFixed(1)}c
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Cycles</p>
                      <p className="text-lg font-bold font-mono" style={{ color: 'var(--text-primary)' }}>
                        {analytics.battery_cycles}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Savings chart */}
                {analytics.breakdown.length > 1 && (
                  <div className="mt-6">
                    <SavingsChart analytics={analytics} />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Summary stat cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card leftBorderColor="#EAB308">
                <CardContent>
                  <p className="text-xs font-medium uppercase tracking-wide mb-1" style={{ color: '#EAB308' }}>
                    Solar Generated
                  </p>
                  <p className="text-2xl font-bold font-mono" style={{ color: 'var(--text-primary)' }}>
                    {formatKwh(analytics.solar_generation_kwh)}
                  </p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                    {analytics.self_consumption_pct.toFixed(1)}% self-consumed
                  </p>
                </CardContent>
              </Card>

              <Card leftBorderColor="#EC4899">
                <CardContent>
                  <p className="text-xs font-medium uppercase tracking-wide mb-1" style={{ color: '#EC4899' }}>
                    Grid Import
                  </p>
                  <p className="text-2xl font-bold font-mono" style={{ color: 'var(--text-primary)' }}>
                    {formatKwh(analytics.grid_import_kwh)}
                  </p>
                </CardContent>
              </Card>

              <Card leftBorderColor="#059669">
                <CardContent>
                  <p className="text-xs font-medium uppercase tracking-wide mb-1" style={{ color: '#059669' }}>
                    Grid Export
                  </p>
                  <p className="text-2xl font-bold font-mono" style={{ color: 'var(--text-primary)' }}>
                    {formatKwh(analytics.grid_export_kwh)}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Self-consumption bar */}
            <Card>
              <CardHeader>
                <CardTitle>Self-Consumption Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm" style={{ color: 'var(--text-secondary)' }}>
                    <span>Self-consumed</span>
                    <span>Exported</span>
                  </div>
                  <div
                    className="h-6 rounded-full overflow-hidden"
                    style={{ backgroundColor: 'var(--bg-tertiary)' }}
                    role="meter"
                    aria-valuenow={analytics.self_consumption_pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Self-consumption rate: ${analytics.self_consumption_pct.toFixed(1)}%`}
                  >
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${analytics.self_consumption_pct}%`,
                        backgroundColor: '#059669',
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-sm font-mono font-medium" style={{ color: 'var(--text-primary)' }}>
                    <span>{analytics.self_consumption_pct.toFixed(1)}%</span>
                    <span>{(100 - analytics.self_consumption_pct).toFixed(1)}%</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Daily breakdown table */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between w-full">
                  <CardTitle>Daily Breakdown</CardTitle>
                  <button
                    onClick={downloadCsv}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded"
                    style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-tertiary)' }}
                  >
                    <Download className="w-3 h-3" />
                    CSV
                  </button>
                </div>
              </CardHeader>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
                      {['Date', 'Savings', 'Solar', 'Import', 'Export'].map((h) => (
                        <th
                          key={h}
                          className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide"
                          style={{ color: 'var(--text-tertiary)' }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.breakdown.slice().reverse().map((row) => (
                      <tr
                        key={row.date}
                        className="border-b last:border-0 hover:bg-[var(--bg-tertiary)] transition-colors"
                        style={{ borderColor: 'var(--border-default)' }}
                      >
                        <td className="px-4 py-2" style={{ color: 'var(--text-primary)' }}>
                          {new Date(row.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                        </td>
                        <td className="px-4 py-2 font-mono font-medium" style={{ color: '#059669' }}>
                          ${row.savings_dollars.toFixed(2)}
                        </td>
                        <td className="px-4 py-2 font-mono" style={{ color: 'var(--text-secondary)' }}>
                          {row.solar_kwh.toFixed(1)} kWh
                        </td>
                        <td className="px-4 py-2 font-mono" style={{ color: 'var(--text-secondary)' }}>
                          {row.import_kwh.toFixed(1)} kWh
                        </td>
                        <td className="px-4 py-2 font-mono" style={{ color: 'var(--text-secondary)' }}>
                          {row.export_kwh.toFixed(1)} kWh
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </main>
    </>
  );
}
