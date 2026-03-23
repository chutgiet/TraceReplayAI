// ---------------------------------------------------------------------------
// Redaction types
// ---------------------------------------------------------------------------

/** Actions that can be applied to a redacted field. */
export type RedactionAction = 'mask' | 'remove' | 'hash';

/**
 * A rule that defines which field paths should be redacted and how.
 *
 * - `id`: unique identifier for the rule (for audit trails)
 * - `name`: human-readable name
 * - `fieldPathPattern`: glob-like path pattern (e.g. "payload.content", "**.apiKey")
 *   - `**` matches any nested path segment(s)
 *   - `*` matches a single path segment
 * - `valuePattern`: optional regex applied to field *values* for content-based detection
 * - `action`: what to do when matched (mask, remove, hash)
 * - `replacement`: custom replacement string for 'mask' action (defaults to '[REDACTED]')
 */
export interface RedactionRule {
  id: string;
  name: string;
  fieldPathPattern?: string;
  valuePattern?: string;
  action: RedactionAction;
  replacement?: string;
}

/**
 * A single redaction that was applied.
 */
export interface RedactionRecord {
  /** The full dot-path of the field that was redacted. */
  fieldPath: string;
  /** The rule that triggered the redaction. */
  ruleId: string;
  /** The action that was applied. */
  action: RedactionAction;
}

/**
 * The result of running the redaction engine on a payload.
 */
export interface RedactionResult {
  /** The redacted payload (deep copy — original is never mutated). */
  redactedPayload: Record<string, unknown>;
  /** List of fields that were redacted and which rules matched. */
  redactedFields: RedactionRecord[];
}

/**
 * A set of rules that can be loaded from configuration.
 */
export interface RedactionRuleSet {
  id: string;
  name: string;
  rules: RedactionRule[];
}
