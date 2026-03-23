/**
 * API client for communicating with the query-service backend.
 *
 * All requests go through Next.js rewrites (/api/v1/* → query-service /v1/*).
 */

const API_BASE = '/api/v1';

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
  requestId: string;
}

export interface ApiResponse<T> {
  data: T;
  meta: {
    requestId: string;
    nextCursor?: string | null;
    count?: number;
  };
}

export interface ApiErrorResponse {
  error: ApiError;
}

class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly apiError: ApiError,
  ) {
    super(apiError.message);
    this.name = 'ApiClientError';
  }
}

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<ApiResponse<T>> {
  const url = `${API_BASE}${path}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = (await response.json()) as ApiErrorResponse;
    throw new ApiClientError(response.status, body.error);
  }

  return response.json() as Promise<ApiResponse<T>>;
}

// ---------------------------------------------------------------------------
// Run types (mirroring query-service responses)
// ---------------------------------------------------------------------------

export interface Run {
  id: string;
  tenantId: string;
  agentId: string;
  runName: string | null;
  triggerSource: string | null;
  parentRunId: string | null;
  status: 'running' | 'success' | 'failure' | 'timeout' | 'cancelled';
  startedAt: string;
  endedAt: string | null;
  tags: Record<string, string>;
  metadata: Record<string, unknown>;
  schemaVersion: string;
  createdAt: string;
  updatedAt: string;
}

export interface RunListParams {
  status?: string;
  agentId?: string;
  startedAfter?: string;
  startedBefore?: string;
  cursor?: string;
  limit?: number;
}

export interface RunEvent {
  id: string;
  runId: string;
  tenantId: string;
  type: string;
  sequence: number | null;
  parentEventId: string | null;
  sourceAgent: string;
  sourceFramework: string | null;
  payload: Record<string, unknown>;
  rawMeta: Record<string, unknown> | null;
  tags: Record<string, string>;
  schemaVersion: string;
  timestamp: string;
  receivedAt: string;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export async function fetchRuns(params?: RunListParams) {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set('status', params.status);
  if (params?.agentId) searchParams.set('agentId', params.agentId);
  if (params?.startedAfter)
    searchParams.set('startedAfter', params.startedAfter);
  if (params?.startedBefore)
    searchParams.set('startedBefore', params.startedBefore);
  if (params?.cursor) searchParams.set('cursor', params.cursor);
  if (params?.limit) searchParams.set('limit', String(params.limit));

  const qs = searchParams.toString();
  return request<Run[]>(`/runs${qs ? `?${qs}` : ''}`);
}

export async function fetchRun(runId: string) {
  return request<{ run: Run; summary: { eventCount: number; durationMs: number | null; status: string } }>(`/runs/${encodeURIComponent(runId)}`);
}

export async function fetchRunEvents(runId: string) {
  return request<RunEvent[]>(`/runs/${encodeURIComponent(runId)}/events`);
}

export async function fetchRunTimeline(runId: string) {
  return request<unknown>(`/runs/${encodeURIComponent(runId)}/timeline`);
}

export { ApiClientError };
