# Live Capture: GitHub Copilot & OpenAI Codex → TraceReplay AI

> How to connect real Copilot and Codex development sessions to your local Docker TraceReplay stack.

## Prerequisites

- Docker Desktop running
- VS Code with GitHub Copilot extension (Agent mode)
- Codex VS Code extension (optional, for Codex capture)
- Node.js 20+, pnpm 9+

## Quick Start

### 1. Start the Full Stack (including MCP server)

```bash
# Dev mode with hot-reload (recommended):
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build

# Or production mode:
docker compose up --build
```

This starts all services:

| Service | Port | Purpose |
|---------|------|---------|
| Web UI | 3000 | Investigation dashboard |
| Ingest API | 3001 | Event ingestion |
| Query Service | 3002 | Run/event queries, timeline, search |
| Normalizer | 3003 | Raw → canonical event normalization |
| Worker | 3004 | Async job processing |
| **MCP Server** | **3005** | **Instrumented tools for Copilot/Codex** |
| PostgreSQL | 5432 | Event store |
| Redis | 6379 | Job queue |

### 2. Connect GitHub Copilot (VS Code)

The MCP server config is already set up in `.vscode/mcp.json`. When you open this workspace in VS Code:

1. **Copilot automatically discovers the TraceReplay MCP server** via `.vscode/mcp.json`
2. Open Copilot Chat in **Agent mode** (the default in VS Code)
3. The `tracereplay_*` tools will appear in Copilot's available tools
4. Use `@tracereplay` (from `.github/agents/tracereplay.md`) to specifically route work through the audit trail

**How it works**: When Copilot calls any `tracereplay_*` tool, the MCP server:
- Executes the actual operation (file read, code search, command, etc.)
- Auto-emits telemetry to `POST http://localhost:3001/v1/raw-events`
- The normalizer converts raw events → canonical events → PostgreSQL
- You can view the captured session at `http://localhost:3000/runs`

**Two transport modes**:
- **stdio** (default in `.vscode/mcp.json`): Copilot talks directly to the MCP server process. Used for local VS Code development.
- **SSE** (Docker compose): The MCP server runs as an HTTP service on port 3005. Used when you want network-accessible MCP.

### 3. Connect OpenAI Codex (VS Code)

Codex discovers MCP servers from its own config. Add TraceReplay to your Codex config:

**Option A: CLI setup** (recommended, shared with IDE):
```bash
codex mcp add tracereplay -- npx tsx services/tracereplay-mcp/src/index.ts
```

**Option B: Config file** (`~/.codex/config.toml`):
```toml
[mcp.tracereplay]
command = "npx"
args = ["tsx", "/absolute/path/to/TraceReplayAI/services/tracereplay-mcp/src/index.ts"]

[mcp.tracereplay.env]
INGEST_API_URL = "http://localhost:3001"
QUERY_SERVICE_URL = "http://localhost:3002"
TENANT_ID = "org-tracereplay-dev"
TRANSPORT = "stdio"
```

**Option C: Use the Docker SSE endpoint** (if Codex supports remote MCP):
```toml
[mcp.tracereplay]
type = "sse"
url = "http://localhost:3005/sse"
```

Codex will also read `AGENTS.md` at the repo root for project-specific guidance.

### 4. View Captured Sessions

Open `http://localhost:3000/runs` in your browser. Every development session that flows through the MCP server will appear as a run with its full timeline of tool calls, file operations, and side effects.

Query the API directly:
```bash
# List captured runs
curl http://localhost:3002/v1/runs?tenantId=org-tracereplay-dev

# Get timeline for a specific run
curl http://localhost:3002/v1/runs/<runId>/timeline

# Search across all captured events
curl "http://localhost:3002/v1/search?q=apply_patch&tenantId=org-tracereplay-dev"
```

## Architecture Overview

