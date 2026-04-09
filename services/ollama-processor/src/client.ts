// ---------------------------------------------------------------------------
// Ollama HTTP API client
// ---------------------------------------------------------------------------

export interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  stream?: boolean;
  options?: {
    temperature?: number;
    num_predict?: number;
  };
}

export interface OllamaGenerateResponse {
  model: string;
  response: string;
  done: boolean;
  total_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}

export interface OllamaClientOptions {
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

export class OllamaClient {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(options: OllamaClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.model = options.model;
    this.timeoutMs = options.timeoutMs;
  }

  /**
   * Check if Ollama is reachable and the model is available.
   * Returns true if the API responds, false otherwise.
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Send a prompt to Ollama and return the generated response text.
   * Returns null if Ollama is unreachable or the request fails.
   */
  async generate(prompt: string): Promise<OllamaGenerateResponse | null> {
    const body: OllamaGenerateRequest = {
      model: this.model,
      prompt,
      stream: false,
      options: {
        temperature: 0.3,
        num_predict: 2048,
      },
    };

    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        return null;
      }

      return (await response.json()) as OllamaGenerateResponse;
    } catch {
      return null;
    }
  }

  getModel(): string {
    return this.model;
  }
}
