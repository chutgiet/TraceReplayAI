# ADR-0001: Monorepo Structure

## Status
**Accepted** — March 2026

## Context
TraceReplay AI requires multiple packages (event schema, replay engine, SDK, UI components) and multiple services (ingest API, normalizer, query service, etc.). We need to decide how to organize the codebase.

Options considered:
1. **Monorepo** — all packages and services in one repository
2. **Polyrepo** — separate repositories per package/service
3. **Hybrid** — core in monorepo, SDKs in separate repos

## Decision
Use a **monorepo** managed with pnpm workspaces and Turborepo.

## Rationale
- **Solo developer**: one repo is dramatically simpler to manage
- **Shared types**: event-schema types flow across all packages and services without publishing
- **Atomic changes**: cross-cutting changes (schema + API + UI) land in a single commit
- **Consistent tooling**: one CI pipeline, one linting config, one test runner
- **Turborepo caching**: fast builds even as the repo grows
- **pnpm workspaces**: efficient disk usage, strict dependency resolution

## Consequences
- Must maintain clear package boundaries to avoid becoming a monolith
- CI must be smart about running only affected tests
- Eventually may need to publish SDK packages separately (pnpm supports this)
- Large git history over time — mitigated by shallow clones in CI

## Structure
```
├── apps/         — deployable frontends
├── packages/     — shared libraries
├── services/     — deployable backends
├── tests/        — cross-cutting tests
├── docs/         — documentation
├── scripts/      — tooling
└── infrastructure/
```
