'use client';

import { useState } from 'react';
import { Zap, ZapOff, RotateCcw } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { ScheduleAction } from '@/types/api';

interface ModeControlProps {
  currentAction: ScheduleAction;
  isOverride: boolean;
  nextAction: ScheduleAction;
  nextChangeAt: string;
  onUpdate?: () => void;
}

type OverrideAction = 'CHARGE' | 'HOLD' | 'DISCHARGE';

const DURATION_OPTIONS = [
  { label: '30 min', minutes: 30 },
  { label: '1 hr', minutes: 60 },
  { label: '2 hr', minutes: 120 },
  { label: 'Next', minutes: 0 },
];

export function ModeControl({ currentAction, isOverride, nextAction, nextChangeAt, onUpdate }: ModeControlProps) {
  const [pending, setPending] = useState<OverrideAction | null>(null);
  const [duration, setDuration] = useState(60);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function applyOverride(action: OverrideAction) {
    setLoading(true);
    setError(null);
    try {
      const endTime = new Date(Date.now() + duration * 60 * 1000).toISOString();
      await api.postScheduleOverride(action, endTime, `Manual override from dashboard`);
      setPending(null);
      onUpdate?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply override');
    } finally {
      setLoading(false);
    }
  }

  async function cancelOverride() {
    setLoading(true);
    setError(null);
    try {
      await api.deleteScheduleOverride();
      onUpdate?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel override');
    } finally {
      setLoading(false);
    }
  }

  const nextTime = nextChangeAt
    ? new Date(nextChangeAt).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true })
    : null;

  return (
    <div className="space-y-3">
      {/* Three-way segmented control */}
      <div
        className="grid grid-cols-3 rounded-md overflow-hidden border"
        style={{ borderColor: 'var(--border-default)' }}
      >
        <button
          onClick={isOverride ? cancelOverride : undefined}
          disabled={loading}
          className={cn(
            'py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-1.5',
            !isOverride
              ? 'bg-[var(--text-primary)] text-[var(--bg-primary)]'
              : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
          )}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Auto
        </button>
        <button
          onClick={() => applyOverride('CHARGE')}
          disabled={loading}
          className={cn(
            'py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 border-x',
            currentAction === 'CHARGE' && isOverride
              ? 'text-white'
              : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
          )}
          style={{
            borderColor: 'var(--border-default)',
            ...(currentAction === 'CHARGE' && isOverride ? { backgroundColor: '#059669' } : {}),
          }}
        >
          <Zap className="w-3.5 h-3.5" />
          Charge
        </button>
        <button
          onClick={() => applyOverride('DISCHARGE')}
          disabled={loading}
          className={cn(
            'py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-1.5',
            currentAction === 'DISCHARGE' && isOverride
              ? 'text-white'
              : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
          )}
          style={
            currentAction === 'DISCHARGE' && isOverride ? { backgroundColor: '#DC2626' } : {}
          }
        >
          <ZapOff className="w-3.5 h-3.5" />
          Discharge
        </button>
      </div>

      {/* Duration selector (only when selecting an override) */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-[var(--text-secondary)]">Duration:</span>
        <div className="flex gap-1">
          {DURATION_OPTIONS.map((opt) => (
            <button
              key={opt.label}
              onClick={() => setDuration(opt.minutes)}
              className={cn(
                'px-2 py-1 text-xs rounded transition-colors',
                duration === opt.minutes
                  ? 'bg-[var(--text-primary)] text-[var(--bg-primary)]'
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Status line */}
      <div className="flex items-center justify-between text-xs" style={{ color: 'var(--text-secondary)' }}>
        <span>
          Mode: {isOverride ? 'Manual override' : 'Automatic'}
        </span>
        {nextTime && nextAction && (
          <span>Next: {nextAction.toLowerCase()} at {nextTime}</span>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}
    </div>
  );
}
