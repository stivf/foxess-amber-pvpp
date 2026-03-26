import React, { useEffect, useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useAppStore } from '../store';
import { api } from '../services/api';
import { AggressivenessSlider } from '../components/strategy/AggressivenessSlider';
import { CalendarDayView } from '../components/strategy/CalendarDayView';
import { Card } from '../components/common/Card';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { SectionHeader } from '../components/common/SectionHeader';

import {
  profileColors,
  getProfileColor,
  spacing,
  radius,
  fontSize,
  fontWeight,
  useTheme,
} from '../theme';
import type { Profile } from '../types/api';

type PresetName = 'Conservative' | 'Balanced' | 'Aggressive' | 'Custom';

const PRESETS: Record<Exclude<PresetName, 'Custom'>, { export: number; preservation: number; import: number }> = {
  Conservative: { export: 1, preservation: 1, import: 1 },
  Balanced: { export: 3, preservation: 3, import: 3 },
  Aggressive: { export: 5, preservation: 5, import: 5 },
};

function getPresetColor(preset: PresetName): string {
  switch (preset) {
    case 'Conservative': return profileColors.conservative;
    case 'Balanced': return profileColors.balanced;
    case 'Aggressive': return profileColors.aggressive;
    default: return profileColors.custom;
  }
}

function detectPreset(
  exportVal: number,
  preservationVal: number,
  importVal: number,
): PresetName {
  for (const [name, values] of Object.entries(PRESETS)) {
    if (
      values.export === exportVal &&
      values.preservation === preservationVal &&
      values.import === importVal
    ) {
      return name as PresetName;
    }
  }
  return 'Custom';
}

function getImpactSummary(exportVal: number, preservationVal: number, importVal: number): string {
  const reservePcts = [80, 50, 30, 15, 5];
  const exportPrices = [80, 60, 40, 20, 0];
  const importPrices = [5, 10, 20, 30, 100];

  const reservePct = reservePcts[preservationVal - 1];
  const exportThreshold = exportPrices[exportVal - 1];
  const importThreshold = importPrices[importVal - 1];

  return `Reserve: ${reservePct}% | Export > ${exportThreshold}c | Import < ${importThreshold}c`;
}

