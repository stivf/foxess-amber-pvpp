'use client';

import { useState, useEffect, useCallback } from 'react';
import type {
  ProfilesResponse,
  Profile,
  CalendarRulesResponse,
  CalendarRule,
  CalendarOverridesResponse,
  CalendarOverride,
} from '@/types/api';
import { apiFetch } from './useStatus';

interface UseProfilesResult {
  profiles: Profile[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
  createProfile: (data: Omit<Profile, 'id' | 'is_default' | 'created_at' | 'updated_at'>) => Promise<Profile>;
  updateProfile: (id: string, data: Partial<Profile>) => Promise<Profile>;
  deleteProfile: (id: string) => Promise<void>;
  setDefaultProfile: (id: string) => Promise<void>;
}

export function useProfiles(): UseProfilesResult {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await apiFetch<ProfilesResponse>('/profiles');
      setProfiles(result.profiles);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load profiles');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const createProfile = useCallback(
    async (data: Omit<Profile, 'id' | 'is_default' | 'created_at' | 'updated_at'>) => {
      const result = await apiFetch<Profile>('/profiles', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      await fetch();
      return result;
    },
    [fetch],
  );

  const updateProfile = useCallback(
    async (id: string, data: Partial<Profile>) => {
      const result = await apiFetch<Profile>(`/profiles/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      await fetch();
      return result;
    },
    [fetch],
  );

  const deleteProfile = useCallback(
    async (id: string) => {
      await apiFetch(`/profiles/${id}`, { method: 'DELETE' });
      await fetch();
    },
    [fetch],
  );

  const setDefaultProfile = useCallback(
    async (id: string) => {
      await apiFetch(`/profiles/${id}/set-default`, { method: 'POST' });
      await fetch();
    },
    [fetch],
  );

  return { profiles, loading, error, refetch: fetch, createProfile, updateProfile, deleteProfile, setDefaultProfile };
}

interface UseCalendarRulesResult {
  rules: CalendarRule[];
  loading: boolean;
  refetch: () => void;
  createRule: (data: Omit<CalendarRule, 'id' | 'created_at'>) => Promise<CalendarRule>;
  updateRule: (id: string, data: Partial<CalendarRule>) => Promise<CalendarRule>;
  deleteRule: (id: string) => Promise<void>;
}

export function useCalendarRules(): UseCalendarRulesResult {
  const [rules, setRules] = useState<CalendarRule[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    try {
      setLoading(true);
      const result = await apiFetch<CalendarRulesResponse>('/calendar/rules');
      setRules(result.rules);
    } catch {
      // Keep existing state on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const createRule = useCallback(
    async (data: Omit<CalendarRule, 'id' | 'created_at'>) => {
      const result = await apiFetch<CalendarRule>('/calendar/rules', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      await fetch();
      return result;
    },
    [fetch],
  );

  const updateRule = useCallback(
    async (id: string, data: Partial<CalendarRule>) => {
      const result = await apiFetch<CalendarRule>(`/calendar/rules/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      await fetch();
      return result;
    },
    [fetch],
  );

  const deleteRule = useCallback(
    async (id: string) => {
      await apiFetch(`/calendar/rules/${id}`, { method: 'DELETE' });
      await fetch();
    },
    [fetch],
  );

  return { rules, loading, refetch: fetch, createRule, updateRule, deleteRule };
}

interface UseCalendarOverridesResult {
  overrides: CalendarOverride[];
  loading: boolean;
  refetch: () => void;
  createOverride: (data: Omit<CalendarOverride, 'id' | 'created_at'>) => Promise<CalendarOverride>;
  deleteOverride: (id: string) => Promise<void>;
}

export function useCalendarOverrides(): UseCalendarOverridesResult {
  const [overrides, setOverrides] = useState<CalendarOverride[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    try {
      setLoading(true);
      const result = await apiFetch<CalendarOverridesResponse>('/calendar/overrides');
      setOverrides(result.overrides);
    } catch {
      // Keep existing state on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const createOverride = useCallback(
    async (data: Omit<CalendarOverride, 'id' | 'created_at'>) => {
      const result = await apiFetch<CalendarOverride>('/calendar/overrides', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      await fetch();
      return result;
    },
    [fetch],
  );

  const deleteOverride = useCallback(
    async (id: string) => {
      await apiFetch(`/calendar/overrides/${id}`, { method: 'DELETE' });
      await fetch();
    },
    [fetch],
  );

  return { overrides, loading, refetch: fetch, createOverride, deleteOverride };
}
