import { useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { useAppStore } from '../store';

export function useSystemStatus() {
  const {
    systemStatus,
    battery,
    price,
    solar,
    grid,
    schedule,
    activeProfile,
    savings,
    isLoadingStatus,
    lastError,
    setSystemStatus,
    setLoading,
    setError,
  } = useAppStore();

  const refresh = useCallback(async () => {
    setLoading('status', true);
    try {
      const status = await api.getStatus();
      setSystemStatus(status);
      setError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load status';
      setError(msg);
    } finally {
      setLoading('status', false);
    }
  }, [setSystemStatus, setLoading, setError]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    systemStatus,
    battery,
    price,
    solar,
    grid,
    schedule,
    activeProfile,
    savings,
    isLoading: isLoadingStatus,
    error: lastError,
    refresh,
  };
}
