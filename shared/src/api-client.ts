import type {
  SystemStatus,
  BatteryStatus,
  PowerFlow,
  CurrentPrice,
  PriceInterval,
  Schedule,
  SavingsReport,
  OverrideRequest,
  OverrideStatus,
  ApiResult,
} from './types';

export interface ApiClientConfig {
  baseUrl: string;
  timeout?: number;
  onUnauthorized?: () => void;
}

async function request<T>(
  url: string,
  options: RequestInit,
  timeout = 10000,
): Promise<ApiResult<T>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    clearTimeout(timeoutId);

    const body = await response.json();

    if (!response.ok) {
      return {
        data: null,
        error: {
          code: body.code ?? String(response.status),
          message: body.message ?? response.statusText,
        },
      };
    }

    return { data: body, error: null };
  } catch (err) {
    clearTimeout(timeoutId);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      data: null,
      error: { code: 'NETWORK_ERROR', message },
    };
  }
}

export function createApiClient(config: ApiClientConfig) {
  const { baseUrl, timeout = 10000 } = config;

  function get<T>(path: string): Promise<ApiResult<T>> {
    return request<T>(`${baseUrl}${path}`, { method: 'GET' }, timeout);
  }

  function post<T>(path: string, body: unknown): Promise<ApiResult<T>> {
    return request<T>(
      `${baseUrl}${path}`,
      { method: 'POST', body: JSON.stringify(body) },
      timeout,
    );
  }

  function del<T>(path: string): Promise<ApiResult<T>> {
    return request<T>(`${baseUrl}${path}`, { method: 'DELETE' }, timeout);
  }

  return {
    /** Full system snapshot: battery, power flow, current price, active schedule */
    getSystemStatus: () => get<SystemStatus>('/api/v1/status'),

    /** Battery state of charge and mode */
    getBatteryStatus: () => get<BatteryStatus>('/api/v1/battery'),

    /** Current household power flow */
    getPowerFlow: () => get<PowerFlow>('/api/v1/power-flow'),

    /** Current electricity spot price */
    getCurrentPrice: () => get<CurrentPrice>('/api/v1/price/current'),

    /** Price forecast for a given date (defaults to today) */
    getPriceForecast: (date?: string) =>
      get<PriceInterval[]>(`/api/v1/price/forecast${date ? `?date=${date}` : ''}`),

    /** Today's optimised charge/discharge schedule */
    getSchedule: (date?: string) =>
      get<Schedule>(`/api/v1/schedule${date ? `?date=${date}` : ''}`),

    /** Savings report: period = 'week' | 'month' | 'year' */
    getSavingsReport: (period: 'week' | 'month' | 'year') =>
      get<SavingsReport>(`/api/v1/savings?period=${period}`),

    /** Set a manual override (force charge/discharge/idle/auto) */
    setOverride: (req: OverrideRequest) =>
      post<OverrideStatus>('/api/v1/override', req),

    /** Cancel any active override and return to auto */
    clearOverride: () => del<OverrideStatus>('/api/v1/override'),

    /** Current override status */
    getOverrideStatus: () => get<OverrideStatus>('/api/v1/override'),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
