# TraceVault AI — Testing Prompt

You are responsible for testing TraceVault AI features.

Focus on:
- replay correctness
- schema regressions
- event normalization edge cases
- redaction/privacy handling
- run diff correctness
- side-effect reconstruction

---

## Testing philosophy

- Tests are documentation: they describe what the system guarantees
- Favor fixture-driven tests with realistic event sequences
- Cover edge cases first — happy paths are often trivially correct
- Test at the right level: unit for logic, integration for workflows, e2e for user journeys

---

## Test categories

### Unit tests
- Pure functions: schema validators, normalizers, graph builders
- Domain logic: replay construction, lineage resolution, evidence assembly
- Run with Vitest or Jest
- Co-located with source: `*.test.ts` next to implementation

### Integration tests
- Service boundary behavior: API → service → persistence
- Event flow: ingest → normalize → store → replay
- Use test containers or in-memory stores
- Located in `tests/integration/`

### End-to-end tests
- Full user workflows: ingest events → query replay → view in UI
- Use Playwright for browser tests
- Located in `tests/e2e/`

### Fixture-based tests
- Canonical event sequences stored as JSON fixtures
- Test replay engine against known inputs/outputs
- Regression suite for schema changes
- Located in `tests/fixtures/`

---

## Critical test scenarios

| Scenario | Why it matters |
|---|---|
| Successful run replay | Baseline correctness |
| Partial/missing telemetry | Real-world data is messy |
| Duplicate event handling | Idempotency guarantee |
| Out-of-order event arrival | Causal ordering must work |
| Tool failure paths | Error states must render correctly |
| Missing approval step | Compliance gap detection |
| Side-effect reconstruction | Downstream impact visibility |
| Redacted payload handling | Privacy boundary enforcement |
| Schema v1 → v2 migration | Backward compatibility |
| Large run (1000+ events) | Performance under load |
| Concurrent ingestion | Race condition detection |

---

## Fixture conventions

```
tests/fixtures/
  runs/
    simple-chat-run.json
    multi-tool-run.json
    partial-telemetry-run.json
    out-of-order-run.json
    redacted-run.json
    failed-tool-run.json
  events/
    prompt-event.json
    tool-call-event.json
    approval-event.json
    side-effect-event.json
    error-event.json
  schemas/
    v1-event.json
    v2-event.json
```

Each fixture should include:
- input data
- expected normalized output
- expected replay structure (where applicable)

---

## Test naming convention

```
describe('ReplayEngine')
  it('reconstructs timeline from ordered events')
  it('handles out-of-order events by causal links')
  it('marks missing spans as gaps')
  it('preserves redacted fields without decrypting')
```

Use descriptive names that read as specifications.

---

## Test data rules

- Never use production data in tests
- Use deterministic IDs and timestamps in fixtures
- Randomize where needed to catch ordering bugs
- Keep fixtures minimal but representative
