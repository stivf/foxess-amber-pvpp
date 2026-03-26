import React, { useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, getProfileColor, hexWithOpacity, fontSize, fontWeight, spacing, radius } from '../../theme';
import type { CalendarRule } from '../../types/api';
import { format, addDays, subDays, isSameDay, parseISO } from 'date-fns';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const HOUR_HEIGHT = 48;
const TIME_LABEL_WIDTH = 44;

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface DayCalendarProps {
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  rules: CalendarRule[];
  onTimeBlockPress?: (hour: number, rule?: CalendarRule) => void;
}

function getHourLabel(h: number): string {
  if (h === 0) return '12a';
  if (h < 12) return `${h}a`;
  if (h === 12) return '12p';
  return `${h - 12}p`;
}

export function DayCalendar({ selectedDate, onDateChange, rules, onTimeBlockPress }: DayCalendarProps) {
  const theme = useTheme();
  const scrollRef = useRef<ScrollView>(null);

  const dayOfWeek = selectedDate.getDay(); // 0=Sunday
  // Convert to Mon=0 format
  const monBasedDay = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  // Find rules active on this day
  const activeRules = rules.filter(rule =>
    rule.enabled && rule.days_of_week.includes(monBasedDay),
  );

  // Get rule active at a given hour
  function getRuleAtHour(hour: number): CalendarRule | undefined {
    const timeStr = `${hour.toString().padStart(2, '0')}:00`;
    return activeRules.find(rule => {
      return rule.start_time <= timeStr && rule.end_time > timeStr;
    });
  }

  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const start = subDays(selectedDate, monBasedDay);
    return addDays(start, i);
  });

  return (
    <View style={styles.container}>
      {/* Week navigation */}
      <View style={styles.weekNav}>
        <TouchableOpacity onPress={() => onDateChange(subDays(selectedDate, 7))}>
          <Ionicons name="chevron-back" size={20} color={theme.textSecondary} />
        </TouchableOpacity>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dayTabs}
        >
          {weekDates.map((date, i) => {
            const isSelected = isSameDay(date, selectedDate);
            const isToday = isSameDay(date, new Date());

            return (
              <TouchableOpacity
                key={i}
                onPress={() => onDateChange(date)}
                style={[
                  styles.dayTab,
                  isSelected && { backgroundColor: theme.bgTertiary, borderColor: theme.borderStrong },
                ]}
              >
                <Text
                  style={[
                    styles.dayTabLabel,
                    {
                      color: isSelected ? theme.textPrimary : theme.textSecondary,
                      fontWeight: isSelected ? fontWeight.semibold : fontWeight.normal,
                    },
                  ]}
                >
                  {DAYS_OF_WEEK[i]}
                </Text>
                <Text
                  style={[
                    styles.dayTabDate,
                    {
                      color: isToday ? '#059669' : isSelected ? theme.textPrimary : theme.textTertiary,
                      fontWeight: isToday ? fontWeight.bold : fontWeight.normal,
                    },
                  ]}
                >
                  {format(date, 'd')}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <TouchableOpacity onPress={() => onDateChange(addDays(selectedDate, 7))}>
          <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Time grid */}
      <ScrollView
        ref={scrollRef}
        style={styles.timeGrid}
        showsVerticalScrollIndicator={false}
        onLayout={() => {
          // Scroll to 6am on mount
          scrollRef.current?.scrollTo({ y: 6 * HOUR_HEIGHT, animated: false });
        }}
      >
        {Array.from({ length: 24 }, (_, hour) => {
          const rule = getRuleAtHour(hour);
          const isRuleStart = rule && (rule.start_time === `${hour.toString().padStart(2, '0')}:00`);

          return (
            <TouchableOpacity
              key={hour}
              onPress={() => onTimeBlockPress?.(hour, rule)}
              activeOpacity={0.7}
              style={[
                styles.hourRow,
                { borderBottomColor: theme.borderDefault },
              ]}
            >
              {/* Time label */}
              <Text
                style={[
                  styles.hourLabel,
                  { color: theme.textTertiary, width: TIME_LABEL_WIDTH },
                ]}
              >
                {hour % 2 === 0 ? getHourLabel(hour) : ''}
              </Text>

              {/* Content block */}
              <View style={styles.hourContent}>
                {rule ? (
                  <View
                    style={[
                      styles.ruleBlock,
                      {
                        backgroundColor: hexWithOpacity(getProfileColor(rule.profile_name), 0.2),
                        borderLeftColor: getProfileColor(rule.profile_name),
                      },
                    ]}
                  >
                    {isRuleStart && (
                      <Text
                        style={[
                          styles.ruleLabel,
                          { color: getProfileColor(rule.profile_name) },
                        ]}
                        numberOfLines={1}
                      >
                        {rule.profile_name} — {rule.name}
                      </Text>
                    )}
                  </View>
                ) : (
                  <View
                    style={[
                      styles.emptyHour,
                      { borderLeftColor: theme.borderDefault },
                    ]}
                  />
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing[2],
  },
  weekNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  dayTabs: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  dayTab: {
    alignItems: 'center',
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
    minWidth: 44,
  },
  dayTabLabel: {
    fontSize: fontSize.xs,
  },
  dayTabDate: {
    fontSize: fontSize.sm,
  },
  timeGrid: {
    maxHeight: 400,
  },
  hourRow: {
    flexDirection: 'row',
    height: HOUR_HEIGHT,
    alignItems: 'stretch',
    borderBottomWidth: 1,
  },
  hourLabel: {
    fontSize: fontSize.xs,
    paddingTop: spacing[1],
    paddingRight: spacing[2],
    textAlign: 'right',
  },
  hourContent: {
    flex: 1,
  },
  ruleBlock: {
    flex: 1,
    borderLeftWidth: 3,
    paddingLeft: spacing[2],
    justifyContent: 'center',
  },
  ruleLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  emptyHour: {
    flex: 1,
    borderLeftWidth: 1,
    paddingLeft: spacing[2],
  },
});
