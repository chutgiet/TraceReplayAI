# TraceReplay AI — Sprint: Foundation-2

## Goal
Stand up the SDK, query service, and normalizer so real agent telemetry can be ingested, normalized, queried, and replayed end-to-end.

## Dependencies
- **Milestone 1 complete** — event-schema, ingest-api, replay-engine, fixtures, DB schema all merged and tested.

---

## Tasks

| ID | Task | Status | Priority | Est |
|----|------|--------|----------|-----|
| F2-001 | TypeScript SDK: lightweight event client | ✅ | P0 | M |
| F2-002 | Query service: list runs + get run details | ✅ | P0 | M |
| F2-003 | Query service: run timeline API | ✅ | P0 | S |
| F2-004 | Out-of-order event handling in ingest-api | ✅ | P1 | M |
| F2-005 | Normalizer service: vendor → canonical mapping | ✅ | P1 | L |
| F2-006 | Worker service: BullMQ async job processing | Not started | P1 | M |
| F2-007 | Lineage graph model: core data structures | Not started | P2 | M |
| F2-008 | Integration test: SDK → ingest → query → replay | Not started | P2 | S |

Est: S = small (< half day), M = medium (half–full day), L = large (1–2 days)

---

## Task details

### F2-001 — TypeScript SDK: lightweight event client

**Goal:** Provide a zero-dependency (beyond `event-schema`) client that sends events to the ingest API.

**Scope:**
- `TraceReplayClient` class with `init({ endpoint, apiKey?, tenantId })` config
- `sendEvent(event)` — POST to `/v1/events`
- `sendBatch(events)` — POST to `/v1/events/batch`
- `startRun(opts) → RunTracer` helper that auto-generates runId + emits `run.start`
- `RunTracer` abstraction: `logPrompt()`, `logToolCall()`, `logError()`, `end()` convenience methods
- Automatic retry with exponential backoff (configurable)
- Offline buffering: queue events in memory if endpoint unreachable, flush on reconnect
- Zod validation before send (opt-in, disabled by default for perf)

**Key files:** `packages/sdk-typescript/src/client.ts`, `run-tracer.ts`, `types.ts`, `index.ts`

**Acceptance criteria:**
- [ ] `TraceReplayClient` can send single + batch events
- [ ] `RunTracer` convenience methods produce valid canonical events
- [ ] Retry logic handles 5xx and network errors
- [ ] Unit tests for client, run-tracer, retry
- [ ] README with usage examples

---

### F2-002 — Query service: list runs + get run details

**Goal:** Expose REST endpoints for retrieving runs and their events.

**Scope:**
- `GET /v1/runs` — list runs with filters (status, agentId, tenantId, time range), pagination (cursor-based)
- `GET /v1/runs/:runId` — get run details + summary
- `GET /v1/runs/:runId/events` — get events for a run (ordered)
- Reuse `packages/common/db` queries, add new query functions as needed
- Zod validation on query parameters

**Key files:** `services/query-service/src/index.ts`, `routes/runs.ts`, `routes/events.ts`

**Acceptance criteria:**
- [ ] List runs with filter + pagination works
- [ ] Get single run returns run row + computed summary
- [ ] Get run events returns ordered event list
- [ ] Query params validated with Zod
- [ ] Unit tests for route handlers

---

### F2-003 — Query service: run timeline API

**Goal:** Expose the replay engine's timeline as an API endpoint.

**Scope:**
- `GET /v1/runs/:runId/timeline` — returns the `ReplayTimeline` object (entries, gaps, summary)
- Wires `replay-engine.buildTimeline()` to the query service
- This is the primary API for the future frontend replay view

**Key files:** `services/query-service/src/routes/timeline.ts`

**Acceptance criteria:**
- [ ] Timeline endpoint returns `ReplayTimeline` for a valid run
- [ ] 404 for unknown runId
- [ ] Response includes entries, gaps, and summary

---

### F2-004 — Out-of-order event handling in ingest-api

**Goal:** Accept events that arrive out of sequence order and ensure the replay engine still produces correct timelines.

**Scope:**
- Ingest-api currently persists events as they arrive. No change needed on write path (events are already stored with their source timestamp + optional sequence).
- Add `sequence_number` auto-increment column to `events` table (ingestion order vs. source order) via migration `002_add_ingestion_order.sql`
- Replay engine already sorts by timestamp+sequence, so timeline is correct regardless of arrival order
- Add explicit integration test: send events out of order → verify timeline is correctly ordered
- Document the strategy in an ADR

**Key files:** `infrastructure/db/migrations/002_add_ingestion_order.sql`, `tests/integration/out-of-order.test.ts`

**Acceptance criteria:**
- [ ] New migration adds ingestion order tracking
- [ ] Integration test proves out-of-order delivery produces correct timeline
- [ ] ADR documents the strategy

---

### F2-005 — Normalizer service: vendor → canonical mapping

**Goal:** Build the normalizer service that transforms raw vendor telemetry into canonical events, with a vendor-neutral adapter architecture.

**Scope (delivered):**
- `NormalizerAdapter` interface + `AdapterRegistry` in `packages/connectors-core/src/types.ts`
- Vendor-neutral `BaseAgentAdapter` abstract class with template method pattern (`base-agent-adapter.ts`)
- `TraceFieldMapping` interface for configurable envelope field extraction across vendors
- Shared `adapter-utils.ts` with variadic field extractors, branded ID constructors, status/policy mappers
- `PassthroughAdapter` for events already in canonical format
- `OpenAIAgentsAdapter` — maps OpenAI Agents SDK traces (agent.start/end, tool_call.*, generation.*, guardrail.*, handoff)
- `GitHubCopilotAdapter` — maps GitHub Copilot agent traces (copilot.session.*, copilot.tool.*, copilot.completion.*)
- `ClaudeCodeAdapter` — maps Anthropic Claude Code traces (conversation.*, tool_use.*, inference.*, permission.*)
- `NormalizationService` with batch processing, stats tracking, dead-letter counter
- `NormalizationProcessor` with BullMQ queue consumer, retry config, dead-letter queue
- Normalizer Fastify service with health check, Redis connection, graceful shutdown

