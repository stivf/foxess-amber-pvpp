import React, { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import {
  profileColors,
  spacing,
  radius,
  fontSize,
  fontWeight,
  useTheme,
} from '../../theme';

const STOP_LABELS = {
  export: ['Keep', 'Cautious', 'Balanced', 'Eager', 'Max'],
  preservation: ['Max Reserve', 'High Reserve', 'Balanced', 'Low Reserve', 'Full Use'],
  import: ['Minimal', 'Cautious', 'Balanced', 'Eager', 'Max'],
} as const;

const STOP_DESCRIPTIONS = {
  export: [
    'Only export when battery is full and solar is generating',
    'Export during price spikes above 60c/kWh',
    'Export when price exceeds 40c/kWh',
    'Export when price exceeds feed-in rate + margin',
    'Export whenever price is above feed-in rate',
  ],
  preservation: [
    'Keep 80% minimum SoC (maximum backup)',
    'Keep 50% minimum SoC',
    'Keep 30% minimum SoC',
    'Keep 15% minimum SoC',
    'Keep 5% minimum SoC (maximize trading)',
  ],
  import: [
    'Only charge when price is negative or < 5c/kWh',
    'Charge below 10c/kWh',
    'Charge below 20c/kWh',
    'Charge below 30c/kWh',
    'Charge whenever price is below average forecast',
  ],
} as const;

type Axis = keyof typeof STOP_LABELS;

interface AggressivenessSliderProps {
  axis: Axis;
  label: string;
  value: number; // 1-5
  onChange: (value: number) => void;
}

export function AggressivenessSlider({ axis, label, value, onChange }: AggressivenessSliderProps) {
  const theme = useTheme();
  const labels = STOP_LABELS[axis];
  const description = STOP_DESCRIPTIONS[axis][value - 1];

  // Color gradient from conservative (blue) to aggressive (amber)
  const getStopColor = (stop: number): string => {
    if (stop <= value) {
      // Interpolate from conservative to aggressive
      const ratio = (stop - 1) / 4;
      if (ratio < 0.5) {
        return profileColors.conservative;
      } else if (ratio < 0.75) {
        return profileColors.balanced;
      } else {
        return profileColors.aggressive;
      }
    }
    return theme.bgTertiary;
  };

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={[styles.axisLabel, { color: theme.textPrimary }]}>{label}</Text>
        <Text style={[styles.currentLabel, { color: profileColors.balanced }]}>
          {labels[value - 1]}
        </Text>
      </View>

      {/* 5-stop discrete slider */}
      <View style={styles.sliderContainer}>
        <View style={[styles.track, { backgroundColor: theme.bgTertiary }]} />
        <View style={styles.stopsRow}>
          {[1, 2, 3, 4, 5].map((stop) => {
            const isActive = stop <= value;
            const isSelected = stop === value;
            const color = getStopColor(stop);

            return (
              <TouchableOpacity
                key={stop}
                onPress={() => onChange(stop)}
                style={styles.stopWrapper}
                activeOpacity={0.7}
                hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
              >
                <View
                  style={[
                    styles.stop,
                    {
                      backgroundColor: isActive ? color : theme.bgTertiary,
                      borderColor: isSelected ? color : theme.borderDefault,
                      width: isSelected ? 24 : 18,
                      height: isSelected ? 24 : 18,
                      borderRadius: isSelected ? 12 : 9,
                    },
                  ]}
                />
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Stop labels */}
      <View style={styles.stopLabels}>
        {labels.map((l, i) => (
          <Text
            key={i}
            style={[
              styles.stopLabel,
              {
                color: i + 1 === value ? theme.textPrimary : theme.textTertiary,
                fontWeight: i + 1 === value ? fontWeight.medium : fontWeight.normal,
              },
            ]}
          >
            {l}
          </Text>
        ))}
      </View>

      {/* Description */}
      <Text style={[styles.description, { color: theme.textSecondary }]}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing[2],
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  axisLabel: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  currentLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  sliderContainer: {
    height: 32,
    justifyContent: 'center',
    position: 'relative',
  },
  track: {
    position: 'absolute',
    left: '5%',
    right: '5%',
    height: 4,
    borderRadius: radius.full,
  },
  stopsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: '2%',
    alignItems: 'center',
  },
  stopWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '20%',
  },
  stop: {
    borderWidth: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  stopLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 0,
  },
  stopLabel: {
    fontSize: 10,
    textAlign: 'center',
    width: '20%',
  },
  description: {
    fontSize: fontSize.xs,
    lineHeight: 16,
    fontStyle: 'italic',
  },
});
