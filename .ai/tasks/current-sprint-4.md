# TraceReplay AI — Sprint: Foundation-4

## Goal
Build the Evidence & Compliance layer so users can assemble audit-ready evidence bundles from runs, export them in JSON/PDF, and verify integrity. Also add side-effect tracking, advanced query filters, and production-readiness foundations (health checks, CI/CD, structured logging).

## Dependencies
- **Milestones 1–3 complete** — event-schema, ingest-api, replay-engine, SDK, query-service, graph-model, normalizer, worker, web app, redaction engine, sub-agent linking, Docker Compose all merged and tested.

---

## Tasks

| ID | Task | Status | Priority | Est |
|----|------|--------|----------|-----|
| F4-001 | Evidence service: assemble run evidence bundles | ✅ | P0 | L |
| F4-002 | JSON export format for evidence bundles | ✅ | P0 | M |
| F4-003 | PDF summary generation for evidence bundles | 🔲 | P0 | L |
| F4-004 | Evidence integrity hash chain | 🔲 | P0 | M |
| F4-005 | Side-effect tracking and visualization | 🔲 | P1 | L |
| F4-006 | Query service: search by tool, side effect, error type | 🔲 | P1 | M |
| F4-007 | Health check endpoints on all services | 🔲 | P1 | S |
| F4-008 | CI/CD pipeline (GitHub Actions) | 🔲 | P1 | M |
| F4-009 | Structured logging with correlation IDs | 🔲 | P2 | M |
| F4-010 | Auto-instrumentation helpers for SDK | 🔲 | P2 | M |
| F4-011 | LangGraph/LangChain adapter | 🔲 | P2 | L |
| F4-012 | Evidence UI: bundle viewer and export controls | 🔲 | P2 | M |

Est: S = small (< half day), M = medium (half–full day), L = large (1–2 days)

---

## Task details

### F4-001 — Evidence service: assemble run evidence bundles

**Goal:** Build the service that assembles all events, metadata, lineage, and redaction audit trails for a run into a single evidence bundle.

**Scope:**
- `EvidenceBundle` type: run metadata, ordered events, lineage graph, redaction audit, assembly timestamp
- `EvidenceBundleAssembler` class: queries run data, events, graph, redaction results
- Assembles from query-service data (internal API calls or direct DB)
- Handles partial runs (still in progress) with appropriate markers
- API endpoint: `POST /v1/evidence/bundles` (create bundle for a run)
- API endpoint: `GET /v1/evidence/bundles/:bundleId` (retrieve assembled bundle)
- Stores assembled bundles with status tracking (pending, complete, failed)

**Key files:** `services/evidence-service/src/assembler.ts`, `services/evidence-service/src/types.ts`, `services/evidence-service/src/routes/bundles.ts`

**Acceptance criteria:**
- [ ] EvidenceBundleAssembler produces complete bundles from run data
- [ ] Bundle includes all events in order, lineage graph, redaction audit
- [ ] Partial runs handled gracefully with markers
- [ ] REST API endpoints for create/retrieve bundles
- [ ] Unit tests with >80% coverage

---

### F4-002 — JSON export format for evidence bundles

**Goal:** Export evidence bundles as structured, self-describing JSON files.

**Scope:**
- `EvidenceJsonExporter` class: serializes bundle to JSON with schema version
- JSON schema includes: `schemaVersion`, `exportedAt`, `run`, `events[]`, `lineage`, `redactionAudit`, `integrityHash`
- Zod schema for export format validation
- API endpoint: `GET /v1/evidence/bundles/:bundleId/export?format=json`
- Content-Disposition header for file download

**Key files:** `services/evidence-service/src/exporters/json-exporter.ts`, `services/evidence-service/src/routes/export.ts`

**Acceptance criteria:**
- [ ] JSON export includes all bundle data with schema version
- [ ] Export validates against Zod schema
- [ ] API returns downloadable JSON file
- [ ] Round-trip: export → re-import validates correctly
- [ ] Unit tests

---

### F4-003 — PDF summary generation for evidence bundles

**Goal:** Generate human-readable PDF summaries of evidence bundles for compliance review.

**Scope:**
- `EvidencePdfExporter` class: generates PDF from bundle data
- Sections: executive summary, run metadata, event timeline (table), key decisions, tool calls, errors, redacted fields summary
- Use a Node.js PDF library (e.g., `pdfkit` or `@react-pdf/renderer`)
- API endpoint: `GET /v1/evidence/bundles/:bundleId/export?format=pdf`
- Configurable: which sections to include, detail level (summary vs full)

**Key files:** `services/evidence-service/src/exporters/pdf-exporter.ts`

