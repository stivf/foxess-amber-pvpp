'use client';

import { useState, useCallback } from 'react';
import { X, Save, Trash2 } from 'lucide-react';
import { getProfileColor } from '@/lib/colors';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import type { CalendarRule, Profile } from '@/types/api';
import { api } from '@/lib/api';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_NUMBERS = [0, 1, 2, 3, 4, 5, 6];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

interface CalendarScheduleViewProps {
  rules: CalendarRule[];
  profiles: Profile[];
  onRulesChange: () => void;
}

interface RuleFormState {
  editingRule: CalendarRule | null;
  dayIndex: number;
  hour: number;
  profileId: string;
  startTime: string;
  endTime: string;
  daysOfWeek: number[];
}

function getCellProfile(
  rules: CalendarRule[],
  dayIndex: number,
  hour: number,
): { name: string; color: string } | null {
  const timeStr = `${String(hour).padStart(2, '0')}:00`;

  const matchingRule = rules
    .filter((rule) => {
      if (!rule.enabled) return false;
      if (!rule.days_of_week.includes(dayIndex)) return false;
      return rule.start_time <= timeStr && rule.end_time > timeStr;
    })
    .sort((a, b) => b.priority - a.priority)[0];

  if (!matchingRule) return null;
  return { name: matchingRule.profile_name, color: getProfileColor(matchingRule.profile_name) };
}

