'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const tabs = [
  { label: 'Overview', href: '' },
  { label: 'Timeline', href: '/timeline' },
  { label: 'Lineage', href: '/lineage' },
];

export function RunDetailTabs({ runId }: { runId: string }) {
  const pathname = usePathname();
  const basePath = `/runs/${runId}`;

  return (
    <nav className="flex gap-1 border-b border-[var(--color-border)]" aria-label="Run detail tabs">
      {tabs.map((tab) => {
        const fullHref = `${basePath}${tab.href}`;
        const active = pathname === fullHref;

        return (
          <Link
            key={tab.label}
            href={fullHref}
            className={cn(
              'relative px-4 py-2 text-sm font-medium transition-colors',
              active
                ? 'text-brand-600 dark:text-brand-400'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]',
            )}
          >
            {tab.label}
            {active && (
              <span className="absolute inset-x-0 bottom-0 h-0.5 bg-brand-600 dark:bg-brand-400" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
