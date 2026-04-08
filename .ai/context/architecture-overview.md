# TraceReplay AI — Architecture Overview

## System architecture

TraceReplay AI follows a modular monorepo architecture with clear service boundaries, shared packages, and a unidirectional event flow. The **core extraction points** are OpenTelemetry native ingestion (from VS Code Copilot, Codex, Claude) and the MCP server for instrumented tool calls.

```
┌─────────────────────────────────────────────────────┐
│     VS Code Copilot / OpenAI Codex / Claude Code    │
│     (OTel enabled: spans, metrics, events)          │
└──────────────────────┬──────────────────────────────┘
                       │ OTLP (HTTP :4318 / gRPC :4317)
                       ▼
┌─────────────────────────────────────────────────────┐
│              OTel Collector (Docker)                 │
│  receivers: otlp · processors: batch, memory_limiter│
│  exporters: otlphttp → ingest-api, debug            │
└──────────────────────┬──────────────────────────────┘
                       │ OTLP HTTP
                       ▼
┌─────────────────────────────────────────────────────┐
│                    SDK / Adapters                   │
│  TypeScript SDK · Python SDK · OTel Exporter        │
│  OpenAI · Anthropic · Ollama models                 │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP / gRPC
                       ▼
┌─────────────────────────────────────────────────────┐
│                    Ingest API                       │
│  POST /v1/traces (OTLP) · POST /v1/raw-events      │
│  POST /v1/events · POST /v1/metrics (OTLP)         │
│  Validates, deduplicates, queues raw events         │
└──────────────────────┬──────────────────────────────┘
                       │ Message Queue (BullMQ + Redis)
                       ▼
┌─────────────────────────────────────────────────────┐
│                    Normalizer                       │
│  Maps vendor telemetry → canonical event model      │
│  OTelSpanAdapter · GitHubCopilotAdapter · etc.      │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│                  Event Store                        │
│  Append-only canonical events + metadata            │
└──────┬──────────┬──────────┬──────────┬─────────────┘
       │          │          │          │
       ▼          ▼          ▼          ▼
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────┐
│  Replay  │ │ Lineage  │ │ Evidence │ │   Ollama    │
│  Engine  │ │  Graph   │ │ Service  │ │  Processor  │
└──────────┘ └──────────┘ └──────────┘ │ (DeepSeek)  │
       │          │          │          │ Summaries · │
       ▼          ▼          ▼          │ Anomalies · │
┌─────────────────────────────────────┐ │ Compliance  │
│                  Query Service      │ └──────┬──────┘
│  Investigation API, search,         │        │
│  filtering, metrics                 │◄───────┘
└──────────────────────┬──────────────┘ annotation events
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│                    Web UI                           │
│  Replay viewer, investigation, admin                │
└─────────────────────────────────────────────────────┘

         ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┐
                   TraceReplay MCP Server
         │  Instruments AI agent tool calls in real    │
            time. Emits telemetry to Ingest API.
         │                                            │
            Transport: stdio (VS Code) or SSE (Docker)
         └ ─ ─ ─ ─ ─ ─ ─ ─ ─┬─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┘
                              │
            ┌─────────────────┼─────────────────┐
            │ reads/queries   │ emits telemetry │
            ▼                 ▼                 ▼
       Query Service    Ingest API         Event Store
```

## MCP Server integration

