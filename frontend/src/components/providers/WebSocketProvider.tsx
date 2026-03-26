'use client';

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import type { WsEvent, WsBatteryUpdate, WsPriceUpdate, WsScheduleUpdate, WsProfileChange, WsSystemAlert, WsPriceSpike } from '@/types/api';

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface Alert {
  id: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  timestamp: string;
}

interface WebSocketContextValue {
  status: ConnectionStatus;
  lastBatteryUpdate: WsBatteryUpdate['data'] | null;
  lastPriceUpdate: WsPriceUpdate['data'] | null;
  lastScheduleUpdate: WsScheduleUpdate['data'] | null;
  lastProfileChange: WsProfileChange['data'] | null;
  alerts: Alert[];
  dismissAlert: (id: string) => void;
}

const WebSocketContext = createContext<WebSocketContextValue>({
  status: 'disconnected',
  lastBatteryUpdate: null,
  lastPriceUpdate: null,
  lastScheduleUpdate: null,
  lastProfileChange: null,
  alerts: [],
  dismissAlert: () => {},
});

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [lastBatteryUpdate, setLastBatteryUpdate] = useState<WsBatteryUpdate['data'] | null>(null);
  const [lastPriceUpdate, setLastPriceUpdate] = useState<WsPriceUpdate['data'] | null>(null);
  const [lastScheduleUpdate, setLastScheduleUpdate] = useState<WsScheduleUpdate['data'] | null>(null);
  const [lastProfileChange, setLastProfileChange] = useState<WsProfileChange['data'] | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const connect = useCallback(() => {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:4000';
    const apiKey = process.env.NEXT_PUBLIC_API_KEY ?? '';
    const url = apiKey ? `${wsUrl}/ws?token=${apiKey}` : `${wsUrl}/ws`;

    setStatus('connecting');

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
      pingIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 30000);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as WsEvent | { type: 'pong' };
        if (msg.type === 'pong') return;

        switch (msg.type) {
          case 'battery.update':
            setLastBatteryUpdate(msg.data);
            break;
          case 'price.update':
            setLastPriceUpdate(msg.data);
            break;
          case 'price.spike': {
            const spike = msg as WsPriceSpike;
            setAlerts((prev) => [
              {
                id: `spike-${spike.data.timestamp}`,
                severity: 'warning',
                message: `Price spike: ${spike.data.current_per_kwh.toFixed(1)}c/kWh. ${spike.data.action_taken} activated.`,
                timestamp: spike.data.timestamp,
              },
              ...prev.slice(0, 4),
            ]);
            break;
          }
          case 'schedule.update':
            setLastScheduleUpdate(msg.data);
            break;
          case 'profile.change':
            setLastProfileChange(msg.data);
            break;
          case 'system.alert': {
            const alert = msg as WsSystemAlert;
            setAlerts((prev) => [
              {
                id: `alert-${alert.data.timestamp}`,
                severity: alert.data.severity,
                message: alert.data.message,
                timestamp: alert.data.timestamp,
              },
              ...prev.slice(0, 4),
            ]);
            break;
          }
        }
      } catch {
        // Silently ignore malformed messages
      }
    };

    ws.onclose = () => {
      setStatus('disconnected');
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }
      reconnectTimeoutRef.current = setTimeout(connect, 5000);
    };

    ws.onerror = () => {
      setStatus('error');
      ws.close();
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    };
  }, [connect]);

  const dismissAlert = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  return (
    <WebSocketContext.Provider
      value={{
        status,
        lastBatteryUpdate,
        lastPriceUpdate,
        lastScheduleUpdate,
        lastProfileChange,
        alerts,
        dismissAlert,
      }}
    >
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  return useContext(WebSocketContext);
}
