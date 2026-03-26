import React, { useState } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity } from 'react-native';
import { VictoryBar, VictoryAxis, VictoryChart, VictoryArea, VictoryLine, VictoryVoronoiContainer } from 'victory-native';
import { useTheme, getPriceColor, energySourceColors, fontSize, fontWeight, spacing, radius } from '../../theme';
import type { PriceForecastInterval } from '../../types/api';
import { format, parseISO } from 'date-fns';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface ForecastChartProps {
  forecast: PriceForecastInterval[];
  expanded?: boolean;
  onToggleExpand?: () => void;
}

export function ForecastChart({ forecast, expanded = false, onToggleExpand }: ForecastChartProps) {
  const theme = useTheme();
  const chartHeight = expanded ? 280 : 160;
  const chartWidth = SCREEN_WIDTH - spacing[8] * 2 - spacing[4] * 2;

  const now = new Date();

  const priceData = forecast.map((interval, i) => ({
    x: i,
    y: interval.per_kwh,
    time: interval.start_time,
    fill: getPriceColor(interval.per_kwh),
  }));

  // Find NOW index
  const nowIndex = forecast.findIndex(f => new Date(f.end_time) > now);

  const xTickValues = forecast
    .map((_, i) => i)
    .filter(i => i % 4 === 0); // every 2 hours (30-min intervals)

  const xTickFormat = (i: number) => {
    const interval = forecast[i];
    if (!interval) return '';
    return format(parseISO(interval.start_time), 'ha');
  };

  if (!forecast.length) {
    return (
      <View style={[styles.placeholder, { backgroundColor: theme.bgTertiary }]}>
        <Text style={{ color: theme.textTertiary, fontSize: fontSize.sm }}>
          Loading forecast...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.textSecondary }]}>Price Forecast</Text>
        {onToggleExpand && (
          <TouchableOpacity onPress={onToggleExpand}>
            <Text style={[styles.expandBtn, { color: theme.textSecondary }]}>
              {expanded ? 'Collapse' : 'Expand'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <VictoryChart
        width={chartWidth}
        height={chartHeight}
        padding={{ top: 10, bottom: 36, left: 40, right: 16 }}
        domainPadding={{ x: 4 }}
      >
        {/* Price bars */}
        <VictoryBar
          data={priceData}
          style={{
            data: {
              fill: ({ datum }: { datum: typeof priceData[0] }) => datum.fill,
              opacity: 0.85,
            },
          }}
          barRatio={0.9}
          animate={{ duration: 200 }}
        />

        {/* NOW marker */}
        {nowIndex >= 0 && (
          <VictoryLine
            data={[
              { x: nowIndex, y: 0 },
              { x: nowIndex, y: Math.max(...priceData.map(d => d.y), 50) },
            ]}
            style={{
              data: {
                stroke: theme.textPrimary,
                strokeWidth: 2,
                strokeDasharray: '4,4',
              },
            }}
          />
        )}

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
          tickFormat={(v: number) => `${v}c`}
          style={{
            axis: { stroke: theme.borderDefault },
            tickLabels: { fill: theme.textTertiary, fontSize: 10 },
            grid: { stroke: theme.borderDefault, strokeOpacity: 0.4 },
          }}
        />
      </VictoryChart>

      {/* Legend */}
      <View style={styles.legend}>
        <Text style={[styles.legendText, { color: theme.textTertiary }]}>
          c/kWh — tap bars for detail
        </Text>
        {nowIndex >= 0 && (
          <Text style={[styles.legendText, { color: theme.textTertiary }]}>
            | NOW marker shown
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing[2],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  expandBtn: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  placeholder: {
    height: 160,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legend: {
    flexDirection: 'row',
    gap: spacing[2],
    justifyContent: 'flex-end',
  },
  legendText: {
    fontSize: fontSize.xs,
  },
});
