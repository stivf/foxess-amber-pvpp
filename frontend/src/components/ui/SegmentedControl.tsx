'use client';

import { cn } from '@/lib/utils';

interface Segment<T extends string> {
  value: T;
  label: string;
  activeColor?: string;
}

interface SegmentedControlProps<T extends string> {
  segments: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      className={cn(
        'inline-flex rounded-md border border-[var(--border-default)] bg-[var(--bg-tertiary)] p-0.5',
        className,
      )}
      role="tablist"
    >
      {segments.map((seg) => {
        const isActive = seg.value === value;
        return (
          <button
            key={seg.value}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(seg.value)}
            className={cn(
              'flex-1 rounded px-3 py-1.5 text-sm font-medium transition-all',
              isActive
                ? 'text-white shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
            )}
            style={
              isActive && seg.activeColor
                ? { backgroundColor: seg.activeColor }
                : isActive
                ? { backgroundColor: 'var(--text-primary)', color: 'var(--bg-primary)' }
                : {}
            }
          >
            {seg.label}
          </button>
        );
      })}
    </div>
  );
}
