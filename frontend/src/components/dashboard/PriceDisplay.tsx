import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { getPriceColor } from '@/lib/colors';
import { formatPrice } from '@/lib/utils';
import type { PriceState } from '@/types/api';

interface PriceDisplayProps {
  price: PriceState;
}

export function PriceDisplay({ price }: PriceDisplayProps) {
  const bgColor = getPriceColor(price.current_per_kwh);
  const isNegative = price.current_per_kwh < 0;

  return (
    <div
      className="rounded-md p-4 flex flex-col items-center justify-center text-white"
      style={{ backgroundColor: bgColor }}
      aria-label={`Current price: ${formatPrice(price.current_per_kwh)} per kWh`}
    >
      <div className="flex items-end gap-1">
        <span className="text-4xl font-bold font-mono leading-none">
          {isNegative ? '-' : ''}{Math.abs(price.current_per_kwh).toFixed(1)}
        </span>
        <span className="text-sm text-white/80 mb-1">c/kWh</span>
      </div>

      <div className="flex items-center gap-1 mt-1">
        {price.descriptor === 'low' || price.descriptor === 'negative' ? (
          <TrendingDown className="w-3.5 h-3.5 text-white/80" aria-hidden />
        ) : price.descriptor === 'high' || price.descriptor === 'spike' ? (
          <TrendingUp className="w-3.5 h-3.5 text-white/80" aria-hidden />
        ) : (
          <Minus className="w-3.5 h-3.5 text-white/80" aria-hidden />
        )}
        <span className="text-xs text-white/80 capitalize">{price.descriptor}</span>
      </div>

      {price.renewables_pct > 0 && (
        <p className="text-xs text-white/60 mt-0.5 font-mono">
          {price.renewables_pct}% renewables
        </p>
      )}

      <p className="text-xs text-white/70 mt-2 font-mono">
        Feed-in: {formatPrice(price.feed_in_per_kwh)}
      </p>
    </div>
  );
}
