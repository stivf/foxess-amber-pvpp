import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import {
  priceColors,
  spacing,
  radius,
  fontSize,
  fontWeight,
  useTheme,
} from '../theme';
import type { SavingsSummary, AnalyticsSavingsResponse } from '../types/api';

type Period = 'today' | 'week' | 'month';

interface SavingsCardProps {
  savings: SavingsSummary | null;
  analyticsWeek: AnalyticsSavingsResponse | null;
  analyticsMonth: AnalyticsSavingsResponse | null;
  onPeriodChange?: (period: Period) => void;
}

export function SavingsCard({ savings, analyticsWeek, analyticsMonth, onPeriodChange }: SavingsCardProps) {
  const theme = useTheme();
  const [period, setPeriod] = useState<Period>('today');

  const handlePeriodChange = (p: Period) => {
    setPeriod(p);
    onPeriodChange?.(p);
  };

  const totalSavings =
    period === 'today'
      ? savings?.today_dollars ?? 0
      : period === 'week'
      ? savings?.this_week_dollars ?? 0
      : savings?.this_month_dollars ?? 0;

  const analyticsData = period === 'week' ? analyticsWeek : period === 'month' ? analyticsMonth : null;
  const importCost = analyticsData
    ? (analyticsData.grid_import_kwh * analyticsData.avg_buy_price) / 100
    : null;
  const exportEarnings = analyticsData
    ? (analyticsData.grid_export_kwh * analyticsData.avg_sell_price) / 100
    : null;

  const periods: { key: Period; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'week', label: 'Week' },
    { key: 'month', label: 'Month' },
  ];

  return (
    <View style={[styles.container, { backgroundColor: theme.bgSecondary }]}>
      <Text style={[styles.label, { color: theme.textSecondary }]}>Savings</Text>
      <Text style={[styles.savingsAmount, { color: priceColors.cheap2, fontFamily: 'monospace' }]}>
        {`$${totalSavings.toFixed(2)}`}
      </Text>

      {analyticsData && (
        <View style={styles.breakdown}>
          {importCost !== null && (
            <View style={styles.breakdownRow}>
              <Text style={[styles.breakdownLabel, { color: theme.textSecondary }]}>Import costs</Text>
              <Text style={[styles.breakdownValue, { color: theme.textPrimary, fontFamily: 'monospace' }]}>
                {`-$${importCost.toFixed(2)}`}
              </Text>
            </View>
          )}
          {exportEarnings !== null && (
            <View style={styles.breakdownRow}>
              <Text style={[styles.breakdownLabel, { color: theme.textSecondary }]}>Export earnings</Text>
              <Text style={[styles.breakdownValue, { color: priceColors.cheap2, fontFamily: 'monospace' }]}>
                {`+$${exportEarnings.toFixed(2)}`}
              </Text>
            </View>
          )}
        </View>
      )}

      <View style={[styles.periodSelector, { backgroundColor: theme.bgTertiary }]}>
        {periods.map((p) => (
          <TouchableOpacity
            key={p.key}
            style={[
              styles.periodButton,
              period === p.key && { backgroundColor: theme.bgPrimary },
            ]}
            onPress={() => handlePeriodChange(p.key)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.periodText,
                { color: period === p.key ? theme.textPrimary : theme.textSecondary },
              ]}
            >
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing[4],
    borderRadius: radius.md,
    gap: spacing[2],
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  savingsAmount: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
  },
  breakdown: {
    gap: 4,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  breakdownLabel: {
    fontSize: fontSize.sm,
  },
  breakdownValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  periodSelector: {
    flexDirection: 'row',
    borderRadius: radius.md,
    padding: 2,
    marginTop: spacing[1],
  },
  periodButton: {
    flex: 1,
    paddingVertical: spacing[1],
    alignItems: 'center',
    borderRadius: radius.sm,
  },
  periodText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
});
