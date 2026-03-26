import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme, fontSize, fontWeight, spacing, radius, batteryStateColors, priceColors } from '../../theme';
import type { BatteryState, PriceState, SolarState, GridState, ScheduleAction } from '../../types/api';

interface StatusHeaderProps {
  battery: BatteryState | null;
  price: PriceState | null;
  solar: SolarState | null;
  grid: GridState | null;
  currentAction: ScheduleAction | null;
}

function getStatusText(
  battery: BatteryState | null,
  price: PriceState | null,
  solar: SolarState | null,
  grid: GridState | null,
  currentAction: ScheduleAction | null,
): { headline: string; subtext: string; accentColor: string } {
  if (!battery || !price) {
    return {
      headline: 'Connecting...',
      subtext: 'Loading system status.',
      accentColor: '#6B7280',
    };
  }

  const solarW = solar?.current_generation_w ?? 0;
  const importW = grid?.import_w ?? 0;
  const exportW = grid?.export_w ?? 0;

  if (battery.mode === 'charging' && importW < 100 && solarW > 500) {
    return {
      headline: 'Storing solar energy',
      subtext: 'Solar generation exceeds house demand. Topping up battery.',
      accentColor: batteryStateColors.charging,
    };
  }

  if (battery.mode === 'charging' && importW > 100) {
    return {
      headline: 'Charging from grid',
      subtext: `Price is ${price.current_per_kwh.toFixed(0)}c/kWh — below your threshold.`,
      accentColor: batteryStateColors.charging,
    };
  }

  if (battery.mode === 'discharging' && exportW > 100) {
    const saving = (price.current_per_kwh / 100).toFixed(2);
    return {
      headline: 'Selling energy to the grid',
      subtext: `Price spiked to ${price.current_per_kwh.toFixed(0)}c/kWh. Earning ${price.current_per_kwh.toFixed(0)}c for each kWh exported.`,
      accentColor: batteryStateColors.discharging,
    };
  }

  if (battery.mode === 'discharging') {
    const saving = ((price.current_per_kwh - price.feed_in_per_kwh) / 100).toFixed(2);
    return {
      headline: 'Powering your home from battery',
      subtext: `Grid price is ${price.current_per_kwh.toFixed(0)}c/kWh. Saving you $${saving}/kWh right now.`,
      accentColor: batteryStateColors.discharging,
    };
  }

  if (currentAction === 'HOLD' || battery.mode === 'holding') {
    return {
      headline: 'Holding charge',
      subtext: `Price is moderate (${price.current_per_kwh.toFixed(0)}c/kWh). Waiting for a better opportunity.`,
      accentColor: batteryStateColors.idle,
    };
  }

  if (solarW > 500) {
    return {
      headline: 'Self-consumption mode',
      subtext: 'Slowly charging from solar. Holding for afternoon peak.',
      accentColor: batteryStateColors.charging,
    };
  }

  return {
    headline: 'System active',
    subtext: 'Battery Brain is monitoring your energy.',
    accentColor: batteryStateColors.idle,
  };
}

export function StatusHeader({ battery, price, solar, grid, currentAction }: StatusHeaderProps) {
  const theme = useTheme();
  const { headline, subtext, accentColor } = getStatusText(battery, price, solar, grid, currentAction);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.bgSecondary,
          borderColor: theme.borderDefault,
          borderLeftColor: accentColor,
        },
      ]}
    >
      <Text style={[styles.headline, { color: theme.textPrimary }]}>{headline}</Text>
      <Text style={[styles.subtext, { color: theme.textSecondary }]}>{subtext}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderLeftWidth: 3,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  headline: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing[1],
  },
  subtext: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
});
