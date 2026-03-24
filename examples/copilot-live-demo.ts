#!/usr/bin/env tsx
/**
 * Live Copilot Agent Session Demo — Seeds TraceReplay AI with realistic
 * GitHub Copilot agentic development telemetry.
 *
 * This demonstrates two ingestion paths:
 *   Path 1: Raw vendor events → POST /v1/raw-events → BullMQ → Normalizer → DB
 *   Path 2: SDK canonical events → POST /v1/events → Direct DB persist
 *
 * Usage:
 *   npx tsx examples/copilot-live-demo.ts               # default: both paths
 *   npx tsx examples/copilot-live-demo.ts --raw-only     # raw vendor events only
 *   npx tsx examples/copilot-live-demo.ts --sdk-only     # SDK canonical events only
 *
 * Prerequisites: docker compose up (all services running)
 */

import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const INGEST_API = process.env['INGEST_API_URL'] ?? 'http://localhost:3001';
const QUERY_API = process.env['QUERY_API_URL'] ?? 'http://localhost:3002';
const TENANT_ID = 'org-tracereplay-dev';

const mode = process.argv.includes('--raw-only')
  ? 'raw'
  : process.argv.includes('--sdk-only')
    ? 'sdk'
    : 'both';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function post(url: string, body: unknown): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, body: data };
}

async function get(url: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
  const data = await res.json().catch(() => null);
  return { status: res.status, body: data };
}

function ts(offsetMs = 0): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

// ---------------------------------------------------------------------------
// Path 1: Raw Vendor Events (Copilot format → Normalizer)
// ---------------------------------------------------------------------------

