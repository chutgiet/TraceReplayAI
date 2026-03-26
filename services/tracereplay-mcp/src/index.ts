#!/usr/bin/env node
/**
 * TraceReplay MCP Server
 *
 * An instrumented MCP server that both GitHub Copilot and OpenAI Codex can
 * connect to. Every tool invocation auto-emits telemetry to the TraceReplay
 * ingest API, giving you audit-grade capture of real development sessions.
 *
 * Transport: stdio (default for VS Code MCP) or SSE (for Docker/network).
 * Config:
 *   INGEST_API_URL  — TraceReplay ingest endpoint (default: http://localhost:3001)
 *   TENANT_ID       — Tenant identifier (default: org-tracereplay-dev)
 *   TRANSPORT       — "stdio" | "sse" (default: stdio)
 *   SSE_PORT        — Port for SSE transport (default: 3005)
 *   WORKSPACE_DIR   — Root workspace directory for file/search operations
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { createServer } from 'node:http';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const INGEST_API_URL = process.env['INGEST_API_URL'] ?? 'http://localhost:3001';
const TENANT_ID = process.env['TENANT_ID'] ?? 'org-tracereplay-dev';
const TRANSPORT = process.env['TRANSPORT'] ?? 'stdio';
const SSE_PORT = parseInt(process.env['SSE_PORT'] ?? '3005', 10);
const WORKSPACE_DIR = process.env['WORKSPACE_DIR'] ?? process.cwd();

// Session tracking
let sessionId: string = randomUUID();
let sessionVendor: string = 'tracereplay-mcp';
let sequenceCounter = 0;

// ---------------------------------------------------------------------------
// Telemetry emission — sends raw events to TraceReplay ingest API
// ---------------------------------------------------------------------------

async function emitEvent(
  type: string,
  data: Record<string, unknown>,
): Promise<void> {
  const event = {
    vendor: sessionVendor,
    tenantId: TENANT_ID,
    runId: sessionId,
    data: {
      type,
      sessionId,
      eventId: randomUUID(),
      timestamp: new Date().toISOString(),
      sequence: ++sequenceCounter,
      agentName: sessionVendor,
      data,
    },
  };

  try {
    await fetch(`${INGEST_API_URL}/v1/raw-events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Telemetry emission is best-effort — never block tool execution
    process.stderr.write(
      `[tracereplay-mcp] Failed to emit event: ${type}\n`,
    );
  }
}

async function emitToolStart(
  toolName: string,
  inputParameters: Record<string, unknown>,
): Promise<string> {
  const toolCallId = randomUUID();
  await emitEvent('copilot.tool.invoke', {
    toolName,
    toolId: toolCallId,
    parameters: inputParameters,
  });
  return toolCallId;
}

async function emitToolEnd(
  toolName: string,
  toolCallId: string,
  output: unknown,
  durationMs: number,
  success: boolean,
): Promise<void> {
  await emitEvent(success ? 'copilot.tool.result' : 'copilot.tool.error', {
    toolName,
    toolId: toolCallId,
    output: typeof output === 'string' ? output.slice(0, 2000) : output,
    durationMs,
    ...(success ? {} : { errorMessage: String(output) }),
  });
}

async function emitSideEffect(
  effectType: string,
  targetSystem: string,
  description: string,
  reversible: boolean,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await emitEvent('copilot.side_effect', {
    effectType,
    targetSystem,
    description,
    reversible,
    metadata,
  });
}

// ---------------------------------------------------------------------------
// Path safety — prevent directory traversal
// ---------------------------------------------------------------------------

function safePath(filePath: string): string {
  const resolved = isAbsolute(filePath)
    ? resolve(filePath)
    : resolve(WORKSPACE_DIR, filePath);
  const rel = relative(WORKSPACE_DIR, resolved);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(
      `Path "${filePath}" is outside the workspace directory`,
    );
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// Tool wrapper — instruments any tool with telemetry
// ---------------------------------------------------------------------------

async function instrumentedTool<T>(
  toolName: string,
  params: Record<string, unknown>,
  fn: () => Promise<T>,
): Promise<T> {
  const start = Date.now();
  const toolCallId = await emitToolStart(toolName, params);
  try {
    const result = await fn();
    await emitToolEnd(toolName, toolCallId, result, Date.now() - start, true);
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await emitToolEnd(toolName, toolCallId, msg, Date.now() - start, false);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// MCP Server setup
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'tracereplay',
  version: '0.1.0',
});

// ---------------------------------------------------------------------------
// Tool: tracereplay.list_files
// ---------------------------------------------------------------------------

server.tool(
  'tracereplay_list_files',
  'List files and directories in the workspace. Use glob-like path patterns.',
  {
    path: z.string().describe('Relative path from workspace root. Use "." for root.'),
    recursive: z.boolean().optional().describe('List recursively. Default: false.'),
  },
  async ({ path: dirPath, recursive }) => {
    const result = await instrumentedTool(
      'tracereplay.list_files',
      { path: dirPath, recursive },
      async () => {
        const fullPath = safePath(dirPath);
        const entries = await readdir(fullPath, {
          withFileTypes: true,
          recursive: recursive ?? false,
        });
        return entries.map((e) => ({
          name: e.name,
          type: e.isDirectory() ? 'directory' : 'file',
          path: relative(WORKSPACE_DIR, join(e.parentPath ?? fullPath, e.name)),
        }));
      },
    );
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    };
  },
);

// ---------------------------------------------------------------------------
// Tool: tracereplay.read_file
// ---------------------------------------------------------------------------

server.tool(
  'tracereplay_read_file',
  'Read the contents of a file in the workspace.',
  {
    path: z.string().describe('Relative path to file from workspace root.'),
    startLine: z.number().optional().describe('1-based start line (inclusive).'),
    endLine: z.number().optional().describe('1-based end line (inclusive).'),
  },
  async ({ path: filePath, startLine, endLine }) => {
    const result = await instrumentedTool(
      'tracereplay.read_file',
      { path: filePath, startLine, endLine },
      async () => {
        const fullPath = safePath(filePath);
        const content = await readFile(fullPath, 'utf-8');
        if (startLine || endLine) {
          const lines = content.split('\n');
          const start = (startLine ?? 1) - 1;
          const end = endLine ?? lines.length;
          return lines.slice(start, end).join('\n');
        }
        return content;
      },
    );
    return {
      content: [{ type: 'text' as const, text: result }],
    };
  },
);

// ---------------------------------------------------------------------------
// Tool: tracereplay.search_code
// ---------------------------------------------------------------------------

server.tool(
  'tracereplay_search_code',
  'Search for text or regex patterns across workspace files.',
  {
    query: z.string().describe('Search pattern (text or regex).'),
    isRegex: z.boolean().optional().describe('Treat query as regex. Default: false.'),
    includePattern: z.string().optional().describe('Glob pattern to filter files.'),
    maxResults: z.number().optional().describe('Max results to return. Default: 50.'),
  },
  async ({ query, isRegex, includePattern, maxResults }) => {
    const result = await instrumentedTool(
      'tracereplay.search_code',
      { query, isRegex, includePattern, maxResults },
      async () => {
        const limit = maxResults ?? 50;
        // Use git grep for fast search within workspace
        try {
          const cmd = `git grep -n -I ${isRegex ? '-E' : '-F'} ${JSON.stringify(query)} -- ${includePattern ? JSON.stringify(includePattern) : '.'} | head -${limit}`;
          const output = execSync(cmd, {
            cwd: WORKSPACE_DIR,
            encoding: 'utf-8',
            timeout: 10000,
            maxBuffer: 1024 * 1024,
          });
          return output.trim().split('\n').filter(Boolean).map((line) => {
            const [file, ...rest] = line.split(':');
            const lineNum = rest[0];
            const text = rest.slice(1).join(':');
            return { file, line: parseInt(lineNum ?? '0', 10), text: text.trim() };
          });
        } catch {
          // git grep returns exit code 1 for no matches
          return [];
        }
      },
    );
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    };
  },
);

// ---------------------------------------------------------------------------
// Tool: tracereplay.apply_patch
// ---------------------------------------------------------------------------

server.tool(
  'tracereplay_apply_patch',
  'Apply a text replacement to a file. Replaces one exact occurrence of oldText with newText.',
  {
    path: z.string().describe('Relative path to the file.'),
    oldText: z.string().describe('Exact text to find and replace (one occurrence).'),
    newText: z.string().describe('Replacement text.'),
  },
  async ({ path: filePath, oldText, newText }) => {
    const result = await instrumentedTool(
      'tracereplay.apply_patch',
      { path: filePath, oldTextLength: oldText.length, newTextLength: newText.length },
      async () => {
        const fullPath = safePath(filePath);
        const content = await readFile(fullPath, 'utf-8');
        const idx = content.indexOf(oldText);
        if (idx === -1) {
          throw new Error(`Old text not found in ${filePath}`);
        }
        if (content.indexOf(oldText, idx + 1) !== -1) {
          throw new Error(`Old text matches multiple locations in ${filePath}`);
        }
        const updated = content.slice(0, idx) + newText + content.slice(idx + oldText.length);
        await writeFile(fullPath, updated, 'utf-8');
        return { applied: true, path: filePath };
      },
    );
    await emitSideEffect('file_write', 'filesystem', `Applied patch to ${filePath}`, true, {
      path: filePath,
    });
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result) }],
    };
  },
);

// ---------------------------------------------------------------------------
// Tool: tracereplay.run_command
// ---------------------------------------------------------------------------

server.tool(
  'tracereplay_run_command',
  'Run a shell command in the workspace directory. Returns stdout/stderr.',
  {
    command: z.string().describe('Shell command to execute.'),
    timeoutMs: z.number().optional().describe('Timeout in milliseconds. Default: 30000.'),
  },
  async ({ command, timeoutMs }) => {
    const result = await instrumentedTool(
      'tracereplay.run_command',
      { command, timeoutMs },
      async () => {
        const timeout = timeoutMs ?? 30000;
        try {
          const stdout = execSync(command, {
            cwd: WORKSPACE_DIR,
            encoding: 'utf-8',
            timeout,
            maxBuffer: 5 * 1024 * 1024,
          });
          return { exitCode: 0, stdout: stdout.slice(0, 10000) };
        } catch (err: unknown) {
          const e = err as { status?: number; stdout?: string; stderr?: string; message?: string };
          return {
            exitCode: e.status ?? 1,
            stdout: (e.stdout ?? '').slice(0, 5000),
            stderr: (e.stderr ?? '').slice(0, 5000),
          };
        }
      },
    );
    await emitSideEffect('shell_command', 'terminal', `Executed: ${command.slice(0, 100)}`, false, {
      command,
    });
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    };
  },
);

// ---------------------------------------------------------------------------
// Tool: tracereplay.git_status
// ---------------------------------------------------------------------------

server.tool(
  'tracereplay_git_status',
  'Get the current git status of the workspace.',
  {},
  async () => {
    const result = await instrumentedTool(
      'tracereplay.git_status',
      {},
      async () => {
        const status = execSync('git status --porcelain', {
          cwd: WORKSPACE_DIR,
          encoding: 'utf-8',
          timeout: 10000,
        });
        const branch = execSync('git rev-parse --abbrev-ref HEAD', {
          cwd: WORKSPACE_DIR,
          encoding: 'utf-8',
          timeout: 5000,
        }).trim();
        return {
          branch,
          files: status.trim().split('\n').filter(Boolean).map((line) => ({
            status: line.slice(0, 2).trim(),
            path: line.slice(3),
          })),
        };
      },
    );
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    };
  },
);

// ---------------------------------------------------------------------------
// Tool: tracereplay.git_diff
// ---------------------------------------------------------------------------

server.tool(
  'tracereplay_git_diff',
  'Get git diff for the workspace or a specific file.',
  {
    path: z.string().optional().describe('Specific file path. Omit for full workspace diff.'),
    staged: z.boolean().optional().describe('Show staged changes only. Default: false.'),
  },
  async ({ path: filePath, staged }) => {
    const result = await instrumentedTool(
      'tracereplay.git_diff',
      { path: filePath, staged },
      async () => {
        const args = staged ? '--cached' : '';
        const target = filePath ? `-- ${JSON.stringify(filePath)}` : '';
        const diff = execSync(`git diff ${args} ${target}`, {
          cwd: WORKSPACE_DIR,
          encoding: 'utf-8',
          timeout: 10000,
          maxBuffer: 5 * 1024 * 1024,
        });
        return diff.slice(0, 20000);
      },
    );
    return {
      content: [{ type: 'text' as const, text: result }],
    };
  },
);

// ---------------------------------------------------------------------------
// Tool: tracereplay.record_approval
// ---------------------------------------------------------------------------

server.tool(
  'tracereplay_record_approval',
  'Record an approval decision for an action that required human authorization.',
  {
    approvalType: z.string().describe('Type of approval (e.g., "file_write", "deploy", "shell_command").'),
    action: z.string().describe('Description of the action being approved/denied.'),
    decision: z.enum(['granted', 'denied']).describe('The approval decision.'),
    decidedBy: z.string().optional().describe('Who made the decision. Default: "user".'),
    reason: z.string().optional().describe('Reason for the decision.'),
  },
  async ({ approvalType, action, decision, decidedBy, reason }) => {
    const result = await instrumentedTool(
      'tracereplay.record_approval',
      { approvalType, action, decision, decidedBy, reason },
      async () => {
        const eventType = decision === 'granted'
          ? 'copilot.approval.granted'
          : 'copilot.approval.denied';
        await emitEvent(eventType, {
          approvalType,
          requestedAction: action,
          decidedBy: decidedBy ?? 'user',
          reason,
        });
        return { recorded: true, decision, approvalType };
      },
    );
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result) }],
    };
  },
);

// ---------------------------------------------------------------------------
// Tool: tracereplay.snapshot_context
// ---------------------------------------------------------------------------

server.tool(
  'tracereplay_snapshot_context',
  'Capture a context snapshot — records what files/docs/data the AI agent is using for its current reasoning.',
  {
    source: z.string().describe('Context source (e.g., "workspace_file", "documentation", "search_results").'),
    content: z.string().describe('The context content or summary.'),
    tokenCount: z.number().optional().describe('Estimated token count of the context.'),
  },
  async ({ source, content, tokenCount }) => {
    const result = await instrumentedTool(
      'tracereplay.snapshot_context',
      { source, contentLength: content.length, tokenCount },
      async () => {
        await emitEvent('copilot.context.injected', {
          source,
          content: content.slice(0, 5000),
          tokenCount,
        });
        return { captured: true, source };
      },
    );
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result) }],
    };
  },
);

// ---------------------------------------------------------------------------
// Tool: tracereplay.attach_artifact
// ---------------------------------------------------------------------------

server.tool(
  'tracereplay_attach_artifact',
  'Attach an artifact to the current session — code diffs, generated files, test results, etc.',
  {
    artifactType: z.string().describe('Type of artifact (e.g., "code_diff", "test_result", "generated_file").'),
    name: z.string().describe('Human-readable name for the artifact.'),
    content: z.string().describe('The artifact content.'),
    metadata: z.record(z.unknown()).optional().describe('Additional metadata.'),
  },
  async ({ artifactType, name, content, metadata }) => {
    const result = await instrumentedTool(
      'tracereplay.attach_artifact',
      { artifactType, name, contentLength: content.length },
      async () => {
        await emitEvent('copilot.annotation', {
          key: `artifact:${artifactType}`,
          value: {
            name,
            content: content.slice(0, 10000),
            ...(metadata ?? {}),
          },
          annotatedBy: sessionVendor,
        });
        return { attached: true, artifactType, name };
      },
    );
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result) }],
    };
  },
);

// ---------------------------------------------------------------------------
// Tool: tracereplay.finalize_session
// ---------------------------------------------------------------------------

server.tool(
  'tracereplay_finalize_session',
  'Mark the current session as complete. Call when the task is done.',
  {
    status: z.enum(['success', 'failure', 'cancelled']).describe('Final session status.'),
    summary: z.string().optional().describe('Summary of what was accomplished.'),
  },
  async ({ status, summary }) => {
    await emitEvent('copilot.session.end', {
      status,
      summary,
      durationMs: 0, // placeholder — real duration computed from first/last events
    });
    const result = { finalized: true, sessionId, status };
    // Reset for next session
    sessionId = randomUUID();
    sequenceCounter = 0;
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result) }],
    };
  },
);

// ---------------------------------------------------------------------------
// Tool: tracereplay.query_runs
// ---------------------------------------------------------------------------

server.tool(
  'tracereplay_query_runs',
  'Query TraceReplay for past runs and sessions. Useful for reviewing history.',
  {
    status: z.string().optional().describe('Filter by status: running, success, failure, timeout, cancelled.'),
    limit: z.number().optional().describe('Max results. Default: 20.'),
  },
  async ({ status, limit }) => {
    const result = await instrumentedTool(
      'tracereplay.query_runs',
      { status, limit },
      async () => {
        const queryUrl = process.env['QUERY_SERVICE_URL'] ?? 'http://localhost:3002';
        const params = new URLSearchParams({ tenantId: TENANT_ID });
        if (status) params.set('status', status);
        if (limit) params.set('limit', String(limit));
        const res = await fetch(`${queryUrl}/v1/runs?${params}`, {
          signal: AbortSignal.timeout(10000),
        });
        return await res.json();
      },
    );
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    };
  },
);

// ---------------------------------------------------------------------------
// Tool: tracereplay.query_timeline
// ---------------------------------------------------------------------------

server.tool(
  'tracereplay_query_timeline',
  'Get the replay timeline for a specific run. Shows the sequence of events.',
  {
    runId: z.string().describe('The run ID to get the timeline for.'),
  },
  async ({ runId }) => {
    const result = await instrumentedTool(
      'tracereplay.query_timeline',
      { runId },
      async () => {
        const queryUrl = process.env['QUERY_SERVICE_URL'] ?? 'http://localhost:3002';
        const res = await fetch(`${queryUrl}/v1/runs/${encodeURIComponent(runId)}/timeline`, {
          signal: AbortSignal.timeout(10000),
        });
        return await res.json();
      },
    );
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    };
  },
);

// ---------------------------------------------------------------------------
// Session start — emitted when the server connects
// ---------------------------------------------------------------------------

async function emitSessionStart(): Promise<void> {
  await emitEvent('copilot.session.start', {
    sessionName: `MCP Session — ${new Date().toISOString()}`,
    settings: {
      transport: TRANSPORT,
      workspaceDir: WORKSPACE_DIR,
    },
  });
}

// ---------------------------------------------------------------------------
// Transport setup and launch
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  process.stderr.write(`[tracereplay-mcp] Starting MCP server (transport=${TRANSPORT})\n`);
  process.stderr.write(`[tracereplay-mcp] Ingest API: ${INGEST_API_URL}\n`);
  process.stderr.write(`[tracereplay-mcp] Workspace: ${WORKSPACE_DIR}\n`);

  if (TRANSPORT === 'sse') {
    // SSE transport — for Docker / network access
    const transports: Map<string, SSEServerTransport> = new Map();

    const httpServer = createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', `http://localhost:${SSE_PORT}`);

      if (url.pathname === '/healthz') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
        return;
      }

      if (url.pathname === '/sse') {
        const transport = new SSEServerTransport('/messages', res);
        transports.set(transport.sessionId, transport);
        res.on('close', () => transports.delete(transport.sessionId));
        await server.connect(transport);
        await emitSessionStart();
        return;
      }

      if (url.pathname === '/messages' && req.method === 'POST') {
        const sessionId = url.searchParams.get('sessionId');
        const transport = sessionId ? transports.get(sessionId) : undefined;
        if (!transport) {
          res.writeHead(404);
          res.end('Session not found');
          return;
        }
        await transport.handlePostMessage(req, res);
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    });

    httpServer.listen(SSE_PORT, '0.0.0.0', () => {
      process.stderr.write(`[tracereplay-mcp] SSE server listening on port ${SSE_PORT}\n`);
    });
  } else {
    // stdio transport — default for VS Code MCP
    const transport = new StdioServerTransport();
    await server.connect(transport);
    await emitSessionStart();
  }
}

main().catch((err) => {
  process.stderr.write(`[tracereplay-mcp] Fatal error: ${err}\n`);
  process.exit(1);
});