**Acceptance criteria:**
- [ ] PDF renders with all required sections
- [ ] Run metadata, event timeline, and error summary included
- [ ] Redacted fields shown as `[REDACTED]` in PDF
- [ ] API returns downloadable PDF file
- [ ] Configurable section inclusion
- [ ] Unit tests

---

### F4-004 — Evidence integrity hash chain

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

### F4-005 — Side-effect tracking and visualization

**Goal:** Track and display side effects (file writes, API calls, DB mutations, etc.) from AI agent tool executions.

**Scope:**
- Extend event schema: `side_effect` event subtype fields (target system, operation, reversible flag)
- Side-effect extraction from tool call results in normalizer
- Query service: `GET /v1/runs/:runId/side-effects` endpoint
- Timeline view: side-effect indicators on tool call events
- Lineage graph: side-effect nodes with distinctive styling
- DB migration if schema changes needed

**Key files:** `services/normalizer/src/`, `services/query-service/src/routes/side-effects.ts`, `apps/web/src/components/timeline/`, `packages/graph-model/src/`

**Acceptance criteria:**
- [ ] Side-effect events captured during normalization
- [ ] API returns side effects for a run
- [ ] Timeline shows side-effect indicators
- [ ] Lineage graph includes side-effect nodes
- [ ] Unit tests

---

### F4-006 — Query service: search by tool, side effect, error type

**Goal:** Enable advanced filtering on runs and events by tool name, side-effect type, and error category.

**Scope:**
- `GET /v1/runs` extended filters: `toolName`, `errorType`, `hasSideEffects`
- `GET /v1/events` extended filters: `toolName`, `sideEffectType`, `errorCategory`
- Efficient DB queries with appropriate indexes
- Frontend: advanced filter panel on run list page

**Key files:** `services/query-service/src/routes/runs.ts`, `services/query-service/src/routes/events.ts`, `apps/web/src/app/runs/page.tsx`

**Acceptance criteria:**
- [ ] Runs filterable by tool name, error type, side-effect presence
- [ ] Events filterable by tool, side effect, error
- [ ] DB indexes support efficient queries
- [ ] Frontend filter panel updated
- [ ] Unit tests

---

### F4-007 — Health check endpoints on all services

**Goal:** Add `/health` and `/ready` endpoints to every service for container orchestration.

**Scope:**
- `/health` — liveness: process is running (always 200)
- `/ready` — readiness: dependencies connected (DB, Redis, downstream services)
- Consistent response format: `{ status: "ok"|"degraded"|"unhealthy", checks: { db, redis, ... } }`
- Add to: ingest-api, query-service, normalizer, worker
- Update Docker Compose health checks to use these endpoints

**Key files:** `services/ingest-api/src/routes/health.ts`, `services/query-service/src/routes/health.ts`, `services/normalizer/src/routes/health.ts`, `services/worker/src/routes/health.ts`

**Acceptance criteria:**
- [ ] All services expose `/health` and `/ready`
- [ ] Readiness checks verify DB/Redis connectivity
- [ ] Docker Compose uses new health endpoints
- [ ] Consistent response format across all services
- [ ] Unit tests

---

### F4-008 — CI/CD pipeline (GitHub Actions)

**Goal:** Automated build, test, and lint pipeline on every push and PR.

**Scope:**
- GitHub Actions workflow: `.github/workflows/ci.yml`
- Steps: install pnpm, install deps, typecheck (`tsc --noEmit`), lint, unit tests, build
- Matrix: Node.js 20.x
- PostgreSQL + Redis services for integration tests
- Turbo caching for faster builds
- Branch protection: require CI pass before merge

**Key files:** `.github/workflows/ci.yml`

**Acceptance criteria:**
- [ ] CI runs on push to main and all PRs
- [ ] TypeScript typecheck passes
- [ ] All unit tests pass in CI
- [ ] Integration tests run with real Postgres + Redis
- [ ] Build succeeds for all packages and services

---

### F4-009 — Structured logging with correlation IDs

**Goal:** Consistent JSON logging with `runId` and `eventId` correlation across all services.

**Scope:**
- Shared logger utility in `packages/common` (e.g., pino)
- Log format: `{ level, timestamp, service, runId?, eventId?, message, ...context }`
- Request-scoped correlation: extract `runId` from request path/body, attach to all logs
- Replace `console.log` calls across all services
- Log levels: error, warn, info, debug

**Key files:** `packages/common/src/logger.ts`, all service entry points

**Acceptance criteria:**
- [ ] All services use structured JSON logger
- [ ] Correlation IDs (runId, eventId) attached to relevant logs
- [ ] Request-scoped logging in Fastify via request decorator
- [ ] No remaining `console.log` in service code
- [ ] Unit tests for logger utility

