'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { AggressivenessSliders } from '@/components/strategy/AggressivenessSliders';
import { api } from '@/lib/api';
import type { Profile } from '@/types/api';

interface ProfileQuickEditProps {
  isOpen: boolean;
  onClose: () => void;
  activeProfileId?: string;
}

export function ProfileQuickEdit({ isOpen, onClose, activeProfileId }: ProfileQuickEditProps) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null);
  const [exportAgg, setExportAgg] = useState(3);
  const [preservationAgg, setPreservationAgg] = useState(3);
  const [importAgg, setImportAgg] = useState(3);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    api.getProfiles().then((data) => {
      setProfiles(data.profiles);
      const active = activeProfileId
        ? data.profiles.find((p) => p.id === activeProfileId)
        : data.profiles.find((p) => p.is_default);
      if (active) {
        setActiveProfile(active);
        setExportAgg(Math.round(active.export_aggressiveness * 4) + 1);
        setPreservationAgg(Math.round(active.preservation_aggressiveness * 4) + 1);
        setImportAgg(Math.round(active.import_aggressiveness * 4) + 1);
      }
    }).catch(console.error);
  }, [isOpen, activeProfileId]);

  const handleSave = async () => {
    if (!activeProfile) return;
    setIsSaving(true);
    try {
      await api.updateProfile(activeProfile.id, {
        export_aggressiveness: (exportAgg - 1) / 4,
        preservation_aggressiveness: (preservationAgg - 1) / 4,
        import_aggressiveness: (importAgg - 1) / 4,
      });
      onClose();
    } catch (err) {
      console.error('Failed to save profile:', err);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20"
        onClick={onClose}
        aria-hidden
      />

      {/* Panel */}
      <div
        className="fixed right-0 top-0 bottom-0 z-50 w-80 bg-[var(--bg-primary)] border-l border-[var(--border-default)] shadow-lg overflow-y-auto animate-slide-in-right"
        role="dialog"
        aria-label="Quick profile edit"
        aria-modal
      >
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">Quick Profile</h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors"
              aria-label="Close panel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {activeProfile && (
            <AggressivenessSliders
              exportValue={exportAgg}
              preservationValue={preservationAgg}
              importValue={importAgg}
              onExportChange={setExportAgg}
              onPreservationChange={setPreservationAgg}
              onImportChange={setImportAgg}
              compact
            />
          )}

          <p className="text-xs text-[var(--text-secondary)]">
            Changes apply immediately. For scheduling, go to the{' '}
            <a href="/strategy" className="underline">Strategy page</a>.
          </p>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={isSaving} className="flex-1">
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
