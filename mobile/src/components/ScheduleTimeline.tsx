import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { format, parseISO, startOfDay, differenceInMinutes } from 'date-fns';
import {
  batteryStateColors,
  getProfileColor,
  priceColors,
  spacing,
  radius,
  fontSize,
  fontWeight,
  useTheme,
} from '../theme';
import type { ScheduleSlot } from '../types/api';

const MINUTES_IN_DAY = 24 * 60;

function getActionColor(action: string): string {
  switch (action) {
    case 'CHARGE':
      return batteryStateColors.charging;
    case 'DISCHARGE':
      return batteryStateColors.discharging;
    case 'HOLD':
    case 'AUTO':
    default:
      return batteryStateColors.idle;
  }
}

function getActionLabel(action: string): string {
  switch (action) {
    case 'CHARGE':
      return 'CHG';
    case 'DISCHARGE':
      return 'DCH';
    case 'HOLD':
      return 'HLD';
    default:
      return 'AUTO';
  }
}

interface TimelineSlotProps {
  slot: ScheduleSlot;
  totalWidth: number;
  onPress?: () => void;
}

function TimelineSlot({ slot, totalWidth, onPress }: TimelineSlotProps) {
  const dayStart = startOfDay(parseISO(slot.start_time));
  const startMin = differenceInMinutes(parseISO(slot.start_time), dayStart);
  const endMin = differenceInMinutes(parseISO(slot.end_time), dayStart);
  const durationMin = endMin - startMin;

  const left = (startMin / MINUTES_IN_DAY) * totalWidth;
  const width = (durationMin / MINUTES_IN_DAY) * totalWidth;

  const actionColor = getActionColor(slot.action);
  const profileColor = getProfileColor(slot.profile_name);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[
        styles.slot,
        {
          left,
          width: Math.max(width, 20),
          backgroundColor: actionColor,
          opacity: 0.85,
        },
      ]}
    >
      <Text style={styles.slotText}>{getActionLabel(slot.action)}</Text>
    </TouchableOpacity>
  );
}

interface ScheduleTimelineProps {
  slots: ScheduleSlot[];
  onSlotPress?: (slot: ScheduleSlot) => void;
}

const TIMELINE_WIDTH = 320;

export function ScheduleTimeline({ slots, onSlotPress }: ScheduleTimelineProps) {
  const theme = useTheme();

  // Current time position
  const now = new Date();
  const dayStart = startOfDay(now);
  const nowMin = differenceInMinutes(now, dayStart);
  const nowLeft = (nowMin / MINUTES_IN_DAY) * TIMELINE_WIDTH;

  const hourLabels = [0, 6, 12, 18, 24];

  return (
    <View style={[styles.container, { backgroundColor: theme.bgSecondary }]}>
      <Text style={[styles.title, { color: theme.textPrimary }]}>Schedule</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          {/* Actions row */}
          <View style={[styles.row, { backgroundColor: theme.bgTertiary }]}>
            {slots.map((slot, i) => (
              <TimelineSlot
                key={`${slot.start_time}-${i}`}
                slot={slot}
                totalWidth={TIMELINE_WIDTH}
                onPress={() => onSlotPress?.(slot)}
              />
            ))}

            {/* NOW marker */}
            <View style={[styles.nowMarker, { left: nowLeft, backgroundColor: priceColors.expensive2 }]} />
          </View>

          {/* Profile row */}
          <View style={[styles.row, styles.profileRow, { backgroundColor: theme.bgTertiary }]}>
            {slots.map((slot, i) => {
              const dayStart2 = startOfDay(parseISO(slot.start_time));
              const startMin = differenceInMinutes(parseISO(slot.start_time), dayStart2);
              const endMin = differenceInMinutes(parseISO(slot.end_time), dayStart2);
              const left = (startMin / MINUTES_IN_DAY) * TIMELINE_WIDTH;
              const width = ((endMin - startMin) / MINUTES_IN_DAY) * TIMELINE_WIDTH;
              const profileColor = getProfileColor(slot.profile_name);

              return (
                <View
                  key={`prof-${slot.start_time}-${i}`}
                  style={[
                    styles.profileSlot,
                    {
                      left,
                      width: Math.max(width, 20),
                      backgroundColor: profileColor,
                      opacity: 0.5,
                    },
                  ]}
                />
              );
            })}
          </View>

          {/* Hour labels */}
          <View style={[styles.labelsRow, { width: TIMELINE_WIDTH }]}>
            {hourLabels.map((h) => (
              <Text
                key={h}
                style={[
                  styles.hourLabel,
                  { color: theme.textTertiary, left: (h / 24) * TIMELINE_WIDTH - 8 },
                ]}
              >
                {h === 0 ? '12a' : h === 12 ? '12p' : h === 24 ? '' : h < 12 ? `${h}a` : `${h - 12}p`}
              </Text>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* Legend */}
      <View style={styles.legend}>
        {[
          { label: 'Charge', color: batteryStateColors.charging },
          { label: 'Hold', color: batteryStateColors.idle },
          { label: 'Discharge', color: batteryStateColors.discharging },
        ].map((item) => (
          <View key={item.label} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: item.color }]} />
            <Text style={[styles.legendText, { color: theme.textSecondary }]}>{item.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.md,
    padding: spacing[3],
    gap: spacing[2],
  },
  title: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  row: {
    height: 28,
    borderRadius: 4,
    position: 'relative',
    width: TIMELINE_WIDTH,
    overflow: 'hidden',
    marginBottom: 2,
  },
  profileRow: {
    height: 16,
  },
  slot: {
    position: 'absolute',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 3,
  },
  slotText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
  },
  profileSlot: {
    position: 'absolute',
    height: '100%',
    borderRadius: 2,
  },
  nowMarker: {
    position: 'absolute',
    width: 2,
    height: '100%',
  },
  labelsRow: {
    height: 16,
    position: 'relative',
  },
  hourLabel: {
    position: 'absolute',
    fontSize: 9,
  },
  legend: {
    flexDirection: 'row',
    gap: spacing[4],
    justifyContent: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: fontSize.xs,
  },
});
