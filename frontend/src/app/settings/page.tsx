'use client';

import { useState, useCallback, useEffect } from 'react';
import { NavBar } from '@/components/shared/NavBar';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Toggle } from '@/components/ui/Toggle';
import { useTheme } from '@/components/providers/ThemeProvider';
import { api } from '@/lib/api';
import type { Preferences } from '@/types/api';

type Theme = 'light' | 'dark' | 'system';

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const prefs = await api.getPreferences();
      setPreferences(prefs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const updatePreferences = async (updates: Partial<Preferences>) => {
    setSaving(true);
    setError(null);
    try {
      const updated = await api.patchPreferences(updates);
      setPreferences(updated);
      setSuccessMessage('Settings saved');
      setTimeout(() => setSuccessMessage(null), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };


  const toggleNotification = async (key: keyof Preferences['notifications']) => {
    if (!preferences) return;
    await updatePreferences({
      notifications: {
        ...preferences.notifications,
        [key]: !preferences.notifications[key],
      },
    });
  };

  return (
    <>
      <NavBar />

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Settings</h1>

        {error && (
          <div className="rounded-md border p-3 text-sm" style={{ backgroundColor: '#DC262610', borderColor: '#DC262640', color: '#DC2626' }}>
            {error}
          </div>
        )}
        {successMessage && (
          <div className="rounded-md border p-3 text-sm" style={{ backgroundColor: '#05966910', borderColor: '#05966940', color: '#059669' }}>
            {successMessage}
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && preferences && (
          <>
            {/* Notifications */}
            <Card>
              <CardHeader>
                <CardTitle>Notifications</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Price spike alert</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>When price exceeds your threshold</p>
                  </div>
                  <Toggle
                    checked={preferences.notifications.price_spike}
                    onChange={() => toggleNotification('price_spike')}
                    disabled={saving}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Battery low alert</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>When battery drops below minimum SoC</p>
                  </div>
                  <Toggle
                    checked={preferences.notifications.battery_low}
                    onChange={() => toggleNotification('battery_low')}
                    disabled={saving}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Schedule changes</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>When the battery changes mode</p>
                  </div>
                  <Toggle
                    checked={preferences.notifications.schedule_change}
                    onChange={() => toggleNotification('schedule_change')}
                    disabled={saving}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Daily summary</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>End-of-day savings report</p>
                  </div>
                  <Toggle
                    checked={preferences.notifications.daily_summary}
                    onChange={() => toggleNotification('daily_summary')}
                    disabled={saving}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Battery preferences */}
            <Card>
              <CardHeader>
                <CardTitle>Battery</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Auto mode</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>Let Battery Brain control charging and discharging</p>
                  </div>
                  <Toggle
                    checked={preferences.auto_mode_enabled}
                    onChange={async (checked) => updatePreferences({ auto_mode_enabled: checked })}
                    disabled={saving}
                  />
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Minimum SoC</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>Never discharge below this level ({preferences.min_soc}%)</p>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={50}
                    step={5}
                    value={preferences.min_soc}
                    onChange={(e) => setPreferences({ ...preferences, min_soc: parseInt(e.target.value) })}
                    onMouseUp={async (e) => {
                      await updatePreferences({ min_soc: parseInt((e.target as HTMLInputElement).value) });
                    }}
                    className="w-32"
                    aria-label="Minimum SoC"
                  />
                  <span className="text-sm font-mono w-8 text-right" style={{ color: 'var(--text-primary)' }}>
                    {preferences.min_soc}%
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Appearance */}
            <Card>
              <CardHeader>
                <CardTitle>Appearance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Theme</p>
                  <div
                    className="inline-flex rounded-md border p-0.5"
                    style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-default)' }}
                    role="radiogroup"
                    aria-label="Theme"
                  >
                    {(['light', 'dark', 'system'] as Theme[]).map((t) => (
                      <button
                        key={t}
                        role="radio"
                        aria-checked={theme === t}
                        onClick={() => setTheme(t)}
                        className="px-3 py-1.5 text-sm font-medium rounded capitalize transition-all"
                        style={
                          theme === t
                            ? { backgroundColor: 'var(--text-primary)', color: 'var(--bg-primary)' }
                            : { color: 'var(--text-secondary)' }
                        }
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* API connections */}
            <Card>
              <CardHeader>
                <CardTitle>API Connections</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { name: 'FoxESS', description: 'Battery telemetry and control' },
                  { name: 'Amber Electric', description: 'Real-time electricity pricing' },
                ].map((service) => (
                  <div key={service.name} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{service.name}</p>
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{service.description}</p>
                    </div>
                    <span
                      className="text-xs px-2 py-1 rounded-full font-medium"
                      style={{ backgroundColor: '#05966926', color: '#059669' }}
                    >
                      Connected
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </>
  );
}
