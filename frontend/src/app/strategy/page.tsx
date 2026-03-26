'use client';

import { useState, useEffect, useCallback } from 'react';
import { NavBar } from '@/components/shared/NavBar';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { AggressivenessControls } from '@/components/strategy/AggressivenessControls';
import { CalendarScheduleView } from '@/components/strategy/CalendarScheduleView';
import { api } from '@/lib/api';
import { getProfileColor } from '@/lib/colors';
import { formatTime } from '@/lib/utils';
import type { Profile, ActiveProfileResponse, CalendarRule } from '@/types/api';

export default function StrategyPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfile, setActiveProfile] = useState<ActiveProfileResponse | null>(null);
  const [rules, setRules] = useState<CalendarRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [profilesData, activeData, rulesData] = await Promise.all([
        api.getProfiles(),
        api.getActiveProfile(),
        api.getCalendarRules(),
      ]);
      setProfiles(profilesData.profiles);
      setActiveProfile(activeData);
      setRules(rulesData.rules);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load strategy data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const currentProfile = profiles.find((p) => p.id === activeProfile?.profile?.id) ?? profiles[0];
  const profileColor = currentProfile ? getProfileColor(currentProfile.name) : '#8B5CF6';

  if (loading) {
    return (
      <>
        <NavBar profileName={activeProfile?.profile?.name} />
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </>
    );
  }

  return (
    <>
      <NavBar profileName={activeProfile?.profile?.name} />

      <main className="max-w-screen-xl mx-auto px-4 py-4 space-y-6">
        {error && (
          <div
            className="rounded-md border p-4 text-sm"
            style={{ backgroundColor: '#DC262610', borderColor: '#DC262640', color: '#DC2626' }}
          >
            {error}
          </div>
        )}

        {/* Active profile header */}
        {activeProfile && currentProfile && (
          <div
            className="flex items-center gap-3 p-4 rounded-lg border"
            style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-default)' }}
          >
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
              style={{ backgroundColor: profileColor }}
            >
              {currentProfile.name.charAt(0)}
            </div>
            <div>
              <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                Active: {currentProfile.name}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {activeProfile.source === 'default' && 'Default profile'}
                {activeProfile.source === 'recurring_rule' && `From rule: ${activeProfile.rule_name}`}
                {activeProfile.source === 'one_off_override' && 'One-off override'}
                {activeProfile.active_until && ` — until ${formatTime(activeProfile.active_until)}`}
              </p>
            </div>

            {activeProfile.next_profile && (
              <div className="ml-auto text-right">
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Next:</p>
                <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                  {activeProfile.next_profile.name}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  {formatTime(activeProfile.next_profile.starts_at)}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Profile selector */}
        {profiles.length > 1 && (
          <div className="flex gap-2 flex-wrap">
            {profiles.map((p) => {
              const color = getProfileColor(p.name);
              const isActive = p.id === currentProfile?.id;
              return (
                <button
                  key={p.id}
                  className="px-3 py-1.5 rounded-full text-sm font-medium transition-all"
                  style={
                    isActive
                      ? { backgroundColor: color, color: '#fff' }
                      : { backgroundColor: `${color}26`, color }
                  }
                >
                  {p.name}
                  {p.is_default && <span className="ml-1 text-xs opacity-70">(default)</span>}
                </button>
              );
            })}
          </div>
        )}

        {/* Aggressiveness controls */}
        {currentProfile && (
          <Card>
            <CardHeader>
              <CardTitle>Aggressiveness Profile — {currentProfile.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <AggressivenessControls
                profile={currentProfile}
                onUpdate={(updated) => {
                  setProfiles((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
                }}
              />
            </CardContent>
          </Card>
        )}

        {/* Calendar schedule */}
        <Card>
          <CardHeader>
            <CardTitle>Schedule</CardTitle>
          </CardHeader>
          <CardContent>
            <CalendarScheduleView
              rules={rules}
              profiles={profiles}
              onRulesChange={loadData}
            />
          </CardContent>
        </Card>

        {/* Upcoming changes */}
        {rules.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Upcoming Changes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {rules.slice(0, 5).map((rule) => {
                  const color = getProfileColor(rule.profile_name);
                  return (
                    <div
                      key={rule.id}
                      className="flex items-center gap-3 py-2 border-b last:border-0"
                      style={{ borderColor: 'var(--border-default)' }}
                    >
                      <div
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <div className="flex-1">
                        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                          {rule.start_time} – {rule.end_time}
                        </span>
                        <span className="ml-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                          → {rule.profile_name}
                        </span>
                      </div>
                      <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        {rule.name}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </>
  );
}
