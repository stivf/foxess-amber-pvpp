import React, { useState, useCallback } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  RefreshControl,
  Text,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useSystemStatus } from '../hooks/useSystemStatus';
import { useWebSocket } from '../hooks/useWebSocket';
import { useAppStore } from '../store';
import { api } from '../services/api';

import { StatPillsRow } from '../components/dashboard/StatPillsRow';
import { StatusHeader } from '../components/dashboard/StatusHeader';
import { BatteryGauge } from '../components/dashboard/BatteryGauge';
import { PowerFlowBars } from '../components/dashboard/PowerFlowBars';
import { ForecastChart } from '../components/dashboard/ForecastChart';
import { ScheduleTimeline } from '../components/dashboard/ScheduleTimeline';
import { EnergyMetricCards } from '../components/dashboard/EnergyMetricCards';
import { SavingsCard } from '../components/dashboard/SavingsCard';
import { ModeControlFAB } from '../components/dashboard/ModeControlFAB';
import { Card } from '../components/common/Card';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { SectionHeader } from '../components/common/SectionHeader';

import { useTheme, spacing, fontSize, fontWeight, priceColors } from '../theme';

export function DashboardScreen() {
  const theme = useTheme();
  const { isConnected } = useWebSocket();
  const {
    battery,
    price,
    solar,
    grid,
    schedule,
    activeProfile,
    savings,
    isLoading,
    refresh,
  } = useSystemStatus();

  const { pricingData, scheduleData, analyticsDay, analyticsWeek, analyticsMonth, setPricingData, setScheduleData, setAnalytics } = useAppStore();

  const [refreshing, setRefreshing] = useState(false);
  const [forecastExpanded, setForecastExpanded] = useState(false);
  const [decisionExpanded, setDecisionExpanded] = useState(true);

  const loadSupportingData = useCallback(async () => {
    try {
      const [pricing, sched, analytics] = await Promise.allSettled([
        api.getPricingCurrent(),
        api.getSchedule(),
        api.getAnalyticsSavings('day'),
      ]);
      if (pricing.status === 'fulfilled') setPricingData(pricing.value);
      if (sched.status === 'fulfilled') setScheduleData(sched.value);
      if (analytics.status === 'fulfilled') setAnalytics('day', analytics.value);
    } catch {
      // non-critical, ignore
    }
  }, [setPricingData, setScheduleData, setAnalytics]);

  React.useEffect(() => {
    loadSupportingData();
  }, [loadSupportingData]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.allSettled([refresh(), loadSupportingData()]);
    setRefreshing(false);
  }, [refresh, loadSupportingData]);

  const handleAnalyticsPeriodChange = useCallback(
    async (period: 'day' | 'week' | 'month') => {
      try {
        const data = await api.getAnalyticsSavings(period);
        setAnalytics(period, data);
      } catch {
        // ignore
      }
    },
    [setAnalytics],
  );

  if (isLoading && !battery) {
    return <LoadingSpinner fullScreen />;
  }

  const forecast = pricingData?.forecast ?? [];
  const slots = scheduleData?.slots ?? [];
  const currentAnalytics = analyticsDay;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.bgPrimary }]} edges={['top']}>
      {/* Header bar */}
      <View style={[styles.header, { borderBottomColor: theme.borderDefault }]}>
        <Text style={[styles.appTitle, { color: theme.textPrimary }]}>Battery Brain</Text>
        <View style={styles.headerRight}>
          {/* WS indicator */}
          <View style={[styles.wsIndicator, { backgroundColor: isConnected ? priceColors.cheap2 : priceColors.expensive2 }]} />
          <Text style={[styles.wsLabel, { color: theme.textTertiary }]}>
            {isConnected ? 'Live' : 'Offline'}
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.textSecondary} />
        }
      >
        {/* Stat pills */}
        <StatPillsRow
          battery={battery}
          price={price}
          solar={solar}
          savings={savings}
          activeProfile={activeProfile}
        />

        {/* Status header */}
        <View style={styles.section}>
          <StatusHeader
            battery={battery}
            price={price}
            solar={solar}
            grid={grid}
            currentAction={schedule?.current_action ?? null}
          />
        </View>

        {/* Battery gauge + Power flow */}
        <View style={styles.section}>
          <View style={styles.row}>
            <Card style={styles.gaugeCard}>
              <BatteryGauge battery={battery} />
            </Card>
            <Card style={styles.flowCard}>
              <SectionHeader title="Power Flow" />
              <PowerFlowBars solar={solar} grid={grid} battery={battery} />
            </Card>
          </View>
        </View>

        {/* Decision explanation (collapsible) */}
        {battery && (
          <View style={styles.section}>
            <TouchableOpacity
              onPress={() => setDecisionExpanded(!decisionExpanded)}
              activeOpacity={0.7}
              style={[styles.decisionHeader, { backgroundColor: theme.bgSecondary, borderColor: theme.borderDefault }]}
            >
              <Ionicons
                name={decisionExpanded ? 'chevron-up' : 'chevron-down'}
                size={14}
                color={theme.textTertiary}
              />
              <Text style={[styles.decisionToggle, { color: theme.textSecondary }]}>
                {decisionExpanded ? 'Hide explanation' : 'Why is the battery doing this?'}
              </Text>
            </TouchableOpacity>
            {decisionExpanded && (
              <Card style={styles.decisionCard}>
                <Text style={[styles.decisionText, { color: theme.textPrimary }]}>
                  {getDecisionText(battery, price, solar, schedule)}
                </Text>
              </Card>
            )}
          </View>
        )}

        {/* Forecast chart */}
        <View style={styles.section}>
          <Card>
            <SectionHeader title="Price Forecast" />
            <ForecastChart
              forecast={forecast}
              expanded={forecastExpanded}
              onToggleExpand={() => setForecastExpanded(!forecastExpanded)}
            />
          </Card>
        </View>

        {/* Schedule timeline */}
        {slots.length > 0 && (
          <View style={styles.section}>
            <Card>
              <SectionHeader title="Today's Schedule" />
              <ScheduleTimeline slots={slots} />
            </Card>
          </View>
        )}

        {/* Energy metric cards */}
        <View style={styles.section}>
          <SectionHeader title="Today's Energy" />
          <EnergyMetricCards solar={solar} grid={grid} battery={battery} analytics={currentAnalytics} />
        </View>

        {/* Savings card */}
        <View style={styles.section}>
          <Card>
            <SectionHeader title="Savings" />
            <SavingsCard
              savings={savings}
              analytics={currentAnalytics}
              onPeriodChange={handleAnalyticsPeriodChange}
            />
          </Card>
        </View>

        {/* Bottom padding for FAB */}
        <View style={{ height: 80 }} />
      </ScrollView>

      {/* Mode control FAB */}
      <ModeControlFAB schedule={schedule} onModeChanged={refresh} />
    </SafeAreaView>
  );
}

