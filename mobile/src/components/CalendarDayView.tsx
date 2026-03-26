import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Pressable,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, addDays, subDays, parseISO, isToday, startOfDay } from 'date-fns';
import {
  getProfileColor,
  profileColors,
  spacing,
  radius,
  fontSize,
  fontWeight,
  useTheme,
} from '../theme';
import { api } from '../services/api';
import type { CalendarRule, CalendarOverride, Profile } from '../types/api';

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface TimeBlock {
  startHour: number;
  endHour: number;
  profileName: string;
  profileId: string;
  ruleId?: string;
  overrideId?: string;
  isOverride?: boolean;
}

function buildTimeBlocks(
  rules: CalendarRule[],
  overrides: CalendarOverride[],
  date: Date,
): TimeBlock[] {
  const dayOfWeek = (date.getDay() + 6) % 7; // 0=Mon
  const dateStr = format(date, 'yyyy-MM-dd');

  const blocks: TimeBlock[] = [];

  // Recurring rules for this day
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (!rule.days_of_week.includes(dayOfWeek)) continue;

    const [startH, startM] = rule.start_time.split(':').map(Number);
    const [endH, endM] = rule.end_time.split(':').map(Number);

    blocks.push({
      startHour: startH + startM / 60,
      endHour: endH + endM / 60,
      profileName: rule.profile_name,
      profileId: rule.profile_id,
      ruleId: rule.id,
    });
  }

  // One-off overrides for this date
  for (const override of overrides) {
    const overrideStart = parseISO(override.start_datetime);
    const overrideEnd = parseISO(override.end_datetime);
    const overrideDate = format(overrideStart, 'yyyy-MM-dd');

    if (overrideDate !== dateStr) continue;

    blocks.push({
      startHour: overrideStart.getHours() + overrideStart.getMinutes() / 60,
      endHour: overrideEnd.getHours() + overrideEnd.getMinutes() / 60,
      profileName: override.profile_name,
      profileId: override.profile_id,
      overrideId: override.id,
      isOverride: true,
    });
  }

  return blocks;
}

interface AddRuleSheetProps {
  visible: boolean;
  initialHour?: number;
  profiles: Profile[];
  onClose: () => void;
  onSave: () => void;
  selectedDate: Date;
}

