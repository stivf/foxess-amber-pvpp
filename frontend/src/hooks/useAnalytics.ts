'use client';

import { useState, useEffect, useCallback } from 'react';
import type { AnalyticsSavings } from '@/types/api';
import { apiFetch } from './useStatus';

interface UseAnalyticsResult {
  data: AnalyticsSavings | null;
  loading: boolean;
  error: string | null;
  period: 'day' | 'week' | 'month' | 'year';
  setPeriod: (p: 'day' | 'week' | 'month' | 'year') => void;
  refetch: () => void;
}

export function useAnalytics(): UseAnalyticsResult {
  const [data, setData] = useState<AnalyticsSavings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<'day' | 'week' | 'month' | 'year'>('month');

  const fetch = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await apiFetch<AnalyticsSavings>(`/analytics/savings?period=${period}`);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, loading, error, period, setPeriod, refetch: fetch };
}
