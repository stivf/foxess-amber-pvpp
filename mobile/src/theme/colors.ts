// Design system color tokens — mirrors DESIGN_SYSTEM.md

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
  solarTint: 'rgba(234,179,8,0.15)',
  battery: '#06B6D4',
  batteryTint: 'rgba(6,182,212,0.15)',
  house: '#3B82F6',
  houseTint: 'rgba(59,130,246,0.15)',
  grid: '#EC4899',
  gridTint: 'rgba(236,72,153,0.15)',
} as const;

export const profileColors = {
  conservative: '#3B82F6',
  balanced: '#8B5CF6',
  aggressive: '#F59E0B',
  custom: '#EC4899',
} as const;

export const lightTheme = {
  bgPrimary: '#FFFFFF',
  bgSecondary: '#F9FAFB',
  bgTertiary: '#F3F4F6',
  textPrimary: '#111827',
  textSecondary: '#6B7280',
  textTertiary: '#9CA3AF',
  borderDefault: '#E5E7EB',
  borderStrong: '#D1D5DB',
} as const;

export const darkTheme = {
  bgPrimary: '#111827',
  bgSecondary: '#1F2937',
  bgTertiary: '#374151',
  textPrimary: '#F9FAFB',
  textSecondary: '#9CA3AF',
  textTertiary: '#6B7280',
  borderDefault: '#374151',
  borderStrong: '#4B5563',
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

export function getBatterySocColor(socPercent: number): string {
  if (socPercent >= 95) return batterySocColors.full;
  if (socPercent >= 60) return batterySocColors.high;
  if (socPercent >= 30) return batterySocColors.mid;
  if (socPercent >= 10) return batterySocColors.low;
  return batterySocColors.critical;
}

export function getProfileColor(profileName: string): string {
  const lower = profileName.toLowerCase();
  if (lower.includes('conservative')) return profileColors.conservative;
  if (lower.includes('balanced')) return profileColors.balanced;
  if (lower.includes('aggressive')) return profileColors.aggressive;
  return profileColors.custom;
}

export function hexWithOpacity(hex: string, opacity: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return hex;
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgba(${r},${g},${b},${opacity})`;
}
