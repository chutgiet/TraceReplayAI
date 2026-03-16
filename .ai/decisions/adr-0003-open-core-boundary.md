# ADR-0003: Open-Core Boundary

## Status
**Accepted** — March 2026

## Context
TraceReplay AI may eventually be partially open-sourced to drive developer adoption (SDKs, schemas, adapters) while keeping core enterprise features proprietary.

We need to establish clear boundaries now so the codebase doesn't accidentally couple public and proprietary code.

## Decision
Define an **open-core boundary** at the package level.

### Public (potential open-source)
- `packages/event-schema` — canonical event types and validators
- `packages/sdk-typescript` — lightweight ingestion SDK
- `packages/sdk-python` — Python ingestion SDK (future)
- `packages/connectors-core` — base connector types and interfaces
- `packages/otel-exporter` — OpenTelemetry exporter (future)
- `examples/` — integration examples
- `docs/api/` — public API documentation

### Internal (proprietary)
- `packages/replay-engine` — core replay and timeline logic
- `packages/graph-model` — lineage graph construction
- `packages/redaction` — privacy and redaction engine
- `services/*` — all backend services
- `apps/*` — all frontend applications
- `packages/ui` — UI component library
- `infrastructure/` — deployment configuration
- `.ai/` — agent development context

## Rationale
- SDKs and schemas should be open to drive adoption
- Replay engine is core IP — the "secret sauce"
- Enterprise features (policy, evidence, redaction) are the monetization layer
- Clear boundaries prevent accidental leakage in either direction

## Implementation rules
1. Public packages must NOT import from internal packages
2. Public packages must NOT contain business logic
3. Public packages must be independently publishable
4. Internal packages may depend on public packages freely
5. SDK documentation lives alongside the SDK code
6. API contracts between SDK and backend are versioned and stable

## Consequences
- Must be disciplined about what goes into public packages
- Public packages need their own README, changelog, and docs
- Public packages should have their own test suite (no test deps on internals)
- Eventually need a separate publishing pipeline for public packages
- Code review should check for boundary violations
