import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { VictoryLine, VictoryChart, VictoryAxis, VictoryArea } from 'victory-native';
import { useTheme, priceColors, fontSize, fontWeight, spacing, radius } from '../../theme';
import type { AnalyticsSavingsResponse } from '../../types/api';
import { format, parseISO } from 'date-fns';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface SavingsChartProps {
  analytics: AnalyticsSavingsResponse | null;
}

export function SavingsChart({ analytics }: SavingsChartProps) {
  const theme = useTheme();

  if (!analytics || !analytics.breakdown.length) {
    return (
      <View style={[styles.placeholder, { backgroundColor: theme.bgTertiary }]}>
        <Text style={{ color: theme.textTertiary, fontSize: fontSize.sm }}>
          No data for selected period
        </Text>
      </View>
    );
  }

  // Cumulative savings
  let cumulative = 0;
  const chartData = analytics.breakdown.map((d, i) => {
    cumulative += d.savings_dollars;
    return { x: i, y: cumulative, date: d.date };
  });

  const totalSavings = analytics.total_savings_dollars;
  const maxY = Math.max(...chartData.map(d => d.y), 0.1);
  const chartWidth = SCREEN_WIDTH - spacing[8] * 2;

  const xTickValues = chartData
    .map((_, i) => i)
    .filter(i => i % Math.ceil(chartData.length / 5) === 0);

  const xTickFormat = (i: number) => {
    const d = chartData[i];
    if (!d) return '';
    try {
      return format(parseISO(d.date), 'd MMM');
    } catch {
      return '';
    }
  };

  return (
    <View style={styles.container}>
      {/* Total */}
      <View style={styles.totalRow}>
        <Text style={[styles.totalLabel, { color: theme.textSecondary }]}>Total Savings</Text>
        <Text style={[styles.totalAmount, { color: priceColors.cheap2, fontVariant: ['tabular-nums'] }]}>
          ${totalSavings.toFixed(2)}
        </Text>
      </View>

      <VictoryChart
        width={chartWidth}
        height={200}
        padding={{ top: 10, bottom: 36, left: 48, right: 16 }}
      >
        <VictoryArea
          data={chartData}
          style={{
            data: {
              fill: `${priceColors.cheap2}33`,
              stroke: priceColors.cheap2,
              strokeWidth: 2,
            },
          }}
          animate={{ duration: 400 }}
        />

        <VictoryAxis
          tickValues={xTickValues}
          tickFormat={xTickFormat}
          style={{
            axis: { stroke: theme.borderDefault },
            tickLabels: { fill: theme.textTertiary, fontSize: 10 },
            grid: { stroke: 'transparent' },
          }}
        />
        <VictoryAxis
          dependentAxis
          tickFormat={(v: number) => `$${v.toFixed(0)}`}
          style={{
            axis: { stroke: theme.borderDefault },
            tickLabels: { fill: theme.textTertiary, fontSize: 10 },
            grid: { stroke: theme.borderDefault, strokeOpacity: 0.3 },
          }}
        />
      </VictoryChart>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing[2],
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  totalLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  totalAmount: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
  },
  placeholder: {
    height: 200,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
