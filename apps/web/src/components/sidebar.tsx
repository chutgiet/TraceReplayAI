'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  ListOrdered,
  Search,
  Sun,
  Moon,
  Monitor,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/lib/theme-provider';

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/runs', label: 'Runs', icon: ListOrdered },
  { href: '/search', label: 'Search', icon: Search },
];

export function Sidebar() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();

  return (
    <aside className="flex h-full w-60 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface-raised)]">
      {/* Brand */}
      <div className="flex h-16 items-center gap-2 border-b border-[var(--color-border)] px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-600 text-sm font-bold text-white">
          TR
        </div>
        <span className="text-sm font-semibold">TraceReplay AI</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-2 py-4" aria-label="Main navigation">
        {navItems.map((item) => {
          const active =
            item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300'
                  : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-overlay)] hover:text-[var(--color-text-primary)]',
              )}
              aria-current={active ? 'page' : undefined}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Theme Switcher */}
      <div className="border-t border-[var(--color-border)] px-3 py-3">
        <div className="flex items-center gap-1 rounded-md bg-[var(--color-surface-overlay)] p-1">
          <ThemeButton
            active={theme === 'light'}
            onClick={() => setTheme('light')}
            label="Light theme"
          >
            <Sun className="h-3.5 w-3.5" />
          </ThemeButton>
          <ThemeButton
            active={theme === 'dark'}
            onClick={() => setTheme('dark')}
            label="Dark theme"
          >
            <Moon className="h-3.5 w-3.5" />
          </ThemeButton>
          <ThemeButton
            active={theme === 'system'}
            onClick={() => setTheme('system')}
            label="System theme"
          >
            <Monitor className="h-3.5 w-3.5" />
          </ThemeButton>
        </div>
      </div>
    </aside>
  );
}

function ThemeButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={cn(
        'flex flex-1 items-center justify-center rounded px-2 py-1.5 transition-colors',
        active
          ? 'bg-[var(--color-surface)] shadow-sm'
          : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]',
      )}
    >
      {children}
    </button>
  );
}
