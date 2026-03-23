import { createHash } from 'node:crypto';
import type {
  RedactionAction,
  RedactionRecord,
  RedactionResult,
  RedactionRule,
} from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MASK = '[REDACTED]';

// ---------------------------------------------------------------------------
// Path matching
// ---------------------------------------------------------------------------

/**
 * Match a concrete dot-separated field path against a glob pattern.
 *
 * Supported wildcards:
 *  - `*`  — matches exactly one path segment
 *  - `**` — matches zero or more path segments
 */
function matchFieldPath(pattern: string, fieldPath: string): boolean {
  const patternParts = pattern.split('.');
  const fieldParts = fieldPath.split('.');
  return matchParts(patternParts, 0, fieldParts, 0);
}

function matchParts(
  pattern: string[],
  pi: number,
  field: string[],
  fi: number,
): boolean {
  // Both exhausted → match
  if (pi === pattern.length && fi === field.length) return true;
  // Pattern exhausted but field not → no match
  if (pi === pattern.length) return false;

  const seg = pattern[pi]!;

  if (seg === '**') {
    // `**` can consume zero or more field segments
    // Try matching the rest of the pattern at every remaining field position
    for (let i = fi; i <= field.length; i++) {
      if (matchParts(pattern, pi + 1, field, i)) return true;
    }
    return false;
  }

  // Field exhausted but pattern not → no match (unless remaining is only **)
  if (fi === field.length) return false;

  if (seg === '*') {
    // `*` matches exactly one segment
    return matchParts(pattern, pi + 1, field, fi + 1);
  }

  // Literal match
  if (seg === field[fi]) {
    return matchParts(pattern, pi + 1, field, fi + 1);
  }

  return false;
}

// ---------------------------------------------------------------------------
// Redaction helpers
// ---------------------------------------------------------------------------

function applyAction(value: unknown, action: RedactionAction, replacement?: string): unknown {
  switch (action) {
    case 'mask':
      return replacement ?? DEFAULT_MASK;
    case 'remove':
      // Sentinel: caller should delete this key
      return undefined;
    case 'hash': {
      const str = typeof value === 'string' ? value : JSON.stringify(value);
      return `sha256:${createHash('sha256').update(str).digest('hex')}`;
    }
  }
}

// ---------------------------------------------------------------------------
// RedactionEngine
// ---------------------------------------------------------------------------

/**
 * Applies a set of {@link RedactionRule} instances to arbitrary payloads.
 *
 * The engine never mutates the original payload — it returns a deep copy
 * with sensitive fields masked, removed, or hashed.
 */
export class RedactionEngine {
  private readonly rules: RedactionRule[];
  private readonly compiledValuePatterns: Map<string, RegExp>;

  constructor(rules: readonly RedactionRule[] = []) {
    this.rules = [...rules];
    this.compiledValuePatterns = new Map();

    // Pre-compile value regex patterns
    for (const rule of this.rules) {
      if (rule.valuePattern) {
        this.compiledValuePatterns.set(rule.id, new RegExp(rule.valuePattern));
      }
    }
  }

  /** Add rules at runtime (e.g. from a config reload). */
  addRules(rules: readonly RedactionRule[]): void {
    for (const rule of rules) {
      this.rules.push(rule);
      if (rule.valuePattern) {
        this.compiledValuePatterns.set(rule.id, new RegExp(rule.valuePattern));
      }
    }
  }

  /** Return the currently loaded rule set (read-only copy). */
  getRules(): readonly RedactionRule[] {
    return [...this.rules];
  }

  /**
   * Redact a payload according to the loaded rules.
   *
   * Returns a deep copy of the payload with sensitive fields redacted,
   * plus an audit trail of what was redacted.
   */
  redact(payload: Record<string, unknown>): RedactionResult {
    const redactedFields: RedactionRecord[] = [];
    const redactedPayload = this.redactObject(payload, '', redactedFields);

    return { redactedPayload, redactedFields };
  }

  // -----------------------------------------------------------------------
  // Private traversal
  // -----------------------------------------------------------------------

  private redactObject(
    obj: Record<string, unknown>,
    parentPath: string,
    records: RedactionRecord[],
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      const fieldPath = parentPath ? `${parentPath}.${key}` : key;

      // Check field-path rules first
      const pathRule = this.findMatchingPathRule(fieldPath);
      if (pathRule) {
        const redacted = applyAction(value, pathRule.action, pathRule.replacement);
        records.push({
          fieldPath,
          ruleId: pathRule.id,
          action: pathRule.action,
        });
        if (pathRule.action === 'remove') {
          // Omit the key entirely
          continue;
        }
        result[key] = redacted;
        continue;
      }

      // Recurse into nested objects / arrays
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        result[key] = this.redactObject(
          value as Record<string, unknown>,
          fieldPath,
          records,
        );
        continue;
      }

      if (Array.isArray(value)) {
        result[key] = this.redactArray(value, fieldPath, records);
        continue;
      }

      // Check value-pattern rules on string values
      if (typeof value === 'string') {
        const valueRule = this.findMatchingValueRule(value);
        if (valueRule) {
          const redacted = applyAction(value, valueRule.action, valueRule.replacement);
          records.push({
            fieldPath,
            ruleId: valueRule.id,
            action: valueRule.action,
          });
          if (valueRule.action === 'remove') {
            continue;
          }
          result[key] = redacted;
          continue;
        }
      }

      // No rule matched — copy as-is
      result[key] = value;
    }

    return result;
  }

  private redactArray(
    arr: unknown[],
    parentPath: string,
    records: RedactionRecord[],
  ): unknown[] {
    return arr.map((item, index) => {
      const itemPath = `${parentPath}[${index}]`;

      if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
        return this.redactObject(
          item as Record<string, unknown>,
          itemPath,
          records,
        );
      }

      if (Array.isArray(item)) {
        return this.redactArray(item, itemPath, records);
      }

      // Check value-pattern rules on string values in arrays
      if (typeof item === 'string') {
        const valueRule = this.findMatchingValueRule(item);
        if (valueRule) {
          const redacted = applyAction(item, valueRule.action, valueRule.replacement);
          records.push({
            fieldPath: itemPath,
            ruleId: valueRule.id,
            action: valueRule.action,
          });
          return valueRule.action === 'remove' ? undefined : redacted;
        }
      }

      return item;
    });
  }

  private findMatchingPathRule(fieldPath: string): RedactionRule | undefined {
    return this.rules.find(
      (rule) => rule.fieldPathPattern && matchFieldPath(rule.fieldPathPattern, fieldPath),
    );
  }

  private findMatchingValueRule(value: string): RedactionRule | undefined {
    return this.rules.find((rule) => {
      if (!rule.valuePattern) return false;
      const regex = this.compiledValuePatterns.get(rule.id);
      return regex?.test(value) ?? false;
    });
  }
}