export function StrategyScreen() {
  const theme = useTheme();
  const {
    profiles,
    calendarRules,
    calendarOverrides,
    activeCalendarProfile,
    isLoadingProfiles,
    setProfiles,
    setCalendarRules,
    setCalendarOverrides,
    setActiveCalendarProfile,
    setLoading,
  } = useAppStore();

  const [refreshing, setRefreshing] = useState(false);

  // Local slider state derived from active profile
  const [exportVal, setExportVal] = useState(3);
  const [preservationVal, setPreservationVal] = useState(3);
  const [importVal, setImportVal] = useState(3);
  const [activePreset, setActivePreset] = useState<PresetName>('Balanced');
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const loadData = useCallback(async () => {
    setLoading('profiles', true);
    try {
      const [profilesRes, rulesRes, overridesRes, activeRes] = await Promise.allSettled([
        api.getProfiles(),
        api.getCalendarRules(),
        api.getCalendarOverrides(),
        api.getActiveCalendarProfile(),
      ]);

      if (profilesRes.status === 'fulfilled') setProfiles(profilesRes.value.profiles);
      if (rulesRes.status === 'fulfilled') setCalendarRules(rulesRes.value.rules);
      if (overridesRes.status === 'fulfilled') setCalendarOverrides(overridesRes.value.overrides);
      if (activeRes.status === 'fulfilled') {
        setActiveCalendarProfile(activeRes.value);
        // Init sliders from active profile
        const p = activeRes.value.profile;
        const e = Math.round(p.export_aggressiveness * 4) + 1;
        const pres = Math.round(p.preservation_aggressiveness * 4) + 1;
        const imp = Math.round(p.import_aggressiveness * 4) + 1;
        setExportVal(e);
        setPreservationVal(pres);
        setImportVal(imp);
        setActivePreset(detectPreset(e, pres, imp));
      }
    } catch (err) {
      // ignore
    } finally {
      setLoading('profiles', false);
    }
  }, [setLoading, setProfiles, setCalendarRules, setCalendarOverrides, setActiveCalendarProfile]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const handlePresetSelect = (preset: Exclude<PresetName, 'Custom'>) => {
    const values = PRESETS[preset];
    setExportVal(values.export);
    setPreservationVal(values.preservation);
    setImportVal(values.import);
    setActivePreset(preset);
    setHasUnsavedChanges(true);
  };

  const handleSliderChange = (axis: 'export' | 'preservation' | 'import', value: number) => {
    if (axis === 'export') setExportVal(value);
    else if (axis === 'preservation') setPreservationVal(value);
    else setImportVal(value);

    const newPreset = detectPreset(
      axis === 'export' ? value : exportVal,
      axis === 'preservation' ? value : preservationVal,
      axis === 'import' ? value : importVal,
    );
    setActivePreset(newPreset);
    setHasUnsavedChanges(true);
  };

  const handleSaveProfile = useCallback(async () => {
    if (!activeCalendarProfile) return;
    setIsSaving(true);

    const exportAgg = (exportVal - 1) / 4;
    const preservationAgg = (preservationVal - 1) / 4;
    const importAgg = (importVal - 1) / 4;

    try {
      await api.patchProfile(activeCalendarProfile.profile.id, {
        export_aggressiveness: exportAgg,
        preservation_aggressiveness: preservationAgg,
        import_aggressiveness: importAgg,
      });
      setHasUnsavedChanges(false);
      Alert.alert('Saved', 'Profile updated successfully.');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setIsSaving(false);
    }
  }, [activeCalendarProfile, exportVal, preservationVal, importVal]);

  if (isLoadingProfiles && profiles.length === 0) {
    return <LoadingSpinner fullScreen />;
  }

  const presets: PresetName[] = ['Conservative', 'Balanced', 'Aggressive'];
  if (activePreset === 'Custom') presets.push('Custom');

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.bgPrimary }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.borderDefault }]}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Strategy</Text>
        {hasUnsavedChanges && (
          <TouchableOpacity
            onPress={handleSaveProfile}
            disabled={isSaving}
            style={[styles.saveButton, { backgroundColor: profileColors.balanced }]}
            activeOpacity={0.8}
          >
            <Text style={styles.saveButtonText}>{isSaving ? 'Saving...' : 'Save'}</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.textSecondary} />
        }
      >
        {/* Active profile badge */}
        {activeCalendarProfile && (
          <View style={styles.section}>
            <View style={[styles.activeBadge, { backgroundColor: getProfileColor(activeCalendarProfile.profile.name) + '20', borderColor: getProfileColor(activeCalendarProfile.profile.name) }]}>
              <Ionicons name="shield-checkmark" size={16} color={getProfileColor(activeCalendarProfile.profile.name)} />
              <View style={styles.activeBadgeText}>
                <Text style={[styles.activeName, { color: getProfileColor(activeCalendarProfile.profile.name) }]}>
                  {activeCalendarProfile.profile.name}
                </Text>
                {activeCalendarProfile.active_until && (
                  <Text style={[styles.activeUntil, { color: theme.textSecondary }]}>
                    until {new Date(activeCalendarProfile.active_until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                )}
              </View>
            </View>
          </View>
        )}

        {/* Preset selector */}
        <View style={styles.section}>
          <SectionHeader title="Aggressiveness Profile" />
          <View style={styles.presetRow}>
            {presets.map(preset => {
              const color = getPresetColor(preset);
              const isActive = activePreset === preset;
              return (
                <TouchableOpacity
                  key={preset}
                  onPress={() => preset !== 'Custom' && handlePresetSelect(preset as Exclude<PresetName, 'Custom'>)}
                  style={[
                    styles.presetButton,
                    { borderColor: isActive ? color : theme.borderDefault },
                    isActive && { backgroundColor: color + '20' },
                  ]}
                  activeOpacity={0.7}
                  disabled={preset === 'Custom'}
                >
                  <Text style={[styles.presetText, { color: isActive ? color : theme.textSecondary }]}>
                    {preset}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Sliders */}
        <View style={styles.section}>
          <Card>
            <View style={styles.sliders}>
              <AggressivenessSlider
                axis="export"
                label="Export"
                value={exportVal}
                onChange={(v) => handleSliderChange('export', v)}
              />
              <View style={[styles.divider, { backgroundColor: theme.borderDefault }]} />
              <AggressivenessSlider
                axis="preservation"
                label="Preservation"
                value={preservationVal}
                onChange={(v) => handleSliderChange('preservation', v)}
              />
              <View style={[styles.divider, { backgroundColor: theme.borderDefault }]} />
              <AggressivenessSlider
                axis="import"
                label="Import"
                value={importVal}
                onChange={(v) => handleSliderChange('import', v)}
              />
            </View>
          </Card>
        </View>

        {/* Impact summary */}
        <View style={styles.section}>
          <View style={[styles.impactBox, { backgroundColor: theme.bgSecondary, borderColor: theme.borderDefault }]}>
            <Text style={[styles.impactLabel, { color: theme.textSecondary }]}>With these settings</Text>
            <Text style={[styles.impactText, { color: theme.textPrimary }]}>
              {getImpactSummary(exportVal, preservationVal, importVal)}
            </Text>
          </View>
        </View>

        {/* Calendar section */}
        <View style={styles.section}>
          <SectionHeader
            title="Schedule"
            right={
              <Text style={[styles.calendarHint, { color: theme.textTertiary }]}>
                Tap a time block to add rule
              </Text>
            }
          />
          <Card>
            <CalendarDayView
              rules={calendarRules}
              overrides={calendarOverrides}
              profiles={profiles}
              onRulesChanged={loadData}
            />
          </Card>
        </View>

        {/* Upcoming changes */}
        {activeCalendarProfile?.next_profile && (
          <View style={styles.section}>
            <SectionHeader title="Upcoming Changes" />
            <Card>
              <View style={styles.upcomingRow}>
                <Ionicons name="time-outline" size={16} color={theme.textSecondary} />
                <Text style={[styles.upcomingText, { color: theme.textSecondary }]}>
                  {new Date(activeCalendarProfile.next_profile.starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {'  →  '}
                  <Text style={{ color: getProfileColor(activeCalendarProfile.next_profile.name), fontWeight: fontWeight.medium }}>
                    {activeCalendarProfile.next_profile.name}
                  </Text>
                </Text>
              </View>
            </Card>
          </View>
        )}

        <View style={{ height: spacing[8] }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderBottomWidth: 1,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  saveButton: {
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[4],
    borderRadius: radius.full,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  scroll: { flex: 1 },
  content: { paddingVertical: spacing[4] },
  section: {
    paddingHorizontal: spacing[4],
    marginBottom: spacing[4],
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
  },
  activeBadgeText: { flex: 1 },
  activeName: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  activeUntil: {
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  presetRow: {
    flexDirection: 'row',
    gap: spacing[2],
    marginTop: spacing[2],
  },
  presetButton: {
    flex: 1,
    paddingVertical: spacing[3],
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1.5,
  },
  presetText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  sliders: {
    gap: spacing[5],
  },
  divider: {
    height: 1,
  },
  impactBox: {
    padding: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
  },
  impactLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing[1],
  },
  impactText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  calendarHint: {
    fontSize: fontSize.xs,
  },
  upcomingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  upcomingText: {
    fontSize: fontSize.sm,
  },
});