---

### F4-010 — Auto-instrumentation helpers for SDK

**Goal:** Provide convenience wrappers that automatically instrument common patterns.

**Scope:**
- `wrapFunction(fn, opts)` — wraps any async function to emit start/end events
- `wrapToolCall(fn, toolName)` — specialized wrapper for tool executions
- `withTracing(handler)` — Express/Fastify middleware that auto-traces requests
- Automatic error capture and event emission on exceptions
- Zero-config: works with just a `TraceReplayClient` instance

**Key files:** `packages/sdk-typescript/src/auto-instrument.ts`, `packages/sdk-typescript/src/middleware.ts`

**Acceptance criteria:**
- [ ] `wrapFunction` emits start/end events around execution
- [ ] `wrapToolCall` captures tool name, args, result, duration
- [ ] Error events auto-emitted on exceptions
- [ ] Middleware traces HTTP requests
- [ ] Unit tests

---

### F4-011 — LangGraph/LangChain adapter

**Goal:** Accept and normalize telemetry from LangGraph and LangChain agent frameworks.

**Scope:**
- `LangChainAdapter` extending `BaseAgentAdapter`
- Map LangChain callback events → canonical events
- Support: LLM calls, chain runs, tool invocations, agent actions, errors
- `LangGraphAdapter` extending `LangChainAdapter` for graph-specific events
- Handle LangGraph node transitions, conditional edges, checkpoints
- Normalize LangChain metadata (model, tokens, cost) to canonical fields

**Key files:** `packages/connectors-core/src/langchain-adapter.ts`, `packages/connectors-core/src/langgraph-adapter.ts`

**Acceptance criteria:**
- [ ] LangChain callback events mapped to canonical types
- [ ] LangGraph node transitions and graph structure captured
- [ ] Adapter handles partial/streaming events gracefully
- [ ] Unit tests with fixture data (>80% coverage)
- [ ] Integration test with simulated LangChain trace

---

### F4-012 — Evidence UI: bundle viewer and export controls

**Goal:** Add frontend pages for viewing evidence bundles and triggering exports.

**Scope:**
- `/runs/[runId]/evidence` page: assemble & view evidence for a run
- Bundle viewer: run summary, event list, lineage snapshot, redaction audit
- Export buttons: download as JSON, download as PDF
- Integrity status badge: verified / unverified / failed
- Integration with evidence-service API

**Key files:** `apps/web/src/app/runs/[runId]/evidence/page.tsx`, `apps/web/src/components/evidence/`

**Acceptance criteria:**
- [ ] Evidence page shows bundle data for a run
- [ ] JSON and PDF export buttons trigger downloads
- [ ] Integrity verification status displayed
- [ ] Loading/error/empty states handled
- [ ] Unit tests for components

---

## Sequencing & dependencies

```
F4-001 (Evidence assembler)  ──┐
F4-007 (Health checks)       ──┤── parallel, no deps
F4-008 (CI/CD)               ──┤
F4-009 (Structured logging)  ──┤
F4-010 (Auto-instrumentation)──┤
F4-011 (LangChain adapter)   ──┘

F4-002 (JSON export)          ←── depends on F4-001
F4-003 (PDF export)           ←── depends on F4-001
F4-004 (Integrity hashing)    ←── depends on F4-001
F4-005 (Side-effect tracking) ←── independent (cross-cutting)
F4-006 (Advanced queries)     ←── depends on F4-005 (for side-effect filters)

F4-012 (Evidence UI)          ←── depends on F4-001, F4-002, F4-003, F4-004
```

**Recommended order:**
1. **Parallel batch 1:** F4-001 (evidence assembler), F4-005 (side effects), F4-007 (health), F4-008 (CI/CD), F4-009 (logging), F4-010 (auto-instrument), F4-011 (LangChain)
2. **Parallel batch 2:** F4-002 (JSON export), F4-003 (PDF export), F4-004 (integrity), F4-006 (advanced queries)
3. **Parallel batch 3:** F4-012 (evidence UI)

## Sprint exit criteria

- [ ] Evidence bundles can be assembled from run data
- [ ] JSON and PDF export formats produce valid output
- [ ] Hash chain verifies bundle integrity
- [ ] Side effects tracked and visible in timeline and lineage
- [ ] Advanced filters work (tool, error type, side effects)
- [ ] All services have health/readiness endpoints
- [ ] CI/CD pipeline runs on every PR
- [ ] Structured logging with correlation IDs across all services
- [ ] LangChain/LangGraph telemetry can be ingested and normalized
- [ ] Evidence UI allows viewing and exporting bundles
- [ ] All new code has unit test coverage > 80%
