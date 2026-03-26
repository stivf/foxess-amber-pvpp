import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme, energySourceColors, fontSize, fontWeight, spacing, radius } from '../../theme';
import type { SolarState, GridState, BatteryState } from '../../types/api';

interface PowerFlowBarsProps {
  solar: SolarState | null;
  grid: GridState | null;
  battery: BatteryState | null;
  houseConsumption?: number;
}

interface FlowBarProps {
  label: string;
  valueW: number;
  maxW: number;
  color: string;
  tintColor: string;
}

function FlowBar({ label, valueW, maxW, color, tintColor }: FlowBarProps) {
  const theme = useTheme();
  const pct = maxW > 0 ? Math.min(valueW / maxW, 1) : 0;
  const kw = (valueW / 1000).toFixed(1);
  const isActive = valueW > 10;

  return (
    <View style={styles.barRow}>
      <Text style={[styles.barLabel, { color: theme.textSecondary }]} numberOfLines={1}>
        {label}
      </Text>
      <View style={[styles.barTrack, { backgroundColor: tintColor }]}>
        <View
          style={[
            styles.barFill,
            {
              width: `${pct * 100}%`,
              backgroundColor: isActive ? color : 'transparent',
              minWidth: isActive ? 2 : 0,
            },
          ]}
        />
      </View>
      <Text style={[styles.barValue, { color: theme.textPrimary, fontVariant: ['tabular-nums'] }]}>
        {kw}
      </Text>
    </View>
  );
}

export function PowerFlowBars({ solar, grid, battery, houseConsumption = 1500 }: PowerFlowBarsProps) {
  const theme = useTheme();

  const solarW = solar?.current_generation_w ?? 0;
  const gridImportW = grid?.import_w ?? 0;
  const gridExportW = grid?.export_w ?? 0;
  const batteryChargeW = battery && battery.power_w > 0 ? battery.power_w : 0;
  const batteryDischargeW = battery && battery.power_w < 0 ? -battery.power_w : 0;

  const maxFromW = Math.max(solarW, gridImportW, batteryDischargeW, 1000);
  const maxToW = Math.max(houseConsumption, batteryChargeW, gridExportW, 1000);

  return (
    <View style={styles.container}>
      <Text style={[styles.sectionLabel, { color: theme.textTertiary }]}>FROM</Text>

      <FlowBar
        label="Solar"
        valueW={solarW}
        maxW={maxFromW}
        color={energySourceColors.solar}
        tintColor={energySourceColors.solarTint}
      />
      <FlowBar
        label="Grid"
        valueW={gridImportW}
        maxW={maxFromW}
        color={energySourceColors.grid}
        tintColor={energySourceColors.gridTint}
      />
      <FlowBar
        label="Battery"
        valueW={batteryDischargeW}
        maxW={maxFromW}
        color={energySourceColors.battery}
        tintColor={energySourceColors.batteryTint}
      />

      <View style={[styles.divider, { backgroundColor: theme.borderDefault }]} />

      <Text style={[styles.sectionLabel, { color: theme.textTertiary }]}>TO</Text>

      <FlowBar
        label="House"
        valueW={houseConsumption}
        maxW={maxToW}
        color={energySourceColors.house}
        tintColor={energySourceColors.houseTint}
      />
      <FlowBar
        label="Battery"
        valueW={batteryChargeW}
        maxW={maxToW}
        color={energySourceColors.battery}
        tintColor={energySourceColors.batteryTint}
      />
      <FlowBar
        label="Grid"
        valueW={gridExportW}
        maxW={maxToW}
        color={energySourceColors.grid}
        tintColor={energySourceColors.gridTint}
      />

      <Text style={[styles.unit, { color: theme.textTertiary }]}>kW</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing[2],
  },
  sectionLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing[1],
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  barLabel: {
    width: 50,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  barTrack: {
    flex: 1,
    height: 16,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: radius.full,
  },
  barValue: {
    width: 32,
    fontSize: fontSize.xs,
    textAlign: 'right',
  },
  divider: {
    height: 1,
    marginVertical: spacing[1],
  },
  unit: {
    fontSize: fontSize.xs,
    textAlign: 'right',
  },
});
