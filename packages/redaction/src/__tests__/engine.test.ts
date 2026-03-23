import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { RedactionEngine } from '../engine.js';
import { BUILT_IN_RULES } from '../rules.js';
import type { RedactionRule } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sha256(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

// ---------------------------------------------------------------------------
// RedactionEngine — core behavior
// ---------------------------------------------------------------------------

describe('RedactionEngine', () => {
  describe('constructor', () => {
    it('creates engine with no rules', () => {
      const engine = new RedactionEngine();
      expect(engine.getRules()).toEqual([]);
    });

    it('creates engine with provided rules', () => {
      const rules: RedactionRule[] = [
        { id: 'r1', name: 'Test', fieldPathPattern: 'secret', action: 'mask' },
      ];
      const engine = new RedactionEngine(rules);
      expect(engine.getRules()).toHaveLength(1);
    });

    it('does not share reference with input array', () => {
      const rules: RedactionRule[] = [
        { id: 'r1', name: 'Test', fieldPathPattern: 'secret', action: 'mask' },
      ];
      const engine = new RedactionEngine(rules);
      rules.push({ id: 'r2', name: 'Test 2', fieldPathPattern: 'other', action: 'mask' });
      expect(engine.getRules()).toHaveLength(1);
    });
  });

  describe('addRules', () => {
    it('adds rules at runtime', () => {
      const engine = new RedactionEngine();
      engine.addRules([
        { id: 'r1', name: 'Test', fieldPathPattern: 'secret', action: 'mask' },
      ]);
      expect(engine.getRules()).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // Field-path based redaction
  // -----------------------------------------------------------------------

  describe('field-path based redaction', () => {
    it('masks a top-level field by exact path', () => {
      const engine = new RedactionEngine([
        { id: 'r1', name: 'Mask secret', fieldPathPattern: 'secret', action: 'mask' },
      ]);
      const result = engine.redact({ secret: 'my-secret-value', other: 'visible' });

      expect(result.redactedPayload).toEqual({ secret: '[REDACTED]', other: 'visible' });
      expect(result.redactedFields).toEqual([
        { fieldPath: 'secret', ruleId: 'r1', action: 'mask' },
      ]);
    });

    it('masks a nested field by exact path', () => {
      const engine = new RedactionEngine([
        { id: 'r1', name: 'Mask creds', fieldPathPattern: 'config.credentials.apiKey', action: 'mask' },
      ]);
      const result = engine.redact({
        config: {
          credentials: { apiKey: 'sk-12345', region: 'us-east-1' },
        },
      });

      expect(result.redactedPayload).toEqual({
        config: {
          credentials: { apiKey: '[REDACTED]', region: 'us-east-1' },
        },
      });
      expect(result.redactedFields).toHaveLength(1);
      expect(result.redactedFields[0]!.fieldPath).toBe('config.credentials.apiKey');
    });

    it('supports ** wildcard to match any depth', () => {
      const engine = new RedactionEngine([
        { id: 'r1', name: 'Mask all passwords', fieldPathPattern: '**.password', action: 'mask' },
      ]);
      const result = engine.redact({
        user: { password: 'secret1' },
        admin: { nested: { password: 'secret2' } },
        password: 'top-level-secret',
      });

      expect(result.redactedPayload.password).toBe('[REDACTED]');

      const userPayload = result.redactedPayload['user'] as Record<string, unknown>;
      expect(userPayload.password).toBe('[REDACTED]');

      const adminPayload = result.redactedPayload['admin'] as Record<string, unknown>;
      const nestedPayload = adminPayload['nested'] as Record<string, unknown>;
      expect(nestedPayload.password).toBe('[REDACTED]');

      expect(result.redactedFields).toHaveLength(3);
    });

    it('supports * wildcard to match a single segment', () => {
      const engine = new RedactionEngine([
        { id: 'r1', name: 'Mask any child token', fieldPathPattern: 'auth.*.token', action: 'mask' },
      ]);
      const result = engine.redact({
        auth: {
          primary: { token: 'tok-1', name: 'main' },
          secondary: { token: 'tok-2', name: 'backup' },
        },
      });

      const primary = (result.redactedPayload['auth'] as Record<string, unknown>)['primary'] as Record<string, unknown>;
      const secondary = (result.redactedPayload['auth'] as Record<string, unknown>)['secondary'] as Record<string, unknown>;
      expect(primary.token).toBe('[REDACTED]');
      expect(primary.name).toBe('main');
      expect(secondary.token).toBe('[REDACTED]');
      expect(result.redactedFields).toHaveLength(2);
    });

    it('uses custom replacement for mask action', () => {
      const engine = new RedactionEngine([
        {
          id: 'r1',
          name: 'Custom mask',
          fieldPathPattern: 'secret',
          action: 'mask',
          replacement: '***',
        },
      ]);
      const result = engine.redact({ secret: 'hello' });
      expect(result.redactedPayload.secret).toBe('***');
    });

    it('removes field entirely with remove action', () => {
      const engine = new RedactionEngine([
        { id: 'r1', name: 'Remove secret', fieldPathPattern: 'secret', action: 'remove' },
      ]);
      const result = engine.redact({ secret: 'hidden', visible: 'shown' });

      expect(result.redactedPayload).toEqual({ visible: 'shown' });
      expect('secret' in result.redactedPayload).toBe(false);
      expect(result.redactedFields).toHaveLength(1);
      expect(result.redactedFields[0]!.action).toBe('remove');
    });

    it('hashes field value with hash action', () => {
      const engine = new RedactionEngine([
        { id: 'r1', name: 'Hash secret', fieldPathPattern: 'secret', action: 'hash' },
      ]);
      const result = engine.redact({ secret: 'my-secret' });

      expect(result.redactedPayload.secret).toBe(sha256('my-secret'));
      expect(result.redactedFields).toHaveLength(1);
      expect(result.redactedFields[0]!.action).toBe('hash');
    });

    it('hashes non-string values as JSON', () => {
      const engine = new RedactionEngine([
        { id: 'r1', name: 'Hash object', fieldPathPattern: 'data', action: 'hash' },
      ]);
      const nested = { a: 1, b: 2 };
      const result = engine.redact({ data: nested });

      expect(result.redactedPayload.data).toBe(sha256(JSON.stringify(nested)));
    });
  });

  // -----------------------------------------------------------------------
  // Value-pattern based redaction
  // -----------------------------------------------------------------------

  describe('value-pattern based redaction', () => {
    it('detects and masks emails in values', () => {
      const engine = new RedactionEngine([
        {
          id: 'r1',
          name: 'Email detection',
          valuePattern: '[a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{2,}',
          action: 'mask',
        },
      ]);
      const result = engine.redact({
        message: 'Contact user@example.com for details',
        count: 42,
      });

      expect(result.redactedPayload.message).toBe('[REDACTED]');
      expect(result.redactedPayload.count).toBe(42);
      expect(result.redactedFields).toHaveLength(1);
    });

    it('detects and masks bearer tokens in values', () => {
      const engine = new RedactionEngine([
        {
          id: 'r1',
          name: 'Bearer token',
          valuePattern: 'Bearer\\s+[A-Za-z0-9\\-._~+/]+=*',
          action: 'mask',
        },
      ]);
      const result = engine.redact({
        header: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0=',
      });

      expect(result.redactedPayload.header).toBe('[REDACTED]');
    });

    it('does not match non-string values for value patterns', () => {
      const engine = new RedactionEngine([
        { id: 'r1', name: 'Email', valuePattern: '@', action: 'mask' },
      ]);
      const result = engine.redact({ count: 42, flag: true, nothing: null });

      expect(result.redactedPayload).toEqual({ count: 42, flag: true, nothing: null });
      expect(result.redactedFields).toHaveLength(0);
    });

    it('detects values inside nested objects', () => {
      const engine = new RedactionEngine([
        {
          id: 'r1',
          name: 'SSN',
          valuePattern: '\\b\\d{3}-\\d{2}-\\d{4}\\b',
          action: 'mask',
        },
      ]);
      const result = engine.redact({
        person: { name: 'Jane', ssn: '123-45-6789' },
      });

      const person = result.redactedPayload['person'] as Record<string, unknown>;
      expect(person.name).toBe('Jane');
      expect(person.ssn).toBe('[REDACTED]');
    });

    it('detects values inside arrays', () => {
      const engine = new RedactionEngine([
        {
          id: 'r1',
          name: 'Email',
          valuePattern: '[a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{2,}',
          action: 'mask',
        },
      ]);
      const result = engine.redact({
        emails: ['user@example.com', 'safe-string', 'admin@test.org'],
      });

      const emails = result.redactedPayload['emails'] as unknown[];
      expect(emails[0]).toBe('[REDACTED]');
      expect(emails[1]).toBe('safe-string');
      expect(emails[2]).toBe('[REDACTED]');
      expect(result.redactedFields).toHaveLength(2);
    });
  });

  // -----------------------------------------------------------------------
  // Combined field-path + value-pattern
  // -----------------------------------------------------------------------

  describe('combined rules', () => {
    it('field-path rules take precedence over value-pattern rules', () => {
      const engine = new RedactionEngine([
        { id: 'path', name: 'Path rule', fieldPathPattern: 'token', action: 'hash' },
        { id: 'value', name: 'Value rule', valuePattern: 'Bearer', action: 'mask' },
      ]);

      const result = engine.redact({ token: 'Bearer abc123' });

      // Path rule matched first, so hash was applied (not mask)
      expect(result.redactedPayload.token).toBe(sha256('Bearer abc123'));
      expect(result.redactedFields).toHaveLength(1);
      expect(result.redactedFields[0]!.ruleId).toBe('path');
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  describe('edge cases', () => {
    it('returns unchanged payload when no rules match', () => {
      const engine = new RedactionEngine([
        { id: 'r1', name: 'Nope', fieldPathPattern: 'nonexistent', action: 'mask' },
      ]);
      const payload = { visible: 'data', count: 1 };
      const result = engine.redact(payload);

      expect(result.redactedPayload).toEqual(payload);
      expect(result.redactedFields).toHaveLength(0);
    });

    it('returns unchanged payload when engine has no rules', () => {
      const engine = new RedactionEngine();
      const payload = { a: 1, b: 'hello' };
      const result = engine.redact(payload);

      expect(result.redactedPayload).toEqual(payload);
      expect(result.redactedFields).toHaveLength(0);
    });

    it('handles empty payload', () => {
      const engine = new RedactionEngine([
        { id: 'r1', name: 'Test', fieldPathPattern: '**.secret', action: 'mask' },
      ]);
      const result = engine.redact({});

      expect(result.redactedPayload).toEqual({});
      expect(result.redactedFields).toHaveLength(0);
    });

    it('does not mutate the original payload', () => {
      const engine = new RedactionEngine([
        { id: 'r1', name: 'Test', fieldPathPattern: 'secret', action: 'mask' },
      ]);
      const original = { secret: 'value', other: 'data' };
      engine.redact(original);

      expect(original.secret).toBe('value');
    });

    it('handles deeply nested objects', () => {
      const engine = new RedactionEngine([
        { id: 'r1', name: 'Deep', fieldPathPattern: '**.apiKey', action: 'mask' },
      ]);
      const result = engine.redact({
        level1: { level2: { level3: { level4: { apiKey: 'deep-secret' } } } },
      });

      const l1 = result.redactedPayload['level1'] as Record<string, unknown>;
      const l2 = l1['level2'] as Record<string, unknown>;
      const l3 = l2['level3'] as Record<string, unknown>;
      const l4 = l3['level4'] as Record<string, unknown>;
      expect(l4.apiKey).toBe('[REDACTED]');
    });

    it('handles arrays of objects', () => {
      const engine = new RedactionEngine([
        { id: 'r1', name: 'Test', fieldPathPattern: '**.password', action: 'mask' },
      ]);
      const result = engine.redact({
        users: [
          { name: 'Alice', password: 'pass1' },
          { name: 'Bob', password: 'pass2' },
        ],
      });

      const users = result.redactedPayload['users'] as Record<string, unknown>[];
      expect(users[0]!.name).toBe('Alice');
      expect(users[0]!.password).toBe('[REDACTED]');
      expect(users[1]!.name).toBe('Bob');
      expect(users[1]!.password).toBe('[REDACTED]');
    });

    it('handles null values gracefully', () => {
      const engine = new RedactionEngine([
        { id: 'r1', name: 'Test', fieldPathPattern: '**.secret', action: 'mask' },
      ]);
      const result = engine.redact({ data: null, nested: { value: null } });

      expect(result.redactedPayload).toEqual({ data: null, nested: { value: null } });
      expect(result.redactedFields).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Built-in rules
  // -----------------------------------------------------------------------

  describe('built-in rules', () => {
    it('redacts common API key field patterns', () => {
      const engine = new RedactionEngine(BUILT_IN_RULES);
      const result = engine.redact({
        config: { apiKey: 'sk-12345' },
        headers: { authorization: 'Bearer token123' },
      });

      const config = result.redactedPayload['config'] as Record<string, unknown>;
      const headers = result.redactedPayload['headers'] as Record<string, unknown>;
      expect(config.apiKey).toBe('[REDACTED]');
      expect(headers.authorization).toBe('[REDACTED]');
      expect(result.redactedFields.length).toBeGreaterThanOrEqual(2);
    });

    it('redacts password and token fields', () => {
      const engine = new RedactionEngine(BUILT_IN_RULES);
      const result = engine.redact({
        auth: { password: 'pass123', token: 'tok-abc' },
      });

      const auth = result.redactedPayload['auth'] as Record<string, unknown>;
      expect(auth.password).toBe('[REDACTED]');
      expect(auth.token).toBe('[REDACTED]');
    });

    it('detects email addresses in string values', () => {
      const engine = new RedactionEngine(BUILT_IN_RULES);
      const result = engine.redact({
        content: 'Please contact admin@company.com for help',
      });

      expect(result.redactedPayload.content).toBe('[REDACTED]');
      expect(result.redactedFields.some((r) => r.ruleId === 'builtin-email-value')).toBe(true);
    });

    it('detects AWS access keys in string values', () => {
      const engine = new RedactionEngine(BUILT_IN_RULES);
      const result = engine.redact({
        log: 'Using key AKIAIOSFODNN7EXAMPLE for auth',
      });

      expect(result.redactedPayload.log).toBe('[REDACTED]');
    });

    it('leaves non-sensitive data untouched', () => {
      const engine = new RedactionEngine(BUILT_IN_RULES);
      const result = engine.redact({
        toolName: 'search',
        query: 'how to deploy',
        count: 5,
        results: ['result1', 'result2'],
      });

      expect(result.redactedPayload).toEqual({
        toolName: 'search',
        query: 'how to deploy',
        count: 5,
        results: ['result1', 'result2'],
      });
      expect(result.redactedFields).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Audit trail
  // -----------------------------------------------------------------------

  describe('audit trail', () => {
    it('records all redactions with fieldPath, ruleId, and action', () => {
      const engine = new RedactionEngine([
        { id: 'rule-1', name: 'Mask secrets', fieldPathPattern: '**.secret', action: 'mask' },
        { id: 'rule-2', name: 'Remove tokens', fieldPathPattern: '**.token', action: 'remove' },
      ]);

      const result = engine.redact({
        auth: { secret: 'hidden', token: 'abc123' },
        other: 'visible',
      });

      expect(result.redactedFields).toHaveLength(2);

      const secretRecord = result.redactedFields.find((r) => r.ruleId === 'rule-1');
      expect(secretRecord).toEqual({
        fieldPath: 'auth.secret',
        ruleId: 'rule-1',
        action: 'mask',
      });

      const tokenRecord = result.redactedFields.find((r) => r.ruleId === 'rule-2');
      expect(tokenRecord).toEqual({
        fieldPath: 'auth.token',
        ruleId: 'rule-2',
        action: 'remove',
      });
    });

    it('returns empty redactedFields when nothing is redacted', () => {
      const engine = new RedactionEngine([
        { id: 'r1', name: 'Test', fieldPathPattern: '**.nonexistent', action: 'mask' },
      ]);
      const result = engine.redact({ safe: 'data' });

      expect(result.redactedFields).toEqual([]);
    });
  });
});
