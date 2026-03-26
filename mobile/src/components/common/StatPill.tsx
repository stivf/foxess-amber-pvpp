import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { hexWithOpacity, spacing, radius, fontSize, fontWeight } from '../../theme';

interface StatPillProps {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  color: string;
  onPress?: () => void;
}

export function StatPill({ icon, value, color, onPress }: StatPillProps) {
  const bg = hexWithOpacity(color, 0.15);

  const content = (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Ionicons name={icon} size={14} color={color} />
      <Text style={[styles.value, { color, fontVariant: ['tabular-nums'] }]}>{value}</Text>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    borderRadius: radius.full,
  },
  value: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
});