async function seedRawCopilotSession(): Promise<void> {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  PATH 1: Raw Copilot Vendor Events → Normalizer Pipeline');
  console.log('═══════════════════════════════════════════════════════════\n');

  const sessionId = randomUUID();
  const baseTime = Date.now();

  const rawEvents = [
    // 1. Session start
    {
      vendor: 'github-copilot',
      tenantId: TENANT_ID,
      data: {
        type: 'copilot.session.start',
        sessionId,
        eventId: randomUUID(),
        timestamp: ts(0),
        agentName: 'copilot-agent',
        payload: {
          sessionName: 'Implement Evidence Service for TraceReplay AI',
          settings: {
            language: 'typescript',
            workspace: 'TraceReplayAI',
            mode: 'agent',
          },
        },
      },
    },

    // 2. Model request — planning phase
    {
      vendor: 'github-copilot',
      tenantId: TENANT_ID,
      data: {
        type: 'copilot.completion.request',
        sessionId,
        eventId: randomUUID(),
        timestamp: ts(1200),
        agentName: 'copilot-agent',
        payload: {
          model: 'claude-sonnet-4-20250514',
          inputTokens: 4200,
          temperature: 0.1,
        },
      },
    },

    // 3. Model response — analysis
    {
      vendor: 'github-copilot',
      tenantId: TENANT_ID,
      data: {
        type: 'copilot.completion.response',
        sessionId,
        eventId: randomUUID(),
        timestamp: ts(4500),
        agentName: 'copilot-agent',
        payload: {
          model: 'claude-sonnet-4-20250514',
          outputTokens: 1850,
          inputTokens: 4200,
          latencyMs: 3300,
        },
      },
    },

    // 4. Tool invocation — read file
    {
      vendor: 'github-copilot',
      tenantId: TENANT_ID,
      data: {
        type: 'copilot.tool.invoke',
        sessionId,
        eventId: randomUUID(),
        timestamp: ts(5000),
        agentName: 'copilot-agent',
        payload: {
          toolName: 'read_file',
          toolId: 'vscode.readFile',
          parameters: {
            filePath: 'services/evidence-service/src/assembler.ts',
            startLine: 1,
            endLine: 50,
          },
        },
      },
    },

    // 5. Tool result — file contents
    {
      vendor: 'github-copilot',
      tenantId: TENANT_ID,
      data: {
        type: 'copilot.tool.result',
        sessionId,
        eventId: randomUUID(),
        timestamp: ts(5300),
        agentName: 'copilot-agent',
        payload: {
          toolName: 'read_file',
          toolId: 'vscode.readFile',
          output: '// Evidence bundle assembler - placeholder',
          durationMs: 300,
        },
      },
    },

    // 6. Tool invocation — semantic search
    {
      vendor: 'github-copilot',
      tenantId: TENANT_ID,
      data: {
        type: 'copilot.tool.invoke',
        sessionId,
        eventId: randomUUID(),
        timestamp: ts(6000),
        agentName: 'copilot-agent',
        payload: {
          toolName: 'semantic_search',
          toolId: 'vscode.semanticSearch',
          parameters: {
            query: 'EvidenceBundle type definition',
          },
        },
      },
    },

    // 7. Tool result — search results
    {
      vendor: 'github-copilot',
      tenantId: TENANT_ID,
      data: {
        type: 'copilot.tool.result',
        sessionId,
        eventId: randomUUID(),
        timestamp: ts(7200),
        agentName: 'copilot-agent',
        payload: {
          toolName: 'semantic_search',
          toolId: 'vscode.semanticSearch',
          output: 'Found 3 relevant results in packages/event-schema/src/types.ts',
          durationMs: 1200,
        },
      },
    },

    // 8. Model request — code generation
    {
      vendor: 'github-copilot',
      tenantId: TENANT_ID,
      data: {
        type: 'copilot.completion.request',
        sessionId,
        eventId: randomUUID(),
        timestamp: ts(8000),
        agentName: 'copilot-agent',
        payload: {
          model: 'claude-sonnet-4-20250514',
          inputTokens: 8500,
          temperature: 0.0,
        },
      },
    },

    // 9. Model response — generated code
    {
      vendor: 'github-copilot',
      tenantId: TENANT_ID,
      data: {
        type: 'copilot.completion.response',
        sessionId,
        eventId: randomUUID(),
        timestamp: ts(14000),
        agentName: 'copilot-agent',
        payload: {
          model: 'claude-sonnet-4-20250514',
          outputTokens: 3200,
          inputTokens: 8500,
          latencyMs: 6000,
        },
      },
    },

    // 10. Tool invocation — create file
    {
      vendor: 'github-copilot',
      tenantId: TENANT_ID,
      data: {
        type: 'copilot.tool.invoke',
        sessionId,
        eventId: randomUUID(),
        timestamp: ts(15000),
        agentName: 'copilot-agent',
        payload: {
          toolName: 'create_file',
          toolId: 'vscode.createFile',
          parameters: {
            filePath: 'services/evidence-service/src/types.ts',
            content: 'export interface EvidenceBundle { ... }',
          },
        },
      },
    },

    // 11. Tool result — file created
    {
      vendor: 'github-copilot',
      tenantId: TENANT_ID,
      data: {
        type: 'copilot.tool.result',
        sessionId,
        eventId: randomUUID(),
        timestamp: ts(15200),
        agentName: 'copilot-agent',
        payload: {
          toolName: 'create_file',
          toolId: 'vscode.createFile',
          output: 'File created successfully',
          durationMs: 200,
        },
      },
    },

    // 12. Tool invocation — run tests
    {
      vendor: 'github-copilot',
      tenantId: TENANT_ID,
      data: {
        type: 'copilot.tool.invoke',
        sessionId,
        eventId: randomUUID(),
        timestamp: ts(20000),
        agentName: 'copilot-agent',
        payload: {
          toolName: 'run_in_terminal',
          toolId: 'vscode.runInTerminal',
          parameters: {
            command: 'pnpm --filter @tracereplay/evidence-service test',
          },
        },
      },
    },

    // 13. Tool result — tests passed
    {
      vendor: 'github-copilot',
      tenantId: TENANT_ID,
      data: {
        type: 'copilot.tool.result',
        sessionId,
        eventId: randomUUID(),
        timestamp: ts(28000),
        agentName: 'copilot-agent',
        payload: {
          toolName: 'run_in_terminal',
          toolId: 'vscode.runInTerminal',
          output: 'Tests Passed: 12/12',
          durationMs: 8000,
        },
      },
    },

    // 14. Message — summary
    {
      vendor: 'github-copilot',
      tenantId: TENANT_ID,
      data: {
        type: 'copilot.message',
        sessionId,
        eventId: randomUUID(),
        timestamp: ts(29000),
        agentName: 'copilot-agent',
        payload: {
          content: 'I\'ve implemented the EvidenceBundle types and assembler service with full test coverage. All 12 tests pass.',
          tokenCount: 45,
          finishReason: 'stop',
          model: 'claude-sonnet-4-20250514',
        },
      },
    },

    // 15. Session end
    {
      vendor: 'github-copilot',
      tenantId: TENANT_ID,
      data: {
        type: 'copilot.session.end',
        sessionId,
        eventId: randomUUID(),
        timestamp: ts(30000),
        agentName: 'copilot-agent',
        payload: {
          status: 'completed',
          durationMs: 30000,
          summary: 'Evidence service implementation complete',
        },
      },
    },
  ];

  console.log(`  Sending ${rawEvents.length} raw Copilot events for session ${sessionId.slice(0, 8)}...`);

  // Send as batch
  const result = await post(`${INGEST_API}/v1/raw-events/batch`, rawEvents);

  if (result.status === 202) {
    console.log(`  ✓ ${rawEvents.length} raw events queued for normalization`);
    const jobs = (result.body as { data?: Array<{ jobId: string }> })?.data;
    if (jobs) {
      console.log(`  ✓ Job IDs: ${jobs.slice(0, 3).map(j => j.jobId.slice(0, 8)).join(', ')}...`);
    }
  } else {
    console.log(`  ✗ Failed (${result.status}):`, JSON.stringify(result.body, null, 2));
  }

  return;
}

