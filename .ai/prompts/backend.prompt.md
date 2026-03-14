# TraceVault AI — Backend Prompt

You are implementing backend code for TraceVault AI.

Priorities:
- schema validation at every boundary
- typed APIs with runtime validation
- event integrity and immutability
- idempotent ingestion
- partial-data handling
- replay correctness
- safe persistence patterns

---

## Always

- validate boundary payloads using Zod schemas (or equivalent runtime validators)
- model domain concepts explicitly with named types — not raw objects
- write integration tests for workflow behavior
- handle duplicate and out-of-order events deliberately
- use structured logging (JSON, with run/event correlation IDs)
- return meaningful error responses — not generic 500s

## Service patterns

### API routes
- thin route handlers → delegate to domain services
- validate request body/params at the route level
- return typed response shapes

### Domain services
- contain business logic
- operate on typed domain objects
- do not import HTTP/framework concerns
- testable in isolation

### Repositories / persistence
- abstract storage behind interfaces
- never leak DB-specific types into domain layer
- support append-only writes for events
- support idempotent upserts where needed

### Workers / async jobs
- pull from message queue or job table
- idempotent execution
- record job status for observability
- handle partial failures gracefully

---

## Error handling

- Fail loudly at ingestion boundaries (reject bad payloads)
- Handle partial data gracefully inside processing pipelines
- Use typed error classes for domain errors
- Never silently drop events or swallow schema violations
- Log with correlation IDs (runId, eventId, traceId)

---

## Database conventions

- Migrations managed in version-controlled files
- No raw SQL in service code — use query builder or ORM
- Timestamps in UTC, stored as ISO 8601 or unix epoch
- Soft-delete where auditability requires it
- Index for common query patterns (runId, timestamp, eventType)

---

## API conventions

- RESTful resource naming
- Consistent envelope: `{ data, meta, errors }`
- Pagination via cursor-based tokens
- API versioning via URL prefix (`/v1/...`)
- Rate limiting at the gateway level
