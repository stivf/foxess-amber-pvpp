'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { useWebSocket } from './useWebSocket';
import type { StatusResponse, PricingResponse, ScheduleResponse, WsEvent } from '@/types/api';

interface DashboardData {
  status: StatusResponse | null;
  pricing: PricingResponse | null;
  schedule: ScheduleResponse | null;
  isLoading: boolean;
  error: string | null;
  wsStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
  refresh: () => void;
}

export function useDashboardData(): DashboardData {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [pricing, setPricing] = useState<PricingResponse | null>(null);
  const [schedule, setSchedule] = useState<ScheduleResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [statusData, pricingData, scheduleData] = await Promise.all([
        api.getStatus(),
        api.getPricing(),
        api.getSchedule(),
      ]);
      setStatus(statusData);
      setPricing(pricingData);
      setSchedule(scheduleData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleWsMessage = useCallback((event: WsEvent) => {
    switch (event.type) {
      case 'battery.update':
        setStatus((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            battery: {
              ...prev.battery,
              soc: event.data.soc,
              power_w: event.data.power_w,
              mode: event.data.mode,
              temperature: event.data.temperature,
            },
            solar: {
              ...prev.solar,
              current_generation_w: event.data.solar_w,
            },
            grid: {
              import_w: event.data.grid_w > 0 ? event.data.grid_w : 0,
              export_w: event.data.grid_w < 0 ? -event.data.grid_w : 0,
            },
          };
        });
        break;

      case 'price.update':
        setStatus((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            price: {
              ...prev.price,
              current_per_kwh: event.data.current_per_kwh,
              feed_in_per_kwh: event.data.feed_in_per_kwh,
              descriptor: event.data.descriptor,
              renewables_pct: event.data.renewables_pct,
              updated_at: event.data.timestamp,
            },
          };
        });
        break;

      case 'schedule.update':
        setStatus((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            schedule: {
              current_action: event.data.current_action,
              next_change_at: event.data.next_change_at,
              next_action: event.data.next_action,
              is_override: event.data.is_override,
            },
          };
        });
        break;

      case 'profile.change':
        setStatus((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            active_profile: {
              id: event.data.profile_id,
              name: event.data.profile_name,
              source: event.data.source,
            },
          };
        });
        break;

      default:
        break;
    }
  }, []);

  const { status: wsConnectionStatus } = useWebSocket({
    onMessage: handleWsMessage,
    onStatusChange: setWsStatus,
  });

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  return {
    status,
    pricing,
    schedule,
    isLoading,
    error,
    wsStatus: wsConnectionStatus ?? wsStatus,
    refresh: fetchAll,
  };
}