function getDecisionText(
  battery: NonNullable<ReturnType<typeof useSystemStatus>['battery']>,
  price: ReturnType<typeof useSystemStatus>['price'],
  solar: ReturnType<typeof useSystemStatus>['solar'],
  schedule: ReturnType<typeof useSystemStatus>['schedule'],
): string {
  if (!price) return 'Loading decision context...';

  const solarW = solar?.current_generation_w ?? 0;
  const action = schedule?.current_action ?? 'HOLD';
  const nextChange = schedule?.next_change_at
    ? new Date(schedule.next_change_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;
  const nextAction = schedule?.next_action;

  if (action === 'CHARGE' && solarW > 500) {
    return `Your battery is charging from excess solar at ${(solarW / 1000).toFixed(1)} kW. The system will store this free energy for use during peak hours.${nextChange ? ` Next action: ${nextAction} at ${nextChange}.` : ''}`;
  }
  if (action === 'CHARGE') {
    return `Grid price dropped to ${price.current_per_kwh.toFixed(1)}c/kWh. Charging from grid at ${(Math.abs(battery.power_w) / 1000).toFixed(1)} kW. Battery will reach ${Math.min(100, Math.round(battery.soc + 10))}% in about ${Math.round((100 - battery.soc) * battery.capacity_kwh / (Math.abs(battery.power_w) / 1000) * 60)} minutes.`;
  }
  if (action === 'DISCHARGE') {
    return `Grid price is ${price.current_per_kwh.toFixed(1)}c/kWh — above your export threshold. Discharging at ${(Math.abs(battery.power_w) / 1000).toFixed(1)} kW.${nextChange ? ` Returning to ${nextAction} at ${nextChange}.` : ''}`;
  }
  return `Price is moderate at ${price.current_per_kwh.toFixed(1)}c/kWh. Holding battery at ${Math.round(battery.soc)}%.${nextChange ? ` Next action: ${nextAction} at ${nextChange}.` : ''}`;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderBottomWidth: 1,
  },
  appTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  wsIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  wsLabel: {
    fontSize: fontSize.xs,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingVertical: spacing[3],
  },
  section: {
    paddingHorizontal: spacing[4],
    marginBottom: spacing[3],
  },
  row: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  gaugeCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing[4],
  },
  flowCard: {
    flex: 1.4,
    paddingVertical: spacing[4],
  },
  decisionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    padding: spacing[2],
    borderRadius: 6,
    borderWidth: 1,
    marginBottom: spacing[1],
  },
  decisionToggle: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  decisionCard: {
    padding: spacing[3],
  },
  decisionText: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
});
