import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { CartesianChart, Bar, Line, useChartPressState } from 'victory-native';
import { Circle } from '@shopify/react-native-skia';
import { format, parseISO } from 'date-fns';
import {
  getPriceColor,
  energySourceColors,
  priceColors,
  spacing,
  radius,
  fontSize,
  fontWeight,
  useTheme,
} from '../theme';
import type { PriceForecastInterval } from '../types/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_HEIGHT = 160;

interface ForecastChartProps {
  forecast: PriceForecastInterval[];
  expanded?: boolean;
  onToggleExpand?: () => void;
}

interface ChartDataPoint {
  x: number;
  price: number;
  label: string;
}

export function ForecastChart({ forecast, expanded = false, onToggleExpand }: ForecastChartProps) {
  const theme = useTheme();

  if (!forecast || forecast.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: theme.bgSecondary }]}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Price Forecast</Text>
        <Text style={[styles.empty, { color: theme.textTertiary }]}>No forecast data available</Text>
      </View>
    );
  }

  // Build chart data: index as x, price as y
  const data: ChartDataPoint[] = forecast.slice(0, expanded ? 48 : 24).map((interval, i) => ({
    x: i,
    price: interval.per_kwh,
    label: format(parseISO(interval.start_time), 'ha'),
  }));

  // Find the current time index
  const now = Date.now();
  const nowIndex = forecast.findIndex((f) => new Date(f.end_time).getTime() > now);

  return (
    <View style={[styles.container, { backgroundColor: theme.bgSecondary }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Price Forecast</Text>
        <TouchableOpacity onPress={onToggleExpand} activeOpacity={0.7}>
          <Text style={[styles.expandText, { color: priceColors.cheap2 }]}>
            {expanded ? 'Collapse' : 'Expand'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: expanded ? CHART_HEIGHT * 1.5 : CHART_HEIGHT }}>
        <CartesianChart
          data={data}
          xKey="x"
          yKeys={['price']}
          domainPadding={{ left: 10, right: 10, top: 10, bottom: 0 }}
        >
          {({ points, chartBounds }) => (
            <>
              {points.price.map((point, i) => {
                const priceVal = data[i]?.price ?? 0;
                const barColor = getPriceColor(priceVal);
                const barWidth = (chartBounds.right - chartBounds.left) / points.price.length - 1;

                return (
                  <React.Fragment key={i}>
                    {/* Price bar */}
                    <Bar
                      points={[point]}
                      chartBounds={chartBounds}
                      color={barColor}
                      roundedCorners={{ topLeft: 2, topRight: 2 }}
                    />
                    {/* NOW marker */}
                    {i === nowIndex && point.x !== undefined && (
                      <Circle cx={point.x} cy={chartBounds.top} r={3} color={priceColors.expensive2} />
                    )}
                  </React.Fragment>
                );
              })}
            </>
          )}
        </CartesianChart>
      </View>

      {/* X-axis labels */}
      <View style={styles.xLabels}>
        {data
          .filter((_, i) => i % (expanded ? 4 : 3) === 0)
          .map((d) => (
            <Text key={d.x} style={[styles.xLabel, { color: theme.textTertiary }]}>
              {d.label}
            </Text>
          ))}
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: priceColors.cheap2 }]} />
          <Text style={[styles.legendText, { color: theme.textSecondary }]}>Cheap</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: priceColors.neutral }]} />
          <Text style={[styles.legendText, { color: theme.textSecondary }]}>Neutral</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: priceColors.expensive2 }]} />
          <Text style={[styles.legendText, { color: theme.textSecondary }]}>Expensive</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.md,
    padding: spacing[3],
    gap: spacing[2],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  expandText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  empty: {
    fontSize: fontSize.sm,
    textAlign: 'center',
    paddingVertical: spacing[8],
  },
  xLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[1],
  },
  xLabel: {
    fontSize: 10,
  },
  legend: {
    flexDirection: 'row',
    gap: spacing[4],
    justifyContent: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: fontSize.xs,
  },
});