**Key files:**
- `packages/connectors-core/src/types.ts` — NormalizerAdapter, AdapterRegistry, RawVendorEvent
- `packages/connectors-core/src/base-agent-adapter.ts` — BaseAgentAdapter, TraceFieldMapping
- `packages/connectors-core/src/adapter-utils.ts` — shared utilities
- `packages/connectors-core/src/passthrough-adapter.ts` — PassthroughAdapter
- `packages/connectors-core/src/openai-agents-adapter.ts` — OpenAIAgentsAdapter
- `packages/connectors-core/src/github-copilot-adapter.ts` — GitHubCopilotAdapter
- `packages/connectors-core/src/claude-code-adapter.ts` — ClaudeCodeAdapter
- `services/normalizer/src/services/normalization-service.ts` — NormalizationService
- `services/normalizer/src/queues/normalization-processor.ts` — BullMQ processor + DLQ

**Acceptance criteria:**
- [x] `NormalizerAdapter` interface defined
- [x] Passthrough adapter works for canonical events
- [x] OpenAI Agents adapter maps basic trace data
- [x] Dead-letter queue for failed normalization
- [x] Unit tests for adapters (109 tests across 5 test files in connectors-core)
- [x] Vendor-neutral `BaseAgentAdapter` with pluggable field mappings
- [x] GitHub Copilot adapter (22 tests)
- [x] Claude Code adapter (28 tests)
- [x] Normalizer service tests (12 tests)

---

### F2-006 — Worker service: BullMQ async job processing

**Goal:** Set up the worker service with BullMQ to process async jobs (normalization, future indexing).

**Scope:**
- BullMQ connection to Redis (config from env vars)
- `normalization` queue: picks up raw events, dispatches to normalizer
- Job retry configuration (3 retries, exponential backoff)
- Health check endpoint
- Graceful shutdown handling

**Key files:** `services/worker/src/index.ts`, `services/worker/src/queues/normalization.ts`

**Acceptance criteria:**
- [ ] Worker connects to Redis and processes jobs
- [ ] Normalization queue dispatches to normalizer adapters
- [ ] Retry + dead-letter config working
- [ ] Health check endpoint returns status
- [ ] Graceful shutdown on SIGTERM

---

### F2-007 — Lineage graph model: core data structures

**Goal:** Define the data structures that represent causal lineage graphs.

**Scope:**
- `LineageNode` type (wraps an event or run with graph metadata)
- `LineageEdge` type (causal, temporal, data-flow edge types)
- `LineageGraph` type (nodes + edges + query helpers)
- `buildLineageGraph(timeline: ReplayTimeline) → LineageGraph` function
- Edge types: `caused_by` (parent→child), `followed_by` (temporal), `delegated_to` (sub-run)

**Key files:** `packages/graph-model/src/types.ts`, `packages/graph-model/src/builder.ts`, `packages/graph-model/src/index.ts`

**Acceptance criteria:**
- [ ] Types exported from `@tracereplay/graph-model`
- [ ] Builder produces valid graph from replay timeline
- [ ] Unit tests with fixture data
- [ ] Graph supports traversal (ancestors, descendants of a node)

---

### F2-008 — Integration test: SDK → ingest → query → replay

**Goal:** End-to-end test proving data flows from SDK through to query API and replay.

**Scope:**
- Use the TypeScript SDK to emit a sequence of events
- Query the runs list and verify the run appears
- Fetch the timeline and verify it matches expected structure
- This validates the full data path before UI work begins

**Key files:** `tests/integration/sdk-to-replay.test.ts`

**Acceptance criteria:**
- [ ] SDK sends events → ingest-api persists
- [ ] Query service returns the run and events
- [ ] Timeline API returns correct replay timeline
- [ ] Test runs in CI (Docker Compose for deps)

---

## Sequencing & dependencies

```
F2-001 (SDK)          ──┐
F2-002 (Query: runs)  ──┤
F2-003 (Query: timeline) ← depends on F2-002
F2-004 (Out-of-order) ──┤── can be parallel
F2-006 (Worker)       ──┤
F2-005 (Normalizer)   ──┘← depends on F2-006 + connectors-core
F2-007 (Graph model)  ──── independent
F2-008 (E2E test)     ──── depends on F2-001, F2-002, F2-003
```

**Recommended order:**
1. **Parallel batch 1:** F2-001 (SDK), F2-002 (Query runs/events), F2-004 (Out-of-order), F2-007 (Graph model)
2. **Parallel batch 2:** F2-003 (Query timeline), F2-006 (Worker)
3. **Sequential:** F2-005 (Normalizer — needs worker + connectors-core)
4. **Final:** F2-008 (E2E integration test — validates everything)

## Sprint exit criteria

- [x] SDK can send events to ingest-api and receive success responses
- [x] Query service exposes runs, events, and timeline endpoints
- [x] Out-of-order ingestion is tested and documented
- [x] Normalizer can process at least one vendor format (OpenAI + Copilot + Claude)
- [ ] Worker service processes async jobs from Redis queue
- [ ] Lineage graph model produces correct graphs from timelines
- [ ] End-to-end integration test passes
- [ ] All new code has unit test coverage > 80%