```
┌──────────────────┐     ┌──────────────────┐
│  GitHub Copilot  │     │   Codex IDE      │
│  (VS Code Agent) │     │   (VS Code)      │
└────────┬─────────┘     └────────┬─────────┘
         │  MCP tool calls        │  MCP tool calls
         │  (stdio)               │  (stdio or SSE)
         ▼                        ▼
┌────────────────────────────────────┐
│     tracereplay-mcp (port 3005)    │ ← instrumented tool surface
│                                    │
│  Tools: list_files, read_file,     │
│  search_code, apply_patch,         │
│  run_command, git_status/diff,     │
│  record_approval, snapshot_context │
│  attach_artifact, finalize_session │
│  query_runs, query_timeline        │
└──────────────┬─────────────────────┘
               │ POST /v1/raw-events
               ▼
┌────────────────────────────────────┐
│     ingest-api (port 3001)         │
│     → BullMQ queue                 │
└──────────────┬─────────────────────┘
               │
               ▼
┌────────────────────────────────────┐
│     normalizer (port 3003)         │
│     → GitHubCopilotAdapter         │
│     → OpenAICodexAdapter           │
│     → canonical event model        │
└──────────────┬─────────────────────┘
               │
               ▼
┌────────────────────────────────────┐
│     PostgreSQL (append-only)       │
└──────────────┬─────────────────────┘
               │
               ▼
┌────────────────────────────────────┐
│     query-service (port 3002)      │
│     → timeline / search / replay   │
└──────────────┬─────────────────────┘
               │
               ▼
┌────────────────────────────────────┐
│     web UI (port 3000)             │
│     → runs list, timeline, lineage │
└────────────────────────────────────┘
```

## Capture Coverage

| What | Method | Confidence |
|------|--------|------------|
| Tool calls through MCP server | **Exact** — you own the surface | High |
| File reads/writes via MCP tools | **Exact** — before/after captured | High |
| Shell commands via MCP tools | **Exact** — command + output captured | High |
| Git operations via MCP tools | **Exact** — status/diff captured | High |
| Approval decisions | **Exact** — via `record_approval` tool | High |
| User prompt text | **Partial** — visible in tool parameters, not raw user message | Medium |
| Model responses | **Partial** — visible through tool outputs | Medium |
| Copilot/Codex built-in tool calls | **Not captured** — unless routed through MCP | None |
| Internal reasoning / chain-of-thought | **Not capturable** — provider-private | None |

**Key principle**: You capture what goes through *your* tool surface. Copilot and Codex also have their own built-in tools (file reading, terminal, etc.) that bypass MCP. To maximize capture, the `@tracereplay` custom agent in `.github/agents/tracereplay.md` instructs Copilot to prefer using `tracereplay_*` tools over built-in equivalents.

## Available MCP Tools

| Tool | Description |
|------|-------------|
| `tracereplay_list_files` | List files/directories in workspace |
| `tracereplay_read_file` | Read file contents (with optional line range) |
| `tracereplay_search_code` | Search code across workspace (text or regex) |
| `tracereplay_apply_patch` | Apply text replacement to a file |
| `tracereplay_run_command` | Execute shell command in workspace |
| `tracereplay_git_status` | Get current git status |
| `tracereplay_git_diff` | Get git diff (workspace or specific file) |
| `tracereplay_record_approval` | Record an approval decision |
| `tracereplay_snapshot_context` | Capture context snapshot |
| `tracereplay_attach_artifact` | Attach artifact to session |
| `tracereplay_finalize_session` | Mark session complete |
| `tracereplay_query_runs` | Browse past captured sessions |
| `tracereplay_query_timeline` | View replay timeline for a run |

## Troubleshooting

**MCP server not showing in Copilot**: Ensure `.vscode/mcp.json` exists and reload VS Code window (`Cmd+Shift+P` → "Developer: Reload Window").

**Events not appearing in UI**: Check ingest API is healthy (`curl http://localhost:3001/healthz`) and normalizer is running (`curl http://localhost:3003/healthz`).

**Codex can't find MCP server**: Use `codex mcp list` to verify registration. Check that the path to `services/tracereplay-mcp/src/index.ts` is absolute in the Codex config.

**Docker MCP server health**: `curl http://localhost:3005/healthz` should return `{"status":"ok"}`.
