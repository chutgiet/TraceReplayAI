# TraceReplay AI — Sprint: Core-1 (OTel Capture + Ollama + Remaining F4) ⏸️ PAUSED

## Status: PAUSED — Tier 1 complete (6/6 ✅); remaining tasks merged into Sprint Interception-1
> ADR-0005 (transport-level interception) re-prioritized the roadmap. Still-relevant infra tasks (F4-007, F4-008, F4-009, C1-010) carry over to `current-sprint-6.md` Tier 4; C1-005/007/008/009/012 are deferred there. See `.ai/decisions/adr-0005-transport-interception.md`.

## Goal
**This is the core feature of TraceReplay AI.** Stand up native OpenTelemetry ingestion so VS Code Copilot, OpenAI Codex, and other AI agents' telemetry flows directly into the canonical event pipeline. Add an OTel Collector to the stack, build the OTLP-to-canonical adapter, and wire Ollama (DeepSeek) for background post-processing/enrichment of captured traces. Also completes priority items from Foundation-4 (evidence integrity, health checks, CI/CD, logging).

## Rationale
VS Code Copilot Chat now natively exports OTel traces (spans, metrics, events) following GenAI Semantic Conventions. This is the **primary extraction point** for agent telemetry — it captures LLM calls, tool executions, token usage, and agent orchestration that the MCP server alone cannot see (internal reasoning, model inference, sub-agent delegation). Combined with Ollama-based post-processing, this completes the audit pipeline.

Sprint Foundation-4 is paused (3/12 done). Remaining F4 tasks are merged here by tier — OTel is the priority because evidence/compliance has nothing meaningful to bundle without real agent telemetry flowing.

## Dependencies
- **Milestones 1–3 complete, F4 partially complete** — event-schema, ingest-api, normalizer, MCP server, adapters, evidence assembler + JSON/PDF export all operational.
- **VS Code Copilot OTel** — requires `github.copilot.chat.otel.enabled` and endpoint configuration.
- **Ollama** — DeepSeek already installed locally; also provided via Docker for CI/production.

