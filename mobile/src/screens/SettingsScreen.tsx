import React, { useEffect, useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../store';
import { api, saveApiConfig, getApiConfig } from '../services/api';
import {
  registerForPushNotifications,
  unregisterPushNotifications,
} from '../services/notifications';
import { Card } from '../components/common/Card';
import { SectionHeader } from '../components/common/SectionHeader';
import {
  useTheme,
  priceColors,
  batteryStateColors,
  spacing,
  radius,
  fontSize,
  fontWeight,
} from '../theme';
import type { Preferences } from '../types/api';

interface SettingRowProps {
  label: string;
  sub?: string;
  value: boolean;
  onToggle: (v: boolean) => void;
  accentColor?: string;
}

function ToggleRow({ label, sub, value, onToggle, accentColor }: SettingRowProps) {
  const theme = useTheme();
  return (
    <View style={[styles.settingRow, { borderBottomColor: theme.borderDefault }]}>
      <View style={styles.settingLeft}>
        <Text style={[styles.settingLabel, { color: theme.textPrimary }]}>{label}</Text>
        {sub && <Text style={[styles.settingSub, { color: theme.textTertiary }]}>{sub}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: theme.bgTertiary, true: accentColor ?? priceColors.cheap2 }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

export function SettingsScreen() {
  const theme = useTheme();
  const { preferences, setPreferences, themeMode, setThemeMode } = useAppStore();

  const [apiUrl, setApiUrl] = useState('http://localhost:3000');
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [savingApiConfig, setSavingApiConfig] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  useEffect(() => {
    // Load API config
    getApiConfig().then(({ baseUrl, apiKey: key }) => {
      setApiUrl(baseUrl);
      setApiKey(key);
    });

    // Load preferences
    api.getPreferences().then(setPreferences).catch(() => {});
  }, [setPreferences]);

  const handleSaveApiConfig = useCallback(async () => {
    setSavingApiConfig(true);
    try {
      await saveApiConfig(apiUrl.trim(), apiKey.trim());
      Alert.alert('Saved', 'API configuration updated. Reconnecting...');
    } catch {
      Alert.alert('Error', 'Failed to save API configuration');
    } finally {
      setSavingApiConfig(false);
    }
  }, [apiUrl, apiKey]);

  const handleNotificationToggle = useCallback(async (enabled: boolean) => {
    if (enabled) {
      const token = await registerForPushNotifications();
      setNotificationsEnabled(!!token);
      if (!token) {
        Alert.alert(
          'Permission Required',
          'Please enable notifications in your device settings.',
        );
      }
    } else {
      await unregisterPushNotifications();
      setNotificationsEnabled(false);
    }
  }, []);

  const handlePreferenceToggle = useCallback(
    async (key: keyof Preferences['notifications'], value: boolean) => {
      if (!preferences) return;
      const updated: Preferences = {
        ...preferences,
        notifications: { ...preferences.notifications, [key]: value },
      };
      setPreferences(updated);
      try {
        await api.patchPreferences({ notifications: { [key]: value } });
      } catch {
        setPreferences(preferences); // revert
        Alert.alert('Error', 'Failed to update notification preference');
      }
    },
    [preferences, setPreferences],
  );

  const handleMinSocChange = useCallback(
    async (minSoc: number) => {
      if (!preferences) return;
      const updated: Preferences = { ...preferences, min_soc: minSoc };
      setPreferences(updated);
      try {
        await api.patchPreferences({ min_soc: minSoc });
      } catch {
        setPreferences(preferences);
        Alert.alert('Error', 'Failed to update minimum SoC');
      }
    },
    [preferences, setPreferences],
  );

  const themeOptions: { key: typeof themeMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: 'light', label: 'Light', icon: 'sunny' },
    { key: 'dark', label: 'Dark', icon: 'moon' },
    { key: 'system', label: 'System', icon: 'phone-portrait' },
  ];

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.bgPrimary }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.borderDefault }]}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Settings</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Push Notifications */}
        <View style={styles.section}>
          <SectionHeader title="Push Notifications" />
          <Card>
            <ToggleRow
              label="Enable Notifications"
              sub="Receive alerts on this device"
              value={notificationsEnabled}
              onToggle={handleNotificationToggle}
            />

            {preferences && (
              <>
                <ToggleRow
                  label="Price Spike Alerts"
                  sub="When grid price spikes above threshold"
                  value={preferences.notifications.price_spike}
                  onToggle={(v) => handlePreferenceToggle('price_spike', v)}
                  accentColor={batteryStateColors.discharging}
                />
                <ToggleRow
                  label="Battery Low Alert"
                  sub="When SoC drops below minimum"
                  value={preferences.notifications.battery_low}
                  onToggle={(v) => handlePreferenceToggle('battery_low', v)}
                  accentColor={batteryStateColors.discharging}
                />
                <ToggleRow
                  label="Schedule Changes"
                  sub="When the system changes actions"
                  value={preferences.notifications.schedule_change}
                  onToggle={(v) => handlePreferenceToggle('schedule_change', v)}
                />
                <ToggleRow
                  label="Daily Summary"
                  sub="End-of-day savings report"
                  value={preferences.notifications.daily_summary}
                  onToggle={(v) => handlePreferenceToggle('daily_summary', v)}
                />
              </>
            )}
          </Card>
        </View>

        {/* Battery Preferences */}
        {preferences && (
          <View style={styles.section}>
            <SectionHeader title="Battery" />
            <Card>
              <View style={styles.settingRow}>
                <View style={styles.settingLeft}>
                  <Text style={[styles.settingLabel, { color: theme.textPrimary }]}>
                    Minimum SoC
                  </Text>
                  <Text style={[styles.settingSub, { color: theme.textTertiary }]}>
                    Never discharge below this level
                  </Text>
                </View>
                <View style={styles.socStepper}>
                  <TouchableOpacity
                    onPress={() => handleMinSocChange(Math.max(5, preferences.min_soc - 5))}
                    style={[styles.stepperBtn, { borderColor: theme.borderDefault }]}
                  >
                    <Text style={[styles.stepperBtnText, { color: theme.textPrimary }]}>−</Text>
                  </TouchableOpacity>
                  <Text style={[styles.socValue, { color: theme.textPrimary, fontVariant: ['tabular-nums'] }]}>
                    {preferences.min_soc}%
                  </Text>
                  <TouchableOpacity
                    onPress={() => handleMinSocChange(Math.min(50, preferences.min_soc + 5))}
                    style={[styles.stepperBtn, { borderColor: theme.borderDefault }]}
                  >
                    <Text style={[styles.stepperBtnText, { color: theme.textPrimary }]}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <ToggleRow
                label="Auto Mode"
                sub="Let Battery Brain control the battery"
                value={preferences.auto_mode_enabled}
                onToggle={async (v) => {
                  const updated = { ...preferences, auto_mode_enabled: v };
                  setPreferences(updated);
                  try {
                    await api.patchPreferences({ auto_mode_enabled: v });
                  } catch {
                    setPreferences(preferences);
                  }
                }}
                accentColor={priceColors.cheap2}
              />
            </Card>
          </View>
        )}

        {/* Appearance */}
        <View style={styles.section}>
          <SectionHeader title="Appearance" />
          <Card>
            <View style={styles.themeRow}>
              {themeOptions.map(opt => {
                const isActive = themeMode === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    onPress={() => setThemeMode(opt.key)}
                    style={[
                      styles.themeBtn,
                      {
                        backgroundColor: isActive ? theme.bgTertiary : 'transparent',
                        borderColor: isActive ? theme.borderStrong : theme.borderDefault,
                      },
                    ]}
                  >
                    <Ionicons
                      name={opt.icon}
                      size={18}
                      color={isActive ? theme.textPrimary : theme.textSecondary}
                    />
                    <Text
                      style={[
                        styles.themeBtnText,
                        { color: isActive ? theme.textPrimary : theme.textSecondary },
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Card>
        </View>

        {/* API Connection */}
        <View style={styles.section}>
          <SectionHeader title="API Connection" />
          <Card>
            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Server URL</Text>
            <TextInput
              value={apiUrl}
              onChangeText={setApiUrl}
              placeholder="http://localhost:3000"
              placeholderTextColor={theme.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={[
                styles.textInput,
                {
                  color: theme.textPrimary,
                  backgroundColor: theme.bgTertiary,
                  borderColor: theme.borderDefault,
                },
              ]}
            />

            <Text style={[styles.inputLabel, { color: theme.textSecondary, marginTop: spacing[3] }]}>
              API Key
            </Text>
            <View style={styles.apiKeyRow}>
              <TextInput
                value={apiKey}
                onChangeText={setApiKey}
                placeholder="Your API key"
                placeholderTextColor={theme.textTertiary}
                secureTextEntry={!showApiKey}
                autoCapitalize="none"
                autoCorrect={false}
                style={[
                  styles.textInput,
                  styles.apiKeyInput,
                  {
                    color: theme.textPrimary,
                    backgroundColor: theme.bgTertiary,
                    borderColor: theme.borderDefault,
                  },
                ]}
              />
              <TouchableOpacity
                onPress={() => setShowApiKey(s => !s)}
                style={[styles.eyeBtn, { backgroundColor: theme.bgTertiary, borderColor: theme.borderDefault }]}
              >
                <Ionicons
                  name={showApiKey ? 'eye-off' : 'eye'}
                  size={16}
                  color={theme.textSecondary}
                />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={handleSaveApiConfig}
              disabled={savingApiConfig}
              style={[
                styles.saveBtn,
                { backgroundColor: priceColors.cheap2, opacity: savingApiConfig ? 0.6 : 1 },
              ]}
            >
              <Text style={styles.saveBtnText}>
                {savingApiConfig ? 'Saving...' : 'Save Connection'}
              </Text>
            </TouchableOpacity>
          </Card>
        </View>

        {/* About */}
        <View style={styles.section}>
          <Card>
            <View style={[styles.aboutRow, { borderBottomColor: theme.borderDefault }]}>
              <Text style={[styles.aboutLabel, { color: theme.textSecondary }]}>Version</Text>
              <Text style={[styles.aboutValue, { color: theme.textPrimary }]}>1.0.0</Text>
            </View>
            <View style={styles.aboutRow}>
              <Text style={[styles.aboutLabel, { color: theme.textSecondary }]}>Platform</Text>
              <Text style={[styles.aboutValue, { color: theme.textPrimary }]}>Battery Brain</Text>
            </View>
          </Card>
        </View>

        <View style={{ height: spacing[8] }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderBottomWidth: 1,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  scroll: { flex: 1 },
  content: { paddingVertical: spacing[4] },
  section: {
    paddingHorizontal: spacing[4],
    marginBottom: spacing[4],
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing[3],
  },
  settingLeft: { flex: 1 },
  settingLabel: {
    fontSize: fontSize.base,
  },
  settingSub: {
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  socStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  stepperBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnText: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    lineHeight: 20,
  },
  socValue: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    width: 40,
    textAlign: 'center',
  },
  themeRow: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  themeBtn: {
    flex: 1,
    paddingVertical: spacing[3],
    alignItems: 'center',
    gap: spacing[1],
    borderRadius: radius.md,
    borderWidth: 1,
  },
  themeBtnText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  inputLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    marginBottom: spacing[2],
  },
  textInput: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: radius.md,
    borderWidth: 1,
    fontSize: fontSize.base,
  },
  apiKeyRow: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  apiKeyInput: {
    flex: 1,
  },
  eyeBtn: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
  },
  saveBtn: {
    marginTop: spacing[3],
    paddingVertical: spacing[3],
    borderRadius: radius.md,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  aboutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  aboutLabel: {
    fontSize: fontSize.sm,
  },
  aboutValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
});
