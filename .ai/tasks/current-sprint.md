# TraceReplay AI — Current Sprint

## Sprint: Foundation-1
**Goal:** Establish core event schema, basic ingestion, and replay engine

---

### Active tasks

| ID | Task | Status | Owner |
|----|------|--------|-------|
| F1-001 | Define canonical event types in `packages/event-schema` | ✅ Done | — |
| F1-002 | Create Zod validators for all event types | ✅ Done | — |
| F1-003 | Set up PostgreSQL schema (events, runs tables) | ✅ Done | — |
| F1-004 | Implement `ingest-api` POST /v1/events endpoint | Not started | — |
| F1-005 | Implement basic `replay-engine` timeline construction | Not started | — |
| F1-006 | Create test fixtures (5 canonical event sequences) | Not started | — |
| F1-007 | Unit tests for event-schema validators | ✅ Done | — |
| F1-008 | Integration test: ingest → persist → replay | Not started | — |

---

### Acceptance criteria

- [x] All canonical event types are defined with TypeScript interfaces
- [x] Zod schemas validate all event types correctly
- [ ] Events can be ingested via REST API and persisted to PostgreSQL
- [ ] Replay engine produces a correct timeline from a set of ordered events
- [ ] Test fixtures cover: simple run, multi-tool run, partial telemetry, error run
- [x] > 80% test coverage on event-schema package (100% on all runtime files, 68 tests passing)

---

### Notes

- ~~Start with `event-schema` — everything else depends on it~~ ✅ Complete
- Use Docker Compose for local PostgreSQL
- Keep the ingest API simple — validation + persistence only
- Replay engine v1 is read-only timeline construction (no streaming)

### Completed work log

| Date | Task | Notes |
|------|------|-------|
| 2026-03-15 | F1-001, F1-002, F1-007 | 21 event types, Zod validators, branded IDs, 68 unit tests, 100% runtime coverage |
| 2026-03-16 | F1-003 | `runs` + `events` tables, `schema_migrations` tracking, pg Pool in `packages/common`, migration runner script, docker-compose init mount |
