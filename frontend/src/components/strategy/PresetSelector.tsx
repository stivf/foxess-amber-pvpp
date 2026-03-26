'use client';

import { cn } from '@/lib/utils';
import { profileColors } from '@/lib/colors';

type Preset = 'conservative' | 'balanced' | 'aggressive' | 'custom';

interface PresetValues {
  export: number;
  preservation: number;
  import: number;
}

const PRESETS: Record<Exclude<Preset, 'custom'>, PresetValues> = {
  conservative: { export: 1, preservation: 1, import: 1 },
  balanced: { export: 3, preservation: 3, import: 3 },
  aggressive: { export: 5, preservation: 5, import: 5 },
};

interface PresetSelectorProps {
  activePreset: Preset;
  onChange: (preset: Preset, values: PresetValues) => void;
}

const PRESET_INFO: Record<Preset, { label: string; color: string; description: string }> = {
  conservative: {
    label: 'Conservative',
    color: profileColors.conservative,
    description: 'High reserve, sell only during spikes, minimal grid charging',
  },
  balanced: {
    label: 'Balanced',
    color: profileColors.balanced,
    description: 'Moderate reserve, sell above 40c, charge below 20c',
  },
  aggressive: {
    label: 'Aggressive',
    color: profileColors.aggressive,
    description: 'Low reserve, maximize export and import opportunities',
  },
  custom: {
    label: 'Custom',
    color: profileColors.custom,
    description: 'Your custom slider configuration',
  },
};

export function PresetSelector({ activePreset, onChange }: PresetSelectorProps) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Profile presets">
      {(Object.keys(PRESET_INFO) as Preset[]).map((preset) => {
        const info = PRESET_INFO[preset];
        const isActive = activePreset === preset;

        return (
          <button
            key={preset}
            role="radio"
            aria-checked={isActive}
            onClick={() => {
              if (preset !== 'custom') {
                onChange(preset, PRESETS[preset]);
              }
            }}
            className={cn(
              'px-4 py-2 rounded-full text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2',
              isActive ? 'text-white shadow-sm' : 'hover:opacity-80',
            )}
            style={{
              backgroundColor: isActive ? info.color : `${info.color}26`,
              color: isActive ? 'white' : info.color,
            }}
            title={info.description}
          >
            {info.label}
          </button>
        );
      })}
    </div>
  );
}

export function detectPreset(
  exportVal: number,
  preservationVal: number,
  importVal: number,
): Preset {
  for (const [name, values] of Object.entries(PRESETS)) {
    if (
      values.export === exportVal &&
      values.preservation === preservationVal &&
      values.import === importVal
    ) {
      return name as Preset;
    }
  }
  return 'custom';
}

export type { Preset, PresetValues };
