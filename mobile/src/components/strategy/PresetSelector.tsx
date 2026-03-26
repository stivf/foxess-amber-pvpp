import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme, profileColors, hexWithOpacity, fontSize, fontWeight, spacing, radius } from '../../theme';

export type PresetName = 'conservative' | 'balanced' | 'aggressive' | 'custom';

export const PRESETS: Record<PresetName, { export: 1|2|3|4|5; preservation: 1|2|3|4|5; import: 1|2|3|4|5 }> = {
  conservative: { export: 1, preservation: 1, import: 1 },
  balanced: { export: 3, preservation: 3, import: 3 },
  aggressive: { export: 5, preservation: 5, import: 5 },
  custom: { export: 3, preservation: 3, import: 3 },
};

interface PresetSelectorProps {
  activePreset: PresetName;
  onSelect: (preset: PresetName) => void;
}

const PRESET_LABELS: { name: PresetName; label: string }[] = [
  { name: 'conservative', label: 'Conservative' },
  { name: 'balanced', label: 'Balanced' },
  { name: 'aggressive', label: 'Aggressive' },
  { name: 'custom', label: 'Custom' },
];

export function PresetSelector({ activePreset, onSelect }: PresetSelectorProps) {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      {PRESET_LABELS.map(({ name, label }) => {
        const color = profileColors[name];
        const isActive = activePreset === name;
        const bg = isActive ? hexWithOpacity(color, 0.15) : theme.bgTertiary;
        const textColor = isActive ? color : theme.textSecondary;
        const borderColor = isActive ? color : theme.borderDefault;

        return (
          <TouchableOpacity
            key={name}
            onPress={() => onSelect(name)}
            style={[
              styles.pill,
              {
                backgroundColor: bg,
                borderColor,
              },
            ]}
          >
            <Text style={[styles.pillText, { color: textColor }]}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  pill: {
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[4],
    borderRadius: radius.full,
    borderWidth: 1.5,
  },
  pillText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
});
