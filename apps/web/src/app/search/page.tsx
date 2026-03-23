export default function SearchPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Search</h1>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Full-text search across event payloads
        </p>
      </div>

      {/* Search implementation — ready for F3-009 */}
      <div className="rounded-lg border border-[var(--color-border)] p-12 text-center">
        <p className="text-sm text-[var(--color-text-muted)]">
          Full-text search will be implemented in F3-009.
        </p>
      </div>
    </div>
  );
}
