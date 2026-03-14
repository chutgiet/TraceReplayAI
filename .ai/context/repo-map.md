# TraceVault AI — Repository Map

## Top-level structure

```
tracevault-ai/
├── .ai/              — AI agent prompts, context, tasks, decisions
├── .github/          — GitHub config, CI/CD, Copilot instructions
├── apps/             — Deployable frontend applications
├── packages/         — Shared libraries and packages
├── services/         — Deployable backend services
├── docs/             — Human-readable documentation
├── examples/         — Integration examples and demos
├── tests/            — Cross-cutting test suites
├── scripts/          — Build, dev, and utility scripts
├── infrastructure/   — Docker, IaC, deployment configs
```

---

## `.ai/` — Agent development context

| Path | Purpose |
|---|---|
| `prompts/system.prompt.md` | Master engineering system prompt |
| `prompts/architecture.prompt.md` | Architecture-focused agent guidance |
| `prompts/backend.prompt.md` | Backend implementation guidance |
| `prompts/frontend.prompt.md` | Frontend implementation guidance |
| `prompts/testing.prompt.md` | Testing strategy and patterns |
| `prompts/security.prompt.md` | Security review and implementation |
| `context/product-overview.md` | Product mission, scope, non-goals |
| `context/architecture-overview.md` | System architecture and data flow |
| `context/event-model.md` | Canonical event schema specification |
| `context/coding-standards.md` | TypeScript conventions and patterns |
| `context/repo-map.md` | This file — repository structure guide |
| `context/roadmap.md` | Feature roadmap and milestones |
| `tasks/` | Sprint planning and task tracking |
| `decisions/` | Architecture Decision Records |

---

## `apps/` — Frontend applications

| Path | Purpose | Public/Internal |
|---|---|---|
| `apps/web/` | Main investigation and replay UI | Internal |

Future:
- `apps/admin/` — Tenant administration UI
- `apps/demo/` — Interactive product demo

---

## `packages/` — Shared libraries

| Path | Purpose | Public/Internal | Dependencies |
|---|---|---|---|
| `packages/event-schema/` | Canonical event types + Zod validators | Public (open-core) | None |
| `packages/common/` | Shared utilities, types, constants | Internal | event-schema |
| `packages/replay-engine/` | Timeline and causal replay construction | Internal (core IP) | event-schema, common |
| `packages/sdk-typescript/` | TypeScript SDK for event ingestion | Public (open-core) | event-schema |
| `packages/graph-model/` | Lineage graph data structures | Internal | event-schema, common |
| `packages/redaction/` | Field-level redaction engine | Internal | event-schema |
| `packages/connectors-core/` | Base types and utilities for connectors | Public (open-core) | event-schema |
| `packages/ui/` | Shared React components | Internal | None |

### Dependency rules
- `event-schema` has ZERO internal dependencies (foundational)
- `common` depends only on `event-schema`
- All other packages depend on `common` and/or `event-schema`
- No circular dependencies between packages
- SDK packages must not import from internal core packages

---

## `services/` — Backend services

| Path | Purpose | Depends on |
|---|---|---|
| `services/ingest-api/` | HTTP API for event ingestion | event-schema, common, redaction |
| `services/normalizer/` | Maps vendor telemetry → canonical events | event-schema, common, connectors-core |
| `services/replay-service/` | Serves replay timeline and execution graphs | event-schema, replay-engine, common |
| `services/query-service/` | Investigation search and filtering API | event-schema, common |
| `services/evidence-service/` | Generates audit evidence bundles | event-schema, replay-engine, common |
| `services/worker/` | Async job processing (normalization, indexing) | event-schema, common |

Future:
- `services/policy-service/` — Enterprise policy evaluation
- `services/connector-service/` — External system integrations

---

## `docs/` — Documentation

| Path | Purpose |
|---|---|
| `docs/architecture/` | Architecture diagrams and deep dives |
| `docs/api/` | API reference documentation |
| `docs/connectors/` | Connector development guides |
| `docs/product/` | Product specs and requirements |
| `docs/runbooks/` | Operational runbooks |

---

## `tests/` — Cross-cutting tests

| Path | Purpose |
|---|---|
| `tests/integration/` | Service integration tests |
| `tests/e2e/` | End-to-end browser/API tests |
| `tests/fixtures/` | Shared test data and event fixtures |
| `tests/performance/` | Load and performance tests |

---

## `examples/` — Integration examples

| Path | Purpose |
|---|---|
| `examples/langgraph-basic/` | LangGraph integration example |
| `examples/openai-agents-basic/` | OpenAI Agents SDK example |
| `examples/custom-tool-runner/` | Custom agent with tool calls |
| `examples/slack-approval-demo/` | Human-in-the-loop approval flow |

---

## Key files

| File | Purpose |
|---|---|
| `package.json` | Root workspace configuration |
| `pnpm-workspace.yaml` | Workspace package definitions |
| `turbo.json` | Turborepo build pipeline config |
| `tsconfig.base.json` | Shared TypeScript configuration |
| `.env.example` | Environment variable template |
| `docker-compose.yml` | Local development services |
| `README.md` | Project overview and quickstart |
