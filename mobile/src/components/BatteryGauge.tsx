import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import {
  getBatterySocColor,
  batteryStateColors,
  spacing,
  radius,
  fontSize,
  fontWeight,
  useTheme,
} from '../theme';
import type { BatteryState } from '../types/api';

interface BatteryGaugeProps {
  battery: BatteryState | null;
}

function getModeLabel(battery: BatteryState): string {
  switch (battery.mode) {
    case 'charging':
      return 'Charging';
    case 'discharging':
      return 'Discharging';
    case 'holding':
      return 'Holding';
    default:
      return 'Idle';
  }
}

function getModeColor(battery: BatteryState): string {
  switch (battery.mode) {
    case 'charging':
      return batteryStateColors.charging;
    case 'discharging':
      return batteryStateColors.discharging;
    default:
      return batteryStateColors.idle;
  }
}

export function BatteryGauge({ battery }: BatteryGaugeProps) {
  const theme = useTheme();
  const fillAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const soc = battery?.soc ?? 0;
  const socColor = getBatterySocColor(soc);
  const modeColor = battery ? getModeColor(battery) : batteryStateColors.idle;
  const modeLabel = battery ? getModeLabel(battery) : 'Idle';
  const powerKw = battery ? Math.abs(battery.power_w) / 1000 : 0;
  const powerSign = battery && battery.power_w > 0 ? '+' : battery && battery.power_w < 0 ? '-' : '';

  useEffect(() => {
    Animated.timing(fillAnim, {
      toValue: soc / 100,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [soc, fillAnim]);

  useEffect(() => {
    if (battery?.mode === 'charging') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.6, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ]),
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [battery?.mode, pulseAnim]);

  return (
    <View style={[styles.container, { backgroundColor: theme.bgSecondary }]}>
      {/* Vertical gauge */}
      <View style={[styles.gaugeOuter, { borderColor: theme.borderDefault }]}>
        <Animated.View
          style={[
            styles.gaugeFill,
            {
              backgroundColor: socColor,
              height: fillAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '100%'],
              }),
            },
          ]}
        />
      </View>

      {/* SoC number */}
      <Text style={[styles.socText, { color: socColor, fontFamily: 'monospace' }]}>
        {battery ? `${Math.round(soc)}%` : '--'}
      </Text>

      {/* Mode badge */}
      <Animated.View style={[styles.modeBadge, { backgroundColor: modeColor, opacity: pulseAnim }]}>
        <Text style={styles.modeText}>{modeLabel}</Text>
      </Animated.View>

      {/* Power flow */}
      {battery && battery.power_w !== 0 && (
        <Text style={[styles.powerText, { color: theme.textSecondary, fontFamily: 'monospace' }]}>
          {`${powerSign}${powerKw.toFixed(1)} kW`}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    padding: spacing[4],
    borderRadius: radius.md,
    gap: spacing[2],
  },
  gaugeOuter: {
    width: 40,
    height: 120,
    borderWidth: 2,
    borderRadius: 6,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  gaugeFill: {
    width: '100%',
    borderRadius: 4,
  },
  socText: {
    fontSize: fontSize['4xl'],
    fontWeight: fontWeight.bold,
  },
  modeBadge: {
    paddingVertical: 4,
    paddingHorizontal: spacing[3],
    borderRadius: radius.full,
  },
  modeText: {
    color: '#fff',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  powerText: {
    fontSize: fontSize.sm,
  },
});
