import { create } from 'zustand';
import type {
  SystemStatus,
  BatteryState,
  PriceState,
  SolarState,
  GridState,
  ScheduleState,
  ActiveProfile,
  SavingsSummary,
  PricingCurrentResponse,
  ScheduleResponse,
  Profile,
  CalendarRule,
  CalendarOverride,
  ActiveCalendarProfile,
  AnalyticsSavingsResponse,
  Preferences,
  WsBatteryUpdate,
  WsPriceUpdate,
  WsScheduleUpdate,
  WsProfileChange,
} from '../types/api';

export type ThemeMode = 'light' | 'dark' | 'system';

interface AppState {
  // Connection
  apiUrl: string;
  apiKey: string;
  wsConnected: boolean;

  // Live data from /status
  systemStatus: SystemStatus | null;
  battery: BatteryState | null;
  price: PriceState | null;
  solar: SolarState | null;
  grid: GridState | null;
  schedule: ScheduleState | null;
  activeProfile: ActiveProfile | null;
  savings: SavingsSummary | null;

  // Pricing / forecast
  pricingData: PricingCurrentResponse | null;

  // Schedule
  scheduleData: ScheduleResponse | null;

  // Profiles
  profiles: Profile[];
  activeCalendarProfile: ActiveCalendarProfile | null;

  // Calendar
  calendarRules: CalendarRule[];
  calendarOverrides: CalendarOverride[];

  // Analytics
  analyticsDay: AnalyticsSavingsResponse | null;
  analyticsWeek: AnalyticsSavingsResponse | null;
  analyticsMonth: AnalyticsSavingsResponse | null;

  // Preferences
  preferences: Preferences | null;

  // Theme
  themeMode: ThemeMode;

  // Loading states
  isLoadingStatus: boolean;
  isLoadingPricing: boolean;
  isLoadingSchedule: boolean;
  isLoadingAnalytics: boolean;
  isLoadingProfiles: boolean;

  // Error
  lastError: string | null;

  // Actions
  setApiConfig: (url: string, key: string) => void;
  setWsConnected: (connected: boolean) => void;
  setSystemStatus: (status: SystemStatus) => void;
  setPricingData: (data: PricingCurrentResponse) => void;
  setScheduleData: (data: ScheduleResponse) => void;
  setProfiles: (profiles: Profile[]) => void;
  setActiveCalendarProfile: (profile: ActiveCalendarProfile) => void;
  setCalendarRules: (rules: CalendarRule[]) => void;
  setCalendarOverrides: (overrides: CalendarOverride[]) => void;
  setAnalytics: (period: 'day' | 'week' | 'month', data: AnalyticsSavingsResponse) => void;
  setPreferences: (prefs: Preferences) => void;
  setThemeMode: (mode: ThemeMode) => void;
  setLoading: (key: 'status' | 'pricing' | 'schedule' | 'analytics' | 'profiles', value: boolean) => void;
  setError: (error: string | null) => void;

  // WebSocket event handlers
  handleBatteryUpdate: (event: WsBatteryUpdate) => void;
  handlePriceUpdate: (event: WsPriceUpdate) => void;
  handleScheduleUpdate: (event: WsScheduleUpdate) => void;
  handleProfileChange: (event: WsProfileChange) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  // Connection
  apiUrl: 'http://localhost:3000',
  apiKey: '',
  wsConnected: false,

  // Live data
  systemStatus: null,
  battery: null,
  price: null,
  solar: null,
  grid: null,
  schedule: null,
  activeProfile: null,
  savings: null,

  pricingData: null,
  scheduleData: null,

  profiles: [],
  activeCalendarProfile: null,
  calendarRules: [],
  calendarOverrides: [],

  analyticsDay: null,
  analyticsWeek: null,
  analyticsMonth: null,

  preferences: null,

  themeMode: 'system',

  isLoadingStatus: false,
  isLoadingPricing: false,
  isLoadingSchedule: false,
  isLoadingAnalytics: false,
  isLoadingProfiles: false,

  lastError: null,

  // Actions
  setApiConfig: (url, key) => set({ apiUrl: url, apiKey: key }),
  setWsConnected: (connected) => set({ wsConnected: connected }),

  setSystemStatus: (status) =>
    set({
      systemStatus: status,
      battery: status.battery,
      price: status.price,
      solar: status.solar,
      grid: status.grid,
      schedule: status.schedule,
      activeProfile: status.active_profile,
      savings: status.savings,
    }),

  setPricingData: (data) => set({ pricingData: data }),
  setScheduleData: (data) => set({ scheduleData: data }),
  setProfiles: (profiles) => set({ profiles }),
  setActiveCalendarProfile: (profile) => set({ activeCalendarProfile: profile }),
  setCalendarRules: (rules) => set({ calendarRules: rules }),
  setCalendarOverrides: (overrides) => set({ calendarOverrides: overrides }),

  setAnalytics: (period, data) => {
    if (period === 'day') set({ analyticsDay: data });
    else if (period === 'week') set({ analyticsWeek: data });
    else set({ analyticsMonth: data });
  },

  setPreferences: (prefs) => set({ preferences: prefs }),
  setThemeMode: (mode) => set({ themeMode: mode }),

  setLoading: (key, value) => {
    const loadingKey = `isLoading${key.charAt(0).toUpperCase() + key.slice(1)}` as keyof AppState;
    set({ [loadingKey]: value } as Partial<AppState>);
  },

  setError: (error) => set({ lastError: error }),

  // WebSocket handlers
  handleBatteryUpdate: (event) => {
    const { data } = event;
    set((state) => ({
      battery: state.battery
        ? {
            ...state.battery,
            soc: data.soc,
            power_w: data.power_w,
            mode: data.mode,
            temperature: data.temperature,
            updated_at: data.timestamp,
          }
        : null,
      solar: state.solar
        ? { ...state.solar, current_generation_w: data.solar_w }
        : null,
      grid: { import_w: data.grid_w > 0 ? data.grid_w : 0, export_w: data.grid_w < 0 ? -data.grid_w : 0 },
    }));
  },

  handlePriceUpdate: (event) => {
    const { data } = event;
    set((state) => ({
      price: state.price
        ? {
            ...state.price,
            current_per_kwh: data.current_per_kwh,
            feed_in_per_kwh: data.feed_in_per_kwh,
            descriptor: data.descriptor,
            renewables_pct: data.renewables_pct,
            updated_at: data.timestamp,
          }
        : null,
    }));
  },

  handleScheduleUpdate: (event) => {
    const { data } = event;
    set((state) => ({
      schedule: state.schedule
        ? {
            ...state.schedule,
            current_action: data.current_action,
            next_change_at: data.next_change_at,
            next_action: data.next_action,
          }
        : null,
    }));
  },

  handleProfileChange: (event) => {
    const { data } = event;
    set((state) => ({
      activeProfile: state.activeProfile
        ? {
            ...state.activeProfile,
            id: data.profile_id,
            name: data.profile_name,
            source: data.source,
          }
        : null,
    }));
  },
}));
