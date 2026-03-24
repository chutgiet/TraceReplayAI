# TraceReplay AI — Agent Instructions

> This file provides repo-level guidance for AI coding agents (OpenAI Codex, etc.).
> It is the Codex-equivalent of `.github/copilot-instructions.md`.

## Project overview

TraceReplay AI is an audit-grade replay and lineage platform for enterprise AI agents. It captures prompts, context, tool calls, approvals, outputs, errors, and side effects, then reconstructs them into replayable execution graphs.

## Architecture

- **Monorepo**: pnpm workspaces + Turborepo
- **Language**: TypeScript (full stack), strict mode everywhere
- **Backend**: Fastify on Node.js 20+
- **Frontend**: Next.js + React + Tailwind
- **Database**: PostgreSQL (append-only event store)
- **Queue**: BullMQ + Redis
- **Testing**: Vitest

## Local development

```bash
# Start full stack with Docker
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build

# Services:
#   Web UI:         http://localhost:3000
#   Ingest API:     http://localhost:3001
#   Query Service:  http://localhost:3002
#   Normalizer:     http://localhost:3003
#   MCP Server:     http://localhost:3005 (SSE) or via stdio
```

## MCP integration

This repo includes a TraceReplay MCP server at `services/tracereplay-mcp/`. When connected, every tool call you make through it is automatically captured as telemetry for audit replay.

**Prefer using TraceReplay MCP tools** (`tracereplay_*`) when available, so your work is captured in the audit trail.

## Key conventions

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
5. **Missing data stays missing** — never fabricate telemetry that wasn't observed

## Repository structure

- `apps/web/` — Next.js frontend
- `packages/event-schema/` — Canonical event model (Zod schemas + types)
- `packages/connectors-core/` — Vendor adapter framework
- `packages/sdk-typescript/` — TypeScript SDK for event ingestion
- `services/ingest-api/` — Event ingestion API (Fastify)
- `services/normalizer/` — Raw → canonical event normalization
- `services/query-service/` — Read/search/timeline API
- `services/tracereplay-mcp/` — MCP server for live capture
- `tests/` — Integration and e2e tests
- `.ai/` — Agent prompts, architecture docs, ADRs