## Reference
- [VS Code Copilot OTel Monitoring Guide](https://code.visualstudio.com/docs/copilot/guides/monitoring-agents)

---

## Tasks — Merged & Tiered

### Tier 1 — Do NOW (OTel critical path + finish evidence)

| ID | Task | Status | Source | Est |
|----|------|--------|--------|-----|
| C1-001 | OTel Collector service in Docker Compose | ✅ | Core-1 | S |
| C1-002 | OTLP HTTP receiver endpoint in ingest-api | ✅ | Core-1 | L |
| C1-003 | OTel Span → canonical event adapter (`OTelSpanAdapter`) | ✅ | Core-1 | L |
| C1-004 | VS Code settings profile for OTel export | ✅ | Core-1 | S |
| C1-006 | Ollama post-processing service (DeepSeek) | ✅ | Core-1 | L |
| F4-004 | Evidence integrity hash chain | ✅ | F4 | M |

### Tier 2 — Do NEXT (full mapping + infrastructure)

| ID | Task | Status | Source | Est |
|----|------|--------|--------|-----|
| C1-005 | GenAI semantic convention mapping (spans, metrics, events) | 🔲 | Core-1 | L |
| C1-007 | Ollama Docker integration (fallback to local) | 🔲 | Core-1 | M |
| C1-010 | Integration test: Copilot OTel → ingest → normalize → replay | 🔲 | Core-1 | M |
| F4-007 | Health check endpoints on all services | 🔲 | F4 | S |
| F4-009 | Structured logging with correlation IDs | 🔲 | F4 | M |
| F4-008 | CI/CD pipeline (GitHub Actions) | 🔲 | F4 | M |

### Tier 3 — After core works (polish + advanced)

| ID | Task | Status | Source | Est |
|----|------|--------|--------|-----|
| C1-008 | MCP server: OTel context propagation | 🔲 | Core-1 | M |
| C1-009 | OTel metrics → run analytics pipeline | 🔲 | Core-1 | M |
| C1-012 | Enrichment queue: Ollama background processing via BullMQ | 🔲 | Core-1 | M |
| F4-005 | Side-effect tracking and visualization | 🔲 | F4 | L |
| F4-006 | Query service: search by tool, side effect, error type | 🔲 | F4 | M |

### Deferred (future sprint)

| ID | Task | Source | Reason |
|----|------|--------|--------|
| C1-011 | OTel Codex/Claude adapter extensions | Core-1 | Speculative, Copilot first |
| F4-010 | Auto-instrumentation helpers for SDK | F4 | SDK polish, not critical path |
| F4-011 | LangGraph/LangChain adapter | F4 | No OTel from LangChain yet |
| F4-012 | Evidence UI: bundle viewer and export controls | F4 | Needs data flowing first |

Est: S = small (< half day), M = medium (half–full day), L = large (1–2 days)

---

## Sequencing

```
TIER 1 — parallel batch (OTel critical path):
  C1-001 (Collector)  ──┐
  C1-002 (OTLP endpoint)──┤── in parallel, C1-004 once C1-001 done
  C1-003 (OTelSpanAdapter)──┤
  C1-006 (Ollama processor)──┤── independent of OTel
  F4-004 (Integrity hash) ──┘

TIER 2 — once Tier 1 core works:
  C1-005 (Full GenAI mapping) ←── extends C1-003
  C1-007 (Ollama Docker)      ←── extends C1-006
  C1-010 (Integration test)   ←── needs C1-001 + C1-002 + C1-003
  F4-007 (Health checks)      ←── independent
  F4-009 (Structured logging)  ←── independent
  F4-008 (CI/CD)              ←── independent

TIER 3 — after core pipeline flows end to end:
  C1-008, C1-009, C1-012, F4-005, F4-006
```

---

## Task details

### C1-001 — OTel Collector service in Docker Compose

**Goal:** Add an OpenTelemetry Collector to the Docker stack that receives OTLP from VS Code Copilot and forwards to the ingest-api.

**Scope:**
- Add `otel-collector` service to `docker-compose.yml` using `otel/opentelemetry-collector-contrib`
- Configure receivers: `otlp` (gRPC on 4317, HTTP on 4318)
- Configure exporters: `otlphttp` → ingest-api OTLP endpoint (C1-002)
- Configure processors: `batch` (for throughput), `memory_limiter`
- Expose ports 4317 (gRPC) and 4318 (HTTP) for VS Code to send traces
- Also export to `logging` exporter for debugging
- Mount config from `infrastructure/otel/otel-collector-config.yaml`
- Health check on collector

**Key files:** `docker-compose.yml`, `infrastructure/otel/otel-collector-config.yaml`

**Acceptance criteria:**
- [ ] OTel Collector starts in Docker Compose
- [ ] Receives OTLP on ports 4317/4318
- [ ] Forwards traces to ingest-api
- [ ] Health check passing
- [ ] Logging exporter shows received spans in debug mode

---

### C1-002 — OTLP HTTP receiver endpoint in ingest-api

**Goal:** Add native OTLP/HTTP trace ingestion to the ingest-api so it can receive OpenTelemetry spans directly (without requiring an external collector for simple setups).

**Scope:**
- `POST /v1/traces` — OTLP HTTP trace endpoint (JSON and protobuf)
- Accept `application/json` (OTLP JSON) and `application/x-protobuf` (OTLP Proto)
- Parse `ExportTraceServiceRequest` proto/JSON into spans
- Map each span to a `RawVendorEvent` with `vendor: "otel-copilot"` (or detect from `service.name` resource attribute)
- Enqueue to normalization queue (same as `/v1/raw-events`)
- Return standard OTLP response (`ExportTraceServiceResponse`)
- Support `OTEL_EXPORTER_OTLP_HEADERS` passthrough for auth

**Dependencies:** `@opentelemetry/api`, `@opentelemetry/otlp-transformer` (or manual proto parsing)

**Key files:** `services/ingest-api/src/routes/otlp-traces.ts`, `services/ingest-api/src/parsers/otlp-parser.ts`

**Acceptance criteria:**
- [ ] OTLP JSON traces accepted at `/v1/traces`
- [ ] Spans parsed into individual `RawVendorEvent` items
- [ ] Events enqueued for normalization
- [ ] Standard OTLP response returned
- [ ] Unit tests with sample Copilot OTel JSON traces
- [ ] Works with VS Code `otlp-http` exporter type pointing directly at ingest-api

---

### C1-003 — OTel Span → canonical event adapter (`OTelSpanAdapter`)

**Goal:** Build the normalizer adapter that maps OpenTelemetry spans (following GenAI Semantic Conventions) to TraceReplay canonical events.

**Scope:**
- New adapter: `packages/connectors-core/src/otel-span-adapter.ts`
- Vendor ID: `otel-genai` (auto-detected from `service.name=copilot-chat` or span attributes)
- Span kind → event type mapping:
  - `invoke_agent` span → `run.start` + `run.end` events
  - `chat` span → `model.request` + `model.response` events (with token counts, model ID, duration)
  - `execute_tool` span → `tool.call.start` + `tool.call.end` events
- Extract from span attributes (GenAI conventions):
  - `gen_ai.request.model` → `modelId`
  - `gen_ai.usage.input_tokens` → `inputTokens`
  - `gen_ai.usage.output_tokens` → `outputTokens`
  - `gen_ai.response.finish_reasons` → `finishReason`
  - `gen_ai.tool.name` → `toolName`
  - `gen_ai.agent.name` → `sourceAgent`
- Trace ID → `runId` mapping (consistent across all spans in a trace)
- Span ID → `eventId` mapping
- Parent span ID → `parentEventId` mapping
- Span status → error events when status is ERROR
- Register in `NormalizationService.createDefaultRegistry()`

**Key files:** `packages/connectors-core/src/otel-span-adapter.ts`, `packages/connectors-core/src/otel-span-adapter.test.ts`

**Acceptance criteria:**
- [ ] `invoke_agent` spans produce `run.start` + `run.end` canonical events
- [ ] `chat` spans produce `model.request` + `model.response` with token counts
- [ ] `execute_tool` spans produce `tool.call.start` + `tool.call.end`
- [ ] Trace context preserved (runId from traceId, parentEventId from parentSpanId)
- [ ] Error spans produce `run.error` or `tool.call.error` events
- [ ] Registered in adapter registry
- [ ] >90% test coverage with realistic OTel span fixtures

---

### C1-004 — VS Code settings profile for OTel export

**Goal:** Provide a ready-to-use VS Code settings configuration and documentation for enabling Copilot OTel export to TraceReplay.

**Scope:**
- Create `.vscode/settings.json` (or `.vscode/tracereplay-otel.code-profile`) with:
  ```json
  {
    "github.copilot.chat.otel.enabled": true,
    "github.copilot.chat.otel.exporterType": "otlp-http",
    "github.copilot.chat.otel.otlpEndpoint": "http://localhost:4318",
    "github.copilot.chat.otel.captureContent": true
  }
  ```
- Alternative: direct to ingest-api at `http://localhost:3001/v1/traces` (no collector needed)
- Environment variable alternative:
  ```bash
  export COPILOT_OTEL_ENABLED=true
  export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
  export COPILOT_OTEL_CAPTURE_CONTENT=true
  export OTEL_RESOURCE_ATTRIBUTES="team.id=tracereplay,project=tracereplay-ai"
  ```
- Documentation in `docs/connectors/copilot-otel-setup.md`
- Update `docs/runbooks/local-dev.md` with OTel setup steps

**Key files:** `.vscode/settings.json`, `docs/connectors/copilot-otel-setup.md`, `docs/runbooks/local-dev.md`

**Acceptance criteria:**
- [ ] VS Code settings activate Copilot OTel export
- [ ] Traces flow to OTel Collector (or directly to ingest-api)
- [ ] Documentation covers both collector and direct modes
- [ ] Environment variable configuration documented

---

### C1-005 — GenAI semantic convention mapping (spans, metrics, events)

**Goal:** Comprehensive mapping of all OTel GenAI Semantic Convention signals to canonical events.

**Scope:**
- **Spans** (covered by C1-003 at basic level, this is the full mapping):
  - `invoke_agent`: agent name, conversation ID, turn count, total token usage
  - `chat`: model, token counts per call, response time, finish reason
  - `execute_tool`: tool name, type, duration, success status
  - Sub-agent trace propagation: child `invoke_agent` under parent `execute_tool`
- **Metrics** → analytics/aggregation (not canonical events, stored separately):
  - `gen_ai.client.operation.duration` → model call latency histograms
  - `gen_ai.client.token.usage` → token consumption tracking
  - `copilot_chat.tool.call.count` → tool usage frequency
  - `copilot_chat.agent.invocation.duration` → agent performance
  - `copilot_chat.time_to_first_token` → responsiveness metric
- **Events** → canonical events:
  - `gen_ai.client.inference.operation.details` → `model.request` + `model.response`
  - `copilot_chat.session.start` → `run.start`
  - `copilot_chat.tool.call` → `tool.call.start` / `tool.call.end`
  - `copilot_chat.agent.turn` → `annotation` (turn-level metadata)
- **Resource attributes**: `service.name`, `service.version`, `session.id` → run metadata

**Key files:** `packages/connectors-core/src/otel-span-adapter.ts`, `docs/connectors/otel-genai-mapping.md`

**Acceptance criteria:**
- [ ] All GenAI span types mapped to canonical events
- [ ] Metric signals captured and stored (new metrics table or annotation events)
- [ ] OTel events mapped to canonical events
- [ ] Resource attributes extracted into run metadata
- [ ] Mapping documented with examples

---

### C1-006 — Ollama post-processing service (DeepSeek)

**Goal:** Build a background service that sends captured telemetry to a local Ollama (DeepSeek) model for intelligent post-processing: summarization, anomaly detection, pattern extraction, and compliance flagging.

**Scope:**
- New service: `services/ollama-processor/` (or module within `services/worker/`)
- Ollama client using HTTP API (`http://localhost:11434` or configurable `OLLAMA_BASE_URL`)
- BullMQ job types:
  - `run-summary`: After `run.end`, summarize the entire run (what was done, key decisions, side effects)
  - `anomaly-check`: Flag unusual patterns (excessive tool failures, abnormal token usage, long gaps)
  - `compliance-scan`: Check for potential policy violations (sensitive data in prompts, unauthorized tool use)
  - `enrichment`: Add semantic tags and classifications to events
- Results stored as `annotation` events linked to the run
- Model: `deepseek-r1:14b` (configurable via `OLLAMA_MODEL`)
- Timeout handling: `OLLAMA_TIMEOUT_MS=30000`
- Graceful degradation: if Ollama unreachable, log warning and skip (never block pipeline)
- Prompt templates stored in `services/ollama-processor/src/prompts/`

**Key files:**
- `services/ollama-processor/src/index.ts`
- `services/ollama-processor/src/client.ts` (Ollama HTTP client)
- `services/ollama-processor/src/jobs/run-summary.ts`
- `services/ollama-processor/src/jobs/anomaly-check.ts`
- `services/ollama-processor/src/jobs/compliance-scan.ts`
- `services/ollama-processor/src/prompts/`

**Acceptance criteria:**
- [ ] Service connects to Ollama (local or Docker)
- [ ] Run summaries generated after `run.end` events
- [ ] Anomaly detection flags unusual patterns
- [ ] Results stored as annotation events
- [ ] Graceful degradation when Ollama unavailable
- [ ] Unit tests with mocked Ollama responses
- [ ] Works with DeepSeek R1 14B model

---

### C1-007 — Ollama Docker integration (fallback to local)

**Goal:** Add Ollama to Docker Compose for self-contained deployment, with fallback to local Ollama instance.

**Scope:**
- Add `ollama` service to `docker-compose.yml` using `ollama/ollama` image
- Pre-pull `deepseek-r1:14b` model on first start (init script or entrypoint)
- GPU passthrough configuration (optional, with CPU fallback)
- Environment variables:
  ```env
  OLLAMA_BASE_URL=http://ollama:11434  # Docker
  # or
  OLLAMA_BASE_URL=http://host.docker.internal:11434  # Local Ollama on host
  ```
- Configuration priority: local Ollama > Docker Ollama > disabled
- Health check: `curl http://ollama:11434/api/tags`
- Volume mount for model cache persistence

**Key files:** `docker-compose.yml`, `docker-compose.dev.yml`, `infrastructure/ollama/`

**Acceptance criteria:**
- [ ] Ollama service starts in Docker Compose
- [ ] DeepSeek model available after startup
- [ ] Processor service can reach Ollama
- [ ] Falls back to host Ollama if Docker Ollama unavailable
- [ ] Model cache persisted across restarts

---

### C1-008 — MCP server: OTel context propagation

**Goal:** Enhance the MCP server to propagate OpenTelemetry trace context so MCP tool calls appear in the same trace as VS Code Copilot's native telemetry.

**Scope:**
- Read `traceparent` / `tracestate` headers from incoming MCP requests
- Propagate OTel context to telemetry events emitted by the MCP server
- When both MCP telemetry and OTel traces are active, link them via shared trace ID
- This creates unified traces: Copilot's internal reasoning + MCP tool calls in one trace tree

**Key files:** `services/tracereplay-mcp/src/index.ts`

**Acceptance criteria:**
- [ ] MCP server extracts OTel trace context from requests
- [ ] Emitted events include trace ID from propagated context
- [ ] Unified traces visible in replay timeline
- [ ] Unit tests

---

### C1-009 — OTel metrics → run analytics pipeline

**Goal:** Capture OTel metrics (histograms, counters) and store them for run-level analytics.

**Scope:**
- `POST /v1/metrics` — OTLP HTTP metrics endpoint in ingest-api
- Parse metric data points: histograms, counters
- Store in new `run_metrics` table (runId, metricName, value, timestamp, attributes)
- DB migration: `005_run_metrics.sql`
- Query service: `GET /v1/runs/:runId/metrics` endpoint
- Metrics captured:
  - Token usage per run (input/output)
  - Tool call counts and durations
  - Agent invocation duration
  - Time to first token
  - Model call latency

**Key files:** `services/ingest-api/src/routes/otlp-metrics.ts`, `infrastructure/db/migrations/005_run_metrics.sql`, `services/query-service/src/routes/metrics.ts`

**Acceptance criteria:**
- [ ] OTLP metrics endpoint accepts metric data
- [ ] Metrics stored in database
- [ ] Query service returns metrics for a run
- [ ] Dashboard-ready data format
- [ ] Unit tests

---

### C1-010 — Integration test: Copilot OTel → ingest → normalize → replay

**Goal:** End-to-end test proving VS Code Copilot OTel traces flow through the full pipeline.

**Scope:**
- Fixture: realistic Copilot OTel JSON trace (invoke_agent → chat → execute_tool → chat)
- Send fixture to OTLP endpoint
- Verify normalization produces correct canonical events
- Verify replay timeline shows correct agent interaction flow
- Verify token counts, durations, tool names preserved

**Key files:** `tests/integration/otel-copilot-pipeline.test.ts`, `tests/fixtures/otel/copilot-trace.json`

**Acceptance criteria:**
- [ ] Fixture sent via OTLP endpoint
- [ ] Canonical events match expected types and payloads
- [ ] Replay timeline correct
- [ ] Token counts and durations preserved

---

### C1-011 — OTel Codex/Claude adapter extensions

**Goal:** Extend the OTel adapter to handle telemetry from OpenAI Codex CLI and Claude Code when they support OTel export.

**Scope:**
- Detect vendor from `service.name` resource attribute:
  - `copilot-chat` → GitHub Copilot
  - `codex-cli` → OpenAI Codex (anticipated)
  - `claude-code` → Claude Code (anticipated)
- Vendor-specific attribute mappings where conventions differ
- Fallback: generic OTel GenAI mapping for unknown vendors

**Key files:** `packages/connectors-core/src/otel-span-adapter.ts`

**Acceptance criteria:**
- [ ] Vendor auto-detection from resource attributes
- [ ] Vendor-specific mappings where needed
- [ ] Generic fallback for unknown OTel sources
- [ ] Unit tests

---

### C1-012 — Enrichment queue: Ollama background processing via BullMQ

**Goal:** Wire the Ollama processor to the event pipeline via BullMQ so enrichment happens asynchronously after event persistence.

**Scope:**
- New BullMQ queue: `ollama-enrichment`
- Trigger: after canonical events persisted (post-normalization hook)
- Job types: `run-summary`, `anomaly-check`, `compliance-scan`, `enrichment`
- Rate limiting: max N concurrent Ollama calls (Ollama is single-model, limited concurrency)
- Priority: `run-summary` after `run.end`, others on periodic schedule
- Dead-letter queue for failed enrichment jobs
- Dashboard visibility in web UI (future)

**Key files:** `services/worker/src/queues/ollama-enrichment.ts`, `services/ollama-processor/src/`

**Acceptance criteria:**
- [ ] BullMQ queue processes enrichment jobs
- [ ] Ollama called with correct prompts
- [ ] Results persisted as annotation events
- [ ] Rate limiting prevents Ollama overload
- [ ] DLQ for failures
- [ ] Unit tests

---

### F4-004 — Evidence integrity hash chain (from Foundation-4)

**Goal:** Ensure evidence bundles are tamper-evident with cryptographic hash chains.

**Scope:**
- Each event in bundle gets a hash: `SHA-256(eventId + timestamp + payload + previousHash)`
- Bundle-level root hash (Merkle-like): hash of all event hashes
- `IntegrityVerifier` class: recomputes hashes and verifies chain integrity
- Verification endpoint: `POST /v1/evidence/bundles/:bundleId/verify`
- Returns: `{ valid: boolean, brokenAt?: eventIndex, expectedHash, actualHash }`
- Store root hash with bundle metadata

**Key files:** `services/evidence-service/src/integrity.ts`, `services/evidence-service/src/routes/verify.ts`

**Acceptance criteria:**
- [ ] Hash chain computed for all events in bundle
- [ ] Root hash stored with bundle
- [ ] Verification detects tampering (modified event)
- [ ] Verify API returns clear pass/fail with details
- [ ] Unit tests covering valid chain, broken chain, empty bundle

---

### F4-007 — Health check endpoints on all services (from Foundation-4)

**Goal:** Add `/health` and `/ready` endpoints to every service for container orchestration.

**Scope:**
- `/health` — liveness: process is running (always 200)
- `/ready` — readiness: dependencies connected (DB, Redis, downstream services)
- Consistent response format: `{ status: "ok"|"degraded"|"unhealthy", checks: { db, redis, ... } }`
- Add to: ingest-api, query-service, normalizer, worker, evidence-service, ollama-processor
- Update Docker Compose health checks to use these endpoints

**Key files:** `services/*/src/routes/health.ts`

**Acceptance criteria:**
- [ ] All services expose `/health` and `/ready`
- [ ] Readiness checks verify DB/Redis connectivity
- [ ] Docker Compose uses new health endpoints
- [ ] Consistent response format across all services
- [ ] Unit tests

---

### F4-008 — CI/CD pipeline (GitHub Actions) (from Foundation-4)

**Goal:** Automated build, test, and lint pipeline on every push and PR.

**Scope:**
- GitHub Actions workflow: `.github/workflows/ci.yml`
- Steps: install pnpm, install deps, typecheck (`tsc --noEmit`), lint, unit tests, build
- Matrix: Node.js 20.x
- PostgreSQL + Redis services for integration tests
- Turbo caching for faster builds

**Key files:** `.github/workflows/ci.yml`

**Acceptance criteria:**
- [ ] CI runs on push to main and all PRs
- [ ] All unit tests pass in CI
- [ ] Integration tests run with real Postgres + Redis
- [ ] Build succeeds for all packages and services

---

### F4-009 — Structured logging with correlation IDs (from Foundation-4)

**Goal:** Consistent JSON logging with `runId` and `eventId` correlation across all services.

**Scope:**
- Shared logger utility in `packages/common` (e.g., pino)
- Log format: `{ level, timestamp, service, runId?, eventId?, message, ...context }`
- Request-scoped correlation: extract `runId` from request path/body, attach to all logs
- Replace `console.log` across all services
- Log levels: error, warn, info, debug

**Key files:** `packages/common/src/logger.ts`, all service entry points

**Acceptance criteria:**
- [ ] All services use structured JSON logger
- [ ] Correlation IDs (runId, eventId) attached to relevant logs
- [ ] Request-scoped logging in Fastify via request decorator
- [ ] Unit tests for logger utility

---

### F4-005 — Side-effect tracking and visualization (from Foundation-4)

**Goal:** Track and display side effects (file writes, API calls, DB mutations, etc.) from AI agent tool executions.

**Scope:**
- Side-effect extraction from tool call results in normalizer
- Query service: `GET /v1/runs/:runId/side-effects` endpoint
- Timeline view: side-effect indicators on tool call events
- Lineage graph: side-effect nodes with distinctive styling

**Key files:** `services/normalizer/src/`, `services/query-service/src/routes/side-effects.ts`, `apps/web/src/components/timeline/`

**Acceptance criteria:**
- [ ] Side-effect events captured during normalization
- [ ] API returns side effects for a run
- [ ] Timeline shows side-effect indicators
- [ ] Unit tests

---

### F4-006 — Query service: advanced filters (from Foundation-4)

**Goal:** Enable advanced filtering on runs and events by tool name, side-effect type, and error category.

**Scope:**
- `GET /v1/runs` extended filters: `toolName`, `errorType`, `hasSideEffects`
- `GET /v1/events` extended filters: `toolName`, `sideEffectType`, `errorCategory`
- Efficient DB queries with appropriate indexes

**Key files:** `services/query-service/src/routes/runs.ts`, `services/query-service/src/routes/events.ts`

**Acceptance criteria:**
- [ ] Runs filterable by tool name, error type, side-effect presence
- [ ] Events filterable by tool, side effect, error
- [ ] DB indexes support efficient queries
- [ ] Unit tests

---

## Architecture: OTel + Ollama Pipeline

```
┌──────────────────────────────────────┐
│   VS Code Copilot / Codex / Claude   │
│   (OTel enabled: spans + metrics)    │
└──────────────┬───────────────────────┘
               │ OTLP (HTTP :4318 / gRPC :4317)
               ▼
┌──────────────────────────────────────┐
│       OTel Collector (Docker)        │
│  receivers: otlp                     │
│  processors: batch, memory_limiter   │
│  exporters: otlphttp → ingest-api   │
│             logging (debug)          │
└──────────────┬───────────────────────┘
               │ OTLP HTTP
               ▼
┌──────────────────────────────────────┐
│          Ingest API                  │
│  POST /v1/traces  (OTLP spans)      │
│  POST /v1/metrics (OTLP metrics)    │
│  POST /v1/raw-events (existing)     │
└───────┬──────────────┬───────────────┘
        │ BullMQ       │ BullMQ
        ▼              ▼
┌──────────────┐ ┌─────────────────────┐
│  Normalizer  │ │   Ollama Processor  │
│  OTelSpan    │ │   (DeepSeek R1)     │
│  Adapter     │ │                     │
└──────┬───────┘ │  • Run summaries    │
       │         │  • Anomaly detection│
       ▼         │  • Compliance scan  │
┌──────────────┐ │  • Event enrichment │
│ Event Store  │ └──────┬──────────────┘
│ (PostgreSQL) │◄───────┘ annotation events
└──────────────┘
       │
       ▼
  Replay / Lineage / Evidence / Web UI
```

## VS Code Configuration (Quick Start)

### Option A: Via OTel Collector (recommended)
```json
// .vscode/settings.json
{
  "github.copilot.chat.otel.enabled": true,
  "github.copilot.chat.otel.exporterType": "otlp-http",
  "github.copilot.chat.otel.otlpEndpoint": "http://localhost:4318",
  "github.copilot.chat.otel.captureContent": true
}
```

### Option B: Direct to ingest-api (no collector)
```json
{
  "github.copilot.chat.otel.enabled": true,
  "github.copilot.chat.otel.exporterType": "otlp-http",
  "github.copilot.chat.otel.otlpEndpoint": "http://localhost:3001",
  "github.copilot.chat.otel.captureContent": true
}
```

### Environment variables (alternative)
```bash
export COPILOT_OTEL_ENABLED=true
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
export COPILOT_OTEL_CAPTURE_CONTENT=true
export OTEL_RESOURCE_ATTRIBUTES="team.id=tracereplay,project=tracereplay-ai"
```

---

## Notes

- **Tier 1 is the critical path** — C1-001 + C1-002 + C1-003 in parallel, C1-006 independent
- C1-004 (VS Code settings) can be tested as soon as C1-001 is up
- F4-004 (integrity hash) can be done in parallel — finishes the evidence trio from F4
- Tier 2 starts once Tier 1 core works: C1-010 (integration test) proves the pipeline
- F4-007/F4-008/F4-009 are infra improvements needed for new services anyway
- DeepSeek R1 14B is already on the host machine — use `host.docker.internal:11434` for Docker services
- Content capture (`captureContent: true`) is essential for meaningful post-processing
- Never block the ingest pipeline on Ollama — all enrichment is async
- Deferred items (C1-011, F4-010, F4-011, F4-012) go to a future sprint once data flows

## Sprint exit criteria

- [ ] OTel Collector receives Copilot traces and forwards to ingest-api
- [ ] OTLP endpoint in ingest-api parses spans into raw vendor events
- [ ] OTelSpanAdapter normalizes GenAI spans to canonical events
- [ ] VS Code Copilot OTel export configured and documented
- [ ] Ollama processor generates run summaries from captured telemetry
- [ ] Evidence integrity hash chain verifies bundle tampering (F4-004)
- [ ] Integration test proves end-to-end Copilot OTel → replay pipeline
- [ ] Health checks, structured logging, and CI/CD in place
- [ ] All new code has unit test coverage > 80%
