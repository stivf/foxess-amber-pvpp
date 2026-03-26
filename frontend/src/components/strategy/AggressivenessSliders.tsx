'use client';

import { cn } from '@/lib/utils';

const EXPORT_LABELS = ['Keep', 'Cautious', 'Balanced', 'Eager', 'Max'];
const PRESERVATION_LABELS = ['Max Reserve', 'High Reserve', 'Balanced', 'Low Reserve', 'Full Use'];
const IMPORT_LABELS = ['Minimal', 'Cautious', 'Balanced', 'Eager', 'Max'];

const EXPORT_DESCRIPTIONS = [
  'Only export when battery is full and solar is generating',
  'Export during price spikes above 60c/kWh',
  'Export when price exceeds 40c/kWh',
  'Export when price exceeds feed-in rate + margin',
  'Export whenever price is above feed-in rate',
];

const PRESERVATION_DESCRIPTIONS = [
  'Keep 80% minimum SoC (maximum backup)',
  'Keep 50% minimum SoC',
  'Keep 30% minimum SoC',
  'Keep 15% minimum SoC',
  'Keep 5% minimum SoC (maximize trading)',
];

const IMPORT_DESCRIPTIONS = [
  'Only charge when price is negative or < 5c/kWh',
  'Charge below 10c/kWh',
  'Charge below 20c/kWh',
  'Charge below 30c/kWh',
  'Charge whenever price is below average forecast',
];

interface SliderProps {
  label: string;
  description: string;
  value: number; // 1-5
  onChange: (value: number) => void;
  labels: string[];
  descriptions: string[];
  compact?: boolean;
}

function AggressivenessSlider({
  label,
  description,
  value,
  onChange,
  labels,
  descriptions,
  compact = false,
}: SliderProps) {
  const stops = [1, 2, 3, 4, 5];

  return (
    <div className={cn('space-y-2', compact && 'space-y-1.5')}>
      <div>
        <p className={cn('font-semibold text-[var(--text-primary)]', compact ? 'text-sm' : 'text-base')}>
          {label}
        </p>
        {!compact && (
          <p className="text-xs text-[var(--text-secondary)]">{description}</p>
        )}
      </div>

      {/* Slider track with stops */}
      <div className="relative px-1">
        {/* Track */}
        <div
          className="h-1 rounded-full relative"
          style={{ backgroundColor: 'var(--bg-tertiary)' }}
        >
          {/* Active fill */}
          <div
            className="absolute top-0 left-0 h-full rounded-full transition-all duration-200"
            style={{
              width: `${((value - 1) / 4) * 100}%`,
              background: 'linear-gradient(to right, #3B82F6, #F59E0B)',
            }}
          />
        </div>

        {/* Stop buttons */}
        <div className="absolute inset-0 flex items-center">
          {stops.map((stop) => (
            <button
              key={stop}
              onClick={() => onChange(stop)}
              className={cn(
                'flex-1 flex justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 rounded-full',
              )}
              aria-label={`${label}: ${labels[stop - 1]}`}
              title={descriptions[stop - 1]}
            >
              <span
                className={cn(
                  'w-4 h-4 rounded-full border-2 transition-all duration-200',
                  value === stop
                    ? 'scale-125 shadow-sm'
                    : 'hover:scale-110',
                )}
                style={{
                  backgroundColor: value >= stop ? (value === stop ? 'white' : 'transparent') : 'var(--bg-secondary)',
                  borderColor: value >= stop ? (value === stop ? '#6B7280' : 'transparent') : 'var(--border-strong)',
                  boxShadow: value === stop ? '0 0 0 3px rgba(107, 114, 128, 0.2)' : undefined,
                }}
              />
            </button>
          ))}
        </div>
      </div>

      {/* Stop labels */}
      <div className="flex justify-between">
        {stops.map((stop) => (
          <span
            key={stop}
            className={cn(
              'text-center transition-colors',
              compact ? 'text-[10px]' : 'text-xs',
              value === stop
                ? 'font-semibold text-[var(--text-primary)]'
                : 'text-[var(--text-tertiary)]',
            )}
            style={{ width: '20%' }}
          >
            {labels[stop - 1]}
          </span>
        ))}
      </div>

      {/* Current value description */}
      <p className={cn('text-[var(--text-secondary)] italic', compact ? 'text-xs' : 'text-sm')}>
        {descriptions[value - 1]}
      </p>
    </div>
  );
}

