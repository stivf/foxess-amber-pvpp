import type {
  StatusResponse,
  PricingResponse,
  ScheduleResponse,
  ProfilesResponse,
  Profile,
  CalendarRulesResponse,
  CalendarRule,
  CalendarOverridesResponse,
  CalendarOverride,
  ActiveProfileResponse,
  Preferences,
  AnalyticsSavings,
  BatteryHistoryResponse,
  PriceHistoryResponse,
} from '@/types/api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const API_KEY = process.env.NEXT_PUBLIC_API_KEY ?? '';

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_BASE}/api/v1${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
    throw new Error(error?.error?.message ?? `HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const api = {
  // Dashboard
  getStatus: () => apiFetch<StatusResponse>('/status'),

  // Pricing
  getPricing: () => apiFetch<PricingResponse>('/pricing/current'),
  getPricingHistory: (from: string, to?: string, interval?: string) => {
    const params = new URLSearchParams({ from });
    if (to) params.set('to', to);
    if (interval) params.set('interval', interval);
    return apiFetch<PriceHistoryResponse>(`/pricing/history?${params}`);
  },

  // Battery
  getBatteryHistory: (from: string, to?: string, interval?: string) => {
    const params = new URLSearchParams({ from });
    if (to) params.set('to', to);
    if (interval) params.set('interval', interval);
    return apiFetch<BatteryHistoryResponse>(`/battery/history?${params}`);
  },

  // Schedule
  getSchedule: () => apiFetch<ScheduleResponse>('/schedule'),
  postScheduleOverride: (action: string, endTime: string, reason?: string) =>
    apiFetch('/schedule/override', {
      method: 'POST',
      body: JSON.stringify({ action, end_time: endTime, reason }),
    }),
  deleteScheduleOverride: () =>
    apiFetch('/schedule/override', { method: 'DELETE' }),

  // Preferences
  getPreferences: () => apiFetch<Preferences>('/preferences'),
  patchPreferences: (updates: Partial<Preferences>) =>
    apiFetch<Preferences>('/preferences', {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),

  // Profiles
  getProfiles: () => apiFetch<ProfilesResponse>('/profiles'),
  getProfile: (id: string) => apiFetch<Profile>(`/profiles/${id}`),
  createProfile: (data: Omit<Profile, 'id' | 'is_default' | 'created_at' | 'updated_at'>) =>
    apiFetch<Profile>('/profiles', { method: 'POST', body: JSON.stringify(data) }),
  updateProfile: (id: string, updates: Partial<Profile>) =>
    apiFetch<Profile>(`/profiles/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),
  deleteProfile: (id: string) =>
    apiFetch(`/profiles/${id}`, { method: 'DELETE' }),
  setDefaultProfile: (id: string) =>
    apiFetch<Profile>(`/profiles/${id}/set-default`, { method: 'POST' }),

  // Calendar rules
  getCalendarRules: () => apiFetch<CalendarRulesResponse>('/calendar/rules'),
  createCalendarRule: (data: Omit<CalendarRule, 'id' | 'profile_name' | 'created_at'>) =>
    apiFetch<CalendarRule>('/calendar/rules', { method: 'POST', body: JSON.stringify(data) }),
  updateCalendarRule: (id: string, updates: Partial<CalendarRule>) =>
    apiFetch<CalendarRule>(`/calendar/rules/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),
  deleteCalendarRule: (id: string) =>
    apiFetch(`/calendar/rules/${id}`, { method: 'DELETE' }),

  // Calendar overrides
  getCalendarOverrides: (from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    return apiFetch<CalendarOverridesResponse>(`/calendar/overrides${params.size ? `?${params}` : ''}`);
  },
  createCalendarOverride: (data: Omit<CalendarOverride, 'id' | 'profile_name' | 'created_at'>) =>
    apiFetch<CalendarOverride>('/calendar/overrides', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  deleteCalendarOverride: (id: string) =>
    apiFetch(`/calendar/overrides/${id}`, { method: 'DELETE' }),

  // Active profile
  getActiveProfile: () => apiFetch<ActiveProfileResponse>('/calendar/active'),

  // Analytics
  getSavings: (period: string, from?: string, to?: string) => {
    const params = new URLSearchParams({ period });
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    return apiFetch<AnalyticsSavings>(`/analytics/savings?${params}`);
  },
};
