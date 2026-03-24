import Link from 'next/link';

export default function RunNotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-4">
      <div className="text-center">
        <span className="text-5xl" aria-hidden="true">🔍</span>
        <h1 className="mt-4 text-4xl font-bold text-[var(--color-text-muted)]">
          404
        </h1>
        <h2 className="mt-2 text-lg font-semibold text-[var(--color-text-primary)]">
          Run not found
        </h2>
        <p className="mt-2 max-w-sm text-sm text-[var(--color-text-secondary)]">
          The run you&apos;re looking for doesn&apos;t exist, may have been deleted,
          or you don&apos;t have access to it.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link
            href="/runs"
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-400"
          >
            Browse all runs
          </Link>
          <Link
            href="/search"
            className="text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
          >
            Search events
          </Link>
        </div>
      </div>
    </div>
  );
}