function AddRuleBottomSheet({ visible, initialHour = 16, profiles, onClose, onSave, selectedDate }: AddRuleSheetProps) {
  const theme = useTheme();
  const [selectedProfileId, setSelectedProfileId] = useState(profiles[0]?.id ?? '');
  const [startHour, setStartHour] = useState(initialHour);
  const [endHour, setEndHour] = useState(Math.min(initialHour + 2, 23));
  const [recurrence, setRecurrence] = useState<'daily' | 'weekdays' | 'weekends' | 'once'>('weekdays');
  const [saving, setSaving] = useState(false);

  const selectedProfile = profiles.find(p => p.id === selectedProfileId);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (recurrence === 'once') {
        const dateStr = format(selectedDate, 'yyyy-MM-dd');
        await api.createCalendarOverride({
          profile_id: selectedProfileId,
          name: `${selectedProfile?.name ?? 'Custom'} override`,
          start_datetime: `${dateStr}T${String(startHour).padStart(2, '0')}:00:00+11:00`,
          end_datetime: `${dateStr}T${String(endHour).padStart(2, '0')}:00:00+11:00`,
        });
      } else {
        let daysOfWeek: number[];
        if (recurrence === 'daily') daysOfWeek = [0, 1, 2, 3, 4, 5, 6];
        else if (recurrence === 'weekdays') daysOfWeek = [0, 1, 2, 3, 4];
        else daysOfWeek = [5, 6];

        await api.createCalendarRule({
          profile_id: selectedProfileId,
          name: `${selectedProfile?.name ?? 'Custom'} rule`,
          days_of_week: daysOfWeek,
          start_time: `${String(startHour).padStart(2, '0')}:00`,
          end_time: `${String(endHour).padStart(2, '0')}:00`,
          priority: 0,
          enabled: true,
        });
      }
      onSave();
      onClose();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save rule');
    } finally {
      setSaving(false);
    }
  };

  const recurrenceOptions = [
    { key: 'daily', label: 'Every Day' },
    { key: 'weekdays', label: 'Weekdays' },
    { key: 'weekends', label: 'Weekends' },
    { key: 'once', label: 'Once' },
  ] as const;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={sheetStyles.overlay} onPress={onClose}>
        <Pressable style={[sheetStyles.sheet, { backgroundColor: theme.bgSecondary }]}>
          <View style={[sheetStyles.handle, { backgroundColor: theme.borderDefault }]} />
          <Text style={[sheetStyles.title, { color: theme.textPrimary }]}>Schedule Rule</Text>

          {/* Profile selector */}
          <Text style={[sheetStyles.sectionLabel, { color: theme.textSecondary }]}>Profile</Text>
          <View style={sheetStyles.profileGrid}>
            {profiles.map(profile => {
              const color = getProfileColor(profile.name);
              const isSelected = profile.id === selectedProfileId;
              return (
                <TouchableOpacity
                  key={profile.id}
                  onPress={() => setSelectedProfileId(profile.id)}
                  style={[
                    sheetStyles.profileButton,
                    { borderColor: isSelected ? color : theme.borderDefault },
                    isSelected && { backgroundColor: color + '20' },
                  ]}
                  activeOpacity={0.7}
                >
                  <Text style={[sheetStyles.profileButtonText, { color: isSelected ? color : theme.textSecondary }]}>
                    {profile.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Time range */}
          <Text style={[sheetStyles.sectionLabel, { color: theme.textSecondary }]}>Time</Text>
          <View style={sheetStyles.timeRow}>
            <View style={[sheetStyles.timePicker, { backgroundColor: theme.bgTertiary }]}>
              <TouchableOpacity onPress={() => setStartHour(Math.max(0, startHour - 1))}>
                <Ionicons name="chevron-up" size={16} color={theme.textSecondary} />
              </TouchableOpacity>
              <Text style={[sheetStyles.timeText, { color: theme.textPrimary }]}>
                {startHour === 0 ? '12 AM' : startHour < 12 ? `${startHour} AM` : startHour === 12 ? '12 PM' : `${startHour - 12} PM`}
              </Text>
              <TouchableOpacity onPress={() => setStartHour(Math.min(endHour - 1, startHour + 1))}>
                <Ionicons name="chevron-down" size={16} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={[sheetStyles.toText, { color: theme.textSecondary }]}>to</Text>
            <View style={[sheetStyles.timePicker, { backgroundColor: theme.bgTertiary }]}>
              <TouchableOpacity onPress={() => setEndHour(Math.max(startHour + 1, endHour - 1))}>
                <Ionicons name="chevron-up" size={16} color={theme.textSecondary} />
              </TouchableOpacity>
              <Text style={[sheetStyles.timeText, { color: theme.textPrimary }]}>
                {endHour === 0 ? '12 AM' : endHour < 12 ? `${endHour} AM` : endHour === 12 ? '12 PM' : `${endHour - 12} PM`}
              </Text>
              <TouchableOpacity onPress={() => setEndHour(Math.min(24, endHour + 1))}>
                <Ionicons name="chevron-down" size={16} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Recurrence */}
          <Text style={[sheetStyles.sectionLabel, { color: theme.textSecondary }]}>Repeat</Text>
          <View style={sheetStyles.recurrenceRow}>
            {recurrenceOptions.map(opt => (
              <TouchableOpacity
                key={opt.key}
                onPress={() => setRecurrence(opt.key)}
                style={[
                  sheetStyles.recurrenceButton,
                  { borderColor: recurrence === opt.key ? profileColors.balanced : theme.borderDefault },
                  recurrence === opt.key && { backgroundColor: profileColors.balanced + '20' },
                ]}
                activeOpacity={0.7}
              >
                <Text style={[sheetStyles.recurrenceText, {
                  color: recurrence === opt.key ? profileColors.balanced : theme.textSecondary,
                }]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Action buttons */}
          <View style={sheetStyles.actions}>
            <TouchableOpacity
              style={[sheetStyles.cancelButton, { borderColor: theme.borderDefault }]}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Text style={[sheetStyles.cancelText, { color: theme.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[sheetStyles.saveButton, { backgroundColor: getProfileColor(selectedProfile?.name ?? '') }]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.8}
            >
              <Text style={sheetStyles.saveText}>{saving ? 'Saving...' : 'Save'}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const sheetStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing[5], gap: spacing[3], paddingBottom: spacing[8] },
  handle: { width: 40, height: 4, borderRadius: radius.full, alignSelf: 'center', marginBottom: spacing[1] },
  title: { fontSize: fontSize.xl, fontWeight: fontWeight.semibold, textAlign: 'center' },
  sectionLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  profileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  profileButton: { paddingVertical: spacing[2], paddingHorizontal: spacing[3], borderRadius: radius.sm, borderWidth: 1.5 },
  profileButtonText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  timePicker: { flex: 1, alignItems: 'center', padding: spacing[2], borderRadius: radius.sm, gap: 2 },
  timeText: { fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  toText: { fontSize: fontSize.sm },
  recurrenceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  recurrenceButton: { paddingVertical: spacing[2], paddingHorizontal: spacing[3], borderRadius: radius.sm, borderWidth: 1.5 },
  recurrenceText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  actions: { flexDirection: 'row', gap: spacing[3], marginTop: spacing[2] },
  cancelButton: { flex: 1, padding: spacing[3], borderRadius: radius.md, alignItems: 'center', borderWidth: 1 },
  cancelText: { fontSize: fontSize.base, fontWeight: fontWeight.medium },
  saveButton: { flex: 1, padding: spacing[3], borderRadius: radius.md, alignItems: 'center' },
  saveText: { color: '#fff', fontSize: fontSize.base, fontWeight: fontWeight.semibold },
});

interface CalendarDayViewProps {
  rules: CalendarRule[];
  overrides: CalendarOverride[];
  profiles: Profile[];
  onRulesChanged: () => void;
}

export function CalendarDayView({ rules, overrides, profiles, onRulesChanged }: CalendarDayViewProps) {
  const theme = useTheme();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [addRuleVisible, setAddRuleVisible] = useState(false);
  const [tappedHour, setTappedHour] = useState(16);

  const timeBlocks = buildTimeBlocks(rules, overrides, selectedDate);

  const getBlocksForHour = (hour: number): TimeBlock[] =>
    timeBlocks.filter(b => hour >= Math.floor(b.startHour) && hour < Math.ceil(b.endHour));

  const isCurrentHour = (hour: number): boolean => {
    return isToday(selectedDate) && new Date().getHours() === hour;
  };

  return (
    <View style={styles.container}>
      {/* Day navigator */}
      <View style={styles.dayNav}>
        <TouchableOpacity onPress={() => setSelectedDate(d => subDays(d, 1))} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color={theme.textSecondary} />
        </TouchableOpacity>
        <Text style={[styles.dayLabel, { color: theme.textPrimary }]}>
          {isToday(selectedDate) ? 'Today' : format(selectedDate, 'EEE d MMM')}
        </Text>
        <TouchableOpacity onPress={() => setSelectedDate(d => addDays(d, 1))} activeOpacity={0.7}>
          <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Hour grid */}
      <ScrollView style={styles.hourGrid} showsVerticalScrollIndicator={false}>
        {HOURS.map(hour => {
          const blocks = getBlocksForHour(hour);
          const isCurrent = isCurrentHour(hour);

          return (
            <TouchableOpacity
              key={hour}
              style={[
                styles.hourRow,
                { borderBottomColor: theme.borderDefault },
                isCurrent && { backgroundColor: theme.bgTertiary },
              ]}
              onPress={() => { setTappedHour(hour); setAddRuleVisible(true); }}
              activeOpacity={0.6}
            >
              <Text style={[styles.hourLabel, { color: theme.textTertiary }]}>
                {hour === 0 ? '12a' : hour < 12 ? `${hour}a` : hour === 12 ? '12p' : `${hour - 12}p`}
              </Text>
              <View style={styles.hourContent}>
                {blocks.length > 0 ? (
                  blocks.map((block, i) => {
                    const color = getProfileColor(block.profileName);
                    return (
                      <View
                        key={i}
                        style={[
                          styles.blockChip,
                          { backgroundColor: color + '25', borderLeftColor: color },
                        ]}
                      >
                        <Text style={[styles.blockText, { color }]}>
                          {block.profileName}{block.isOverride ? ' (1x)' : ''}
                        </Text>
                      </View>
                    );
                  })
                ) : (
                  <Text style={[styles.emptyHour, { color: theme.textTertiary }]}>Tap to add rule</Text>
                )}
              </View>
              {isCurrent && (
                <View style={[styles.nowDot, { backgroundColor: '#EF4444' }]} />
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <AddRuleBottomSheet
        visible={addRuleVisible}
        initialHour={tappedHour}
        profiles={profiles}
        onClose={() => setAddRuleVisible(false)}
        onSave={onRulesChanged}
        selectedDate={selectedDate}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: spacing[2],
  },
  dayNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing[2],
  },
  dayLabel: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  hourGrid: {
    maxHeight: 400,
  },
  hourRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 40,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing[1],
    gap: spacing[3],
    paddingRight: spacing[2],
  },
  hourLabel: {
    width: 28,
    fontSize: fontSize.xs,
    textAlign: 'right',
  },
  hourContent: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  blockChip: {
    paddingVertical: 2,
    paddingHorizontal: spacing[2],
    borderRadius: radius.sm,
    borderLeftWidth: 3,
  },
  blockText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  emptyHour: {
    fontSize: fontSize.xs,
    fontStyle: 'italic',
  },
  nowDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
