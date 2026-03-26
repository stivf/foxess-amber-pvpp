import React, { useEffect, useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  VictoryLine,
  VictoryChart,
  VictoryAxis,
  VictoryArea,
  VictoryBar,
  VictoryTooltip,
  VictoryVoronoiContainer,
} from 'victory-native';
import { format, parseISO, subDays, subMonths } from 'date-fns';

import { useAppStore } from '../store';
import { api } from '../services/api';
import { Card } from '../components/common/Card';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { SectionHeader } from '../components/common/SectionHeader';

import {
  priceColors,
  energySourceColors,
  spacing,
  radius,
  fontSize,
  fontWeight,
  useTheme,
} from '../theme';
import type { AnalyticsSavingsResponse } from '../types/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_WIDTH = SCREEN_WIDTH - spacing[4] * 2 - spacing[4] * 2;

type Period = 'week' | 'month' | 'year';

function SavingsLineChart({ data }: { data: AnalyticsSavingsResponse | null }) {
  const theme = useTheme();

  if (!data?.breakdown?.length) {
    return (
      <View style={[chartStyles.placeholder, { backgroundColor: theme.bgTertiary }]}>
        <Text style={{ color: theme.textTertiary, fontSize: fontSize.sm }}>No data available</Text>
      </View>
    );
  }

  const chartData = data.breakdown.map((d, i) => ({
    x: i,
    y: d.savings_dollars,
    label: `$${d.savings_dollars.toFixed(2)}`,
    date: format(parseISO(d.date), 'MMM d'),
  }));

  const xTickValues = chartData
    .map((_, i) => i)
    .filter(i => i % Math.ceil(chartData.length / 6) === 0);

  return (
    <VictoryChart
      width={CHART_WIDTH}
      height={180}
      padding={{ top: 20, bottom: 40, left: 44, right: 16 }}
      containerComponent={
        <VictoryVoronoiContainer
          voronoiDimension="x"
          labels={({ datum }: { datum: typeof chartData[0] }) => datum.label}
          labelComponent={
            <VictoryTooltip
              style={{ fontSize: 10, fill: theme.textPrimary }}
              flyoutStyle={{ fill: theme.bgSecondary, stroke: theme.borderDefault }}
            />
          }
        />
      }
    >
      <VictoryArea
        data={chartData}
        style={{
          data: {
            fill: priceColors.cheap2,
            fillOpacity: 0.15,
            stroke: priceColors.cheap2,
            strokeWidth: 2,
          },
        }}
        interpolation="monotoneX"
        animate={{ duration: 300 }}
      />
      <VictoryAxis
        tickValues={xTickValues}
        tickFormat={(i: number) => chartData[i]?.date ?? ''}
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
  );
}

function EnergyBarChart({ data }: { data: AnalyticsSavingsResponse | null }) {
  const theme = useTheme();

  if (!data?.breakdown?.length) return null;

  const chartData = data.breakdown.slice(-14).map((d, i) => ({
    x: i,
    solar: d.solar_kwh,
    import: d.import_kwh,
    export: d.export_kwh,
    date: format(parseISO(d.date), 'd'),
  }));

  const maxY = Math.max(...chartData.map(d => Math.max(d.solar, d.import, d.export)), 1);

  const xTickValues = chartData.map((_, i) => i).filter(i => i % 2 === 0);

  return (
    <VictoryChart
      width={CHART_WIDTH}
      height={160}
      padding={{ top: 10, bottom: 36, left: 44, right: 16 }}
      domain={{ y: [0, maxY] }}
    >
      <VictoryBar
        data={chartData.map(d => ({ x: d.x, y: d.solar }))}
        style={{ data: { fill: energySourceColors.solar, opacity: 0.85 } }}
        barRatio={0.9}
      />
      <VictoryLine
        data={chartData.map(d => ({ x: d.x, y: d.import }))}
        style={{ data: { stroke: energySourceColors.grid, strokeWidth: 2 } }}
      />
      <VictoryLine
        data={chartData.map(d => ({ x: d.x, y: d.export }))}
        style={{ data: { stroke: energySourceColors.house, strokeWidth: 2, strokeDasharray: '4,4' } }}
      />
      <VictoryAxis
        tickValues={xTickValues}
        tickFormat={(i: number) => chartData[i]?.date ?? ''}
        style={{
          axis: { stroke: theme.borderDefault },
          tickLabels: { fill: theme.textTertiary, fontSize: 10 },
        }}
      />
      <VictoryAxis
        dependentAxis
        tickFormat={(v: number) => `${v.toFixed(0)}`}
        style={{
          axis: { stroke: theme.borderDefault },
          tickLabels: { fill: theme.textTertiary, fontSize: 10 },
          grid: { stroke: theme.borderDefault, strokeOpacity: 0.3 },
        }}
      />
    </VictoryChart>
  );
}

