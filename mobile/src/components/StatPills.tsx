import React from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  getPriceColor,
  getBatterySocColor,
  getProfileColor,
  priceColors,
  energySourceColors,
  spacing,
  radius,
  fontSize,
  fontWeight,
  useTheme,
  hexWithOpacity,
} from '../theme';
import type { BatteryState, PriceState, SolarState, SavingsSummary, ActiveProfile } from '../types/api';

interface StatPillProps {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  unit?: string;
  color: string;
  onPress?: () => void;
}

function StatPill({ icon, value, unit, color, onPress }: StatPillProps) {
  const theme = useTheme();
  const bg = hexWithOpacity(color, 0.15);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      style={[styles.pill, { backgroundColor: bg }]}
    >
      <Ionicons name={icon} size={14} color={color} />
      <Text style={[styles.pillValue, { color, fontFamily: 'monospace' }]}>{value}</Text>
      {unit ? <Text style={[styles.pillUnit, { color: theme.textSecondary }]}>{unit}</Text> : null}
    </TouchableOpacity>
  );
}

interface StatPillsProps {
  battery: BatteryState | null;
  price: PriceState | null;
  solar: SolarState | null;
  savings: SavingsSummary | null;
  activeProfile: ActiveProfile | null;
  onProfilePress?: () => void;
}

export function StatPills({
  battery,
  price,
  solar,
  savings,
  activeProfile,
  onProfilePress,
}: StatPillsProps) {
  const socColor = battery ? getBatterySocColor(battery.soc) : priceColors.neutral;
  const priceColor = price ? getPriceColor(price.current_per_kwh) : priceColors.neutral;
  const profileColor = activeProfile ? getProfileColor(activeProfile.name) : priceColors.neutral;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      <StatPill
        icon="battery-half"
        value={battery ? `${Math.round(battery.soc)}%` : '--'}
        color={socColor}
      />
      <StatPill
        icon="flash"
        value={price ? price.current_per_kwh.toFixed(1) : '--'}
        unit="c"
        color={priceColor}
      />
      <StatPill
        icon="cash"
        value={savings ? `$${savings.today_dollars.toFixed(2)}` : '--'}
        color={priceColors.cheap2}
      />
      <StatPill
        icon="sunny"
        value={solar ? `${(solar.current_generation_w / 1000).toFixed(1)}` : '--'}
        unit="kW"
        color={energySourceColors.solar}
      />
      <StatPill
        icon="shield-checkmark"
        value={activeProfile?.name ?? '--'}
        color={profileColor}
        onPress={onProfilePress}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    gap: spacing[2],
    flexDirection: 'row',
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    borderRadius: radius.full,
  },
  pillValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  pillUnit: {
    fontSize: fontSize.xs,
  },
});
