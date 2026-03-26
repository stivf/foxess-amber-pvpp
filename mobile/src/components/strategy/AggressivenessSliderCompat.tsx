// Compatibility wrapper for the StrategyScreen's AggressivenessSlider usage
import React from 'react';
import { AggressivenessSlider as BaseSlider } from './AggressivenessSlider';

type StopIndex = 1 | 2 | 3 | 4 | 5;

interface Props {
  axis: 'export' | 'preservation' | 'import';
  label: string;
  value: number;
  onChange: (value: number) => void;
}

const EXPORT_STOPS = [
  { value: 1 as StopIndex, shortLabel: 'Keep', description: 'Only export when battery is full and solar is generating' },
  { value: 2 as StopIndex, shortLabel: 'Cautious', description: 'Export during price spikes above 60c/kWh' },
  { value: 3 as StopIndex, shortLabel: 'Balanced', description: 'Export when price exceeds 40c/kWh' },
  { value: 4 as StopIndex, shortLabel: 'Eager', description: 'Export when price exceeds feed-in rate + margin' },
  { value: 5 as StopIndex, shortLabel: 'Max', description: 'Export whenever price is above feed-in rate' },
];

const PRESERVATION_STOPS = [
  { value: 1 as StopIndex, shortLabel: 'Max Reserve', description: 'Keep 80% minimum SoC (maximum backup power)' },
  { value: 2 as StopIndex, shortLabel: 'High Reserve', description: 'Keep 50% minimum SoC' },
  { value: 3 as StopIndex, shortLabel: 'Balanced', description: 'Keep 30% minimum SoC' },
  { value: 4 as StopIndex, shortLabel: 'Low Reserve', description: 'Keep 15% minimum SoC' },
  { value: 5 as StopIndex, shortLabel: 'Full Use', description: 'Keep 5% minimum SoC (maximize trading)' },
];

const IMPORT_STOPS = [
  { value: 1 as StopIndex, shortLabel: 'Minimal', description: 'Only charge when price is negative or < 5c/kWh' },
  { value: 2 as StopIndex, shortLabel: 'Cautious', description: 'Charge below 10c/kWh' },
  { value: 3 as StopIndex, shortLabel: 'Balanced', description: 'Charge below 20c/kWh' },
  { value: 4 as StopIndex, shortLabel: 'Eager', description: 'Charge below 30c/kWh' },
  { value: 5 as StopIndex, shortLabel: 'Max', description: 'Charge whenever price is below average forecast' },
];

const STOPS_BY_AXIS = {
  export: EXPORT_STOPS,
  preservation: PRESERVATION_STOPS,
  import: IMPORT_STOPS,
};

export function AggressivenessSlider({ axis, label, value, onChange }: Props) {
  const stops = STOPS_BY_AXIS[axis];
  const clampedValue = Math.max(1, Math.min(5, Math.round(value))) as StopIndex;

  return (
    <BaseSlider
      label={label}
      value={clampedValue}
      stops={stops}
      onChange={(v) => onChange(v)}
    />
  );
}
