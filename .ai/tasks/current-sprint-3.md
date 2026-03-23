# TraceReplay AI — Sprint: Foundation-3

## Goal
Build the Investigation UI and supporting APIs so users can visually browse runs, replay timelines, inspect events, and view lineage graphs. Also shore up operational foundations (Docker, CI, redaction).

## Dependencies
- **Milestone 1 + 2 complete** — event-schema, ingest-api, replay-engine, SDK, query-service, graph-model, normalizer, worker all merged and tested (417 tests passing).

---

## Tasks

| ID | Task | Status | Priority | Est |
|----|------|--------|----------|-----|
| F3-001 | Next.js app scaffold with Tailwind | ✅ | P0 | M |
| F3-002 | Shared UI component library (`packages/ui`) | ✅ | P0 | M |
| F3-003 | Run list page with filters | ✅ | P0 | M |
| F3-004 | Run detail / replay timeline view | ✅ | P0 | L |
| F3-005 | Event detail expandable panel | 🔲 | P1 | M |
| F3-006 | Basic lineage graph visualization | 🔲 | P1 | L |
| F3-007 | Event detail API with redaction awareness | 🔲 | P1 | M |
| F3-008 | Redaction engine: configurable field-level rules | 🔲 | P1 | M |
| F3-009 | Full-text search across event payloads | 🔲 | P2 | M |
| F3-010 | Docker Compose for full local stack | 🔲 | P2 | S |
| F3-011 | Empty/error/loading UI states | 🔲 | P2 | S |
| F3-012 | Sub-agent run linking | 🔲 | P2 | M |

Est: S = small (< half day), M = medium (half–full day), L = large (1–2 days)

---

## Task details

### F3-001 — Next.js app scaffold with Tailwind

**Goal:** Set up the `apps/web` Next.js application as the investigation UI shell.

**Scope:**
- Next.js 14+ with App Router
- Tailwind CSS + `@tracereplay/ui` component library integration
- Layout: sidebar navigation + main content area
- Pages: `/runs` (list), `/runs/[runId]` (detail), `/runs/[runId]/timeline` (replay), `/runs/[runId]/lineage` (graph)
- API proxy to query-service (via Next.js API routes or env-configured backend URL)
- Dark/light theme support via Tailwind
- TypeScript strict mode

**Key files:** `apps/web/`, `apps/web/app/layout.tsx`, `apps/web/app/runs/page.tsx`

**Acceptance criteria:**
- [ ] Next.js app starts and renders layout
- [ ] Tailwind styles working
- [ ] Route structure in place with placeholder pages
- [ ] Can fetch from query-service (mocked or real)

---

### F3-002 — Shared UI component library (`packages/ui`)

**Goal:** Create reusable UI components consumed by `apps/web`.

**Scope:**
- React components with Tailwind: `Badge`, `StatusBadge`, `DataTable`, `Card`, `Skeleton`, `EmptyState`, `ErrorBoundary`, `TimeDisplay`, `JsonViewer`
- Exported as `@tracereplay/ui`
- Storybook optional (not required this sprint)
- Accessible (ARIA labels, keyboard nav on interactive elements)

**Key files:** `packages/ui/src/components/`, `packages/ui/src/index.ts`

**Acceptance criteria:**
- [ ] Components exported from `@tracereplay/ui`
- [ ] Components render correctly with Tailwind
- [ ] DataTable supports sorting and pagination props
- [ ] JsonViewer renders nested JSON with expand/collapse

---

### F3-003 — Run list page with filters

**Goal:** Show a searchable, filterable list of all runs.

**Scope:**
- Calls `GET /v1/runs` from query-service
- Filter by: status, agentId, time range
- Cursor-based pagination (load more / infinite scroll)
- Columns: runId (linked), agentId, status, start time, duration, event count
- Uses `DataTable` from `@tracereplay/ui`

**Key files:** `apps/web/app/runs/page.tsx`, `apps/web/lib/api.ts`

**Acceptance criteria:**
- [ ] Runs displayed in a table with all columns
- [ ] Filters update the query and refresh results
- [ ] Pagination works (cursor-based)
- [ ] Empty state when no runs match

---

### F3-004 — Run detail / replay timeline view

