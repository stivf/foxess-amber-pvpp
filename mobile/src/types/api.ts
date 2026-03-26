// API types matching the backend contract (API_CONTRACT.md)
// These map to the REST endpoints at /api/v1

export type BatteryMode = 'charging' | 'discharging' | 'holding' | 'idle';
export type ScheduleAction = 'CHARGE' | 'HOLD' | 'DISCHARGE' | 'AUTO';
export type PriceDescriptor = 'spike' | 'high' | 'neutral' | 'low' | 'negative';
export type AlertSeverity = 'info' | 'warning' | 'error';
export type ProfileSource = 'default' | 'recurring_rule' | 'one_off_override';
export type NotificationPlatform = 'ios' | 'android';

export interface BatteryState {
  soc: number;
  power_w: number;
  mode: BatteryMode;
  capacity_kwh: number;
  min_soc: number;
  charge_rate_w?: number;
  discharge_rate_w?: number;
  temperature: number | null;
  updated_at: string;
}

export interface PriceState {
  current_per_kwh: number;
  feed_in_per_kwh: number;
  descriptor: PriceDescriptor;
  renewables_pct: number;
  updated_at: string;
}

export interface SolarState {
  current_generation_w: number;
  forecast_today_kwh: number;
  forecast_tomorrow_kwh: number;
}

export interface GridState {
  import_w: number;
  export_w: number;
}

export interface ScheduleState {
  current_action: ScheduleAction;
  next_change_at: string;
  next_action: ScheduleAction;
}

export interface ActiveProfile {
  id: string;
  name: string;
  source: ProfileSource;
}

export interface SavingsSummary {
  today_dollars: number;
  this_week_dollars: number;
  this_month_dollars: number;
}

export interface SystemStatus {
  battery: BatteryState;
  price: PriceState;
  solar: SolarState;
  grid: GridState;
  schedule: ScheduleState;
  active_profile: ActiveProfile;
  savings: SavingsSummary;
}

export interface PriceForecastInterval {
  start_time: string;
  end_time: string;
  per_kwh: number;
  descriptor: PriceDescriptor;
  renewables_pct: number;
}

export interface PricingCurrentResponse {
  current: {
    per_kwh: number;
    feed_in_per_kwh: number;
    descriptor: PriceDescriptor;
    renewables_pct: number;
    spike_status: string;
    updated_at: string;
  };
  forecast: PriceForecastInterval[];
}

export interface BatteryHistoryPoint {
  time: string;
  avg_soc: number;
  avg_power_w: number;
  avg_solar_w: number;
  avg_load_w: number;
  avg_grid_w: number;
}

export interface BatteryHistoryResponse {
  interval: string;
  data: BatteryHistoryPoint[];
}

export interface ScheduleSlot {
  start_time: string;
  end_time: string;
  action: ScheduleAction;
  reason: string;
  estimated_price: number;
  estimated_solar_w: number;
  profile_id: string;
  profile_name: string;
}

export interface ScheduleResponse {
  generated_at: string;
  slots: ScheduleSlot[];
  estimated_savings_today: number;
}

export interface OverrideResponse {
  override_id: string;
  action: ScheduleAction;
  started_at: string;
  ends_at: string;
  status: string;
}

export interface Preferences {
  min_soc: number;
  auto_mode_enabled: boolean;
  notifications: {
    price_spike: boolean;
    battery_low: boolean;
    schedule_change: boolean;
    daily_summary: boolean;
  };
}

export interface Profile {
  id: string;
  name: string;
  export_aggressiveness: number;
  preservation_aggressiveness: number;
  import_aggressiveness: number;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProfilesResponse {
  profiles: Profile[];
}

export interface CalendarRule {
  id: string;
  profile_id: string;
  profile_name: string;
  name: string;
  days_of_week: number[];
  start_time: string;
  end_time: string;
  priority: number;
  enabled: boolean;
  created_at: string;
}

export interface CalendarRulesResponse {
  rules: CalendarRule[];
}

export interface CalendarOverride {
  id: string;
  profile_id: string;
  profile_name: string;
  name: string;
  start_datetime: string;
  end_datetime: string;
  created_at: string;
}

export interface CalendarOverridesResponse {
  overrides: CalendarOverride[];
}

export interface ActiveCalendarProfile {
  profile: {
    id: string;
    name: string;
    export_aggressiveness: number;
    preservation_aggressiveness: number;
    import_aggressiveness: number;
  };
  source: ProfileSource;
  rule_id?: string;
  rule_name?: string;
  active_until?: string;
  next_profile?: {
    id: string;
    name: string;
    starts_at: string;
  };
}

export interface AnalyticsSavingsBreakdownItem {
  date: string;
  savings_dollars: number;
  solar_kwh: number;
  import_kwh: number;
  export_kwh: number;
}

export interface AnalyticsSavingsResponse {
  period: string;
  from: string;
  to: string;
  total_savings_dollars: number;
  grid_import_kwh: number;
  grid_export_kwh: number;
  solar_generation_kwh: number;
  self_consumption_pct: number;
  battery_cycles: number;
  avg_buy_price: number;
  avg_sell_price: number;
  breakdown: AnalyticsSavingsBreakdownItem[];
}

export interface NotificationRegistrationResponse {
  registered: boolean;
  device_id: string;
}

// WebSocket event payloads
export interface WsBatteryUpdate {
  type: 'battery.update';
  data: {
    soc: number;
    power_w: number;
    mode: BatteryMode;
    solar_w: number;
    load_w: number;
    grid_w: number;
    temperature: number;
    timestamp: string;
  };
}

export interface WsPriceUpdate {
  type: 'price.update';
  data: {
    current_per_kwh: number;
    feed_in_per_kwh: number;
    descriptor: PriceDescriptor;
    renewables_pct: number;
    timestamp: string;
  };
}

export interface WsPriceSpike {
  type: 'price.spike';
  data: {
    current_per_kwh: number;
    descriptor: PriceDescriptor;
    expected_duration_minutes: number;
    action_taken: ScheduleAction;
    timestamp: string;
  };
}

export interface WsScheduleUpdate {
  type: 'schedule.update';
  data: {
    current_action: ScheduleAction;
    is_override: boolean;
    next_change_at: string;
    next_action: ScheduleAction;
    timestamp: string;
  };
}

export interface WsProfileChange {
  type: 'profile.change';
  data: {
    profile_id: string;
    profile_name: string;
    source: ProfileSource;
    rule_name?: string;
    active_until?: string;
    timestamp: string;
  };
}

export interface WsSystemAlert {
  type: 'system.alert';
  data: {
    severity: AlertSeverity;
    message: string;
    timestamp: string;
  };
}

export interface WsPong {
  type: 'pong';
}

export type WsEvent =
  | WsBatteryUpdate
  | WsPriceUpdate
  | WsPriceSpike
  | WsScheduleUpdate
  | WsProfileChange
  | WsSystemAlert
  | WsPong;