// ---------------------------------------------------------------------------
// Path 2: SDK Canonical Events (direct ingest)
// ---------------------------------------------------------------------------

async function seedSdkSession(): Promise<void> {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  PATH 2: SDK Canonical Events → Direct Ingest Pipeline');
  console.log('═══════════════════════════════════════════════════════════\n');

  const runId = randomUUID();
  let seq = 0;

  function makeEvent(type: string, payload: Record<string, unknown>, offsetMs: number) {
    return {
      id: randomUUID(),
      runId,
      type,
      timestamp: ts(offsetMs),
      tenantId: TENANT_ID,
      sourceAgent: 'copilot-agent',
      sourceFramework: 'github-copilot',
      payload,
      schemaVersion: '1.0.0',
      sequence: seq++,
      tags: ['github-copilot', 'live-demo'],
    };
  }

  const events = [
    makeEvent('run.start', {
      runName: 'Copilot: Fix Docker Build Failures',
      triggerSource: 'agent',
      configuration: { language: 'typescript', workspace: 'TraceReplayAI' },
    }, 0),

    makeEvent('prompt.input', {
      content: 'The docker compose build is failing with exit code 17. Help me debug and fix the build.',
      role: 'user',
      tokenCount: 32,
    }, 500),

    makeEvent('model.request', {
      modelProvider: 'github',
      modelId: 'claude-sonnet-4-20250514',
      inputTokens: 6800,
      temperature: 0.0,
    }, 1000),

    makeEvent('model.response', {
      modelProvider: 'github',
      modelId: 'claude-sonnet-4-20250514',
      outputTokens: 2100,
      inputTokens: 6800,
      latencyMs: 4200,
    }, 5200),

    makeEvent('tool.call.start', {
      toolName: 'read_file',
      toolId: 'vscode.readFile',
      inputParameters: { filePath: 'Dockerfile', startLine: 1, endLine: 50 },
    }, 5500),

    makeEvent('tool.call.end', {
      toolName: 'read_file',
      toolId: 'vscode.readFile',
      output: 'FROM node:20-alpine AS base\nWORKDIR /app\nCOPY package.json pnpm-lock.yaml ...',
      durationMs: 150,
      success: true,
    }, 5650),

    makeEvent('tool.call.start', {
      toolName: 'read_file',
      toolId: 'vscode.readFile',
      inputParameters: { filePath: 'docker-compose.yml', startLine: 1, endLine: 80 },
    }, 6000),

    makeEvent('tool.call.end', {
      toolName: 'read_file',
      toolId: 'vscode.readFile',
      output: 'services:\n  postgres:\n    image: postgres:16-alpine\n  ...',
      durationMs: 120,
      success: true,
    }, 6120),

    makeEvent('tool.call.start', {
      toolName: 'run_in_terminal',
      toolId: 'vscode.terminal',
      inputParameters: { command: 'docker compose build --no-cache 2>&1 | tail -50' },
    }, 7000),

    makeEvent('tool.call.end', {
      toolName: 'run_in_terminal',
      toolId: 'vscode.terminal',
      output: 'Error: services/ingest-api/src/routes/raw-events.ts - Cannot find module bullmq',
      durationMs: 15000,
      success: false,
    }, 22000),

    makeEvent('model.request', {
      modelProvider: 'github',
      modelId: 'claude-sonnet-4-20250514',
      inputTokens: 12400,
      temperature: 0.0,
    }, 22500),

    makeEvent('model.response', {
      modelProvider: 'github',
      modelId: 'claude-sonnet-4-20250514',
      outputTokens: 850,
      inputTokens: 12400,
      latencyMs: 2800,
    }, 25300),

    makeEvent('tool.call.start', {
      toolName: 'replace_string_in_file',
      toolId: 'vscode.editFile',
      inputParameters: {
        filePath: 'services/ingest-api/package.json',
        oldString: '"fastify": "^5.0.0"',
        newString: '"bullmq": "^5.0.0",\n    "fastify": "^5.0.0"',
      },
    }, 26000),

    makeEvent('tool.call.end', {
      toolName: 'replace_string_in_file',
      toolId: 'vscode.editFile',
      output: 'File edited successfully',
      durationMs: 100,
      success: true,
    }, 26100),

    makeEvent('tool.call.start', {
      toolName: 'run_in_terminal',
      toolId: 'vscode.terminal',
      inputParameters: { command: 'pnpm install' },
    }, 27000),

    makeEvent('tool.call.end', {
      toolName: 'run_in_terminal',
      toolId: 'vscode.terminal',
      output: 'Done in 8.2s\nPackages: +12',
      durationMs: 8200,
      success: true,
    }, 35200),

    makeEvent('tool.call.start', {
      toolName: 'run_in_terminal',
      toolId: 'vscode.terminal',
      inputParameters: { command: 'docker compose build --no-cache' },
    }, 36000),

    makeEvent('tool.call.end', {
      toolName: 'run_in_terminal',
      toolId: 'vscode.terminal',
      output: 'Successfully built all 5 service images',
      durationMs: 45000,
      success: true,
    }, 81000),

    makeEvent('prompt.output', {
      content: 'The Docker build failure was caused by a missing `bullmq` dependency in the ingest-api package. I\'ve added it to package.json and rebuilt successfully. All 5 service images are now built.',
      tokenCount: 62,
      finishReason: 'stop',
      modelId: 'claude-sonnet-4-20250514',
    }, 82000),

    makeEvent('run.end', {
      status: 'success',
      durationMs: 83000,
      summary: 'Fixed Docker build by adding missing bullmq dependency to ingest-api',
    }, 83000),
  ];

  console.log(`  Sending ${events.length} canonical events for run ${runId.slice(0, 8)}...`);

  // Send as batch
  const result = await post(`${INGEST_API}/v1/events/batch`, events);

  if (result.status === 201) {
    console.log(`  ✓ ${events.length} canonical events ingested directly`);
  } else {
    console.log(`  ✗ Failed (${result.status}):`, JSON.stringify(result.body, null, 2));
  }

  // --- Second SDK session: a multi-tool investigation run ---

  const runId2 = randomUUID();
  seq = 0;

  function makeEvent2(type: string, payload: Record<string, unknown>, offsetMs: number) {
    return {
      id: randomUUID(),
      runId: runId2,
      type,
      timestamp: ts(offsetMs),
      tenantId: TENANT_ID,
      sourceAgent: 'copilot-agent',
      sourceFramework: 'github-copilot',
      payload,
      schemaVersion: '1.0.0',
      sequence: seq++,
      tags: ['github-copilot', 'live-demo', 'investigation'],
    };
  }

  const events2 = [
    makeEvent2('run.start', {
      runName: 'Copilot: Add Search Pagination to Run List',
      triggerSource: 'agent',
      configuration: { language: 'typescript', workspace: 'TraceReplayAI', mode: 'agent' },
    }, 0),

    makeEvent2('prompt.input', {
      content: 'Add search pagination with infinite scroll to the runs list page. Use cursor-based pagination.',
      role: 'user',
      tokenCount: 28,
    }, 300),

    makeEvent2('model.request', {
      modelProvider: 'github',
      modelId: 'claude-sonnet-4-20250514',
      inputTokens: 5400,
      temperature: 0.1,
    }, 800),

    makeEvent2('model.response', {
      modelProvider: 'github',
      modelId: 'claude-sonnet-4-20250514',
      outputTokens: 1600,
      inputTokens: 5400,
      latencyMs: 3500,
    }, 4300),

    makeEvent2('tool.call.start', {
      toolName: 'semantic_search',
      toolId: 'vscode.semanticSearch',
      inputParameters: { query: 'cursor based pagination runs list' },
    }, 4800),

    makeEvent2('tool.call.end', {
      toolName: 'semantic_search',
      toolId: 'vscode.semanticSearch',
      output: 'Found: apps/web/src/app/runs/page.tsx, services/query-service/src/routes/runs.ts',
      durationMs: 900,
      success: true,
    }, 5700),

    makeEvent2('tool.call.start', {
      toolName: 'read_file',
      toolId: 'vscode.readFile',
      inputParameters: { filePath: 'apps/web/src/app/runs/page.tsx' },
    }, 6000),

    makeEvent2('tool.call.end', {
      toolName: 'read_file',
      toolId: 'vscode.readFile',
      output: 'export default function RunsPage() { ... useInfiniteQuery ... }',
      durationMs: 200,
      success: true,
    }, 6200),

    makeEvent2('tool.call.start', {
      toolName: 'read_file',
      toolId: 'vscode.readFile',
      inputParameters: { filePath: 'services/query-service/src/routes/runs.ts' },
    }, 6500),

    makeEvent2('tool.call.end', {
      toolName: 'read_file',
      toolId: 'vscode.readFile',
      output: 'app.get(\'/runs\', async (request, reply) => { ... cursor ... })',
      durationMs: 180,
      success: true,
    }, 6680),

    makeEvent2('model.request', {
      modelProvider: 'github',
      modelId: 'claude-sonnet-4-20250514',
      inputTokens: 14200,
      temperature: 0.0,
    }, 7000),

    makeEvent2('model.response', {
      modelProvider: 'github',
      modelId: 'claude-sonnet-4-20250514',
      outputTokens: 4800,
      inputTokens: 14200,
      latencyMs: 8200,
    }, 15200),

    makeEvent2('tool.call.start', {
      toolName: 'replace_string_in_file',
      toolId: 'vscode.editFile',
      inputParameters: { filePath: 'apps/web/src/app/runs/page.tsx' },
    }, 16000),

    makeEvent2('tool.call.end', {
      toolName: 'replace_string_in_file',
      toolId: 'vscode.editFile',
      output: 'File edited successfully - added IntersectionObserver for infinite scroll',
      durationMs: 150,
      success: true,
    }, 16150),

    makeEvent2('tool.call.start', {
      toolName: 'run_in_terminal',
      toolId: 'vscode.terminal',
      inputParameters: { command: 'pnpm --filter @tracereplay/web test' },
    }, 17000),

    makeEvent2('tool.call.end', {
      toolName: 'run_in_terminal',
      toolId: 'vscode.terminal',
      output: 'Tests: 8 passed, 0 failed',
      durationMs: 6000,
      success: true,
    }, 23000),

    makeEvent2('prompt.output', {
      content: 'Search pagination with infinite scroll is now implemented. Uses cursor-based pagination with IntersectionObserver for the scroll trigger. All 8 tests passing.',
      tokenCount: 48,
      finishReason: 'stop',
      modelId: 'claude-sonnet-4-20250514',
    }, 24000),

    makeEvent2('run.end', {
      status: 'success',
      durationMs: 25000,
      summary: 'Added cursor-based pagination with infinite scroll to runs list page',
    }, 25000),
  ];

  console.log(`  Sending ${events2.length} canonical events for run ${runId2.slice(0, 8)}...`);

  const result2 = await post(`${INGEST_API}/v1/events/batch`, events2);

  if (result2.status === 201) {
    console.log(`  ✓ ${events2.length} canonical events ingested directly`);
  } else {
    console.log(`  ✗ Failed (${result2.status}):`, JSON.stringify(result2.body, null, 2));
  }
}

