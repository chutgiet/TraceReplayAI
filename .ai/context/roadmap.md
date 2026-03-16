# TraceReplay AI — Roadmap

## Milestone 1: Foundation (Current)
> Goal: Establish canonical event model, basic ingestion, and replay

- [x] Repository structure and monorepo setup
- [x] Engineering system prompts and agent context
- [ ] `event-schema` package: types, Zod validators, constants
- [ ] `common` package: shared utilities, ID generation, logging
- [ ] `ingest-api` service: REST endpoint, schema validation, persistence
- [ ] Database schema: events table, runs table, migrations
- [ ] `replay-engine` package: basic timeline reconstruction from ordered events
- [ ] Fixture suite: 5+ canonical event sequences for testing
- [ ] Basic test coverage for schema validation and replay

## Milestone 2: Normalization + SDK
> Goal: Accept telemetry from real agent frameworks

- [ ] `normalizer` service: map raw telemetry → canonical events
- [ ] `sdk-typescript` package: lightweight ingestion client
- [ ] Adapter: OpenAI Agents SDK telemetry
- [ ] Adapter: LangGraph/LangChain telemetry
- [ ] Idempotent ingestion (dedup by event ID)
- [ ] Out-of-order event handling
- [ ] Worker service for async normalization

## Milestone 3: Investigation UI
> Goal: Visual replay and basic investigation

- [ ] `apps/web`: Next.js scaffold with Tailwind
- [ ] Run list view with search/filter
- [ ] Run detail / replay timeline view
- [ ] Event detail panel (expand/collapse)
- [ ] Lineage graph visualization (basic)
- [ ] Empty/error/loading states
- [ ] `packages/ui`: shared component library

## Milestone 4: Lineage + Side Effects
> Goal: Trace causal chains and downstream impact

- [ ] `graph-model` package: lineage data structures
- [ ] Side-effect tracking and visualization
- [ ] Parent-child run linking (sub-agent delegation)
- [ ] Query service: search by tool, side effect, error type

## Milestone 5: Evidence + Compliance
> Goal: Generate audit-ready evidence bundles

- [ ] `evidence-service`: assemble run evidence
- [ ] Export formats: JSON, PDF summary
- [ ] Redaction engine: field-level redaction rules
- [ ] Redaction audit trail
- [ ] Evidence integrity hashing

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
