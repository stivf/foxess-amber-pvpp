import { useState, useCallback } from 'react';
import { api } from '../services/api';
import type { ScheduleAction } from '../types/api';
import { addMinutes, formatISO } from 'date-fns';

export type OverrideDuration = 30 | 60 | 120 | null; // null = until next schedule

export function useOverride() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyOverride = useCallback(
    async (action: ScheduleAction, durationMinutes: OverrideDuration): Promise<boolean> => {
      setLoading(true);
      setError(null);
      try {
        const endTime = durationMinutes
          ? formatISO(addMinutes(new Date(), durationMinutes))
          : formatISO(addMinutes(new Date(), 480)); // default 8h if no duration

        await api.createOverride(action, endTime, `Manual override — ${action}`);
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to apply override';
        setError(msg);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const cancelOverride = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      await api.cancelOverride();
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to cancel override';
      setError(msg);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return { applyOverride, cancelOverride, loading, error };
}
