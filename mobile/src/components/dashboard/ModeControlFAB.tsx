import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { addMinutes, formatISO } from 'date-fns';
import {
  batteryStateColors,
  priceColors,
  spacing,
  radius,
  fontSize,
  fontWeight,
  useTheme,
} from '../../theme';
import { api } from '../../services/api';
import type { ScheduleAction, ScheduleState } from '../../types/api';

type Mode = 'AUTO' | 'CHARGE' | 'DISCHARGE';

const DURATIONS = [
  { label: '30 min', minutes: 30 },
  { label: '1 hr', minutes: 60 },
  { label: '2 hr', minutes: 120 },
  { label: 'Until', minutes: 480 },
] as const;

function getModeColor(mode: Mode): string {
  switch (mode) {
    case 'CHARGE':
      return batteryStateColors.charging;
    case 'DISCHARGE':
      return batteryStateColors.discharging;
    default:
      return priceColors.neutral;
  }
}

function getModeIcon(mode: Mode): keyof typeof Ionicons.glyphMap {
  switch (mode) {
    case 'CHARGE':
      return 'arrow-down-circle';
    case 'DISCHARGE':
      return 'arrow-up-circle';
    default:
      return 'radio-button-on';
  }
}

interface ModeControlFABProps {
  schedule: ScheduleState | null;
  onModeChanged?: () => void;
}

export function ModeControlFAB({ schedule, onModeChanged }: ModeControlFABProps) {
  const theme = useTheme();
  const [bottomSheetVisible, setBottomSheetVisible] = useState(false);
  const [selectedMode, setSelectedMode] = useState<Mode>('AUTO');
  const [selectedDurationIdx, setSelectedDurationIdx] = useState(1); // default 1 hr
  const [isApplying, setIsApplying] = useState(false);

  const currentAction = schedule?.current_action ?? 'HOLD';
  const fabColor = currentAction === 'CHARGE'
    ? batteryStateColors.charging
    : currentAction === 'DISCHARGE'
    ? batteryStateColors.discharging
    : priceColors.neutral;

  const handleApply = useCallback(async () => {
    setIsApplying(true);
    try {
      if (selectedMode === 'AUTO') {
        await api.cancelOverride();
      } else {
        const minutes = DURATIONS[selectedDurationIdx].minutes;
        const endTime = formatISO(addMinutes(new Date(), minutes));
        const action: ScheduleAction = selectedMode === 'CHARGE' ? 'CHARGE' : 'DISCHARGE';
        await api.createOverride(action, endTime, `Manual override from mobile app`);
      }
      setBottomSheetVisible(false);
      onModeChanged?.();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to apply mode change');
    } finally {
      setIsApplying(false);
    }
  }, [selectedMode, selectedDurationIdx, onModeChanged]);

  return (
    <>
      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: fabColor }]}
        onPress={() => setBottomSheetVisible(true)}
        activeOpacity={0.85}
      >
        <Ionicons name={getModeIcon(currentAction as Mode)} size={28} color="#fff" />
      </TouchableOpacity>

      {/* Bottom Sheet Modal */}
      <Modal
        visible={bottomSheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setBottomSheetVisible(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setBottomSheetVisible(false)}>
          <Pressable style={[styles.sheet, { backgroundColor: theme.bgSecondary }]}>
            {/* Drag handle */}
            <View style={[styles.handle, { backgroundColor: theme.borderDefault }]} />

            <Text style={[styles.sheetTitle, { color: theme.textPrimary }]}>Battery Mode</Text>

            {/* Mode selector */}
            <View style={[styles.modeRow, { backgroundColor: theme.bgTertiary }]}>
              {(['AUTO', 'CHARGE', 'DISCHARGE'] as Mode[]).map((mode) => {
                const active = selectedMode === mode;
                const color = getModeColor(mode);
                return (
                  <TouchableOpacity
                    key={mode}
                    style={[
                      styles.modeButton,
                      active && { backgroundColor: color },
                    ]}
                    onPress={() => setSelectedMode(mode)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name={getModeIcon(mode)} size={20} color={active ? '#fff' : theme.textSecondary} />
                    <Text style={[styles.modeLabel, { color: active ? '#fff' : theme.textSecondary }]}>
                      {mode === 'AUTO' ? 'Auto' : mode === 'CHARGE' ? 'Charge' : 'Discharge'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Duration picker (only for manual) */}
            {selectedMode !== 'AUTO' && (
              <>
                <Text style={[styles.durationLabel, { color: theme.textSecondary }]}>Duration</Text>
                <View style={styles.durationRow}>
                  {DURATIONS.map((d, i) => (
                    <TouchableOpacity
                      key={d.label}
                      style={[
                        styles.durationButton,
                        { borderColor: theme.borderDefault },
                        i === selectedDurationIdx && { borderColor: priceColors.cheap2, backgroundColor: priceColors.cheap2 + '20' },
                      ]}
                      onPress={() => setSelectedDurationIdx(i)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.durationText,
                          { color: i === selectedDurationIdx ? priceColors.cheap2 : theme.textSecondary },
                        ]}
                      >
                        {d.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {/* Current status */}
            <View style={[styles.statusRow, { backgroundColor: theme.bgTertiary }]}>
              <Text style={[styles.statusText, { color: theme.textSecondary }]}>
                Currently: <Text style={{ color: theme.textPrimary, fontWeight: fontWeight.medium }}>{currentAction}</Text>
              </Text>
              {schedule?.next_change_at && (
                <Text style={[styles.statusText, { color: theme.textSecondary }]}>
                  Next: {schedule.next_action} at {new Date(schedule.next_change_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              )}
            </View>

            {/* Apply button */}
            <TouchableOpacity
              style={[styles.applyButton, { backgroundColor: getModeColor(selectedMode) }]}
              onPress={handleApply}
              disabled={isApplying}
              activeOpacity={0.8}
            >
              {isApplying ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.applyText}>
                  {selectedMode === 'AUTO' ? 'Return to Auto' : `Force ${selectedMode === 'CHARGE' ? 'Charge' : 'Discharge'}`}
                </Text>
              )}
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: spacing[4],
    right: spacing[4],
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing[5],
    gap: spacing[4],
    paddingBottom: spacing[8],
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: radius.full,
    alignSelf: 'center',
    marginBottom: spacing[2],
  },
  sheetTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
  },
  modeRow: {
    flexDirection: 'row',
    borderRadius: radius.md,
    padding: 4,
    gap: 4,
  },
  modeButton: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    paddingVertical: spacing[3],
    borderRadius: radius.sm,
    gap: 4,
  },
  modeLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  durationLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  durationRow: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  durationButton: {
    flex: 1,
    paddingVertical: spacing[2],
    alignItems: 'center',
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  durationText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  statusRow: {
    padding: spacing[3],
    borderRadius: radius.sm,
    gap: 4,
  },
  statusText: {
    fontSize: fontSize.sm,
  },
  applyButton: {
    padding: spacing[4],
    borderRadius: radius.md,
    alignItems: 'center',
  },
  applyText: {
    color: '#fff',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
});
