import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme, priceColors, fontSize, fontWeight, spacing, radius } from '../../theme';

interface ImpactSummaryProps {
  exportLevel: number;
  preservationLevel: number;
  importLevel: number;
  batteryCapacityKwh?: number;
}

const EXPORT_THRESHOLDS = ['80c/kWh', '60c/kWh', '40c/kWh', 'feed-in rate + margin', 'feed-in rate'];
const IMPORT_THRESHOLDS = ['< 5c/kWh', '< 10c/kWh', '< 20c/kWh', '< 30c/kWh', '< avg forecast'];
const RESERVE_PCTS = [80, 50, 30, 15, 5];

export function ImpactSummary({
  exportLevel,
  preservationLevel,
  importLevel,
  batteryCapacityKwh = 10.4,
}: ImpactSummaryProps) {
  const theme = useTheme();

  const reservePct = RESERVE_PCTS[preservationLevel - 1] ?? 30;
  const reserveKwh = ((reservePct / 100) * batteryCapacityKwh).toFixed(1);
  const hoursBackup = (parseFloat(reserveKwh) / 1.5).toFixed(0); // assume 1.5kW avg load

  const exportThreshold = EXPORT_THRESHOLDS[exportLevel - 1] ?? '40c/kWh';
  const importThreshold = IMPORT_THRESHOLDS[importLevel - 1] ?? '< 20c/kWh';

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.bgSecondary, borderColor: theme.borderDefault },
      ]}
    >
      <Text style={[styles.heading, { color: theme.textSecondary }]}>With these settings:</Text>

      <View style={styles.row}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Reserve</Text>
        <Text style={[styles.value, { color: theme.textPrimary, fontVariant: ['tabular-nums'] }]}>
          {reservePct}% ({reserveKwh} kWh — ~{hoursBackup}h backup)
        </Text>
      </View>

      <View style={styles.row}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Export</Text>
        <Text style={[styles.value, { color: theme.textPrimary }]}>
          When price &gt; {exportThreshold}
        </Text>
      </View>

      <View style={styles.row}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Import</Text>
        <Text style={[styles.value, { color: theme.textPrimary }]}>
          When price {importThreshold}
        </Text>
      </View>

      <View style={[styles.divider, { backgroundColor: theme.borderDefault }]} />

      <View style={styles.row}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Est. daily</Text>
        <Text style={[styles.value, { color: priceColors.cheap2, fontVariant: ['tabular-nums'] }]}>
          $2.10 - $3.80 savings
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing[3],
    gap: spacing[2],
  },
  heading: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    marginBottom: spacing[1],
  },
  row: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  label: {
    width: 60,
    fontSize: fontSize.sm,
  },
  value: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  divider: {
    height: 1,
    marginVertical: spacing[1],
  },
});
