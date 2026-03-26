'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { NavBar } from '@/components/shared/NavBar';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { StatPills } from '@/components/dashboard/StatPills';
import { StatusHeader } from '@/components/dashboard/StatusHeader';
import { BatteryGauge } from '@/components/dashboard/BatteryGauge';
import { PowerFlowBars } from '@/components/dashboard/PowerFlowBars';
import { DecisionExplanation } from '@/components/dashboard/DecisionExplanation';
import { ForecastChart } from '@/components/dashboard/ForecastChart';
import { ScheduleTimeline } from '@/components/dashboard/ScheduleTimeline';
import { EnergyMetricCards } from '@/components/dashboard/EnergyMetricCards';
import { SavingsCard } from '@/components/dashboard/SavingsCard';
import { ModeControl } from '@/components/dashboard/ModeControl';
import { AlertBanner } from '@/components/shared/AlertBanner';
import { ProfileQuickEdit } from '@/components/shared/ProfileQuickEdit';
import { useWebSocket } from '@/components/providers/WebSocketProvider';
import type { StatusResponse, PricingResponse, ScheduleResponse } from '@/types/api';

export default function DashboardPage() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [pricing, setPricing] = useState<PricingResponse | null>(null);
  const [schedule, setSchedule] = useState<ScheduleResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showProfilePanel, setShowProfilePanel] = useState(false);

  const { lastBatteryUpdate, lastPriceUpdate, lastScheduleUpdate, lastProfileChange, alerts, dismissAlert, status: wsStatus } = useWebSocket();

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, p, sch] = await Promise.all([
        api.getStatus(),
        api.getPricing(),
        api.getSchedule(),
      ]);
      setStatus(s);
      setPricing(p);
      setSchedule(sch);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
    const interval = setInterval(loadAll, 60000);
    return () => clearInterval(interval);
  }, [loadAll]);

  // Apply WebSocket updates to status
  useEffect(() => {
    if (!lastBatteryUpdate) return;
    setStatus((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        battery: {
          ...prev.battery,
          soc: lastBatteryUpdate.soc,
          power_w: lastBatteryUpdate.power_w,
          mode: lastBatteryUpdate.mode,
          temperature: lastBatteryUpdate.temperature,
        },
        solar: { ...prev.solar, current_generation_w: lastBatteryUpdate.solar_w },
        grid: {
          import_w: lastBatteryUpdate.grid_w > 0 ? lastBatteryUpdate.grid_w : 0,
          export_w: lastBatteryUpdate.grid_w < 0 ? -lastBatteryUpdate.grid_w : 0,
        },
      };
    });
  }, [lastBatteryUpdate]);

  useEffect(() => {
    if (!lastPriceUpdate) return;
    setStatus((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        price: {
          ...prev.price,
          current_per_kwh: lastPriceUpdate.current_per_kwh,
          feed_in_per_kwh: lastPriceUpdate.feed_in_per_kwh,
          descriptor: lastPriceUpdate.descriptor,
          renewables_pct: lastPriceUpdate.renewables_pct,
          updated_at: lastPriceUpdate.timestamp,
        },
      };
    });
    // Refresh pricing forecast
    api.getPricing().then(setPricing).catch(() => {});
  }, [lastPriceUpdate]);

  useEffect(() => {
    if (!lastScheduleUpdate) return;
    setStatus((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        schedule: {
          current_action: lastScheduleUpdate.current_action,
          next_change_at: lastScheduleUpdate.next_change_at,
          next_action: lastScheduleUpdate.next_action,
          is_override: lastScheduleUpdate.is_override,
        },
      };
    });
    api.getSchedule().then(setSchedule).catch(() => {});
  }, [lastScheduleUpdate]);

  useEffect(() => {
    if (!lastProfileChange) return;
    setStatus((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        active_profile: {
          id: lastProfileChange.profile_id,
          name: lastProfileChange.profile_name,
          source: lastProfileChange.source,
        },
      };
    });
  }, [lastProfileChange]);

  if (loading && !status) {
    return (
      <>
        <NavBar />
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading battery status...</p>
          </div>
        </div>
      </>
    );
  }

  if (error && !status) {
    return (
      <>
        <NavBar />
        <div className="max-w-screen-xl mx-auto px-4 py-8">
          <div
            className="rounded-lg border p-6 text-center"
            style={{ backgroundColor: 'var(--bg-secondary)', borderColor: '#DC262640' }}
          >
            <p className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Could not connect to Battery Brain</p>
            <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>{error}</p>
            <button
              onClick={loadAll}
              className="px-4 py-2 rounded-md text-sm font-medium text-white"
              style={{ backgroundColor: '#8B5CF6' }}
            >
              Retry
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <NavBar
        profileName={status?.active_profile?.name}
        wsStatus={wsStatus}
        onProfileClick={() => setShowProfilePanel(true)}
      />

      {showProfilePanel && (
        <ProfileQuickEdit
          isOpen={showProfilePanel}
          onClose={() => setShowProfilePanel(false)}
          activeProfileId={status?.active_profile?.id}
        />
      )}

      <main className="max-w-screen-xl mx-auto px-4 py-4 space-y-4">
        {/* Alerts */}
        {alerts.length > 0 && (
          <AlertBanner alerts={alerts} onDismiss={dismissAlert} />
        )}

        {status && (
          <>
            {/* Stat pills */}
            <StatPills status={status} />

            {/* Status header */}
            <StatusHeader status={status} />

            {/* Battery gauge + Power flow */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardContent className="flex flex-col items-center gap-4">
                  <BatteryGauge battery={status.battery} />
                  <div className="w-full">
                    <DecisionExplanation status={status} collapsible={false} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Power Flow</CardTitle>
                </CardHeader>
                <CardContent>
                  <PowerFlowBars status={status} />
                </CardContent>
              </Card>
            </div>

            {/* Forecast chart */}
            {pricing && (
              <Card>
                <CardHeader>
                  <CardTitle>Price Forecast (24h)</CardTitle>
                </CardHeader>
                <CardContent className="px-2 pb-2">
                  <ForecastChart forecast={pricing.forecast} height={280} />
                </CardContent>
              </Card>
            )}

            {/* Schedule timeline */}
            {schedule && schedule.slots.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Today&apos;s Schedule</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScheduleTimeline slots={schedule.slots} />
                </CardContent>
              </Card>
            )}

            {/* Energy metric cards + Savings */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Today&apos;s Energy</CardTitle>
                </CardHeader>
                <CardContent>
                  <EnergyMetricCards
                    solarGeneratedKwh={status.solar.forecast_today_kwh * (status.battery.soc / 100)}
                    solarPeakKw={status.solar.current_generation_w / 1000}
                    batteryCyclesKwh={Math.abs(status.battery.power_w) / 1000 * 0.5}
                    batteryNetKwh={0.8}
                    houseConsumedKwh={15.6}
                    houseAvgKw={1.4}
                    gridExportKwh={status.grid.export_w / 1000 * 8}
                    gridImportKwh={status.grid.import_w / 1000 * 3}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <SavingsCard savings={status.savings} />
                </CardContent>
              </Card>
            </div>

            {/* Mode control */}
            <Card>
              <CardHeader>
                <CardTitle>Battery Mode</CardTitle>
              </CardHeader>
              <CardContent>
                <ModeControl
                  currentAction={status.schedule.current_action}
                  isOverride={status.schedule.is_override ?? false}
                  nextAction={status.schedule.next_action}
                  nextChangeAt={status.schedule.next_change_at}
                  onUpdate={loadAll}
                />
              </CardContent>
            </Card>
          </>
        )}

        {/* Refresh indicator */}
        <div className="flex items-center justify-center gap-2 py-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
          <button onClick={loadAll} disabled={loading} className="flex items-center gap-1 hover:text-[var(--text-secondary)]">
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </main>
    </>
  );
}
