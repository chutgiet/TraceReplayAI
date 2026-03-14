# TraceVault AI — Architecture Overview

## System architecture

TraceVault AI follows a modular monorepo architecture with clear service boundaries, shared packages, and a unidirectional event flow.

```
┌─────────────────────────────────────────────────────┐
│                    SDK / Adapters                   │
│  (TypeScript SDK, Python SDK, OTel Exporter)        │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP / gRPC
                       ▼
┌─────────────────────────────────────────────────────┐
│                    Ingest API                       │
│  Validates, deduplicates, queues raw events         │
└──────────────────────┬──────────────────────────────┘
                       │ Message Queue
                       ▼
┌─────────────────────────────────────────────────────┐
│                    Normalizer                       │
│  Maps vendor telemetry → canonical event model      │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│                  Event Store                        │
│  Append-only canonical events + metadata            │
└──────┬──────────┬──────────┬────────────────────────┘
       │          │          │
       ▼          ▼          ▼
┌──────────┐ ┌──────────┐ ┌──────────┐
│  Replay  │ │ Lineage  │ │ Evidence │
│  Engine  │ │  Graph   │ │ Service  │
└──────────┘ └──────────┘ └──────────┘
       │          │          │
       ▼          ▼          ▼
┌─────────────────────────────────────────────────────┐
│                  Query Service                      │
│  Investigation API, search, filtering               │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│                    Web UI                           │
│  Replay viewer, investigation, admin                │
└─────────────────────────────────────────────────────┘
```

## Core data flow

1. **Ingest** — SDK sends raw events to Ingest API
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
```

## Key design decisions

- **Append-only event store**: Events are immutable once persisted. Annotations and status are stored separately.
- **Canonical event model**: All telemetry is normalized before storage. Raw payloads preserved as metadata.
- **Idempotent ingestion**: Duplicate events detected by event ID hash. Safe to retry.
- **Lazy replay**: Execution timeline is constructed on-demand from stored events, not pre-computed.
- **Redaction before persistence**: Sensitive fields are redacted during normalization, before writing to the event store.