// ---------------------------------------------------------------------------
// Verification: query the data back
// ---------------------------------------------------------------------------

async function verifyPipeline(): Promise<void> {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  VERIFICATION: Querying data via query-service');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Wait for normalizer to process
  if (mode !== 'sdk') {
    console.log('  ⏳ Waiting 5s for normalizer to process raw events...');
    await delay(5000);
  }

  // List runs
  const runsResult = await get(`${QUERY_API}/v1/runs?limit=10`);

  if (runsResult.status === 200) {
    const data = runsResult.body as {
      data?: Array<{
        id: string;
        agentId?: string;
        runName?: string;
        status?: string;
        eventCount?: number;
      }>;
    };
    const runs = data?.data ?? [];
    console.log(`  ✓ Found ${runs.length} run(s) in query-service:\n`);

    for (const run of runs) {
      console.log(`    Run: ${(run.id ?? '').slice(0, 8)}...`);
      console.log(`      Agent:  ${run.agentId ?? 'unknown'}`);
      console.log(`      Name:   ${run.runName ?? '(unnamed)'}`);
      console.log(`      Status: ${run.status ?? 'unknown'}`);
      console.log(`      Events: ${run.eventCount ?? '?'}`);
      console.log();
    }

    // Get timeline for first run
    if (runs.length > 0) {
      const firstRun = runs[0];
      const timelineResult = await get(`${QUERY_API}/v1/runs/${firstRun.id}/timeline`);

      if (timelineResult.status === 200) {
        const tlData = timelineResult.body as {
          data?: { entries?: Array<{ event: { type: string; timestamp: string } }> };
        };
        const entries = tlData?.data?.entries ?? [];
        console.log(`  ✓ Timeline for run ${(firstRun.id ?? '').slice(0, 8)}: ${entries.length} events`);
        for (const entry of entries.slice(0, 5)) {
          console.log(`    • ${entry.event.type} @ ${entry.event.timestamp}`);
        }
        if (entries.length > 5) {
          console.log(`    ... and ${entries.length - 5} more`);
        }
      }
    }
  } else {
    console.log(`  ✗ Query service returned ${runsResult.status}:`, JSON.stringify(runsResult.body, null, 2));
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('\n╔═════════════════════════════════════════════════════════════╗');
  console.log('║  TraceReplay AI — Live Copilot Agent Session Demo          ║');
  console.log('║  Seeding realistic GitHub Copilot agentic telemetry        ║');
  console.log('╠═════════════════════════════════════════════════════════════╣');
  console.log(`║  Mode:       ${mode.padEnd(44)}║`);
  console.log(`║  Ingest API: ${INGEST_API.padEnd(44)}║`);
  console.log(`║  Query API:  ${QUERY_API.padEnd(44)}║`);
  console.log(`║  Tenant:     ${TENANT_ID.padEnd(44)}║`);
  console.log('╚═════════════════════════════════════════════════════════════╝');

  // Health check
  try {
    const health = await get(`${INGEST_API}/healthz`);
    if (health.status !== 200) throw new Error(`Status ${health.status}`);
    console.log('\n  ✓ Ingest API is healthy');
  } catch (err) {
    console.error(`\n  ✗ Ingest API unreachable at ${INGEST_API}. Is docker compose up?`);
    process.exit(1);
  }

  try {
    const health = await get(`${QUERY_API}/healthz`);
    if (health.status !== 200) throw new Error(`Status ${health.status}`);
    console.log('  ✓ Query service is healthy');
  } catch (err) {
    console.error(`  ✗ Query service unreachable at ${QUERY_API}. Is docker compose up?`);
    process.exit(1);
  }

  if (mode === 'raw' || mode === 'both') {
    await seedRawCopilotSession();
  }

  if (mode === 'sdk' || mode === 'both') {
    await seedSdkSession();
  }

  await verifyPipeline();

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  🎯 Open the Investigation UI at http://localhost:3000');
  console.log('     Navigate to /runs to see your Copilot agent sessions');
  console.log('═══════════════════════════════════════════════════════════\n');
}

main().catch((err) => {
  console.error('Demo failed:', err);
  process.exit(1);
});
