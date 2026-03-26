'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Moon, Sun, Settings, Wifi, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/components/providers/ThemeProvider';
import { getProfileColor } from '@/lib/colors';

interface NavBarProps {
  profileName?: string;
  profileActiveUntil?: string;
  wsStatus?: 'connecting' | 'connected' | 'disconnected' | 'error';
  onProfileClick?: () => void;
}

const NAV_LINKS = [
  { href: '/', label: 'Dashboard' },
  { href: '/strategy', label: 'Strategy' },
  { href: '/history', label: 'History' },
  { href: '/settings', label: 'Settings' },
];

export function NavBar({ profileName, profileActiveUntil, wsStatus, onProfileClick }: NavBarProps) {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const profileColor = profileName ? getProfileColor(profileName) : '#8B5CF6';

  const toggleTheme = () => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  };

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--border-default)] bg-[var(--bg-primary)]">
      <div className="mx-auto max-w-7xl px-4">
        <div className="flex h-14 items-center gap-4">
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center gap-2 text-base font-bold text-[var(--text-primary)] hover:opacity-80 transition-opacity flex-shrink-0"
          >
            <span className="text-lg" aria-hidden>
              {/* Battery icon inline */}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="7" width="16" height="10" rx="2" ry="2" />
                <line x1="22" y1="11" x2="22" y2="13" />
                <line x1="6" y1="11" x2="6" y2="13" />
                <line x1="10" y1="11" x2="10" y2="13" />
              </svg>
            </span>
            Battery Brain
          </Link>

          {/* Desktop nav links */}
          <nav className="hidden md:flex items-center gap-1 ml-4" aria-label="Main navigation">
            {NAV_LINKS.map((link) => (
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
          </nav>

          <div className="flex-1" />

          {/* Profile badge */}
          {profileName && (
            <button
              onClick={onProfileClick}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2"
              style={{
                backgroundColor: `${profileColor}26`,
                color: profileColor,
              }}
              aria-label={`Active profile: ${profileName}${profileActiveUntil ? `, until ${profileActiveUntil}` : ''}`}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              {profileName}
              {profileActiveUntil && (
                <span className="text-xs opacity-70">until {profileActiveUntil}</span>
              )}
            </button>
          )}

          {/* WS status indicator */}
          <div
            className="flex-shrink-0"
            title={`WebSocket: ${wsStatus ?? 'unknown'}`}
            aria-label={`Connection: ${wsStatus ?? 'unknown'}`}
          >
            {wsStatus === 'connected' ? (
              <Wifi className="w-4 h-4 text-[#059669]" aria-hidden />
            ) : (
              <WifiOff className="w-4 h-4 text-[var(--text-tertiary)]" aria-hidden />
            )}
          </div>

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="p-1.5 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors focus-visible:outline-none focus-visible:ring-2"
            aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} theme`}
          >
            {resolvedTheme === 'dark' ? (
              <Sun className="w-4 h-4" aria-hidden />
            ) : (
              <Moon className="w-4 h-4" aria-hidden />
            )}
          </button>

          {/* Settings link */}
          <Link
            href="/settings"
            className="p-1.5 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
            aria-label="Settings"
          >
            <Settings className="w-4 h-4" aria-hidden />
          </Link>
        </div>
      </div>
    </header>
  );
}
