import { useCallback, useState } from 'react';
import { cn } from '../utils';

export interface JsonViewerProps {
  /** The data to display. Can be any JSON-serializable value. */
  data: unknown;
  /** Initial expansion depth (default: 1). 0 = collapsed, Infinity = fully expanded. */
  defaultExpandDepth?: number;
  /** CSS class for the root container. */
  className?: string;
  /** Whether to show copy button. */
  copyable?: boolean;
}

/** Renders nested JSON data with interactive expand/collapse tree nodes. */
export function JsonViewer({
  data,
  defaultExpandDepth = 1,
  className,
  copyable = true,
}: JsonViewerProps): React.JSX.Element {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    const text = JSON.stringify(data, null, 2);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [data]);

  return (
    <div className={cn('relative rounded-md bg-[var(--color-surface-raised)] font-mono text-xs', className)}>
      {copyable && (
        <button
          type="button"
          onClick={handleCopy}
          className="absolute right-2 top-2 rounded px-2 py-0.5 text-[10px] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-overlay)] hover:text-[var(--color-text-secondary)]"
          aria-label="Copy JSON to clipboard"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      )}
      <div className="overflow-x-auto p-3">
        <JsonNode value={data} depth={0} defaultExpandDepth={defaultExpandDepth} path="root" />
      </div>
    </div>
  );
}

interface JsonNodeProps {
  value: unknown;
  depth: number;
  defaultExpandDepth: number;
  path: string;
  keyName?: string;
}

function JsonNode({ value, depth, defaultExpandDepth, path, keyName }: JsonNodeProps): React.JSX.Element {
  if (value === null) return <JsonLeaf keyName={keyName} value="null" valueClass="text-gray-500" />;
  if (value === undefined) return <JsonLeaf keyName={keyName} value="undefined" valueClass="text-gray-500" />;

  switch (typeof value) {
    case 'string':
      return <JsonLeaf keyName={keyName} value={formatString(value)} valueClass="text-green-600 dark:text-green-400" />;
    case 'number':
      return <JsonLeaf keyName={keyName} value={String(value)} valueClass="text-blue-600 dark:text-blue-400" />;
    case 'boolean':
      return <JsonLeaf keyName={keyName} value={String(value)} valueClass="text-amber-600 dark:text-amber-400" />;
    case 'object':
      if (Array.isArray(value)) {
        return (
          <JsonCollapsible
            keyName={keyName}
            bracket={['[', ']']}
            itemCount={value.length}
            depth={depth}
            defaultExpandDepth={defaultExpandDepth}
          >
            {value.map((item, i) => (
              <JsonNode
                key={`${path}.${i}`}
                value={item}
                depth={depth + 1}
                defaultExpandDepth={defaultExpandDepth}
                path={`${path}.${i}`}
                keyName={String(i)}
              />
            ))}
          </JsonCollapsible>
        );
      }
      return (
        <JsonCollapsible
          keyName={keyName}
          bracket={['{', '}']}
          itemCount={Object.keys(value as Record<string, unknown>).length}
          depth={depth}
          defaultExpandDepth={defaultExpandDepth}
        >
          {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
            <JsonNode
              key={`${path}.${k}`}
              value={v}
              depth={depth + 1}
              defaultExpandDepth={defaultExpandDepth}
              path={`${path}.${k}`}
              keyName={k}
            />
          ))}
        </JsonCollapsible>
      );
    default:
      return <JsonLeaf keyName={keyName} value={String(value)} valueClass="text-gray-500" />;
  }
}

function JsonLeaf({
  keyName,
  value,
  valueClass,
}: {
  keyName?: string;
  value: string;
  valueClass: string;
}): React.JSX.Element {
  return (
    <div className="leading-5">
      {keyName !== undefined && (
        <span className="text-purple-600 dark:text-purple-400">
          &quot;{keyName}&quot;
        </span>
      )}
      {keyName !== undefined && <span className="text-[var(--color-text-muted)]">: </span>}
      <span className={valueClass}>{value}</span>
    </div>
  );
}

function JsonCollapsible({
  keyName,
  bracket,
  itemCount,
  depth,
  defaultExpandDepth,
  children,
}: {
  keyName?: string;
  bracket: [string, string];
  itemCount: number;
  depth: number;
  defaultExpandDepth: number;
  children: React.ReactNode;
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(depth < defaultExpandDepth);

  return (
    <div className="leading-5">
      <span
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded(!expanded);
          }
        }}
        className="cursor-pointer select-none hover:bg-[var(--color-surface-overlay)] rounded"
      >
        <span className="inline-block w-4 text-center text-[var(--color-text-muted)]" aria-hidden="true">
          {expanded ? '▾' : '▸'}
        </span>
        {keyName !== undefined && (
          <span className="text-purple-600 dark:text-purple-400">
            &quot;{keyName}&quot;
          </span>
        )}
        {keyName !== undefined && <span className="text-[var(--color-text-muted)]">: </span>}
        <span className="text-[var(--color-text-muted)]">{bracket[0]}</span>
        {!expanded && (
          <span className="text-[var(--color-text-muted)]">
            {' '}{itemCount} {itemCount === 1 ? 'item' : 'items'}{' '}{bracket[1]}
          </span>
        )}
      </span>
      {expanded && (
        <>
          <div className="ml-4 border-l border-[var(--color-border)] pl-2">
            {children}
          </div>
          <div className="text-[var(--color-text-muted)]">
            <span className="inline-block w-4" />
            {bracket[1]}
          </div>
        </>
      )}
    </div>
  );
}

/** Format a string value for display, truncating if very long. */
function formatString(value: string): string {
  const MAX_LEN = 500;
  if (value === '[REDACTED]') return '"[REDACTED]"';
  if (value.length > MAX_LEN) {
    return `"${value.slice(0, MAX_LEN)}…" (${value.length} chars)`;
  }
  return `"${value}"`;
}
