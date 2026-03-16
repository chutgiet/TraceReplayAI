# ADR-0002: Canonical Event Model

## Status
**Accepted** — March 2026

## Context
AI agent frameworks (LangChain, OpenAI Agents SDK, CrewAI, AutoGen, custom) each produce telemetry in different formats. TraceReplay AI needs a stable internal representation for replay, lineage, and evidence generation.

Options considered:
1. **Store raw telemetry as-is** — flexible but impossible to build reliable replay
2. **Canonical event model** — normalize all telemetry into a stable schema
3. **Multiple schema adapters at query time** — defer normalization to read path

## Decision
Define a **canonical event model** and normalize all telemetry during ingestion.

## Rationale
- **Replay engine needs a contract**: can't build reliable timeline reconstruction against unstable schemas
- **Evidence generation requires consistency**: audit bundles must have predictable structure
- **Lineage graph depends on typed relationships**: causal links need known event types
- **Query simplicity**: one schema to index, search, and filter against
- **Future-proofing**: new framework adapters map to the same model

## Event model design

Core principles:
- Every event has `id`, `runId`, `type`, `timestamp`, `tenantId`
- ~20 canonical event types covering the agent execution lifecycle
- Payloads are type-specific and validated with Zod
- Raw vendor telemetry preserved in `rawMeta` for forensic purposes
- Schema version tracked on every event for future migration
- Missing data is explicitly `undefined` — never fabricated

See `.ai/context/event-model.md` for the full specification.

## Consequences
- Normalization adds a processing step between ingestion and storage
- New agent frameworks require writing an adapter/normalizer
- Schema changes need backward-compatible migration strategy
- Raw telemetry still available via `rawMeta` for edge cases
- More upfront design work, but dramatically simpler downstream consumers

## Migration strategy
- Schema follows semver
- New optional fields: minor version bump
- Breaking changes: major version bump + migration script
- All stored events retain their `schemaVersion`
