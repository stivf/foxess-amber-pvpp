'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { AnalyticsSavings } from '@/types/api';

interface SavingsChartProps {
  analytics: AnalyticsSavings;
  height?: number;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div
      className="rounded-md border p-3 text-sm shadow-lg"
      style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
    >
      <p className="font-medium mb-1">{label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span style={{ color: 'var(--text-secondary)' }}>{entry.name}:</span>
          <span className="font-mono font-medium">${entry.value.toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}

export function SavingsChart({ analytics, height = 260 }: SavingsChartProps) {
  const data = analytics.breakdown.map((d) => ({
    date: new Date(d.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }),
    savings: d.savings_dollars,
    cumulative: 0,
  }));

  // Compute cumulative
  let sum = 0;
  data.forEach((d) => {
    sum += d.savings;
    d.cumulative = sum;
  });

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="savingsGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#059669" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#059669" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-default)" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
            tickLine={false}
            axisLine={false}
            interval={Math.floor(data.length / 6)}
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => `$${v.toFixed(0)}`}
            width={48}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="cumulative"
            name="Cumulative savings"
            stroke="#059669"
            strokeWidth={2}
            fill="url(#savingsGradient)"
            dot={false}
            activeDot={{ r: 4, fill: '#059669' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
