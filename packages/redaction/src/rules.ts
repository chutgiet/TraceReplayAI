import type { RedactionRule } from './types.js';

// ---------------------------------------------------------------------------
// Built-in PII / sensitive-data detection rules
// ---------------------------------------------------------------------------

/**
 * Default rules for detecting and redacting common PII and sensitive fields.
 * These use a combination of field-path patterns and value regex patterns.
 */
export const BUILT_IN_RULES: readonly RedactionRule[] = [
  // --- Field-path based rules ---
  {
    id: 'builtin-api-key-field',
    name: 'API key fields',
    fieldPathPattern: '**.apiKey',
    action: 'mask',
  },
  {
    id: 'builtin-api-key-field-2',
    name: 'API key fields (snake_case)',
    fieldPathPattern: '**.api_key',
    action: 'mask',
  },
  {
    id: 'builtin-secret-field',
    name: 'Secret fields',
    fieldPathPattern: '**.secret',
    action: 'mask',
  },
  {
    id: 'builtin-password-field',
    name: 'Password fields',
    fieldPathPattern: '**.password',
    action: 'mask',
  },
  {
    id: 'builtin-token-field',
    name: 'Token fields',
    fieldPathPattern: '**.token',
    action: 'mask',
  },
  {
    id: 'builtin-auth-header',
    name: 'Authorization headers',
    fieldPathPattern: '**.authorization',
    action: 'mask',
  },
  {
    id: 'builtin-access-token',
    name: 'Access token fields',
    fieldPathPattern: '**.accessToken',
    action: 'mask',
  },
  {
    id: 'builtin-access-token-2',
    name: 'Access token fields (snake_case)',
    fieldPathPattern: '**.access_token',
    action: 'mask',
  },

  // --- Value-pattern based rules (applied to string values) ---
  {
    id: 'builtin-email-value',
    name: 'Email addresses in values',
    valuePattern: '[a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{2,}',
    action: 'mask',
  },
  {
    id: 'builtin-bearer-token-value',
    name: 'Bearer tokens in values',
    valuePattern: 'Bearer\\s+[A-Za-z0-9\\-._~+/]+=*',
    action: 'mask',
  },
  {
    id: 'builtin-aws-key-value',
    name: 'AWS access key IDs in values',
    valuePattern: 'AKIA[0-9A-Z]{16}',
    action: 'mask',
  },
  {
    id: 'builtin-ssn-value',
    name: 'US Social Security numbers in values',
    valuePattern: '\\b\\d{3}-\\d{2}-\\d{4}\\b',
    action: 'mask',
  },
] as const;
