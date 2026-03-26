import { useEffect } from 'react';
import { wsService } from '../services/websocket';
import { useAppStore } from '../store';
import type { WsEvent } from '../types/api';

export function useWebSocket() {
  const {
    setWsConnected,
    handleBatteryUpdate,
    handlePriceUpdate,
    handleScheduleUpdate,
    handleProfileChange,
  } = useAppStore();

  useEffect(() => {
    wsService.connect();

    const unsubEvent = wsService.subscribe((event: WsEvent) => {
      switch (event.type) {
        case 'battery.update':
          handleBatteryUpdate(event);
          break;
        case 'price.update':
          handlePriceUpdate(event);
          break;
        case 'schedule.update':
          handleScheduleUpdate(event);
          break;
        case 'profile.change':
          handleProfileChange(event);
          break;
        default:
          break;
      }
    });

    const unsubStatus = wsService.onStatusChange((connected) => {
      setWsConnected(connected);
    });

    return () => {
      unsubEvent();
      unsubStatus();
    };
  }, [setWsConnected, handleBatteryUpdate, handlePriceUpdate, handleScheduleUpdate, handleProfileChange]);

  return { isConnected: useAppStore(s => s.wsConnected) };
}
