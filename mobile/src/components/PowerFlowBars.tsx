import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  energySourceColors,
  spacing,
  radius,
  fontSize,
  fontWeight,
  useTheme,
} from '../theme';
import type { BatteryState, SolarState, GridState } from '../types/api';

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

  return (
    <View style={styles.barRow}>
      <Text style={[styles.barLabel, { color: theme.textPrimary }]}>{label}</Text>
      <View style={[styles.barTrack, { backgroundColor: tintColor }]}>
        <View
          style={[
            styles.barFill,
            { backgroundColor: color, width: `${Math.max(pct * 100, pct > 0 ? 2 : 0)}%` },
          ]}
        />
      </View>
      <Text style={[styles.barValue, { color: theme.textSecondary, fontFamily: 'monospace' }]}>
        {kw}
      </Text>
    </View>
  );
}

interface PowerFlowBarsProps {
  battery: BatteryState | null;
  solar: SolarState | null;
  grid: GridState | null;
  houseConsumptionW?: number;
}

export function PowerFlowBars({ battery, solar, grid, houseConsumptionW }: PowerFlowBarsProps) {
  const theme = useTheme();

  const solarW = solar?.current_generation_w ?? 0;
  const gridImportW = grid?.import_w ?? 0;
  const gridExportW = grid?.export_w ?? 0;
  const batteryPowerW = battery?.power_w ?? 0;
  const batteryChargeW = batteryPowerW > 0 ? batteryPowerW : 0;
  const batteryDischargeW = batteryPowerW < 0 ? -batteryPowerW : 0;
  const houseW = houseConsumptionW ?? (solarW + gridImportW + batteryDischargeW - gridExportW - batteryChargeW);

  const maxFrom = Math.max(solarW, gridImportW, batteryDischargeW, 100);
  const maxTo = Math.max(houseW, batteryChargeW, gridExportW, 100);

  return (
    <View style={[styles.container, { backgroundColor: theme.bgSecondary }]}>
      <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>FROM</Text>
      <FlowBar
        label="Solar"
        valueW={solarW}
        maxW={maxFrom}
        color={energySourceColors.solar}
        tintColor={energySourceColors.solarTint}
      />
      <FlowBar
        label="Grid"
        valueW={gridImportW}
        maxW={maxFrom}
        color={energySourceColors.grid}
        tintColor={energySourceColors.gridTint}
      />
      <FlowBar
        label="Battery"
        valueW={batteryDischargeW}
        maxW={maxFrom}
        color={energySourceColors.battery}
        tintColor={energySourceColors.batteryTint}
      />

      <Text style={[styles.sectionLabel, { color: theme.textSecondary, marginTop: spacing[2] }]}>TO</Text>
      <FlowBar
        label="House"
        valueW={houseW}
        maxW={maxTo}
        color={energySourceColors.house}
        tintColor={energySourceColors.houseTint}
      />
      <FlowBar
        label="Battery"
        valueW={batteryChargeW}
        maxW={maxTo}
        color={energySourceColors.battery}
        tintColor={energySourceColors.batteryTint}
      />
      <FlowBar
        label="Grid"
        valueW={gridExportW}
        maxW={maxTo}
        color={energySourceColors.grid}
        tintColor={energySourceColors.gridTint}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing[3],
    borderRadius: radius.md,
    gap: 6,
  },
  sectionLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    letterSpacing: 0.5,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  barLabel: {
    width: 46,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  barTrack: {
    flex: 1,
    height: 10,
    borderRadius: radius.full,
    overflow: 'hidden',
    minWidth: 2,
  },
  barFill: {
    height: '100%',
    borderRadius: radius.full,
    minWidth: 2,
  },
  barValue: {
    width: 36,
    fontSize: fontSize.xs,
    textAlign: 'right',
  },
});
