import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  batteryStateColors,
  priceColors,
  spacing,
  radius,
  fontSize,
  fontWeight,
  useTheme,
} from '../theme';
import type { BatteryState, PriceState, SolarState, ScheduleState } from '../types/api';

interface StatusInfo {
  headline: string;
  subtext: string;
  accentColor: string;
}

function getStatusInfo(
  battery: BatteryState | null,
  price: PriceState | null,
  solar: SolarState | null,
  schedule: ScheduleState | null,
): StatusInfo {
  if (!battery || !price) {
    return {
      headline: 'Connecting...',
      subtext: 'Loading system status.',
      accentColor: priceColors.neutral,
    };
  }

  const action = schedule?.current_action ?? 'HOLD';
  const priceVal = price.current_per_kwh;
  const solarW = solar?.current_generation_w ?? 0;

  if (action === 'CHARGE') {
    if (solarW > 500) {
      return {
        headline: 'Storing solar energy',
        subtext: 'Solar generation exceeds house demand. Topping up battery.',
        accentColor: batteryStateColors.charging,
      };
    }
    return {
      headline: 'Charging from grid',
      subtext: `Price is ${priceVal.toFixed(1)}c/kWh — well below your threshold.`,
      accentColor: batteryStateColors.charging,
    };
  }

  if (action === 'DISCHARGE') {
    const savingPerKwh = (priceVal - price.feed_in_per_kwh) / 100;
    return {
      headline: priceVal > 50 ? 'Selling energy to the grid' : 'Powering your home from battery',
      subtext:
        priceVal > 50
          ? `Price spiked to ${priceVal.toFixed(1)}c/kWh. Earning ${priceVal.toFixed(0)}c for each kWh exported.`
          : `Grid price is ${priceVal.toFixed(1)}c/kWh. Saving you $${savingPerKwh.toFixed(2)}/kWh right now.`,
      accentColor: batteryStateColors.discharging,
    };
  }

  return {
    headline: 'Holding charge',
    subtext: `Price is moderate (${priceVal.toFixed(1)}c/kWh). Waiting for a better opportunity.`,
    accentColor: batteryStateColors.idle,
  };
}

interface StatusHeaderProps {
  battery: BatteryState | null;
  price: PriceState | null;
  solar: SolarState | null;
  schedule: ScheduleState | null;
}

export function StatusHeader({ battery, price, solar, schedule }: StatusHeaderProps) {
  const theme = useTheme();
  const { headline, subtext, accentColor } = getStatusInfo(battery, price, solar, schedule);

  return (
    <View style={[styles.container, { backgroundColor: theme.bgSecondary, borderLeftColor: accentColor }]}>
      <Text style={[styles.headline, { color: theme.textPrimary }]}>{headline}</Text>
      <Text style={[styles.subtext, { color: theme.textSecondary }]}>{subtext}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: spacing[4],
    marginBottom: spacing[3],
    padding: spacing[3],
    borderRadius: radius.md,
    borderLeftWidth: 3,
  },
  headline: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    marginBottom: 2,
  },
  subtext: {
    fontSize: fontSize.sm,
  },
});
