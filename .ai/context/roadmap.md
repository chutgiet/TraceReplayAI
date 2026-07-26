# TraceReplay AI — Roadmap

## Milestone 1: Foundation (Complete ✅)
> Goal: Establish canonical event model, basic ingestion, and replay

- [x] Repository structure and monorepo setup
- [x] Engineering system prompts and agent context
- [x] `event-schema` package: types, Zod validators, constants
- [x] `common` package: shared utilities, DB pool, queries
- [x] `ingest-api` service: REST endpoint, schema validation, persistence
- [x] Database schema: events table, runs table, migrations
- [x] `replay-engine` package: timeline construction, causal depth, gap detection, run summary
- [x] Fixture suite: 5 canonical event sequences with Zod-validated loader
- [x] Test coverage: 68 unit tests, 67 fixture tests, 13 integration tests

## Milestone 2: Normalization + SDK (Complete ✅)
> Goal: Accept telemetry from real agent frameworks

- [x] `normalizer` service: map raw telemetry → canonical events
- [x] `sdk-typescript` package: lightweight ingestion client
- [x] Adapter: OpenAI Agents SDK telemetry (41 tests)
- [x] Adapter: GitHub Copilot telemetry (22 tests)
- [x] Adapter: Anthropic Claude Code telemetry (28 tests)
- [x] Idempotent ingestion (dedup by event ID)
- [x] Out-of-order event handling + ADR
- [x] Worker service for async normalization (BullMQ)
- [x] Query service: runs, events, timeline APIs
- [x] Lineage graph model: types, builder, queries, serialization (97 tests)
- [x] Integration test: SDK → ingest → query → replay
- [x] 417 unit/fixture tests passing across all packages

## Milestone 3: Investigation UI (Complete ✅)
> Goal: Visual replay and basic investigation

- [x] `apps/web`: Next.js scaffold with Tailwind
- [x] Run list view with search/filter
- [x] Run detail / replay timeline view
- [x] Event detail panel (expand/collapse)
- [x] Lineage graph visualization (basic)
- [x] Empty/error/loading states
- [x] `packages/ui`: shared component library
- [x] Full-text search across event payloads
- [x] Redaction engine with configurable rules
- [x] Docker Compose for full local stack
- [x] Sub-agent run linking
- [x] TraceReplay MCP server for live AI agent session capture (stdio + SSE)

## Milestone 4: Evidence + Compliance (Partially complete — superseded by ADR-0005 re-plan)
> Goal: Generate audit-ready evidence bundles and trace side effects

- [x] `graph-model` package: lineage data structures
- [x] Parent-child run linking (sub-agent delegation)
- [x] `evidence-service`: assemble run evidence
- [x] Export formats: JSON, PDF summary
- [x] Evidence integrity hashing (retroactive chain — moves to write-time in M5)
- [ ] Side-effect tracking and visualization (→ M5, sourced from Ring 3)
- [ ] Query service: search by tool, side effect, error type (→ backlog)
- [ ] Redaction audit trail (→ backlog)

## Milestone 5: Capture Integrity — Three-Ring Interception (CURRENT · ADR-0005)
> Goal: Replace cooperative parallel-tool capture with transport-level interception and a tamper-evident decision ledger. Record-only mode, zero config.

- [ ] Decision record event schema: agent identity assertion, proposed action + full params, policy version hash, verdict, evidence refs, prior-record hash
- [ ] Write-time hash chaining: `chain_hash` computed at persistence per run; evidence-service verifies stored chain
- [ ] Ring 3 — filesystem ground truth: git tree hash snapshots (incl. untracked) at session start + turn boundaries, diff hashes in ledger
- [ ] Configuration attestation: hash `settings.json` / `hooks.json` / `config.toml` at session start, chained into ledger
- [ ] Explicit `capture.gap` markers whenever the expected capture chain is incomplete
- [ ] Durable local event spool (replaces fire-and-forget emission)
- [ ] Ring 1 — Claude Code hook pack: `PreToolUse` / `PostToolUse` / `PostToolUseFailure` / `SessionStart` / `Stop` → ledger
- [ ] Ring 1 — Codex hooks (bash-only) + documented limitations
- [ ] Deprecate parallel file/shell MCP tools; keep agent-facing API tools

## Milestone 6: Transport Spine — Ring 2 Proxy (Next)
> Goal: Uniform coverage by construction, including runtime-discovered tools and raw model I/O

- [ ] MCP proxy: single interceptor server; rewrite real server entries through it (stdio + Streamable HTTP)
- [ ] Tool discovery passthrough — coverage for tools discovered at runtime
- [ ] Egress HTTPS proxy with local CA for model request/response capture (`HTTP_PROXY`/`HTTPS_PROXY`; Codex `[features.network_proxy]`)
- [ ] Closes Codex file-write/MCP gaps and managed-chat gaps
- [ ] ADR-0006: proxy architecture and trust model

## Milestone 7: Deterministic Replay (The Moat)
> Goal: Faithful re-execution of agent runs — rr-style, not observability-style

- [ ] Capture all nondeterministic inputs: model responses, retrieval results, tool outputs, clock reads, seeds (requires M6)
- [ ] Replay harness: re-execute a run against recorded inputs
- [ ] Divergence detection: report where re-execution departs from the record
- [ ] Evidence packs for the compliance/legal buyer

## Milestone 8: Enforcement — The Switch (Future)
> Goal: Become the control plane, already sitting on the wire

- [ ] Policy gate at Ring 1 (`PreToolUse` deny) and Ring 2 (proxy block)
- [ ] Policies compile to Cedar or Rego — no proprietary DSL
- [ ] Local sidecar evaluation: sub-millisecond, fail-closed, no model in hot path
- [ ] Rule proposals generated from observed traffic (flip-a-switch adoption)
- [ ] Consume identity assertions (APort passport, Entra Agent ID) — never issue

## Milestone 9: Enterprise Features (Future)
> Goal: Multi-tenant, access control, operations at scale

- [ ] Multi-tenant isolation + retention (commercial layer)
- [ ] External anchoring of ledger root hashes (commercial layer)
- [ ] RBAC: viewer, investigator, admin
- [ ] Retention policies and auto-purge
- [ ] SIEM/SOAR integration connectors
- [ ] SSO / SAML authentication
- [ ] Deferred from old M5 (SDK Ecosystem + Ops): Prometheus metrics, deployment docs, LangGraph/LangChain adapter, auto-instrumentation helpers

---

## Principles for roadmap execution

1. Each milestone builds on the previous — no skipping ahead
2. Every milestone has tests before moving on
3. Documentation updated with each milestone
4. ADRs written for significant design decisions
5. Keep the foundation solid — don't rush to features
