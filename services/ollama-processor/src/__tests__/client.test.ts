import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OllamaClient } from '../client.js';

// ---------------------------------------------------------------------------
// OllamaClient unit tests
// ---------------------------------------------------------------------------

describe('OllamaClient', () => {
  let client: OllamaClient;

  beforeEach(() => {
    client = new OllamaClient({
      baseUrl: 'http://localhost:11434',
      model: 'deepseek-r1:14b',
      timeoutMs: 5000,
    });
  });

  describe('isAvailable', () => {
    it('returns true when Ollama responds with 200', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ models: [] }), { status: 200 }),
      );

      expect(await client.isAvailable()).toBe(true);
    });

    it('returns false when Ollama responds with error', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('Internal Server Error', { status: 500 }),
      );

      expect(await client.isAvailable()).toBe(false);
    });

    it('returns false when fetch throws (network error)', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(
        new Error('Connection refused'),
      );

      expect(await client.isAvailable()).toBe(false);
    });
  });

  describe('generate', () => {
    it('sends correct request body and returns response', async () => {
      const mockResponse = {
        model: 'deepseek-r1:14b',
        response: '{"summary":"test"}',
        done: true,
        total_duration: 1234,
        prompt_eval_count: 50,
        eval_count: 20,
      };

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), { status: 200 }),
      );

      const result = await client.generate('test prompt');

      expect(result).toEqual(mockResponse);
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:11434/api/generate',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'deepseek-r1:14b',
            prompt: 'test prompt',
            stream: false,
            options: { temperature: 0.3, num_predict: 2048 },
          }),
        }),
      );
    });

    it('returns null when Ollama responds with error', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('Model not found', { status: 404 }),
      );

      expect(await client.generate('test')).toBeNull();
    });

    it('returns null when fetch throws', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(
        new Error('Connection refused'),
      );

      expect(await client.generate('test')).toBeNull();
    });
  });

  describe('getModel', () => {
    it('returns configured model name', () => {
      expect(client.getModel()).toBe('deepseek-r1:14b');
    });
  });
});
