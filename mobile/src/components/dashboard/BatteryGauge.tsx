import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { getBatterySocColor, batteryStateColors, useTheme, fontSize, fontWeight, spacing, radius } from '../../theme';
import type { BatteryState } from '../../types/api';

interface BatteryGaugeProps {
  battery: BatteryState | null;
}

function getModeLabel(mode: string): string {
  switch (mode) {
    case 'charging': return 'Charging';
    case 'discharging': return 'Discharging';
    case 'holding': return 'Holding';
    default: return 'Idle';
  }
}

function getModeColor(mode: string): string {
  switch (mode) {
    case 'charging': return batteryStateColors.charging;
    case 'discharging': return batteryStateColors.discharging;
    default: return batteryStateColors.idle;
  }
}

export function BatteryGauge({ battery }: BatteryGaugeProps) {
  const theme = useTheme();
  const fillAnim = useRef(new Animated.Value(0)).current;

  const soc = battery?.soc ?? 0;
  const socColor = getBatterySocColor(soc);
  const modeLabel = battery ? getModeLabel(battery.mode) : 'Unknown';
  const modeColor = battery ? getModeColor(battery.mode) : batteryStateColors.idle;
  const powerKw = battery ? Math.abs(battery.power_w / 1000) : 0;
  const powerSign = battery?.mode === 'charging' ? '+' : battery?.mode === 'discharging' ? '-' : '';

  useEffect(() => {
    Animated.timing(fillAnim, {
      toValue: soc / 100,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [soc, fillAnim]);

  const fillHeight = fillAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.container}>
      {/* Battery shell */}
      <View style={[styles.batteryShell, { borderColor: theme.borderStrong }]}>
        {/* Terminal nub */}
        <View style={[styles.terminal, { backgroundColor: theme.borderStrong }]} />

        {/* Fill */}
        <View style={styles.fillContainer}>
          <Animated.View
            style={[
              styles.fill,
              {
                height: fillHeight,
                backgroundColor: socColor,
              },
            ]}
          />
        </View>

        {/* SoC overlay text */}
        <View style={styles.socOverlay}>
          <Text style={[styles.socText, { color: '#FFFFFF', fontVariant: ['tabular-nums'] }]}>
            {Math.round(soc)}%
          </Text>
        </View>
      </View>

      {/* Mode badge */}
      <View style={[styles.modeBadge, { backgroundColor: modeColor }]}>
        <Text style={styles.modeText}>{modeLabel}</Text>
      </View>

      {/* Power flow */}
      {battery && battery.power_w !== 0 && (
        <Text style={[styles.powerText, { color: theme.textSecondary, fontVariant: ['tabular-nums'] }]}>
          {powerSign}{powerKw.toFixed(1)} kW
        </Text>
      )}

      {/* Temperature */}
      {battery?.temperature != null && (
        <Text style={[styles.tempText, { color: theme.textTertiary }]}>
          {battery.temperature.toFixed(0)}°C
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: spacing[2],
  },
  batteryShell: {
    width: 80,
    height: 120,
    borderRadius: radius.md,
    borderWidth: 2,
    overflow: 'hidden',
    position: 'relative',
  },
  terminal: {
    width: 24,
    height: 6,
    alignSelf: 'center',
    marginTop: -6,
    borderRadius: 2,
  },
  fillContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  fill: {
    width: '100%',
    borderRadius: 2,
  },
  socOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  socText: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  modeBadge: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: radius.full,
  },
  modeText: {
    color: '#FFFFFF',
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  powerText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  tempText: {
    fontSize: fontSize.xs,
  },
});
