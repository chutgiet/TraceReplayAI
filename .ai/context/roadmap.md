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

## Milestone 4: Evidence + Compliance (Current)
> Goal: Generate audit-ready evidence bundles and trace side effects

- [x] `graph-model` package: lineage data structures
- [ ] Side-effect tracking and visualization
- [x] Parent-child run linking (sub-agent delegation)
- [ ] Query service: search by tool, side effect, error type
- [ ] `evidence-service`: assemble run evidence
- [ ] Export formats: JSON, PDF summary
- [ ] Evidence integrity hashing
- [ ] Redaction audit trail

## Milestone 5: SDK Ecosystem + Operations
> Goal: Broader agent framework support and production readiness

- [ ] Auto-instrumentation helpers for common patterns
- [ ] LangGraph/LangChain adapter
- [ ] Health check endpoints on all services
- [ ] Prometheus metrics export
- [ ] Structured logging across all services
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Deployment documentation

## Milestone 6: Enterprise Features (Future)
> Goal: Multi-tenant, policy, access control

- [ ] Multi-tenant isolation
- [ ] RBAC: viewer, investigator, admin
- [ ] Policy engine: rule-based evaluation
- [ ] Retention policies and auto-purge
- [ ] SIEM/SOAR integration connectors
- [ ] SSO / SAML authentication

---

## Principles for roadmap execution

1. Each milestone builds on the previous — no skipping ahead
2. Every milestone has tests before moving on
3. Documentation updated with each milestone
4. ADRs written for significant design decisions
5. Keep the foundation solid — don't rush to features
