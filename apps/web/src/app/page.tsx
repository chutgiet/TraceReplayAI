import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="flex flex-col items-center justify-center gap-8 py-20">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">
          TraceReplay AI
        </h1>
        <p className="mt-3 text-lg text-[var(--color-text-secondary)]">
          Audit-grade replay and lineage for enterprise AI agents
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <QuickLink
          href="/runs"
          title="Runs"
          description="Browse and filter agent execution runs"
        />
        <QuickLink
          href="/runs"
          title="Investigation"
          description="Replay timelines, inspect events, trace lineage"
        />
        <QuickLink
          href="/runs"
          title="Search"
          description="Full-text search across event payloads"
        />
      </div>
    </div>
  );
}

function QuickLink({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-lg border border-[var(--color-border)] p-6 transition-colors hover:border-brand-500 hover:bg-[var(--color-surface-raised)]"
    >
      <h2 className="text-xl font-semibold group-hover:text-brand-500">
        {title}
      </h2>
      <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
        {description}
      </p>
    </Link>
  );
}
