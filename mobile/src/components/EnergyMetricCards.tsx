import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  energySourceColors,
  spacing,
  radius,
  fontSize,
  fontWeight,
  useTheme,
} from '../theme';
import type { BatteryState, SolarState, GridState, AnalyticsSavingsResponse } from '../types/api';

interface MetricCardProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  subDetail: string;
  color: string;
  tintColor: string;
}

function MetricCard({ icon, label, value, subDetail, color, tintColor }: MetricCardProps) {
  const theme = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: tintColor, borderLeftColor: color }]}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={[styles.cardLabel, { color: theme.textSecondary }]}>{label}</Text>
      <Text style={[styles.cardValue, { color: theme.textPrimary, fontFamily: 'monospace' }]}>{value}</Text>
      <Text style={[styles.cardSub, { color: theme.textTertiary }]}>{subDetail}</Text>
    </View>
  );
}

interface EnergyMetricCardsProps {
  analytics: AnalyticsSavingsResponse | null;
  solar: SolarState | null;
  battery: BatteryState | null;
  grid: GridState | null;
}

export function EnergyMetricCards({ analytics, solar, battery, grid }: EnergyMetricCardsProps) {
  const solarKwh = analytics?.solar_generation_kwh ?? 0;
  const importKwh = analytics?.grid_import_kwh ?? 0;
  const exportKwh = analytics?.grid_export_kwh ?? 0;
  const batteryCycles = analytics?.battery_cycles ? (analytics.battery_cycles / 30).toFixed(1) : '--';

  const solarPeakW = solar?.current_generation_w ?? 0;
  const houseKwh = solarKwh + importKwh - exportKwh;

  return (
    <View style={styles.grid}>
      <MetricCard
        icon="sunny"
        label="Solar"
        value={`${solarKwh.toFixed(1)} kWh`}
        subDetail={`Now: ${(solarPeakW / 1000).toFixed(1)} kW`}
        color={energySourceColors.solar}
        tintColor={energySourceColors.solarTint}
      />
      <MetricCard
        icon="battery-charging"
        label="Battery"
        value={battery ? `${Math.round(battery.soc)}% SoC` : '--'}
        subDetail={`${batteryCycles} cycles/day`}
        color={energySourceColors.battery}
        tintColor={energySourceColors.batteryTint}
      />
      <MetricCard
        icon="home"
        label="House"
        value={`${houseKwh.toFixed(1)} kWh`}
        subDetail={analytics ? `Self-use: ${analytics.self_consumption_pct.toFixed(0)}%` : '--'}
        color={energySourceColors.house}
        tintColor={energySourceColors.houseTint}
      />
      <MetricCard
        icon="cellular"
        label="Grid"
        value={`${(exportKwh - importKwh).toFixed(1)} kWh`}
        subDetail={`Exp ${exportKwh.toFixed(1)}, Imp ${importKwh.toFixed(1)}`}
        color={energySourceColors.grid}
        tintColor={energySourceColors.gridTint}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  card: {
    width: '48%',
    padding: spacing[3],
    borderRadius: radius.md,
    borderLeftWidth: 3,
    gap: 2,
  },
  cardLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    marginTop: 2,
  },
  cardValue: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  cardSub: {
    fontSize: fontSize.xs,
  },
});
