'use client';

import {
  ComposedChart,
  Bar,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { getPriceColor } from '@/lib/colors';
import type { PriceForecastInterval } from '@/types/api';

interface ChartDataPoint {
  time: string;
  timeLabel: string;
  price: number;
  solarKw?: number;
  houseKw?: number;
  priceColor: string;
  isNow: boolean;
}

interface ForecastChartProps {
  forecast: PriceForecastInterval[];
  height?: number;
}

function formatHour(isoString: string): string {
  try {
    const date = new Date(isoString);
    const h = date.getHours();
    if (h === 0) return '12a';
    if (h === 12) return '12p';
    if (h < 12) return `${h}a`;
    return `${h - 12}p`;
  } catch {
    return '';
  }
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-md border border-[var(--border-default)] bg-[var(--bg-secondary)] p-3 shadow-lg text-sm">
      <p className="font-medium text-[var(--text-primary)] mb-1">{label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2">
          <span
            className="inline-block w-2.5 h-2.5 rounded-sm"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-[var(--text-secondary)]">{entry.name}:</span>
          <span className="font-mono text-[var(--text-primary)]">
            {entry.name === 'Price' ? `${entry.value.toFixed(1)}c` : `${entry.value.toFixed(1)} kW`}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ForecastChart({ forecast, height = 280 }: ForecastChartProps) {
  const now = new Date();

  const data: ChartDataPoint[] = forecast.slice(0, 48).map((interval) => {
    const startDate = new Date(interval.start_time);
    const isNow =
      startDate <= now && new Date(interval.end_time) > now;

    return {
      time: interval.start_time,
      timeLabel: formatHour(interval.start_time),
      price: interval.per_kwh,
      priceColor: getPriceColor(interval.per_kwh),
      isNow,
    };
  });

  const nowIndex = data.findIndex((d) => d.isNow);
  const nowLabel = nowIndex >= 0 ? data[nowIndex].timeLabel : undefined;

  const maxPrice = Math.max(...data.map((d) => d.price), 30);

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 50, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="timeLabel"
            tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
            tickLine={false}
            axisLine={{ stroke: 'var(--border-default)' }}
            interval={3}
          />
          {/* Left Y-axis: kW */}
          <YAxis
            yAxisId="kw"
            orientation="left"
            tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
            tickLine={false}
            axisLine={false}
            label={{
              value: 'kW',
              angle: -90,
              position: 'insideLeft',
              style: { fontSize: 10, fill: 'var(--text-tertiary)' },
              offset: 10,
            }}
            domain={[0, 6]}
          />
          {/* Right Y-axis: c/kWh */}
          <YAxis
            yAxisId="price"
            orientation="right"
            tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
            tickLine={false}
            axisLine={false}
            domain={[0, Math.ceil(maxPrice / 20) * 20]}
            label={{
              value: 'c/kWh',
              angle: 90,
              position: 'insideRight',
              style: { fontSize: 10, fill: 'var(--text-tertiary)' },
            }}
          />

          <Tooltip content={<CustomTooltip />} />

          <Legend
            wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
            formatter={(value) => (
              <span style={{ color: 'var(--text-secondary)' }}>{value}</span>
            )}
          />

          {/* Price bars */}
          <Bar
            yAxisId="price"
            dataKey="price"
            name="Price"
            fill="#6B728040"
            radius={[2, 2, 0, 0]}
            maxBarSize={12}
            // Each bar colored individually via cell
          />

          {/* NOW reference line */}
          {nowLabel && (
            <ReferenceLine
              yAxisId="price"
              x={nowLabel}
              stroke="#EF4444"
              strokeWidth={2}
              strokeDasharray="4 4"
              label={{
                value: 'NOW',
                position: 'top',
                style: { fontSize: 10, fill: '#EF4444', fontWeight: 600 },
              }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// Enhanced version with colored price bars using custom bar rendering
export function ForecastChartColored({ forecast, height = 280 }: ForecastChartProps) {
  const now = new Date();

  const data = forecast.slice(0, 48).map((interval) => {
    const startDate = new Date(interval.start_time);
    const isNow = startDate <= now && new Date(interval.end_time) > now;

    return {
      time: interval.start_time,
      timeLabel: formatHour(interval.start_time),
      price: interval.per_kwh,
      priceColor: getPriceColor(interval.per_kwh),
      isNow,
    };
  });

  const nowIndex = data.findIndex((d) => d.isNow);
  const nowLabel = nowIndex >= 0 ? data[nowIndex].timeLabel : undefined;
  const maxPrice = Math.max(...data.map((d) => d.price), 30);

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 50, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="timeLabel"
            tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
            tickLine={false}
            axisLine={{ stroke: 'var(--border-default)' }}
            interval={3}
          />
          <YAxis
            yAxisId="price"
            orientation="right"
            tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
            tickLine={false}
            axisLine={false}
            domain={[0, Math.ceil(maxPrice / 20) * 20]}
          />
          <Tooltip content={<CustomTooltip />} />

          <Bar
            yAxisId="price"
            dataKey="price"
            name="Price"
            radius={[2, 2, 0, 0]}
            maxBarSize={14}
            fill="#6B7280"
          />

          {nowLabel && (
            <ReferenceLine
              yAxisId="price"
              x={nowLabel}
              stroke="#EF4444"
              strokeWidth={2}
              strokeDasharray="4 4"
              label={{
                value: 'NOW',
                position: 'top',
                style: { fontSize: 10, fill: '#EF4444', fontWeight: 600 },
              }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