**Goal:** Show a run's events as a visual timeline with duration bars and event details.

**Scope:**
- Calls `GET /v1/runs/:runId/timeline` from query-service
- Vertical timeline layout: each entry is a row with timestamp, event type, duration bar, summary
- Color-coded by event type (prompt=blue, tool_call=green, error=red, etc.)
- Gap markers for detected gaps in telemetry
- Run summary header: status, total duration, event count, agent ID
- Click an event to expand detail (links to F3-005)

**Key files:** `apps/web/app/runs/[runId]/page.tsx`, `apps/web/components/timeline/`

**Acceptance criteria:**
- [ ] Timeline renders entries in chronological order
- [ ] Duration bars are proportional
- [ ] Gaps are visually indicated
- [ ] Run summary displays correctly
- [ ] Event click opens detail panel

---

### F3-005 — Event detail expandable panel

**Goal:** Show full event detail when a user clicks a timeline entry.

**Scope:**
- Slide-out or expandable panel showing full event payload
- JsonViewer for raw event data
- Structured fields: event type, timestamp, parent event, sequence, metadata
- Redacted fields shown as `[REDACTED]` with indicator (links to F3-007/F3-008)
- Copy event ID / JSON button

**Key files:** `apps/web/components/event-detail-panel.tsx`

**Acceptance criteria:**
- [ ] Panel opens with full event data
- [ ] JsonViewer renders nested payloads
- [ ] Redacted fields clearly marked
- [ ] Copy buttons work

---

### F3-006 — Basic lineage graph visualization

**Goal:** Render the lineage graph for a run as an interactive node-edge diagram.

**Scope:**
- Calls `GET /v1/runs/:runId/timeline` then builds lineage graph client-side using `@tracereplay/graph-model`
- Render with a graph library (e.g., `@xyflow/react` / React Flow, or D3-force)
- Node types: prompt, tool_call, side_effect, error, approval, sub-run
- Edge types: caused_by (solid), followed_by (dashed), delegated_to (dotted)
- Click node to show event detail
- Zoom, pan, fit-to-view controls

**Key files:** `apps/web/app/runs/[runId]/lineage/page.tsx`, `apps/web/components/lineage/`

**Acceptance criteria:**
- [ ] Graph renders nodes and edges from lineage model
- [ ] Nodes are color-coded by type
- [ ] Edge types are visually distinct
- [ ] Click opens event detail
- [ ] Zoom/pan controls work

---

### F3-007 — Event detail API with redaction awareness

**Goal:** Expose a single-event API endpoint that applies redaction rules before returning.

**Scope:**
- `GET /v1/events/:eventId` — returns a single event with redaction applied
- Integrates with `packages/redaction` engine (F3-008)
- If no redaction rules configured, returns event as-is
- Response includes `redacted_fields` array listing what was redacted

**Key files:** `services/query-service/src/routes/events.ts`

**Acceptance criteria:**
- [ ] Endpoint returns single event by ID
- [ ] Redaction rules applied to response
- [ ] `redacted_fields` metadata included in response
- [ ] 404 for unknown eventId
- [ ] Unit tests

---

### F3-008 — Redaction engine: configurable field-level rules

**Goal:** Build the redaction engine that strips or masks sensitive fields from events.

**Scope:**
- `RedactionRule` type: field path pattern, redaction action (mask, remove, hash)
- `RedactionEngine` class: applies rules to event payloads
- Built-in rules for common PII patterns (email, API keys, auth tokens)
- Configurable via rule sets (JSON config)
- Returns audit trail: which fields were redacted, by which rule

**Key files:** `packages/redaction/src/types.ts`, `packages/redaction/src/engine.ts`, `packages/redaction/src/rules.ts`

**Acceptance criteria:**
- [ ] RedactionEngine applies rules to event payloads
- [ ] Mask/remove/hash actions all work
- [ ] Built-in PII detection rules
- [ ] Audit trail returned per redaction
- [ ] Unit tests with >80% coverage

---

### F3-009 — Full-text search across event payloads

**Goal:** Enable searching event payloads via the query service.

**Scope:**
- `GET /v1/search?q=...` — full-text search across event payloads
- PostgreSQL `tsvector` / `to_tsvector` on event payload JSONB fields
- Add GIN index on events table for search performance
- DB migration `003_add_search_index.sql`
- Results: list of events with run context, ranked by relevance