function RuleFormModal({
  state,
  profiles,
  onClose,
  onSave,
  onDelete,
}: {
  state: RuleFormState;
  profiles: Profile[];
  onClose: () => void;
  onSave: (data: { profile_id: string; start_time: string; end_time: string; days_of_week: number[]; name: string }) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [profileId, setProfileId] = useState(state.profileId || profiles[0]?.id || '');
  const [startTime, setStartTime] = useState(state.startTime);
  const [endTime, setEndTime] = useState(state.endTime);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(state.daysOfWeek);
  const [isSaving, setIsSaving] = useState(false);

  const toggleDay = (day: number) => {
    setDaysOfWeek((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort(),
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const profile = profiles.find((p) => p.id === profileId);
      await onSave({
        profile_id: profileId,
        start_time: startTime,
        end_time: endTime,
        days_of_week: daysOfWeek,
        name: `${profile?.name ?? 'Custom'} ${startTime}-${endTime}`,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden="true" />
      <div
        className="relative w-full max-w-sm rounded-lg bg-[var(--bg-primary)] border border-[var(--border-default)] shadow-lg p-5 space-y-4"
        role="dialog"
        aria-modal="true"
        aria-label="Schedule rule"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">Schedule Rule</h3>
          <button onClick={onClose} aria-label="Close"><X className="w-4 h-4 text-[var(--text-secondary)]" /></button>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-[var(--text-primary)]">Profile</label>
          <div className="flex flex-wrap gap-2">
            {profiles.map((p) => {
              const color = getProfileColor(p.name);
              const isActive = profileId === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setProfileId(p.id)}
                  className="px-3 py-1.5 rounded-full text-sm font-medium transition-all"
                  style={{ backgroundColor: isActive ? color : `${color}26`, color: isActive ? 'white' : color }}
                >
                  {p.name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-[var(--text-primary)]">Time Range</label>
          <div className="flex items-center gap-2">
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)}
              className="flex-1 rounded-md border border-[var(--border-default)] bg-[var(--bg-secondary)] px-2 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1" />
            <span className="text-[var(--text-secondary)] text-sm">to</span>
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)}
              className="flex-1 rounded-md border border-[var(--border-default)] bg-[var(--bg-secondary)] px-2 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1" />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-[var(--text-primary)]">Repeat</label>
          <div className="flex gap-1">
            {DAYS.map((day, i) => (
              <button key={day} onClick={() => toggleDay(i)}
                className={cn('flex-1 py-1.5 text-xs font-medium rounded transition-colors',
                  daysOfWeek.includes(i) ? 'bg-[var(--text-primary)] text-[var(--bg-primary)]' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]')}
                aria-pressed={daysOfWeek.includes(i)}>
                {day.slice(0, 1)}
              </button>
            ))}
          </div>
          <div className="flex gap-2 text-xs">
            <button onClick={() => setDaysOfWeek([0,1,2,3,4])} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline">Weekdays</button>
            <button onClick={() => setDaysOfWeek([5,6])} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline">Weekends</button>
            <button onClick={() => setDaysOfWeek([0,1,2,3,4,5,6])} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline">Every day</button>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          {state.editingRule && (
            <Button variant="danger" size="sm" onClick={onDelete} className="gap-1">
              <Trash2 className="w-3.5 h-3.5" />Delete
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={isSaving || daysOfWeek.length === 0}>
            <Save className="w-3.5 h-3.5" />{isSaving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function CalendarScheduleView({ rules, profiles, onRulesChange }: CalendarScheduleViewProps) {
  const [ruleForm, setRuleForm] = useState<RuleFormState | null>(null);

  const openNewRule = useCallback((dayIndex: number, hour: number) => {
    setRuleForm({
      editingRule: null,
      dayIndex,
      hour,
      profileId: profiles[0]?.id ?? '',
      startTime: `${String(hour).padStart(2, '0')}:00`,
      endTime: `${String(Math.min(hour + 2, 23)).padStart(2, '0')}:00`,
      daysOfWeek: [dayIndex],
    });
  }, [profiles]);

  const handleSave = async (data: { profile_id: string; start_time: string; end_time: string; days_of_week: number[]; name: string }) => {
    if (ruleForm?.editingRule) {
      await api.updateCalendarRule(ruleForm.editingRule.id, data);
    } else {
      await api.createCalendarRule({ ...data, priority: 10, enabled: true });
    }
    onRulesChange();
    setRuleForm(null);
  };

  const handleDelete = async () => {
    if (ruleForm?.editingRule) {
      await api.deleteCalendarRule(ruleForm.editingRule.id);
      onRulesChange();
      setRuleForm(null);
    }
  };

  const now = new Date();
  const todayDayIndex = (now.getDay() + 6) % 7;

  return (
    <div className="overflow-auto">
      <div className="min-w-[600px]">
        <div className="grid grid-cols-[48px_repeat(7,1fr)] gap-px mb-px">
          <div />
          {DAYS.map((day, i) => (
            <div key={day} className={cn('text-center text-sm font-medium py-2',
              i === todayDayIndex ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]')}>
              {day}
              {i === todayDayIndex && <div className="w-1.5 h-1.5 rounded-full bg-red-500 mx-auto mt-0.5" />}
            </div>
          ))}
        </div>

        <div className="space-y-px">
          {HOURS.filter((h) => h % 2 === 0).map((hour) => (
            <div key={hour} className="grid grid-cols-[48px_repeat(7,1fr)] gap-px">
              <div className="text-xs text-[var(--text-tertiary)] font-mono pr-2 text-right pt-0.5">
                {hour === 0 ? '12a' : hour < 12 ? `${hour}a` : hour === 12 ? '12p' : `${hour - 12}p`}
              </div>
              {DAY_NUMBERS.map((dayIndex) => {
                const cell = getCellProfile(rules, dayIndex, hour);
                return (
                  <div key={dayIndex}
                    className="h-8 rounded-sm cursor-pointer transition-opacity hover:opacity-90 relative overflow-hidden"
                    style={{
                      backgroundColor: cell ? `${cell.color}30` : 'var(--bg-tertiary)',
                      borderLeft: cell ? `2px solid ${cell.color}` : undefined,
                    }}
                    onClick={() => openNewRule(dayIndex, hour)}
                    title={cell ? `${cell.name}` : `Add rule`}
                    role="button"
                    aria-label={cell ? `${cell.name} on ${DAYS[dayIndex]} at ${hour}:00` : `Add rule on ${DAYS[dayIndex]} at ${hour}:00`}
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openNewRule(dayIndex, hour); }}
                  >
                    {cell && (
                      <span className="absolute inset-0 flex items-center justify-center text-[9px] font-medium truncate px-0.5"
                        style={{ color: cell.color }}>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-[var(--border-default)]">
          <span className="text-xs text-[var(--text-secondary)]">Legend:</span>
          {profiles.map((p) => {
            const color = getProfileColor(p.name);
            return (
              <div key={p.id} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: `${color}50`, borderLeft: `2px solid ${color}` }} />
                <span className="text-xs text-[var(--text-secondary)]">{p.name}</span>
              </div>
            );
          })}
        </div>
      </div>

      {ruleForm && (
        <RuleFormModal
          state={ruleForm}
          profiles={profiles}
          onClose={() => setRuleForm(null)}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
