'use client';

import { X, AlertTriangle, Info, AlertOctagon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Alert {
  id: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  timestamp: string;
}

interface AlertBannerProps {
  alerts: Alert[];
  onDismiss: (id: string) => void;
}

export function AlertBanner({ alerts, onDismiss }: AlertBannerProps) {
  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2">
      {alerts.map((alert) => {
        const colors = {
          info: { bg: '#3B82F620', border: '#3B82F6', text: '#3B82F6', icon: Info },
          warning: { bg: '#F59E0B20', border: '#F59E0B', text: '#F59E0B', icon: AlertTriangle },
          error: { bg: '#DC262620', border: '#DC2626', text: '#DC2626', icon: AlertOctagon },
        }[alert.severity];

        const Icon = colors.icon;

        return (
          <div
            key={alert.id}
            className="flex items-start gap-3 rounded-md border px-4 py-3"
            style={{
              backgroundColor: colors.bg,
              borderColor: colors.border,
              borderLeftWidth: 3,
            }}
            role="alert"
          >
            <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: colors.text }} />
            <p className="text-sm flex-1" style={{ color: 'var(--text-primary)' }}>
              {alert.message}
            </p>
            <button
              onClick={() => onDismiss(alert.id)}
              className="flex-shrink-0 ml-auto"
              style={{ color: 'var(--text-tertiary)' }}
              aria-label="Dismiss alert"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