const chartStyles = StyleSheet.create({
  placeholder: {
    height: 160,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

interface StatRowProps {
  label: string;
  value: string;
  sub?: string;
  valueColor?: string;
}

function StatRow({ label, value, sub, valueColor }: StatRowProps) {
  const theme = useTheme();
  return (
    <View style={rowStyles.row}>
      <View style={rowStyles.left}>
        <Text style={[rowStyles.label, { color: theme.textSecondary }]}>{label}</Text>
        {sub && <Text style={[rowStyles.sub, { color: theme.textTertiary }]}>{sub}</Text>}
      </View>
      <Text style={[rowStyles.value, { color: valueColor ?? theme.textPrimary, fontFamily: 'monospace' }]}>
        {value}
      </Text>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing[2] },
  left: { flex: 1 },
  label: { fontSize: fontSize.sm },
  sub: { fontSize: fontSize.xs, marginTop: 2 },
  value: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
});

export function HistoryScreen() {
  const theme = useTheme();
  const { analyticsWeek, analyticsMonth, setAnalytics } = useAppStore();

  const [period, setPeriod] = useState<Period>('week');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async (p: Period) => {
    setLoading(true);
    try {
      const now = new Date();
      let from: string;
      if (p === 'week') from = subDays(now, 7).toISOString();
      else if (p === 'month') from = subMonths(now, 1).toISOString();
      else from = subMonths(now, 12).toISOString();

      const data = await api.getAnalyticsSavings(p === 'year' ? 'month' : p, from);
      if (p === 'week' || p === 'year') setAnalytics('week', data);
      else setAnalytics('month', data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [setAnalytics]);

  useEffect(() => { loadData(period); }, [period, loadData]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData(period);
    setRefreshing(false);
  }, [period, loadData]);

  const currentData = period === 'week' ? analyticsWeek : analyticsMonth;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.bgPrimary }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.borderDefault }]}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>History</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.textSecondary} />
        }
      >
        {/* Period selector */}
        <View style={styles.section}>
          <View style={[styles.periodSelector, { backgroundColor: theme.bgTertiary }]}>
            {(['week', 'month', 'year'] as Period[]).map(p => (
              <TouchableOpacity
                key={p}
                onPress={() => setPeriod(p)}
                style={[
                  styles.periodButton,
                  period === p && { backgroundColor: theme.bgPrimary },
                ]}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.periodText,
                  { color: period === p ? theme.textPrimary : theme.textSecondary },
                ]}>
                  {p === 'week' ? 'Week' : p === 'month' ? 'Month' : 'Year'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {loading && !currentData ? (
          <LoadingSpinner />
        ) : (
          <>
            {/* Total savings */}
            {currentData && (
              <View style={styles.section}>
                <Card leftBorderColor={priceColors.cheap2}>
                  <Text style={[styles.savingsLabel, { color: theme.textSecondary }]}>
                    Total Savings — {period}
                  </Text>
                  <Text style={[styles.savingsAmount, { color: priceColors.cheap2, fontFamily: 'monospace' }]}>
                    ${currentData.total_savings_dollars.toFixed(2)}
                  </Text>
                  <Text style={[styles.savingsSub, { color: theme.textTertiary }]}>
                    Avg. ${(currentData.total_savings_dollars / Math.max(currentData.breakdown.length, 1)).toFixed(2)}/day
                  </Text>
                </Card>
              </View>
            )}

            {/* Savings chart */}
            <View style={styles.section}>
              <Card>
                <SectionHeader title="Daily Savings" />
                <SavingsLineChart data={currentData} />
              </Card>
            </View>

            {/* Energy breakdown */}
            <View style={styles.section}>
              <Card>
                <SectionHeader title="Energy (kWh)" />
                <EnergyBarChart data={currentData} />

                {/* Chart legend */}
                <View style={styles.legendRow}>
                  {[
                    { color: energySourceColors.solar, label: 'Solar' },
                    { color: energySourceColors.grid, label: 'Import' },
                    { color: energySourceColors.house, label: 'Export' },
                  ].map(item => (
                    <View key={item.label} style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                      <Text style={[styles.legendText, { color: theme.textSecondary }]}>{item.label}</Text>
                    </View>
                  ))}
                </View>
              </Card>
            </View>

            {/* Key metrics */}
            {currentData && (
              <View style={styles.section}>
                <SectionHeader title="Summary" />
                <Card>
                  <View style={styles.statsContainer}>
                    <StatRow
                      label="Solar Generated"
                      value={`${currentData.solar_generation_kwh.toFixed(1)} kWh`}
                      valueColor={energySourceColors.solar}
                    />
                    <View style={[styles.divider, { backgroundColor: theme.borderDefault }]} />
                    <StatRow
                      label="Grid Imported"
                      value={`${currentData.grid_import_kwh.toFixed(1)} kWh`}
                      sub={`Avg ${currentData.avg_buy_price.toFixed(1)}c/kWh`}
                    />
                    <View style={[styles.divider, { backgroundColor: theme.borderDefault }]} />
                    <StatRow
                      label="Grid Exported"
                      value={`${currentData.grid_export_kwh.toFixed(1)} kWh`}
                      sub={`Avg ${currentData.avg_sell_price.toFixed(1)}c/kWh`}
                      valueColor={priceColors.cheap2}
                    />
                    <View style={[styles.divider, { backgroundColor: theme.borderDefault }]} />
                    <StatRow
                      label="Self-Consumption"
                      value={`${currentData.self_consumption_pct.toFixed(0)}%`}
                    />
                    <View style={[styles.divider, { backgroundColor: theme.borderDefault }]} />
                    <StatRow
                      label="Battery Cycles"
                      value={`${currentData.battery_cycles}`}
                    />
                  </View>
                </Card>
              </View>
            )}

            {/* Daily breakdown table */}
            {currentData?.breakdown && currentData.breakdown.length > 0 && (
              <View style={styles.section}>
                <SectionHeader title="Daily Breakdown" />
                <Card>
                  {/* Table header */}
                  <View style={[styles.tableHeader, { borderBottomColor: theme.borderDefault }]}>
                    {['Date', 'Savings', 'Solar', 'Import', 'Export'].map(h => (
                      <Text key={h} style={[styles.tableHeaderText, { color: theme.textTertiary }]}>{h}</Text>
                    ))}
                  </View>
                  {currentData.breakdown.slice(-14).reverse().map((row, i) => (
                    <View
                      key={row.date}
                      style={[
                        styles.tableRow,
                        { borderBottomColor: theme.borderDefault },
                        i % 2 === 0 && { backgroundColor: theme.bgTertiary + '80' },
                      ]}
                    >
                      <Text style={[styles.tableCell, { color: theme.textSecondary }]}>
                        {format(parseISO(row.date), 'MMM d')}
                      </Text>
                      <Text style={[styles.tableCell, { color: priceColors.cheap2, fontFamily: 'monospace' }]}>
                        ${row.savings_dollars.toFixed(2)}
                      </Text>
                      <Text style={[styles.tableCell, { color: theme.textPrimary, fontFamily: 'monospace' }]}>
                        {row.solar_kwh.toFixed(1)}
                      </Text>
                      <Text style={[styles.tableCell, { color: theme.textPrimary, fontFamily: 'monospace' }]}>
                        {row.import_kwh.toFixed(1)}
                      </Text>
                      <Text style={[styles.tableCell, { color: theme.textPrimary, fontFamily: 'monospace' }]}>
                        {row.export_kwh.toFixed(1)}
                      </Text>
                    </View>
                  ))}
                </Card>
              </View>
            )}
          </>
        )}

        <View style={{ height: spacing[8] }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderBottomWidth: 1,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  scroll: { flex: 1 },
  content: { paddingVertical: spacing[4] },
  section: {
    paddingHorizontal: spacing[4],
    marginBottom: spacing[4],
  },
  periodSelector: {
    flexDirection: 'row',
    borderRadius: radius.md,
    padding: 2,
  },
  periodButton: {
    flex: 1,
    paddingVertical: spacing[2],
    alignItems: 'center',
    borderRadius: radius.sm,
  },
  periodText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  savingsLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    marginBottom: spacing[1],
  },
  savingsAmount: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
  },
  savingsSub: {
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  legendRow: {
    flexDirection: 'row',
    gap: spacing[4],
    justifyContent: 'center',
    marginTop: spacing[2],
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
  statsContainer: {
    gap: 0,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: -spacing[4],
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingBottom: spacing[2],
    marginBottom: spacing[1],
  },
  tableHeaderText: {
    flex: 1,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: spacing[2],
    marginHorizontal: -spacing[4],
    paddingHorizontal: spacing[4],
  },
  tableCell: {
    flex: 1,
    fontSize: fontSize.xs,
  },
});
