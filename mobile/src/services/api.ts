import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  SystemStatus,
  BatteryState,
  PricingCurrentResponse,
  BatteryHistoryResponse,
  ScheduleResponse,
  Preferences,
  Profile,
  ProfilesResponse,
  CalendarRulesResponse,
  CalendarOverridesResponse,
  ActiveCalendarProfile,
  AnalyticsSavingsResponse,
  NotificationRegistrationResponse,
  OverrideResponse,
  ScheduleAction,
  CalendarRule,
  CalendarOverride,
} from '../types/api';

const API_KEY_STORAGE = 'battery_brain_api_key';
const API_URL_STORAGE = 'battery_brain_api_url';

const DEFAULT_API_URL = 'http://localhost:3000';

export async function getApiConfig(): Promise<{ baseUrl: string; apiKey: string }> {
  const [baseUrl, apiKey] = await Promise.all([
    AsyncStorage.getItem(API_URL_STORAGE),
    AsyncStorage.getItem(API_KEY_STORAGE),
  ]);
  return {
    baseUrl: baseUrl ?? DEFAULT_API_URL,
    apiKey: apiKey ?? '',
  };
}

export async function saveApiConfig(baseUrl: string, apiKey: string): Promise<void> {
  await Promise.all([
    AsyncStorage.setItem(API_URL_STORAGE, baseUrl),
    AsyncStorage.setItem(API_KEY_STORAGE, apiKey),
  ]);
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const { baseUrl, apiKey } = await getApiConfig();
  const url = `${baseUrl}/api/v1${path}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = body?.error?.message ?? response.statusText;
    throw new Error(`API Error ${response.status}: ${message}`);
  }

  return response.json() as Promise<T>;
}

export const api = {
  // Dashboard / Status
  getStatus: () => apiFetch<SystemStatus>('/status'),

  // Battery
  getBatteryState: () => apiFetch<BatteryState>('/battery/state'),
  getBatteryHistory: (from: string, to?: string, interval = '5m') => {
    const params = new URLSearchParams({ from, interval });
    if (to) params.set('to', to);
    return apiFetch<BatteryHistoryResponse>(`/battery/history?${params}`);
  },

  // Pricing
  getPricingCurrent: () => apiFetch<PricingCurrentResponse>('/pricing/current'),
  getPricingHistory: (from: string, to?: string, interval = '30m') => {
    const params = new URLSearchParams({ from, interval });
    if (to) params.set('to', to);
    return apiFetch<{ interval: string; data: unknown[] }>(`/pricing/history?${params}`);
  },

  // Schedule
  getSchedule: () => apiFetch<ScheduleResponse>('/schedule'),
  createOverride: (action: ScheduleAction, endTime: string, reason?: string) =>
    apiFetch<OverrideResponse>('/schedule/override', {
      method: 'POST',
      body: JSON.stringify({ action, end_time: endTime, reason }),
    }),
  cancelOverride: () =>
    apiFetch<{ status: string; resumed_action: ScheduleAction }>('/schedule/override', {
      method: 'DELETE',
    }),

  // Preferences
  getPreferences: () => apiFetch<Preferences>('/preferences'),
  patchPreferences: (patch: Partial<Preferences>) =>
    apiFetch<Preferences>('/preferences', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  // Profiles
  getProfiles: () => apiFetch<ProfilesResponse>('/profiles'),
  getProfile: (id: string) => apiFetch<Profile>(`/profiles/${id}`),
  createProfile: (data: Omit<Profile, 'id' | 'is_default' | 'created_at' | 'updated_at'>) =>
    apiFetch<Profile>('/profiles', { method: 'POST', body: JSON.stringify(data) }),
  patchProfile: (id: string, patch: Partial<Profile>) =>
    apiFetch<Profile>(`/profiles/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteProfile: (id: string) =>
    apiFetch<void>(`/profiles/${id}`, { method: 'DELETE' }),
  setDefaultProfile: (id: string) =>
    apiFetch<Profile>(`/profiles/${id}/set-default`, { method: 'POST' }),

  // Calendar
  getCalendarRules: () => apiFetch<CalendarRulesResponse>('/calendar/rules'),
  createCalendarRule: (data: Omit<CalendarRule, 'id' | 'profile_name' | 'created_at'>) =>
    apiFetch<CalendarRule>('/calendar/rules', { method: 'POST', body: JSON.stringify(data) }),
  patchCalendarRule: (id: string, patch: Partial<CalendarRule>) =>
    apiFetch<CalendarRule>(`/calendar/rules/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteCalendarRule: (id: string) =>
    apiFetch<void>(`/calendar/rules/${id}`, { method: 'DELETE' }),

  getCalendarOverrides: (from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const query = params.toString();
    return apiFetch<CalendarOverridesResponse>(`/calendar/overrides${query ? `?${query}` : ''}`);
  },
  createCalendarOverride: (data: Omit<CalendarOverride, 'id' | 'profile_name' | 'created_at'>) =>
    apiFetch<CalendarOverride>('/calendar/overrides', { method: 'POST', body: JSON.stringify(data) }),
  deleteCalendarOverride: (id: string) =>
    apiFetch<void>(`/calendar/overrides/${id}`, { method: 'DELETE' }),

  getActiveCalendarProfile: () => apiFetch<ActiveCalendarProfile>('/calendar/active'),

  // Analytics
  getAnalyticsSavings: (period: 'day' | 'week' | 'month' | 'year', from?: string, to?: string) => {
    const params = new URLSearchParams({ period });
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    return apiFetch<AnalyticsSavingsResponse>(`/analytics/savings?${params}`);
  },

  // Notifications
  registerDevice: (deviceToken: string, platform: 'ios' | 'android') =>
    apiFetch<NotificationRegistrationResponse>('/notifications/register', {
      method: 'POST',
      body: JSON.stringify({ device_token: deviceToken, platform }),
    }),
  unregisterDevice: (deviceId: string) =>
    apiFetch<void>(`/notifications/register/${deviceId}`, { method: 'DELETE' }),

  // Health
  getHealth: () =>
    fetch(`${DEFAULT_API_URL}/api/v1/health`).then(r => r.json()),
};
