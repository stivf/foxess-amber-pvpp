import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Animated,
  Dimensions,
  TextInput,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  useTheme,
  profileColors,
  hexWithOpacity,
  fontSize,
  fontWeight,
  spacing,
  radius,
} from '../../theme';
import type { Profile, CalendarRule } from '../../types/api';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

type RecurrenceOption = 'every_day' | 'weekdays' | 'weekends' | 'custom';

interface AddRuleSheetProps {
  visible: boolean;
  onClose: () => void;
  profiles: Profile[];
  initialHour?: number;
  editingRule?: CalendarRule | null;
  onSave: (data: {
    profile_id: string;
    name: string;
    days_of_week: number[];
    start_time: string;
    end_time: string;
  }) => Promise<void>;
  onDelete?: () => Promise<void>;
}

const RECURRENCE_OPTIONS: { key: RecurrenceOption; label: string; days: number[] }[] = [
  { key: 'every_day', label: 'Every day', days: [0, 1, 2, 3, 4, 5, 6] },
  { key: 'weekdays', label: 'Weekdays', days: [0, 1, 2, 3, 4] },
  { key: 'weekends', label: 'Weekends', days: [5, 6] },
  { key: 'custom', label: 'Custom...', days: [] },
];

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function padHour(h: number): string {
  return `${h.toString().padStart(2, '0')}:00`;
}