The **TraceReplay MCP Server** (`services/tracereplay-mcp/`) is an instrumented [Model Context Protocol](https://modelcontextprotocol.io) server that AI coding agents (GitHub Copilot, OpenAI Codex, Claude Code, etc.) connect to as a tool provider. Every tool invocation is automatically captured as telemetry and sent to the Ingest API, enabling audit-grade session capture of real development work.

### How it fits the architecture

- **Acts as an SDK/Adapter**: The MCP server is an alternate ingestion path — instead of applications calling the TypeScript SDK, AI agents invoke MCP tools which auto-emit events.
- **Feeds the standard pipeline**: Telemetry flows through the same Ingest API → Normalizer → Event Store pipeline as all other events.
- **Queries existing data**: The MCP server also calls the Query Service to let agents browse past runs and replay timelines.
- **Session lifecycle**: Each MCP connection creates a session (run) with `copilot.session.start` / `copilot.session.end` events. Individual tool calls emit `copilot.tool.invoke` / `copilot.tool.result` / `copilot.tool.error` events.

### Available MCP tools

| Tool | Purpose | Side effects |
|---|---|---|
| `tracereplay_list_files` | List workspace files | None |
| `tracereplay_read_file` | Read file contents | None |
| `tracereplay_search_code` | Search code (git grep) | None |
| `tracereplay_apply_patch` | Apply text replacement to a file | `file_write` |
| `tracereplay_run_command` | Execute shell command | `shell_command` |
| `tracereplay_git_status` | Check git status | None |
| `tracereplay_git_diff` | View git diffs | None |
| `tracereplay_record_approval` | Record human approval decision | None |
| `tracereplay_snapshot_context` | Capture context snapshot | None |
| `tracereplay_attach_artifact` | Attach artifact (diffs, test results) | None |
| `tracereplay_finalize_session` | Mark session complete | None |
| `tracereplay_query_runs` | Browse past captured sessions | None |
| `tracereplay_query_timeline` | View replay timeline for a run | None |

### Transport modes

- **stdio** (default): For VS Code MCP integration — agent connects via stdin/stdout.
- **SSE**: For Docker/network deployment — exposes HTTP endpoints on port 3005.

### Configuration

| Env var | Default | Purpose |
|---|---|---|
| `INGEST_API_URL` | `http://localhost:3001` | TraceReplay ingest endpoint |
| `QUERY_SERVICE_URL` | `http://localhost:3002` | TraceReplay query endpoint |
| `TENANT_ID` | `org-tracereplay-dev` | Tenant identifier |
| `TRANSPORT` | `stdio` | Transport mode: `stdio` or `sse` |
| `SSE_PORT` | `3005` | Port for SSE transport |
| `WORKSPACE_DIR` | `process.cwd()` | Root workspace directory |

## Core data flow

1. **Ingest** — SDK or MCP server sends raw events to Ingest API
2. **Validate** — Schema validation, deduplication, rate limiting
3. **Queue** — Valid events placed on message queue for async processing
4. **Normalize** — Raw events mapped to canonical event model
5. **Persist** — Canonical events written to append-only event store
6. **Index** — Events indexed for search and query
7. **Replay** — Replay engine constructs execution timeline on demand
8. **Lineage** — Graph model builds causal/dependency relationships
9. **Evidence** — Evidence service assembles audit bundles from run data
10. **Query** — Query service exposes investigation APIs
11. **Display** — Web UI renders replay, lineage, and evidence views

### MCP-specific data flow

When an AI coding agent (Copilot, Codex, etc.) is connected via the MCP server:

1. **Connect** — Agent opens stdio or SSE connection to MCP server → `copilot.session.start` emitted
2. **Tool call** — Agent invokes an MCP tool (e.g. `tracereplay_read_file`) → `copilot.tool.invoke` emitted
3. **Execute** — MCP server performs the operation (file read, code search, patch, shell command)
4. **Result** — Tool returns result to agent → `copilot.tool.result` or `copilot.tool.error` emitted
5. **Side effect** — If the tool modified state (file write, shell command) → `copilot.side_effect` emitted
6. **Finalize** — Agent calls `tracereplay_finalize_session` → `copilot.session.end` emitted

All emitted events flow through the standard Ingest API → Normalizer → Event Store pipeline.

## Technology choices

| Layer | Technology | Rationale |
|---|---|---|
| Language | TypeScript (full stack) | Type safety, shared packages, solo-dev productivity |
| Runtime | Node.js 20+ | Async I/O, ecosystem, deployment flexibility |
| Framework | Fastify (API) | Performance, schema validation, plugin architecture |
| Frontend | Next.js + React | SSR, file-based routing, React ecosystem |
| Database | PostgreSQL | Reliable, JSON support, extensible |
| Queue | BullMQ + Redis | Simple, reliable, good for solo-dev scale |
| Search | PostgreSQL full-text (v1) | Avoid extra infra initially; upgrade to Elasticsearch later |
| Monorepo | pnpm + Turborepo | Fast builds, workspace protocol, caching |
| Testing | Vitest | Fast, TypeScript-native, compatible API |
| Deployment | Docker + Docker Compose (dev) | Local development ease |

## Package dependency graph

```
event-schema (no deps — foundational)
    ↑
common (depends on event-schema)
    ↑
├── replay-engine
├── graph-model
├── redaction
├── connectors-core
├── sdk-typescript
└── ui (depends on common + event-schema)
```

## Service dependency graph

```
ingest-api → event-schema, common, redaction
normalizer → event-schema, common, connectors-core
replay-service → event-schema, replay-engine, common
query-service → event-schema, common
evidence-service → event-schema, replay-engine, common
worker → event-schema, common (async job runner)
tracereplay-mcp → @modelcontextprotocol/sdk, zod (standalone — emits to ingest-api, queries query-service)
```

## Key design decisions

- **Append-only event store**: Events are immutable once persisted. Annotations and status are stored separately.
- **Canonical event model**: All telemetry is normalized before storage. Raw payloads preserved as metadata.
- **Idempotent ingestion**: Duplicate events detected by event ID hash. Safe to retry.
- **Lazy replay**: Execution timeline is constructed on-demand from stored events, not pre-computed.
- **Redaction before persistence**: Sensitive fields are redacted during normalization, before writing to the event store.
- **MCP as an ingestion path**: The MCP server is a transparent telemetry layer — AI agents use standard MCP tools while every action is captured as auditable events. Best-effort emission ensures tool execution is never blocked by telemetry failures.
