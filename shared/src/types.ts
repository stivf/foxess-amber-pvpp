// Core domain types shared between web frontend and mobile app

export type BatteryMode = 'auto' | 'force_charge' | 'force_discharge' | 'idle';

export type PriceCategory = 'very_cheap' | 'cheap' | 'neutral' | 'expensive' | 'very_expensive' | 'spike';

export interface BatteryStatus {
  soc: number;              // State of charge 0–100 (%)
  powerFlow: number;        // Watts, positive = charging, negative = discharging
  mode: BatteryMode;
  capacity: number;         // Total capacity in kWh
  temperature?: number;     // Celsius
  updatedAt: string;        // ISO 8601
}

export interface PowerFlow {
  solarGeneration: number;  // Watts
  gridImport: number;       // Watts (positive = importing from grid)
  gridExport: number;       // Watts (positive = exporting to grid)
  houseConsumption: number; // Watts
  batteryPower: number;     // Watts, positive = charging
  updatedAt: string;
}

export interface PriceInterval {
  startTime: string;        // ISO 8601
  endTime: string;          // ISO 8601
  price: number;            // cents per kWh
  feedInPrice?: number;     // cents per kWh (what you get for export)
  category: PriceCategory;
  isForecast: boolean;
}

export interface CurrentPrice {
  price: number;            // cents per kWh
  feedInPrice: number;      // cents per kWh
  category: PriceCategory;
  nextUpdate: string;       // ISO 8601 - when price next changes
  updatedAt: string;
}

export interface ScheduleEntry {
  startTime: string;        // ISO 8601
  endTime: string;          // ISO 8601
  action: 'charge' | 'discharge' | 'hold';
  targetSoc?: number;       // Target SoC % for this period
  reason: string;           // Human-readable reason e.g. "Low price window"
}

export interface Schedule {
  date: string;             // YYYY-MM-DD
  entries: ScheduleEntry[];
  generatedAt: string;      // ISO 8601
}

export interface DailySavings {
  date: string;             // YYYY-MM-DD
  savingsAmount: number;    // AUD cents
  solarExportRevenue: number;
  gridImportCost: number;
  gridImportCostWithoutBattery: number;
  selfConsumptionRate: number; // 0–1
  energyCharged: number;    // kWh
  energyDischarged: number; // kWh
}

export interface SavingsReport {
  period: 'week' | 'month' | 'year';
  startDate: string;
  endDate: string;
  totalSavings: number;     // AUD cents
  totalSolarExportRevenue: number;
  averageDailySavings: number;
  days: DailySavings[];
}

export interface SystemStatus {
  battery: BatteryStatus;
  powerFlow: PowerFlow;
  currentPrice: CurrentPrice;
  activeSchedule: Schedule | null;
  lastDecisionAt: string;   // ISO 8601
}

export interface OverrideRequest {
  mode: BatteryMode;
  durationMinutes?: number; // How long before reverting to auto (null = indefinite)
  targetSoc?: number;       // Only relevant for force_charge
}

export interface OverrideStatus {
  active: boolean;
  mode: BatteryMode;
  expiresAt: string | null; // ISO 8601 or null if indefinite
  setAt: string;            // ISO 8601
}

// API response wrappers
export interface ApiResponse<T> {
  data: T;
  error: null;
}

export interface ApiError {
  data: null;
  error: {
    code: string;
    message: string;
  };
}

export type ApiResult<T> = ApiResponse<T> | ApiError;