export function AddRuleSheet({
  visible,
  onClose,
  profiles,
  initialHour = 8,
  editingRule,
  onSave,
  onDelete,
}: AddRuleSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  const [selectedProfileId, setSelectedProfileId] = useState(
    editingRule?.profile_id ?? profiles[0]?.id ?? '',
  );
  const [startHour, setStartHour] = useState(initialHour);
  const [endHour, setEndHour] = useState(Math.min(initialHour + 2, 23));
  const [recurrence, setRecurrence] = useState<RecurrenceOption>('weekdays');
  const [customDays, setCustomDays] = useState<number[]>([0, 1, 2, 3, 4]);
  const [ruleName, setRuleName] = useState(editingRule?.name ?? '');
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 200,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: SCREEN_HEIGHT,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, slideAnim]);

  const getActiveDays = (): number[] => {
    const opt = RECURRENCE_OPTIONS.find(r => r.key === recurrence);
    if (!opt) return customDays;
    return recurrence === 'custom' ? customDays : opt.days;
  };

  const handleSave = useCallback(async () => {
    if (!selectedProfileId) return;
    setSaving(true);
    try {
      await onSave({
        profile_id: selectedProfileId,
        name: ruleName || `Rule ${padHour(startHour)}–${padHour(endHour)}`,
        days_of_week: getActiveDays(),
        start_time: padHour(startHour),
        end_time: padHour(endHour),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }, [selectedProfileId, ruleName, startHour, endHour, onSave, onClose, getActiveDays]);

  const handleDelete = useCallback(async () => {
    if (!onDelete) return;
    setSaving(true);
    try {
      await onDelete();
      onClose();
    } finally {
      setSaving(false);
    }
  }, [onDelete, onClose]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />

      <Animated.View
        style={[
          styles.sheet,
          {
            backgroundColor: theme.bgPrimary,
            paddingBottom: insets.bottom + spacing[4],
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <View style={[styles.handle, { backgroundColor: theme.borderStrong }]} />

        <ScrollView showsVerticalScrollIndicator={false}>
          <Text style={[styles.title, { color: theme.textPrimary }]}>
            {editingRule ? 'Edit Schedule Rule' : 'Add Schedule Rule'}
          </Text>

          {/* Rule name */}
          <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Name</Text>
          <TextInput
            value={ruleName}
            onChangeText={setRuleName}
            placeholder="e.g. Weekday evening peak"
            placeholderTextColor={theme.textTertiary}
            style={[
              styles.textInput,
              {
                color: theme.textPrimary,
                backgroundColor: theme.bgTertiary,
                borderColor: theme.borderDefault,
              },
            ]}
          />

          {/* Profile selector */}
          <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Profile</Text>
          <View style={styles.profileGrid}>
            {profiles.map(profile => {
              const color = profileColors[profile.name.toLowerCase() as keyof typeof profileColors] ?? profileColors.custom;
              const isSelected = selectedProfileId === profile.id;
              return (
                <TouchableOpacity
                  key={profile.id}
                  onPress={() => setSelectedProfileId(profile.id)}
                  style={[
                    styles.profileBtn,
                    {
                      backgroundColor: isSelected ? hexWithOpacity(color, 0.15) : theme.bgTertiary,
                      borderColor: isSelected ? color : theme.borderDefault,
                    },
                  ]}
                >
                  <Text style={[styles.profileBtnText, { color: isSelected ? color : theme.textSecondary }]}>
                    {profile.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Time range */}
          <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Time</Text>
          <View style={styles.timeRow}>
            <View style={styles.timeControl}>
              <TouchableOpacity onPress={() => setStartHour(h => Math.max(0, h - 1))}>
                <Ionicons name="chevron-back" size={20} color={theme.textSecondary} />
              </TouchableOpacity>
              <Text style={[styles.timeValue, { color: theme.textPrimary, fontVariant: ['tabular-nums'] }]}>
                {padHour(startHour)}
              </Text>
              <TouchableOpacity onPress={() => setStartHour(h => Math.min(endHour - 1, h + 1))}>
                <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.timeSeparator, { color: theme.textTertiary }]}>to</Text>

            <View style={styles.timeControl}>
              <TouchableOpacity onPress={() => setEndHour(h => Math.max(startHour + 1, h - 1))}>
                <Ionicons name="chevron-back" size={20} color={theme.textSecondary} />
              </TouchableOpacity>
              <Text style={[styles.timeValue, { color: theme.textPrimary, fontVariant: ['tabular-nums'] }]}>
                {padHour(endHour)}
              </Text>
              <TouchableOpacity onPress={() => setEndHour(h => Math.min(24, h + 1))}>
                <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Recurrence */}
          <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Repeat</Text>
          <View style={styles.recurrenceRow}>
            {RECURRENCE_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.key}
                onPress={() => setRecurrence(opt.key)}
                style={[
                  styles.recurrenceBtn,
                  {
                    backgroundColor: recurrence === opt.key ? theme.bgTertiary : 'transparent',
                    borderColor: recurrence === opt.key ? theme.borderStrong : theme.borderDefault,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.recurrenceBtnText,
                    { color: recurrence === opt.key ? theme.textPrimary : theme.textSecondary },
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Custom days */}
          {recurrence === 'custom' && (
            <View style={styles.customDays}>
              {DAY_LABELS.map((day, i) => {
                const isActive = customDays.includes(i);
                return (
                  <TouchableOpacity
                    key={i}
                    onPress={() =>
                      setCustomDays(prev =>
                        isActive ? prev.filter(d => d !== i) : [...prev, i],
                      )
                    }
                    style={[
                      styles.dayBtn,
                      {
                        backgroundColor: isActive ? theme.bgTertiary : 'transparent',
                        borderColor: isActive ? theme.borderStrong : theme.borderDefault,
                      },
                    ]}
                  >
                    <Text style={[styles.dayBtnText, { color: isActive ? theme.textPrimary : theme.textTertiary }]}>
                      {day}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Action buttons */}
          <View style={styles.actions}>
            {editingRule && onDelete && (
              <TouchableOpacity
                onPress={handleDelete}
                disabled={saving}
                style={[styles.deleteBtn, { borderColor: '#DC2626' }]}
              >
                <Text style={[styles.deleteBtnText, { color: '#DC2626' }]}>Delete</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={handleSave}
              disabled={saving || !selectedProfileId}
              style={[
                styles.saveBtn,
                { backgroundColor: '#059669', opacity: saving || !selectedProfileId ? 0.6 : 1 },
              ]}
            >
              <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save'}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    maxHeight: SCREEN_HEIGHT * 0.85,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: spacing[3],
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing[4],
  },
  sectionLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    marginBottom: spacing[2],
    marginTop: spacing[3],
  },
  textInput: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: radius.md,
    borderWidth: 1,
    fontSize: fontSize.base,
  },
  profileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  profileBtn: {
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[4],
    borderRadius: radius.md,
    borderWidth: 1.5,
  },
  profileBtnText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  timeControl: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[2],
  },
  timeValue: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  timeSeparator: {
    fontSize: fontSize.sm,
  },
  recurrenceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  recurrenceBtn: {
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  recurrenceBtnText: {
    fontSize: fontSize.sm,
  },
  customDays: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
    marginTop: spacing[2],
  },
  dayBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayBtnText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing[3],
    marginTop: spacing[4],
    marginBottom: spacing[2],
  },
  deleteBtn: {
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    borderRadius: radius.md,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  deleteBtnText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  saveBtn: {
    flex: 1,
    paddingVertical: spacing[3],
    borderRadius: radius.md,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
});
