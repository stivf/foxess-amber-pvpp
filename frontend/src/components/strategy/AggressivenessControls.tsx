'use client';

import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { profileColors } from '@/lib/colors';
import type { Profile } from '@/types/api';
import { api } from '@/lib/api';

interface AggressivenessControlsProps {
  profile: Profile;
  onUpdate?: (profile: Profile) => void;
  compact?: boolean;
}

type PresetName = 'conservative' | 'balanced' | 'aggressive';

const PRESETS: Record<PresetName, { export: number; preservation: number; import: number }> = {
  conservative: { export: 0.0, preservation: 0.0, import: 0.0 },
  balanced: { export: 0.5, preservation: 0.5, import: 0.5 },
  aggressive: { export: 1.0, preservation: 1.0, import: 1.0 },
};

const EXPORT_LABELS = ['Keep', 'Cautious', 'Balanced', 'Eager', 'Max'];
const EXPORT_DESCRIPTIONS = [
  'Only export when battery full and solar generating',
  'Export during price spikes above 60c/kWh',
  'Export when price exceeds 40c/kWh',
  'Export when price exceeds feed-in rate + margin',
  'Export whenever price is above feed-in rate',
];

const PRESERVATION_LABELS = ['Max Reserve', 'High Reserve', 'Balanced', 'Low Reserve', 'Full Use'];
const PRESERVATION_DESCRIPTIONS = [
  'Keep 80% minimum SoC (maximum backup)',
  'Keep 50% minimum SoC',
  'Keep 30% minimum SoC',
  'Keep 15% minimum SoC',
  'Keep 5% minimum SoC (maximize trading)',
];

const IMPORT_LABELS = ['Minimal', 'Cautious', 'Balanced', 'Eager', 'Max'];
const IMPORT_DESCRIPTIONS = [
  'Only charge when price is negative or < 5c/kWh',
  'Charge below 10c/kWh',
  'Charge below 20c/kWh',
  'Charge below 30c/kWh',
  'Charge whenever price is below average forecast',
];

function valueToStop(value: number): number {
  return Math.round(value * 4);
}

function stopToValue(stop: number): number {
  return stop / 4;
}

function getImpactSummary(exportVal: number, preservationVal: number, importVal: number) {
  const exportStop = valueToStop(exportVal);
  const preservationStop = valueToStop(preservationVal);
  const importStop = valueToStop(importVal);

  const reservePcts = [80, 50, 30, 15, 5];
  const exportThresholds = ['never', '60c', '40c', 'feed-in + margin', 'feed-in rate'];
  const importThresholds = ['negative prices', '10c/kWh', '20c/kWh', '30c/kWh', 'avg forecast'];

  return {
    reserve: `${reservePcts[preservationStop]}%`,
    exportWhen: exportThresholds[exportStop],
    importWhen: importThresholds[importStop],
  };
}

interface SliderProps {
  label: string;
  description: string;
  value: number;
  onChange: (v: number) => void;
  labels: string[];
  descriptions: string[];
  color: string;
  compact?: boolean;
}

function AggressivenessSlider({ label, description, value, onChange, labels, descriptions, color, compact }: SliderProps) {
  const stop = valueToStop(value);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{label}</p>
          {!compact && (
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{description}</p>
          )}
        </div>
        <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: `${color}26`, color }}>
          {labels[stop]}
        </span>
      </div>

      {/* Track with 5 stops */}
      <div className="relative">
        <input
          type="range"
          min={0}
          max={4}
          step={1}
          value={stop}
          onChange={(e) => onChange(stopToValue(parseInt(e.target.value)))}
          className="w-full h-1 appearance-none rounded-full cursor-pointer"
          style={{
            background: `linear-gradient(to right, ${profileColors.conservative}, ${profileColors.aggressive})`,
            accentColor: color,
          }}
          aria-label={`${label} aggressiveness: ${labels[stop]}`}
        />
        <div className="flex justify-between mt-1">
          {labels.map((l, i) => (
            <span
              key={i}
              className={cn(
                'text-xs cursor-pointer transition-colors',
                i === stop ? 'font-medium' : '',
              )}
              style={{ color: i === stop ? color : 'var(--text-tertiary)' }}
              onClick={() => onChange(stopToValue(i))}
            >
              {l}
            </span>
          ))}
        </div>
      </div>

      {/* Active stop description */}
      {!compact && (
        <p className="text-xs italic" style={{ color: 'var(--text-secondary)' }}>
          {descriptions[stop]}
        </p>
      )}
    </div>
  );
}

