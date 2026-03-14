# TraceVault AI — Coding Standards

## Language and runtime

- **TypeScript** for all backend services, packages, and frontend code
- **Node.js 20+** runtime
- **Strict mode** enabled in all `tsconfig.json` files
- Target **ES2022** or later

---

## TypeScript conventions

### Types
- Prefer `interface` for object shapes, `type` for unions/intersections
- Export types from a dedicated `types.ts` in each package/module
- Use discriminated unions for event types and API responses
- Avoid `any` — use `unknown` and narrow with type guards
- Use branded types for IDs: `type RunId = string & { __brand: 'RunId' }`

### Functions
- Small, focused functions (< 40 lines preferred)
- Pure functions where possible
- Explicit return types on exported functions
- Async functions return `Promise<T>` — never fire-and-forget

### Naming
```
PascalCase    → types, interfaces, classes, components
camelCase     → functions, variables, parameters
UPPER_SNAKE   → constants, env vars
kebab-case    → file names, folder names, package names
```

### Imports
- Absolute imports via package aliases (`@tracevault/event-schema`)
- Group imports: external → internal packages → local
- No barrel re-exports from large packages (causes circular deps)

---

## File organization

```
packages/event-schema/
  src/
    index.ts           — public API exports
    types.ts           — type definitions
    validators.ts      — Zod schemas / runtime validation
    constants.ts       — shared constants
    __tests__/
      validators.test.ts

services/ingest-api/
  src/
    index.ts           — server entry point
    routes/
      ingest.ts        — route handlers
    services/
      ingest-service.ts
    repositories/
      event-repository.ts
    __tests__/
      ingest-service.test.ts
```

---

## Error handling

### At boundaries (API routes, SDK entry points)
- Validate input with Zod schemas
- Return typed error responses
- Log errors with correlation IDs

### In domain logic
- Use typed Result/Error patterns or throw typed domain errors
- Never swallow errors silently
- Include context in error messages

### Error response shape
```typescript
{
  error: {
    code: string;        // machine-readable: "INVALID_EVENT_SCHEMA"
    message: string;     // human-readable
    details?: unknown;   // validation errors, etc.
    requestId: string;
  }
}
```

---

## Validation

- **Zod** for runtime schema validation
- Validate at every boundary: API input, queue message, external response
- Schema definitions co-located with the types they validate
- Validation errors include field paths and expected types

---

## Logging

- **Structured JSON logging** (pino or similar)
- Every log entry includes: `timestamp`, `level`, `message`, `service`
- Request-scoped logs include: `requestId`, `tenantId`
- Event-scoped logs include: `runId`, `eventId`
- **Never log**: secrets, tokens, full prompt content, PII
- Log levels: `debug` (dev only), `info` (operations), `warn` (recoverable), `error` (failures)

---

## Testing conventions

- Test files: `*.test.ts` co-located or in `__tests__/` directory
- Test runner: **Vitest**
- Assertions: Vitest built-in `expect`
- Mocking: Vitest built-in `vi.mock`, `vi.fn`
- Integration tests: separate directory with setup/teardown
- Fixture files: JSON in `tests/fixtures/`
- Minimum coverage targets: 80% line coverage for core packages

---

## Database conventions

- Migrations: versioned SQL files managed by a migration tool
- Queries: parameterized (never string-concatenated)
- Timestamps: UTC, stored as `timestamptz` in PostgreSQL
- IDs: UUID v7 (time-sortable) preferred
- Naming: `snake_case` for tables and columns
- Indexes: on `run_id`, `tenant_id`, `timestamp`, `event_type`

---

## API conventions

- RESTful resource naming: `/v1/runs`, `/v1/runs/:runId/events`
- Response envelope: `{ data, meta, errors }`
- Pagination: cursor-based (not offset-based)
- Versioning: URL prefix `/v1/`, `/v2/`
- Content-Type: `application/json`
- Error codes: HTTP status + machine-readable error code

---

## Git conventions

- Branch naming: `feat/`, `fix/`, `chore/`, `refactor/`
- Commit messages: conventional commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`)
- PR scope: one logical change per PR
- No direct commits to `main`

---

## Dependency management

- **pnpm** for package management
- Shared dependencies hoisted to workspace root
- Internal packages referenced via `workspace:*` protocol
- Pin major versions of critical dependencies
- Regular dependency audits via `pnpm audit`
