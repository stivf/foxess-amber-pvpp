'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Sun, Moon, Settings, Zap, Wifi, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/components/providers/ThemeProvider';
import { useWebSocket } from '@/components/providers/WebSocketProvider';
import { getProfileColor } from '@/lib/colors';
import { ProfileQuickEdit } from '@/components/dashboard/ProfileQuickEdit';

interface NavBarProps {
  activeProfileName?: string;
  activeUntil?: string;
}

export function NavBar({ activeProfileName, activeUntil }: NavBarProps) {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const { status } = useWebSocket();
  const [showProfilePanel, setShowProfilePanel] = useState(false);

  const navLinks = [
    { href: '/', label: 'Dashboard' },
    { href: '/strategy', label: 'Strategy' },
    { href: '/history', label: 'History' },
    { href: '/settings', label: 'Settings' },
  ];

  const profileColor = activeProfileName ? getProfileColor(activeProfileName) : '#8B5CF6';

  return (
    <>
      <nav
        className="sticky top-0 z-40 border-b"
        style={{
          backgroundColor: 'var(--bg-primary)',
          borderColor: 'var(--border-default)',
        }}
      >
        <div className="max-w-screen-xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          {/* Logo */}
          <div className="flex items-center gap-2 font-semibold text-lg shrink-0">
            <Zap className="w-5 h-5 text-yellow-500" />
            <span style={{ color: 'var(--text-primary)' }}>Battery Brain</span>
          </div>

          {/* Nav links (desktop) */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                  pathname === link.href
                    ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]',
                )}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Right side controls */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Active profile badge */}
            {activeProfileName && (
              <button
                onClick={() => setShowProfilePanel(true)}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium transition-opacity hover:opacity-80"
                style={{
                  backgroundColor: `${profileColor}26`,
                  color: profileColor,
                }}
              >
                <Zap className="w-3.5 h-3.5" />
                <span>{activeProfileName}</span>
                {activeUntil && (
                  <span style={{ color: `${profileColor}99`, fontSize: '0.7rem' }}>
                    until {new Date(activeUntil).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true })}
                  </span>
                )}
              </button>
            )}

            {/* WebSocket status */}
            <div className="flex items-center" title={`WebSocket: ${status}`}>
              {status === 'connected' ? (
                <Wifi className="w-4 h-4 text-green-500" />
              ) : (
                <WifiOff className="w-4 h-4 text-red-400" />
              )}
            </div>

            {/* Theme toggle */}
            <button
              onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
              className="p-2 rounded-md hover:bg-[var(--bg-tertiary)] transition-colors"
              aria-label="Toggle theme"
              style={{ color: 'var(--text-secondary)' }}
            >
              {resolvedTheme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Settings link (mobile only shows gear) */}
            <Link
              href="/settings"
              className="p-2 rounded-md hover:bg-[var(--bg-tertiary)] transition-colors md:hidden"
              style={{ color: 'var(--text-secondary)' }}
            >
              <Settings className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* Mobile nav tabs */}
        <div
          className="md:hidden flex border-t"
          style={{ borderColor: 'var(--border-default)' }}
        >
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'flex-1 py-2 text-center text-xs font-medium transition-colors',
                pathname === link.href
                  ? 'text-[var(--text-primary)] border-b-2 border-purple-500'
                  : 'text-[var(--text-secondary)]',
              )}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </nav>

      {/* Profile quick-edit panel */}
      {showProfilePanel && (
        <ProfileQuickEdit onClose={() => setShowProfilePanel(false)} />
      )}
    </>
  );
}
