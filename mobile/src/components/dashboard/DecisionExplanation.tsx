import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, fontSize, fontWeight, spacing, radius } from '../../theme';
import type { BatteryState, PriceState, ScheduleState } from '../../types/api';
import { format, parseISO } from 'date-fns';

interface DecisionExplanationProps {
  battery: BatteryState | null;
  price: PriceState | null;
  schedule: ScheduleState | null;
}

function buildExplanation(
  battery: BatteryState | null,
  price: PriceState | null,
  schedule: ScheduleState | null,
): string {
  if (!battery || !price) return 'Loading system information...';

  const soc = Math.round(battery.soc);
  const priceC = price.current_per_kwh.toFixed(0);
  const feedIn = price.feed_in_per_kwh.toFixed(1);

  let nextAction = '';
  if (schedule?.next_change_at && schedule.next_action) {
    try {
      const nextTime = format(parseISO(schedule.next_change_at), 'h:mm a');
      nextAction = ` Next scheduled action: ${schedule.next_action.charAt(0) + schedule.next_action.slice(1).toLowerCase()} starting at ${nextTime}.`;
    } catch {
      // ignore parse error
    }
  }

  switch (battery.mode) {
    case 'charging': {
      const powerKw = (battery.power_w / 1000).toFixed(1);
      const minSoc = battery.min_soc;
      const remaining = Math.max(0, battery.capacity_kwh * (1 - battery.soc / 100));
      const hoursToFull = battery.power_w > 0 ? (remaining / (battery.power_w / 1000)) : 0;
      const minutesToFull = Math.round(hoursToFull * 60);
      const timeToFull = minutesToFull < 60
        ? `${minutesToFull} minutes`
        : `${Math.round(hoursToFull * 10) / 10} hours`;

      if (price.current_per_kwh < 20) {
        return `Grid price dropped to ${priceC}c/kWh — below your threshold. Charging from grid at ${powerKw} kW. Battery will reach ${battery.capacity_kwh > 0 ? '100%' : 'full'} in about ${timeToFull}.${nextAction}`;
      }
      return `Your battery is charging from solar. Currently at ${soc}%, will be full in about ${timeToFull}.${nextAction}`;
    }

    case 'discharging': {
      const powerKw = (Math.abs(battery.power_w) / 1000).toFixed(1);
      const savingPerKwh = ((price.current_per_kwh - parseFloat(feedIn)) / 100).toFixed(2);
      if (price.current_per_kwh > 50) {
        return `Prices are high at ${priceC}c/kWh. Discharging at ${powerKw} kW. Saving approximately $${savingPerKwh} per kWh right now.${nextAction}`;
      }
      return `Battery is discharging at ${powerKw} kW to power your home. Grid price is ${priceC}c/kWh.${nextAction}`;
    }

    case 'holding':
    default: {
      return `Prices are moderate right now (${priceC}c/kWh). Holding battery at ${soc}%.${nextAction}`;
    }
  }
}

export function DecisionExplanation({ battery, price, schedule }: DecisionExplanationProps) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(true);
  const explanation = buildExplanation(battery, price, schedule);

  return (
    <TouchableOpacity
      onPress={() => setExpanded(e => !e)}
      activeOpacity={0.8}
    >
      <View
        style={[
          styles.container,
          { backgroundColor: theme.bgSecondary, borderColor: theme.borderDefault },
        ]}
      >
        <View style={styles.header}>
          <Ionicons
            name="information-circle-outline"
            size={16}
            color={theme.textSecondary}
          />
          <Text style={[styles.headerText, { color: theme.textSecondary }]}>
            Why is this happening?
          </Text>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={theme.textTertiary}
            style={styles.chevron}
          />
        </View>

        {expanded && (
          <Text style={[styles.explanation, { color: theme.textPrimary }]}>
            {explanation}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing[3],
    gap: spacing[2],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  headerText: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  chevron: {
    marginLeft: 'auto',
  },
  explanation: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
});
