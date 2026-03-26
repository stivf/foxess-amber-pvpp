import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { StatPill } from '../common/StatPill';
import {
  getBatterySocColor,
  getPriceColor,
  priceColors,
  energySourceColors,
  getProfileColor,
  spacing,
} from '../../theme';
import type { BatteryState, PriceState, SolarState, SavingsSummary, ActiveProfile } from '../../types/api';

interface StatPillsRowProps {
  battery: BatteryState | null;
  price: PriceState | null;
  solar: SolarState | null;
  savings: SavingsSummary | null;
  activeProfile: ActiveProfile | null;
  onProfilePress?: () => void;
}

export function StatPillsRow({
  battery,
  price,
  solar,
  savings,
  activeProfile,
  onProfilePress,
}: StatPillsRowProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {battery && (
        <StatPill
          icon="battery-half"
          value={`${Math.round(battery.soc)}%`}
          color={getBatterySocColor(battery.soc)}
        />
      )}

      {price && (
        <StatPill
          icon="flash"
          value={`${price.current_per_kwh.toFixed(1)}c`}
          color={getPriceColor(price.current_per_kwh)}
        />
      )}

      {savings && (
        <StatPill
          icon="cash"
          value={`$${savings.today_dollars.toFixed(2)}`}
          color={priceColors.cheap2}
        />
      )}

      {solar && solar.current_generation_w > 0 && (
        <StatPill
          icon="sunny"
          value={`${(solar.current_generation_w / 1000).toFixed(1)}kW`}
          color={energySourceColors.solar}
        />
      )}

      {activeProfile && (
        <StatPill
          icon="shield-checkmark"
          value={activeProfile.name}
          color={getProfileColor(activeProfile.name)}
          onPress={onProfilePress}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
});
