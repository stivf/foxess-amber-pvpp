import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, energySourceColors, priceColors, fontSize, fontWeight, spacing, radius } from '../../theme';
import type { AnalyticsSavingsResponse } from '../../types/api';

interface EnergyBreakdownProps {
  analytics: AnalyticsSavingsResponse | null;
}

interface StatCardProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  sub?: string;
  color: string;
}

function StatCard({ icon, label, value, sub, color }: StatCardProps) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.statCard,
        { backgroundColor: theme.bgSecondary, borderColor: theme.borderDefault },
      ]}
    >
      <Ionicons name={icon} size={20} color={color} />
      <Text style={[styles.statLabel, { color: theme.textSecondary }]}>{label}</Text>
      <Text style={[styles.statValue, { color: theme.textPrimary, fontVariant: ['tabular-nums'] }]}>
        {value}
      </Text>
      {sub && (
        <Text style={[styles.statSub, { color: theme.textTertiary }]}>{sub}</Text>
      )}
    </View>
  );
}

export function EnergyBreakdown({ analytics }: EnergyBreakdownProps) {
  const theme = useTheme();

  if (!analytics) {
    return (
      <View style={[styles.placeholder, { backgroundColor: theme.bgTertiary }]}>
        <Text style={{ color: theme.textTertiary, fontSize: fontSize.sm }}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Self-consumption bar */}
      <View style={[styles.selfConsCard, { backgroundColor: theme.bgSecondary, borderColor: theme.borderDefault }]}>
        <Text style={[styles.selfConsLabel, { color: theme.textSecondary }]}>
          Self-Consumption Rate
        </Text>
        <View style={[styles.barTrack, { backgroundColor: theme.bgTertiary }]}>
          <View
            style={[
              styles.barFill,
              {
                width: `${Math.min(analytics.self_consumption_pct, 100)}%`,
                backgroundColor: energySourceColors.solar,
              },
            ]}
          />
        </View>
        <View style={styles.barLabels}>
          <Text style={[styles.barLabelText, { color: energySourceColors.solar, fontVariant: ['tabular-nums'] }]}>
            {analytics.self_consumption_pct.toFixed(1)}% self-consumed
          </Text>
          <Text style={[styles.barLabelText, { color: theme.textTertiary }]}>
            {(100 - analytics.self_consumption_pct).toFixed(1)}% exported
          </Text>
        </View>
      </View>

      {/* Stats grid */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statsRow}>
        <StatCard
          icon="sunny"
          label="Solar Generated"
          value={`${analytics.solar_generation_kwh.toFixed(1)} kWh`}
          color={energySourceColors.solar}
        />
        <StatCard
          icon="arrow-down-circle"
          label="Grid Imported"
          value={`${analytics.grid_import_kwh.toFixed(1)} kWh`}
          sub={`Avg ${analytics.avg_buy_price.toFixed(1)}c/kWh`}
          color={energySourceColors.grid}
        />
        <StatCard
          icon="arrow-up-circle"
          label="Grid Exported"
          value={`${analytics.grid_export_kwh.toFixed(1)} kWh`}
          sub={`Avg ${analytics.avg_sell_price.toFixed(1)}c/kWh`}
          color={priceColors.cheap2}
        />
        <StatCard
          icon="refresh-circle"
          label="Battery Cycles"
          value={analytics.battery_cycles.toFixed(1)}
          sub="this period"
          color={energySourceColors.battery}
        />
      </ScrollView>

      {/* Daily breakdown table */}
      {analytics.breakdown.length > 0 && (
        <View style={[styles.table, { borderColor: theme.borderDefault }]}>
          <View style={[styles.tableHeader, { backgroundColor: theme.bgTertiary }]}>
            <Text style={[styles.tableHeaderCell, { color: theme.textSecondary, flex: 1.5 }]}>Date</Text>
            <Text style={[styles.tableHeaderCell, { color: theme.textSecondary }]}>Savings</Text>
            <Text style={[styles.tableHeaderCell, { color: theme.textSecondary }]}>Solar</Text>
            <Text style={[styles.tableHeaderCell, { color: theme.textSecondary }]}>Import</Text>
            <Text style={[styles.tableHeaderCell, { color: theme.textSecondary }]}>Export</Text>
          </View>
          {analytics.breakdown.slice(-14).reverse().map((row, i) => (
            <View
              key={i}
              style={[
                styles.tableRow,
                {
                  backgroundColor: i % 2 === 0 ? theme.bgPrimary : theme.bgSecondary,
                  borderTopColor: theme.borderDefault,
                },
              ]}
            >
              <Text style={[styles.tableCell, { color: theme.textSecondary, flex: 1.5 }]}>
                {row.date}
              </Text>
              <Text style={[styles.tableCell, { color: priceColors.cheap2, fontVariant: ['tabular-nums'] }]}>
                ${row.savings_dollars.toFixed(2)}
              </Text>
              <Text style={[styles.tableCell, { color: theme.textPrimary, fontVariant: ['tabular-nums'] }]}>
                {row.solar_kwh.toFixed(1)}
              </Text>
              <Text style={[styles.tableCell, { color: theme.textPrimary, fontVariant: ['tabular-nums'] }]}>
                {row.import_kwh.toFixed(1)}
              </Text>
              <Text style={[styles.tableCell, { color: theme.textPrimary, fontVariant: ['tabular-nums'] }]}>
                {row.export_kwh.toFixed(1)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing[4],
  },
  selfConsCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing[3],
    gap: spacing[2],
  },
  selfConsLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  barTrack: {
    height: 16,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: radius.full,
  },
  barLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  barLabelText: {
    fontSize: fontSize.xs,
  },
  statsRow: {
    gap: spacing[3],
    paddingBottom: spacing[2],
  },
  statCard: {
    width: 140,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing[3],
    gap: spacing[1],
  },
  statLabel: {
    fontSize: fontSize.xs,
    marginTop: spacing[1],
  },
  statValue: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  statSub: {
    fontSize: fontSize.xs,
  },
  table: {
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
  },
  tableHeaderCell: {
    flex: 1,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    borderTopWidth: 1,
  },
  tableCell: {
    flex: 1,
    fontSize: fontSize.xs,
  },
  placeholder: {
    height: 120,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
