'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Preferences } from '@/types/api';
import { apiFetch } from './useStatus';

interface UsePreferencesResult {
  data: Preferences | null;
  loading: boolean;
  error: string | null;
  update: (patch: Partial<Preferences>) => Promise<void>;
  refetch: () => void;
}

export function usePreferences(): UsePreferencesResult {
  const [data, setData] = useState<Preferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await apiFetch<Preferences>('/preferences');
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load preferences');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const update = useCallback(
    async (patch: Partial<Preferences>) => {
      const result = await apiFetch<Preferences>('/preferences', {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      setData(result);
    },
    [],
  );

  return { data, loading, error, update, refetch: fetch };
}