**Key files:** `services/query-service/src/routes/search.ts`, `infrastructure/db/migrations/003_add_search_index.sql`

**Acceptance criteria:**
- [ ] Search endpoint returns matching events
- [ ] Results include run context (runId, agentId)
- [ ] GIN index migration applied
- [ ] Handles special characters safely (SQL injection prevented)
- [ ] Unit tests

---

### F3-010 — Docker Compose for full local stack

**Goal:** Single `docker compose up` spins up all services for local development.

**Scope:**
- Services: PostgreSQL, Redis, ingest-api, query-service, normalizer, worker, web (frontend)
- Volume mounts for hot-reload on source changes
- Environment variables configured for inter-service communication
- Health checks on all services
- README with setup instructions

**Key files:** `docker-compose.yml` (update existing), `docs/runbooks/local-dev.md`

**Acceptance criteria:**
- [ ] `docker compose up` starts all services
- [ ] Services can communicate (ingest → normalize → query)
- [ ] Frontend accessible at localhost:3000
- [ ] Hot-reload works for development
- [ ] README documents setup steps

---

### F3-011 — Empty/error/loading UI states

**Goal:** Handle all UI edge cases gracefully.

**Scope:**
- Loading skeletons for run list, timeline, event detail
- Empty state illustrations for no runs, no events, no search results
- Error boundary with retry button
- 404 page for unknown runs/events

**Key files:** `apps/web/components/states/`, `apps/web/app/not-found.tsx`

**Acceptance criteria:**
- [ ] Loading states shown while data fetches
- [ ] Empty states with helpful messaging
- [ ] Error boundary catches and displays errors
- [ ] 404 page for missing resources

---

### F3-012 — Sub-agent run linking

**Goal:** Link parent and child runs for delegated sub-agent execution.

**Scope:**
- `parentRunId` field on runs table (add via migration if needed)
- Query service: include child runs in run detail response
- Timeline view: show sub-run delegation points
- Lineage graph: `delegated_to` edges link across runs

**Key files:** `services/query-service/src/routes/runs.ts`, `packages/graph-model/src/graph-builder.ts`

**Acceptance criteria:**
- [ ] Parent-child run relationship stored and queryable
- [ ] Run detail includes child runs
- [ ] Timeline shows delegation points
- [ ] Lineage graph connects across runs
- [ ] Unit tests

---

## Sequencing & dependencies

```
F3-001 (Next.js scaffold)  ──┐
F3-002 (UI components)     ──┤── parallel, no deps
F3-008 (Redaction engine)  ──┤
F3-010 (Docker Compose)    ──┘

F3-003 (Run list)          ←── depends on F3-001, F3-002
F3-004 (Timeline view)     ←── depends on F3-001, F3-002
F3-007 (Event detail API)  ←── depends on F3-008

F3-005 (Event detail panel) ←── depends on F3-004, F3-007
F3-006 (Lineage graph)     ←── depends on F3-004
F3-009 (Full-text search)  ←── independent (backend only)
F3-011 (UI states)         ←── depends on F3-003, F3-004
F3-012 (Sub-agent linking) ←── independent (backend + graph-model)
```

**Recommended order:**
1. **Parallel batch 1:** F3-001 (scaffold), F3-002 (UI lib), F3-008 (redaction), F3-010 (Docker)
2. **Parallel batch 2:** F3-003 (run list), F3-004 (timeline), F3-007 (event API), F3-009 (search), F3-012 (sub-agent linking)
3. **Parallel batch 3:** F3-005 (event panel), F3-006 (lineage graph), F3-011 (UI states)

## Sprint exit criteria

- [ ] Next.js app renders run list from query-service data
- [ ] Timeline view shows a run's events with duration bars and gaps
- [ ] Event detail panel shows full event payload with redaction
- [ ] Lineage graph renders nodes and edges for a run
- [ ] Redaction engine applies configurable rules
- [ ] Full-text search returns matching events
- [ ] Docker Compose starts full local stack
- [ ] All new code has unit test coverage > 80%
- [ ] Empty/error/loading states handled in all views
