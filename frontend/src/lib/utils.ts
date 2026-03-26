import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(cents: number): string {
  return `${cents.toFixed(1)}c`;
}

export function formatDollars(dollars: number): string {
  return `$${Math.abs(dollars).toFixed(2)}`;
}

export function formatKw(watts: number): string {
  const kw = watts / 1000;
  if (Math.abs(kw) < 0.1) return '0.0 kW';
  return `${kw.toFixed(1)} kW`;
}

export function formatKwh(kwh: number): string {
  return `${kwh.toFixed(1)} kWh`;
}

export function formatSoc(soc: number): string {
  return `${Math.round(soc)}%`;
}

export function formatTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-AU', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return isoString;
  }
}

export function formatDate(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return isoString;
  }
}

export function formatRelativeTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffMins = Math.round(diffMs / 60000);

    if (Math.abs(diffMins) < 1) return 'now';
    if (diffMins > 0) {
      if (diffMins < 60) return `in ${diffMins}m`;
      const hours = Math.round(diffMins / 60);
      return `in ${hours}h`;
    } else {
      const absMins = Math.abs(diffMins);
      if (absMins < 60) return `${absMins}m ago`;
      const hours = Math.round(absMins / 60);
      return `${hours}h ago`;
    }
  } catch {
    return isoString;
  }
}

export function generateStatusHeadline(
  batteryMode: string,
  solarW: number,
  loadW: number,
  gridImportW: number,
  gridExportW: number,
  pricePerKwh: number,
): { headline: string; subtext: string } {
  const isCharging = batteryMode === 'charging';
  const isDischarging = batteryMode === 'discharging';
  const isHolding = batteryMode === 'holding' || batteryMode === 'idle';
  const hasSignificantSolar = solarW > 200;
  const isExportingToGrid = gridExportW > 100;

  if (isCharging && hasSignificantSolar && solarW > loadW) {
    return {
      headline: 'Storing solar energy',
      subtext: 'Solar generation exceeds house demand. Topping up battery.',
    };
  }

  if (isCharging && pricePerKwh < 20) {
    return {
      headline: 'Charging from grid',
      subtext: `Price is ${pricePerKwh.toFixed(0)}c/kWh — well below your threshold.`,
    };
  }

  if (isCharging) {
    return {
      headline: 'Charging battery',
      subtext: `Battery is charging at ${(loadW / 1000).toFixed(1)} kW.`,
    };
  }

  if (isDischarging && isExportingToGrid && pricePerKwh > 50) {
    return {
      headline: 'Selling energy to the grid',
      subtext: `Price spiked to ${pricePerKwh.toFixed(0)}c/kWh. Earning ${pricePerKwh.toFixed(0)}c for each kWh exported.`,
    };
  }

  if (isDischarging) {
    const savingPerKwh = pricePerKwh / 100;
    return {
      headline: 'Powering your home from battery',
      subtext: `Grid price is ${pricePerKwh.toFixed(0)}c/kWh. Saving you $${savingPerKwh.toFixed(2)}/kWh right now.`,
    };
  }

  if (isHolding && hasSignificantSolar) {
    return {
      headline: 'Self-consumption mode',
      subtext: 'Solar is covering house demand. Holding battery charge.',
    };
  }

  return {
    headline: 'Holding charge',
    subtext: `Price is moderate (${pricePerKwh.toFixed(0)}c/kWh). Waiting for a better opportunity.`,
  };
}