interface AggressivenessSlidersProps {
  exportValue: number;
  preservationValue: number;
  importValue: number;
  onExportChange: (v: number) => void;
  onPreservationChange: (v: number) => void;
  onImportChange: (v: number) => void;
  compact?: boolean;
}

export function AggressivenessSliders({
  exportValue,
  preservationValue,
  importValue,
  onExportChange,
  onPreservationChange,
  onImportChange,
  compact = false,
}: AggressivenessSlidersProps) {
  return (
    <div className={cn('space-y-6', compact && 'space-y-4')}>
      <AggressivenessSlider
        label="Export"
        description="How eagerly to sell stored energy to the grid"
        value={exportValue}
        onChange={onExportChange}
        labels={EXPORT_LABELS}
        descriptions={EXPORT_DESCRIPTIONS}
        compact={compact}
      />
      <AggressivenessSlider
        label="Preservation"
        description="How much battery reserve to maintain"
        value={preservationValue}
        onChange={onPreservationChange}
        labels={PRESERVATION_LABELS}
        descriptions={PRESERVATION_DESCRIPTIONS}
        compact={compact}
      />
      <AggressivenessSlider
        label="Import"
        description="How eagerly to charge from the grid"
        value={importValue}
        onChange={onImportChange}
        labels={IMPORT_LABELS}
        descriptions={IMPORT_DESCRIPTIONS}
        compact={compact}
      />
    </div>
  );
}

interface ImpactSummaryProps {
  exportValue: number;
  preservationValue: number;
  importValue: number;
  capacityKwh?: number;
}

const RESERVE_PERCENTS = [80, 50, 30, 15, 5];
const EXPORT_THRESHOLDS = [60, 60, 40, 10, 0];
const IMPORT_THRESHOLDS = [5, 10, 20, 30, 100];

export function ImpactSummary({ exportValue, preservationValue, importValue, capacityKwh = 10.4 }: ImpactSummaryProps) {
  const reservePct = RESERVE_PERCENTS[preservationValue - 1];
  const reserveKwh = (reservePct / 100) * capacityKwh;
  const hoursBackup = Math.round(reserveKwh / 1.5);
  const exportThreshold = EXPORT_THRESHOLDS[exportValue - 1];
  const importThreshold = IMPORT_THRESHOLDS[importValue - 1];

  return (
    <div
      className="rounded-md p-3 space-y-2 text-sm"
      style={{ backgroundColor: 'var(--bg-secondary)' }}
    >
      <p className="font-medium text-[var(--text-primary)]">With these settings:</p>
      <div className="space-y-1 font-mono text-[var(--text-secondary)]">
        <div className="flex justify-between">
          <span>Reserve:</span>
          <span className="text-[var(--text-primary)]">
            {reservePct}% ({reserveKwh.toFixed(1)} kWh backup ~{hoursBackup}h)
          </span>
        </div>
        <div className="flex justify-between">
          <span>Export:</span>
          <span className="text-[var(--text-primary)]">
            {exportThreshold === 0 ? 'Always export above feed-in' : `When price > ${exportThreshold}c/kWh`}
          </span>
        </div>
        <div className="flex justify-between">
          <span>Import:</span>
          <span className="text-[var(--text-primary)]">
            {importThreshold === 100 ? 'When below average forecast' : `When price < ${importThreshold}c/kWh`}
          </span>
        </div>
      </div>
    </div>
  );
}
