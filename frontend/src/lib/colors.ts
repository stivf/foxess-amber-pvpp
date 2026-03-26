import type { PriceDescriptor, BatteryMode, ScheduleAction } from '@/types/api';

export const priceColors = {
  cheap3: '#064E3B',
  cheap2: '#059669',
  cheap1: '#34D399',
  neutral: '#6B7280',
  expensive1: '#F87171',
  expensive2: '#DC2626',
  expensive3: '#991B1B',
} as const;

export const batteryStateColors = {
  charging: '#059669',
  discharging: '#DC2626',
  idle: '#6B7280',
  holding: '#6B7280',
} as const;

export const batterySocColors = {
  full: '#059669',
  high: '#34D399',
  mid: '#FBBF24',
  low: '#F87171',
  critical: '#991B1B',
} as const;

export const energySourceColors = {
  solar: '#EAB308',
  battery: '#06B6D4',
  house: '#3B82F6',
  grid: '#EC4899',
} as const;

export const energySourceTints = {
  solar: '#EAB30826',
  battery: '#06B6D426',
  house: '#3B82F626',
  grid: '#EC489926',
} as const;

export const profileColors = {
  conservative: '#3B82F6',
  balanced: '#8B5CF6',
  aggressive: '#F59E0B',
  custom: '#EC4899',
  default: '#8B5CF6',
} as const;

export function getPriceColor(pricePerKwh: number): string {
  if (pricePerKwh < 0) return priceColors.cheap3;
  if (pricePerKwh < 5) return priceColors.cheap3;
  if (pricePerKwh < 15) return priceColors.cheap2;
  if (pricePerKwh < 25) return priceColors.cheap1;
  if (pricePerKwh < 35) return priceColors.neutral;
  if (pricePerKwh < 50) return priceColors.expensive1;
  if (pricePerKwh < 80) return priceColors.expensive2;
  return priceColors.expensive3;
}

export function getPriceTextColor(pricePerKwh: number): string {
  if (pricePerKwh < 25) return '#FFFFFF';
  if (pricePerKwh < 35) return '#FFFFFF';
  if (pricePerKwh >= 50) return '#FFFFFF';
  return '#FFFFFF';
}

export function getBatterySocColor(socPercent: number): string {
  if (socPercent >= 95) return batterySocColors.full;
  if (socPercent >= 60) return batterySocColors.high;
  if (socPercent >= 30) return batterySocColors.mid;
  if (socPercent >= 10) return batterySocColors.low;
  return batterySocColors.critical;
}

export function getBatteryModeColor(mode: BatteryMode): string {
  return batteryStateColors[mode] ?? batteryStateColors.idle;
}

export function getScheduleActionColor(action: ScheduleAction): string {
  switch (action) {
    case 'CHARGE': return batteryStateColors.charging;
    case 'DISCHARGE': return batteryStateColors.discharging;
    case 'HOLD': return batteryStateColors.holding;
    case 'AUTO': return '#8B5CF6';
    default: return batteryStateColors.idle;
  }
}

export function getPriceDescriptorColor(descriptor: PriceDescriptor): string {
  switch (descriptor) {
    case 'negative': return priceColors.cheap3;
    case 'low': return priceColors.cheap2;
    case 'neutral': return priceColors.neutral;
    case 'high': return priceColors.expensive2;
    case 'spike': return priceColors.expensive3;
    default: return priceColors.neutral;
  }
}

export function getProfileColor(profileName: string): string {
  const name = profileName.toLowerCase();
  if (name.includes('conservative')) return profileColors.conservative;
  if (name.includes('aggressive')) return profileColors.aggressive;
  if (name.includes('balanced')) return profileColors.balanced;
  return profileColors.custom;
}
