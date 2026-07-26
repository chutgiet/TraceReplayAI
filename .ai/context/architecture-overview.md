# TraceReplay AI — Architecture Overview

## System architecture

TraceReplay AI follows a modular monorepo architecture with clear service boundaries, shared packages, and a unidirectional event flow. The **core extraction points** are the three-ring interception layer (native agent hooks, MCP/egress proxy, filesystem snapshots — see ADR-0005), OpenTelemetry native ingestion (from VS Code Copilot, Codex, Claude), and the MCP server for agent-facing query/approval APIs.

## The capture layer: three rings (ADR-0005)

Capture is layered in decreasing fidelity; no single ring covers every surface, so all three are required.

```
┌───────────────────────────────────────────────────────────┐
│                     AGENT SURFACES                        │
│   Claude Code CLI/desktop · Codex CLI/VS Code · chat      │
└───────┬──────────────────┬─────────────────┬──────────────┘
        │                  │                 │
   RING 1: hooks      RING 2: proxy     RING 3: filesystem
   PreToolUse/        MCP proxy in      git tree hash
   PostToolUse        front of every    snapshots (incl.
   (.claude/          real server +     untracked) at
   settings.json,     egress HTTPS      session start and
   .codex/hooks.json) proxy (model I/O) turn boundaries
        │                  │                 │
        └──────────────────┼─────────────────┘
                           ▼
              ┌─────────────────────────┐
              │      DECISION LEDGER    │
              │  decision records with  │
              │  write-time hash chain, │
              │  config attestation,    │
              │  explicit gap markers   │
              └────────────┬────────────┘
                           │ (flows into standard pipeline)
                           ▼
                   Ingest API → Normalizer → Event Store
```

**Coverage matrix by surface:**

| Surface | Tool gate | File writes | MCP calls | Model I/O |
|---|---|---|---|---|
| Claude Code CLI / desktop | Ring 1 hooks | Ring 1 hooks | Ring 1 hooks | Ring 2 only |
| Codex CLI / VS Code | Ring 1 (bash only) | Ring 3 | Ring 2 | Ring 2 only |
| Claude Code chat (managed) | none | Ring 3 | Ring 2 | none |

**The decision record** is the atomic primitive: agent identity (consumed assertion), proposed action with full parameters, policy version content hash, verdict, evidence consumed, and the hash of the prior record — chained at write time, not retroactively. Enforcement writes it, audit reads it, one schema.

**Honesty guarantees**: configuration attestation (hash of `settings.json` / `hooks.json` / `config.toml` chained in at session start) plus explicit `capture.gap` events whenever the expected capture chain is incomplete. A durable local spool replaces fire-and-forget emission so ingest outages produce late delivery, never silent loss.

**Mode**: record-only by default (zero config, immediate audit value). Enforcement — a fail-closed local policy sidecar compiling to Cedar/Rego — is a later switch, flipped on rules proposed from observed traffic.

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

The **TraceReplay MCP Server** (`services/tracereplay-mcp/`) is a [Model Context Protocol](https://modelcontextprotocol.io) server that AI coding agents connect to. Per ADR-0005 its role is **reframed**: it is the agent-facing API surface (query history, record approvals, attach artifacts), not the primary capture mechanism. Its parallel file/shell tools are legacy — capture responsibility moves to the three rings, because parallel tools only record what the agent chooses to route through them.

### How it fits the architecture

- **Agent-facing APIs**: approvals, context snapshots, artifacts, and history queries are things hooks/proxies cannot provide — an agent must be able to proactively invoke them.
- **Feeds the standard pipeline**: Emitted telemetry flows through the same Ingest API → Normalizer → Event Store pipeline as all other events.
- **Queries existing data**: Calls the Query Service to let agents browse past runs and replay timelines.
- **Session lifecycle**: Each MCP connection creates a session (run) with `copilot.session.start` / `copilot.session.end` events.

### MCP tools by status

| Tool | Purpose | Status |
|---|---|---|
| `tracereplay_record_approval` | Record human approval decision | **Keep** — agent-facing API |
| `tracereplay_snapshot_context` | Capture context snapshot | **Keep** — agent-facing API |
| `tracereplay_attach_artifact` | Attach artifact (diffs, test results) | **Keep** — agent-facing API |
| `tracereplay_finalize_session` | Mark session complete | **Keep** — session lifecycle |
| `tracereplay_query_runs` | Browse past captured sessions | **Keep** — agent-facing API |
| `tracereplay_query_timeline` | View replay timeline for a run | **Keep** — agent-facing API |
| `tracereplay_list_files` | List workspace files | **Legacy** — superseded by Ring 1 |
| `tracereplay_read_file` | Read file contents | **Legacy** — superseded by Ring 1 |
| `tracereplay_search_code` | Search code (git grep) | **Legacy** — superseded by Ring 1 |
| `tracereplay_apply_patch` | Apply text replacement to a file | **Legacy** — superseded by Rings 1+3 |
| `tracereplay_run_command` | Execute shell command | **Legacy** — superseded by Rings 1+3 |
| `tracereplay_git_status` | Check git status | **Legacy** — superseded by Ring 3 |
| `tracereplay_git_diff` | View git diffs | **Legacy** — superseded by Ring 3 |

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
- **One primitive (ADR-0005)**: The decision record is the atomic unit — enforcement writes it, audit reads it, one schema. Not separate enforcement and audit subsystems reconciled later.
- **Transport interception, not decorators (ADR-0005)**: Capture happens at hooks, proxy, and filesystem — coverage by construction, not by agent cooperation. The proxy is the spine; hooks are enrichment.
- **Write-time hash chaining (ADR-0005)**: Each event's chain hash is computed at persistence, per run. The evidence-service chain becomes verification of the stored chain, not the source of truth.
- **Honest gaps (ADR-0005)**: Config attestation at session start + explicit `capture.gap` markers. An audit record must distinguish "nothing happened" from "nothing was watching." Durable local spool replaces fire-and-forget emission.
- **Record-only default (ADR-0005)**: Zero-config recording ships first; enforcement (Cedar/Rego sidecar, fail-closed) is a later switch on rules proposed from observed traffic.
- **Consume identity, never issue it (ADR-0005)**: Agent identity arrives as an assertion (APort passport, Entra Agent ID); TraceReplay validates and records it.
- **Idempotent ingestion**: Duplicate events detected by event ID hash. Safe to retry.
- **Lazy timeline replay**: The viewing timeline is constructed on-demand from stored events. Distinct from **deterministic re-execution** (the long-term moat), which requires capturing all nondeterministic inputs — model I/O, retrieval results, tool outputs, clock reads, seeds — via Ring 2.
- **Redaction before persistence**: Sensitive fields are redacted during normalization, before writing to the event store.
- **MCP as agent-facing API**: The MCP server provides query/approval/artifact APIs to agents. Its parallel capture tools are legacy (see ADR-0005).
