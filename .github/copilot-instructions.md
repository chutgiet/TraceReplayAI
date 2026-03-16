# TraceReplay AI — Copilot Instructions

> This file is automatically loaded by GitHub Copilot as workspace-level context.

## Project overview

TraceReplay AI is an audit-grade replay and lineage platform for enterprise AI agents. It captures prompts, context, tool calls, approvals, outputs, errors, and side effects, then reconstructs them into replayable execution graphs.

## Architecture

- **Monorepo**: pnpm workspaces + Turborepo
- **Language**: TypeScript (full stack)
- **Backend**: Fastify on Node.js 20+
- **Frontend**: Next.js + React + Tailwind
- **Database**: PostgreSQL (append-only event store)
- **Queue**: BullMQ + Redis
- **Testing**: Vitest

## Key domain concepts

- **Run**: A single AI agent execution from start to finish
- **Event**: An atomic unit of telemetry within a run (prompt, tool call, side effect, etc.)
- **Canonical event model**: All telemetry normalized to a stable internal schema before storage
- **Replay**: Reconstructing the execution timeline from stored events
- **Lineage**: Causal graph of events, side effects, and dependencies
- **Evidence**: Audit-ready bundle assembled from a run's events

## Repository structure

- `apps/` — Frontend applications (Next.js)
- `packages/` — Shared libraries (event-schema, replay-engine, SDK, etc.)
- `services/` — Backend services (ingest-api, normalizer, query-service, etc.)
- `tests/` — Integration, e2e, fixtures, performance tests
- `docs/` — Documentation
- `.ai/` — Agent development prompts, context, tasks, and ADRs

## Coding conventions

- TypeScript strict mode everywhere
- Zod for runtime schema validation at boundaries
- Structured JSON logging with correlation IDs (runId, eventId)
- Small focused functions, explicit return types on exports
- kebab-case file names, PascalCase types, camelCase functions
- Co-locate tests with source (`*.test.ts`)
- Conventional commits: `feat:`, `fix:`, `docs:`, `test:`, `chore:`

## Important rules

1. **Event schema is foundational** — all packages depend on `packages/event-schema`
2. **Append-only events** — never mutate persisted events
3. **Validate at boundaries** — reject bad data early, handle partial data gracefully
4. **No secrets in code** — use environment variables and secrets managers
5. **Open-core boundary** — SDK/schema packages are public, replay/evidence/policy are internal
6. **Missing data stays missing** — never fabricate telemetry that wasn't observed

## For detailed context

See the `.ai/` directory for comprehensive prompts, architecture docs, event model spec, coding standards, and task tracking.
