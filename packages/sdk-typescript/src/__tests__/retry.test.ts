import { describe, it, expect } from 'vitest';
import { isRetryableStatus, isRetryableError, calculateDelay } from '../retry.js';

describe('isRetryableStatus', () => {
  it('returns true for 500-series status codes', () => {
    expect(isRetryableStatus(500)).toBe(true);
    expect(isRetryableStatus(502)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(504)).toBe(true);
  });

  it('returns true for 429 Too Many Requests', () => {
    expect(isRetryableStatus(429)).toBe(true);
  });

  it('returns false for client errors', () => {
    expect(isRetryableStatus(400)).toBe(false);
    expect(isRetryableStatus(401)).toBe(false);
    expect(isRetryableStatus(404)).toBe(false);
  });

  it('returns false for success status codes', () => {
    expect(isRetryableStatus(200)).toBe(false);
    expect(isRetryableStatus(201)).toBe(false);
  });
});

describe('isRetryableError', () => {
  it('returns true for network-related errors', () => {
    expect(isRetryableError(new Error('fetch failed'))).toBe(true);
    expect(isRetryableError(new Error('network error'))).toBe(true);
    expect(isRetryableError(new Error('ECONNREFUSED'))).toBe(true);
    expect(isRetryableError(new Error('ECONNRESET'))).toBe(true);
    expect(isRetryableError(new Error('socket hang up'))).toBe(true);
    expect(isRetryableError(new Error('request timeout'))).toBe(true);
  });

  it('returns false for non-network errors', () => {
    expect(isRetryableError(new Error('validation failed'))).toBe(false);
    expect(isRetryableError(new Error('invalid JSON'))).toBe(false);
  });

  it('returns false for non-Error values', () => {
    expect(isRetryableError('string error')).toBe(false);
    expect(isRetryableError(null)).toBe(false);
    expect(isRetryableError(undefined)).toBe(false);
    expect(isRetryableError(42)).toBe(false);
  });
});

describe('calculateDelay', () => {
  it('returns a value within expected range for attempt 0', () => {
    const config = { maxRetries: 3, baseDelayMs: 500, maxDelayMs: 30_000 };
    // attempt 0: base * 2^0 = 500, jitter = 250..500
    const delay = calculateDelay(0, config);
    expect(delay).toBeGreaterThanOrEqual(250);
    expect(delay).toBeLessThanOrEqual(500);
  });

  it('increases delay for later attempts', () => {
    const config = { maxRetries: 3, baseDelayMs: 500, maxDelayMs: 30_000 };
    // attempt 2: base * 2^2 = 2000, jitter = 1000..2000
    const delay = calculateDelay(2, config);
    expect(delay).toBeGreaterThanOrEqual(1000);
    expect(delay).toBeLessThanOrEqual(2000);
  });

  it('caps delay at maxDelayMs', () => {
    const config = { maxRetries: 10, baseDelayMs: 500, maxDelayMs: 5_000 };
    // attempt 10: base * 2^10 = 512000, capped to 5000, jitter = 2500..5000
    const delay = calculateDelay(10, config);
    expect(delay).toBeGreaterThanOrEqual(2500);
    expect(delay).toBeLessThanOrEqual(5000);
  });
});
