'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { api } from '@/lib/api';
import type { Profile } from '@/types/api';
import { AggressivenessControls } from '@/components/strategy/AggressivenessControls';
import Link from 'next/link';

interface ProfileQuickEditProps {
  onClose: () => void;
}

export function ProfileQuickEdit({ onClose }: ProfileQuickEditProps) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const active = await api.getActiveProfile();
        const fullProfile = await api.getProfile(active.profile.id);
        setProfile(fullProfile);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={onClose}
        aria-hidden
      />

      {/* Slide-out panel */}
      <div
        className="fixed top-0 right-0 bottom-0 z-50 w-80 shadow-lg border-l overflow-y-auto animate-slide-in-right"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderColor: 'var(--border-default)',
        }}
        role="dialog"
        aria-label="Quick profile edit"
      >
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--border-default)' }}>
          <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Quick Profile</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[var(--bg-tertiary)]"
            style={{ color: 'var(--text-secondary)' }}
            aria-label="Close panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!loading && profile && (
            <>
              <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
                Changes apply immediately to the current session.
              </p>
              <AggressivenessControls
                profile={profile}
                onUpdate={setProfile}
                compact
              />
              <div
                className="mt-4 pt-4 border-t text-sm"
                style={{ borderColor: 'var(--border-default)', color: 'var(--text-secondary)' }}
              >
                For scheduling,{' '}
                <Link
                  href="/strategy"
                  onClick={onClose}
                  className="text-purple-500 hover:underline"
                >
                  go to Strategy page
                </Link>
              </div>
            </>
          )}

          {!loading && !profile && (
            <p className="text-sm text-center py-12" style={{ color: 'var(--text-tertiary)' }}>
              Could not load profile
            </p>
          )}
        </div>
      </div>
    </>
  );
}
