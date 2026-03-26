import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useTheme, batteryStateColors, getProfileColor, fontSize, fontWeight, spacing, radius } from '../../theme';
import type { ScheduleSlot } from '../../types/api';
import { format, parseISO, differenceInMinutes, startOfDay, endOfDay } from 'date-fns';

const MINUTES_IN_DAY = 1440;

interface ScheduleTimelineProps {
  slots: ScheduleSlot[];
  onSlotPress?: (slot: ScheduleSlot) => void;
}

function getActionColor(action: string): string {
  switch (action) {
    case 'CHARGE': return batteryStateColors.charging;
    case 'DISCHARGE': return batteryStateColors.discharging;
    default: return batteryStateColors.idle;
  }
}

export function ScheduleTimeline({ slots, onSlotPress }: ScheduleTimelineProps) {
  const theme = useTheme();
  const now = new Date();
  const dayStart = startOfDay(now);
  const dayEnd = endOfDay(now);

  const nowPct = Math.min(
    differenceInMinutes(now, dayStart) / MINUTES_IN_DAY,
    1,
  );

  const hourLabels = [0, 6, 12, 18, 24];

  if (!slots.length) {
    return (
      <View style={[styles.placeholder, { backgroundColor: theme.bgTertiary }]}>
        <Text style={{ color: theme.textTertiary, fontSize: fontSize.xs }}>No schedule available</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Actions row */}
      <View style={styles.rowLabel}>
        <Text style={[styles.rowLabelText, { color: theme.textTertiary }]}>Actions</Text>
      </View>
      <View style={[styles.timelineRow, { backgroundColor: theme.bgTertiary }]}>
        {slots.map((slot, i) => {
          const slotStart = parseISO(slot.start_time);
          const slotEnd = parseISO(slot.end_time);

          if (slotStart > dayEnd || slotEnd < dayStart) return null;

          const startPct =
            Math.max(0, differenceInMinutes(slotStart, dayStart) / MINUTES_IN_DAY) * 100;
          const endPct =
            Math.min(1, differenceInMinutes(slotEnd, dayStart) / MINUTES_IN_DAY) * 100;
          const widthPct = endPct - startPct;

          if (widthPct < 0.5) return null;

          const color = getActionColor(slot.action);

          return (
            <TouchableOpacity
              key={i}
              onPress={() => onSlotPress?.(slot)}
              style={[
                styles.slotBlock,
                {
                  left: `${startPct}%`,
                  width: `${widthPct}%`,
                  backgroundColor: color,
                },
              ]}
            >
              {widthPct > 6 && (
                <Text style={styles.slotLabel} numberOfLines={1}>
                  {slot.action.charAt(0) + slot.action.slice(1).toLowerCase()}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}

        {/* NOW marker */}
        <View
          style={[
            styles.nowMarker,
            {
              left: `${nowPct * 100}%`,
              backgroundColor: theme.textPrimary,
            },
          ]}
        />
      </View>

      {/* Profile row */}
      <View style={styles.rowLabel}>
        <Text style={[styles.rowLabelText, { color: theme.textTertiary }]}>Profile</Text>
      </View>
      <View style={[styles.timelineRow, { backgroundColor: theme.bgTertiary }]}>
        {slots.map((slot, i) => {
          const slotStart = parseISO(slot.start_time);
          const slotEnd = parseISO(slot.end_time);

          if (slotStart > dayEnd || slotEnd < dayStart) return null;

          const startPct =
            Math.max(0, differenceInMinutes(slotStart, dayStart) / MINUTES_IN_DAY) * 100;
          const endPct =
            Math.min(1, differenceInMinutes(slotEnd, dayStart) / MINUTES_IN_DAY) * 100;
          const widthPct = endPct - startPct;

          if (widthPct < 0.5) return null;

          const color = getProfileColor(slot.profile_name);

          return (
            <View
              key={i}
              style={[
                styles.slotBlock,
                {
                  left: `${startPct}%`,
                  width: `${widthPct}%`,
                  backgroundColor: `${color}55`,
                  borderLeftColor: color,
                  borderLeftWidth: 2,
                },
              ]}
            >
              {widthPct > 8 && (
                <Text style={[styles.slotLabel, { color }]} numberOfLines={1}>
                  {slot.profile_name}
                </Text>
              )}
            </View>
          );
        })}
      </View>

      {/* Time labels */}
      <View style={styles.timeLabels}>
        {hourLabels.map(h => (
          <Text key={h} style={[styles.timeLabel, { color: theme.textTertiary }]}>
            {h === 0 ? '12a' : h === 24 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing[1],
  },
  rowLabel: {
    marginBottom: 2,
  },
  rowLabelText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  timelineRow: {
    height: 28,
    borderRadius: radius.sm,
    position: 'relative',
    overflow: 'hidden',
  },
  slotBlock: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    paddingHorizontal: 3,
    overflow: 'hidden',
  },
  slotLabel: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '600',
  },
  nowMarker: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    zIndex: 10,
  },
  timeLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing[1],
  },
  timeLabel: {
    fontSize: fontSize.xs,
  },
  placeholder: {
    height: 60,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
