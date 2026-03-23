import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <h1 className="text-6xl font-bold text-[var(--color-text-muted)]">404</h1>
      <p className="mt-4 text-lg text-[var(--color-text-secondary)]">
        Page not found
      </p>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">
        The resource you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <Link
        href="/runs"
        className="mt-6 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
      >
        Go to runs
      </Link>
    </div>
  );
}
