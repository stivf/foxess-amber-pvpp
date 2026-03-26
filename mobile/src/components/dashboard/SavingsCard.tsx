import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import {
  useTheme,
  priceColors,
  fontSize,
  fontWeight,
  spacing,
  radius,
} from '../../theme';
import type { SavingsSummary, AnalyticsSavingsResponse } from '../../types/api';

type Period = 'today' | 'week' | 'month';

interface SavingsCardProps {
  savings: SavingsSummary | null;
  analytics: AnalyticsSavingsResponse | null;
  onPeriodChange?: (period: 'day' | 'week' | 'month') => void;
}

export function SavingsCard({ savings, analytics, onPeriodChange }: SavingsCardProps) {
  const theme = useTheme();
  const [period, setPeriod] = useState<Period>('today');

  const handlePeriod = (p: Period) => {
    setPeriod(p);
    if (p === 'today') onPeriodChange?.('day');
    else if (p === 'week') onPeriodChange?.('week');
    else onPeriodChange?.('month');
  };

  const primaryAmount =
    period === 'today'
      ? savings?.today_dollars ?? 0
      : period === 'week'
      ? savings?.this_week_dollars ?? 0
      : savings?.this_month_dollars ?? 0;

  const importCosts = analytics?.grid_import_kwh
    ? analytics.grid_import_kwh * (analytics.avg_buy_price / 100)
    : null;
  const exportEarnings = analytics?.grid_export_kwh
    ? analytics.grid_export_kwh * (analytics.avg_sell_price / 100)
    : null;
  const netCost = importCosts != null && exportEarnings != null
    ? importCosts - exportEarnings
    : null;

  return (
    <View style={styles.container}>
      {/* Period selector */}
      <View style={[styles.periodSelector, { backgroundColor: theme.bgTertiary }]}>
        {(['today', 'week', 'month'] as Period[]).map(p => (
          <TouchableOpacity
            key={p}
            onPress={() => handlePeriod(p)}
            style={[
              styles.periodBtn,
              period === p && { backgroundColor: theme.bgPrimary },
            ]}
          >
            <Text
              style={[
                styles.periodText,
                { color: period === p ? theme.textPrimary : theme.textSecondary },
              ]}
            >
              {p === 'today' ? 'Today' : p === 'week' ? 'Week' : 'Month'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Primary savings number */}
      <View style={styles.savingsRow}>
        <Text style={[styles.savingsAmount, { color: priceColors.cheap2, fontVariant: ['tabular-nums'] }]}>
          ${primaryAmount.toFixed(2)}
        </Text>
        <Text style={[styles.savingsLabel, { color: theme.textSecondary }]}>
          saved {period}
        </Text>
      </View>

      {/* Breakdown */}
      {analytics && importCosts != null && (
        <View style={[styles.breakdown, { borderTopColor: theme.borderDefault }]}>
          <View style={styles.breakdownRow}>
            <Text style={[styles.breakdownLabel, { color: theme.textSecondary }]}>
              Import costs
            </Text>
            <Text style={[styles.breakdownValue, { color: theme.textPrimary, fontVariant: ['tabular-nums'] }]}>
              -${importCosts.toFixed(2)}
            </Text>
          </View>
          <View style={styles.breakdownRow}>
            <Text style={[styles.breakdownLabel, { color: theme.textSecondary }]}>
              Export earnings
            </Text>
            <Text style={[styles.breakdownValue, { color: priceColors.cheap2, fontVariant: ['tabular-nums'] }]}>
              +${(exportEarnings ?? 0).toFixed(2)}
            </Text>
          </View>
          {netCost != null && (
            <View style={[styles.breakdownRow, styles.netRow, { borderTopColor: theme.borderDefault }]}>
              <Text style={[styles.breakdownLabel, { color: theme.textPrimary, fontWeight: fontWeight.semibold }]}>
                Net cost
              </Text>
              <Text style={[styles.breakdownValue, { color: theme.textPrimary, fontVariant: ['tabular-nums'] }]}>
                ${Math.max(0, netCost).toFixed(2)}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing[3],
  },
  periodSelector: {
    flexDirection: 'row',
    borderRadius: radius.md,
    padding: spacing[1],
    gap: spacing[1],
  },
  periodBtn: {
    flex: 1,
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  periodText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  savingsRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing[2],
  },
  savingsAmount: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
  },
  savingsLabel: {
    fontSize: fontSize.sm,
  },
  breakdown: {
    borderTopWidth: 1,
    paddingTop: spacing[3],
    gap: spacing[2],
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  breakdownLabel: {
    fontSize: fontSize.sm,
  },
  breakdownValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  netRow: {
    borderTopWidth: 1,
    paddingTop: spacing[2],
    marginTop: spacing[1],
  },
});
