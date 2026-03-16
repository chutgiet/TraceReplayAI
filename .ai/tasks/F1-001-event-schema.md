# Task: F1-001 — Define canonical event types in `packages/event-schema`

## Goal
> Implement the complete canonical event model as TypeScript types and Zod validators in the foundational `event-schema` package. This is the first code written in the project — everything else depends on it.

## Context
- The repo is freshly scaffolded; all `src/` dirs contain only `.gitkeep` files
- The canonical event model is fully specified in `.ai/context/event-model.md`
- Per sprint notes: **"Start with event-schema — everything else depends on it"**
- This task naturally encompasses F1-002 (Zod validators) since coding standards mandate co-locating schemas with types
- This package is the **only package with zero internal dependencies** — it's the leaf of the dependency graph

## Affected modules
- `packages/event-schema/src/` — all new files created here

## Implementation plan

### Step 1: Create `types.ts` — TypeScript type definitions
Define all interfaces/types from the event model spec:
- `EventType` — discriminated union of all 20 event types
- `BaseEvent` — base event shape with all required/optional fields
- `RunStartPayload`, `RunEndPayload`, `RunErrorPayload` — run lifecycle
- `PromptInputPayload`, `PromptOutputPayload` — prompt telemetry
- `ContextRetrievedPayload`, `ContextInjectedPayload` — context events
- `ToolCallStartPayload`, `ToolCallEndPayload`, `ToolCallErrorPayload` — tool calls
- `ApprovalRequestedPayload`, `ApprovalGrantedPayload`, `ApprovalDeniedPayload` — approvals
- `SideEffectExecutedPayload`, `SideEffectFailedPayload` — side effects
- `ModelRequestPayload`, `ModelResponsePayload` — model interactions
- `PolicyEvaluatedPayload`, `PolicyViolatedPayload` — policy events
- `AnnotationPayload` — annotations
- `CustomPayload` — escape hatch for unknown types
- `TraceReplayEvent` — discriminated union mapping EventType → typed event
- Branded types for `RunId`, `EventId`, `TenantId`

### Step 2: Create `constants.ts` — shared constants
- `SCHEMA_VERSION = "1.0.0"`
- `EVENT_TYPES` — array of all valid event type strings
- `RUN_STATUSES` — `['success', 'failure', 'timeout', 'cancelled']`
- `PROMPT_ROLES` — `['system', 'user', 'assistant', 'tool']`
- `APPROVAL_TYPES` — `['human', 'system', 'policy']`
- `SIDE_EFFECT_TYPES` — `['api_call', 'db_write', 'email', 'file_write', 'message']`
- `MODEL_PROVIDERS` — `['openai', 'anthropic', 'azure', 'local']`
- `TRIGGER_SOURCES` — `['api', 'schedule', 'user', 'agent']`
- `CONTEXT_SOURCES` — `['vector_db', 'api', 'file', 'web']`

### Step 3: Create `validators.ts` — Zod schemas
- `baseEventSchema` — validates the base event shape
- Per-type payload schemas (one for each EventType)
- `traceReplayEventSchema` — discriminated union validator using `type` field
- Helper: `validateEvent(input: unknown): Result<TraceReplayEvent, ZodError>`
- Helper: `isValidEventType(type: string): type is EventType`
- Re-use constants from `constants.ts` for enum values (single source of truth)

### Step 4: Create `index.ts` — public API surface
- Export all types from `types.ts`
- Export all constants from `constants.ts`
- Export all validators and helpers from `validators.ts`

### Step 5: Create `__tests__/validators.test.ts` — unit tests (covers F1-007)
- Test each event type validates correctly with valid payload
- Test base event rejects missing required fields (`id`, `runId`, `type`, `timestamp`, `tenantId`)
- Test invalid `type` value is rejected
- Test invalid timestamp format is rejected
- Test `traceReplayEventSchema` correctly discriminates event types
- Test optional fields are truly optional
- Test extra fields are preserved (passthrough or strip — decide)
- Test `validateEvent()` helper returns typed Result
- Test branded ID types
- Target: >90% coverage on this package

### Step 6: Verify build
- Run `pnpm build` in `packages/event-schema` to confirm TypeScript compiles
- Run `pnpm test` to confirm all tests pass
- Run `pnpm typecheck` to confirm no type errors

## Key files (to be created)
- `packages/event-schema/src/types.ts` — TypeScript interfaces and type unions
- `packages/event-schema/src/constants.ts` — shared constants and enum values
- `packages/event-schema/src/validators.ts` — Zod schemas and validation helpers
- `packages/event-schema/src/index.ts` — public API exports
- `packages/event-schema/src/__tests__/validators.test.ts` — unit tests

## Design decisions
1. **Branded types for IDs** — per coding standards, use `type RunId = string & { __brand: 'RunId' }` to prevent mixing up ID types at compile time
2. **Discriminated union** — `TraceReplayEvent` is a discriminated union on `type` field, enabling exhaustive type narrowing
3. **Zod `.passthrough()`** — use passthrough on payload schemas to preserve unknown fields from raw telemetry (aligns with "raw payloads preserved as metadata")
4. **Single source of truth** — constants used in both types and validators to avoid drift
5. **Result pattern for validation** — `validateEvent()` returns `{ success: true, data } | { success: false, error }` rather than throwing

## Edge cases / risks
- UUID v7 format validation — validate as UUID but don't enforce v7 specifically (allow v4 too for flexibility)
- Timestamp validation — accept ISO 8601, but don't enforce UTC (normalizer handles conversion)
- `sequence` field has gaps by design — don't validate contiguity
- `custom` event type — payload is `Record<string, unknown>`, validate only base shape
- Empty `tags` array vs. undefined — both should be valid

## Dependencies to install
- `zod` — already in `package.json` as dependency
- `vitest` — already in `package.json` as devDependency
- May need: `pnpm install` to hydrate node_modules

## Acceptance criteria
- [ ] All 20 event types defined as TypeScript interfaces
- [ ] `BaseEvent` interface matches the canonical event model spec exactly
- [ ] `TraceReplayEvent` discriminated union covers all event types
- [ ] Branded ID types for `RunId`, `EventId`, `TenantId`
- [ ] Zod validators for every event type and payload
- [ ] `validateEvent()` helper function works correctly
- [ ] All constants exported and match spec
- [ ] Unit tests cover all event types (valid + invalid scenarios)
- [ ] >90% test coverage
- [ ] `pnpm build` succeeds
- [ ] `pnpm test` passes
- [ ] `pnpm typecheck` passes
- [ ] Public API exports are clean (no internal leakage)

## Notes
- This task is the **critical path** — F1-003 through F1-008 all depend on it
- Scope includes F1-002 (Zod validators) and F1-007 (unit tests) since they're tightly coupled
- Keep payloads as close to the spec in `.ai/context/event-model.md` as possible
- Don't over-engineer — this is v1. Schema versioning support is built in via `schemaVersion` field
