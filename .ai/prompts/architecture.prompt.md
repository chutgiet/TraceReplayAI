# TraceReplay AI — Architecture Prompt

You are working on the architecture of TraceReplay AI.

Focus on:
- service boundaries
- package ownership
- event flow
- schema stability
- extensibility
- open-core separability
- replay and lineage correctness

Before proposing architecture changes:
- identify which domain owns the logic
- check whether a shared package is more appropriate than a service-local implementation
- avoid coupling public SDK layers to enterprise backend logic
- prefer explicit contracts and ADR-worthy decisions

When making architecture suggestions, include:
- affected modules
- tradeoffs
- migration risk
- long-term maintainability implications

---

## High-level service topology

```
SDK / Adapters
    ↓
Ingest API  ──→  Message Queue
    ↓                ↓
Normalizer       Worker (async jobs)
    ↓
Event Store (canonical events)
    ↓
┌─────────────────────────────────┐
│  Replay Engine  │  Lineage Graph │
│  Evidence Svc   │  Policy Svc    │
│  Query Service  │  Connector Svc │
└─────────────────────────────────┘
    ↓
Web UI / Admin UI / API consumers

--- MCP Server (sidecar) ---
AI coding agents (Copilot, Codex, Claude Code)
    ↓ MCP protocol (stdio / SSE)
TraceReplay MCP Server
    ↓ emits telemetry → Ingest API
    ↓ queries runs    → Query Service
```

## Key boundaries

| Boundary | Public / Internal | Notes |
|---|---|---|
| SDK + adapters | Public (open-core) | Lightweight, no business logic |
| Event schema package | Public (open-core) | Canonical types, validation |
| Ingest API | Internal service | Accepts raw telemetry |
| Normalizer | Internal service | Maps vendor telemetry → canonical |
| Replay engine | Internal package | Core IP — replayable graph construction |
| Evidence service | Internal service | Generates audit bundles |
| Policy service | Internal service | Enterprise rule evaluation |
| Query service | Internal service | Investigation + search API |
| MCP server | Internal service | Instruments AI agent tool calls for audit capture |
| Web UI | Internal app | Replay viewer, investigation UI |

## Schema evolution rules

- Event schema changes must be backward-compatible
- New fields default to optional
- Breaking changes require a new schema version + migration path
- All schema changes get an ADR

## Database strategy

- Event store: append-only, immutable writes
- Metadata store: mutable (run status, annotations, tags)
- Graph store: lineage relationships (consider adjacency list or dedicated graph DB)
- Search index: denormalized for investigation queries

## Concurrency and ordering

- Ingestion must be idempotent (dedup by event ID)
- Normalizer handles out-of-order events
- Replay engine reconstructs causal order from timestamps + causal links
- Event store preserves insertion order as a secondary signal
