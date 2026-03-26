import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, energySourceColors, fontSize, fontWeight, spacing, radius } from '../../theme';
import type { SolarState, GridState, BatteryState, AnalyticsSavingsResponse } from '../../types/api';

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
    <View
      style={[
        styles.card,
        {
          backgroundColor: tintColor,
          borderColor: theme.borderDefault,
          borderLeftColor: color,
        },
      ]}
    >
      <Ionicons name={icon} size={16} color={color} />
      <Text style={[styles.cardLabel, { color: theme.textSecondary }]}>{label}</Text>
      <Text style={[styles.cardValue, { color: theme.textPrimary, fontVariant: ['tabular-nums'] }]}>
        {value}
      </Text>
      <Text style={[styles.cardSubDetail, { color: theme.textTertiary }]} numberOfLines={2}>
        {subDetail}
      </Text>
    </View>
  );
}

interface EnergyMetricCardsProps {
  solar: SolarState | null;
  grid: GridState | null;
  battery: BatteryState | null;
  analytics: AnalyticsSavingsResponse | null;
}

export function EnergyMetricCards({ solar, grid, battery, analytics }: EnergyMetricCardsProps) {
  const todayData = analytics?.breakdown?.[analytics.breakdown.length - 1];

  const solarKwh = todayData?.solar_kwh ?? (solar?.forecast_today_kwh ?? 0);
  const solarPeakKw = solar ? (solar.current_generation_w / 1000) : 0;

  const batteryKwh = analytics ? (analytics.grid_import_kwh * 0.3) : 0; // estimate
  const batteryCycles = analytics ? (analytics.battery_cycles / 30) : 0;

  const houseKwh = todayData ? (todayData.solar_kwh - todayData.export_kwh + todayData.import_kwh) : 0;

  const exportKwh = todayData?.export_kwh ?? 0;
  const importKwh = todayData?.import_kwh ?? 0;
  const netGridKwh = exportKwh - importKwh;

  return (
    <View style={styles.grid}>
      <MetricCard
        icon="sunny"
        label="Solar"
        value={`${solarKwh.toFixed(1)} kWh`}
        subDetail={`Peak: ${solarPeakKw.toFixed(1)} kW`}
        color={energySourceColors.solar}
        tintColor={energySourceColors.solarTint}
      />
      <MetricCard
        icon="battery-charging"
        label="Battery"
        value={`${batteryKwh.toFixed(1)} kWh`}
        subDetail={`${batteryCycles.toFixed(1)} cycles today`}
        color={energySourceColors.battery}
        tintColor={energySourceColors.batteryTint}
      />
      <MetricCard
        icon="home"
        label="House"
        value={`${Math.max(0, houseKwh).toFixed(1)} kWh`}
        subDetail={`Avg: ${battery ? (Math.abs(battery.power_w) / 1000).toFixed(1) : '0.0'} kW`}
        color={energySourceColors.house}
        tintColor={energySourceColors.houseTint}
      />
      <MetricCard
        icon="git-network"
        label="Grid"
        value={`Net ${netGridKwh >= 0 ? '+' : ''}${netGridKwh.toFixed(1)}`}
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
    flex: 1,
    minWidth: '45%',
    borderRadius: radius.md,
    borderWidth: 1,
    borderLeftWidth: 3,
    padding: spacing[3],
    gap: spacing[1],
  },
  cardLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  cardValue: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  cardSubDetail: {
    fontSize: fontSize.xs,
    lineHeight: 16,
  },
});