export function AggressivenessControls({ profile, onUpdate, compact = false }: AggressivenessControlsProps) {
  const [exportVal, setExportVal] = useState(profile.export_aggressiveness);
  const [preservationVal, setPreservationVal] = useState(profile.preservation_aggressiveness);
  const [importVal, setImportVal] = useState(profile.import_aggressiveness);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getActivePreset = (): PresetName | 'custom' => {
    for (const [name, preset] of Object.entries(PRESETS)) {
      if (
        Math.abs(exportVal - preset.export) < 0.01 &&
        Math.abs(preservationVal - preset.preservation) < 0.01 &&
        Math.abs(importVal - preset.import) < 0.01
      ) {
        return name as PresetName;
      }
    }
    return 'custom';
  };

  const activePreset = getActivePreset();

  const applyPreset = useCallback((name: PresetName) => {
    const preset = PRESETS[name];
    setExportVal(preset.export);
    setPreservationVal(preset.preservation);
    setImportVal(preset.import);
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateProfile(profile.id, {
        export_aggressiveness: exportVal,
        preservation_aggressiveness: preservationVal,
        import_aggressiveness: importVal,
      });
      onUpdate?.(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  const hasChanges =
    Math.abs(exportVal - profile.export_aggressiveness) > 0.01 ||
    Math.abs(preservationVal - profile.preservation_aggressiveness) > 0.01 ||
    Math.abs(importVal - profile.import_aggressiveness) > 0.01;

  const impact = getImpactSummary(exportVal, preservationVal, importVal);

  const presets: Array<{ name: PresetName; label: string; color: string }> = [
    { name: 'conservative', label: 'Conservative', color: profileColors.conservative },
    { name: 'balanced', label: 'Balanced', color: profileColors.balanced },
    { name: 'aggressive', label: 'Aggressive', color: profileColors.aggressive },
  ];

  return (
    <div className="space-y-4">
      {/* Preset pills */}
      <div className="flex gap-2 flex-wrap">
        {presets.map(({ name, label, color }) => (
          <button
            key={name}
            onClick={() => applyPreset(name)}
            className="px-3 py-1.5 rounded-full text-sm font-medium transition-all"
            style={
              activePreset === name
                ? { backgroundColor: color, color: '#fff' }
                : { backgroundColor: `${color}26`, color }
            }
          >
            {label}
          </button>
        ))}
        {activePreset === 'custom' && (
          <span
            className="px-3 py-1.5 rounded-full text-sm font-medium"
            style={{ backgroundColor: `${profileColors.custom}26`, color: profileColors.custom }}
          >
            Custom
          </span>
        )}
      </div>

      {/* Sliders */}
      <div className="space-y-5">
        <AggressivenessSlider
          label="Export"
          description="How eagerly to sell stored energy to the grid"
          value={exportVal}
          onChange={setExportVal}
          labels={EXPORT_LABELS}
          descriptions={EXPORT_DESCRIPTIONS}
          color={profileColors.aggressive}
          compact={compact}
        />
        <AggressivenessSlider
          label="Preservation"
          description="How much battery reserve to maintain"
          value={preservationVal}
          onChange={setPreservationVal}
          labels={PRESERVATION_LABELS}
          descriptions={PRESERVATION_DESCRIPTIONS}
          color={profileColors.conservative}
          compact={compact}
        />
        <AggressivenessSlider
          label="Import"
          description="How eagerly to charge from the grid"
          value={importVal}
          onChange={setImportVal}
          labels={IMPORT_LABELS}
          descriptions={IMPORT_DESCRIPTIONS}
          color={profileColors.balanced}
          compact={compact}
        />
      </div>

      {/* Impact summary */}
      <div
        className="rounded-md p-3 text-sm space-y-1"
        style={{ backgroundColor: 'var(--bg-tertiary)' }}
      >
        <p className="font-medium" style={{ color: 'var(--text-primary)' }}>With these settings:</p>
        <p style={{ color: 'var(--text-secondary)' }}>Reserve: {impact.reserve}</p>
        <p style={{ color: 'var(--text-secondary)' }}>Export: When price &gt; {impact.exportWhen}</p>
        <p style={{ color: 'var(--text-secondary)' }}>Import: When price &lt; {impact.importWhen}</p>
      </div>

      {/* Save button */}
      {hasChanges && (
        <div className="flex items-center gap-3">
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 rounded-md text-sm font-medium text-white disabled:opacity-50 transition-opacity"
            style={{ backgroundColor: '#8B5CF6' }}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <button
            onClick={() => {
              setExportVal(profile.export_aggressiveness);
              setPreservationVal(profile.preservation_aggressiveness);
              setImportVal(profile.import_aggressiveness);
            }}
            className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            Reset
          </button>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      )}
    </div>
  );
}
