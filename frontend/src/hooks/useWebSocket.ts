'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import type { WsEvent } from '@/types/api';

type WsStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface UseWebSocketOptions {
  onMessage?: (event: WsEvent) => void;
  onStatusChange?: (status: WsStatus) => void;
}

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:3000';
const API_KEY = process.env.NEXT_PUBLIC_API_KEY ?? '';
const PING_INTERVAL_MS = 30_000;
const RECONNECT_DELAY_MS = 3_000;

export function useWebSocket({ onMessage, onStatusChange }: UseWebSocketOptions = {}) {
  const wsRef = useRef<WebSocket | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const [status, setStatus] = useState<WsStatus>('connecting');

  const updateStatus = useCallback((s: WsStatus) => {
    setStatus(s);
    onStatusChange?.(s);
  }, [onStatusChange]);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    const url = API_KEY
      ? `${WS_URL}/ws?token=${encodeURIComponent(API_KEY)}`
      : `${WS_URL}/ws`;

    const ws = new WebSocket(url);
    wsRef.current = ws;
    updateStatus('connecting');

    ws.onopen = () => {
      if (!mountedRef.current) return;
      updateStatus('connected');

      pingIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, PING_INTERVAL_MS);
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;
      try {
        const data = JSON.parse(event.data as string) as WsEvent;
        if ((data as { type: string }).type !== 'pong') {
          onMessage?.(data);
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onerror = () => {
      if (!mountedRef.current) return;
      updateStatus('error');
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      updateStatus('disconnected');

      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }

      reconnectTimeoutRef.current = setTimeout(() => {
        if (mountedRef.current) connect();
      }, RECONNECT_DELAY_MS);
    };
  }, [onMessage, updateStatus]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;

      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);

  return { status };
}
