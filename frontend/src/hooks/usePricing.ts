'use client';

import { useState, useEffect, useCallback } from 'react';
import type { PricingResponse } from '@/types/api';
import { apiFetch } from './useStatus';

interface UsePricingResult {
  data: PricingResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function usePricing(): UsePricingResult {
  const [data, setData] = useState<PricingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await apiFetch<PricingResponse>('/pricing/current');
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pricing');
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
