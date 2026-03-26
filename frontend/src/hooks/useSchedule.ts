'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ScheduleResponse } from '@/types/api';
import { apiFetch } from './useStatus';

interface UseScheduleResult {
  data: ScheduleResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useSchedule(): UseScheduleResult {
  const [data, setData] = useState<ScheduleResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await apiFetch<ScheduleResponse>('/schedule');
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load schedule');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
    const interval = setInterval(fetch, 60000);
    return () => clearInterval(interval);
  }, [fetch]);

  return { data, loading, error, refetch: fetch };
}
